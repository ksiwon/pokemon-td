// src/components/cards/TrainerTower.tsx
// 트레이너 타워 PvE — 저장된 덱으로 층별 적팀과 오토배틀. 전투 로그를 재생.

import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenTitle as Title, ScreenTopBar as TopBar } from '../shared/screen';
import { ArrowLeft, Play, FastForward, ChevronsRight } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService } from '../../services/CardService';
import { databaseService } from '../../services/DatabaseService';
import { useCardState } from '../../hooks/useCardState';
import {
  cardBattleService, buildBattleCard, BattleCard, BattleResult, BattleLogEntry,
} from '../../services/CardBattleService';
import { BattleLogPanel, nextStatusMap, UnitStatusMap, UnitStatusBadge } from './BattleLogPanel';
import { showToast } from '../shared/Toast';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { win, winThin, btn, btnThin, pixelText, pixelBold, shadowLg, focusRing } from '../../styles/pixel';

type Phase = 'idle' | 'loading' | 'battle' | 'result';
type Reward = {
  coins: number; starShards: number; firstClear: boolean;
  daily?: { coins: number; starShards: number } | null;
};

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
  const [statusMap, setStatusMap] = useState<UnitStatusMap>({});
  const timer = useRef<number | null>(null);
  // 같은 층 재도전 횟수. 적팀 구성은 층 고정(리롤 방지)이되 전투 난수는 시도마다 달라진다.
  const attempts = useRef<{ floor: number; n: number }>({ floor, n: 0 });

  const startBattle = async () => {
    if (deck.length === 0) { showToast(t('cards.alerts.deckEmpty')); return; }
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
      if (player.length === 0) { showToast(t('cards.alerts.deckLoadFail')); setPhase('idle'); return; }

      // 적팀 구성 시드는 층 고정 — 약한 적이 나올 때까지 리롤(retry-scum)을 막는다.
      const teamSeed = currentFloor * 1000 + 7;
      const enemy = await cardBattleService.generateEnemyTeam(currentFloor, teamSeed);

      // [FIX] 전투 난수는 시도마다 다르게. 기존엔 전투 시드도 층 고정이라 같은 덱으로
      //   재도전하면 로그 한 줄까지 똑같은 패배가 무한 반복됐다("재도전" 버튼이 무의미).
      //   적 구성은 그대로라 리롤 악용은 여전히 불가하고, 급소·난수 변동만 열린다.
      if (attempts.current.floor !== currentFloor) attempts.current = { floor: currentFloor, n: 0 };
      const attempt = attempts.current.n++;
      const seed = teamSeed + attempt * 7919;

      // 시뮬레이션(사본을 변형) → 로그
      const pSim = player.map(c => ({ ...c }));
      const eSim = enemy.map(c => ({ ...c }));
      const res = cardBattleService.simulate(pSim, eSim, seed);

      // [FIX] 보상은 전투 결과가 확정되는 지금 즉시 지급 → 재생 중 '나가기'로 이탈해도 승리 보상 손실 없음.
      //   (기존엔 재생 완료 시점 finish에서 지급 → 중도 이탈 시 이긴 전투가 조용히 무효)
      let rw: Reward | null = null;
      if (res.winner === 'player') {
        // 도전 층은 항상 towerProgress+1이므로 승리 = 언제나 그 층의 첫 클리어.
        // (예전엔 '재도전 보상' 분기가 있었지만 도달 불가능한 죽은 코드였다.)
        const boss = currentFloor % 10 === 0;
        // [경제] 타워(미니 포켓)는 소액만 — 재화 farm은 싱글/멀티로 유도(오토배틀은 도전·소비 콘텐츠).
        const coins = 10 + currentFloor * 2;
        const shards = boss ? 5 : currentFloor % 5 === 0 ? 2 : 0;
        cardService.grantRewards({ coins, starShards: shards });
        cardService.setTowerProgress(currentFloor);
        // [주간 시즌] 이번 주 최고층 갱신 시에만 Firestore 시즌 랭킹 기록(오프라인/비로그인 무시).
        const weeklyBest = cardService.recordWeeklyBestFloor(currentFloor);
        if (weeklyBest !== null) databaseService.updateTowerSeasonRanking(weeklyBest).catch(() => {});
        // 일일 첫 승 보너스(타워/랜덤대전 공통, KST 자정 리셋)
        const daily = cardService.claimDailyFirstWin();
        rw = { coins, starShards: shards, firstClear: true, daily };
      } else {
        // [FIX] 패배해도 '이번 주 도달 층'은 현재 진행도로 기록한다. 예전엔 승리 시에만
        //   기록해서, 상한에 도달해 더 못 이기는 최상위 유저가 새 주 시즌 보드에서
        //   아예 사라졌다(주간 랭킹이 통산 진행도의 재방송이 되는 문제도 함께 완화).
        const weeklyBest = cardService.recordWeeklyBestFloor(cardService.getTowerProgress());
        if (weeklyBest !== null) databaseService.updateTowerSeasonRanking(weeklyBest).catch(() => {});
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
      setStatusMap({});
      setLog(res.log);
      setResult(res);
      setReward(rw);
      setStep(0);
      setPhase('battle');
    } catch (e) {
      console.warn('[TrainerTower] 전투 준비 실패', e);
      showToast(t('cards.alerts.battlePrepError'));
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
      setStatusMap(m => nextStatusMap(m, e));
      // 피격 흔들림은 데미지 이벤트(attack/dot)에만 — 회복/행동불가는 제외
      if (!e.kind || e.kind === 'attack' || e.kind === 'dot') {
        setHit(e.targetUid);
        window.setTimeout(() => setHit(null), 180 / speed);
      }
      setStep(s => s + 1);
      // [밸런스 연동] 전투가 평균 2턴 → 9턴으로 길어져 로그 엔트리 수가 늘었다.
      //   엔트리당 620ms면 재생이 1분을 넘겨 380ms로 단축(2x/4x·건너뛰기는 그대로).
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
        <BattleWrap>
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
              {result.winner === 'player'
                ? t('cards.tower.clearResult', { n: foughtFloor, alive: result.playerAlive })
                : t('cards.tower.defeatResult', { p: result.playerAlive, e: result.enemyAlive })}
            </ResultSub>
            {reward && (reward.coins > 0 || reward.starShards > 0) && (
              <RewardRow>
                {reward.firstClear && <FirstBadge>{t('cards.tower.firstClear')}</FirstBadge>}
                {reward.coins > 0 && <Rw $c={C.gold}>{t('cards.tower.coins', { n: reward.coins })}</Rw>}
                {reward.starShards > 0 && <Rw $c={C.purple}>{t('cards.tower.shards', { n: reward.starShards })}</Rw>}
              </RewardRow>
            )}
            {reward?.daily && (
              <RewardRow>
                <FirstBadge>{t('cards.daily.firstWin')}</FirstBadge>
                <Rw $c={C.gold}>{t('cards.tower.coins', { n: reward.daily.coins })}</Rw>
                {reward.daily.starShards > 0 && <Rw $c={C.purple}>{t('cards.tower.shards', { n: reward.daily.starShards })}</Rw>}
              </RewardRow>
            )}
            <ResultBtns>
              {result.winner === 'player'
                ? <PrimaryBtn onClick={reset}>{t('cards.tower.nextFloor')} <ChevronsRight size={ICON.md} /></PrimaryBtn>
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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 버튼, 알약 배지, 그라디언트 CTA, backdrop-filter, 둥근 모서리,
//           번지는 그림자, letter-spacing eyebrow, Tailwind 팔레트.

const FloorChip = styled.div`
  ${winThin('purple')}
  ${pixelBold}
  flex: 0 0 auto;
  font-size: ${FONT.sm}; color: ${C.purple};
  padding: ${SP.xs} ${SP.sm}; white-space: nowrap;
`;

const Center = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${SP.md}; padding: ${SP.xxl};
  ${media.mobile} { gap: ${SP.sm}; padding: ${SP.xl} ${SP.md}; }
`;
const FloorBig = styled.div`
  ${pixelBold}
  font-size: 48px; color: ${C.purple};
  ${shadowLg}
  ${media.mobile} { font-size: ${FONT.display}; }
`;
const FloorDesc = styled.div`
  font-size: ${FONT.sm}; color: ${C.textSub}; text-align: center;
  display: flex; align-items: center; gap: ${SP.sm};
`;
const BossTag = styled.span`
  ${pixelBold}
  background: ${C.red}; color: ${C.text};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1.4; padding: ${SP.xs} ${SP.sm};
`;
const StartBtn = styled.button<{ $on: boolean }>`
  ${p => btn(p.$on ? 'purple' : 'plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm};
  margin-top: ${SP.sm}; padding: ${SP.sm} ${SP.xxl};
  color: ${p => (p.$on ? C.text : C.textDim)};
  font-size: ${FONT.sm};
  cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')};
  ${focusRing}
`;
const Hint = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;

const BattleWrap = styled.div`
  flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 ${SP.md};
  display: flex; gap: ${SP.md}; align-items: stretch;
  ${media.tablet} { flex-direction: column; padding: 0 ${SP.sm} ${SP.md}; }
`;
const Arena = styled.div`
  flex: 1; min-width: 0; padding: ${SP.lg} 0;
  display: flex; flex-direction: column; gap: ${SP.sm}; position: relative;
  ${media.mobile} { padding: ${SP.md} 0 ${SP.xs}; }
`;
const SideLabel = styled.div<{ $side: 'player' | 'enemy' }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$side === 'enemy' ? C.red : C.green)};
  text-align: ${p => (p.$side === 'enemy' ? 'left' : 'right')};
`;
const Team = styled.div<{ $side: 'player' | 'enemy' }>`display: flex; flex-direction: column; gap: ${SP.md};`;
const ArenaRow = styled.div`display: flex; justify-content: center; gap: ${SP.lg}; min-height: 78px;`;
const Unit = styled.div<{ $dead: boolean; $hit: boolean; $side: 'player' | 'enemy' }>`
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: ${SP.xs}; width: 72px;
  opacity: ${p => (p.$dead ? 0.2 : 1)};
  filter: ${p => (p.$dead ? 'grayscale(1)' : 'none')};
  ${p => p.$hit && css`animation: ${shake} 0.18s linear;`}
`;
const Sprite = styled.img<{ $side: 'player' | 'enemy' }>`
  width: 56px; height: 56px; object-fit: contain;
  transform: scaleX(${p => (p.$side === 'enemy' ? -1 : 1)});
`;
/** HP 게이지 — 파인 트랙 + 각진 막대. */
const HpBar = styled.div`
  width: 60px; height: 8px;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  overflow: hidden;
`;
const HpFill = styled.div<{ $pct: number; $low: boolean }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => (p.$low ? C.red : C.green)};
`;
const UStars = styled.div`font-size: ${FONT.sm}; color: ${C.gold}; line-height: 1; height: 12px;`;
const Divider = styled.div`height: ${SCALE}px; background: ${C.divider}; margin: ${SP.xs} 0;`;

const Controls = styled.div`display: flex; gap: ${SP.sm}; justify-content: center; margin-top: ${SP.md};`;
const CtrlBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  color: ${C.text}; padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  ${focusRing}
`;

const ResultVeil = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 16, 26, 0.82);
`;
const ResultCard = styled.div<{ $win: boolean }>`
  ${p => win(p.$win ? 'green' : 'red')}
  ${pixelText}
  color: ${C.text};
  padding: ${SP.xl}; text-align: center; min-width: 300px;
  animation: ${popIn} 0.3s ease-out both;
`;
const ResultTitle = styled.div<{ $win: boolean }>`
  ${pixelBold}
  font-size: ${FONT.display}; color: ${p => (p.$win ? C.green : C.red)};
  ${shadowLg}
`;
const ResultSub = styled.div`font-size: ${FONT.sm}; color: ${C.textSub}; margin-top: ${SP.xs};`;
const RewardRow = styled.div`
  display: flex; gap: ${SP.sm}; justify-content: center; align-items: center;
  flex-wrap: wrap; margin-top: ${SP.md};
`;
const FirstBadge = styled.span`
  ${pixelBold}
  background: ${C.gold}; color: ${C.ink};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1.4; padding: ${SP.xs} ${SP.sm};
  text-shadow: none;
`;
const Rw = styled.span<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$c};
`;
const ResultBtns = styled.div`display: flex; gap: ${SP.sm}; justify-content: center; margin-top: ${SP.lg};`;
const PrimaryBtn = styled.button`
  ${btn('purple')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.xl};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const GhostBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.lg};
  color: ${C.textSub}; font-size: ${FONT.sm};
  ${focusRing}
`;
