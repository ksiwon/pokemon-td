// sim/multi/orchestrator.ts
// 멀티플레이 로컬 재현 — Firebase 없이 페이즈 머신을 순차 실행한다.
//   waiting_wave → wave(전원, 실제 GameManager/WaveSystem으로 순차 실행)
//   → 3라운드마다 battle(매칭=pvpBattleService.generateMatchups, 전투=arenaSim,
//     보상=calcBattleRewards, bye=+50G) → 탈락/순위 → 최후 1인
//
// 실서비스와의 대응:
//   PvE  : 인간 클라이언트와 동일 엔진(GameManager). 플레이어별 스토어 스냅샷 교체 방식.
//   PvP  : 인간 매치 엔진(arenaSim, 시너지 적용) 기본. engine='service'로 AI매치 엔진 비교 가능.
//   보상 : src/services/battleRewards.ts (실코드 단일 출처).
//   매칭 : PvPBattleService.generateMatchups (실코드).

import { vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { GameManager } from '../../src/game/GameManager';
import { WaveSystem } from '../../src/game/WaveSystem';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { pvpBattleService, deriveBattleSeed } from '../../src/services/PvPBattleService';
import { calcBattleRewards } from '../../src/services/battleRewards';
import { buildTowerDetails } from '../../src/game/towerFactory';
import { GamePokemon } from '../../src/types/game';
import { PlayerGameState, EncounterRecord } from '../../src/types/multiplayer';
import { runOneWave, resolveQueues, flushAsync } from '../single/runner';
import { BotPolicy, PERSONAS } from '../single/botPolicies';
import { runArenaBattle } from '../pvp/arenaRunner';

const BATTLE_WAVE_INTERVAL = 3; // MultiplayerService와 동일
const BYE_GOLD = 50;            // GameLayout bye 보너스와 동일

interface StoreSnapshot {
  towers: GamePokemon[];
  money: number;
  lives: number;
  wave: number;
  heldItemInventory: string[];
  gameTime: number;
}

export interface SimPlayer {
  userId: string;
  persona: string;
  policy: BotPolicy;
  snapshot: StoreSnapshot;
  state: PlayerGameState;
  // ── 계측 ──
  pveLivesLost: number;
  pvpLivesLost: number;
  battleGold: number;         // 승리보상+위로금+bye 합계
  battleResults: Array<{ round: number; won: boolean; bye?: boolean }>;
  eliminatedRound: number | null;
  livesHistory: Array<{ round: number; lives: number; gold: number }>;
}

export interface MultiGameResult {
  seed: number;
  engine: 'arena' | 'service';
  rounds: number;
  battles: number;
  winnerPersona: string | null;
  players: Array<{
    userId: string; persona: string; placement: number;
    eliminatedRound: number | null;
    pveLivesLost: number; pvpLivesLost: number; battleGold: number;
    wins: number; losses: number;
    battleResults: Array<{ round: number; won: boolean; bye?: boolean }>;
    livesHistory: Array<{ round: number; lives: number; gold: number }>;
  }>;
}

function takeSnapshot(): StoreSnapshot {
  const s = useGameStore.getState();
  return structuredClone({
    towers: s.towers, money: s.money, lives: s.lives, wave: s.wave,
    heldItemInventory: s.heldItemInventory, gameTime: s.gameTime,
  });
}

function loadSnapshot(sn: StoreSnapshot) {
  useGameStore.setState({
    towers: structuredClone(sn.towers),
    money: sn.money,
    lives: sn.lives,
    wave: sn.wave,
    heldItemInventory: [...sn.heldItemInventory],
    gameTime: sn.gameTime,
    enemies: [], projectiles: [], damageNumbers: [],
    isWaveActive: false, isSpawning: false, isPaused: false,
    gameOver: false, victory: false, wave50Clear: false, storyClear: false,
    skillChoiceQueue: [], evolutionConfirmQueue: [],
    clerkOrScoutPromptQueue: [], waveEndItemPick: null,
    combo: 0,
  });
  useGameStore.getState().updateActiveSynergies();
}

export interface MultiGameOptions {
  seed: number;
  /** 페르소나 이름 8개 (팟 구성) */
  pod: string[];
  mapId: string;
  engine?: 'arena' | 'service';
  maxRounds?: number;
  stepSec?: number;
}

export async function runMultiGame(opts: MultiGameOptions): Promise<MultiGameResult> {
  const { seed, pod, mapId, engine = 'arena', maxRounds = 45, stepSec = 0.1 } = opts;

  setRngSource(mulberry32(seed));
  vi.useFakeTimers({ now: 1_760_000_000_000 });

  try {
    // ── 초기화 ────────────────────────────────────────────────────────────
    const store = () => useGameStore.getState();
    store().reset();
    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();
    GameManager.getInstance().resetState();
    WaveSystem.getInstance().cancelPendingSpawns();
    store().setMap(mapId);
    useGameStore.setState({ gameSpeed: 1, isPaused: false });

    const baseSnapshot = takeSnapshot(); // 500G/50라이프/빈 보드

    const players: SimPlayer[] = pod.map((persona, i) => ({
      userId: `p${i}_${persona}`,
      persona,
      policy: PERSONAS[persona](),
      snapshot: structuredClone(baseSnapshot),
      state: {
        userId: `p${i}_${persona}`, userName: persona, wave: 0,
        lives: 50, money: 500, towers: 0, isAlive: true, rating: 1000,
        battleRecord: { wins: 0, losses: 0, currentWinStreak: 0, currentLoseStreak: 0 },
      },
      pveLivesLost: 0, pvpLivesLost: 0, battleGold: 0,
      battleResults: [], eliminatedRound: null,
      livesHistory: [],
    }));

    let encounterRecord: EncounterRecord = {};
    let lastSkipPlayerId: string | null = null;
    let battles = 0;
    let round = 0;

    const alivePlayers = () => players.filter(p => p.state.isAlive);

    const eliminate = (p: SimPlayer, atRound: number) => {
      if (!p.state.isAlive) return;
      p.state.isAlive = false;
      p.state.placement = alivePlayers().length + 1; // 탈락 시점 생존자 수 + 1
      p.eliminatedRound = atRound;
    };

    // ── 라운드 루프 ───────────────────────────────────────────────────────
    while (round < maxRounds && alivePlayers().length > 1) {
      round++;

      // wave 페이즈: 생존자 전원 순차 실행 (실게임은 병렬 — 결과 동치)
      for (const p of alivePlayers()) {
        loadSnapshot(p.snapshot);
        useGameStore.setState({ wave: round - 1 }); // nextWave()가 round로 올림

        await resolveQueues(p.policy);
        await p.policy.prepare();
        await flushAsync();

        const livesBefore = store().lives;
        await runOneWave({ stepSec, policy: p.policy });
        await resolveQueues(p.policy);

        const s = store();
        p.pveLivesLost += Math.max(0, livesBefore - s.lives);
        p.snapshot = takeSnapshot();
        p.state.lives = s.lives;
        p.state.money = s.money;
        p.state.wave = round;
        p.state.towers = s.towers.length;

        if (s.lives <= 0) eliminate(p, round);
      }
      if (alivePlayers().length <= 1) break;

      // battle 페이즈: 3라운드마다
      if (round % BATTLE_WAVE_INTERVAL === 0) {
        const states = players.map(p => p.state);
        const matchup = pvpBattleService.generateMatchups(states, encounterRecord, round, lastSkipPlayerId);
        lastSkipPlayerId = matchup.skipPlayerId;

        // bye 보너스
        if (matchup.skipPlayerId) {
          const byeP = players.find(p => p.userId === matchup.skipPlayerId);
          if (byeP) {
            byeP.snapshot.money += BYE_GOLD;
            byeP.state.money += BYE_GOLD;
            byeP.battleGold += BYE_GOLD;
            byeP.battleResults.push({ round, won: true, bye: true });
          }
        }

        for (const m of matchup.matches) {
          battles++;
          const A = players.find(p => p.userId === m.player1Id)!;
          const B = players.find(p => p.userId === m.player2Id)!;

          const detailsA = buildTowerDetails(A.snapshot.towers);
          const detailsB = buildTowerDetails(B.snapshot.towers);
          const battleSeed = deriveBattleSeed(round, A.userId, B.userId);

          let aWon: boolean; let aRemain: number; let bRemain: number;
          if (engine === 'arena') {
            const out = runArenaBattle(detailsA, detailsB, battleSeed);
            aWon = out.myWon; aRemain = out.myRemaining; bRemain = out.oppRemaining;
          } else {
            const r = pvpBattleService.simulateBattle(detailsA, detailsB, A.userId, B.userId, round);
            aWon = r.winnerId === A.userId;
            aRemain = r.player1RemainingPokemon; bRemain = r.player2RemainingPokemon;
          }

          const applyOutcome = (p: SimPlayer, won: boolean, myR: number, oppR: number) => {
            const { goldDelta, livesDelta } = calcBattleRewards(p.state, won, myR, oppR);
            p.snapshot.money += goldDelta;
            p.snapshot.lives = Math.max(0, p.snapshot.lives + livesDelta);
            p.state.money = p.snapshot.money;
            p.state.lives = p.snapshot.lives;
            p.battleGold += goldDelta;
            p.pvpLivesLost += Math.max(0, -livesDelta);
            const rec = p.state.battleRecord!;
            if (won) {
              rec.wins++; rec.currentWinStreak++; rec.currentLoseStreak = 0;
            } else {
              rec.losses++; rec.currentLoseStreak++; rec.currentWinStreak = 0;
            }
            p.battleResults.push({ round, won });
            if (p.snapshot.lives <= 0) eliminate(p, round);
          };

          applyOutcome(A, aWon, aRemain, bRemain);
          applyOutcome(B, !aWon, bRemain, aRemain);
          encounterRecord = pvpBattleService.updateEncounterRecord(encounterRecord, A.userId, B.userId);
        }
      }

      for (const p of players) {
        p.livesHistory.push({ round, lives: p.state.isAlive ? p.snapshot.lives : 0, gold: p.snapshot.money });
      }
    }

    // 우승자 placement=1
    const winner = alivePlayers()[0] ?? null;
    if (winner) { winner.state.placement = 1; winner.eliminatedRound = null; }
    // maxRounds 도달로 다수 생존 시: 라이프 순 순위
    const unranked = players.filter(p => p.state.isAlive && p.state.placement !== 1);
    unranked.sort((a, b) => b.snapshot.lives - a.snapshot.lives);
    unranked.forEach((p, i) => { p.state.placement = 2 + i; });

    return {
      seed, engine, rounds: round, battles,
      winnerPersona: winner?.persona ?? null,
      players: players.map(p => ({
        userId: p.userId, persona: p.persona,
        placement: p.state.placement ?? 99,
        eliminatedRound: p.eliminatedRound,
        pveLivesLost: p.pveLivesLost, pvpLivesLost: p.pvpLivesLost,
        battleGold: p.battleGold,
        wins: p.state.battleRecord?.wins ?? 0,
        losses: p.state.battleRecord?.losses ?? 0,
        battleResults: p.battleResults,
        livesHistory: p.livesHistory,
      })),
    };
  } finally {
    try { WaveSystem.getInstance().cancelPendingSpawns(); } catch { /* ignore */ }
    vi.useRealTimers();
    setRngSource(null);
  }
}
