// src/components/cards/RandomBattle.tsx
// 미니 포켓 랜덤 대전 — 다른 플레이어의 덱 스냅샷(Firestore cardDecks)과 비동기 오토배틀.
// 실시간 통신 없음: 매칭 시 상대 덱 문서 1개만 읽고(최대 6 read) 전투는 로컬 시뮬레이션.
// [FREE-TIER] 내 덱 발행은 세션 내 변경 시에만 1 write. 결과는 로컬 전적(localStorage)만 기록.

import { useMemo, useRef, useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { media } from '../../utils/responsive.utils';
import { ArrowLeft, Swords, FastForward, ChevronsRight, RefreshCw } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService } from '../../services/CardService';
import { databaseService, CardDeckDoc } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { useCardState } from '../../hooks/useCardState';
import {
  cardBattleService, buildBattleCard, BattleCard, BattleResult, BattleLogEntry,
} from '../../services/CardBattleService';
import { BattleLogPanel } from './BattleLogPanel';

type Phase = 'idle' | 'matching' | 'battle' | 'result';

// 매칭별 결정론 시드(FNV-1a) — 같은 상대 스냅샷과는 항상 같은 결과(재도전 리롤 방지).
const hashSeed = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const RandomBattle = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
  const state = useCardState();
  const deck = useMemo(() => cardService.getDeck(), [state.deck]);
  const record = cardService.getPvpRecord();

  const user = authService.getCurrentUser();
  const online = !!user && !authService.isOfflineMode();

  const [phase, setPhase] = useState<Phase>('idle');
  const [opponent, setOpponent] = useState<CardDeckDoc | null>(null);
  const [units, setUnits] = useState<Record<string, BattleCard>>({});
  const [playerOrder, setPlayerOrder] = useState<BattleCard[]>([]);
  const [enemyOrder, setEnemyOrder] = useState<BattleCard[]>([]);
  const [log, setLog] = useState<BattleLogEntry[]>([]);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [rewardCoins, setRewardCoins] = useState(0);
  const [hpMap, setHpMap] = useState<Record<string, number>>({});
  const [hit, setHit] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const startMatch = async () => {
    if (!online) return;
    if (deck.length === 0) { alert(t('cards.alerts.deckEmpty')); return; }
    setPhase('matching');
    try {
      // 1) 내 덱 발행(변경 시에만 실제 write) + 상대 찾기
      const myDeck = cardService.getDeckWithStars();
      databaseService.publishCardDeck(myDeck).catch(() => {});
      const opp = await databaseService.getRandomOpponentDeck();
      if (!opp) {
        alert(t('cards.pvp.noOpponent'));
        setPhase('idle');
        return;
      }

      // 2) 내 팀 빌드
      const player: BattleCard[] = [];
      for (const s of myDeck) {
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        player.push(buildBattleCard(p, {
          stars: s.stars, row: s.row, slot: s.slot, side: 'player', uid: `player-${s.pokemonId}`,
        }));
      }
      if (player.length === 0) { alert(t('cards.alerts.deckLoadFail')); setPhase('idle'); return; }

      // 3) 상대 팀 빌드 — 스냅샷 값은 buildBattleCard가 별 1~5로 clamp(위조 방어)
      const enemy: BattleCard[] = [];
      for (let i = 0; i < Math.min(6, opp.deck.length); i++) {
        const s = opp.deck[i];
        if (!s || typeof s.pokemonId !== 'number') continue;
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        enemy.push(buildBattleCard(p, {
          stars: s.stars,
          row: s.row === 'back' ? 'back' : 'front',
          slot: typeof s.slot === 'number' ? s.slot : i % 3,
          side: 'enemy',
          uid: `enemy-${i}`,
        }));
      }
      if (enemy.length === 0) { alert(t('cards.pvp.opponentLoadFail')); setPhase('idle'); return; }

      // 4) 시뮬레이션 — 시드는 매칭 쌍+스냅샷 시각으로 고정(같은 상대 재도전 리롤 방지)
      const seed = hashSeed(`${user!.uid}|${opp.userId}|${opp.updatedAt}`);
      const pSim = player.map(c => ({ ...c }));
      const eSim = enemy.map(c => ({ ...c }));
      const res = cardBattleService.simulate(pSim, eSim, seed);

      // 5) 보상·전적은 결과 확정 즉시 반영(재생 중 이탈해도 손실 없음)
      //    [경제] 소액 고정 — 미니 포켓은 파밍 콘텐츠가 아님(타워와 동일 기조).
      const coins = res.winner === 'player' ? 5 : 1;
      cardService.grantRewards({ coins });
      const weeklyWins = cardService.recordPvpResult(res.winner === 'player');
      // 주간 승수 랭킹 기록(승리 시에만 값 반환). 오프라인/비로그인은 내부에서 무시.
      if (weeklyWins !== null) {
        databaseService.updateCardPvpSeasonRanking(weeklyWins).catch(() => {});
      }

      // 6) 재생 준비 — 시너지 적용본을 풀피로 리셋
      const all: Record<string, BattleCard> = {};
      const reset = (arr: BattleCard[]) => arr.map(c => { const u = { ...c, currentHp: c.maxHp }; all[u.uid] = u; return u; });
      const pOrder = reset(pSim);
      const eOrder = reset(eSim);
      const hp0: Record<string, number> = {};
      Object.values(all).forEach(u => { hp0[u.uid] = u.maxHp; });

      setOpponent(opp);
      setUnits(all);
      setPlayerOrder(pOrder);
      setEnemyOrder(eOrder);
      setHpMap(hp0);
      setLog(res.log);
      setResult(res);
      setRewardCoins(coins);
      setStep(0);
      setPhase('battle');
    } catch (e) {
      console.warn('[RandomBattle] 매칭/전투 준비 실패', e);
      alert(t('cards.alerts.battlePrepError'));
      setPhase('idle');
    }
  };

  // 로그 재생 (TrainerTower와 동일 패턴)
  useEffect(() => {
    if (phase !== 'battle') return;
    if (step >= log.length) { finish(); return; }
    timer.current = window.setTimeout(() => {
      const e = log[step];
      setHpMap(m => ({ ...m, [e.targetUid]: e.remainingHp }));
      // 피격 흔들림은 데미지 이벤트(attack/dot)에만 — 회복/행동불가는 제외
      if (!e.kind || e.kind === 'attack' || e.kind === 'dot') {
        setHit(e.targetUid);
        window.setTimeout(() => setHit(null), 180 / speed);
      }
      setStep(s => s + 1);
    }, 620 / speed);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase, step, log, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipToEnd = () => {
    if (!result) return;
    const finalHp: Record<string, number> = {};
    Object.values(units).forEach(u => { finalHp[u.uid] = u.maxHp; });
    log.forEach(e => { finalHp[e.targetUid] = e.remainingHp; });
    setHpMap(finalHp);
    setStep(log.length);
    finish();
  };

  const finish = () => {
    if (!result || phase === 'result') return;
    setPhase('result');
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setOpponent(null); setLog([]); setStep(0); setRewardCoins(0);
  };

  // ─── 렌더 ───────────────────────────────────────────────────────
  const renderUnit = (u: BattleCard) => {
    const hp = hpMap[u.uid] ?? u.maxHp;
    const pct = Math.max(0, (hp / u.maxHp) * 100);
    const dead = hp <= 0;
    return (
      <Unit key={u.uid} $dead={dead} $hit={hit === u.uid} $side={u.side}>
        <Sprite src={u.sprite} alt={u.name} draggable={false} $side={u.side} />
        <HpBar><HpFill $pct={pct} $low={pct < 30} /></HpBar>
        <UStars>{'★'.repeat(u.stars)}</UStars>
      </Unit>
    );
  };

  const renderTeam = (order: BattleCard[], side: 'player' | 'enemy') => {
    const front = order.filter(u => u.row === 'front');
    const back = order.filter(u => u.row === 'back');
    const rows = side === 'enemy' ? [back, front] : [front, back];
    return (
      <Team $side={side}>
        {rows.map((r, i) => (
          <ArenaRow key={i}>{r.map(renderUnit)}</ArenaRow>
        ))}
      </Team>
    );
  };

  const oppName = opponent?.userName || t('cards.pvp.unknownPlayer');

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onBack}><ArrowLeft size={16} /> {t('cards.common.back')}</BackBtn>
        <Title>{t('cards.pvp.title')}</Title>
        <RecordChip>{t('cards.pvp.record', { w: record.wins, l: record.losses })}</RecordChip>
      </TopBar>

      {phase === 'idle' && (
        <Center>
          <BigIcon><Swords size={44} /></BigIcon>
          <Desc>
            {deck.length === 0
              ? t('cards.tower.noDeck')
              : t('cards.pvp.desc', { n: deck.length })}
          </Desc>
          {!online && <OfflineHint>{t('cards.pvp.loginNeeded')}</OfflineHint>}
          <StartBtn $on={online && deck.length > 0} onClick={startMatch} disabled={!online || deck.length === 0}>
            <Swords size={18} /> {t('cards.pvp.find')}
          </StartBtn>
          <Hint>{t('cards.pvp.hint')}</Hint>
        </Center>
      )}

      {phase === 'matching' && <Center><Desc>{t('cards.pvp.searching')}</Desc></Center>}

      {(phase === 'battle' || phase === 'result') && (
        <BattleWrap>
          <Arena>
            <SideLabel $side="enemy">{t('cards.pvp.opponentDeck', { name: oppName })}</SideLabel>
            {renderTeam(enemyOrder, 'enemy')}
            <Divider />
            {renderTeam(playerOrder, 'player')}
            <SideLabel $side="player">{t('cards.tower.myDeck')}</SideLabel>

            {phase === 'battle' && (
              <Controls>
                <CtrlBtn onClick={() => setSpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}>
                  <FastForward size={15} /> {speed}x
                </CtrlBtn>
                <CtrlBtn onClick={skipToEnd}><ChevronsRight size={15} /> {t('cards.tower.skip')}</CtrlBtn>
              </Controls>
            )}
          </Arena>
          <BattleLogPanel log={log} units={units} count={step} />
        </BattleWrap>
      )}

      {phase === 'result' && result && (
        <ResultVeil>
          <ResultCard $win={result.winner === 'player'}>
            <ResultTitle $win={result.winner === 'player'}>
              {result.winner === 'player' ? t('cards.tower.victory') : t('cards.tower.defeat')}
            </ResultTitle>
            <ResultSub>
              {t('cards.pvp.vsResult', { name: oppName, p: result.playerAlive, e: result.enemyAlive })}
            </ResultSub>
            {rewardCoins > 0 && (
              <RewardRow>
                <Rw $c="#fbbf24">{t('cards.tower.coins', { n: rewardCoins })}</Rw>
              </RewardRow>
            )}
            <ResultBtns>
              <PrimaryBtn onClick={() => { reset(); startMatch(); }}>
                <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t('cards.pvp.rematch')}
              </PrimaryBtn>
              <GhostBtn onClick={onBack}>{t('cards.tower.exit')}</GhostBtn>
            </ResultBtns>
          </ResultCard>
        </ResultVeil>
      )}
    </Root>
  );
};

