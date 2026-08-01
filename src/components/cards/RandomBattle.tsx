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
import { cardService, CardService } from '../../services/CardService';
import { databaseService, CardDeckDoc } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { useCardState } from '../../hooks/useCardState';
import {
  cardBattleService, buildBattleCard, BattleCard, BattleResult, BattleLogEntry,
} from '../../services/CardBattleService';
import { BattleLogPanel, nextStatusMap, UnitStatusMap, UnitStatusBadge } from './BattleLogPanel';

type Phase = 'idle' | 'matching' | 'battle' | 'result';

// 최근 대전 상대 uid 기록(반복 매칭 방지). localStorage에 최대 3명.
const RECENT_OPPS_KEY = 'ptd-recent-opps';
const loadRecentOpps = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_OPPS_KEY) ?? '[]'); } catch { return []; }
};
const pushRecentOpp = (uid: string): void => {
  try {
    const list = [uid, ...loadRecentOpps().filter(id => id !== uid)].slice(0, 3);
    localStorage.setItem(RECENT_OPPS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
};

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
  const [dailyReward, setDailyReward] = useState<{ coins: number; starShards: number } | null>(null);
  const [hpMap, setHpMap] = useState<Record<string, number>>({});
  const [hit, setHit] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<UnitStatusMap>({});
  // [FIX] 매칭 실패 안내는 alert()가 아니라 화면 내 배너로. alert은 이 화면의 다른 UI와
  //   톤이 다를 뿐 아니라, 다이얼로그를 억제하는 환경(인앱 브라우저 등)에선 아무것도 뜨지 않아
  //   "상대 찾기 버튼이 먹통"으로 보인다. 상대 풀이 빈 초기에는 거의 모든 유저가 밟는 경로다.
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const fail = (msg: string) => { setNotice(msg); setPhase('idle'); };

  const startMatch = async () => {
    if (!online) return;
    setNotice(null);
    if (deck.length === 0) { fail(t('cards.alerts.deckEmpty')); return; }
    // [FIX] 일일 판수 상한 — 무제한이면 "다시 매칭" 연타로 주간 승수 랭킹을 도배할 수 있고
    //   매 판 Firestore 쿼리 2회가 나가 무료 쿼터도 샌다. 차감은 매칭 시작 전에.
    if (!cardService.consumePvpMatch()) {
      fail(t('cards.pvp.dailyLimitReached', { n: CardService.PVP_DAILY_LIMIT }));
      return;
    }
    setPhase('matching');
    try {
      // 1) 내 덱 발행(변경 시에만 실제 write) + 상대 찾기
      //    전투력(별 합) 근접 우선 + 최근 상대 3명 제외(풀이 작으면 허용)
      const myDeck = cardService.getDeckWithStars();
      databaseService.publishCardDeck(myDeck).catch(() => {});
      const myPower = myDeck.reduce((s, d) => s + d.stars, 0);
      const opp = await databaseService.getRandomOpponentDeck(myPower, loadRecentOpps());
      if (!opp) {
        cardService.refundPvpMatch(); // 상대가 없는 건 플레이어 탓이 아니다
        fail(t('cards.pvp.noOpponent'));
        return;
      }
      pushRecentOpp(opp.userId);

      // 2) 내 팀 빌드
      const player: BattleCard[] = [];
      for (const s of myDeck) {
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        player.push(buildBattleCard(p, {
          stars: s.stars, row: s.row, slot: s.slot, side: 'player', uid: `player-${s.pokemonId}`,
        }));
      }
      if (player.length === 0) { cardService.refundPvpMatch(); fail(t('cards.alerts.deckLoadFail')); return; }

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
      if (enemy.length === 0) {
        cardService.refundPvpMatch();
        fail(t('cards.pvp.opponentLoadFail')); return;
      }

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
      // 일일 첫 승 보너스(타워/랜덤대전 공통)
      const daily = res.winner === 'player' ? cardService.claimDailyFirstWin() : null;

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
      setStatusMap({});
      setLog(res.log);
      setResult(res);
      setRewardCoins(coins);
      setDailyReward(daily);
      setStep(0);
      setPhase('battle');
    } catch (e) {
      cardService.refundPvpMatch(); // 전투가 성립하지 않았으므로 판수 반환
      console.warn('[RandomBattle] 매칭/전투 준비 실패', e);
      fail(t('cards.alerts.battlePrepError'));
    }
  };

  // 로그 재생 (TrainerTower와 동일 패턴)
  useEffect(() => {
    if (phase !== 'battle') return;
    if (step >= log.length) { finish(); return; }
    timer.current = window.setTimeout(() => {
      const e = log[step];
      setHpMap(m => ({ ...m, [e.targetUid]: e.remainingHp }));
      setStatusMap(m => nextStatusMap(m, e));
      // 피격 흔들림은 데미지 이벤트(attack/dot)에만 — 회복/행동불가는 제외
      if (!e.kind || e.kind === 'attack' || e.kind === 'dot') {
        setHit(e.targetUid);
        window.setTimeout(() => setHit(null), 180 / speed);
      }
      setStep(s => s + 1);
      // 전투 길이 증가에 맞춘 재생 단축(TrainerTower와 동일)
    }, 380 / speed);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase, step, log, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipToEnd = () => {
    if (!result) return;
    const finalHp: Record<string, number> = {};
    Object.values(units).forEach(u => { finalHp[u.uid] = u.maxHp; });
    log.forEach(e => { finalHp[e.targetUid] = e.remainingHp; });
    setHpMap(finalHp);
    setStatusMap({}); // 전투 종료 — 상태 표시 정리
    setStep(log.length);
    finish();
  };

  const finish = () => {
    if (!result || phase === 'result') return;
    setPhase('result');
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setOpponent(null); setLog([]); setStep(0);
    setRewardCoins(0); setDailyReward(null); setStatusMap({});
  };

  // ─── 렌더 ───────────────────────────────────────────────────────
  const renderUnit = (u: BattleCard) => {
    const hp = hpMap[u.uid] ?? u.maxHp;
    const pct = Math.max(0, (hp / u.maxHp) * 100);
    const dead = hp <= 0;
    const status = statusMap[u.uid];
    return (
      <Unit key={u.uid} $dead={dead} $hit={hit === u.uid} $side={u.side}>
        {status && !dead && <UnitStatusBadge kind={status.kind} />}
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
  // state.daily가 바뀔 때마다 재계산(판수 차감이 즉시 반영)
  const matchesLeft = useMemo(() => cardService.getPvpMatchesLeft(), [state.daily]);
  const canMatch = online && deck.length > 0 && matchesLeft > 0;

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
          {notice && <NoticeBar role="status">{notice}</NoticeBar>}
          {!online && <OfflineHint>{t('cards.pvp.loginNeeded')}</OfflineHint>}
          {online && matchesLeft === 0 && (
            <OfflineHint>{t('cards.pvp.dailyLimitReached', { n: CardService.PVP_DAILY_LIMIT })}</OfflineHint>
          )}
          <StartBtn $on={canMatch} onClick={startMatch} disabled={!canMatch}>
            <Swords size={18} /> {t('cards.pvp.find')}
          </StartBtn>
          {online && <Hint>{t('cards.pvp.dailyLeft', { n: matchesLeft, total: CardService.PVP_DAILY_LIMIT })}</Hint>}
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
            {dailyReward && (
              <RewardRow>
                <DailyBadge>{t('cards.daily.firstWin')}</DailyBadge>
                <Rw $c="#fbbf24">{t('cards.tower.coins', { n: dailyReward.coins })}</Rw>
                {dailyReward.starShards > 0 && <Rw $c="#c084fc">{t('cards.tower.shards', { n: dailyReward.starShards })}</Rw>}
              </RewardRow>
            )}
            <ResultBtns>
              {matchesLeft > 0 && (
                <PrimaryBtn onClick={() => { reset(); startMatch(); }}>
                  <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {t('cards.pvp.rematch')}
                </PrimaryBtn>
              )}
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
// 매칭 실패 안내 배너(구 alert). 상대 없음/일일 상한/로딩 실패 공용.
const NoticeBar = styled.div`
  font-size: 13px; color: #fca5a5; background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.3); padding: 10px 16px; border-radius: 10px;
  max-width: 380px; text-align: center; line-height: 1.55;
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
  position: relative;
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
const DailyBadge = styled.span`background: #7dd3fc; color: #07090f; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;`;
const Rw = styled.span<{ $c: string }>`font-size: 15px; font-weight: 800; color: ${p => p.$c};`;
const ResultBtns = styled.div`display: flex; gap: 10px; justify-content: center; margin-top: 22px;`;
const PrimaryBtn = styled.button`padding: 11px 26px; border-radius: 10px; border: none; background: #7dd3fc; color: #07090f; font-weight: 800; font-size: 15px; cursor: pointer; &:hover{transform:translateY(-2px);} transition: transform 0.15s;`;
const GhostBtn = styled.button`padding: 11px 22px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: rgba(255,255,255,0.6); font-weight: 600; font-size: 15px; cursor: pointer; &:hover{background:rgba(255,255,255,0.06);}`;
