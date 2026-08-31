// src/components/game/GameLayout.tsx
// ──────────────────────────────────────────────────────────────────
// V9 — 3-Pane DS-Style Redesign
//
// [V9-1] 3열 레이아웃: 좌측(시너지+HUD) | 중앙(맵) | 우측(상점+버튼)
// [V9-2] SynergyTracker와 Shop을 embedded 모드로 패널에 내장
// [V9-3] HUD 정보(골드·목숨·웨이브·포켓몬수)를 좌측 패널에 표시
// [V9-4] 액션 버튼 2×2 DS 스타일 + ☰ 햄버거 / ⚙️ 설정 분리
// [V9-5] 모바일·태블릿 세로화면: 회전 안내 오버레이
// [V9-6] V6 멀티플레이어 로직 전체 보존 (BUG-FIX 적용)
// [V9-7] 멀티 페이즈 정보를 좌측 HUD 영역에 표시
//
// ──── BUG-FIX 목록 (v1.23 → fixed) ──────────────────────────────
// [BUG-1] lastPhase를 let 변수(컴포넌트 레벨)로 선언해 리렌더링마다
//         null 초기화 → useRef로 변경
// [BUG-2] Firebase isAlive 감지 시 p.uid 사용 (실제 필드 p.userId) → 수정
// [BUG-3] AI 호스트 판정 시 (state as any).room 접근 → undefined
//         → multiplayerService.getRoom() 비동기 호출로 복원
// [BUG-4] 로컬 money/lives/wave/towers → Firebase 동기화 누락 → 복원
// [BUG-5] 웨이브 완료 감지 → markWaveCompleted() 호출 누락 → 복원
// [BUG-6] lives <= 0 → playerDefeated() 호출 누락 → 복원
// [BUG-7] 게임 종료 감지를 state.status 로 체크(해당 필드 없음)
//         → onGameStateUpdate + alivePlayers.length 방식으로 복원
// ──────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled, { keyframes, css } from "styled-components";
import { useTranslation } from "../../i18n";
import { GameCanvas } from "./GameCanvas";
import { PokemonPicker } from "../ui/PokemonPicker";
import { PokemonManager } from "../ui/PokemonManager";
import { Shop } from "../ui/Shop";
import { SynergyTracker } from "../ui/SynergyTracker";
import { SynergyDetails } from "../ui/SynergyDetails";

import { AchievementsPanel } from "../modals/Achievements";
import { HallOfFame } from "../modals/HallOfFame";
import { Rankings } from "../modals/Rankings";
import { Settings } from "../modals/Settings";
import { useGameStore } from "../../store/gameStore";
import { facilityTilesOfMap } from "../../utils/facility.utils";
import { shopTier } from "../../data/heldItems";
import { WaveSystem } from "../../game/WaveSystem";
import { multiplayerService } from "../../services/MultiplayerService";
import { MultiplayerView } from "../multiplayer/MultiplayerView";
import { MultiplayerGameOverModal } from "../multiplayer/MultiplayerGameOverModal";
import { BattlePhaseUI } from "../multiplayer/BattlePhaseUI";
import { SkillPicker } from "../modals/SkillPicker";
import { WaveEndPicker } from "../modals/WaveEndPicker";
import { Wave50ClearModal } from "../modals/Wave50ClearModal";
import { StoryEnding } from "../story/StoryEnding";
import { BossCutIn } from "./BossCutIn";
import { storyProgressService } from "../../services/StoryProgressService";
import { achievementService } from "../../services/AchievementService";
import { AEGIS_STORY_CHAPTERS } from "../../data/storyChapters";
import { EvolutionConfirmModal } from "../modals/EvolutionConfirmModal";
import { WorkMilestoneModal } from "../modals/WorkMilestoneModal";

import { authService } from "../../services/AuthService";
import { PlayerGameState, GamePhase } from "../../types/multiplayer";
import { aiPlayerManager } from "../../services/AIPlayer";
import { buildTowerDetails } from "../../game/towerFactory";
import { fromWireAbility } from "../../utils/abilities";
import { lMedia } from "../../utils/responsive.utils";
import { C, FONT, SP, SCALE, ICON } from "../../styles/tokens";
import { win, btn, btnThin, sunken, crisp, pixelText, pixelBold, cursorMark, cursorOn, CURSOR_GUTTER, shadowLg, focusRing, type BtnColor } from "../../styles/pixel";
import { Emoji } from "../shared/Emoji";
import { showToast } from "../shared/Toast";
import { Store, Award } from "lucide-react";

interface GameLayoutProps {
  onLeaveGame: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const getPhaseText = (
  phase: GamePhase,
  round: number,
  countdown: number | null,
  t: (k: string, o?: any) => string
): string => {
  switch (phase) {
    case "loading":       return t("multiplayer.phase.loading");
    case "shopping":      return t("multiplayer.phase.shopping");
    case "waiting_wave":
      return round === 0
        ? t("multiplayer.phase.waitingWaveStart", { countdown: countdown ?? 0 })
        : t("multiplayer.phase.waitingWaveNext",  { countdown: countdown ?? 0 });
    case "wave":          return t("multiplayer.phase.wave",          { round });
    case "waiting_battle":return t("multiplayer.phase.waitingBattle", { countdown: countdown ?? 0 });
    case "battle":        return t("multiplayer.phase.battle");
    default:              return "";
  }
};

const phaseEmoji = (phase: GamePhase) => {
  switch (phase) {
    case "shopping":       return "🛒";
    case "wave":           return "🌊";
    case "battle":         return "⚔️";
    case "waiting_wave":
    case "waiting_battle": return "⏳";
    default:               return "🔄";
  }
};

// ── Tower detail builder ──────────────────────────────────────────
// [SIM-EXTRACT] src/game/towerFactory.ts로 이동(동작 동일) — 시뮬 하네스와 공유.

// ── Component ─────────────────────────────────────────────────────

export const GameLayout: React.FC<GameLayoutProps> = ({ onLeaveGame }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state ?? {}) as {
    mode?: string;
    chapterId?: string;
    chapterNumber?: number;
    totalWaves?: number;
    heroPool?: number[];
    enemyTypes?: string[];
    bossWave?: number;
    bossName?: string;
  };
  const isStoryMode = locationState.mode === 'story';
  const storyChapterId = locationState.chapterId ?? null;
  const storyChapterNumber = locationState.chapterNumber ?? null;
  const storyTotalWaves = locationState.totalWaves ?? null;

