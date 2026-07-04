// src/services/CardBattleService.ts
// 카드 오토배틀 전투엔진. PvPBattleService의 데미지식을 차용하되
//  - 전열/후열 포지션 타겟팅(전열이 후열 방패)
//  - 관통 시너지(비행/고스트 → 후열 직격)
//  - 타입 시너지 버프(synergyManager 규칙 미러)
// 를 추가. 멀티(PvP) 코드는 건드리지 않는 독립 엔진.

import { pokeAPI, PokemonData } from '../api/pokeapi';
import { getTypeEffectiveness } from '../utils/typeEffectiveness';
import { DeckRow } from '../types/cards';

// ─── 결정론 RNG(mulberry32) ────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BattleSide = 'player' | 'enemy';

export interface BattleCard {
  uid: string;
  pokemonId: number;
  name: string;
  sprite: string;
  types: string[];
  stars: number;
  row: DeckRow;
  slot: number;
  side: BattleSide;
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  critChance: number;
  /** 후열 직격 가능(관통 시너지). */
  canPenetrate: boolean;
}

export interface BattleLogEntry {
  turn: number;
  attackerUid: string;
  targetUid: string;
  damage: number;
  isCrit: boolean;
  effectiveness: number;
  fainted: boolean;
  remainingHp: number;
}

export interface BattleResult {
  winner: BattleSide;
  playerAlive: number;
  enemyAlive: number;
  turns: number;
  log: BattleLogEntry[];
}

export interface ActiveSynergy { type: string; count: number; tier: number; }

const MAX_TURNS = 60;

// ─── 스탯 파생 ─────────────────────────────────────────────────────
const ARTWORK = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

function levelForStars(stars: number): number {
  return 30 + (stars - 1) * 8; // ★1=30 … ★5=62
}

/** PokemonData + 별 + 포지션 → BattleCard(스탯 확정). statMult로 층 난이도 가산. */
export function buildBattleCard(
  p: PokemonData,
  opts: { stars: number; row: DeckRow; slot: number; side: BattleSide; statMult?: number; uid?: string },
): BattleCard {
  const stars = Math.max(1, Math.min(5, opts.stars));
  const level = levelForStars(stars);
  // 별 배율(양쪽 공통)과 층 배율(적 전용, statMult)을 분리.
  const starOnly = 1 + (stars - 1) * 0.12;
  const fullMult = starOnly * (opts.statMult ?? 1); // HP·공격·특공·속도
  // [밸런스] 방어/특방엔 '층 배율'을 빼고 별 배율만 적용 → 적 방어가 층마다 부풀어
  //   플레이어 딜이 무력화되던 '벽'을 완화(플레이어는 statMult=1이라 영향 없음).
  const defMult = starOnly;
  const b = p.stats;

  const hp = Math.floor((((2 * b.hp) * level) / 100 + level + 10) * fullMult);
  const mk = (base: number, m: number) => Math.floor((((2 * base) * level) / 100 + 5) * m);

  return {
    uid: opts.uid ?? `${opts.side}-${p.id}-${opts.row}-${opts.slot}`,
    pokemonId: p.id,
    name: p.displayName,
    sprite: p.sprite || ARTWORK(p.id),
    types: p.types,
    stars,
    row: opts.row,
    slot: opts.slot,
    side: opts.side,
    level,
    maxHp: hp,
    currentHp: hp,
    attack: mk(b.attack, fullMult),
    defense: mk(b.defense, defMult),
    specialAttack: mk(b.specialAttack, fullMult),
    specialDefense: mk(b.specialDefense, defMult),
    // [FIX] 속도도 별/층 배율 반영 — 고성 유닛이 선공(기존엔 원본 종족 속도라 별이 턴순서에 무영향).
    speed: Math.max(1, Math.floor(b.speed * fullMult)),
    critChance: 0.0625,
    canPenetrate: false, // applySynergies에서 확정
  };
}