// ─── animations ──────────────────────────────────────────────────────────────
const shake = keyframes`0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}`;
const popIn = keyframes`from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}`;

// ─── styled (TrainerTower와 동일 톤) ─────────────────────────────────────────
const Root = styled.div`min-height: 100vh; background: radial-gradient(circle at top, #101a2e, #070910); color: #e8edf5; display: flex; flex-direction: column;`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.07); position: sticky; top: 0;
  background: rgba(10,12,22,0.85); backdrop-filter: blur(10px); z-index: 20;
  ${media.tablet} { padding: 12px 16px; gap: 8px; }
  ${media.mobile} { padding: 10px 12px; gap: 6px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 5px; background: transparent;
  border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
  padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; white-space: nowrap;
  &:hover { background: rgba(255,255,255,0.07); }
  ${media.mobile} { padding: 6px 9px; font-size: 12px; }
`;
const Title = styled.h1`
  font-size: 17px; font-weight: 800; margin: 0;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${media.mobile} { font-size: 14px; }
`;
const RecordChip = styled.div`
  flex: 0 0 auto;
  font-size: 13px; font-weight: 700; color: #7dd3fc; background: rgba(125,211,252,0.12); padding: 6px 12px; border-radius: 100px; white-space: nowrap;
  ${media.mobile} { font-size: 12px; padding: 5px 10px; }
`;

const Center = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px;
  ${media.mobile} { gap: 12px; padding: 28px 16px; }
`;
const BigIcon = styled.div`color: #7dd3fc; filter: drop-shadow(0 0 20px rgba(125,211,252,0.5));`;
const Desc = styled.div`font-size: 15px; color: rgba(255,255,255,0.6); text-align: center; ${media.mobile} { font-size: 13px; }`;
const OfflineHint = styled.div`
  font-size: 13px; color: #fbbf24; background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.25); padding: 8px 14px; border-radius: 8px;
`;
const StartBtn = styled.button<{ $on: boolean }>`
  display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 14px 36px; border-radius: 12px; border: none;
  background: ${p => (p.$on ? 'linear-gradient(135deg,#7dd3fc,#3b82f6)' : 'rgba(255,255,255,0.08)')};
  color: ${p => (p.$on ? '#fff' : 'rgba(255,255,255,0.4)')}; font-size: 16px; font-weight: 800;
  cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')}; box-shadow: ${p => (p.$on ? '0 8px 24px rgba(59,130,246,0.4)' : 'none')};
  ${media.mobile} { padding: 12px 28px; font-size: 15px; }
`;
const Hint = styled.div`font-size: 12px; color: rgba(255,255,255,0.35); text-align: center; max-width: 340px; line-height: 1.6;`;

const BattleWrap = styled.div`
  flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 16px;
  display: flex; gap: 14px; align-items: stretch;
  ${media.tablet} { flex-direction: column; padding: 0 10px 14px; }
`;
const Arena = styled.div`
  flex: 1; min-width: 0; padding: 20px 0;
  display: flex; flex-direction: column; gap: 10px; position: relative;
  ${media.mobile} { padding: 14px 0 4px; }
`;
const SideLabel = styled.div<{ $side: 'player' | 'enemy' }>`
  font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
  color: ${p => (p.$side === 'enemy' ? '#fca5a5' : '#86efac')};
  text-align: ${p => (p.$side === 'enemy' ? 'left' : 'right')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const Team = styled.div<{ $side: 'player' | 'enemy' }>`display: flex; flex-direction: column; gap: 12px;`;
const ArenaRow = styled.div`display: flex; justify-content: center; gap: 18px; min-height: 78px;`;
const Unit = styled.div<{ $dead: boolean; $hit: boolean; $side: 'player' | 'enemy' }>`
  display: flex; flex-direction: column; align-items: center; gap: 4px; width: 72px;
  opacity: ${p => (p.$dead ? 0.2 : 1)};
  filter: ${p => (p.$dead ? 'grayscale(1)' : 'none')};
  transition: opacity 0.3s, filter 0.3s;
  ${p => p.$hit && css`animation: ${shake} 0.18s linear;`}
`;
const Sprite = styled.img<{ $side: 'player' | 'enemy' }>`
  width: 56px; height: 56px; object-fit: contain;
  image-rendering: auto;
  transform: scaleX(${p => (p.$side === 'enemy' ? -1 : 1)});
  filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5));
