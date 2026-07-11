// src/components/multiplayer/TFTBattleArena.tsx
// 6x6 TFT 스타일 배틀 — V5 결정론 재설계 + V7 사람 매치 완주 보장 + V8 타이머 안정화
// ──────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { multiplayerService } from '../../services/MultiplayerService';
import { TowerDetail, PvPBattleResult } from '../../types/multiplayer';
import { calculateActiveSynergies } from '../../utils/synergyManager';
import { lMedia } from '../../utils/responsive.utils';
import { GamePokemon, Synergy } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { useTranslation } from '../../i18n';
// [SIM-EXTRACT] 전투 순수 로직은 src/game/arenaSim.ts로 이동 — 밸런스 시뮬 하네스와 공유.
//   여기서는 렌더링/타이머/네트워크 오케스트레이션만 담당한다.
import {
  COLS, ROWS, CELL, TICK_MS, FPS,
  mulberry32, Unit, FloatTxt, L_POS, R_POS,
  buildUnits, simulateTick, sortTeamDeterministic,
} from '../../game/arenaSim';

const PREP_TIME = 30;
const REVEAL_TIME = 5;

const MAX_CATCHUP_TICKS = FPS * 10;

const floatUp = keyframes`0%{opacity:0;transform:translateX(-50%) translateY(10px);}20%{opacity:1;transform:translateX(-50%) translateY(0);}100%{opacity:0;transform:translateX(-50%) translateY(-50px);}`;
const hitFlash = keyframes`0%,100%{filter:brightness(1);}50%{filter:brightness(2.5) saturate(0);}`;
const atkBounce = keyframes`0%,100%{transform:scale(1);}50%{transform:scale(1.25);}`;
const revealPulse = keyframes`0%,100%{opacity:0.8;transform:scale(0.95);}50%{opacity:1;transform:scale(1.05);}`;
const benchPulse = keyframes`0%,100%{box-shadow:0 0 0px rgba(74,222,128,0);}50%{box-shadow:0 0 15px rgba(74,222,128,0.4);}`;

export interface TFTBattleResult {
  winner: 'player1' | 'player2';
  player1Remaining: number;
  player2Remaining: number;
}

export interface TFTBattleArenaProps {
  roomId?: string;
  myUserId?: string;
  opponentId?: string;
  myTeam: TowerDetail[];
  opponentTeam: TowerDetail[];
  opponentName: string;
  myPosition: 'L' | 'R';
  phase: 'prep' | 'battle' | 'result';
  battleResult?: PvPBattleResult | null;
  battleSeed?: number | null;
  battleStartTime?: number | null;
  onBattleComplete?: (result: TFTBattleResult) => void;
}

