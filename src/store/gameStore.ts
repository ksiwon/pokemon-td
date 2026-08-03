// src/store/gameStore.ts
import { create } from 'zustand';
import {
  GameState, GamePokemon, Enemy, Projectile, DamageNumber,
  Difficulty, Item, GameMove, Synergy, ClerkOrScoutPrompt, Position
} from '../types/game';
import {
  EVOLUTION_CHAINS, FUSION_DATA,
  canMegaEvolve, canGigantamax, canEvolve
} from '../data/evolution';

import { pokeAPI } from '../api/pokeapi';
import { saveService } from '../services/SaveService';
import { calculateActiveSynergies } from '../utils/synergyManager';
import { getMapById, getBuildableTiles } from '../data/maps';
import { facilityTilesOfMap, isWorkLocked } from '../utils/facility.utils';
import { rng } from '../utils/rng';
import { BALANCE_OVERRIDES } from '../game/balanceOverrides';
import { ACHIEVEMENTS } from '../data/achievements';
import { achievementService } from '../services/AchievementService';

// [V8-FIX-1-7] MAX_LIVES_CAP: 라이프 상한 (addLives에서 사용)
// INITIAL_LIVES_SINGLE과 값이 같지만 의미를 명확히 분리
export const MAX_LIVES_CAP = 50;
// 싱글플레이 초기 라이프 (업적 체크 기준값으로 사용)
export const INITIAL_LIVES_SINGLE = MAX_LIVES_CAP;

// 레벨업에 필요한 XP — 플랫 100 (v2.14에서 티어드 곡선 폐기, 원래 값 복원).
// [BALANCE 2026-07-12] 의도된 플레이: 킬XP 자연 성장으로 ~w33 만렙 → 이후
//   낡은 타워를 하나씩 팔고 새로 사서 경험사탕으로 즉시 만렙 캐치업하는 순환.
//   티어드 곡선(구간당 +100)은 이 순환을 죽이고 "만렙 불가" 게임을 만들었음
//   (50웨이브 자연 XP ≈ 22,400 vs 티어드 요구 54,000).
export const xpToNextLevel = (_level: number) => 100;

interface GameStore extends GameState {
  addTower: (tower: GamePokemon) => void;
  updateTower: (id: string, updates: Partial<GamePokemon>) => void;
  removeTower: (id: string) => void;
  sellTower: (id: string) => boolean;
  addEnemy: (enemy: Enemy) => void;
  updateEnemy: (id: string, updates: Partial<Enemy>) => void;
  removeEnemy: (id: string) => void;
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  addDamageNumber: (dmg: DamageNumber) => void;
  removeDamageNumber: (id: string) => void;
  addMoney: (amount: number) => void;
  spendMoney: (amount: number) => boolean;
  addLives: (amount: number) => void;
  spendLives: (amount: number) => boolean;
  setMap: (mapId: string) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setGameSpeed: (speed: number) => void;
  nextWave: () => void;
  reset: () => void;
  incrementGameTime: (dt: number) => void;
  setPokemonToPlace: (pokemon: any | null) => void;
  addSkillChoice: (choice: { towerId: string; newMoves: GameMove[] }) => void;
  removeCurrentSkillChoice: () => void;
  setWaveEndItemPick: (items: Item[] | null) => void;
  useItem: (itemType: string, targetTowerId?: string) => boolean;
  useRewardItem: (itemType: string, targetTowerId: string) => boolean;
  addHeldItem: (id: string) => void;
  equipHeldItem: (towerId: string, id: string) => void;
  unequipHeldItem: (towerId: string) => void;
  setManageTowerId: (id: string | null) => void;
  addClerkOrScoutPrompt: (prompt: ClerkOrScoutPrompt) => void;
  resolveClerkOrScoutPrompt: (towerId: string, withdraw: boolean) => { success: boolean; message?: string };
  /**
   * 회수를 고른 뒤 플레이어가 직접 칸을 찍기를 기다리는 타워 id 목록.
   * 숍·콘테스트가 같은 웨이브에 동시에 마일스톤을 찍을 수 있어 큐로 둔다(선두부터 한 마리씩 배치).
   */
  pendingWorkWithdrawIds: string[];
  /** 회수 시작(마일스톤 모달 / 최고 등급 시설 모달 공용) — 배치 모드로 넘긴다. */
  beginWorkWithdraw: (towerId: string) => { success: boolean; message?: string };
  /** 큐 선두 타워의 회수 확정. position 지정 시 그 칸으로, 생략 시 임의의 빈 칸으로(폴백). */
  completeWorkWithdraw: (position?: Position) => void;
  healAllTowers: () => void;
  addXpToTower: (towerId: string, xp: number) => void;
  evolvePokemon: (towerId: string, item?: string, targetId?: number) => Promise<boolean>;
  removeEvolutionConfirm: () => void;
  fusePokemon: (baseId: string, materialId: string, item: string) => Promise<boolean>;
  setSpawning: (isSpawning: boolean) => void;
  updateActiveSynergies: () => void;
  setHoveredSynergy: (synergy: Synergy | null) => void;
  setPreloading: (isLoading: boolean) => void;