  // ─── 스토리 모드 누적 heroPool: 현재 챕터 + 이전에 클리어한 챕터 heroPool 합산 ──
  // 이전 챕터는 실제로 클리어한 챕터만 포함하고, 현재 챕터는 항상 포함
  const storyAccumulatedPool = useMemo<number[] | null>(() => {
    if (!isStoryMode || storyChapterNumber === null) return null;
    const pool = new Set<number>();
    const progress = storyProgressService.getProgress();
    for (const ch of AEGIS_STORY_CHAPTERS) {
      if (ch.chapterNumber === storyChapterNumber) {
        // 현재 플레이 중인 챕터 → 항상 포함
        ch.heroPool.forEach(id => pool.add(id));
      } else if (ch.chapterNumber < storyChapterNumber) {
        // 이전 챕터 → 클리어한 경우에만 포함
        const cleared = progress.chapterProgress[ch.id]?.cleared ?? false;
        if (cleared) {
          ch.heroPool.forEach(id => pool.add(id));
        }
      }
    }
    return Array.from(pool);
  // storyProgressService는 모듈 싱글톤으로 참조가 불변 → deps 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoryMode, storyChapterNumber]);
  const { t } = useTranslation();

  // ── UI state ─────────────────────────────────────────────────
  const [showPicker,        setShowPicker]        = useState(false);
  const [showPokemonManager,setShowPokemonManager] = useState(false);
  const [showAchievements,  setShowAchievements]  = useState(false);
  const [showHallOfFame,    setShowHallOfFame]    = useState(false);
  const [showRankings,      setShowRankings]      = useState(false);
  const [showMultiView,     setShowMultiView]     = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [showSettings,      setShowSettings]      = useState(false);
  const [showHamMenu,       setShowHamMenu]       = useState(false);
  const [finalPlayers,      setFinalPlayers]      = useState<PlayerGameState[]>([]);

  // ── Multiplayer ───────────────────────────────────────────────
  const multiRoomId   = multiplayerService.getCurrentRoomId();
  const isMultiplayer = !!multiRoomId;
  const user          = authService.getCurrentUser();

  const [multiPhase,    setMultiPhase]    = useState<GamePhase>("waiting_wave");
  const [multiRound,    setMultiRound]    = useState(0);
  const [multiCountdown,setMultiCountdown] = useState<number | null>(null);
  const [phaseEndTime,  setPhaseEndTime]  = useState<number | null>(null);
  const [multiLoading,  setMultiLoading]  = useState(isMultiplayer);

  const [battleResultToast, setBattleResultToast] = useState<{
    won: boolean; goldDelta: number; livesDelta: number; round: number;
  } | null>(null);

  // ── Game store ────────────────────────────────────────────────
  const {
    money, lives, wave, isWaveActive, towers, gameSpeed,
    timeOfDay, gameTime, skillChoiceQueue, waveEndItemPick, wave50Clear, storyClear, gameOver,
    nextWave, spendMoney, currentMap, evolutionConfirmQueue, clerkOrScoutPromptQueue,
  } = useGameStore(s => ({
    money:          s.money,
    currentMap:     s.currentMap,
    lives:          s.lives,
    wave:           s.wave,
    isWaveActive:   s.isWaveActive,
    towers:         s.towers,
    gameSpeed:      s.gameSpeed,
    timeOfDay:      s.timeOfDay,
    gameTime:       s.gameTime,
    skillChoiceQueue: s.skillChoiceQueue,
    waveEndItemPick:  s.waveEndItemPick,
    wave50Clear:      s.wave50Clear,
    storyClear:        s.storyClear,
    gameOver:         s.gameOver,
    nextWave:         s.nextWave,
    spendMoney:       s.spendMoney,
    evolutionConfirmQueue: s.evolutionConfirmQueue || [],
    clerkOrScoutPromptQueue: s.clerkOrScoutPromptQueue || [],
  }));
  const setSpeed = useGameStore(s => s.setGameSpeed);
  const setManageTowerId = useGameStore(s => s.setManageTowerId);

  // ── Pulse cues ────────────────────────────────────────────────
  const pulseWave    = !isWaveActive && wave >= 0 && !gameOver;
  const pulsePokemon = towers.length === 0 && !isWaveActive;

  // 시설(프렌들리숍·콘테스트 홀) 등급 — 해당 타일에 올라간 알바 포켓몬의 근무 누적 웨이브 기준
  const facility = facilityTilesOfMap(currentMap);
  const facilityOccupant = (tiles: { x: number; y: number }[]) => {
    const tw = tiles.length
      ? towers.find(t => tiles.some(s => s.x === Math.floor(t.position.x / 64) && s.y === Math.floor(t.position.y / 64)))
      : undefined;
    return tw ? { id: tw.id, tier: shopTier(tw.shopWavesHeld ?? 0) } : null;
  };
  const shopOcc    = facilityOccupant(facility.shopTiles);
  const contestOcc = facilityOccupant(facility.contestTiles);

  // ── Refs ──────────────────────────────────────────────────────
  const lastAppliedRoundRef    = useRef<number>(-1);
  const lastAppliedByeRoundRef = useRef<number>(-1);
  const loadingReportedRef     = useRef(false);
  const syncReadyRef           = useRef(false);
  const initializedRef         = useRef(false);
  const defeatedRef            = useRef(false);
  // [BUG-1 FIX] lastPhase를 useRef로 관리 (컴포넌트 레벨 let → 리렌더링마다 null 초기화 방지)
  const lastPhaseRef           = useRef<GamePhase | null>(null);
  // [C4-FIX] 상대별 '연속 오프라인 시작 시각' 기록(연결끊김 몰수 워치독용)
  const presenceOfflineSinceRef = useRef<Record<string, number>>({});
  // [REWARD-LEDGER] 서버 누적 원장 중 내가 로컬에 이미 반영한 몫.
  //   서버의 rewardLedger 와의 차이만 적용하므로, 결과 도착 순간 접속이 끊겨 있었어도
  //   복귀 시 정확히 한 번 정산된다(라운드 목록이 잘려도 무관 — 누적합이라서).
  const appliedRewardRef  = useRef<{ gold: number; lives: number }>({ gold: 0, lives: 0 });
  //   정산 중에는 일반 동기화가 끼어들면 안 된다: lives/money 와 appliedReward 가
  //   서로 다른 트랜잭션으로 갈라져 올라가면 이중 적용/미적용이 생긴다.
  const applyingRewardRef = useRef(false);

  // ─────────────────────────────────────────────────────────────
  // Effects — V6/V8 멀티플레이어 로직 전체 보존 + BUG-FIX
  // ─────────────────────────────────────────────────────────────

  // ─── [FREE-TIER] RTDB 연결 참조 확보/반납 ──────────────────────
  //   로비를 거치지 않고(게임 중 새로고침) 바로 이 화면으로 복귀하는 경로가 있어,
  //   여기서도 초기화해야 serverTimeOffset이 잡히고 페이즈 타이머가 어긋나지 않는다.
  //   화면을 떠날 때 참조를 반납하면 마지막 참조가 사라지는 시점에 동시 연결 슬롯이 회수된다.
  useEffect(() => {
    if (!isMultiplayer) return;
    multiplayerService.initForMultiplayer();
    return () => { multiplayerService.teardownMultiplayer(); };
  }, [isMultiplayer]);

  // ─── 로딩 완료 리포트 ──────────────────────────────────────────
  useEffect(() => {
    if (!isMultiplayer || !multiRoomId || !user || loadingReportedRef.current) return;
    // [LEAK-FIX] RTDB onValue는 로컬 캐시가 있으면 콜백을 '동기'로 한 번 발화한다.
    //   그때는 아직 unsub 변수가 초기화되기 전이라 콜백 안에서 직접 부르면 TDZ ReferenceError다.
    //   해제 요청을 플래그로 받아 두고, 구독이 반환된 뒤에 실제로 끊는다.
    let unsub: (() => void) | null = null;
    let unsubRequested = false;
    const stop = () => { if (unsub) unsub(); else unsubRequested = true; };

    unsub = multiplayerService.onGameStateUpdateWithPhase(multiRoomId, state => {
      if (!state || loadingReportedRef.current) return;
      loadingReportedRef.current = true;
      if (state.currentPhase !== "loading") { setMultiLoading(false); stop(); return; }
      multiplayerService.markPlayerLoaded(multiRoomId, user.uid)
        .then(ok => { if (ok) stop(); else loadingReportedRef.current = false; })
        .catch(() => { loadingReportedRef.current = false; });
    });
    if (unsubRequested) unsub();

    return () => { unsub?.(); };
  }, [isMultiplayer, multiRoomId, user]);

  // ─── [C1-FIX] 로딩 워치독 ──────────────────────────────────────
  //   크래시한 플레이어 때문에 로딩이 끝나지 않는 경우, 40초 후 강제로 웨이브 준비 페이즈로 전환.
  //   markPlayerLoaded의 alive 필터로 대부분 해결되지만, leaveRoom 없이 탭을 닫은 경우 대비.
  useEffect(() => {
    if (!isMultiplayer || !multiRoomId || !multiLoading) return;
    const id = setTimeout(() => {
      multiplayerService.forceStartFromLoading(multiRoomId).catch(() => {});
    }, 40000);
    return () => clearTimeout(id);
  }, [isMultiplayer, multiRoomId, multiLoading]);

  // ─── 페이즈 구독 (웨이브·배틀 전환, AI 시작, Bye 보너스 등) ─────
  useEffect(() => {
    if (!multiRoomId) return;
    let aiStarted = false;

    const unsub = multiplayerService.onGameStateUpdateWithPhase(multiRoomId, state => {
      if (!state) return;
      const currentPhase = state.currentPhase as GamePhase;
      const currentRound = state.currentRound as number;

      setMultiPhase(currentPhase);
      setMultiRound(currentRound);
      setPhaseEndTime(state.phaseEndTime ?? null);
      if (currentPhase !== "loading") setMultiLoading(false);

      // [BUG-1 FIX] lastPhaseRef.current 사용
      const lastPhase = lastPhaseRef.current;

      // AI 호스트 판정 — [BUG-3 FIX] getRoom() 비동기 호출로 복원
      if (lastPhase === null && !aiStarted) {
        aiStarted = true;
        const startAIs = async () => {
          const room        = await multiplayerService.getRoom(multiRoomId);
          const currentUser = authService.getCurrentUser();
          // 호스트 여부: alive 인간 플레이어 userId 사전순 첫 번째
          const aliveHumans = state.players
            .filter(p => p.isAlive && !p.userId.startsWith("ai_"))
            .sort((a, b) => a.userId.localeCompare(b.userId));
          const aiHostPlayer = aliveHumans[0] ?? state.players[0];
          const iAmAIHost    = currentUser && aiHostPlayer?.userId === currentUser.uid;
          if (room && iAmAIHost) {
            for (const p of room.players) {
              if (p.isAI && p.aiDifficulty) {
                aiPlayerManager.startAI(room.id, p.userId, p.aiDifficulty, room.mapId);
              }
            }
          }
        };
        startAIs().catch(console.error);
      }

      // 웨이브 페이즈 전환
      if (currentPhase === "wave" && lastPhase !== "wave") {
        if (defeatedRef.current) { lastPhaseRef.current = currentPhase; return; }
        // [NEW-4 FIX] 새 웨이브 시작 시 미선택 아이템 보상 UI 강제 클리어
        useGameStore.setState({ waveEndItemPick: null });
        const gs = useGameStore.getState();
        if (!gs.isWaveActive) {
          useGameStore.setState({ wave: currentRound, isWaveActive: true, isPaused: false });
          WaveSystem.getInstance().startWave(currentRound);
        }
      }

      // 재접속: wave 페이즈 도중 처음 연결
      if (currentPhase === "wave" && lastPhase === null && currentRound > 0) {
        if (!defeatedRef.current) {
          const gs = useGameStore.getState();
          if (!gs.isWaveActive) {
            useGameStore.setState({ wave: currentRound, isWaveActive: true, isPaused: false });
            WaveSystem.getInstance().startWave(currentRound);
          }
        }
      }

      // [NEW-4 FIX] battle 페이즈 진입 시 미선택 아이템 보상 UI 강제 클리어
      if (currentPhase === "battle" && lastPhase !== "battle") {
        useGameStore.setState({ waveEndItemPick: null });
      }

      // [V6-FIX-GL-5] Bye 보너스 로컬 적용
      if (
        (currentPhase === "battle" || currentPhase === "waiting_battle") &&
        state.roundMatchups?.skipPlayerId === user?.uid &&
        lastAppliedByeRoundRef.current < currentRound
      ) {
        lastAppliedByeRoundRef.current = currentRound;
        if (lastPhase !== null) {
          useGameStore.getState().addMoney(50);
          setBattleResultToast({ won: true, goldDelta: 50, livesDelta: 0, round: currentRound });
          setTimeout(() => setBattleResultToast(null), 4000);
        }
      }

      // [BUG-1 FIX] lastPhaseRef 업데이트
      lastPhaseRef.current = currentPhase;
    });
    return unsub;
  }, [multiRoomId, user]);

  // ─── 카운트다운 타이머 ──────────────────────────────────────────
  useEffect(() => {
    if (!phaseEndTime) { setMultiCountdown(null); return; }
    const tick = () =>
      setMultiCountdown(Math.max(0, Math.round((phaseEndTime - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phaseEndTime]);

  // ─── 멀티플레이어 초기화 + 재접속 상태 복원 ──────────────────────
  useEffect(() => {
    if (isMultiplayer && !initializedRef.current) {
      initializedRef.current = true;
      (async () => {
        if (!multiRoomId || !user) {
          useGameStore.setState({ lives: 50, money: 500, gameSpeed: 3 });
          syncReadyRef.current = true;
          return;
        }
        try {
          const restored = await multiplayerService.getPlayerStateForRejoin(multiRoomId, user.uid);
          // [M4-FIX] wave>0 조건 제거 — 라운드 0(첫 준비) 중 새로고침 시에도 서버가 가진
          //   실제 골드/타워를 복원해야 함. 예전엔 wave가 아직 0이라 로컬만 500G로 리셋되고
          //   동기화 루프가 그 500을 다시 밀어올려 골드가 되돌아가는 버그가 있었음.
          if (restored) {
            console.log("[GameLayout] Restoring state from Firebase:", {
              lives: restored.lives, money: restored.money, wave: restored.wave,
              towers: restored.towerDetails?.length, isAlive: restored.isAlive,
            });
            // [REWARD-LEDGER] 끊겨 있는 동안 확정된 PvP 보상 정산.
            //   서버 원장 - 내가 반영한 누적 = 못 받은 몫. 배틀 페이즈에 끊겨 있었다면
            //   여기서 패배 페널티가 뒤늦게(그러나 정확히 한 번) 들어온다.
            const pendGold  = restored.rewardLedger.gold  - restored.appliedReward.gold;
            const pendLives = restored.rewardLedger.lives - restored.appliedReward.lives;

            useGameStore.setState({
              lives: Math.max(0, restored.lives + pendLives),
              money: restored.money + pendGold,
              wave:  restored.wave,
              gameSpeed: 3,
              isWaveActive: false,
              isPaused: false,
            });
            appliedRewardRef.current = {
              gold:  restored.rewardLedger.gold,
              lives: restored.rewardLedger.lives,
            };
            // [V5-FIX-GL-4] 재접속 시 이미 처리된 라운드 보상은 재적용 방지
            //   (라운드 마커는 이제 **토스트 전용**이다 — 금액 적용은 위 원장이 담당한다)
            lastAppliedRoundRef.current    = restored.currentRound;
            lastAppliedByeRoundRef.current = restored.currentRound;

            if (pendGold !== 0 || pendLives !== 0) {
              console.log(`[GameLayout] 미적용 PvP 보상 정산: gold ${pendGold}, lives ${pendLives}`);
              const s = useGameStore.getState();
              // lives/money 와 appliedReward 를 한 트랜잭션으로. syncReadyRef 가 아직 false 라
              // 스토어 구독이 끼어들지 않으므로 이 쓰기 하나로 원자성이 보장된다.
              await multiplayerService.updatePlayerState(multiRoomId, user.uid, {
                lives: s.lives, money: s.money,
                appliedReward: { ...appliedRewardRef.current },
              });
              await multiplayerService.flushPlayerState(multiRoomId, user.uid);
            }

            if (restored.towerDetails?.length) {
              const restoredTowers = restored.towerDetails.map((td: any, idx: number) => ({
                id: `restored-${idx}-${Date.now()}`,
                pokemonId:      td.pokemonId,
                displayName:    td.name,
                name:           td.name,
                level:          td.level,
                experience:     0,
                sprite:         td.sprite,
                position:       td.position,
                currentHp:      td.currentHp,
                maxHp:          td.maxHp,
                isFainted:      td.isFainted,
                attack:         td.attack   ?? td.level * 10,
                baseAttack:     td.attack   ?? td.level * 10,
                defense:        td.defense  ?? td.level * 5,
                specialAttack:  td.specialAttack  ?? td.level * 8,
                specialDefense: td.specialDefense ?? td.level * 5,
                speed:          td.speed ?? 50,
                types:          td.types ?? ["normal"],
                range:          3,
                equippedMoves:  (td.equippedMoves ?? []).map((m: any) => ({
                  ...m, currentCooldown: m.currentCooldown ?? 0,
                })),
                rejectedMoves:  [],
                sellValue:      td.level * 20,
                kills:          0,
                damageDealt:    0,
                // [REJOIN-FIX] 예전엔 무조건 "" 였다. 복원 직후 lifesteal/aoeBonus 값 자체는
                //   살아 있어도, 다음 업로드에서 buildTowerDetails 가 ability 로 파생값을
                //   재계산하므로 흡혈 0.15 → 0, 크리 ×2 → 기본으로 리셋됐다.
                //   = 새로고침 한 번이면 그 게임 내내 특성 없는 팀. (sim:2p:wire 가 감시)
                ability:        fromWireAbility(td.ability) ?? "",
                lifesteal:      td.lifesteal ?? 0,
                aoeBonus:       td.aoeBonus  ?? 0,
                statusEffect:   undefined,
                gender:         "unknown",
                targetEnemyId:  null,
              } as any));

              useGameStore.setState({ towers: restoredTowers });
              console.log(`[GameLayout] Restored ${restoredTowers.length} towers from Firebase`);

              const restoredDetails = buildTowerDetails(restored.towerDetails);
              await multiplayerService.flushTowerUpdate(multiRoomId, user.uid, restoredDetails);
              console.log(`[GameLayout] Re-uploaded ${restoredDetails.length} towers after rejoin`);
            }

            if (!restored.isAlive) {
              defeatedRef.current = true;
            }
          } else {
            // 신규 게임
            useGameStore.setState({ lives: 50, money: 500, gameSpeed: 3 });
          }
        } catch (err) {
          console.error("[GameLayout] State restoration failed, using defaults:", err);
          useGameStore.setState({ lives: 50, money: 500, gameSpeed: 3 });
        }
        syncReadyRef.current = true;
      })();
    } else if (!isMultiplayer) {
      syncReadyRef.current = true;
    }
  }, [isMultiplayer]);

  // ─── [V6-FIX-GL-1] 로컬 → Firebase 상태 동기화 ───────────────────
  // [BUG-4 FIX] v1.23에서 통째로 누락된 useGameStore.subscribe 복원
  //   로컬 gameStore가 money/lives의 '주인'.
  //   포켓몬 구매/판매/아이템 사용은 로컬에서 즉시 반영되고 Firebase로 푸시됨.
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (!syncReadyRef.current) return;
      if (defeatedRef.current) return;
      // [REWARD-LEDGER] 정산 중 addMoney/addLives 가 트리거한 중간 상태는 흘리지 않는다.
      //   정산 코드가 끝난 뒤 lives/money/appliedReward 를 한 번에 올린다.
      if (applyingRewardRef.current) return;
      const changed =
        state.wave   !== prevState.wave   ||
        state.lives  !== prevState.lives  ||
        state.money  !== prevState.money  ||
        state.towers.length !== prevState.towers.length;
      if (!changed) return;
      // [C2-FIX] isAlive는 여기서 쓰지 않는다. 예전엔 lives=0 순간 이 동기화가 먼저 isAlive:false를
      //   써버려, 직후 playerDefeated가 'already dead'로 건너뛰어 placement/rankings/ELO가 기록되지 않았음.
      //   사망 확정은 playerDefeated 단일 경로가 담당(순위·레이팅 정상 기록).
      multiplayerService.updatePlayerState(multiRoomId, user.uid, {
        wave:    state.wave,
        lives:   state.lives,
        money:   state.money,
        towers:  state.towers.length,
      });
    });
    return unsubscribe;
  }, [multiRoomId, user]);

  // ─── [V6-FIX-GL-2] Firebase isAlive=false 감지 → 로컬 gameOver 동기화 ─
  // [BUG-2 FIX] p.uid → p.userId (PlayerGameState 필드명 일치)
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const unsubscribe = multiplayerService.onGameStateUpdate(multiRoomId, (players) => {
      const me = players.find(p => p.userId === user.uid);
      if (!me) return;
      // [V8-FIX-1-3] Firebase isAlive=false 감지 시 로컬 gameOver 동기화
      if (!me.isAlive && !defeatedRef.current) {
        defeatedRef.current = true;
        console.log("[GameLayout] Player defeated (from Firebase isAlive=false)");
        useGameStore.setState({ gameOver: true });
      }
    });
    return unsubscribe;
  }, [multiRoomId, user]);