`;
const HpBar = styled.div`width: 60px; height: 6px; border-radius: 3px; background: rgba(0,0,0,0.5); overflow: hidden;`;
const HpFill = styled.div<{ $pct: number; $low: boolean }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => (p.$low ? '#ef4444' : '#34d399')}; transition: width 0.25s ease;
`;
const UStars = styled.div`font-size: 8px; color: #ffd54a; line-height: 1; height: 9px;`;
const Divider = styled.div`height: 1px; background: rgba(255,255,255,0.08); margin: 6px 0;`;

const Controls = styled.div`display: flex; gap: 10px; justify-content: center; margin-top: 14px;`;
const CtrlBtn = styled.button`
  display: flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.75);
  padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
  &:hover { background: rgba(255,255,255,0.12); }
`;

const ResultVeil = styled.div`position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(5,6,12,0.7);`;
const ResultCard = styled.div<{ $win: boolean }>`
  background: linear-gradient(160deg, ${p => (p.$win ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.12)')}, rgba(12,14,24,0.98));
  border: 1px solid ${p => (p.$win ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.35)')};
  border-radius: 18px; padding: 30px 36px; text-align: center; min-width: 300px;
  animation: ${popIn} 0.3s ease-out both;
`;
const ResultTitle = styled.div<{ $win: boolean }>`font-size: 34px; font-weight: 900; color: ${p => (p.$win ? '#34d399' : '#f87171')};`;
const ResultSub = styled.div`font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 6px;`;
const RewardRow = styled.div`display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 16px;`;
const Rw = styled.span<{ $c: string }>`font-size: 15px; font-weight: 800; color: ${p => p.$c};`;
const ResultBtns = styled.div`display: flex; gap: 10px; justify-content: center; margin-top: 22px;`;
const PrimaryBtn = styled.button`padding: 11px 26px; border-radius: 10px; border: none; background: #7dd3fc; color: #07090f; font-weight: 800; font-size: 15px; cursor: pointer; &:hover{transform:translateY(-2px);} transition: transform 0.15s;`;
const GhostBtn = styled.button`padding: 11px 22px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: rgba(255,255,255,0.6); font-weight: 600; font-size: 15px; cursor: pointer; &:hover{background:rgba(255,255,255,0.06);}`;
