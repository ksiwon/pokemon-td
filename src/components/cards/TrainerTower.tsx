// src/components/cards/TrainerTower.tsx
// 트레이너 타워 PvE — 저장된 덱으로 층별 적팀과 오토배틀. 전투 로그를 재생.

import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { media } from '../../utils/responsive.utils';
import { ArrowLeft, Play, FastForward, ChevronsRight } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService } from '../../services/CardService';
import { useCardState } from '../../hooks/useCardState';
import {
  cardBattleService, buildBattleCard, BattleCard, BattleResult, BattleLogEntry,
} from '../../services/CardBattleService';

type Phase = 'idle' | 'loading' | 'battle' | 'result';
type Reward = { coins: number; starShards: number; firstClear: boolean };

export const TrainerTower = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
  const state = useCardState();
  const floor = state.towerProgress + 1;
  const deck = useMemo(() => cardService.getDeck(), [state.deck]);

  const [phase, setPhase] = useState<Phase>('idle');
  // 이번 전투에서 실제 싸운 층(스냅샷). 보상 지급으로 towerProgress가 바뀌어도 결과 표기가 안 흔들리게.
  const [foughtFloor, setFoughtFloor] = useState(floor);
  const [units, setUnits] = useState<Record<string, BattleCard>>({});
  const [playerOrder, setPlayerOrder] = useState<BattleCard[]>([]);
  const [enemyOrder, setEnemyOrder] = useState<BattleCard[]>([]);
  const [log, setLog] = useState<BattleLogEntry[]>([]);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [hpMap, setHpMap] = useState<Record<string, number>>({});
  const [hit, setHit] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const startBattle = async () => {
    if (deck.length === 0) { alert(t('cards.alerts.deckEmpty')); return; }
    const currentFloor = floor; // 이번 전투 층 고정
    setFoughtFloor(currentFloor);
    setPhase('loading');
    try {
      // 플레이어 팀 빌드
      const player: BattleCard[] = [];
      for (const s of deck) {
        const entry = state.collection[s.pokemonId];
        if (!entry) continue;
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        player.push(buildBattleCard(p, { stars: entry.stars, row: s.row, slot: s.slot, side: 'player', uid: `player-${s.pokemonId}` }));
      }
      if (player.length === 0) { alert(t('cards.alerts.deckLoadFail')); setPhase('idle'); return; }

      const seed = currentFloor * 1000 + 7;
      const enemy = await cardBattleService.generateEnemyTeam(currentFloor, seed);

      // 시뮬레이션(사본을 변형) → 로그
      const pSim = player.map(c => ({ ...c }));
      const eSim = enemy.map(c => ({ ...c }));
      const res = cardBattleService.simulate(pSim, eSim, seed);

      // [FIX] 보상은 전투 결과가 확정되는 지금 즉시 지급 → 재생 중 '나가기'로 이탈해도 승리 보상 손실 없음.
      //   (기존엔 재생 완료 시점 finish에서 지급 → 중도 이탈 시 이긴 전투가 조용히 무효)
      let rw: Reward | null = null;
      if (res.winner === 'player') {
        const firstClear = currentFloor > cardService.getTowerProgress();
        const boss = currentFloor % 10 === 0;
        // [경제] 타워(미니 포켓)는 소액만 — 재화 farm은 싱글/멀티로 유도(오토배틀은 도전·소비 콘텐츠).
        //   첫클리어도 소량, 재도전은 극소량(파밍 차단).
        const coins = firstClear ? 10 + currentFloor * 2 : 2 + Math.floor(currentFloor / 2);
        const shards = firstClear ? (boss ? 5 : currentFloor % 5 === 0 ? 2 : 0) : 0;
        cardService.grantRewards({ coins, starShards: shards });
        if (firstClear) cardService.setTowerProgress(currentFloor);
        rw = { coins, starShards: shards, firstClear };
      }

      // 재생용: 시너지 적용된 사본(pSim/eSim)을 풀피로 리셋
      const all: Record<string, BattleCard> = {};
      const reset = (arr: BattleCard[]) => arr.map(c => { const u = { ...c, currentHp: c.maxHp }; all[u.uid] = u; return u; });
      const pOrder = reset(pSim);
      const eOrder = reset(eSim);
      const hp0: Record<string, number> = {};
      Object.values(all).forEach(u => { hp0[u.uid] = u.maxHp; });

      setUnits(all);
      setPlayerOrder(pOrder);
      setEnemyOrder(eOrder);
      setHpMap(hp0);
      setLog(res.log);
      setResult(res);
      setReward(rw);
      setStep(0);
      setPhase('battle');
    } catch (e) {
      console.warn('[TrainerTower] 전투 준비 실패', e);
      alert(t('cards.alerts.battlePrepError'));
      setPhase('idle');
    }
  };

  // 로그 재생
  useEffect(() => {
    if (phase !== 'battle') return;
    if (step >= log.length) { finish(); return; }
    timer.current = window.setTimeout(() => {
      const e = log[step];
      setHpMap(m => ({ ...m, [e.targetUid]: e.remainingHp }));
      setHit(e.targetUid);
      window.setTimeout(() => setHit(null), 180 / speed);
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

  // 보상은 startBattle에서 이미 지급됨 — 여기선 결과 화면 전환만.
  const finish = () => {
    if (!result || phase === 'result') return;
    setPhase('result');
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setReward(null); setLog([]); setStep(0);
  };

  // 전투/결과 중엔 싸운 층을, 대기 중엔 다음 도전 층을 표시(보상지급 후 층 증가로 인한 표기 흔들림 방지).
  const headerFloor = (phase === 'battle' || phase === 'result') ? foughtFloor : floor;

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
    // 전열이 가운데(구분선)에서 마주보도록 — 적:[후열,전열] / 나:[전열,후열].
    //   (전열이 먼저 맞는 타겟팅과 시각적으로 일치. 예전엔 뒤집혀 후열이 가운데서 부딪혀 보였음)
    const rows = side === 'enemy' ? [back, front] : [front, back];
    return (
      <Team $side={side}>
        {rows.map((r, i) => (
          <ArenaRow key={i}>{r.map(renderUnit)}</ArenaRow>
        ))}
      </Team>
    );
  };

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onBack}><ArrowLeft size={16} /> {t('cards.common.back')}</BackBtn>
        <Title>{t('cards.tower.title')}</Title>
        <FloorChip>{t('cards.tower.floor', { n: headerFloor })}{headerFloor % 10 === 0 ? t('cards.tower.bossSuffix') : ''}</FloorChip>
      </TopBar>

      {phase === 'idle' && (
        <Center>
          <FloorBig>{t('cards.tower.floor', { n: floor })}</FloorBig>
          <FloorDesc>
            {deck.length === 0
              ? t('cards.tower.noDeck')
              : t('cards.tower.deckReady', { n: deck.length })}
            {floor % 10 === 0 && <BossTag>{t('cards.tower.bossFloor')}</BossTag>}
          </FloorDesc>
          <StartBtn $on={deck.length > 0} onClick={startBattle} disabled={deck.length === 0}>
            <Play size={18} /> {t('cards.tower.start')}
          </StartBtn>
          <Hint>{t('cards.tower.bestReach', { n: state.towerProgress })}</Hint>
        </Center>
      )}

      {phase === 'loading' && <Center><FloorDesc>{t('cards.tower.preparing')}</FloorDesc></Center>}

      {(phase === 'battle' || phase === 'result') && (
        <Arena>
          <SideLabel $side="enemy">{t('cards.tower.enemyTrainer')}</SideLabel>
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
      )}

      {phase === 'result' && result && (
        <ResultVeil>
          <ResultCard $win={result.winner === 'player'}>
            <ResultTitle $win={result.winner === 'player'}>
              {result.winner === 'player' ? t('cards.tower.victory') : t('cards.tower.defeat')}
            </ResultTitle>
            <ResultSub>
              {result.winner === 'player'
                ? t('cards.tower.clearResult', { n: foughtFloor, alive: result.playerAlive })
                : t('cards.tower.defeatResult', { p: result.playerAlive, e: result.enemyAlive })}
            </ResultSub>
            {reward && (reward.coins > 0 || reward.starShards > 0) && (
              <RewardRow>
                {reward.firstClear && <FirstBadge>{t('cards.tower.firstClear')}</FirstBadge>}
                {reward.coins > 0 && <Rw $c="#fbbf24">{t('cards.tower.coins', { n: reward.coins })}</Rw>}
                {reward.starShards > 0 && <Rw $c="#c084fc">{t('cards.tower.shards', { n: reward.starShards })}</Rw>}
              </RewardRow>
            )}
            <ResultBtns>
              {result.winner === 'player'
                ? <PrimaryBtn onClick={reset}>{t('cards.tower.nextFloor')}</PrimaryBtn>
                : <PrimaryBtn onClick={reset}>{t('cards.tower.retry')}</PrimaryBtn>}
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

// ─── styled ──────────────────────────────────────────────────────────────────
const Root = styled.div`min-height: 100vh; background: radial-gradient(circle at top, #161024, #070910); color: #e8edf5; display: flex; flex-direction: column;`;
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
const FloorChip = styled.div`
  flex: 0 0 auto;
  font-size: 13px; font-weight: 700; color: #c084fc; background: rgba(192,132,252,0.12); padding: 6px 12px; border-radius: 100px; white-space: nowrap;
  ${media.mobile} { font-size: 12px; padding: 5px 10px; }
`;

const Center = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px;
  ${media.mobile} { gap: 12px; padding: 28px 16px; }
`;
const FloorBig = styled.div`
  font-size: 56px; font-weight: 900; color: #f8fafc; text-shadow: 0 0 24px rgba(192,132,252,0.5);
  ${media.mobile} { font-size: 40px; }
`;
const FloorDesc = styled.div`font-size: 15px; color: rgba(255,255,255,0.6); text-align: center; display: flex; align-items: center; gap: 8px; ${media.mobile} { font-size: 13px; }`;
const BossTag = styled.span`background: #ef4444; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;`;
const StartBtn = styled.button<{ $on: boolean }>`
  display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 14px 36px; border-radius: 12px; border: none;
  background: ${p => (p.$on ? 'linear-gradient(135deg,#c084fc,#8b5cf6)' : 'rgba(255,255,255,0.08)')};
  color: ${p => (p.$on ? '#fff' : 'rgba(255,255,255,0.4)')}; font-size: 16px; font-weight: 800;
  cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')}; box-shadow: ${p => (p.$on ? '0 8px 24px rgba(139,92,246,0.4)' : 'none')};
  ${media.mobile} { padding: 12px 28px; font-size: 15px; }
`;
const Hint = styled.div`font-size: 12px; color: rgba(255,255,255,0.35);`;

const Arena = styled.div`
  flex: 1; max-width: 760px; width: 100%; margin: 0 auto; padding: 20px 16px;
  display: flex; flex-direction: column; gap: 10px; position: relative;
  ${media.mobile} { padding: 14px 8px; }
`;
const SideLabel = styled.div<{ $side: 'player' | 'enemy' }>`
  font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
  color: ${p => (p.$side === 'enemy' ? '#fca5a5' : '#86efac')};
  text-align: ${p => (p.$side === 'enemy' ? 'left' : 'right')};
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
const FirstBadge = styled.span`background: #fbbf24; color: #07090f; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;`;
const Rw = styled.span<{ $c: string }>`font-size: 15px; font-weight: 800; color: ${p => p.$c};`;
const ResultBtns = styled.div`display: flex; gap: 10px; justify-content: center; margin-top: 22px;`;
const PrimaryBtn = styled.button`padding: 11px 26px; border-radius: 10px; border: none; background: #c084fc; color: #07090f; font-weight: 800; font-size: 15px; cursor: pointer; &:hover{transform:translateY(-2px);} transition: transform 0.15s;`;
const GhostBtn = styled.button`padding: 11px 22px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: rgba(255,255,255,0.6); font-weight: 600; font-size: 15px; cursor: pointer; &:hover{background:rgba(255,255,255,0.06);}`;
