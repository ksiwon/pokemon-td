// src/types/game.ts

export type StatusEffectType =
  | "burn"
  | "poison"
  | "paralysis"
  | "freeze"
  | "sleep"
  | "confusion";
export type DamageClass = "physical" | "special" | "status";
export type Difficulty = "easiest" | "easy" | "medium" | "hard" | "expert";
export interface ClerkOrScoutPrompt {
  towerId: string;
  waves: number;
  pokemonName: string;
  /** 시설 종류(현지화 키 분기용). 'shop'=프렌들리숍, 'contest'=콘테스트 홀. */
  facilityKey: "shop" | "contest";
}
export type PokemonRarity =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Diamond"
  | "Master"
  | "Legend";

// ─── Achievement 티어 ────────────────────────────────────────────────────────
// 매판 달성 가능한 정도에 따라 포인트 차등
// Bronze(3) : 게임마다 쉽게 달성 가능
// Silver(10) : 플레이 잘 하면 달성 가능
// Gold(25)   : 집중해야 달성 가능
// Diamond(50): 고난도 도전
// Legendary(100): 거의 불가능에 가까운 도전
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary';

export interface Synergy {
  id: string;
  name: string;
  level: number;
  count: number;
  description: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
  tickDamage?: number;
}

export interface PokemonAbility {
  name: string;
  displayName: string;
  description: string;
  effect: "crit" | "lifesteal" | "aoe" | "speed" | "tank";
  value: number;
}

export interface GameMove {
  name: string;
  displayName: string;
  type: string;
  power: number;
  accuracy: number;
  damageClass: DamageClass;
  effect: MoveEffect;
  cooldown: number;
  currentCooldown: number;
  isAOE: boolean;
  aoeRadius?: number;
  manualCast?: boolean;
}

export interface MoveEffect {
  type: "damage" | "status" | "heal" | "buff" | "debuff";
  statusInflict?: StatusEffectType;
  statusChance?: number | null;
  damageMultiplier?: number;
  additionalEffects?: string;
  drainPercent?: number;
}

export interface MapData {
  id: string;
  name: string;
  difficulty: "easiest" | "easy" | "medium" | "hard" | "expert";
  paths: Position[][];
  spawns: Position[];
  objectives: Position[];
  description: string;
  backgroundType: "grass" | "desert" | "snow" | "cave" | "water";
  backgroundImage?: string;
  /** 테라스탈 타일: 점유한 타워의 타입을 type으로 변환(원전 충실형: 방어상성+자속).
   *  type은 맵별 고정, 위치는 spots 후보들 사이로 N웨이브마다 순환(쉬는 시간에 이동). */
  teraTiles?: { type: string; spots: { x: number; y: number }[] }[];
  /** 프렌들리숍·콘테스트 홀 타일은 길에서 가장 먼 칸으로 자동 계산된다(data/maps.ts getFacilityTiles). */
  /** false면 출구(objectives) 3칸 keepout 미적용 (중앙 방어형 맵용). 기본 true. */
  objectiveKeepout?: boolean;
}

export type Gender = "male" | "female" | "genderless";

export interface GamePokemon {
  id: string;
  pokemonId: number;
  /** 배치 당시 원본(기본형) 도감번호. 진화해도 불변 — 스토리 히어로 중복 배치 판정용. */
  basePokemonId?: number;
  name: string;
  displayName: string;
  level: number;
  experience: number;
  currentHp: number;
  maxHp: number;
  baseAttack: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  types: string[];
  position: Position;
  range: number;
  sellValue: number;
  kills: number;
  damageDealt: number;
  targetEnemyId: string | null;
  isFainted: boolean;
  sprite: string;
  equippedMoves: GameMove[];
  rejectedMoves?: string[];
  statusEffect?: StatusEffect;
  rarity?: PokemonRarity;
  gender?: Gender;
  ability?: PokemonAbility;
  critChance?: number;
  critDamage?: number;
  lifesteal?: number;
  aoeBonus?: number;
  /** 테라스탈 타일 점유 시 세팅되는 변환 타입. 타일을 떠나면 제거된다. */
  teraType?: string;
  /** 장착한 지닌 도구 id(프렌들리숍에서 구매). 1포켓몬 1도구. */
  heldItem?: string;
  /** 알바 칸(프렌들리숍·레어도)에서 근무한 누적 웨이브 수(상점 등급·레어도 부스트 산정용). */
  shopWavesHeld?: number;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  baseAttack: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  position: Position;
  path: Position[];
  pathIndex: number;
  isNamed: boolean;
  isBoss: boolean;
  reward: number;
  moveSpeed: number;
  targetTowerId?: string;
  types: string[];
  sprite: string;
  range: number;
  attackCooldown: number;
  pokemonId: number;
  statusEffect?: StatusEffect;
  livesTaken?: number;
}