  // ─── 타워 상세 정보 → Firebase 동기화 ─────────────────────────────
  useEffect(() => {
    if (!multiRoomId || !user) return;
    if (towers.length === 0) return;
    const towerDetails = buildTowerDetails(towers);
    multiplayerService.updatePlayerTowerDetails(multiRoomId, user.uid, towerDetails);
  }, [multiRoomId, user, towers]);

  // ─── [BUG-5 FIX] 웨이브 완료 감지 → markWaveCompleted ────────────
  // v1.23에서 통째로 누락된 웨이브 완료 감지 복원
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const wasWaveActiveRef = { current: false };
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (defeatedRef.current) return;
      if (prevState.isWaveActive && !state.isWaveActive && wasWaveActiveRef.current) {
        console.log("[GameLayout] Wave completed, flushing tower data");
        const currentTowers = useGameStore.getState().towers;
        const towerDetails  = buildTowerDetails(currentTowers);
        multiplayerService.flushTowerUpdate(multiRoomId, user.uid, towerDetails)
          .then(() => multiplayerService.markWaveCompleted(multiRoomId, user.uid))
          .catch(err => {
            console.error("[GameLayout] flushTowerUpdate failed:", err);
            multiplayerService.markWaveCompleted(multiRoomId, user.uid);
          });
      }
      wasWaveActiveRef.current = state.isWaveActive;
    });
    return unsubscribe;
  }, [multiRoomId, user]);

  // ─── [BUG-6 FIX] 탈락 처리 — 로컬 lives <= 0 감지 ────────────────
  // v1.23에서 통째로 누락된 playerDefeated 호출 복원
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.lives <= 0 && !defeatedRef.current) {
        defeatedRef.current = true;
        console.log("[GameLayout] Player defeated (from local lives=0)");
        multiplayerService.playerDefeated(multiRoomId, user.uid);
      }
    });
    return unsubscribe;
  }, [multiRoomId, user]);

  // ─── [V6-FIX-GL-3] 배틀 결과 → 로컬에 보상 적용 + 토스트 ──────────
  // [REWARD-LEDGER] 금액은 라운드가 아니라 **서버 누적 원장과의 차이**로 적용한다.
  //   예전엔 `roundNumber === currentRound` 인 순간에만 적용해서, 그 창에 접속이 끊겨
  //   있으면 패배 페널티가 영영 사라졌다(= 지겠다 싶으면 끊는 게 이득). 원장 차이 방식은
  //   창을 놓쳐도 다음 스냅샷에서, 아예 나갔다 와도 재접속 복원에서 정확히 한 번 정산한다.
  //   토스트만 라운드 단위로 남긴다.
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const unsubscribe = multiplayerService.onGameStateUpdateWithPhase(multiRoomId, (state) => {
      if (!state) return;

      // 토스트(표시 전용) — 이번 라운드 내 결과가 처음 보일 때 한 번.
      const myResult = (state.battleResults || []).find(r =>
        r.roundNumber === state.currentRound &&
        r.roundNumber > lastAppliedRoundRef.current &&
        (r.player1Id === user.uid || r.player2Id === user.uid)
      );
      if (myResult) {
        lastAppliedRoundRef.current = myResult.roundNumber;
        const rw = user.uid === myResult.player1Id ? myResult.rewardP1 : myResult.rewardP2;
        if (rw) {
          setBattleResultToast({
            won:        user.uid === myResult.winnerId,
            goldDelta:  rw.gold,
            livesDelta: rw.lives,
            round:      myResult.roundNumber,
          });
          setTimeout(() => setBattleResultToast(null), 5000);
        }
      }

      // 금액 적용 — 복원이 끝나기 전엔 손대지 않는다(restore 가 원장 기준선을 세운다).
      if (!syncReadyRef.current || applyingRewardRef.current) return;
      const me = (state.players || []).find(p => p.userId === user.uid);
      const ledger = me?.rewardLedger;
      if (!ledger) return;
      const dGold  = ledger.gold  - appliedRewardRef.current.gold;
      const dLives = ledger.lives - appliedRewardRef.current.lives;
      if (dGold === 0 && dLives === 0) return;

      applyingRewardRef.current = true;
      try {
        const { addMoney, addLives } = useGameStore.getState();
        if (dGold  !== 0) addMoney(dGold);
        if (dLives !== 0) addLives(dLives);
      } finally {
        applyingRewardRef.current = false;
      }
      appliedRewardRef.current = { gold: ledger.gold, lives: ledger.lives };

      // lives/money 와 마커를 한 번에 올린다. 여기서 갈라지면 이중 적용이 생긴다.
      const s = useGameStore.getState();
      multiplayerService.updatePlayerState(multiRoomId, user.uid, {
        wave: s.wave, lives: s.lives, money: s.money, towers: s.towers.length,
        appliedReward: { ...appliedRewardRef.current },
      })
        .then(() => multiplayerService.flushPlayerState(multiRoomId, user.uid))
        .catch(err => console.warn('[GameLayout] 보상 정산 업로드 실패:', err));
    });
    return unsubscribe;
  }, [multiRoomId, user]);

  // ─── [BUG-7 FIX] 게임 종료 감지 ──────────────────────────────────
  // v1.23: (state as any).status === "finished" → MultiplayerGameState에 해당 필드 없음
  // 수정: onGameStateUpdate + alivePlayers.length <= 1 방식으로 복원 (v1.21 동일)
  useEffect(() => {
    if (!multiRoomId) return;
    const unsubscribe = multiplayerService.onGameStateUpdate(multiRoomId, (players) => {
      const alivePlayers = players.filter(p => p.isAlive);
      if (alivePlayers.length <= 1 && players.length > 1) {
        setFinalPlayers(players);
        setShowGameOverModal(true);
        import("../../services/AIPlayer").then(({ aiPlayerManager }) => aiPlayerManager.stopAll());
      }
    });
    return unsubscribe;
  }, [multiRoomId]);

  // ─── [C4-FIX] 연결끊김 몰수 워치독 ───────────────────────────────
  //   연결이 끊긴(브라우저 종료 등) 인간 플레이어는 isAlive가 true로 얼어붙어, 남은 라이프가
  //   깎이지 않으면 게임이 영영 안 끝나(3h TTL) 승자·ELO도 확정되지 않았음.
  //   생존 클라이언트 중 '심판'(살아있는 인간 userId 사전순 1위)이 프레즌스가 90초 이상 연속
  //   오프라인인 상대를 playerDefeated로 몰수 → 게임 정상 종료. (playerDefeated는 멱등이라 중복 안전)
  //   재접속하면 프레즌스가 다시 online → 카운터 해제되어 오탈락 없음. 90초 유예로 짧은 끊김은 무시.
  useEffect(() => {
    if (!isMultiplayer || !multiRoomId || !user) return;
    const FORFEIT_MS = 90000;
    let players: any[] = [];
    let presence: Record<string, { online: boolean }> = {};

    const evaluate = () => {
      const nowMs = Date.now();
      // 오프라인 시작 시각 유지: 살아있고 오프라인인 인간만 기록, 온라인/사망 시 해제
      for (const p of players) {
        const online = presence[p.userId]?.online;
        if (online === false && p.isAlive && !String(p.userId).startsWith('ai_')) {
          if (!presenceOfflineSinceRef.current[p.userId]) presenceOfflineSinceRef.current[p.userId] = nowMs;
        } else {
          delete presenceOfflineSinceRef.current[p.userId];
        }
      }
      if (defeatedRef.current) return;
      const me = players.find(p => p.userId === user.uid);
      if (!me || !me.isAlive) return; // 내가 죽었으면 심판 안 함
      const aliveHumans = players
        .filter(p => p.isAlive && !String(p.userId).startsWith('ai_'))
        .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
      if (aliveHumans[0]?.userId !== user.uid) return; // 심판만 실행
      for (const p of players) {
        if (!p.isAlive || p.userId === user.uid || String(p.userId).startsWith('ai_')) continue;
        const since = presenceOfflineSinceRef.current[p.userId];
        if (since && nowMs - since >= FORFEIT_MS) {
          console.log(`[GameLayout] Forfeiting long-disconnected player ${p.userId}`);
          multiplayerService.playerDefeated(multiRoomId, p.userId).catch(() => {});
        }
      }
    };

    const unsubP = multiplayerService.onPresenceUpdate(multiRoomId, (pres) => { presence = pres; evaluate(); });
    const unsubG = multiplayerService.onGameStateUpdate(multiRoomId, (pl) => { players = pl; evaluate(); });
    const iv = setInterval(evaluate, 15000);
    return () => { unsubP(); unsubG(); clearInterval(iv); };
  }, [isMultiplayer, multiRoomId, user]);

  // ─── AI 정리 ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { aiPlayerManager.stopAll(); };
  }, [multiRoomId]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleStartWave = () => {
    if (isWaveActive) return;
    nextWave();
    WaveSystem.getInstance().startWave(useGameStore.getState().wave);
  };

  const handleOpenPicker = () => {
    // [STORY-FEE-FIX] 스토리 모드에서 배치 가능한 히어로가 하나도 없으면(전부 배치됨) 20G를 물리지 않는다.
    //   기존엔 20G 내고 '모두 배치됨' 안내만 보게 됐음 → 안내 화면은 무료로 연다.
    if (storyAccumulatedPool && storyAccumulatedPool.length > 0) {
      // [DUP-FIX] 진화하면 pokemonId가 바뀌어 같은 히어로가 '미배치'로 복귀하던 exploit 차단
      //   — 배치 당시 기본형(basePokemonId) 기준으로 판정.
      const placed = new Set(useGameStore.getState().towers.map(t => t.basePokemonId ?? t.pokemonId));
      const available = storyAccumulatedPool.filter(id => !placed.has(id));
      if (available.length === 0) { setShowPicker(true); return; }
    }
    if (!spendMoney(20)) { showToast(t("gameLayout.notEnoughMoneyPicker")); return; }
    setShowPicker(true);
  };

  // ─── 스토리 모드 초기화: location.state → gameStore ────────────────────────
  useEffect(() => {
    if (isStoryMode && storyChapterNumber !== null) {
      const enemyTypes = locationState.enemyTypes ?? null;
      useGameStore.setState({
        storyChapterNumber,
        storyTotalWaves,
        storyClear: false,
        storyEnemyTypes: enemyTypes,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoryMode, storyChapterNumber, storyTotalWaves]);

  // ─── 스토리 챕터 클리어 처리 ─────────────────────────────────────────────
  const handleStoryClearComplete = useCallback(() => {
    if (!storyChapterId || storyChapterNumber === null) return;
    // 클리어 기록 저장
    const totalW = storyTotalWaves ?? 30;
    storyProgressService.markCleared(storyChapterId, {
      stars: 3, // 기본 3성 (향후 라이프 기반으로 개선 가능)
      bestWave: totalW,
    });
    // 챕터별 스토리 업적 달성
    achievementService.onStoryClear(storyChapterNumber);
    // storyClear 플래그 초기화 후 /story 복귀
    useGameStore.setState({ storyClear: false, storyChapterNumber: null, storyTotalWaves: null });
    navigate('/story');
  }, [storyChapterId, storyChapterNumber, storyTotalWaves, navigate]);

  const handleResetAndLeave = () => {
    // [FIX] leaveRoom을 여기서 또 부르지 않는다. onLeaveGame(App.handleLeaveGame)이 이미
    //   같은 방에 leaveRoom을 부르는데, 둘이 동시에 나가면 같은 rooms/{id} 노드에 트랜잭션
    //   두 개가 붙는다. 한쪽이 방을 지우는 동안 다른 쪽이 재시도를 반복하면서 퇴장이
    //   늘어졌고, App 쪽은 그 await 뒤에 navigate 하므로 "메인 메뉴로"가 먹통으로 보였다.
    onLeaveGame(); // resetGame() + leaveRoom + navigate('/map-select' or '/lobby')
    // 스토리 모드일 때는 /story로 오버라이드
    if (isStoryMode) navigate('/story');
  };

  const handleSpeedToggle = () =>
    setSpeed(gameSpeed === 1 ? 3 : gameSpeed === 3 ? 5 : 1);

  // ── Render ────────────────────────────────────────────────────

  return (
    <AppContainer>

      {/* Portrait guard – mobile/tablet 세로 화면 */}
      <PortraitGuard>
        <RotateEmoji><Emoji glyph="📱" size={40} /></RotateEmoji>
        <RotateMsg>{t('hud.rotateDevice')}</RotateMsg>
      </PortraitGuard>

      {/* Multiplayer loading overlay */}
      {isMultiplayer && multiLoading && (
        <MultiLoadingOverlay>
          <MultiLoadingBox>
            <LoadTitle>{t("gameLayout.loadingTitle")}</LoadTitle>
            <LoadDesc>{t("gameLayout.loadingDesc1")}<br />{t("gameLayout.loadingDesc2")}</LoadDesc>
            <LoadDots><span /><span /><span /></LoadDots>
          </MultiLoadingBox>
        </MultiLoadingOverlay>
      )}

      {/* ─── 3-column layout ─────────────────────────────────── */}
      <TriPane>

        {/* ▌LEFT: 시너지 + HUD */}
        <LeftPanel>
          <PanelHdr><Emoji glyph="💎" size={14} /> {t("synergy.title")}</PanelHdr>
          <SynergyArea>
            <SynergyTracker embedded />
          </SynergyArea>
          <HudSep />
          {/* 시설 등급(프렌들리숍·콘테스트 홀) — 멀티플레이엔 알바 시스템이 없어 숨긴다 */}
          {!isMultiplayer && (
          <FacilityBox>
            <FacilityRow>
              <FacilityName><Store size={13} /> {t('facility.shop')}</FacilityName>
              {shopOcc && shopOcc.tier >= 1 && !isWaveActive ? (
                <FacilityShopBtn onClick={() => setManageTowerId(shopOcc.id)}>
                  Lv.{shopOcc.tier} {t('facility.open')}
                </FacilityShopBtn>
              ) : (
                <FacilityLv $on={!!shopOcc}>{shopOcc ? `Lv.${shopOcc.tier}` : "—"}</FacilityLv>
              )}
            </FacilityRow>
            <FacilityRow>
              <FacilityName><Award size={13} /> {t('facility.contest')}</FacilityName>
              {contestOcc && contestOcc.tier >= 1 && !isWaveActive ? (
                <FacilityShopBtn onClick={() => setManageTowerId(contestOcc.id)}>
                  Lv.{contestOcc.tier} {t('facility.view')}
                </FacilityShopBtn>
              ) : (
                <FacilityLv $on={!!contestOcc}>{contestOcc ? `Lv.${contestOcc.tier}` : "—"}</FacilityLv>
              )}
            </FacilityRow>
          </FacilityBox>
          )}
          <HudArea>
            <HudGrid>
              <HudTile>
                <HudLbl>{t('hud.gold')}</HudLbl>
                <HudVal $c="gold">{money}G</HudVal>
              </HudTile>
              <HudTile>
                <HudLbl>{t('hud.lives')}</HudLbl>
                <HudVal $c="red">{lives}</HudVal>
              </HudTile>
              <HudTile>
                <HudLbl>{t('hud.wave')}</HudLbl>
                <HudVal $c="blue">
                  {wave}
                  {/* 싱글: /50, 스토리: /30, 멀티: 표시 없음 */}
                  {!isMultiplayer && <Sub>/{storyTotalWaves ?? 50}</Sub>}
                </HudVal>
              </HudTile>
              <HudTile>
                <HudLbl>{t('hud.pokemon')}</HudLbl>
                <HudVal $c="white">{towers.length}<Sub>/6</Sub></HudVal>
              </HudTile>
            </HudGrid>

            {isMultiplayer ? (
              <PhaseChip $phase={multiPhase}>
                <Emoji glyph={phaseEmoji(multiPhase)} size={13} />{" "}
                {getPhaseText(multiPhase, multiRound, multiCountdown, t)}
              </PhaseChip>
            ) : (
              <TimeChip><Emoji glyph="⏰" size={12} /> {formatTime(gameTime)} <Emoji glyph={timeOfDay === "day" ? "☀️" : "🌙"} size={12} /></TimeChip>
            )}
          </HudArea>
        </LeftPanel>

        {/* ▌CENTER: 맵 */}
        <CenterPanel>
          <GameCanvas />
          {multiRoomId && <BattlePhaseUI roomId={multiRoomId} />}
        </CenterPanel>

        {/* ▌RIGHT: 상점 + 액션 버튼 */}
        <RightPanel>

          {/* 상점 영역 */}
          <ShopWrapper>
            <ShopHdr>
              <ShopHdrTitle><Emoji glyph="🏪" size={14} /> {t("shop.title")}</ShopHdrTitle>
            </ShopHdr>
            <Shop embedded />
          </ShopWrapper>

          {/* 액션 버튼 영역 */}
          <ActionArea>
            <BtnGrid>

              {/* 웨이브 시작 / 멀티 페이즈 */}
              {!isMultiplayer ? (
                <DsBtn $v="wave" $pulse={pulseWave}
                  onClick={handleStartWave} disabled={isWaveActive}>
                  <Ico><Emoji glyph="🎯" size={18} /></Ico>
                  <Lbl>{isWaveActive ? t("hud.inProgress") : t("hud.startWave")}</Lbl>
                </DsBtn>
              ) : (
                <DsBtn $v="wave" disabled>
                  <Ico><Emoji glyph={phaseEmoji(multiPhase)} size={18} /></Ico>
                  <Lbl>R{multiRound}</Lbl>
                </DsBtn>
              )}

              {/* 포켓몬 구입 */}
              <DsBtn $v="shop" $pulse={pulsePokemon} onClick={handleOpenPicker}>
                <Ico><Emoji glyph="🏪" size={18} /></Ico>
                <Lbl>{t("hud.addPokemon")}</Lbl>
              </DsBtn>

              {/* 포켓몬 관리 */}
              <DsBtn $v="manage" onClick={() => setShowPokemonManager(true)}>
                <Ico><Emoji glyph="🎒" size={18} /></Ico>
                <Lbl>{t("hud.managePokemon")}<LblSub> ({towers.length}/6)</LblSub></Lbl>
              </DsBtn>

              {/* 배속 / 상대방 보기 */}
              {!isMultiplayer ? (
                <DsBtn $v="speed" onClick={handleSpeedToggle}>
                  <Ico><Emoji glyph="⚡" size={18} /></Ico>
                  <Lbl>{gameSpeed}×</Lbl>
                </DsBtn>
              ) : multiRoomId ? (
                <DsBtn $v="rival" onClick={() => setShowMultiView(true)}>
                  <Ico><Emoji glyph="👁" size={18} /></Ico>
                  <Lbl>{t("hud.rival")}</Lbl>
                </DsBtn>
              ) : null}

            </BtnGrid>

            {/* 유틸 버튼 행 */}
            <UtilRow>
              <HamBtn onClick={() => setShowHamMenu(v => !v)}>
                <Emoji glyph="☰" size={14} /> {t('hud.menu')}
              </HamBtn>
              <CfgBtn onClick={() => setShowSettings(true)}>
                <Emoji glyph="⚙️" size={14} /> {t('nav.settings')}
              </CfgBtn>
            </UtilRow>
          </ActionArea>
        </RightPanel>
      </TriPane>

      {/* ─── Hamburger menu ─────────────────────────────────── */}
      {showHamMenu && (
        <>
          <HamBackdrop onClick={() => setShowHamMenu(false)} />
          <HamPanel>
            <HamHdr>
              <HamHdrTitle>{t('hud.menu')}</HamHdrTitle>
              <HamClose onClick={() => setShowHamMenu(false)}>✕</HamClose>
            </HamHdr>
            <HamItem onClick={() => { setShowAchievements(true);  setShowHamMenu(false); }}>
              <Emoji glyph="🏆" size={15} /> {t("gameLayout.navAchievements")}
            </HamItem>
            {/* [FREE-TIER] 오프라인 모드에서는 서버 의존 메뉴(전당/랭킹) 숨김 */}
            {!authService.isOfflineMode() && (
              <>
                <HamItem onClick={() => { setShowHallOfFame(true);    setShowHamMenu(false); }}>
                  <Emoji glyph="🏛️" size={15} /> {t("gameLayout.navHallOfFame")}
                </HamItem>
                <HamItem onClick={() => { setShowRankings(true);      setShowHamMenu(false); }}>
                  <Emoji glyph="📊" size={15} /> {t("gameLayout.navRankings")}
                </HamItem>
              </>
            )}
            {isMultiplayer && (
              <HamItem onClick={() => { setShowMultiView(true);   setShowHamMenu(false); }}>
                <Emoji glyph="👥" size={15} /> {t('hud.multiView')}
              </HamItem>
            )}
            <HamDivider />
            <HamItem $danger onClick={() => { setShowHamMenu(false); handleResetAndLeave(); }}>
              <Emoji glyph="🚪" size={15} /> {t("gameLayout.navMainMenu")}
            </HamItem>
          </HamPanel>
        </>
      )}

      {/* ─── Modals ─────────────────────────────────────────── */}
      {showPicker         && <PokemonPicker   onClose={() => setShowPicker(false)} storyHeroPool={storyAccumulatedPool} />}
      {showPokemonManager && <PokemonManager  onClose={() => setShowPokemonManager(false)} />}
      {showSettings       && <Settings        onClose={() => setShowSettings(false)} />}
      {showAchievements   && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
      {showHallOfFame     && <HallOfFame      onClose={() => setShowHallOfFame(false)} />}
      {showRankings       && <Rankings        onClose={() => setShowRankings(false)} />}
      {showMultiView && multiRoomId && (
        <MultiplayerView roomId={multiRoomId} onClose={() => setShowMultiView(false)} />
      )}
      {showGameOverModal && multiRoomId && user && (
        <MultiplayerGameOverModal
          players={finalPlayers}
          myUserId={user.uid}
          onClose={async () => {
            setShowGameOverModal(false);
            // [M2-FIX] finalizeGame(레이팅 계산·기록)을 반드시 await 완료한 뒤 방을 나간다.
            //   마지막 생존자는 leaveRoom이 방/게임상태를 삭제하는데, 예전엔 await 없이 병행 실행되어
            //   ELO 쓰기가 삭제와 경합해 조용히 유실될 수 있었음.
            try {
              await multiplayerService.finalizeGame(multiRoomId);
            } catch (err) {
              console.warn("[GameLayout] finalizeGame failed:", err);
            }
            handleResetAndLeave();
          }}
        />
      )}

      {/* ─── Floating overlays ──────────────────────────────── */}
      {/* 전 모드 보스 연출: 스토리 최종 보스=웅장 컷인 / 그 외 모든 보스=라이트 배너 */}
      <BossCutIn
        chapterNumber={isStoryMode ? storyChapterNumber : null}
        bossName={isStoryMode ? locationState.bossName : undefined}
      />
      <SynergyDetails />
      {/* ─── Modals 우선순위 시퀀스 제어 ─── */}
      {/* 1. 웨이브 보상 (최우선) */}
      {waveEndItemPick && !wave50Clear && !storyClear && <WaveEndPicker />}

      {/* 2. 알바 마일스톤 (웨이브 보상 완료 후) */}
      {clerkOrScoutPromptQueue && clerkOrScoutPromptQueue.length > 0 && !waveEndItemPick && <WorkMilestoneModal />}

      {/* 3. 진화 확인 (알바 마일스톤 완료 후) */}
      {/* [A3-FIX] 웨이브 진행 중엔 전체화면 진화 확인 모달을 띄우지 않는다(입력 차단 → 라이프 누수 방지). 웨이브 종료 후 표시. */}
      {evolutionConfirmQueue && evolutionConfirmQueue.length > 0 && !isWaveActive && !waveEndItemPick && clerkOrScoutPromptQueue.length === 0 && <EvolutionConfirmModal />}

      {/* 4. 스킬 픽커 (진화 확인 완료 후) */}
      {skillChoiceQueue && skillChoiceQueue.length > 0 && !waveEndItemPick && clerkOrScoutPromptQueue.length === 0 && evolutionConfirmQueue.length === 0 && <SkillPicker />}
      {storyClear && storyChapterId && (() => {
        const ch = AEGIS_STORY_CHAPTERS.find(c => c.id === storyChapterId);
        return ch ? (
          <StoryEnding
            chapter={ch}
            onComplete={handleStoryClearComplete}
          />
        ) : null;
      })()}

      {wave50Clear && (
        <Wave50ClearModal
          onContinue={() => useGameStore.setState({ wave50Clear: false, isPaused: false })}
          onRestart={handleResetAndLeave}
        />
      )}

      {gameOver && !isMultiplayer && (
        <GameOverOverlay>
          <GameOverModal>
            <GameOverTitle>{t("gameLayout.gameOverTitle")}</GameOverTitle>
            <p>{t("gameLayout.waveReached", { wave: useGameStore.getState().wave })}</p>
            <RestartBtn onClick={handleResetAndLeave}>{t("gameLayout.restartBtn")}</RestartBtn>
          </GameOverModal>
        </GameOverOverlay>
      )}

      {battleResultToast && isMultiplayer && (
        <ResultToast $won={battleResultToast.won}>
          <ToastIco><Emoji glyph={battleResultToast.won ? "🏆" : "💔"} size={28} /></ToastIco>
          <ToastBody>
            <ToastTitle>
              {battleResultToast.won ? t("gameLayout.toastWin") : t("gameLayout.toastLose")}
            </ToastTitle>
            <ToastDetails>
              {battleResultToast.won ? (
                <ToastLine $pos={true}>{t("gameLayout.toastGoldEarned", { gold: battleResultToast.goldDelta })}</ToastLine>
              ) : (
                <>
                  <ToastLine $pos={false}>{t("gameLayout.toastLivesLost", { lives: battleResultToast.livesDelta })}</ToastLine>
                  {battleResultToast.goldDelta > 0 && (
                    <ToastLine $pos={true}>{t("gameLayout.toastConsolation", { gold: battleResultToast.goldDelta })}</ToastLine>
                  )}
                </>
              )}
            </ToastDetails>
          </ToastBody>
        </ResultToast>
      )}
    </AppContainer>
  );
};
// ─────────────────────────────────────────────────────────────────
// Styled Components — docs/DESIGN.md 의 디자인 시스템을 따른다.
// 값은 tokens.ts, 창틀·글자는 pixel.ts 에서만 가져온다.
// ─────────────────────────────────────────────────────────────────

// ── 반응형 헬퍼 (가로화면 고정 게임 전용) → lMedia 사용 ──────────

// ── Root ──────────────────────────────────────────────────────────

const AppContainer = styled.div`
  width: 100vw;
  height: 100vh;
  background: ${C.bg};
  color: ${C.text};
  ${pixelText}
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
`;

// Portrait orientation guard (모바일/태블릿 세로 전용)
const PortraitGuard = styled.div`
  display: none;
  @media (max-width: 1024px) and (orientation: portrait) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${SP.xl};
    position: fixed;
    inset: 0;
    background: ${C.bg};
    z-index: 99999;
  }
  /* [FIX] orientation 미디어쿼리 미지원 브라우저 대비 */
  @media (max-width: 500px) and (max-aspect-ratio: 1/1) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${SP.xl};
    position: fixed;
    inset: 0;
    background: ${C.bg};
    z-index: 99999;
  }
`;
const RotateEmoji = styled.div`font-size: 48px; line-height: 1;`;
const RotateMsg   = styled.p`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl};
  color: ${C.blue};
  text-align: center;
  padding: 0 ${SP.xxl};
`;

// ── 3-column grid ─────────────────────────────────────────────────

const TriPane = styled.div`
  display: grid;
  /* 패널 폭은 12px 글자를 담을 수 있는 하한선에서 정한다.
     예전에는 폰 가로에서 128px까지 줄이고 글자를 6~8px로 낮췄는데,
     도트 폰트는 12px 미만에서 획이 뭉개져 읽히지 않는다. 폭을 조금 늘리고
     글자 크기를 12px에 고정하는 쪽이 맞다. */
  grid-template-columns: 216px 1fr 216px;
  overflow: hidden;
  /* 중앙 맵이 세로 중앙 정렬될 때 위/아래 레터박스 여백 색 */
  background: ${C.ink};
  border-top: ${SCALE}px solid ${C.divider};
  border-bottom: ${SCALE}px solid ${C.ink};

  /* [FIX] flex 자식으로서 남은 세로 공간을 채우고, 최소 높이 제한 제거 */
  flex: 1;
  min-height: 0;

  /* 태블릿 가로 (iPad 등, ≤1024px) */
  ${lMedia.tablet} { grid-template-columns: 180px 1fr 180px; }
  /* 폰 가로 (≤768px) */
  ${lMedia.phone}  { grid-template-columns: 152px 1fr 152px; }

  /* 세로 화면: PortraitGuard가 덮으므로 숨김 */
  @media (max-width: 1024px) and (orientation: portrait) { display: none; }
  /* [FIX] orientation 미디어쿼리 미지원 브라우저 대비: 극단적으로 좁은 세로 화면 */
  @media (max-width: 500px) and (max-aspect-ratio: 1/1) { display: none; }
`;

// ── Side panels ───────────────────────────────────────────────────

const LeftPanel = styled.div`
  background: ${C.panel};
  border-right: ${SCALE}px solid ${C.ink};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

/** 패널 머리글 — 한 단 파인 띠에 골드 글자. 대문자 영문 eyebrow를 대신한다. */
const PanelHdr = styled.div`
  ${pixelBold}
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.gold};
  display: flex; align-items: center; gap: ${SP.xs};
  flex-shrink: 0;
  ${lMedia.phone} { padding: ${SP.xs} ${SP.sm}; }
`;

const SynergyArea = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const HudSep = styled.div`
  height: ${SCALE}px;
  background: ${C.ink};
  flex-shrink: 0;
`;

const HudArea = styled.div`
  flex-shrink: 0;
  padding: ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.sm};
  border-top: ${SCALE}px solid ${C.ink};
  ${lMedia.phone} { padding: ${SP.xs}; gap: ${SP.xs}; }
`;

// ── 시설 (프렌들리숍 / 콘테스트 홀) ───────────────────────────────

const FacilityBox = styled.div`
  flex-shrink: 0;
  padding: ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.sm};
  border-top: ${SCALE}px solid ${C.ink};
  ${lMedia.phone} { padding: ${SP.xs} ${SP.sm}; }
