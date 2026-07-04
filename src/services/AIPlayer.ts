// src/services/AIPlayer.ts
// AI 플레이어 - 실제 유저와 동일한 TFT 흐름으로 동작
// ──────────────────────────────────────────────────────────────────
// V5 — 서버 권위 기반 재설계
//
// [V5-FIX-AI-1] money, lives, isAlive 는 Firebase 서버 상태에서 읽음
// [V5-FIX-AI-2] purchaseInterval 백그라운드 스로틀 방어
// [V5-FIX-AI-3] AI-host 이전 대응 (중복 시작 방지)
// [V5-FIX-AI-4] 배틀/Bye 보너스 로컬 누적 제거
//
// ── V7: fbSet 직접 호출 제거, 공식 API로 일원화 ──
// [V7-FIX-AI-5] forcePushTowerDetails: multiplayerService.forcePushTowerDetailsFull 사용
//   - 이전: fbSet(set)으로 직접 쓰기 → tftPlacements 등 sibling 필드 덮어쓸 위험
//   - 수정: 공식 API (update + normalize) 경유 → 일관성 확보

import { multiplayerService } from './MultiplayerService';
import { pokeAPI } from '../api/pokeapi';
import {
  AIDifficulty, TowerDetail, MultiplayerGameState, GamePhase,
} from '../types/multiplayer';
import {
  GamePokemon, GameMove, MoveEffect, PokemonRarity,
} from '../types/game';
import { getMapById, MAPS } from '../data/maps';
import { EVOLUTION_CHAINS, canMegaEvolve } from '../data/evolution';
import { getTypeEffectiveness } from '../utils/typeEffectiveness';

const TILE_SIZE = 64;
const MAP_WIDTH = 15;
const MAP_HEIGHT = 10;
const MAX_TOWERS = 6;
const ENTRY_FEE = 20;

const RARITY_SCORE: Record<PokemonRarity, number> = {
  Bronze: 1, Silver: 2, Gold: 3, Diamond: 4, Master: 5, Legend: 6,
};

const RARITY_COST: Record<PokemonRarity, number> = {
  Bronze: 50, Silver: 100, Gold: 200, Diamond: 350, Master: 500, Legend: 800,
};

const AI_CONFIG: Record<AIDifficulty, {
  purchaseIntervalMs: number;
  pickTopN: number;
  levelUpChance: number;
  evolvePriority: number;
  upgradeTeam: boolean;
  rerollCount: number;
  synergyWeight: number;
}> = {
  easy:   { purchaseIntervalMs: 12000, pickTopN: 999, levelUpChance: 0.15, evolvePriority: 0.1,  upgradeTeam: false, rerollCount: 0, synergyWeight: 0 },
  medium: { purchaseIntervalMs: 7000,  pickTopN: 3,   levelUpChance: 0.5,  evolvePriority: 0.5,  upgradeTeam: false, rerollCount: 1, synergyWeight: 0.5 },
  hard:   { purchaseIntervalMs: 3000,  pickTopN: 1,   levelUpChance: 0.9,  evolvePriority: 0.85, upgradeTeam: true,  rerollCount: 3, synergyWeight: 1.0 },
};

interface AICandidate {
  pokemonId: number;
  rarity: PokemonRarity;
  cost: number;
  score: number;
}

// ─── 전투 시뮬레이터 (원본 유지) ─────────────────────────────
function getDiffMult(diff: string): { hp: number; atk: number } {
  switch (diff) {
    case 'easiest': return { hp: 0.3, atk: 0.3 };
    case 'easy':    return { hp: 0.5, atk: 0.5 };
    case 'medium':  return { hp: 0.7, atk: 0.7 };
    case 'hard':    return { hp: 0.9, atk: 0.9 };
    case 'expert':  return { hp: 1.1, atk: 1.1 };
    default:        return { hp: 0.7, atk: 0.7 };
  }
}

interface WaveSim {
  livesLost: number;
  moneyEarned: number;
  towerHpFractions: Record<string, number>;
}