export interface Projectile {
  id: string;
  from: Position;
  to: Position;
  current: Position;
  damage: number;
  type: string;
  effect: MoveEffect;
  speed: number;
  targetId: string;
  isAOE: boolean;
  aoeRadius?: number;
  attackPower: number;
  damageClass: DamageClass;
  attackerTypes: string[];
  attackerId?: string;
}

export interface DamageNumber {
  id: string;
  value: number;
  position: Position;
  isCrit: boolean;
  isMiss?: boolean;
  effectiveness?: number;  // 타입 상성 배율 (0.1 / 0.5 / 1 / 2 / 4)
  lifetime: number;
}

export interface Item {
  id: string;
  name: string;
  type:
    | "heal"
    | "revive"
    | "candy"
    | "egg"
    | "stone"
    | "gold"
    | "mega-stone"
    | "max-mushroom";
  cost: number;
  effect: string;
  value?: number;
  targetPokemonId?: number;
}

// ─── Achievement (리뉴얼) ─────────────────────────────────────────────────────
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: string;
  // 기존 호환용 (단순 진행도 추적 — condition별 누적 카운터)
  progress: number;
  target: number;
  unlocked: boolean;         // 최초 1회 달성 여부 (레거시 호환)
  reward: number;            // 레거시 골드 보상 (0으로 통일, AP 포인트로 대체)
  hidden?: boolean;

  // ── 리뉴얼 필드 ─────────────────────────────────────────────────────────────
  tier: AchievementTier;              // 난이도 티어
  pointsPerCompletion: number;        // 달성 1회당 AP 포인트
  completions: number;               // 누적 달성 횟수 (매판 초기화 안 됨)
  totalPoints: number;               // completions × pointsPerCompletion (누적 AP)
}

// ─── AP 티어 포인트 상수 ──────────────────────────────────────────────────────
export const TIER_POINTS: Record<AchievementTier, number> = {
  bronze:    3,
  silver:    10,
  gold:      25,
  diamond:   50,
  legendary: 100,
};

export interface GameStats {
  totalPlayTime: number;
  enemiesKilled: number;
  pokemonUsed: number;
  highestWave: number;
  totalMoneyEarned: number;
  evolutionsAchieved: number;
  bossesDefeated: number;
  mapClears: Record<string, number>;
}

export interface SaveData {
  stats: GameStats;
  achievements: Achievement[];
  unlockedMaps: string[];
  settings: GameSettings;
  highScores: HighScore[];
  totalAP: number;           // 누적 Achievement Points
}

export interface GameSettings {
  musicVolume: number;
  gameSpeed: number;
  showDamageNumbers: boolean;
  showGrid: boolean;
  autoSave: boolean;
  language: "ko" | "en";
}

export interface HighScore {
  wave: number;
  mapId: string;
  difficulty: Difficulty;
  date: string;
  pokemonUsed: string[];
}

export interface GameState {
  wave: number;
  money: number;
  lives: number;
  towers: GamePokemon[];
  enemies: Enemy[];
  projectiles: Projectile[];
  damageNumbers: DamageNumber[];
  isWaveActive: boolean;
  isPaused: boolean;
  gameOver: boolean;
  victory: boolean;
  selectedTowerSlot: Position | null;
  availableItems: Item[];
  /** 프렌들리숍에서 구매했지만 아직 장착하지 않은 지닌 도구 id 목록(보관함). */
  heldItemInventory: string[];
  /** 통합 관리/상점 모달을 띄울 타워 id(null이면 닫힘). HUD 버튼·캔버스 클릭이 공유. */
  manageTowerId: string | null;
  clerkOrScoutPromptQueue: ClerkOrScoutPrompt[];
  currentMap: string;
  difficulty: Difficulty;
  gameSpeed: number;
  combo: number;
  gameTime: number;
  isSpawning: boolean;
  pokemonToPlace: any | null;
  timeOfDay: "day" | "night";

  skillChoiceQueue: Array<{
    towerId: string;
    newMoves: GameMove[];
  }>;

  evolutionConfirmQueue: Array<{
    towerId: string;
    evolutionOptions: Array<{
      targetId: number;
      targetName: string;
      method: string;
    }>;
  }>;
  waveEndItemPick: Item[] | null;
  evolutionToast: {
    fromName: string;
    toName: string;
    timestamp: number;
  } | null;

  wave50Clear: boolean;
  storyClear: boolean;
  storyChapterNumber: number | null;
  storyTotalWaves: number | null;
  storyEnemyTypes: string[] | null; // 스토리 챕터 적 타입 편향 목록

  activeSynergies: Synergy[];
  hoveredSynergy: Synergy | null;

  isPreloading: boolean;
  isShopDisabled: boolean;
}