// ─── 시너지 ────────────────────────────────────────────────────────
/** 팀의 타입 카운트 → 활성 시너지(2/4/6 티어). synergyManager 규칙 미러. */
export function computeSynergies(team: BattleCard[]): ActiveSynergy[] {
  const counts = new Map<string, number>();
  for (const c of team) for (const t of c.types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const out: ActiveSynergy[] = [];
  counts.forEach((count, type) => {
    let tier = 0;
    if (count >= 6) tier = 3; else if (count >= 4) tier = 2; else if (count >= 2) tier = 1;
    if (tier > 0) out.push({ type, count, tier });
  });
  return out;
}

// [FIX] 6마리(tier3) 브레이크포인트가 tier2와 동일 1.3이라 무의미했음 → 1.5로 차등.
const tierMult = (tier: number): number => (tier >= 3 ? 1.5 : tier === 2 ? 1.3 : tier === 1 ? 1.1 : 1.0);

/** 팀에 시너지 버프 적용 + 관통 플래그 세팅. (in-place) */
export function applySynergies(team: BattleCard[]): ActiveSynergy[] {
  const synergies = computeSynergies(team);
  const byType = new Map(synergies.map(s => [s.type, s]));
  const flying = byType.get('flying');
  const ghost = byType.get('ghost');

  for (const c of team) {
    // 공/방 스탯에 타입 시너지 최고 티어 배율(HP 제외 — 기존 getBuffedStats와 일관)
    let best = 1.0;
    for (const t of c.types) {
      const s = byType.get(t);
      if (s) best = Math.max(best, tierMult(s.tier));
    }
    if (best > 1.0) {
      c.attack = Math.floor(c.attack * best);
      c.defense = Math.floor(c.defense * best);
      c.specialAttack = Math.floor(c.specialAttack * best);
      c.specialDefense = Math.floor(c.specialDefense * best);
    }
    // 관통: 본인이 비행/고스트이고 해당 시너지가 2+면 후열 직격
    c.canPenetrate =
      (!!flying && c.types.includes('flying')) ||
      (!!ghost && c.types.includes('ghost'));
  }
  return synergies;
}

// ─── 전투 시뮬레이션 ─────────────────────────────────────────────────
class CardBattleService {
  /**
   * 양 팀 BattleCard(시너지 미적용 원본) → 결정론 전투.
   * applySynergies를 내부에서 호출하므로 입력 배열이 변형됨(복제해서 넘길 것).
   */
  simulate(playerTeam: BattleCard[], enemyTeam: BattleCard[], seed: number): BattleResult {
    const rng = mulberry32(seed);
    applySynergies(playerTeam);
    applySynergies(enemyTeam);

    const all = [...playerTeam, ...enemyTeam];
    const log: BattleLogEntry[] = [];
    let turn = 0;

    const sideAlive = (s: BattleSide) => all.some(c => c.side === s && c.currentHp > 0);

    while (sideAlive('player') && sideAlive('enemy') && turn < MAX_TURNS) {
      turn++;
      // 전 유닛 스피드 내림차순(동률 uid)
      const actors = all
        .filter(c => c.currentHp > 0)
        .sort((a, b) => (b.speed !== a.speed ? b.speed - a.speed : a.uid.localeCompare(b.uid)));

      for (const attacker of actors) {
        if (attacker.currentHp <= 0) continue;
        const enemies = all.filter(c => c.side !== attacker.side && c.currentHp > 0);
        const target = this.pickTarget(attacker, enemies);
        if (!target) break;

        const { damage, isCrit, effectiveness } = this.calcDamage(attacker, target, rng);
        target.currentHp = Math.max(0, target.currentHp - damage);
        const fainted = target.currentHp <= 0;

        log.push({
          turn,
          attackerUid: attacker.uid,
          targetUid: target.uid,
          damage, isCrit, effectiveness, fainted,
          remainingHp: target.currentHp,
        });
      }
    }

    const playerAlive = playerTeam.filter(c => c.currentHp > 0).length;
    const enemyAlive = enemyTeam.filter(c => c.currentHp > 0).length;
    let winner: BattleSide;
    if (playerAlive > 0 && enemyAlive === 0) winner = 'player';
    else if (enemyAlive > 0 && playerAlive === 0) winner = 'enemy';
    else {
      // 시간초과/동시전멸 — HP 비율 높은 쪽, 동률이면 enemy(방어자 유리)
      const ratio = (team: BattleCard[]) => {
        const cur = team.reduce((s, c) => s + c.currentHp, 0);
        const max = team.reduce((s, c) => s + c.maxHp, 0) || 1;
        return cur / max;
      };
      winner = ratio(playerTeam) > ratio(enemyTeam) ? 'player' : 'enemy';
    }

    return { winner, playerAlive, enemyAlive, turns: turn, log };
  }

  /** 전열 우선 타겟. 관통이면 후열 우선. 최저 HP, 동률 uid. */
  private pickTarget(attacker: BattleCard, enemies: BattleCard[]): BattleCard | null {
    if (enemies.length === 0) return null;
    let pool: BattleCard[];
    if (attacker.canPenetrate) {
      const back = enemies.filter(c => c.row === 'back');
      pool = back.length ? back : enemies;
    } else {
      const front = enemies.filter(c => c.row === 'front');
      pool = front.length ? front : enemies;
    }
    return pool.reduce((best, c) =>
      c.currentHp < best.currentHp || (c.currentHp === best.currentHp && c.uid < best.uid) ? c : best,
    );
  }

  private calcDamage(attacker: BattleCard, defender: BattleCard, rng: () => number) {
    const r1 = rng(); // crit
    const r2 = rng(); // damage variance
    const moveType = attacker.types[0] ?? 'normal';
    const special = attacker.specialAttack > attacker.attack;
    const atkStat = special ? attacker.specialAttack : attacker.attack;
    const defStat = special ? defender.specialDefense : defender.defense;
    const power = 50 + attacker.level;

    const effectiveness = getTypeEffectiveness(moveType, defender.types);
    const stab = attacker.types.includes(moveType) ? 1.5 : 1.0;
    const isCrit = r1 < attacker.critChance;
    const variance = 0.85 + r2 * 0.15;

    const level = attacker.level;
    const base = ((2 * level) / 5 + 2) * power * atkStat / Math.max(1, defStat) / 50 + 2;
    let dmg = base * effectiveness * variance * stab;
    if (isCrit) dmg *= 1.5;

    return { damage: Math.max(1, Math.floor(dmg)), isCrit, effectiveness };
  }

  // ─── 적 팀 생성(트레이너 타워) ────────────────────────────────────
  /**
   * 층(floor)에 맞춰 적 6마리 구성. 층이 오를수록 별·스탯 보정 상승.
   * 보스층(10단위)은 별/스탯 추가 가산.
   */
  async generateEnemyTeam(floor: number, seed: number): Promise<BattleCard[]> {
    await pokeAPI.preloadRarities().catch(() => {});
    // [DETERMINISM] 적 포켓몬 선택도 시드 rng로 — Math.random을 쓰면 재도전마다 적팀이 리롤되어
    //   결정론(동일 덱+동일 층=동일 결과)이 깨지고 약한 적이 나올 때까지 재시도(retry-scum)가 가능했음.
    const rng = mulberry32(seed);
    const isBoss = floor % 10 === 0;

    // [밸런스] "초반 엄청 쉽게 → 층마다 완만 상승" 곡선. (스타터 ★1 덱: 1~9층 여유, 10층 보스가 첫 관문)
    //   - statMult: 1 밑(0.578)에서 시작해 층당 +0.028 선형 상승(≈16층에 1.0). 플레이어(=1)보다 낮게 출발.
    //   - 별: 10층 구간당 +1 (1~10층 ★1 … 41층~ ★5). 보스 별 점프·랜덤 지터 제거 → 스파이크 없는 결정적 곡선.
    //   - rarityBoost: 1~3층은 0(약한 커먼만) → 이후 층당 +0.03. 저층 종족값도 약하게.
    //   - 보스층은 statMult +0.1만(소폭) — 벽이 아닌 살짝 강한 정도(첫 보스=10층은 여전히 ★1).
    //   방어/특방엔 층 배율 미적용(buildBattleCard) → 플레이어 딜이 유지돼 '벽'감 완화.
    const baseStars = Math.min(5, 1 + Math.floor((floor - 1) / 10));
    const statMult = 0.55 + floor * 0.028 + (isBoss ? 0.1 : 0);
    const rarityBoost = Math.min(1.2, Math.max(0, floor - 3) * 0.03);

    const rows: DeckRow[] = ['front', 'front', 'front', 'back', 'back', 'back'];
    const team: BattleCard[] = [];

    for (let i = 0; i < 6; i++) {
      // 페치 실패(오프라인 등) 시 최대 5회까지 다른 후보로 재시도 — 팀이 6마리 미만이 되면
      //   simulate가 루프를 안 돌고 즉시 플레이어 승리 처리되어 '무혈 클리어+보상' 버그가 났었음.
      let p: PokemonData | null = null;
      for (let tryN = 0; tryN < 5 && !p; tryN++) {
        const id = await pokeAPI.getRandomCardId(rarityBoost, rng);
        p = await pokeAPI.getPokemon(id).catch(() => null);
      }
      if (!p) throw new Error('ENEMY_TEAM_INCOMPLETE');
      const row = rows[i];
      const slot = i % 3;
      team.push(buildBattleCard(p, { stars: baseStars, row, slot, side: 'enemy', statMult, uid: `enemy-${i}` }));
    }
    if (team.length < 6) throw new Error('ENEMY_TEAM_INCOMPLETE');
    return team;
  }
}

export const cardBattleService = new CardBattleService();