`;
const FacilityRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.xs};
  min-height: 28px;
  ${pixelText}
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;
const FacilityName = styled.span`
  display: inline-flex; align-items: center; gap: ${SP.xs};
  min-width: 0;
  svg { flex-shrink: 0; }
`;
const FacilityLv = styled.span<{ $on: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$on ? C.gold : C.textDim)};
`;
const FacilityShopBtn = styled.button`
  ${btnThin('gold')}
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
  padding: ${SP.xs} ${SP.sm};
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
`;

// ── HUD 수치 ──────────────────────────────────────────────────────

const HudGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: ${SP.xs};
`;

/** 한 단 파인 칸. 예전에는 반투명 유리 카드 + 대문자 라벨이라 게임 HUD가
    아니라 애널리틱스 위젯으로 읽혔다. */
const HudTile = styled.div`
  ${sunken()}
  padding: ${SP.sm};
  display: flex; flex-direction: column;
  min-width: 0;
  ${lMedia.phone} { padding: ${SP.xs}; }
`;

const HudLbl = styled.span`
  ${pixelText}
  font-size: ${FONT.sm};
  color: ${C.textDim};
  white-space: nowrap;
`;

const HUD_COLOR: Record<string, string> = {
  gold: C.gold, red: C.red, blue: C.blue, white: C.text,
};
const HudVal = styled.span<{ $c: string }>`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl};
  line-height: 1.3;
  color: ${p => HUD_COLOR[p.$c] ?? C.text};
  white-space: nowrap;
  /* 폰 가로에서는 칸이 70px까지 줄어 24px 숫자가 넘친다. 12px이 도트 폰트의
     하한이므로 그 아래로는 내리지 않고 라벨과 같은 크기까지만 내린다. */
  ${lMedia.phone} { font-size: ${FONT.sm}; text-shadow: 1px 1px 0 ${C.textShadow}; }