export const TFTBattleArena: React.FC<TFTBattleArenaProps> = ({
  roomId, myUserId, opponentId, myTeam, opponentTeam, opponentName,
  myPosition, phase, battleSeed, battleStartTime, battleResult: battleResultProp, onBattleComplete,
}) => {
  const { t } = useTranslation();
  const startTime = battleStartTime;
  
  const [units, setUnits] = useState<Unit[]>([]);
  const [floats, setFloats] = useState<FloatTxt[]>([]);
  const [battleState, setBattleState] = useState<'idle' | 'reveal' | 'fighting' | 'done'>('idle');
  const [winnerText, setWinnerText] = useState<string | null>(null);
  const [selectedBenchId, setSelectedBenchId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(PREP_TIME);

  const simUnitsRef = useRef<Unit[]>([]);
  const rngRef = useRef<() => number>(() => Math.random());
  const simTickRef = useRef<number>(0);
  const revealStartedRef = useRef(false);
  const battleStartAtRef = useRef<number | null>(null);

  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const floatIdRef = useRef(0);
  const initRef = useRef<{ my: string; op: string }>({ my: '', op: '' });
  const resultReportedRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  // [FIX-SCALE] 보드 스케일 — CenterArea 크기에 맞게 동적으로 계산
  const centerRef = useRef<HTMLDivElement>(null);
  const [boardScale, setBoardScale] = useState(1);

  // [FIX-JITTER-1] onBattleComplete을 ref로 관리 — 부모 리렌더마다 새 함수 참조가 들어와도
  // fighting useEffect의 dependency로 쓰이지 않으므로 setInterval이 재시작되지 않음
  const onBattleCompleteRef = useRef(onBattleComplete);
  useEffect(() => { onBattleCompleteRef.current = onBattleComplete; }, [onBattleComplete]);

  // [FIX-SCALE] CenterArea 크기 변화 감지 → boardScale 업데이트
  useLayoutEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const BOARD_SIZE = COLS * CELL; // 528
    const update = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const scale = Math.min(W / BOARD_SIZE, H / BOARD_SIZE, 1);
      setBoardScale(scale > 0 ? scale : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [remotePlacements, setRemotePlacements] = useState<Map<string, { id: string, x: number, y: number }[]>>(new Map());

  useEffect(() => {
    if (!roomId) return;
    const unsub = multiplayerService.onAllTFTPlacementsUpdate(roomId, (pm) => {
      setRemotePlacements(pm);
    });
    return unsub;
  }, [roomId]);

  const myCols = myPosition === 'L' ? [0, 1] : [4, 5];

  const benchUnits = units.filter(u => u.team === 'my' && u.x === -1 && !u.fainted);

  const mySynergies = useMemo(
    () => calculateActiveSynergies(
      sortTeamDeterministic(myTeam).filter(t => !t.isFainted) as unknown as GamePokemon[]
    ),
    [myTeam],
  );
  const oppSynergies = useMemo(
    () => calculateActiveSynergies(
      sortTeamDeterministic(opponentTeam).filter(t => !t.isFainted) as unknown as GamePokemon[]
    ),
    [opponentTeam],
  );

  useEffect(() => {
    if (phase !== 'result') {
      const current = useGameStore.getState().activeSynergies;
      const sig = (s: Synergy[]) => s.map(x => `${x.id}:${x.count}`).join('|');
      const currentSig = sig(current);
      const newSig = sig(mySynergies);
      if (currentSig !== newSig) {
        useGameStore.setState({ activeSynergies: mySynergies });
      }
    }
  }, [mySynergies, phase]);

  const myTeamSig = useMemo(
    () => (myTeam || []).map(t => `${t.pokemonId}:${t.level}:${t.currentHp}:${t.isFainted ? 1 : 0}`).join(','),
    [myTeam]
  );
  const oppTeamSig = useMemo(
    () => (opponentTeam || []).map(t => `${t.pokemonId}:${t.level}:${t.currentHp}:${t.isFainted ? 1 : 0}`).join(','),
    [opponentTeam]
  );

  useEffect(() => {
    if (myTeam.length === 0 && opponentTeam.length === 0) return;
    if (initRef.current.my === myTeamSig && initRef.current.op === oppTeamSig && units.length > 0) return;

    initRef.current = { my: myTeamSig, op: oppTeamSig };
    resultReportedRef.current = false;
    hasSubmittedRef.current = false;
    // RNG는 fighting 진입 시점에 초기화 — buildUnits에서 소비하지 않음
    rngRef.current = () => 0.5;
    const initialUnits = buildUnits(myTeam, opponentTeam, mySynergies, oppSynergies);
    revealStartedRef.current = false;
    simUnitsRef.current = initialUnits;
    setUnits(initialUnits);
    setBattleState('idle');
    setWinnerText(null);
    setFloats([]);
    setDragId(null);
    setSelectedBenchId(null);
  }, [myTeamSig, oppTeamSig, myPosition, battleSeed]);

  useEffect(() => {
    if (phase !== 'prep' || battleState !== 'idle') return;
    const updateTime = () => {
      if (!startTime) {
        setCountdown(PREP_TIME);
        return;
      }
      const now = Date.now() + multiplayerService.getServerTimeOffset();
      const elapsed = Math.floor((now - startTime) / 1000);
      // [T3] clamp: 0 ≤ remaining ≤ PREP_TIME (clock skew 방어)
      const remaining = Math.max(0, Math.min(PREP_TIME, PREP_TIME - elapsed));
      setCountdown(prev => prev !== remaining ? remaining : prev);
      if (remaining <= 0) {
        autoPlaceRemainingUnits();
        setBattleState('reveal');
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 500);
    return () => clearInterval(timer);
  }, [phase, battleState, startTime]);

  const autoPlaceRemainingUnits = useCallback(() => {
    setUnits(prev => {
      const next = [...prev];
      const defaults = myPosition === 'L' ? L_POS : R_POS;
      const unplaced = next.filter(u => u.team === 'my' && u.x === -1 && !u.fainted);
      if (unplaced.length === 0) return prev;
      const usedPositions = new Set(
        next.filter(u => u.team === 'my' && u.x >= 0).map(u => `${Math.round(u.x)},${Math.round(u.y)}`)
      );
      let defaultIdx = 0;
      for (const unit of unplaced) {
        while (defaultIdx < defaults.length) {
          const pos = defaults[defaultIdx];
          if (!usedPositions.has(`${pos.x},${pos.y}`)) {
            unit.x = pos.x; unit.y = pos.y;
            usedPositions.add(`${pos.x},${pos.y}`);
            break;
          }
          defaultIdx++;
        }
        if (unit.x === -1) {
          outer: for (let col of myCols) {
            for (let row = 0; row < ROWS; row++) {
              if (!usedPositions.has(`${col},${row}`)) {
                unit.x = col; unit.y = row;
                usedPositions.add(`${col},${row}`);
                break outer;
              }
            }
          }
        }
      }
      simUnitsRef.current = next;
      return next;
    });
  }, [myPosition, myCols]);

  useEffect(() => {
    if (battleState === 'reveal' && roomId && myUserId && !hasSubmittedRef.current) {
      const myPlacements = units
        .filter(u => u.team === 'my' && u.x >= 0)
        .map(u => ({ id: u.id, x: u.x, y: u.y }));
      if (myPlacements.length > 0) {
        hasSubmittedRef.current = true;
        multiplayerService.submitTFTPlacements(roomId, myUserId, myPlacements).catch(console.error);
      }
    }
  }, [battleState, units, roomId, myUserId]);

  const isOpponentAI = opponentId?.startsWith('ai_');
  const oppPlacements = opponentId ? remotePlacements.get(opponentId) : null;
  const isOpponentReady = isOpponentAI || (oppPlacements && oppPlacements.length > 0);

  // oppPlacements를 ref로 유지 — reveal effect dependency에서 제거해 timer 재시작 방지
  const oppPlacementsRef = useRef(oppPlacements);
  useEffect(() => { oppPlacementsRef.current = oppPlacements; }, [oppPlacements]);

  useEffect(() => {
    if (battleState !== 'reveal') return;

    // AI 상대: 즉시 준비완료. 사람 상대: Firebase 배치 수신 대기
    if (!isOpponentReady) {
      setCountdown(REVEAL_TIME);
      return;
    }

    // 이미 타이머 동작 중이면 중복 실행 방지
    if (revealStartedRef.current) return;
    revealStartedRef.current = true;

    // [DET] reveal 기준시각 = battleStartTime(서버) + PREP_TIME*1000
    const revealBase = battleStartTime
      ? battleStartTime + PREP_TIME * 1000
      : Date.now() + multiplayerService.getServerTimeOffset();

    const startFighting = () => {
      // [DET] RNG: fighting 진입 시점에 단 한 번 초기화
      const seed = battleSeed ?? 42424242;
      rngRef.current = mulberry32(seed);
      simTickRef.current = 0;

      // [DET] fighting 기준시각 고정 (서버 시각 기반 — 양측 tick 일치)
      battleStartAtRef.current = revealBase + REVEAL_TIME * 1000;

      // [DET] 배치 확정: oppPlacementsRef.current로 최신값 참조 (dependency 없음)
      const latestOppPlacements = oppPlacementsRef.current;
      const oppDefaults = myPosition === 'L' ? R_POS : L_POS;
      setUnits(currentUnits => {
        const finalized = currentUnits.map(u => {
          if (u.team === 'opp') {
            const idx = parseInt(u.id.split('-')[1]);
            if (!isOpponentAI && latestOppPlacements && latestOppPlacements[idx]) {
              return { ...u, x: latestOppPlacements[idx].x, y: latestOppPlacements[idx].y };
            }
            // AI 또는 배치 미수신: 기본 위치
            const pos = oppDefaults[idx] ?? { x: myPosition === 'L' ? 4 + (idx % 2) : idx % 2, y: idx };
            return { ...u, x: pos.x, y: pos.y };
          }
          return u;
        });
        simUnitsRef.current = finalized;
        return finalized;
      });

      setBattleState('fighting');
    };

    let timerId: ReturnType<typeof setInterval> | null = null;

    const updateReveal = () => {
      const now = Date.now() + multiplayerService.getServerTimeOffset();
      const elapsed = Math.floor((now - revealBase) / 1000);
      // [T3] clamp: 0 ≤ remaining ≤ REVEAL_TIME (clock skew 방어)
      const remaining = Math.max(0, Math.min(REVEAL_TIME, REVEAL_TIME - elapsed));
      setCountdown(remaining);
      if (remaining <= 0) {
        if (timerId) { clearInterval(timerId); timerId = null; }
        startFighting();
      }
    };

    updateReveal();
    timerId = setInterval(updateReveal, 250);
    return () => { if (timerId) clearInterval(timerId); };
    // oppPlacements를 dependency에서 제거 → ref로 최신값 읽음 (timer 재시작 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState, isOpponentReady, battleStartTime, battleSeed, isOpponentAI, myPosition]);

  // [T2] phase === 'battle' 분기 삭제 — BattlePhaseUI가 arenaPhase='prep'|'result'만 전달하므로
  //   이 useEffect는 절대 실행되지 않는 dead code였음.

  useEffect(() => {
    if (!battleResultProp) return;
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    if (battleState !== 'done') {
      // [T7] 서버 결과 기반 winnerText 동기화 — done 오버레이에 정확한 텍스트 표시
      const myUserIdSafe = myUserId ?? '';
      const myWon = battleResultProp.winnerId === myUserIdSafe;
      setWinnerText(myWon ? t('battle.winMsg') : t('battle.loseMsg', { name: opponentName }));
      setBattleState('done');
    }
  }, [battleResultProp, battleState, myUserId, opponentName, t]);

  useEffect(() => {
    if (battleState !== 'fighting') return;
    const tick = () => {
      const now = Date.now() + multiplayerService.getServerTimeOffset();
      const delta = Math.max(0, now - (battleStartAtRef.current ?? now));
      const targetTick = Math.floor(delta / TICK_MS);
      const simTick = simTickRef.current;
      let ticksToRun = Math.min(targetTick - simTick, MAX_CATCHUP_TICKS);
      if (ticksToRun <= 0) return;

      const rng = rngRef.current;
      let current = simUnitsRef.current;
      const allFloats: FloatTxt[] = [];
      let done = false;
      for (let i = 0; i < ticksToRun; i++) {
        const res = simulateTick(current, myPosition, rng);
        current = res.units;
        if (allFloats.length < 60) res.floats.forEach(f => allFloats.length < 60 && allFloats.push(f));
        simTickRef.current++;
        if (res.done) { done = true; break; }
      }
      simUnitsRef.current = current;
      setUnits(current);
      if (allFloats.length > 0) {
        const idOffset = floatIdRef.current;
        const rebased = allFloats.map((f, idx) => ({ ...f, id: idOffset + idx + 1 }));
        floatIdRef.current += allFloats.length;
        setFloats(f => [...f, ...rebased]);
        setTimeout(() => setFloats(f => f.filter(x => !rebased.some(r => r.id === x.id))), 850);
      }
      if (done) {
        if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
        setBattleState('done');
        const alive = (u: Unit) => !u.fainted && u.hp > 0 && u.x >= 0;
        const myWon = current.some(u => u.team === 'my' && alive(u));
        setWinnerText(myWon ? t('battle.winMsg') : t('battle.loseMsg', { name: opponentName }));
        if (!resultReportedRef.current) {
          resultReportedRef.current = true;
          const p1Alive = current.filter(u => ((myPosition === 'L' && u.team === 'my') || (myPosition === 'R' && u.team === 'opp')) && alive(u)).length;
          const p2Alive = current.filter(u => ((myPosition === 'R' && u.team === 'my') || (myPosition === 'L' && u.team === 'opp')) && alive(u)).length;
          // [FIX-JITTER-1] ref를 통해 호출 — dependency에서 제거해 interval 재시작 방지
          onBattleCompleteRef.current?.({ winner: p1Alive > 0 ? 'player1' : 'player2', player1Remaining: p1Alive, player2Remaining: p2Alive });
        }
      }
    };
    loopRef.current = setInterval(tick, TICK_MS);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  // [FIX-JITTER-1] onBattleComplete 제거 — ref로 최신값 참조, interval 재시작 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState, opponentName, myPosition]);

  const handleBenchClick = (id: string) => {
    if (battleState !== 'idle' || phase !== 'prep') return;
    setSelectedBenchId(prev => prev === id ? null : id);
    setDragId(null);
  };

  const handleCellClick = (col: number, row: number) => {
    if (phase !== 'prep' || battleState !== 'idle' || !myCols.includes(col)) return;
    const movingId = selectedBenchId ?? dragId;
    if (!movingId) return;

    setUnits(prev => {
      const next = prev.map(u => ({ ...u }));
      const moving = next.find(u => u.id === movingId);
      if (!moving) return prev;

      // [T4] 같은 셀에 내 유닛이 있으면 swap
      const occupant = next.find(u =>
        u.team === 'my' && u.id !== movingId && u.x === col && u.y === row
      );
      if (occupant) {
        occupant.x = moving.x;
        occupant.y = moving.y;
      }
      moving.x = col;
      moving.y = row;
      simUnitsRef.current = next;
      return next;
    });
    setSelectedBenchId(null);
    setDragId(null);
  };

  const handleReturnToBench = (id: string) => {
    if (phase !== 'prep' || battleState !== 'idle') return;
    setUnits(prev => {
      const next = prev.map(u => {
        if (u.id !== id) return u;
        const idx = parseInt(u.id.split('-')[1]);
        // [T14] y도 bench index로 복원 — 재배치 시 이상 위치 방지
        return { ...u, x: -1, y: idx };
      });
      return next;
    });
    // [T12] setter 외부에서 ref 동기화 — React 18 Strict Mode 안전
    queueMicrotask(() => {
      simUnitsRef.current = simUnitsRef.current.map(u => {
        if (u.id !== id) return u;
        const idx = parseInt(u.id.split('-')[1]);
        return { ...u, x: -1, y: idx };
      });
    });
    setDragId(null);
  };

  const isPrep = phase === 'prep' && battleState === 'idle';
  const isReveal = battleState === 'reveal';

  return (
    <Wrap>
      <Header>
        <TitleRow>
          <ArenaIcon><Emoji glyph="⚔️" size={18} /></ArenaIcon>
          <ArenaTitle>{t('battle.arenaTitle')}</ArenaTitle>
          {isPrep && (
            <PhasePill>
              <PhaseDot />
              {t('battle.prepTime')}: {countdown}s
            </PhasePill>
          )}
        </TitleRow>
        <VersusRow>
          <PosLabel $isMe={true}>{t('battle.you')} ({myPosition})</PosLabel>
          <PosVS>{t('battle.vs')}</PosVS>
          {/* [FIX-3] 타이머 — 모든 화면에서 항상 표시 */}
          {isPrep && <CountdownBadge>{countdown}s</CountdownBadge>}
          <PosLabel $isMe={false}>{opponentName} ({myPosition === 'L' ? 'R' : 'L'})</PosLabel>
        </VersusRow>
      </Header>

      <MainGrid>
        {/* myPosition에 따라 벤치와 상대 패널 좌우 스왑 */}
        {(() => {
          const myBenchPanel = (
            <BenchArea>
              <PanelTitle>{t('battle.myBenchCount', { count: benchUnits.length })}</PanelTitle>
              <BenchGrid>
                {benchUnits.map(u => (
                  <TowerCard key={u.id} $selected={selectedBenchId === u.id} onClick={() => handleBenchClick(u.id)}>
                    {u.detail.sprite ? <CardSprite src={u.detail.sprite} /> : <CardFallback>{u.detail.name?.slice(0, 2)}</CardFallback>}
                    <CardInfo>
                      <CardNameRow>
                        <CardName>{u.detail.name}</CardName>
                        <CardLevel>Lv.{u.detail.level}</CardLevel>
                      </CardNameRow>
                      {u.detail.types && (
                        <CardTypes>
                          {u.detail.types.map(type => <TypeBadge key={type} $type={type}>{type}</TypeBadge>)}
                        </CardTypes>
                      )}
                    </CardInfo>
                    <CardNameSmall>
                      {u.detail.name}
                      <CardLevelSmall>Lv.{u.detail.level}</CardLevelSmall>
                    </CardNameSmall>
                  </TowerCard>
                ))}
                {benchUnits.length === 0 && <EmptyMsg>{t('battle.allPlaced')}</EmptyMsg>}
              </BenchGrid>
              <Hint dangerouslySetInnerHTML={{ __html: t('battle.placementHint') }} />
            </BenchArea>
          );

          const opponentPanel = (
            <OpponentInfoPanel>
              <PanelTitle>{t('battle.opponentTowersCount', { count: opponentTeam.length })}</PanelTitle>
              <BenchGrid>
                {sortTeamDeterministic(opponentTeam).map((t, i) => (
                  <TowerCard key={i}>
                    {t.sprite ? <CardSprite src={t.sprite} alt={t.name} /> : <CardFallback>{t.name?.slice(0, 2)}</CardFallback>}
                    <CardInfo>
                      <CardNameRow>
                        <CardName>{t.name}</CardName>
                        <CardLevel>Lv.{t.level}</CardLevel>
                      </CardNameRow>
                      {t.types && (
                        <CardTypes>
                          {t.types.map(type => <TypeBadge key={type} $type={type}>{type}</TypeBadge>)}
                        </CardTypes>
                      )}
                    </CardInfo>
                  </TowerCard>
                ))}
              </BenchGrid>
            </OpponentInfoPanel>
          );

          return (
            <>
              <LeftSidebar>
                {myPosition === 'L' ? myBenchPanel : opponentPanel}
              </LeftSidebar>

              <CenterArea ref={centerRef}>
                <Board $isPrep={isPrep} style={{
                  transform: `scale(${boardScale})`,
                  transformOrigin: 'top center',
                  // 스케일 축소 시 하단 여백 보정
                  marginBottom: boardScale < 1 ? `${(ROWS * CELL) * (boardScale - 1)}px` : undefined,
                }}>
                  {[...Array(ROWS)].map((_, r) => [...Array(COLS)].map((_, c) => (
                    <Cell key={`${r}-${c}`} $col={c} $row={r} $isMy={myCols.includes(c)}
                      $isTarget={!!(selectedBenchId || dragId) && myCols.includes(c)}
                      onClick={() => handleCellClick(c, r)}
                    />
                  )))}
                  <ZoneLbl style={{ left: '2%', top: '2%' }}>{myPosition === 'L' ? t('battle.myZone') : t('battle.opponentZone')}</ZoneLbl>
                  <ZoneLbl style={{ right: '2%', top: '2%' }}>{myPosition === 'R' ? t('battle.myZone') : t('battle.opponentZone')}</ZoneLbl>
                  {units.filter(u => u.x >= 0).map(u => (
                    <UnitWrap key={u.id} $team={u.team} $fainted={u.fainted} $hit={u.isHit} $atk={u.isAtk} $sel={dragId === u.id}
                      style={{ left: u.x * CELL + CELL / 2, top: u.y * CELL + CELL / 2, transform: 'translate(-50%, -50%)' }}
                      onMouseDown={() => isPrep && u.team === 'my' && setDragId(u.id)}
                      onContextMenu={(e) => { e.preventDefault(); handleReturnToBench(u.id); }}
                    >
                      {!u.fainted && <HpBg><HpFill style={{ width: `${(u.hp / u.maxHp) * 100}%`, background: u.team === 'my' ? '#4ade80' : '#f87171' }} /></HpBg>}
                      {u.detail.sprite ? <Sprite src={u.detail.sprite} $fainted={u.fainted} $flip={myPosition === 'R' ? u.team === 'my' : u.team === 'opp'} /> : <Fallback $team={u.team}>{u.detail.name?.slice(0, 2)}</Fallback>}
                      <UnitName>{u.detail.name}</UnitName>
                    </UnitWrap>
                  ))}
                  {floats.map(f => <FloatEl key={f.id} style={{ left: f.x, top: f.y, color: f.color }}>{f.text}</FloatEl>)}
                  {isReveal && <RevealOverlay><RevealText>{!isOpponentReady ? t('battle.waitingOpponent') : t('battle.startIn', { countdown })}</RevealText></RevealOverlay>}
                  {battleState === 'done' && <RevealOverlay style={{ background: 'rgba(0,0,0,0.6)', pointerEvents: 'auto' }}><div style={{ textAlign: 'center' }}><RevealText style={{ fontSize: '42px', marginBottom: '10px' }}>{winnerText}</RevealText></div></RevealOverlay>}
                  <AchievementToastDisplay />
                </Board>
              </CenterArea>

              <RightSidebar>
                {myPosition === 'R' ? myBenchPanel : opponentPanel}
              </RightSidebar>
            </>
          );
        })()}
      </MainGrid>
    </Wrap>

  );
};
const AchievementToastDisplay: React.FC = () => {
  const achievementToast = useGameStore(s => s.achievementToast);
  if (!achievementToast) return null;
  const ap = achievementToast.earnedAP ?? 3;
  const tierColor = ap >= 100 ? '#ff80ff' : ap >= 50 ? '#b9f2ff' : ap >= 25 ? '#FFD700' : ap >= 10 ? '#c0c0c0' : '#cd7f32';
  const isFirst = achievementToast.isFirstTime;
  return (
    <AchievementToastPill key={achievementToast.timestamp} $color={tierColor} $first={isFirst}>
      <Emoji glyph={isFirst ? '🏆' : '✅'} size={14} />{' '}
      <AchPillName $first={isFirst}>{achievementToast.name}</AchPillName>
      {isFirst && <AchPillAP $color={tierColor}> +{ap}AP</AchPillAP>}
    </AchievementToastPill>
  );
};

// ── [FIX] 반응형 헬퍼 → responsive.utils의 lMedia 사용 ──────────
const L1024  = lMedia.tablet;
const LPHONE = lMedia.phoneSm;

const Wrap = styled.div`
  width:100%; height:100%; display:flex; flex-direction:column;
  background:#0b0e14; color:#fff; overflow:hidden; padding:20px;
  ${L1024} { padding: 10px 12px; }
  ${LPHONE} { padding: 4px 6px; }
`;

const Header = styled.div`
  display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:24px;
  ${L1024} { gap: 6px; margin-bottom: 10px; }
  ${LPHONE} { gap: 3px; margin-bottom: 5px; }
`;
const TitleRow = styled.div`display:flex;align-items:center;gap:12px;`;
const ArenaIcon = styled.div`font-size:24px; ${LPHONE} { font-size: 16px; }`;
const ArenaTitle = styled.div`
  font-size:20px; font-weight:900; letter-spacing:1px; text-transform:uppercase;
  ${L1024} { font-size: 16px; }
  ${LPHONE} { font-size: 12px; letter-spacing: 0.5px; }
`;
const PhasePill = styled.div`
  display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.08);
  padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; color:rgba(255,255,255,0.8);
  ${L1024} { padding: 4px 10px; font-size: 11px; gap: 5px; }
  ${LPHONE} { padding: 3px 8px; font-size: 10px; gap: 4px; border-radius: 14px; }
`;
const PhaseDot = styled.div`width:8px;height:8px;border-radius:50%;background:#fbbf24;box-shadow:0 0 8px #fbbf24; ${LPHONE}{ width:6px;height:6px; }`;

const VersusRow = styled.div`
  display:flex; align-items:center; gap:20px; width:100%; justify-content:center;
  ${L1024} { gap: 12px; }
  ${LPHONE} { gap: 8px; }
`;
const PosVS = styled.div`font-size:14px;font-weight:900;color:rgba(255,255,255,0.2); ${LPHONE}{ font-size:12px; }`;
const PosLabel = styled.div<{ $isMe: boolean }>`
  font-size:14px; font-weight:800;
  color:${p => p.$isMe ? '#4ade80' : '#f87171'};
  text-shadow:0 0 10px ${p => p.$isMe ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'};
  ${L1024} { font-size: 13px; }
  ${LPHONE} { font-size: 11px; }
`;
// [FIX-3] 타이머 — 모든 화면 크기에서 항상 보임 (PhasePill 대체 + 보완)
const CountdownBadge = styled.div`
  display: flex; align-items: center; gap: 6px;
  background: rgba(251,191,36,0.15);
  border: 1.5px solid rgba(251,191,36,0.5);
  border-radius: 20px; padding: 4px 14px;
  font-size: 15px; font-weight: 900; color: #fbbf24;
  letter-spacing: 1px;
  text-shadow: 0 0 12px rgba(251,191,36,0.5);
  &::before { content: '⏱'; margin-right: 2px; }
  ${L1024} { font-size: 13px; padding: 3px 10px; }
  ${LPHONE} { font-size: 10px; padding: 2px 8px; border-radius: 14px; }
`;

const MainGrid = styled.div`
  display:flex; flex:1; gap:24px; justify-content:center; align-items:stretch; min-height:0;
  ${L1024} { gap: 6px; }
  ${LPHONE} { gap: 4px; }
`;

// [FIX] 사이드바: 모든 화면에서 표시. L1024/LPHONE에서 너비만 축소
const LeftSidebar  = styled.div`
  width: 260px; display:flex; flex-direction:column; gap:20px; min-height:0;
  ${L1024} { width: 150px; gap: 10px; }
  ${LPHONE} { width: 110px; gap: 6px; }
`;
const RightSidebar = styled.div`
  width: 260px; display:flex; flex-direction:column; gap:20px; min-height:0;
  ${L1024} { width: 150px; gap: 10px; }
  ${LPHONE} { width: 110px; gap: 6px; }
`;

// [FIX-2] CenterArea: 보드가 항상 정사각형으로 보이도록 overflow:visible (scale은 JS로 처리)
const CenterArea = styled.div`
  display: flex; flex-direction: column; align-items: center;
  flex: 1; min-width: 0; min-height: 0; overflow: visible;
`;

const PanelTitle = styled.div`
  font-size:11px;font-weight:800;color:rgba(255,255,255,0.5);margin-bottom:12px;
  text-transform:uppercase;letter-spacing:1.5px;padding-left:4px;
  ${L1024} { font-size: 9px; margin-bottom: 6px; letter-spacing: 0.5px; }
  ${LPHONE} { font-size: 8px; margin-bottom: 3px; letter-spacing: 0.3px; padding-left: 2px; }
`;

const BenchArea = styled.div`
  flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
  border-radius:16px;padding:16px;display:flex;flex-direction:column;min-height:0;
  ${L1024} { padding: 8px; border-radius: 10px; }
  ${LPHONE} { padding: 6px; border-radius: 8px; }
`;
const BenchGrid = styled.div`
  flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding-right:4px;
  ${L1024} { gap: 5px; }
  ${LPHONE} { gap: 3px; padding-right: 2px; }
`;

const TowerCard = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  background: ${p => p.$selected ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)'};
  border: 1.5px solid ${p => p.$selected ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.08)'};
  gap: 12px;
  cursor: pointer;
  transition: background 0.2s;
  ${p => p.$selected ? css`animation: ${benchPulse} 1s ease infinite;` : ''}
  @media (hover: hover) { &:hover { background: rgba(255,255,255,0.08); } }
  ${L1024} { padding: 5px 7px; gap: 6px; border-radius: 8px; }
  /* LPHONE: 데스크탑과 동일한 가로 배치 유지, 크기만 축소 */
  ${LPHONE} { padding: 4px 5px; gap: 4px; border-radius: 6px; }
`;
const CardSprite = styled.img`
  width:36px;height:36px;image-rendering:pixelated;
  ${L1024} { width: 28px; height: 28px; }
  ${LPHONE} { width: 24px; height: 24px; }
`;
const CardFallback = styled.div`
  width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,0.05);border-radius:8px;font-size:10px;font-weight:800;color:rgba(255,255,255,0.4);
  ${L1024} { width: 28px; height: 28px; font-size: 8px; }
  ${LPHONE} { width: 24px; height: 24px; font-size: 7px; }
`;
// 이름/레벨: 모든 화면에서 표시 (데스크탑과 동일한 구조 유지)
const CardInfo = styled.div`flex:1;min-width:0;`;
const CardNameRow = styled.div`display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px; ${L1024}{ margin-bottom: 2px; } ${LPHONE}{ margin-bottom: 1px; }`;
const CardName = styled.div`
  font-size:12px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  ${L1024} { font-size: 10px; }
  ${LPHONE} { font-size: 9px; }
`;
const CardLevel = styled.div`
  font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;flex-shrink:0;margin-left:4px;
  ${L1024} { font-size: 8px; }
  ${LPHONE} { font-size: 7px; margin-left: 2px; }
`;
const CardTypes = styled.div`display:flex;gap:4px; ${L1024}{ gap: 2px; } ${LPHONE}{ display: none; }`;
// CardNameSmall: 더 이상 폰에서 사용하지 않음 (CardInfo 표시로 대체)
const CardNameSmall = styled.div`display: none;`;
const CardLevelSmall = styled.span`font-size: 6px; color: rgba(255,255,255,0.4); font-weight: 600;`;

const OpponentInfoPanel = styled.div`
  flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
  border-radius:16px;padding:16px;display:flex;flex-direction:column;min-height:0;
  ${L1024} { padding: 8px; border-radius: 10px; }
  ${LPHONE} { padding: 6px; border-radius: 8px; }
`;
const Board = styled.div<{ $isPrep: boolean }>`position:relative;width:${COLS * CELL}px;height:${ROWS * CELL}px;background:rgba(15,25,45,0.05);border:4px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,0.6);flex-shrink:0;&::before{content:'';position:absolute;inset:0;background-image:url('/images/maps/battle_field.png');background-size:cover;background-position:center;opacity:0.60;pointer-events:none;z-index:0;}`;
const Cell = styled.div<{ $col: number; $row: number; $isMy: boolean; $isTarget: boolean }>`position:absolute;left:${p => p.$col * CELL}px;top:${p => p.$row * CELL}px;width:${CELL}px;height:${CELL}px;border:1px solid rgba(255,255,255,0.03);background:${p => p.$isTarget ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.01)'};@media (hover: hover){&:hover{background:${p => p.$isTarget ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.03)'};}}`;
const ZoneLbl = styled.div`position:absolute;font-size:10px;font-weight:800;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:1px;pointer-events:none;z-index:3;`;
const UnitWrap = styled.div<{ $team: 'my' | 'opp'; $fainted: boolean; $hit: boolean; $atk: boolean; $sel: boolean }>`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: ${p => p.$sel ? 20 : 10};
  opacity: ${p => p.$fainted ? 0.25 : 1};
  ${p => (!p.$hit && !p.$atk) ? css`transition: left ${TICK_MS}ms linear, top ${TICK_MS}ms linear;` : ''}
  ${p => p.$hit ? css`animation: ${hitFlash} 0.35s ease;` : p.$atk ? css`animation: ${atkBounce} 0.3s ease;` : ''}
  ${p => p.$sel ? 'filter: drop-shadow(0 0 12px #4ade80);' : ''}
`;

const HpBg = styled.div`width:90%;height:4px;border-radius:2px;background:rgba(0,0,0,0.6);overflow:hidden;margin-bottom:2px;`;
const HpFill = styled.div`height:100%;border-radius:2px;transition:width 0.2s cubic-bezier(0.4, 0, 0.2, 1);`;
const Sprite = styled.img<{ $fainted: boolean; $flip: boolean }>`width:60px;height:60px;image-rendering:pixelated;${p => p.$fainted && 'filter:grayscale(1) brightness(0.5);'}${p => p.$flip && 'transform:scaleX(-1);'}`;
const Fallback = styled.div<{ $team: 'my' | 'opp' }>`width:60px;height:60px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:12px;font-weight:800;background:${p => p.$team === 'my' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'};color:${p => p.$team === 'my' ? '#4ade80' : '#f87171'};`;
const UnitName = styled.div`font-size:9px;color:rgba(255,255,255,0.6);font-weight:700;margin-top:2px;text-shadow:0 1px 2px rgba(0,0,0,0.8);`;
const FloatEl = styled.div`position:absolute;z-index:50;font-size:18px;font-weight:900;pointer-events:none;animation:${floatUp} 1s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;transform:translateX(-50%);text-shadow:0 2px 8px rgba(0,0,0,0.9);`;

const EmptyMsg = styled.div`padding:30px;text-align:center;color:rgba(255,255,255,0.15);font-size:11px;font-weight:600;font-style:italic; ${LPHONE}{ padding:12px 6px;font-size:9px; }`;
const Hint = styled.div`margin-top:12px;font-size:9px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.5;padding:0 8px; ${LPHONE}{ font-size:8px;margin-top:6px;padding:0 4px; }`;

const RevealOverlay = styled.div`position:absolute;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);`;
const RevealText = styled.div`color:#fbbf24;font-size:40px;font-weight:900;text-shadow:0 0 30px rgba(251,191,36,0.5);animation:${revealPulse} 1s infinite;${LPHONE}{font-size:28px;}`;

const TypeBadge = styled.span<{ $type?: string }>`font-size:8px;padding:2px 5px;border-radius:4px;background:${p => getTypeColor(p.$type)};color:#fff;font-weight:900;text-transform:uppercase; ${LPHONE}{ font-size:7px;padding:1px 3px;border-radius:3px; }`;

function getTypeColor(type?: string) {
  const colors: Record<string, string> = {
    fire: '#ef4444', water: '#3b82f6', grass: '#22c55e', electric: '#eab308', ice: '#6ee7b7', fighting: '#f97316',
    poison: '#a855f7', ground: '#78350f', flying: '#818cf8', psychic: '#ec4899', bug: '#84cc16', rock: '#71717a',
    ghost: '#6366f1', dragon: '#4f46e5', dark: '#1f2937', steel: '#94a3b8', fairy: '#f472b6', normal: '#9ca3af'
  };
  return colors[type?.toLowerCase() || ''] || 'rgba(255,255,255,0.1)';
}

// 최초 달성: 2.5s 슬라이드인→유지→페이드아웃 (작고 빠름)
const achSlideIn = keyframes`0%{opacity:0;transform:translateX(40px);}12%{opacity:1;transform:translateX(0);}72%{opacity:1;transform:translateX(0);}100%{opacity:0;transform:translateX(20px);}`;
// 반복 달성: 1.5s 빠른 페이드
const achSlideInRepeat = keyframes`0%{opacity:0;transform:translateX(16px);}12%{opacity:0.6;transform:translateX(0);}72%{opacity:0.6;}100%{opacity:0;}`;

const AchievementToastPill = styled.div<{ $color: string; $first: boolean }>`
  position: absolute; top: 10px; right: 10px; z-index: 1002;
  display: flex; align-items: center; gap: 6px;
  padding: ${p => p.$first ? '7px 14px' : '5px 11px'};
  border-radius: 20px;
  background: rgba(55,55,70,0.92);
  border: 1px solid ${p => p.$color}${p => p.$first ? '99' : '55'};
  font-size: ${p => p.$first ? '12px' : '11px'};
  font-weight: 700;
  color: rgba(255,255,255,${p => p.$first ? '0.92' : '0.65'});
  animation: ${p => p.$first ? achSlideIn : achSlideInRepeat} ${p => p.$first ? '2.5s' : '1.5s'} ease forwards;
  pointer-events: none;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.5);
`;

const AchPillName = styled.span<{ $first: boolean }>`color:rgba(255,255,255,${p => p.$first ? '0.88' : '0.55'});overflow:hidden;text-overflow:ellipsis;`;
const AchPillAP = styled.span<{ $color: string }>`color:${p => p.$color};font-size:10px;font-weight:700;flex-shrink:0;opacity:0.85;`;