function runWaveSim(towers: GamePokemon[], wave: number, difficulty: string): WaveSim {
  const dm = getDiffMult(difficulty);
  const scale = Math.pow(1.08, wave - 1);
  const enemyCount = Math.floor(5 + wave * 1.5);
  const hasBoss = wave % 3 === 0; // [FIX] WaveSystem과 동일하게 3의 배수

  const baseEnemyHp  = (80 + wave * 15) * dm.hp  * scale;
  const baseEnemyAtk = (12 + wave * 2)  * dm.atk * scale;
  const baseEnemyDef = (5  + wave * 0.5)          * scale;

  const towerHp: Record<string, number> = {};
  const towerMaxHp: Record<string, number> = {};
  for (const t of towers) {
    if (!t.isFainted) {
      towerHp[t.id] = t.currentHp;
      towerMaxHp[t.id] = t.maxHp;
    }
  }

  const aliveTowers = towers.filter(t => !t.isFainted && t.currentHp > 0);
  if (aliveTowers.length === 0) {
    return {
      livesLost: enemyCount + (hasBoss ? 1 : 0),
      moneyEarned: 0,
      towerHpFractions: {},
    };
  }

  let livesLost = 0;
  let moneyEarned = 0;

  const processEnemy = (enemyHp: number, enemyAtk: number, enemyDef: number, reward: number, enemyTypes: string[]) => {
    let remainingHp = enemyHp;
    for (const tower of aliveTowers) {
      if ((towerHp[tower.id] ?? 0) <= 0) continue;
      const attackType = tower.types[0] || 'normal';
      const eff = getTypeEffectiveness(attackType, enemyTypes);
      const power = tower.equippedMoves[0]?.power || 50;
      const towerAtk = tower.attack;
      const rawDmg = ((2 * tower.level / 5 + 2) * power * towerAtk / Math.max(1, enemyDef) / 50 + 2) * eff;
      const exposureTime = 3.0 + wave * 0.05;
      const speedMult = Math.max(0.2, 1 - tower.speed / 300);
      const cooldown = (tower.equippedMoves[0]?.cooldown || 2.0) * speedMult;
      const hits = Math.max(1, Math.floor(exposureTime / cooldown));
      const totalDmg = rawDmg * hits;
      remainingHp -= totalDmg;
      const enemyDmgPerTick = Math.max(1, Math.floor(enemyAtk / Math.max(1, tower.defense)));
      const takenDmg = enemyDmgPerTick * Math.min(hits, 3);
      towerHp[tower.id] = Math.max(0, (towerHp[tower.id] ?? 0) - takenDmg);
      if (remainingHp <= 0) {
        moneyEarned += reward;
        return true;
      }
    }
    if (remainingHp > 0) {
      livesLost++;
      return false;
    }
    return true;
  };

  for (let i = 0; i < enemyCount; i++) {
    processEnemy(baseEnemyHp, baseEnemyAtk, baseEnemyDef, 10, ['normal']);
  }
  if (hasBoss) {
    processEnemy(baseEnemyHp * 3, baseEnemyAtk * 2, baseEnemyDef * 1.5, 50, ['normal']);
  }

  const towerHpFractions: Record<string, number> = {};
  for (const t of aliveTowers) {
    const max = towerMaxHp[t.id] || 1;
    towerHpFractions[t.id] = Math.max(0, (towerHp[t.id] ?? 0) / max);
  }

  return { livesLost, moneyEarned, towerHpFractions };
}

// ─── AIPlayer ────────────────────────────────────────────────
export class AIPlayer {
  private isRunning = false;
  private isShopping = false; // [BUG-1 FIX] doShoppingTurn 동시 실행 방지
  private purchaseInterval: ReturnType<typeof setInterval> | null = null;
  private lastPurchaseCheck = 0;
  private gameStateSub: (() => void) | null = null;
  private phaseSub: (() => void) | null = null;

  // [V6-FIX-AI] 로컬이 money/lives 의 주인. Firebase 구독은 wave/isAlive만 받음.
  private money = 500;
  private lives = 50;
  private wave = 0;
  private towers: GamePokemon[] = [];
  private isAlive = true;
  private currentPhase: GamePhase | null = null;
  private roomDifficulty = 'medium';
  // [V6-FIX-AI] 배틀 보상/Bye 보너스 중복 방지
  private lastAppliedBattleRound = -1;
  private lastAppliedByeRound = -1;

  private waveProcessing = false;
  private lastProcessedRound = -1;

  private cfg: typeof AI_CONFIG['medium'];
  private mapData: ReturnType<typeof getMapById>;