`;

const Sub = styled.span`
  font-weight: 400;
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

const TimeChip = styled.div`
  ${sunken()}
  ${pixelText}
  font-size: ${FONT.sm};
  color: ${C.blue};
  padding: ${SP.sm} ${SP.xs};
  display: flex; align-items: center; justify-content: center; gap: ${SP.xs};
`;

const PHASE_COLOR: Record<string, string> = {
  shopping:       C.gold,
  wave:           C.green,
  battle:         C.red,
  waiting_wave:   C.blue,
  waiting_battle: C.blue,
  loading:        C.blue,
};

const PhaseChip = styled.div<{ $phase: GamePhase }>`
  ${sunken()}
  ${pixelText}
  font-size: ${FONT.sm};
  padding: ${SP.sm} ${SP.xs};
  text-align: center;
  color: ${p => PHASE_COLOR[p.$phase] ?? C.blue};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

// ── Center Panel ──────────────────────────────────────────────────

const CenterPanel = styled.div`
  /* 맵 타일 15×10 → 3:2 비율 고정 */
  aspect-ratio: 15 / 10;
  overflow: hidden;
  position: relative;
  background: ${C.ink};
  ${crisp}
  /* [FIX] CSS Grid 아이템이 min-content 이하로 축소될 수 있도록 */
  min-width: 0;
  min-height: 0;
  width: 100%;
  /* grid cell 높이가 aspect-ratio 높이보다 클 때(가로가 남는 화면) 맵을
     셀 세로 중앙에 배치 — 위아래 여백을 균등하게. */
  align-self: center;
