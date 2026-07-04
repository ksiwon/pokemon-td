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
import { getMapById, getFacilityTiles } from "../../data/maps";
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
import { PlayerGameState, TowerDetail, GamePhase } from "../../types/multiplayer";
import { aiPlayerManager } from "../../services/AIPlayer";
import { getCriticalChance, getAOEDamageMultiplier } from "../../utils/abilities";
import { lMedia } from "../../utils/responsive.utils";
import { Emoji } from "../shared/Emoji";
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
// (모듈 레벨로 분리 — buildTowerDetails 재사용, JSON scrub 포함)
const scrub = (obj: any): any => JSON.parse(JSON.stringify(obj));

const buildTowerDetails = (towers: any[]): TowerDetail[] =>
  (towers ?? []).map((t: any) => {
    const ability      = t.ability ?? "";
    const critChance   = getCriticalChance(ability);
    const hasAOEMove   = (t.equippedMoves ?? []).some((m: any) => m.isAOE);
    const aoeMultiplier = getAOEDamageMultiplier(ability);
    const aoeBonus     = hasAOEMove ? 0.5 * aoeMultiplier : 0;

    return scrub({
      pokemonId:     t.pokemonId,
      name:          t.displayName || t.name,
      level:         t.level,
      sprite:        t.sprite,
      position:      t.position,
      currentHp:     t.currentHp,
      maxHp:         t.maxHp,
      isFainted:     !!t.isFainted,
      attack:        t.attack,
      defense:       t.defense,
      specialAttack: t.specialAttack,
      specialDefense:t.specialDefense,
      speed:         t.speed,
      types:         t.types,
      equippedMoves: t.equippedMoves,
      critChance,
      aoeBonus,
      lifesteal:     0,
    });
  });

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
  const facility = getFacilityTiles(getMapById(currentMap));
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

  // ─────────────────────────────────────────────────────────────
  // Effects — V6/V8 멀티플레이어 로직 전체 보존 + BUG-FIX
  // ─────────────────────────────────────────────────────────────

  // ─── 로딩 완료 리포트 ──────────────────────────────────────────
  useEffect(() => {
    if (!isMultiplayer || !multiRoomId || !user || loadingReportedRef.current) return;
    const unsub = multiplayerService.onGameStateUpdateWithPhase(multiRoomId, state => {
      if (!state || loadingReportedRef.current) return;
      loadingReportedRef.current = true;
      if (state.currentPhase !== "loading") { setMultiLoading(false); unsub(); return; }
      multiplayerService.markPlayerLoaded(multiRoomId, user.uid)
        .then(ok => { if (ok) unsub(); else loadingReportedRef.current = false; })
        .catch(() => { loadingReportedRef.current = false; });
    });
    return unsub;
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
            useGameStore.setState({
              lives: restored.lives,
              money: restored.money,
              wave:  restored.wave,
              gameSpeed: 3,
              isWaveActive: false,
              isPaused: false,
            });
            // [V5-FIX-GL-4] 재접속 시 이미 처리된 라운드 보상은 재적용 방지
            lastAppliedRoundRef.current    = restored.currentRound;
            lastAppliedByeRoundRef.current = restored.currentRound;

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
                ability:        "",
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
  useEffect(() => {
    if (!multiRoomId || !user) return;
    const unsubscribe = multiplayerService.onGameStateUpdateWithPhase(multiRoomId, (state) => {
      if (!state) return;
      const myResult = (state.battleResults || []).find(r =>
        r.roundNumber === state.currentRound &&
        r.roundNumber > lastAppliedRoundRef.current &&
        (r.player1Id === user.uid || r.player2Id === user.uid)
      );
      if (!myResult) return;
      lastAppliedRoundRef.current = myResult.roundNumber;
      const myReward = user.uid === myResult.player1Id ? myResult.rewardP1 : myResult.rewardP2;
      if (!myReward) return;
      const { addMoney, addLives } = useGameStore.getState();
      if (myReward.gold  !== 0) addMoney(myReward.gold);
      if (myReward.lives !== 0) addLives(myReward.lives);
      setBattleResultToast({
        won:        user.uid === myResult.winnerId,
        goldDelta:  myReward.gold,
        livesDelta: myReward.lives,
        round:      myResult.roundNumber,
      });
      setTimeout(() => setBattleResultToast(null), 5000);
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
      const placed = new Set(useGameStore.getState().towers.map(t => t.pokemonId));
      const available = storyAccumulatedPool.filter(id => !placed.has(id));
      if (available.length === 0) { setShowPicker(true); return; }
    }
    if (!spendMoney(20)) { alert(t("gameLayout.notEnoughMoneyPicker")); return; }
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
    if (multiRoomId) multiplayerService.leaveRoom(multiRoomId).catch(() => {});
    onLeaveGame(); // resetGame() + navigate('/map-select' or '/lobby')
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
            <Spinner />
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
          {/* 시설 등급(프렌들리숍·콘테스트 홀) */}
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
          <HudArea>
            <HudGrid>
              <HudTile>
                <HudLbl>GOLD</HudLbl>
                <HudVal $c="gold">{money}G</HudVal>
              </HudTile>
              <HudTile>
                <HudLbl>LIVES</HudLbl>
                <HudVal $c="red">{lives}</HudVal>
              </HudTile>
              <HudTile>
                <HudLbl>WAVE</HudLbl>
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
              <GoldBadge><Emoji glyph="💰" size={13} /> {money}G</GoldBadge>
            </ShopHdr>
            <Shop embedded />
          </ShopWrapper>

          {/* 액션 버튼 영역 */}
          <ActionArea>
            <ActionSep>— Action —</ActionSep>
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
                <Lbl>{t("hud.managePokemon")} ({towers.length}/6)</Lbl>
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
            <HamClose onClick={() => setShowHamMenu(false)}><Emoji glyph="❌" size={16} /></HamClose>
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
// Styled Components
// ─────────────────────────────────────────────────────────────────

// ── 반응형 헬퍼 (가로화면 고정 게임 전용) → lMedia 사용 ──────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;

// ── Root ──────────────────────────────────────────────────────────

const AppContainer = styled.div`
  width: 100vw;
  height: 100vh;
  background: radial-gradient(ellipse at top, #1a2332 0%, #0f1419 50%, #000 100%);
  color: #e8edf3;
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
    gap: 20px;
    position: fixed;
    inset: 0;
    background: #0f1419;
    z-index: 99999;
  }
  /* [FIX] orientation 미디어쿼리 미지원 브라우저 대비 */
  @media (max-width: 500px) and (max-aspect-ratio: 1/1) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    position: fixed;
    inset: 0;
    background: #0f1419;
    z-index: 99999;
  }
`;
const RotateEmoji = styled.div`font-size: 52px;`;
const RotateMsg   = styled.p`
  font-size: 18px; color: #60b0ff; font-weight: 500; text-align: center;
  padding: 0 32px;
`;

// ── 3-column grid ─────────────────────────────────────────────────

const TriPane = styled.div`
  display: grid;
  /* 데스크탑: 210px 패널 */
  grid-template-columns: 210px 1fr 210px;
  overflow: hidden;
  /* 중앙 맵이 세로 중앙 정렬될 때 위/아래 레터박스 여백 색을 맵 배경과
     동일하게(뒤 AppContainer 그라디언트가 비쳐 상/하 색이 달라 보이는 문제 방지) */
  background: #080e14;
  border-top: 2px solid rgba(80, 140, 220, 0.25);
  border-bottom: 2px solid rgba(80, 140, 220, 0.25);

  /* [FIX] flex 자식으로서 남은 세로 공간을 채우고, 최소 높이 제한 제거 */
  flex: 1;
  min-height: 0;

  /* 태블릿 가로 (iPad 등, ≤1024px) */
  ${L1024} { grid-template-columns: 172px 1fr 172px; }
  /* 폰 가로 (≤768px) */
  ${L768}  { grid-template-columns: 128px 1fr 128px; }

  /* 세로 화면: PortraitGuard가 덮으므로 숨김 */
  @media (max-width: 1024px) and (orientation: portrait) { display: none; }
  /* [FIX] orientation 미디어쿼리 미지원 브라우저 대비: 극단적으로 좁은 세로 화면 */
  @media (max-width: 500px) and (max-aspect-ratio: 1/1) { display: none; }
`;

// ── Left Panel ────────────────────────────────────────────────────

const LeftPanel = styled.div`
  background: #111827;
  border-right: 2px solid rgba(80, 140, 220, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PanelHdr = styled.div`
  background: linear-gradient(180deg, #1e3050 0%, #162540 100%);
  border-bottom: 1px solid rgba(80, 140, 220, 0.28);
  padding: 7px 12px;
  font-size: 12px; font-weight: 600; color: #60b0ff;
  text-transform: uppercase; letter-spacing: 0.5px;
  flex-shrink: 0;
  ${L1024} { padding: 6px 9px; font-size: 10px; }
  ${L768}  { padding: 4px 6px; font-size: 8px; letter-spacing: 0.3px; }
`;

const SynergyArea = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const HudSep = styled.div`
  height: 1px;
  background: rgba(80, 140, 220, 0.14);
  flex-shrink: 0;
`;

const HudArea = styled.div`
  flex-shrink: 0;
  background: #0d1520;
  padding: 10px;
  display: flex; flex-direction: column; gap: 6px;
  ${L1024} { padding: 7px 8px; gap: 5px; }
  ${L768}  { padding: 4px 5px; gap: 3px; }
`;

const FacilityBox = styled.div`
  flex-shrink: 0;
  background: #0d1520;
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 5px;
  border-top: 1px solid rgba(80,140,220,0.1);
  ${L1024} { padding: 6px 8px; gap: 4px; }
  ${L768}  { padding: 4px 6px; gap: 3px; }
`;
const FacilityRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; color: #a8b8c8; font-weight: 600;
  ${L768} { font-size: 10px; }
`;
const FacilityName = styled.span`
  display: inline-flex; align-items: center; gap: 5px;
  svg { opacity: 0.85; }
`;
const FacilityLv = styled.span<{ $on: boolean }>`
  font-size: 11px; font-weight: 800;
  color: ${p => (p.$on ? "#f0b840" : "#566374")};
  ${L768} { font-size: 10px; }
`;
const FacilityShopBtn = styled.button`
  font-size: 11px; font-weight: 800; color: #0d1520;
  background: #f0b840; border: none; border-radius: 4px;
  padding: 2px 8px; cursor: pointer; line-height: 1.4;
  transition: filter 0.12s;
  &:hover { filter: brightness(1.12); }
  ${L768} { font-size: 10px; padding: 2px 6px; }
`;

const HudGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
  ${L1024} { gap: 4px; }
  ${L768}  { gap: 3px; }
`;

const HudTile = styled.div`
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 6px; padding: 4px 7px;
  display: flex; flex-direction: column; gap: 2px;
  ${L1024} { padding: 3px 5px; }
  ${L768}  { padding: 2px 4px; }
`;

const HudLbl = styled.span`
  font-size: 9px; color: #5a7090;
  text-transform: uppercase; letter-spacing: 0.4px;
  ${L1024} { font-size: 8px; }
  ${L768}  { font-size: 6px; letter-spacing: 0.2px; }
`;

const colorMap: Record<string, string> = {
  gold: "#f0c040", red: "#e05050", blue: "#60b0ff", white: "#aabbcc",
};
const HudVal = styled.span<{ $c: string }>`
  font-size: 18px; font-weight: 600; line-height: 1.1;
  color: ${p => colorMap[p.$c] ?? "#aabbcc"};
  ${L1024} { font-size: 15px; }
  ${L768}  { font-size: 12px; }
`;

const Sub = styled.span`
  font-size: 11px; opacity: 0.5;
  ${L1024} { font-size: 9px; }
  ${L768}  { font-size: 8px; }
`;

const TimeChip = styled.div`
  font-size: 11px; color: #60b0ff; font-weight: 500;
  background: rgba(96,176,255,.07); border: 1px solid rgba(96,176,255,.18);
  border-radius: 5px; padding: 4px 8px; text-align: center;
  ${L1024} { font-size: 9px; padding: 3px 6px; }
  ${L768}  { font-size: 8px; padding: 2px 4px; }
`;

const phaseColorMap: Record<string, { text: string; bg: string; border: string }> = {
  shopping:       { text: "#f0c040", bg: "rgba(240,192,64,.10)", border: "rgba(240,192,64,.30)" },
  wave:           { text: "#50d080", bg: "rgba(80,208,128,.10)", border: "rgba(80,208,128,.30)" },
  battle:         { text: "#e05050", bg: "rgba(224,80,80,.10)",  border: "rgba(224,80,80,.30)"  },
  waiting_wave:   { text: "#60b0ff", bg: "rgba(96,176,255,.08)", border: "rgba(96,176,255,.22)" },
  waiting_battle: { text: "#60b0ff", bg: "rgba(96,176,255,.08)", border: "rgba(96,176,255,.22)" },
  loading:        { text: "#60b0ff", bg: "rgba(96,176,255,.08)", border: "rgba(96,176,255,.22)" },
};

const PhaseChip = styled.div<{ $phase: GamePhase }>`
  font-size: 11px; font-weight: 500;
  border-radius: 5px; padding: 4px 8px; text-align: center;
  color:      ${p => phaseColorMap[p.$phase]?.text   ?? "#60b0ff"};
  background: ${p => phaseColorMap[p.$phase]?.bg     ?? "rgba(96,176,255,.08)"};
  border: 1px solid ${p => phaseColorMap[p.$phase]?.border ?? "rgba(96,176,255,.22)"};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  ${L1024} { font-size: 9px; padding: 3px 6px; }
  ${L768}  { font-size: 8px; padding: 2px 4px; }
`;

// ── Center Panel ──────────────────────────────────────────────────

const CenterPanel = styled.div`
  /* 맵 타일 15×10 → 3:2 비율 고정 */
  aspect-ratio: 15 / 10;
  overflow: hidden;
  position: relative;
  background: #080e14;
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
  background: #111827;
  border-left: 2px solid rgba(80, 140, 220, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ShopWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-bottom: 2px solid rgba(80, 140, 220, 0.28);
`;

const ShopHdr = styled.div`
  background: linear-gradient(180deg, #1e3050 0%, #162540 100%);
  border-bottom: 1px solid rgba(80, 140, 220, 0.28);
  padding: 7px 10px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
  ${L1024} { padding: 5px 8px; }
  ${L768}  { padding: 4px 6px; }
`;

const ShopHdrTitle = styled.span`
  font-size: 12px; font-weight: 600; color: #60b0ff;
  text-transform: uppercase; letter-spacing: 0.4px;
  ${L1024} { font-size: 10px; }
  ${L768}  { font-size: 8px; }
`;

const GoldBadge = styled.span`
  font-size: 13px; font-weight: 600; color: #f0c040;
  ${L1024} { font-size: 11px; }
  ${L768}  { font-size: 9px; }
`;

const ActionArea = styled.div`
  flex-shrink: 0;
  background: #0d1422;
  padding: 8px;
  display: flex; flex-direction: column; gap: 5px;
  ${L1024} { padding: 6px; gap: 4px; }
  ${L768}  { padding: 4px 5px; gap: 3px; }
`;

const ActionSep = styled.div`
  font-size: 9px; color: #5a7090;
  text-transform: uppercase; letter-spacing: 0.7px; text-align: center;
  border-top: 1px solid rgba(80, 140, 220, 0.14);
  padding-top: 6px;
  ${L1024} { font-size: 8px; padding-top: 5px; }
  ${L768}  { font-size: 7px; padding-top: 3px; }
`;

// ── DS-style buttons ──────────────────────────────────────────────

const pulseGreen = keyframes`
  0%   { box-shadow: 0 0 0 0   rgba(80, 208, 128, 0.80); }
  70%  { box-shadow: 0 0 0 8px rgba(80, 208, 128, 0);    }
  100% { box-shadow: 0 0 0 0   rgba(80, 208, 128, 0);    }
`;
const pulseOrange = keyframes`
  0%   { box-shadow: 0 0 0 0   rgba(240, 168, 64, 0.80); }
  70%  { box-shadow: 0 0 0 8px rgba(240, 168, 64, 0);    }
  100% { box-shadow: 0 0 0 0   rgba(240, 168, 64, 0);    }
`;

const btnVariants = {
  wave:   css`background: linear-gradient(180deg,#1f6640,#174f30);
              color:#5ee894;
              border:1.5px solid #2d8a56;
              text-shadow:0 0 8px rgba(80,230,140,0.5);
              &:disabled{opacity:.38;}`,
  shop:   css`background: linear-gradient(180deg,#4e2c0a,#3a2006);
              color:#f5b540;
              border:1.5px solid #7a4e18;
              text-shadow:0 0 8px rgba(245,165,40,0.5);`,
  manage: css`background: linear-gradient(180deg,#143660,#0e2840);
              color:#72c0ff;
              border:1.5px solid #2458a0;
              text-shadow:0 0 8px rgba(100,180,255,0.5);`,
  speed:  css`background: linear-gradient(180deg,#321858,#28103c);
              color:#d090ff;
              border:1.5px solid #5c2898;
              text-shadow:0 0 8px rgba(200,100,255,0.5);`,
  rival:  css`background: linear-gradient(180deg,#4a0c0c,#380808);
              color:#ff9090;
              border:1.5px solid #7a2020;
              text-shadow:0 0 8px rgba(255,100,100,0.5);`,
};

const BtnGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 5px; padding-bottom: 6px;
  ${L1024} { gap: 4px; padding-bottom: 5px; }
  ${L768}  { gap: 3px; padding-bottom: 4px; }
`;

const DsBtn = styled.button<{ $v: keyof typeof btnVariants; $pulse?: boolean }>`
  padding: 0 4px; border-radius: 8px; cursor: pointer;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px; height: 52px;
  position: relative; overflow: hidden;
  touch-action: manipulation; width: 100%;
  outline: none; appearance: none; -webkit-appearance: none;

  &::before {
    content: ""; position: absolute;
    top: 0; left: 0; right: 0; height: 38%;
    background: rgba(255,255,255,.09);
    border-radius: 7px 7px 0 0; pointer-events: none;
  }

  box-shadow: 0 5px 0 rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.12);
  ${p => btnVariants[p.$v]}
  ${p => p.$pulse && p.$v === "wave" && css`animation: ${pulseGreen}  1.5s ease infinite;`}
  ${p => p.$pulse && p.$v === "shop" && css`animation: ${pulseOrange} 1.5s ease infinite;`}

  @media (hover: hover) {
    &:not(:disabled):hover {
      filter: brightness(1.2); transform: translateY(-1px);
      box-shadow: 0 6px 0 rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.14);
    }
  }
  &:not(:disabled):active {
    transform: translateY(4px);
    box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08);
    filter: brightness(0.88);
  }
  &:focus, &:focus-visible { outline: none; }

  ${L1024} { height: 46px; border-radius: 7px; }
  ${L768}  { height: 38px; gap: 1px; border-radius: 6px; }
`;

const Ico = styled.span`
  font-size: 20px; line-height: 1; position: relative; z-index: 1;
  ${L1024} { font-size: 17px; }
  ${L768}  { font-size: 13px; }
`;

const Lbl = styled.span`
  font-size: 9.5px; font-weight: 600; line-height: 1.2;
  position: relative; z-index: 1; text-align: center;
  width: 100%; padding: 0 3px;
  word-break: keep-all; overflow-wrap: break-word;
  ${L1024} { font-size: 8px; }
  ${L768}  { font-size: 7px; padding: 0 2px; }
`;

// ── Util buttons (☰ / ⚙️) ─────────────────────────────────────────

const UtilRow = styled.div`
  display: flex; gap: 5px;
  ${L768} { gap: 3px; }
`;

const utilBase = css`
  flex: 1; height: 32px; border-radius: 7px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  font-size: 12px; font-weight: 500; touch-action: manipulation;
  @media (hover: hover) { &:hover { filter: brightness(1.15); } }
  &:active { transform: scale(0.97); }
  ${L1024} { height: 28px; font-size: 10px; }
  ${L768}  { height: 24px; font-size: 9px; }
`;

const HamBtn = styled.button`
  ${utilBase}
  background: #1e2232; color: #9ab0cc;
  border: 1.5px solid #303650;
  box-shadow: 0 3px 0 rgba(0,0,0,.5);
  outline: none; appearance: none; -webkit-appearance: none;
  &:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(0,0,0,.4); }
  &:focus, &:focus-visible { outline: none; }
`;
const CfgBtn = styled.button`
  ${utilBase}
  background: #0e2240; color: #60b0ff;
  border: 1.5px solid #1e3860;
  box-shadow: 0 3px 0 rgba(0,0,0,.5);
  outline: none; appearance: none; -webkit-appearance: none;
  &:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(0,0,0,.4); }
  &:focus, &:focus-visible { outline: none; }
`;

// ── Hamburger menu panel ──────────────────────────────────────────

const HamBackdrop = styled.div`
  position: fixed; inset: 0; z-index: 4000;
`;

const HamPanel = styled.div`
  position: fixed;
  bottom: 72px; right: 14px;
  z-index: 4001;
  background: linear-gradient(145deg, #1a1f2e, #0f1419);
  border: 2px solid rgba(80, 140, 220, 0.32);
  border-radius: 12px;
  padding: 8px;
  min-width: 164px;
  display: flex; flex-direction: column; gap: 2px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  ${L1024} { right: 10px; bottom: 60px; min-width: 148px; }
  ${L768}  { right: 8px;  bottom: 52px; min-width: 130px; padding: 6px; }
`;

const HamClose = styled.button`
  align-self: flex-end;
  background: none; border: none;
  color: #5a7090; font-size: 14px; cursor: pointer; padding: 0 4px; margin-bottom: 4px;
  @media (hover: hover) { &:hover { color: #aabbcc; } }
`;

const HamItem = styled.button<{ $danger?: boolean }>`
  background: none; border: none; border-radius: 7px;
  padding: 8px 12px; font-size: 12px;
  color: ${p => p.$danger ? "#e05050" : "#aabbd0"};
  cursor: pointer; text-align: left;
  display: flex; align-items: center; gap: 8px;
  touch-action: manipulation;
  @media (hover: hover) {
    &:hover {
      background: ${p => p.$danger ? "rgba(224,80,80,.1)" : "rgba(96,176,255,.08)"};
      color: ${p => p.$danger ? "#ff7070" : "#d8e8f8"};
    }
  }
  ${L1024} { font-size: 11px; padding: 7px 10px; }
  ${L768}  { font-size: 10px; padding: 6px 8px; gap: 6px; }
`;

const HamDivider = styled.div`
  height: 1px; background: rgba(255,255,255,.06); margin: 2px 0;
`;

// ── Game over ─────────────────────────────────────────────────────

const GameOverOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.85);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
`;
const GameOverModal = styled.div`
  background: linear-gradient(135deg, #1a2332, #0f1419);
  border: 2px solid rgba(255,100,100,.5);
  border-radius: 20px; padding: 40px;
  text-align: center; color: #e8edf3; max-width: 90vw;
  ${L1024} { padding: 28px; border-radius: 16px; }
  ${L768}  { padding: 20px; border-radius: 12px; }
`;
const GameOverTitle = styled.h2`
  font-size: 32px; color: #ff6464; margin-bottom: 16px;
  ${L1024} { font-size: 24px; }
  ${L768}  { font-size: 20px; }
`;
const RestartBtn = styled.button`
  margin-top: 20px; padding: 12px 32px; font-size: 16px; cursor: pointer;
  border-radius: 12px; border: 2px solid rgba(76,175,255,.5);
  background: rgba(76,175,255,.2); color: #4cafff; font-weight: bold;
  transition: background .2s;
  @media (hover: hover) { &:hover { background: rgba(76,175,255,.35); } }
`;

// ── Multiplayer loading ───────────────────────────────────────────

const MultiLoadingOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.92);
  display: flex; justify-content: center; align-items: center;
  z-index: 99999; backdrop-filter: blur(6px);
`;
const MultiLoadingBox = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid rgba(76,175,255,.4);
  border-radius: 24px; padding: 48px 64px;
  box-shadow: 0 0 40px rgba(76,175,255,.2);
  ${L1024} { padding: 32px 40px; border-radius: 18px; gap: 12px; }
  ${L768}  { padding: 24px 28px; border-radius: 14px; gap: 10px; }
`;
const spin = keyframes`from{transform:rotate(0deg);}to{transform:rotate(360deg);}`;
const Spinner = styled.div`
  width:56px;height:56px;
  border:4px solid rgba(76,175,255,.2);border-top-color:#4cafff;
  border-radius:50%;animation:${spin} .9s linear infinite;
  ${L1024} { width: 44px; height: 44px; }
  ${L768}  { width: 36px; height: 36px; border-width: 3px; }
`;
const LoadTitle = styled.div`
  font-size:22px;font-weight:bold;color:#fff;
  ${L1024} { font-size: 18px; }
  ${L768}  { font-size: 15px; }
`;
const LoadDesc  = styled.div`
  font-size:14px;color:rgba(255,255,255,.6);text-align:center;
  ${L1024} { font-size: 12px; }
  ${L768}  { font-size: 10px; }
`;
const dot = keyframes`
  0%,80%,100%{transform:translateY(0);opacity:.4;}
  40%{transform:translateY(-8px);opacity:1;}
`;
const LoadDots = styled.div`
  display:flex;gap:8px;margin-top:4px;
  span{width:8px;height:8px;border-radius:50%;background:#4cafff;
    animation:${dot} 1.2s ease-in-out infinite;
    &:nth-child(1){animation-delay:0s;}
    &:nth-child(2){animation-delay:.2s;}
    &:nth-child(3){animation-delay:.4s;}}
`;

// ── Battle result toast ───────────────────────────────────────────

const toastSlide = keyframes`
  0%  {opacity:0;transform:translateX(60px);}
  15% {opacity:1;transform:translateX(0);}
  80% {opacity:1;transform:translateX(0);}
  100%{opacity:0;transform:translateX(60px);}
`;
const ResultToast = styled.div<{ $won: boolean }>`
  position:fixed;top:80px;right:20px;z-index:9997;
  display:flex;align-items:center;gap:12px;
  padding:14px 20px;border-radius:16px;min-width:220px;
  background:${p=>p.$won
    ?"linear-gradient(135deg,rgba(46,204,113,.95),rgba(39,174,96,.95))"
    :"linear-gradient(135deg,rgba(231,76,60,.95),rgba(192,57,43,.95))"};
  border:1px solid ${p=>p.$won?"rgba(46,204,113,.5)":"rgba(231,76,60,.5)"};
  box-shadow:0 8px 32px ${p=>p.$won?"rgba(46,204,113,.4)":"rgba(231,76,60,.4)"};
  animation:${toastSlide} 5s ease forwards;pointer-events:none;
  ${L1024}{right:12px;min-width:180px;padding:10px 14px;border-radius:12px;}
  ${L768} {right:8px; min-width:140px;padding:8px 10px; border-radius:10px;gap:8px;}
`;
const ToastIco   = styled.div`
  font-size:28px;line-height:1;flex-shrink:0;
  ${L1024}{font-size:22px;}
  ${L768} {font-size:18px;}
`;
const ToastBody  = styled.div`display:flex;flex-direction:column;gap:3px;`;
const ToastTitle = styled.div`
  font-size:15px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3);
  ${L1024}{font-size:13px;}
  ${L768} {font-size:11px;}
`;
const ToastDetails = styled.div`display:flex;flex-direction:column;gap:2px;`;
const ToastLine  = styled.div<{ $pos: boolean }>`
  font-size:13px;font-weight:600;
  color:${p=>p.$pos?"#fff":"rgba(255,255,255,.9)"};
  ${L1024}{font-size:11px;}
  ${L768} {font-size:10px;}
`;