  constructor(
    private readonly roomId: string,
    private readonly playerId: string,
    private readonly difficulty: AIDifficulty,
    mapId: string,
  ) {
    this.cfg = AI_CONFIG[difficulty];
    this.mapData = getMapById(mapId) || MAPS[0];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    multiplayerService.getRoom(this.roomId).then(room => {
      if (room) {
        const mapData = getMapById(room.mapId);
        if (mapData) this.roomDifficulty = mapData.difficulty;
      }
    }).catch(() => {});

    // [V6-FIX-AI] Firebase 구독 — wave, isAlive만 동기화
    //   money/lives는 로컬이 주인. GameLayout과 동일한 방식.
    this.gameStateSub = multiplayerService.onGameStateUpdate(this.roomId, players => {
      const me = players.find(p => p.userId === this.playerId);
      if (!me) return;
      this.wave = me.wave;
      this.isAlive = me.isAlive;
      if (!this.isAlive) this.stop();
    });

    this.phaseSub = multiplayerService.onGameStateUpdateWithPhase(this.roomId, state => {
      if (!state || !this.isRunning || !this.isAlive) return;
      const prev = this.currentPhase;
      this.currentPhase = state.currentPhase;
      if (prev !== this.currentPhase) {
        this.onPhaseChange(state);
      }
    });

    // [V5-FIX-AI-2] 백그라운드 스로틀 방어 — 시각 기반 체크
    this.lastPurchaseCheck = Date.now();
    this.purchaseInterval = setInterval(() => {
      if (!this.isRunning || !this.isAlive) return;
      const now = Date.now();
      if (now - this.lastPurchaseCheck < this.cfg.purchaseIntervalMs) return;
      this.lastPurchaseCheck = now;
      if (this.currentPhase === 'waiting_wave' || this.currentPhase === 'shopping') {
        this.doShoppingTurn().catch(err =>
          console.warn(`[AI:${this.playerId}] shopping error`, err)
        );
      }
    }, 1000); // 1초 주기로 체크, 내부에서 실제 interval 판정

    this.pushTowerDetails();
  }

  stop() {
    this.isRunning = false;
    if (this.purchaseInterval) { clearInterval(this.purchaseInterval); this.purchaseInterval = null; }
    if (this.gameStateSub) { this.gameStateSub(); this.gameStateSub = null; }
    if (this.phaseSub) { this.phaseSub(); this.phaseSub = null; }
  }