`;

// ── Right Panel ───────────────────────────────────────────────────

const RightPanel = styled.div`
  background: ${C.panel};
  border-left: ${SCALE}px solid ${C.ink};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ShopWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

/* 여백은 왼쪽 '현재 시너지' 머리글(PanelHdr)과 같은 값을 쓴다 — 좌우 패널의
   머리글이 같은 높이·같은 안쪽 여백으로 마주 보게. */
const ShopHdr = styled.div`
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  padding: ${SP.sm} ${SP.md};
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.xs};
  flex-shrink: 0;
  ${lMedia.phone} { padding: ${SP.xs} ${SP.sm}; }
`;

const ShopHdrTitle = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  display: inline-flex; align-items: center; gap: ${SP.xs};
`;

const ActionArea = styled.div`
  flex-shrink: 0;
  padding: ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.sm};
  border-top: ${SCALE}px solid ${C.ink};
  ${lMedia.phone} { padding: ${SP.xs}; gap: ${SP.xs}; }
`;

// ── Action buttons ────────────────────────────────────────────────

/** 버튼 종류 → 창틀 액센트. 글자는 전부 흰색이고 정체성은 테두리가 진다. */
const BTN_COLOR = {
  wave:   'green',
  shop:   'gold',
  manage: 'blue',
  speed:  'purple',
  rival:  'red',
} as const satisfies Record<string, BtnColor>;

/**
 * 주목 신호 — 계단식 깜빡임.
 * 예전에는 1.5초마다 초록/주황 글로우가 바깥으로 번졌는데, 번지는 빛은 도트 UI에
 * 없는 표현이라 그것만으로 화면이 웹앱으로 읽힌다. 포켓몬 UI가 "지금 눌러라"를
 * 알리는 방법은 중간값 없는 깜빡임이다.
 */
const attn = keyframes`
  0%,  49%  { opacity: 1;    }
  50%, 100% { opacity: 0.45; }
