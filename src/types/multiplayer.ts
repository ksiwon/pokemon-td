// src/types/multiplayer.ts
import { GameMove, PokemonAbility } from './game';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  rating: number;
  createdAt: number;
}

export interface HallOfFameEntry {
  id: string;
  userId: string;
  userName: string;
  mapId: string;
  mapName: string;
  wave: number;
  pokemonUsed: string[];
  clearTime: number;
  timestamp: number;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  mapId: string;
  clearTime?: number;
  highestWave: number;
  timestamp: number;
  rating: number;
}

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface Room {
  id: string;
  name: string;
  mapId: string;
  mapName: string;
  hostId: string;
  hostName: string;
  players: RoomPlayer[];
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  createdAt: number;
  /** 강퇴된 유저 ID 목록 — 클라이언트가 자발적 퇴장과 강퇴를 구분하는 데 사용 */
  kickedUserIds?: string[];
  /** [SEC] RTDB 보안 룰용 멤버십 맵(uid → true). 룰이 players 배열을 검사할 수 없어 별도 유지 */
  memberIds?: Record<string, boolean>;
}

export interface RoomPlayer {
  userId: string;
  userName: string;
  isReady: boolean;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  rating: number;
}

// [수정 2] 게임 페이즈 (멀티플레이어) — 'loading' 추가
export type GamePhase = 'loading' | 'shopping' | 'wave' | 'waiting_battle' | 'battle' | 'waiting_wave';

// Battle Log Entry
export interface BattleLogEntry {
  turn: number;
  attackerId: string;
  targetId: string;
  action: 'attack' | 'skill';
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
  isFainted: boolean;
  healed?: number;
  moveName?: string;
  timestamp: number;
}

// PvP 대전 결과
export interface PvPBattleResult {
  matchId: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  player1RemainingPokemon: number;
  player2RemainingPokemon: number;
  lifeLost: number;
  battleLog: BattleLogEntry[];
  rewardP1?: { gold: number; lives: number };
  rewardP2?: { gold: number; lives: number };
  timestamp: number;
}

// 라운드 매칭
export interface RoundMatchup {
  roundNumber: number;
  matches: Array<{ player1Id: string; player2Id: string }>;
  skipPlayerId: string | null;
  timestamp: number;
}

// 플레이어 간 만남 횟수 기록
export interface EncounterRecord {
  [playerId: string]: { [opponentId: string]: number };
}

export interface PlayerGameState {
  userId: string;
  userName: string;
  wave: number;
  lives: number;
  money: number;
  towers: number;
  isAlive: boolean;
  rating: number;
  placement?: number;
  ratingChange?: number;
  waveCompleted?: boolean;
  /**
   * [REWARD-LEDGER] 서버가 지금까지 이 플레이어에게 확정한 PvP 보상의 **누적합**.
   * submitBattleResult 트랜잭션만 쓴다(클라 쓰기 금지 — CLIENT_WRITABLE_PLAYER_FIELDS 밖).
   * 라운드별 battleResults 는 startWaitingWavePhase 가 2라운드마다 잘라내므로
   * "내가 못 받은 보상"을 라운드 목록으로는 알 수 없다. 누적합이라 잘려도 남는다.
   */
  rewardLedger?: { gold: number; lives: number; round: number };
  /**
   * [REWARD-LEDGER] 클라가 로컬 money/lives 에 **이미 반영한** 누적합.
   * ⚠ lives/money 와 반드시 같은 트랜잭션으로 올라가야 한다(flushPlayerState 한 번에).
   *   따로 올라가면 "페널티는 반영됐는데 마커는 안 올라감" → 재접속 시 이중 적용된다.
   */
  appliedReward?: { gold: number; lives: number };
  battleRecord?: {
    wins: number;
    losses: number;
    // [NEW-3 FIX] 실제 연속 승/패 수 — 승리 시 currentWinStreak++/currentLoseStreak 리셋,
    // 패배 시 currentLoseStreak++/currentWinStreak 리셋
    currentWinStreak: number;
    currentLoseStreak: number;
  };
}

export interface MultiplayerGameState {
  roomId: string;
  players: PlayerGameState[];
  startTime: number;
  rankings: string[];
  currentRound: number;
  currentPhase: GamePhase;
  roundMatchups?: RoundMatchup;
  encounterRecord: EncounterRecord;
  battleResults: PvPBattleResult[];
  phaseEndTime?: number | null;
  loadingReady?: Record<string, boolean>;
  battleStartTime?: number | null;  // [V8] TFT Arena fighting 시작 서버 시각 (양측 동기화용)
}

/**
 * 와이어를 타는 특성. `description`(수백 바이트 설명문)은 뺀 압축본이다 —
 * 타워 상세는 3초마다 보드 전체가 올라가므로 설명문까지 실으면 프리티어 대역폭이 아깝다.
 * 재접속 복원 시 파생값(critChance/lifesteal/aoeBonus)을 다시 계산하는 데 필요한 것만 담는다.
 */
export interface WireAbility {
  name: string;
  displayName: string;
  effect: PokemonAbility['effect'];
  value: number;
}

export interface TowerDetail {
  pokemonId: number;
  name: string;
  level: number;
  sprite: string;
  position: { x: number; y: number };
  currentHp: number;
  maxHp: number;
  isFainted: boolean;
  // PvP 대전용 추가 정보
  attack?: number;
  defense?: number;
  specialAttack?: number;
  specialDefense?: number;
  speed?: number;
  types?: string[];
  equippedMoves?: GameMove[];
  lifesteal?: number;
  aoeBonus?: number;
  critChance?: number;
  /**
   * [REJOIN-FIX] 특성 원본. 전투 엔진은 위의 파생값만 읽으므로 전투에는 쓰이지 않는다.
   * 오직 재접속 복원용 — 예전엔 이 필드가 없어 GameLayout 이 `ability: ""` 로 복원했고,
   * 그 직후 buildTowerDetails 가 파생값을 0/기본값으로 재계산해 특성이 영구 소실됐다.
   */
  ability?: WireAbility | null;
}