  // [V6-FIX-AI] 배틀 보상/Bye 보너스 로컬 적용 — GameLayout과 동일 방식
  private onPhaseChange(state: MultiplayerGameState) {
    const round = state.currentRound;

    // 1. 배틀 결과 로컬 동기화
    // [BUG-4 FIX] V8-FIX-1-5에서 서버 트랜잭션이 AI의 Firebase money/lives를 이미 갱신함.
    //   로컬 this.money/lives 동기화는 유지(다음 handleWave 계산에 필요)하되,
    //   Firebase push는 제거 → 이중 적용 레이스 컨디션 방지.
    //   (handleWave 완료 시 최신 로컬값으로 Firebase를 덮어씀)
    if (this.lastAppliedBattleRound < round) {
      const myResult = (state.battleResults || []).find(r =>
        r.roundNumber === round && (r.player1Id === this.playerId || r.player2Id === this.playerId)
      );
      if (myResult) {
        this.lastAppliedBattleRound = round;
        const reward = this.playerId === myResult.player1Id ? myResult.rewardP1 : myResult.rewardP2;
        if (reward) {
          this.money = Math.max(0, this.money + reward.gold);
          this.lives = Math.max(0, Math.min(50, this.lives + reward.lives));
          console.log(`[AI:${this.playerId}] Battle Reward (local sync only): +${reward.gold}G, ${reward.lives}L (Round ${round})`);
          // Firebase push 제거: 서버 트랜잭션(V8-FIX-1-5)이 이미 처리함.
          // push하면 트랜잭션이 적용한 값에 다시 더해지는 이중 적용 발생 가능.
        }
      }
    }

    // 2. Bye 보너스 로컬 동기화
    // [BUG-4 FIX] startBattlePhase 트랜잭션이 Firebase AI money를 이미 +50 갱신함.
    //   로컬 동기화는 유지하되 Firebase push 제거 (동일한 이중 적용 방지 원칙).
    if (
      (this.currentPhase === 'battle' || this.currentPhase === 'waiting_battle') &&
      state.roundMatchups?.skipPlayerId === this.playerId &&
      this.lastAppliedByeRound < round
    ) {
      this.lastAppliedByeRound = round;
      this.money += 50;
      console.log(`[AI:${this.playerId}] Bye Bonus (local sync only): +50G (Round ${round})`);
      // Firebase push 제거: startBattlePhase 트랜잭션이 이미 처리함.
    }

    switch (this.currentPhase) {
      case 'loading':
        break;

      case 'waiting_wave':
        this.waveProcessing = false;
        setTimeout(() => { this.doShoppingTurn().catch(() => {}); }, 500 + Math.random() * 1500);
        break;

      case 'wave':
        if (!this.waveProcessing && round !== this.lastProcessedRound) {
          this.waveProcessing = true;
          this.lastProcessedRound = round;
          this.handleWave(round)
            .catch(err => console.error(`[AI:${this.playerId}] handleWave error`, err))
            .finally(() => { this.waveProcessing = false; });
        }
        break;

      case 'waiting_battle':
        this.forcePushTowerDetails();
        setTimeout(() => {
          if (this.isRunning && this.isAlive) this.forcePushTowerDetails();
        }, 2000);
        if (round === this.lastProcessedRound) {
          multiplayerService.markWaveCompleted(this.roomId, this.playerId).catch(() => {});
        }
        break;

      case 'battle':
        // BattlePhaseUI가 AI vs AI 처리
        break;

      case 'shopping':
        setTimeout(() => { this.doShoppingTurn().catch(() => {}); }, 1000 + Math.random() * 2000);
        break;
    }
  }

  // ─── 웨이브 처리 ───────────────────────────────────────────
  private async handleWave(round: number) {
    if (!this.isAlive) return;

    const waveDurationMs = Math.min(20000, 8000 + round * 300);
    await delay(waveDurationMs + Math.random() * 3000);

    if (!this.isRunning || !this.isAlive) return;

    try {
      const sim = runWaveSim(this.towers, round, this.roomDifficulty);

      this.towers = this.towers.map(t => {
        const frac = sim.towerHpFractions[t.id];
        if (frac === undefined) return t;
        const newHp = Math.floor(t.maxHp * frac);
        return { ...t, currentHp: newHp, isFainted: newHp <= 0 };
      });

      const waveBonus = 100 + round * 10;
      const newLives = Math.max(0, this.lives - sim.livesLost);
      const newMoney = this.money + sim.moneyEarned + waveBonus;

      this.money = newMoney;
      this.lives = newLives;

      if (newLives <= 0) {
        this.isAlive = false;
        // [C2-FIX] isAlive는 playerDefeated 단일 경로가 확정(순위·전환 처리 포함).
        //   여기서 isAlive:false를 먼저 쓰면 playerDefeated가 'already dead'로 건너뛰어 순위 누락.
        await multiplayerService.updatePlayerState(this.roomId, this.playerId, {
          wave: round,
          lives: 0,
          money: newMoney,
          towers: this.towers.length,
        }).catch(() => {});
        await multiplayerService.playerDefeated(this.roomId, this.playerId);
        this.stop();
        return;
      }

      await this.postWaveProcessing(round);

      // [V6-FIX-AI-1] money/lives 포함 전체 필드 업데이트
      //   MultiplayerService가 이제 money/lives 화이트리스트 허용
      await multiplayerService.updatePlayerState(this.roomId, this.playerId, {
        wave: round,
        lives: this.lives,
        money: this.money,
        towers: this.towers.length,
        isAlive: true,
      });

      this.pushTowerDetails();
    } finally {
      if (this.isAlive && this.isRunning) {
        await multiplayerService.markWaveCompleted(this.roomId, this.playerId)
          .catch(err => console.error(`[AI:${this.playerId}] markWaveCompleted failed`, err));
      }
    }
  }