`;

const BtnGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: ${SP.xs};
`;

const DsBtn = styled.button<{ $v: keyof typeof BTN_COLOR; $pulse?: boolean }>`
  ${p => btn(BTN_COLOR[p.$v])}
  ${pixelBold}
  color: ${C.text};
  font-size: ${FONT.sm};
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px; height: 80px; width: 100%;
  padding: 0 2px;
  overflow: hidden;
  touch-action: manipulation;
  outline: none; appearance: none; -webkit-appearance: none;
  ${focusRing}
  ${focusRing}

  ${p => p.$pulse && css`
    & > * { animation: ${attn} 0.9s steps(1, end) infinite; }
  `}

  ${lMedia.phone}  {
    /* 폰 가로에서 패널이 152px까지 줄어든다. 12px 창틀을 그대로 쓰면 버튼
       한 칸(70px) 중 24px이 테두리라 글자가 들어갈 자리가 없다 → 얇은 창틀에
       아이콘을 빼고 글자만 남긴다. */
    ${p => btnThin(BTN_COLOR[p.$v])}
    height: 48px;
    padding: 0 2px;
  }
`;

const Ico = styled.span`
  font-size: ${ICON.lg}px; line-height: 1;
  ${lMedia.phone} { display: none; }
`;

const Lbl = styled.span`
  font-size: ${FONT.sm};
  line-height: 1.3;
  text-align: center;
  width: 100%;
  word-break: keep-all; overflow-wrap: break-word;
  ${lMedia.phone} { text-shadow: 1px 1px 0 ${C.textShadow}; }
`;