  // [리뉴얼] 업적 토스트 — AP 포인트 + 최초 달성 여부 포함
  achievementToast: {
    name: string;
    earnedAP: number;
    isFirstTime: boolean;
    timestamp: number;
  } | null;
  showAchievementToast: (name: string, earnedAP?: number, isFirstTime?: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // ─── 초기 상태 ───────────────────────────────────────────────────
  wave: 0,
  money: 500,
  lives: INITIAL_LIVES_SINGLE,
  towers: [],
  enemies: [],
  projectiles: [],
  damageNumbers: [],
  isWaveActive: false,
  isPaused: false,
  gameOver: false,
  victory: false,
  selectedTowerSlot: null,
  availableItems: [],
  heldItemInventory: [],
  manageTowerId: null,
  clerkOrScoutPromptQueue: [],
  pendingWorkWithdrawIds: [],
  currentMap: 'beginner',
  difficulty: 'medium',
  gameSpeed: saveService.load().settings.gameSpeed || 1,
  combo: 0,
  gameTime: 0,
  isSpawning: false,
  pokemonToPlace: null,
  skillChoiceQueue: [],
  waveEndItemPick: null,
  evolutionToast: null,
  achievementToast: null,
  wave50Clear: false,
  storyClear: false,        // story 챕터 클리어 트리거
  storyChapterNumber: null as number | null,  // 현재 스토리 챕터 번호
  storyTotalWaves: null as number | null,     // 이 챕터의 목표 웨이브 수
  storyEnemyTypes: null as string[] | null,   // 챕터별 적 타입 편향
  timeOfDay: 'day',
  evolutionConfirmQueue: [],
  activeSynergies: [],
  hoveredSynergy: null,
  isPreloading: false,
  isShopDisabled: false,

  // ─── 타워 ─────────────────────────────────────────────────────────
  addTower: (tower) => {
    set(state => ({ towers: [...state.towers, tower] }));
    get().updateActiveSynergies();
  },

  updateTower: (id, updates) => {
    let needsSynergyUpdate = false;
    set(state => ({
      towers: state.towers.map(t => {
        if (t.id !== id) return t;
        // 시너지 재계산 트리거: 기절 상태 변경 OR 진화/합체로 종족·타입 변경 시
        // (기존엔 isFainted만 봤어서 진화 후 새 타입/세대 시너지가 갱신 안 되던 버그)
        if (
          (updates.isFainted !== undefined && t.isFainted !== updates.isFainted) ||
          (updates.pokemonId !== undefined && t.pokemonId !== updates.pokemonId) ||
          (updates.types !== undefined && t.types !== updates.types)
        ) {
          needsSynergyUpdate = true;
        }
        return { ...t, ...updates };
      }),
    }));
    if (needsSynergyUpdate) get().updateActiveSynergies();
  },

  removeTower: (id) => {
    const tower = get().towers.find(t => t.id === id);
    if (tower?.heldItem) {
      set(state => ({ heldItemInventory: [...state.heldItemInventory, tower.heldItem!] }));
    }
    set(state => ({ towers: state.towers.filter(t => t.id !== id) }));
    get().updateActiveSynergies();
  },

  sellTower: (id) => {
    // 웨이브 진행 중에는 어떤 포켓몬도 보드에서 뺄 수 없다(재배치 잠금과 일관).
    if (get().isWaveActive) return false;
    const tower = get().towers.find(t => t.id === id);
    if (!tower) return false;

    // 알바 타일(프렌들리숍 ∪ 콘테스트 홀)에 갇혀있을 때에는 판매 불가.
    // 단 최고 등급(15웨이브)을 채웠으면 잠금이 풀려 판매도 가능하다.
    if (isWorkLocked(tower, get().currentMap)) return false;

    // [SELL-FIX] 판매가 = max(레벨가치, 구매가의 절반). 기존엔 level*20만 써서
    //   갓 산 고레어(예: 250G 전설)를 20G(92% 손실)에 팔게 됐음. sellValue(구매가×0.5)를 하한으로.
    const sellPrice = Math.max(tower.level * 20, tower.sellValue || 0);
    get().addMoney(sellPrice);
    get().removeTower(id);
    achievementService.onSell();
    return true;
  },

  // ─── 적 ───────────────────────────────────────────────────────────
  addEnemy: (enemy) => set(state => ({ enemies: [...state.enemies, enemy] })),
  updateEnemy: (id, updates) =>
    set(state => ({
      enemies: state.enemies.map(e => e.id === id ? { ...e, ...updates } : e),
    })),
  removeEnemy: (id) =>
    set(state => ({ enemies: state.enemies.filter(e => e.id !== id) })),

  // ─── 투사체 / 데미지 숫자 ─────────────────────────────────────────
  addProjectile: (p) => set(state => ({ projectiles: [...state.projectiles, p] })),
  removeProjectile: (id) =>
    set(state => ({ projectiles: state.projectiles.filter(p => p.id !== id) })),
  addDamageNumber: (dmg) =>
    set(state => ({ damageNumbers: [...state.damageNumbers, dmg] })),
  removeDamageNumber: (id) =>
    set(state => ({ damageNumbers: state.damageNumbers.filter(d => d.id !== id) })),

  // ─── 골드 ─────────────────────────────────────────────────────────
  addMoney: (amount) => set(state => ({ money: state.money + amount })),
  spendMoney: (amount) => {
    if (get().money >= amount) {
      set(state => ({ money: state.money - amount }));
      return true;
    }
    return false;
  },

  // [BUG-1 FIX] Math.max(0, ...) 추가 — 음수 livesDelta(패배 시)가 전달돼도
  // lives가 0 미만이 되지 않도록 보호. 상한(MAX_LIVES_CAP)과 하한(0) 모두 보장.
  addLives: (amount) => set(state => ({
    lives: Math.max(0, Math.min(MAX_LIVES_CAP, state.lives + amount)),
  })),
  spendLives: (amount) => {
    set(state => ({ lives: Math.max(0, state.lives - amount) }));
    return true;
  },


  // ─── 설정 ─────────────────────────────────────────────────────────
  setMap: (mapId) => set({ currentMap: mapId }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setGameSpeed: (speed) => {
    set({ gameSpeed: speed });
    saveService.save({ settings: { ...saveService.load().settings, gameSpeed: speed } });
  },

  nextWave: () => {
    const newWave = get().wave + 1;
    set(state => ({
      wave: newWave,
      isWaveActive: true,
      timeOfDay: state.timeOfDay === 'day' ? 'night' : 'day',
    }));

    // 웨이브 도달 업적 체크
    const waveAchievements = ACHIEVEMENTS.filter(
      a => a.condition === 'wave' && a.id !== 'wave50'
    );
    for (const ach of waveAchievements) {
      if (newWave >= ach.target) {
        saveService.updateAchievement(ach.id, ach.target);
      }
    }
  },

  reset: () => {
    // [BUG-C2] GameManager 싱글턴 내부 상태도 함께 초기화.
    // pendingStats, statFlushTimer, isCompletingWave 가 이전 게임에서 누적되던 버그 수정.
    // 동적 import로 순환 참조 방지 (GameManager → gameStore 역방향 의존성)
    import('../game/GameManager').then(({ GameManager }) => {
      GameManager.getInstance().resetState();
    }).catch(() => {});
    // [GHOST-FIX] 이전 게임의 미실행 스폰 타이머 취소 + epoch 증가.
    //   후반 웨이브는 스폰 스케줄이 최대 ~60초까지 이어지는데, 재시작 시 취소하지 않으면
    //   옛 타이머가 살아남아 '이전 맵 경로'를 가진 유령 적을 새 게임에 밀어 넣어 라이프를 깎았음.
    import('../game/WaveSystem').then(({ WaveSystem }) => {
      WaveSystem.getInstance().cancelPendingSpawns();
    }).catch(() => {});

    set({
      wave: 0,
      money: 500,
      lives: INITIAL_LIVES_SINGLE,
      towers: [],
      enemies: [],
      projectiles: [],
      damageNumbers: [],
      isWaveActive: false,
      isPaused: false,
      gameOver: false,
      victory: false,
      combo: 0,
      gameTime: 0,
      isSpawning: false,
      pokemonToPlace: null,
      skillChoiceQueue: [],
      waveEndItemPick: null,
      evolutionToast: null,
      achievementToast: null,
      wave50Clear: false,
      storyClear: false,
      storyChapterNumber: null,
      storyTotalWaves: null,
      storyEnemyTypes: null,
      timeOfDay: 'day',
      evolutionConfirmQueue: [],
      activeSynergies: [],
      hoveredSynergy: null,
      isPreloading: false,
      isShopDisabled: false,
      heldItemInventory: [],
      manageTowerId: null,
      clerkOrScoutPromptQueue: [],
      pendingWorkWithdrawIds: [],
    });
  },

  // ─── 지닌 도구 보관함 ──────────────────────────────────────────────
  setManageTowerId: (id) => set({ manageTowerId: id }),
  addHeldItem: (id) => set(state => ({ heldItemInventory: [...state.heldItemInventory, id] })),
  equipHeldItem: (towerId, id) => {
    const { towers, heldItemInventory } = get();
    const idx = heldItemInventory.indexOf(id);
    if (idx === -1) return;
    const tower = towers.find(t => t.id === towerId);
    if (!tower) return;
    // 보관함에서 1개 빼고, 기존 장착품이 있으면 보관함으로 되돌린다.
    const nextInv = [...heldItemInventory];
    nextInv.splice(idx, 1);
    if (tower.heldItem) nextInv.push(tower.heldItem);
    set({ heldItemInventory: nextInv });
    get().updateTower(towerId, { heldItem: id });
  },
  unequipHeldItem: (towerId) => {
    const tower = get().towers.find(t => t.id === towerId);
    if (!tower?.heldItem) return;
    set(state => ({ heldItemInventory: [...state.heldItemInventory, tower.heldItem!] }));
    get().updateTower(towerId, { heldItem: undefined });
  },

  incrementGameTime: (dt) =>
    set(state => ({ gameTime: state.gameTime + dt * 1000 })),

  setSpawning: (isSpawning) => set({ isSpawning }),
  setPokemonToPlace: (pokemon) => set({ pokemonToPlace: pokemon }),

  addSkillChoice: (choice) =>
    set(state => ({ skillChoiceQueue: [...state.skillChoiceQueue, choice] })),
  removeCurrentSkillChoice: () =>
    set(state => ({ skillChoiceQueue: state.skillChoiceQueue.slice(1) })),
  setWaveEndItemPick: (items) => set({ waveEndItemPick: items }),

  // ─── [리뉴얼] 업적 토스트 ────────────────────────────────────────
  showAchievementToast: (name, earnedAP = 3, isFirstTime = false) => {
    set({
      achievementToast: {
        name,
        earnedAP,
        isFirstTime,
        timestamp: Date.now(),
      },
    });
    setTimeout(() => {
      const cur = get().achievementToast;
      if (cur && Date.now() - cur.timestamp >= 4000) {
        set({ achievementToast: null });
      }
    }, 4500);
  },

  // ─── 아이템 사용 ──────────────────────────────────────────────────
  useItem: (itemType, targetTowerId) => {
    if (!targetTowerId) return false;
    const towers = get().towers;
    if (
      towers.length === 0 &&
      itemType !== 'potion' &&
      itemType !== 'potion_good' &&
      itemType !== 'potion_super'
    )
      return false;

    if (itemType === 'potion') {
      if (!get().spendMoney(20)) return false;
      const target = targetTowerId
        ? towers.find(t => t.id === targetTowerId && !t.isFainted)
        : towers.filter(t => !t.isFainted).sort(
            (a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp
          )[0];
      if (target) {
        const newHp = Math.min(target.maxHp, target.currentHp + 30);
        get().updateTower(target.id, { currentHp: newHp });
        return true;
      }
      get().addMoney(20);
      return false;
    }

    if (itemType === 'potion_good') {
      if (!get().spendMoney(100)) return false;
      const target = targetTowerId
        ? towers.find(t => t.id === targetTowerId && !t.isFainted)
        : towers.filter(t => !t.isFainted).sort(
            (a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp
          )[0];
      if (target) {
        const healAmount = Math.max(150, Math.floor(target.maxHp * 0.1));
        const newHp = Math.min(target.maxHp, target.currentHp + healAmount);
        get().updateTower(target.id, { currentHp: newHp });
        return true;
      }
      get().addMoney(100);
      return false;
    }

    if (itemType === 'potion_super') {
      if (!get().spendMoney(500)) return false;
      const target = targetTowerId
        ? towers.find(t => t.id === targetTowerId && !t.isFainted)
        : towers.filter(t => !t.isFainted).sort(
            (a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp
          )[0];
      if (target) {
        const newHp = Math.min(target.maxHp, target.currentHp + Math.floor(target.maxHp * 0.5));
        get().updateTower(target.id, { currentHp: newHp });
        return true;
      }
      get().addMoney(500);
      return false;
    }

    if (itemType === 'revive') {
      const target = towers.find(t => t.id === targetTowerId);
      if (target && target.isFainted) {
        const cost = target.level * 10;
        if (!get().spendMoney(cost)) return false;
        get().updateTower(targetTowerId, {
          isFainted: false,
          currentHp: Math.floor(target.maxHp * 0.5),
        });
        return true;
      }
      return false;
    }

    if (itemType === 'candy') {
      const target = towers.find(t => t.id === targetTowerId);
      if (target && !target.isFainted && target.level < 100) {
        // 시뮬 밸런스 실험 오버라이드 — 프로덕션은 미설정 = 레벨×25 유지
        const cost = target.level * (BALANCE_OVERRIDES.candyCostPerLevel ?? 25);
        if (!get().spendMoney(cost)) return false;
        // 가격은 레벨×25 그대로. XP는 새 곡선 기준으로 정확히 +1레벨만큼 지급.
        get().addXpToTower(targetTowerId, xpToNextLevel(target.level));
        return true;
      }
      return false;
    }

    if (itemType === 'exp_candy') {
      const aliveTowers = towers.filter(t => !t.isFainted);
      if (aliveTowers.length < 2) return false;

      const target = towers.find(t => t.id === targetTowerId);
      if (!target || target.isFainted) return false;

      // 현재 타겟보다 높은 레벨들 중 가장 낮은 레벨 찾기
      const higherLevels = [...new Set(aliveTowers.map(t => t.level))]
        .filter(lvl => lvl > target.level)
        .sort((a, b) => a - b);

      if (higherLevels.length === 0) return false;
      const nextTargetLevel = higherLevels[0];

      const cost = nextTargetLevel * 50;
      if (!get().spendMoney(cost)) return false;

      // 목표 레벨까지 필요한 정확한 경험치 계산 (새 곡선 기준 — 딱 목표레벨까지)
      let totalXpNeeded = 0;
      for (let lvl = target.level; lvl < nextTargetLevel; lvl++) {
        totalXpNeeded += xpToNextLevel(lvl);
      }
      const xpToApply = Math.max(0, totalXpNeeded - target.experience);

      get().addXpToTower(target.id, xpToApply);
      return true;
    }


    return false;
  },

  useRewardItem: (itemType, targetTowerId) => {
    if (!targetTowerId) return false;
    const towers = get().towers;
    const target = towers.find(t => t.id === targetTowerId);
    if (!target) return false;

    if (itemType === 'candy') {
      get().addXpToTower(targetTowerId, xpToNextLevel(target.level)); // 정확히 +1레벨
      return true;
    }

    if (itemType === 'revive') {
      if (!target.isFainted) return false;
      get().updateTower(targetTowerId, {
        isFainted: false,
        currentHp: Math.floor(target.maxHp * 0.5),
      });
      return true;
    }

    return false;
  },

  healAllTowers: () => {
    const { towers, updateTower } = get();
    towers.forEach(t => {
      // [T11-REVERTED] isFainted 부활은 여기서 하지 않음.
      // 이유: healAllTowers는 WaveEndPicker 표시 직전에 호출됨 →
      //   전원 부활하면 revive 아이템의 유효 대상이 사라져 선택 불가 UX 버그 발생.
      // TFT 페어니스(기절 포켓몬 포함 전투)는 buildUnits에서 fainted:false로 처리.
      if (!t.isFainted) {
        updateTower(t.id, { currentHp: t.maxHp });
      }
    });
  },

  addXpToTower: (towerId, xp) => {
    const { towers, updateTower, addSkillChoice } = get();
    const tower = towers.find(t => t.id === towerId);
    if (!tower || tower.isFainted || tower.level >= 100) return;

    let newXp = tower.experience + xp;
    let currentLevel = tower.level;
    let currentMaxHp = tower.maxHp;
    let currentAttack = tower.attack;
    let currentBaseAttack = tower.baseAttack;
    let currentSpecialAttack = tower.specialAttack;
    let currentHp = tower.currentHp;
    // [FIX] 방어·특방·스피드도 레벨업 시 성장
    let currentDefense = tower.defense;
    let currentSpecialDefense = tower.specialDefense;
    const currentSpeed = tower.speed; // 속도는 레벨업으로 변하지 않음 (고정)

    const levelUps: number[] = [];

    while (currentLevel < 100) {
      const need = xpToNextLevel(currentLevel);
      if (newXp >= need) {
        newXp -= need;
        currentLevel++;
        levelUps.push(currentLevel);

        // 레벨당 성장: 속도 제외 전 스탯 ×1.05(+5%). 속도는 고정.
        const hpIncrease     = Math.floor(currentMaxHp * 0.05);
        const atkIncrease    = Math.floor(currentAttack * 0.05);
        const defIncrease    = Math.floor(currentDefense * 0.05);
        const spAtkIncrease  = Math.floor(currentSpecialAttack * 0.05);
        const spDefIncrease  = Math.floor(currentSpecialDefense * 0.05);

        currentMaxHp           += hpIncrease;
        currentHp              += hpIncrease;
        currentAttack          += atkIncrease;
        currentBaseAttack      += atkIncrease;
        currentSpecialAttack   += spAtkIncrease;
        currentDefense         += defIncrease;
        currentSpecialDefense  += spDefIncrease;
        // 속도(currentSpeed)는 레벨업 성장 없음 (고정)
      } else {
        break;
      }
    }

    updateTower(towerId, {
      level: currentLevel,
      experience: newXp,
      maxHp: currentMaxHp,
      currentHp: Math.min(currentHp, currentMaxHp),
      attack: currentAttack,
      baseAttack: currentBaseAttack,
      specialAttack: currentSpecialAttack,
      defense: currentDefense,
      specialDefense: currentSpecialDefense,
      speed: currentSpeed,
    });

    if (levelUps.length > 0) {
      // 레벨업 업적 체크
      if (currentLevel >= 50) saveService.updateAchievement('level50', 1);
      if (currentLevel >= 100) saveService.updateAchievement('level100', 1);

      // 각 레벨업마다 배울 수 있는 기술 체크
      try {
        // [V8-FIX-12-1] _pokeAPI alias 제거 → pokeAPI 직접 사용
        // [V8-FIX-12-1] rejectedMoves 필터 — 이미 거절한 기술은 다시 제안하지 않음
        levelUps.forEach(lvl => {
          pokeAPI.getLearnableMoves(tower.pokemonId, lvl).then((newMoves: any[]) => {
            const rejectedMoves: string[] = tower.rejectedMoves ?? [];
            const filtered = newMoves.filter(m => !rejectedMoves.includes(m.name));
            if (filtered.length > 0) {
              addSkillChoice({ towerId, newMoves: filtered });
            }
          }).catch(() => {});
        });
      } catch (err) {
        console.error('Failed to load moves during multi-level up:', err);
      }

      // ─── 레벨 진화 체크 ──────────────────────────────────────────
      // 레벨업 후 현재 레벨에서 진화 가능한지 확인하여 모달 큐에 추가
      const evoData = canEvolve(tower.pokemonId, currentLevel);
      if (evoData) {
        // 해당 포켓몬의 레벨 진화 옵션 전체 수집 (분기 진화 대응)
        const levelEvoOptions = EVOLUTION_CHAINS.filter(
          e => e.from === tower.pokemonId && e.level !== undefined && e.item === undefined && currentLevel >= e.level!
        );
        // 이미 큐에 동일 타워가 등록되어 있으면 중복 추가 방지
        const currentQueue = get().evolutionConfirmQueue;
        const alreadyQueued = currentQueue.some(q => q.towerId === towerId);
        if (!alreadyQueued && levelEvoOptions.length > 0) {
          const evolutionOptions = levelEvoOptions.map(e => ({
            targetId: e.to,
            targetName: `#${e.to}`,
            method: `Lv.${e.level}`,
          }));
          set(state => ({
            evolutionConfirmQueue: [
              ...state.evolutionConfirmQueue,
              { towerId, evolutionOptions },
            ],
          }));
          // 진화 옵션의 포켓몬 이름을 비동기로 가져와서 큐 업데이트
          Promise.all(
            levelEvoOptions.map(e => pokeAPI.getPokemon(e.to).then(d => ({
              targetId: e.to,
              targetName: d.displayName,
              method: `Lv.${e.level}`,
            })).catch(() => ({
              targetId: e.to,
              targetName: `#${e.to}`,
              method: `Lv.${e.level}`,
            })))
          ).then(resolvedOptions => {
            set(state => ({
              evolutionConfirmQueue: state.evolutionConfirmQueue.map(q =>
                q.towerId === towerId
                  ? { ...q, evolutionOptions: resolvedOptions }
                  : q
              ),
            }));
          }).catch(() => {});
        }
      }
    }
  },


  evolvePokemon: async (towerId, item, targetId) => {
    const { towers, updateTower } = get();
    const tower = towers.find(t => t.id === towerId);
    if (!tower) return false;

    try {
      const evolutionTarget = await (async () => {
        if (targetId) return targetId;

        // 1. 메가진화 체크 (mega_stone_ 상성)
        if (item?.startsWith('mega_stone_')) {
          const stoneName = item.replace('mega_stone_', '');
          const mega = canMegaEvolve(tower.pokemonId, stoneName);
          return mega?.to;
        }

        // 2. 거다이맥스 체크 (max_mushroom_)
        if (item?.startsWith('max_mushroom')) {
          const gmax = canGigantamax(tower.pokemonId, 'max-mushroom');
          return gmax?.to;
        }

        // 3. 일반 진화 체크
        const chain = EVOLUTION_CHAINS.find(c =>
          c.from === tower.pokemonId && (!item || c.item === item)
        );
        return chain?.to;
      })();

      if (!evolutionTarget) {
        console.warn(`[Evolution] No evolution target found for ${tower.name} with item ${item}`);
        return false;
      }


      const newData = await pokeAPI.getPokemon(evolutionTarget);
      // 진화 전 종족값 — 현재 타워의 '레벨 보정 배율'을 역산하기 위함
      const curData = await pokeAPI.getPokemon(tower.pokemonId);

      // 현재 스탯 / 진화 전 종족값 = 레벨업으로 누적된 배율. 진화 후에도 그 배율을 유지.
      //   예) 공격 종족값 100 → 레벨업 ×1.2(=120) → 종족값 200으로 진화 → 240(×1.2 유지)
      const ratio = (cur: number, base: number) => (base > 0 ? cur / base : 1);
      const newMaxHp          = Math.max(1, Math.floor(newData.stats.hp * ratio(tower.maxHp, curData.stats.hp)));
      const newAttack         = Math.max(1, Math.floor(newData.stats.attack * ratio(tower.baseAttack, curData.stats.attack)));
      const newSpecialAttack  = Math.max(1, Math.floor(newData.stats.specialAttack * ratio(tower.specialAttack, curData.stats.specialAttack)));
      const newDefense        = Math.max(1, Math.floor(newData.stats.defense * ratio(tower.defense, curData.stats.defense)));
      const newSpecialDefense = Math.max(1, Math.floor(newData.stats.specialDefense * ratio(tower.specialDefense, curData.stats.specialDefense)));
      // speed는 진화 후 포켓몬의 기본 스피드를 그대로 사용 (레벨업도 속도 고정)
      const newSpeed = newData.stats.speed;

      const hpRatio = tower.currentHp / tower.maxHp;

      updateTower(towerId, {
        pokemonId: newData.id,
        name: newData.name,
        displayName: newData.displayName,
        sprite: newData.sprite,
        types: newData.types,
        maxHp: newMaxHp,
        currentHp: Math.floor(newMaxHp * hpRatio),
        attack: newAttack,
        baseAttack: newAttack,
        specialAttack: newSpecialAttack,
        defense: newDefense,
        specialDefense: newSpecialDefense,
        speed: newSpeed,
      });


      set(() => ({
        evolutionToast: {
          fromName: tower.displayName,
          toName: newData.displayName,
          timestamp: Date.now(),
        },
      }));
      setTimeout(() => {
        const cur = get().evolutionToast;
        if (cur && Date.now() - cur.timestamp >= 3000) {
          set({ evolutionToast: null });
        }
      }, 3500);

      // 진화 통계 + 업적
      const stats = saveService.load().stats;
      saveService.updateStats({ evolutionsAchieved: stats.evolutionsAchieved + 1 });
      achievementService.onEvolve('normal');

      // 진화 확정 큐에서 제거
      // [C1-FIX] slice(1)(첫 항목 제거) → towerId 필터.
      //   메가/거다 진화는 큐를 거치지 않고 호출되는데, slice(1)이면 대기 중인
      //   무관한 레벨진화 확인 항목을 잘못 삼키는 버그가 있었음.
      //   towerId당 큐 항목은 최대 1개(addXpToTower의 alreadyQueued 가드)이므로
      //   레벨진화 케이스에서도 동일하게 1개만 제거된다.
      set(state => ({
        evolutionConfirmQueue: state.evolutionConfirmQueue.filter(q => q.towerId !== towerId),
      }));

      return true;
    } catch (err) {
      console.error('Evolution failed:', err);
      return false;
    }
  },

  removeEvolutionConfirm: () => {
    set(state => ({
      evolutionConfirmQueue: state.evolutionConfirmQueue.slice(1),
    }));
  },

  fusePokemon: async (baseId, materialId, item) => {
    const { towers, updateTower, removeTower, spendMoney } = get();
    const baseTower = towers.find(t => t.id === baseId);
    const materialTower = towers.find(t => t.id === materialId);
    if (!baseTower || !materialTower) return false;

    const fusionData = FUSION_DATA.find(
      f => f.base === baseTower.pokemonId &&
           f.material === materialTower.pokemonId &&
           f.item === item
    );
    if (!fusionData) return false;

    const cost = 500;
    if (!spendMoney(cost)) return false;

    try {
      const newData = await pokeAPI.getPokemon(fusionData.result);
      // [FUSION-FIX] 진화와 동일한 '레벨 배율 보존' 방식으로 통일 + specialDefense 누락 보완.
      //   기존: Math.max(원본스탯, 결과종족값) — 레벨업 배율이 날아가 고레벨 융합체가 오히려 약해질 수 있었고
      //         specialDefense는 아예 갱신 안 돼 융합 전 값이 남았음.
      const curData = await pokeAPI.getPokemon(baseTower.pokemonId);
      const ratio = (cur: number, base: number) => (base > 0 ? cur / base : 1);
      const newMaxHp          = Math.max(1, Math.floor(newData.stats.hp * ratio(baseTower.maxHp, curData.stats.hp)));
      const newAttack         = Math.max(1, Math.floor(newData.stats.attack * ratio(baseTower.baseAttack, curData.stats.attack)));
      const newSpecialAttack  = Math.max(1, Math.floor(newData.stats.specialAttack * ratio(baseTower.specialAttack, curData.stats.specialAttack)));
      const newDefense        = Math.max(1, Math.floor(newData.stats.defense * ratio(baseTower.defense, curData.stats.defense)));
      const newSpecialDefense = Math.max(1, Math.floor(newData.stats.specialDefense * ratio(baseTower.specialDefense, curData.stats.specialDefense)));
      const newSpeed = newData.stats.speed;

      const hpRatio = baseTower.currentHp / baseTower.maxHp;

      updateTower(baseId, {
        pokemonId: newData.id,
        name: newData.name,
        displayName: newData.displayName,
        sprite: newData.sprite,
        types: newData.types,
        maxHp: newMaxHp,
        currentHp: Math.floor(newMaxHp * hpRatio),
        attack: newAttack,
        baseAttack: newAttack,
        specialAttack: newSpecialAttack,
        defense: newDefense,
        specialDefense: newSpecialDefense,
        speed: newSpeed,
      });

      removeTower(materialId);

      set(() => ({
        evolutionToast: {
          fromName: baseTower.displayName,
          toName: newData.displayName,
          timestamp: Date.now(),
        },
      }));
      setTimeout(() => {
        const cur = get().evolutionToast;
        if (cur && Date.now() - cur.timestamp >= 3000) {
          set({ evolutionToast: null });
        }
      }, 3500);

      achievementService.onEvolve('fusion');
      return true;
    } catch (err) {
      console.error('Fusion failed:', err);
      get().addMoney(cost);
      return false;
    }
  },

  updateActiveSynergies: () => {
    const { towers, storyChapterNumber } = get();
    const activeTowers = towers.filter(t => !t.isFainted);
    // 스토리 모드: 스트리머(에눈박놈) 파티 시너지 비활성화
    const synergies = calculateActiveSynergies(activeTowers, storyChapterNumber !== null);
    set({ activeSynergies: synergies });
  },

  setHoveredSynergy: (synergy) => set({ hoveredSynergy: synergy }),
  setPreloading: (isLoading) => set({ isPreloading: isLoading }),

  addClerkOrScoutPrompt: (prompt) => set(state => ({
    clerkOrScoutPromptQueue: [...state.clerkOrScoutPromptQueue, prompt]
  })),

  resolveClerkOrScoutPrompt: (towerId, withdraw) => {
    const tower = get().towers.find(t => t.id === towerId);
    if (!tower) {
      set(state => ({
        clerkOrScoutPromptQueue: state.clerkOrScoutPromptQueue.filter(q => q.towerId !== towerId)
      }));
      return { success: false, message: 'work.errNotFound' };
    }

    if (withdraw) {
      // 놓을 곳이 하나도 없으면 회수를 확정하지 않는다(모달 유지 → "계속 근무"로 넘어갈 수 있게).
      const started = get().beginWorkWithdraw(towerId);
      if (!started.success) return started;
    }

    set(state => ({
      clerkOrScoutPromptQueue: state.clerkOrScoutPromptQueue.filter(q => q.towerId !== towerId)
    }));

    return { success: true };
  },

  // 회수 시작 — 예전엔 임의의 빈 칸으로 순간이동시켰지만, 이제 배치 모드로 넘겨 플레이어가 칸을 찍는다.
  beginWorkWithdraw: (towerId) => {
    const { towers, currentMap } = get();
    if (!towers.some(t => t.id === towerId)) return { success: false, message: 'work.errNotFound' };
    if (!findEmptyBuildableTile(currentMap, towers)) return { success: false, message: 'work.errNoTile' };

    set(state => ({
      pendingWorkWithdrawIds: state.pendingWorkWithdrawIds.includes(towerId)
        ? state.pendingWorkWithdrawIds
        : [...state.pendingWorkWithdrawIds, towerId],
      manageTowerId: state.manageTowerId === towerId ? null : state.manageTowerId,
    }));
    return { success: true };
  },

  // 회수 배치 확정(큐 선두). position이 있으면 그 칸으로, 없으면(웨이브 시작 등 폴백) 임의의 빈 칸으로.
  completeWorkWithdraw: (position) => {
    const { pendingWorkWithdrawIds, towers, currentMap, updateTower } = get();
    const towerId = pendingWorkWithdrawIds[0];
    if (!towerId) return;

    const pop = () => set(state => ({
      pendingWorkWithdrawIds: state.pendingWorkWithdrawIds.filter(id => id !== towerId),
    }));

    const tower = towers.find(t => t.id === towerId);
    if (!tower) { pop(); return; }

    // 폴백 경로에서 빈 칸이 사라졌다면 근무 상태 그대로 둔다(다음 마일스톤에 다시 물어봄).
    const target = position ?? findEmptyBuildableTile(currentMap, towers);
    if (!target) { pop(); return; }

    updateTower(towerId, { position: target, shopWavesHeld: 0 });
    pop();
  },
}));

function findEmptyBuildableTile(
  mapId: string,
  towers: Array<{ position: { x: number; y: number } }>
): { x: number; y: number } | null {
  const map = getMapById(mapId);
  if (!map) return null;

  const facility = facilityTilesOfMap(mapId);
  const workTiles = [...facility.shopTiles, ...facility.contestTiles];

  // 자유배치 규칙(길·입출구 keepout 제외)으로 빈 칸을 찾는다.
  // GameCanvas 배치 검증과 동일 소스(getBuildableTiles)를 사용해 일관성을 유지.
  const buildablePoints = getBuildableTiles(map);

  // 현재 타워들이 점유하고 있는 타일 좌표
  const occupiedComma = new Set(
    towers.map(t => `${Math.floor(t.position.x / 64)},${Math.floor(t.position.y / 64)}`)
  );
  const occupiedDash = new Set(
    towers.map(t => `${Math.floor(t.position.x / 64)}-${Math.floor(t.position.y / 64)}`)
  );
  // 알바 타일 좌표
  const workTileSet = new Set(workTiles.map(w => `${w.x},${w.y}`));

  // 자유배치와 동일하게 좌우/상하 3연속(일직선) 형성 타일은 피한다.
  const wouldFormLine = (tx: number, ty: number) => {
    const run = (dx: number, dy: number) => {
      let n = 0, cx = tx + dx, cy = ty + dy;
      while (occupiedDash.has(`${cx}-${cy}`)) { n++; cx += dx; cy += dy; }
      return n;
    };
    return (1 + run(-1, 0) + run(1, 0) >= 3) || (1 + run(0, -1) + run(0, 1) >= 3);
  };

  const isFree = (p: { x: number; y: number }) => {
    const key = `${p.x},${p.y}`;
    return !occupiedComma.has(key) && !workTileSet.has(key);
  };

  // 1순위: 일직선 제약까지 만족하는 빈 칸. 없으면 2순위: 일직선 허용한 빈 칸(갇힘 방지).
  let pool = buildablePoints.filter(p => isFree(p) && !wouldFormLine(p.x, p.y));
  if (pool.length === 0) pool = buildablePoints.filter(isFree);
  if (pool.length === 0) return null;

  // 무작위 빈 타일 좌표 반환 (snapped: x * 64 + 32, y * 64 + 32)
  const chosen = pool[Math.floor(rng() * pool.length)];
  return {
    x: chosen.x * 64 + 32,
    y: chosen.y * 64 + 32
  };
}