  private async postWaveProcessing(wave: number) {
    this.towers = this.towers.map(t => ({ ...t, currentHp: t.maxHp, isFainted: false }));
    if (Math.random() < this.cfg.levelUpChance) this.levelUpAllTowers();
    if (Math.random() < this.cfg.evolvePriority) await this.tryEvolve();
    if (this.difficulty === 'hard' && wave % 3 === 0) await this.tryMegaEvolve(); // [FIX] WaveSystem과 동일하게 3의 배수
  }

  private async doShoppingTurn() {
    // [BUG-1 FIX] 동시 실행 방지 — setInterval + onPhaseChange가 동시에 호출될 수 있음
    if (!this.isAlive || this.isShopping) return;
    this.isShopping = true;
    try {
      this.healFainted();
      if (this.towers.length < MAX_TOWERS) await this.buyPokemon();
      if (this.cfg.upgradeTeam && this.towers.length === MAX_TOWERS) await this.upgradeWeakest();
    } finally {
      this.isShopping = false;
    }
  }

  private async buyPokemon() {
    if (this.money < ENTRY_FEE + RARITY_COST['Bronze']) return;

    const candidates = await this.generateCandidates();
    if (candidates.length === 0) return;

    const picked = this.pickCandidate(candidates);
    if (!picked || ENTRY_FEE + picked.cost > this.money) return;

    const pos = this.findEmptyTile();
    if (!pos) return;

    const cost = ENTRY_FEE + picked.cost;
    const newMoney = this.money - cost;

    try {
      const data = await pokeAPI.getPokemon(picked.pokemonId);
      const move = await this.pickMove(data.moves, data.types);
      const tower = this.makeTower(data, pos, move, picked.rarity);

      // [BUG-1 FIX] PokeAPI 비동기 대기 중 다른 구매가 완료되어 이미 MAX_TOWERS에 도달했을 수 있음
      if (this.towers.length >= MAX_TOWERS) return;

      this.money = newMoney;
      this.towers.push(tower);

      await multiplayerService.updatePlayerState(this.roomId, this.playerId, {
        money: this.money,
        towers: this.towers.length,
      });
      this.pushTowerDetails();
    } catch (err) {
      console.warn(`[AI:${this.playerId}] buy failed`, err);
    }
  }

  private async generateCandidates(): Promise<AICandidate[]> {
    const totalAttempts = 3 + this.cfg.rerollCount;
    const results: AICandidate[] = [];
    for (let i = 0; i < totalAttempts; i++) {
      try {
        const id = await pokeAPI.getRandomPokemonIdWithRarity();
        const rarity = await pokeAPI.getRarity(id);
        const cost = RARITY_COST[rarity];
        if (ENTRY_FEE + cost > this.money) continue;
        const data = await pokeAPI.getPokemon(id);
        const score = this.scoreCandidate(data.stats, data.types, cost, rarity);
        results.push({ pokemonId: id, rarity, cost, score });
      } catch { /* 무시 */ }
    }
    return results;
  }