/** 라벨 뒤에 붙는 보유 수 등. 폰 가로에서는 줄바꿈이 한 줄 더 생겨 버튼을
    넘치므로 감춘다 — 같은 값이 왼쪽 HUD 칸에 이미 있다. */
const LblSub = styled.span`
  ${lMedia.tablet} { display: none; }
`;

// ── Util buttons (☰ / ⚙️) ─────────────────────────────────────────

const UtilRow = styled.div`
  display: flex; gap: ${SP.xs};
  /* [FIX] 메뉴·설정은 전체화면 모달(ModalOverlay, z-index 1000) 위에 남긴다.
     웨이브 보상·알바 마일스톤·진화 확인이 큐에 쌓여 있으면 오버레이가 HUD를 통째로 덮어
     "메뉴" 자체를 누를 수 없었다 → 모달을 전부 소화하기 전엔 게임에서 나갈 방법이 없었다.
     햄버거 백드롭(4000)/패널(4001)보다는 낮게 둬서 메뉴가 열리면 정상적으로 덮인다. */
  position: relative; z-index: 1100;
`;

/** 작은 컨트롤이라 얇은 창틀. btn()의 12px 테두리는 32px 높이를 잡아먹는다. */
const utilBase = css`
  ${pixelBold}
  flex: 1; min-height: 40px; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: ${SP.xs};
  font-size: ${FONT.sm};
  color: ${C.text};
  touch-action: manipulation;
  outline: none; appearance: none; -webkit-appearance: none;
  ${focusRing}
  ${focusRing}
  ${lMedia.phone} { min-height: 36px; }
`;

const HamBtn = styled.button`
  ${btnThin('plain')}
  ${utilBase}
`;
const CfgBtn = styled.button`
  ${btnThin('blue')}
  ${utilBase}
`;

// ── Hamburger menu panel ──────────────────────────────────────────

const HamBackdrop = styled.div`
  position: fixed; inset: 0; z-index: 4000;
`;

const HamPanel = styled.div`
  ${win('plain')}
  position: fixed;
  bottom: 72px; right: 14px;
  z-index: 4001;
  padding: 0 0 ${SP.sm};
  min-width: 208px;
  display: flex; flex-direction: column;
  ${lMedia.tablet} { right: 10px; bottom: 60px; min-width: 192px; }
  ${lMedia.phone}  { right: 8px;  bottom: 52px; min-width: 176px; }
`;

/**
 * 머리띠 — 창틀 '안쪽'을 꽉 채운다.
 * 모달(ModalHeader)은 좌우를 -FRAME_W 만큼 당겨 창틀 위까지 덮는 전면 띠지만,
 * 이 창은 200px 남짓이라 같은 방식을 쓰면 띠가 창틀 밖으로 삐져나와 보인다.
 * HamPanel이 좌우 패딩을 두지 않으므로 마진 없이도 안쪽 끝까지 닿는다.
 */
const HamHdr = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.sm};
  margin: 0 0 ${SP.xs};
  padding: ${SP.xs} ${SP.xs} ${SP.xs} ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
`;
const HamHdrTitle = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
`;

/** 닫기 — 창틀을 씌우지 않는다. 글리프 하나로 충분하고, 테두리를 두르면
    작은 컨트롤이 부풀어 올라 메뉴 항목보다 먼저 눈에 들어온다. */
const HamClose = styled.button`
  ${pixelBold}
  background: none; border: none; cursor: pointer;
  width: 28px; height: 28px; padding: 0; flex-shrink: 0;
  font-size: ${FONT.sm};
  color: ${C.textDim};
  display: flex; align-items: center; justify-content: center;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  ${focusRing}
`;

/** 목록 항목 — hover 배경 대신 ▶ 커서로 선택을 표시한다. */
const HamItem = styled.button<{ $danger?: boolean }>`
  ${pixelText}
  ${cursorMark}
  background: none; border: none;
  padding: ${SP.sm} ${SP.md} ${SP.sm} ${CURSOR_GUTTER}px;
  font-size: ${FONT.sm};
  color: ${p => (p.$danger ? C.red : C.text)};
  cursor: pointer; text-align: left;
  display: flex; align-items: center; gap: ${SP.sm};
  touch-action: manipulation;
  @media (hover: hover) { &:hover { ${cursorOn} } }
  &:focus-visible { outline: none; ${cursorOn} }
  ${lMedia.phone} { padding: ${SP.xs} ${SP.sm} ${SP.xs} ${CURSOR_GUTTER}px; }
`;

const HamDivider = styled.div`
  height: ${SCALE}px; background: ${C.ink}; margin: ${SP.xs} 0;
`;

// ── Game over ─────────────────────────────────────────────────────

const GameOverOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(20, 16, 26, 0.86);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
`;
const GameOverModal = styled.div`
  ${win('red')}
  ${pixelText}
  padding: ${SP.xl};
  text-align: center;
  color: ${C.text};
  max-width: 90vw;
  font-size: ${FONT.sm};
  ${lMedia.phone} { padding: ${SP.lg}; }
`;
const GameOverTitle = styled.h2`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.display};
  color: ${C.red};
  margin-bottom: ${SP.lg};
  ${lMedia.phone} { font-size: ${FONT.xl}; margin-bottom: ${SP.sm}; }
`;
const RestartBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  margin-top: ${SP.lg};
  padding: ${SP.sm} ${SP.xl};
  font-size: ${FONT.sm};
  color: ${C.text};
`;

// ── Multiplayer loading ───────────────────────────────────────────

const MultiLoadingOverlay = styled.div`
  position: fixed; inset: 0;
  /* backdrop-filter 는 쓰지 않는다 — 도트 UI 뒤가 흐려지면 즉시 웹앱으로 읽힌다. */
  background: rgba(20, 16, 26, 0.9);
  display: flex; justify-content: center; align-items: center;
  z-index: 99999;
`;
const MultiLoadingBox = styled.div`
  ${win('blue')}
  ${pixelText}
  display: flex; flex-direction: column; align-items: center; gap: ${SP.lg};
  padding: ${SP.xxl};
  ${lMedia.phone} { padding: ${SP.xl}; gap: ${SP.md}; }
`;
const LoadTitle = styled.div`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl};
  color: ${C.text};
  ${lMedia.phone} { font-size: ${FONT.sm}; }
`;
const LoadDesc  = styled.div`
  ${pixelText}
  font-size: ${FONT.sm};
  color: ${C.textSub};
  text-align: center; line-height: 1.6;
`;

/**
 * 로딩 표시 — 네모 블록 3개가 순서대로 켜진다.
 * 예전에는 원형 스피너가 돌고 그 아래 둥근 점이 부드럽게 튀었는데, 원과 이징은
 * 도트 UI에 없는 문법이다. steps()로 끊어 도트 게임의 대기 표시에 맞춘다.
 */
const dotStep = keyframes`
  0%,  32%  { opacity: 1;    }
  33%, 100% { opacity: 0.22; }
`;
const LoadDots = styled.div`
  display: flex; gap: ${SP.sm};
  span {
    width: 12px; height: 12px; background: ${C.blue};
    animation: ${dotStep} 0.9s steps(1, end) infinite;
    &:nth-child(1) { animation-delay: 0s;   }
    &:nth-child(2) { animation-delay: 0.3s; }
    &:nth-child(3) { animation-delay: 0.6s; }
  }
`;

// ── Battle result toast ───────────────────────────────────────────

const toastSlide = keyframes`
  0%  {opacity:0;transform:translateX(60px);}
  15% {opacity:1;transform:translateX(0);}
  80% {opacity:1;transform:translateX(0);}
  100%{opacity:0;transform:translateX(60px);}
`;
const ResultToast = styled.div<{ $won: boolean }>`
  ${p => win(p.$won ? 'green' : 'red')}
  ${pixelText}
  position: fixed; top: 80px; right: 20px; z-index: 9997;
  display: flex; align-items: center; gap: ${SP.md};
  min-width: 240px;
  animation: ${toastSlide} 5s ease forwards;
  pointer-events: none;
  ${lMedia.tablet} { right: 12px; min-width: 216px; }
  ${lMedia.phone}  { right: 8px;  min-width: 192px; gap: ${SP.sm}; }
`;
const ToastIco   = styled.div`
  font-size: 28px; line-height: 1; flex-shrink: 0;
  ${lMedia.phone} { font-size: ${ICON.lg}px; }
`;
const ToastBody  = styled.div`display:flex;flex-direction:column;gap:${SP.xs};min-width:0;`;
const ToastTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.xl};
  color: ${C.text};
  ${lMedia.phone} { font-size: ${FONT.sm}; text-shadow: 1px 1px 0 ${C.textShadow}; }
`;
const ToastDetails = styled.div`display:flex;flex-direction:column;gap:2px;`;
const ToastLine  = styled.div<{ $pos: boolean }>`
  ${pixelText}
  font-size: ${FONT.sm};
  color: ${p => (p.$pos ? C.gold : C.textSub)};
`;