  private scoreCandidate(
    stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number },
    types: string[],
    cost: number,
    rarity: PokemonRarity,
  ): number {
    const total = stats.hp + stats.attack + stats.defense + stats.specialAttack + stats.specialDefense + stats.speed;
    const isEarly = this.wave <= 10;
    let score = 0;
    score += total * (isEarly ? 0.4 : 0.8);
    score += (stats.attack + stats.specialAttack) * 0.6;
    score += (total / Math.max(1, cost)) * 60;
    score += RARITY_SCORE[rarity] * 20;
    if (this.cfg.synergyWeight > 0) score += this.calcTypeSynergyScore(types) * this.cfg.synergyWeight * 40;
    if (this.difficulty === 'easy') score *= 0.3 + Math.random() * 1.4;
    return score;
  }

  private calcTypeSynergyScore(types: string[]): number {
    const typeCounts: Record<string, number> = {};
    for (const t of this.towers) for (const type of t.types) typeCounts[type] = (typeCounts[type] || 0) + 1;
    let bonus = 0;
    for (const type of types) {
      const after = (typeCounts[type] || 0) + 1;
      if (after === 2 || after === 4 || after === 6) bonus += 3;
      else bonus += 0.5;
    }
    return bonus;
  }

  private pickCandidate(candidates: AICandidate[]): AICandidate | null {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const poolSize = Math.min(this.cfg.pickTopN, sorted.length);
    if (poolSize === 0) return null;
    return sorted[Math.floor(Math.random() * poolSize)];
  }

  private async pickMove(moveNames: string[], pokemonTypes: string[]): Promise<any> {
    const fallback = {
      name: 'tackle', displayName: '몸통박치기',
      type: 'normal', power: 40, accuracy: 100,
      damageClass: 'physical', effectChance: null,
    };
    const attackMoves: any[] = [];
    for (const name of moveNames.slice(0, 15)) {
      try {
        const m = await pokeAPI.getMove(name);
        if (m.damageClass !== 'status' && (m.power || 0) > 0) attackMoves.push(m);
      } catch { /* 무시 */ }
      if (attackMoves.length >= 5) break;
    }
    if (attackMoves.length === 0) return fallback;
    if (this.difficulty === 'hard') {
      const stab = attackMoves.filter(m => pokemonTypes.includes(m.type));
      const pool = stab.length > 0 ? stab : attackMoves;
      return pool.sort((a, b) => (b.power || 0) - (a.power || 0))[0];
    }
    const sorted = attackMoves.sort((a, b) => (b.power || 0) - (a.power || 0));
    const top = sorted.slice(0, Math.min(3, sorted.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  private makeTower(
    data: { id: number; name: string; displayName: string; types: string[]; sprite: string; stats: any; moves: string[] },
    pos: { x: number; y: number },
    moveData: any,
    rarity: PokemonRarity,
  ): GamePokemon {
    const effect: MoveEffect = { type: 'damage' };
    const move: GameMove = {
      name: moveData.name,
      displayName: moveData.displayName || moveData.name,
      type: moveData.type || 'normal',
      power: moveData.power || 40,
      accuracy: moveData.accuracy || 100,
      damageClass: (moveData.damageClass as any) || 'physical',
      effect,
      cooldown: 2.0,
      currentCooldown: 0,
      isAOE: false,
    };
    return {
      id: `ai_${this.playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pokemonId: data.id,
      name: data.name,
      displayName: data.displayName,
      level: 1,
      experience: 0,
      maxHp: data.stats.hp,
      currentHp: data.stats.hp,
      baseAttack: data.stats.attack,
      attack: data.stats.attack,
      defense: data.stats.defense,
      specialAttack: data.stats.specialAttack,
      specialDefense: data.stats.specialDefense,
      speed: data.stats.speed,
      position: pos,
      range: 3,
      equippedMoves: [move],
      types: data.types,
      sprite: data.sprite,
      isFainted: false,
      targetEnemyId: null,
      sellValue: RARITY_COST[rarity],
      kills: 0,
      damageDealt: 0,
      gender: 'genderless',
      ability: undefined,
      rejectedMoves: [],
      rarity,
    };
  }

  // [BUG-2 FIX] 전 포켓몬 균등 레벨업 — 싱글플레이의 addXpToTower와 동일한 성장 방식
  // 이전: 가장 강한 포켓몬 1마리만 레벨업 → 격차 심화
  // 변경: 살아있는 전 포켓몬을 동일하게 1레벨씩 성장
  private levelUpAllTowers() {
    this.towers = this.towers.map(t => {
      if (t.isFainted || t.level >= 100) return t;
      // 싱글플레이 addXpToTower와 동일한 성장률
      const hpIncrease    = Math.floor(t.maxHp          * 0.1);
      const atkIncrease   = Math.floor(t.attack         * 0.05);
      // [BUG-2 FIX] specialAttack은 자체 값 기준으로 증가량 계산
      // 이전: atkIncrease(t.attack * 0.05)를 그대로 사용 → 특수형 포켓몬 성장 저하
      // 수정: t.specialAttack * 0.05로 별도 계산
      const spAtkIncrease = Math.floor(t.specialAttack  * 0.05);
      const defIncrease   = Math.floor(t.defense        * 0.05);
      const spDefIncrease = Math.floor(t.specialDefense * 0.05);
      const spdIncrease   = Math.floor(t.speed          * 0.03);
      return {
        ...t,
        level:          t.level + 1,
        experience:     t.level * 100,
        maxHp:          t.maxHp          + hpIncrease,
        currentHp:      t.currentHp      + hpIncrease,
        attack:         t.attack         + atkIncrease,
        baseAttack:     t.baseAttack     + atkIncrease,
        specialAttack:  t.specialAttack  + spAtkIncrease,
        defense:        t.defense        + defIncrease,
        specialDefense: t.specialDefense + spDefIncrease,
        speed:          t.speed          + spdIncrease,
      };
    });
  }

  private async tryEvolve() {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      const evos = EVOLUTION_CHAINS.filter(e =>
        e.from === t.pokemonId && !e.item && (!e.level || t.level >= e.level)
      );
      if (evos.length === 0) continue;
      try {
        const toId = evos[0].to;
        const d = await pokeAPI.getPokemon(toId);
        const M = Math.pow(1.05, t.level - 1);
        const hpRatio = t.currentHp / t.maxHp;
        const newMax = Math.floor(d.stats.hp * M);
        this.towers[i] = {
          ...t,
          pokemonId: d.id, name: d.name, displayName: d.displayName,
          sprite: d.sprite, types: d.types,
          maxHp:          newMax,
          currentHp:      Math.floor(newMax * hpRatio),
          baseAttack:     Math.floor(d.stats.attack       * M),
          attack:         Math.floor(d.stats.attack       * M),
          defense:        Math.floor(d.stats.defense      * M),
          specialAttack:  Math.floor(d.stats.specialAttack  * M),
          specialDefense: Math.floor(d.stats.specialDefense * M),
          speed: d.stats.speed,
        };
        break;
      } catch { /* 무시 */ }
    }
  }

  private async tryMegaEvolve() {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      const mega = canMegaEvolve(t.pokemonId, '');
      if (!mega) continue;
      try {
        const d = await pokeAPI.getPokemon(mega.to);
        const M = Math.pow(1.05, t.level - 1);
        this.towers[i] = {
          ...t,
          pokemonId: d.id, name: d.name, displayName: d.displayName,
          sprite: d.sprite, types: d.types,
          maxHp:          Math.floor(d.stats.hp          * M),
          currentHp:      Math.floor(d.stats.hp          * M),
          baseAttack:     Math.floor(d.stats.attack       * M),
          attack:         Math.floor(d.stats.attack       * M),
          defense:        Math.floor(d.stats.defense      * M),
          specialAttack:  Math.floor(d.stats.specialAttack  * M),
          specialDefense: Math.floor(d.stats.specialDefense * M),
          speed: d.stats.speed,
        };
        break;
      } catch { /* 무시 */ }
    }
  }

  private async upgradeWeakest() {
    if (this.money < ENTRY_FEE + RARITY_COST['Silver'] + 50) return;
    const weakestIdx = this.towers.reduce((minI, t, i) => {
      const s = t.level * RARITY_SCORE[t.rarity || 'Bronze'];
      return s < this.towers[minI].level * RARITY_SCORE[this.towers[minI].rarity || 'Bronze'] ? i : minI;
    }, 0);
    const weakScore = this.towers[weakestIdx].level * RARITY_SCORE[this.towers[weakestIdx].rarity || 'Bronze'];
    const candidates = await this.generateCandidates();
    if (candidates.length === 0) return;
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    const newScore = 1 * RARITY_SCORE[best.rarity];
    if (newScore < weakScore * 1.5) return;
    const sell = this.towers[weakestIdx];
    const sellPrice = Math.max(sell.level * 20, Math.floor((sell.sellValue || 50) * 0.6));

    // [BUG-3 FIX] 타워 제거 전 백업
    // buyPokemon이 실패(API 오류, money 부족 등)하면 타워만 영구 소실되는 문제 방지
    const removedTower = this.towers[weakestIdx];
    const prevTowerCount = this.towers.length;

    this.towers.splice(weakestIdx, 1);
    this.money += sellPrice;
    // 판매 결과를 서버에 푸시
    await multiplayerService.updatePlayerState(this.roomId, this.playerId, {
      money: this.money,
      towers: this.towers.length,
    });

    await this.buyPokemon();

    // 구매 실패 시(타워 수가 늘지 않았을 때) 판매 취소 및 타워 복원
    if (this.towers.length < prevTowerCount) {
      this.towers.splice(weakestIdx, 0, removedTower);
      this.money -= sellPrice;
      console.warn(`[AI:${this.playerId}] upgradeWeakest: buy failed, restoring sold tower`);
      await multiplayerService.updatePlayerState(this.roomId, this.playerId, {
        money: this.money,
        towers: this.towers.length,
      }).catch(() => {});
    }
  }

  private healFainted() {
    const fainted = this.towers
      .filter(t => t.isFainted)
      .sort((a, b) =>
        (b.level * RARITY_SCORE[b.rarity || 'Bronze']) -
        (a.level * RARITY_SCORE[a.rarity || 'Bronze'])
      );
    if (fainted.length === 0) return;
    const count = Math.min(this.difficulty === 'hard' ? 2 : 1, fainted.length);
    for (let i = 0; i < count; i++) {
      const target = fainted[i];
      if (!target) continue;
      const idx = this.towers.findIndex(t => t.id === target.id);
      if (idx !== -1) {
        this.towers[idx] = {
          ...this.towers[idx],
          isFainted: false,
          currentHp: Math.floor(this.towers[idx].maxHp * 0.5),
        };
      }
    }
  }

  private findEmptyTile(): { x: number; y: number } | null {
    const used = new Set(this.towers.map(t => `${t.position.x},${t.position.y}`));
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        if (!used.has(`${x},${y}`) && !this.isOnPath(x, y)) return { x, y };
      }
    }
    return null;
  }

  private isOnPath(x: number, y: number): boolean {
    if (!this.mapData) return false;
    for (const path of this.mapData.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const s = path[i], e = path[i + 1];
        const minX = Math.min(s.x, e.x) - TILE_SIZE / 2;
        const maxX = Math.max(s.x, e.x) + TILE_SIZE / 2;
        const minY = Math.min(s.y, e.y) - TILE_SIZE / 2;
        const maxY = Math.max(s.y, e.y) + TILE_SIZE / 2;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
      }
    }
    return false;
  }

  private pushTowerDetails() {
    const details: TowerDetail[] = this.towers.map(t => ({
      pokemonId: t.pokemonId,
      name: t.displayName,
      level: t.level,
      sprite: t.sprite,
      position: t.position,
      currentHp: t.currentHp,
      maxHp: t.maxHp,
      isFainted: t.isFainted,
      attack: t.attack,
      defense: t.defense,
      specialAttack: t.specialAttack,
      specialDefense: t.specialDefense,
      types: t.types,
      speed: t.speed,
      equippedMoves: t.equippedMoves,
    }));
    multiplayerService.updatePlayerTowerDetails(this.roomId, this.playerId, details);
  }

  private forcePushTowerDetails() {
    const details: TowerDetail[] = this.towers.map(t => ({
      pokemonId: t.pokemonId,
      name: t.displayName,
      level: t.level,
      sprite: t.sprite,
      position: t.position,
      currentHp: t.currentHp,
      maxHp: t.maxHp,
      isFainted: t.isFainted,
      attack: t.attack,
      defense: t.defense,
      specialAttack: t.specialAttack ?? t.attack,
      specialDefense: t.specialDefense ?? t.defense,
      types: t.types,
      speed: t.speed,
      equippedMoves: t.equippedMoves,
    }));
    // [V7-FIX-AI-5] 공식 API 사용 — set→update로 변경되어 tftPlacements 보존됨
    multiplayerService.forcePushTowerDetailsFull(this.roomId, this.playerId, details)
      .catch(err => console.error(`[AI:${this.playerId}] forcePush failed`, err));
  }
}

// ─── AIPlayerManager ──────────────────────────────────────────
class AIPlayerManager {
  private players = new Map<string, AIPlayer>();

  // [V5-FIX-AI-3] 중복 시작 방지 — 호스트 이전 시 안전하게 재시작 가능
  startAI(roomId: string, playerId: string, difficulty: AIDifficulty, mapId: string) {
    if (this.players.has(playerId)) {
      // 이미 실행 중이면 skip (idempotent)
      return;
    }
    const ai = new AIPlayer(roomId, playerId, difficulty, mapId);
    ai.start();
    this.players.set(playerId, ai);
    console.log(`[AIManager] Started AI ${playerId} (${difficulty})`);
  }

  stopAI(playerId: string) {
    this.players.get(playerId)?.stop();
    this.players.delete(playerId);
  }

  stopAll() {
    this.players.forEach(ai => ai.stop());
    this.players.clear();
  }
}

export const aiPlayerManager = new AIPlayerManager();

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}