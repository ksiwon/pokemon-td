// src/services/CardBattleService.ts
// 카드 오토배틀 전투엔진. PvPBattleService의 데미지식을 차용하되
//  - 전열/후열 포지션 타겟팅(전열이 후열 방패)
//  - 관통 시너지(비행/고스트 → 후열 직격)
//  - 타입 시너지 버프(synergyManager 규칙 미러)
// 를 추가. 멀티(PvP) 코드는 건드리지 않는 독립 엔진.

import { pokeAPI, PokemonData } from '../api/pokeapi';
import { getTypeEffectiveness } from '../utils/typeEffectiveness';
import { BASE_CRIT_CHANCE } from '../utils/abilities';
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

/**
 * uid+시드 → 진영과 무관한 결정론 정수(FNV-1a).
 * [FIX] 행동 순서의 속도 동률을 uid 문자열 비교로 깨면 'enemy-*' < 'player-*' 라
 *   **적이 항상 선공**한다. 전투가 1~3턴에 끝나는 알파스트라이크 구조라 이 한 줄이
 *   거울전 승률을 24%까지 끌어내렸다(측정). 해시로 섞어 어느 진영도 편들지 않게 한다.
 */
function tieKey(uid: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type BattleSide = 'player' | 'enemy';

/** 시너지로 부여되는 상태이상 종류. */
export type StatusKind = 'burn' | 'poison' | 'paralyze' | 'freeze';

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
  // ─── 타입 시너지 특수효과 (applySynergies에서 확정) ───
  /** 급소 배율(악 시너지로 상승, 기본 1.5). */
  critMult?: number;
  /** 공격 적중 시 부여하는 상태이상(불=화상/독=독/전기=마비/얼음=빙결). */
  inflicts?: StatusKind;
  inflictChance?: number;
  /** 준 데미지 대비 회복 비율(풀 시너지). */
  lifestealPct?: number;
  // ─── 전투 중 런타임 상태 (simulate 내부 전용) ───
  _burnTurns?: number;
  _poisonTurns?: number;
  _stunned?: StatusKind | null;
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
  /** 로그 종류. 생략 시 'attack'(하위호환). dot=지속피해 틱, skip=행동불가, heal=흡혈 회복. */
  kind?: 'attack' | 'dot' | 'skip' | 'heal';
  /** attack에서 실제 사용한 기술 타입(자기 타입 중 상대에게 가장 잘 통하는 쪽). */
  moveType?: string;
  /** attack에서 이번 타격으로 부여한 상태이상. */
  inflicted?: StatusKind;
  /** dot/skip의 원인 상태이상. */
  status?: StatusKind;
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

/**
 * 기술 위력 배율 — 전투 길이를 정하는 유일한 노브.
 * [밸런스] 구 공식은 실질 위력 (50+lv)×1.5(상수 자속)라 전투가 평균 2턴에 끝났다.
 *   6유닛이 최저HP 대상에 집중포화하는 구조라 턴당 2~3마리가 증발 →
 *   화상(2턴)·독(3턴)·마비 같은 상태이상이 발동할 시간 자체가 없었고,
 *   승/패가 6v0 ↔ 0v6으로 갈리며 접전 구간이 사라졌다.
 *   시뮬 스윕(거울전 200판 평균 턴 / 불6vs풀6 DoT 발동 틱):
 *     1.00(구) → 2.0턴 / 14틱   ·   0.62 → 6.7턴 / 7틱
 *     0.40     → 9.3턴 / 267틱  ·   0.28 → 12.4턴 / 440틱
 *   0.40 채택 — 화상(2턴)·독(3턴)이 확실히 돌면서 재생 시간이 과하지 않은 지점.
 *   덱별 타워 도달 층은 이 값에 거의 무관(도달 층은 statMult 곡선이 결정).
 */
const POWER_SCALE = 0.40;

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
    critChance: BASE_CRIT_CHANCE,
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

// ─── 타입 시너지 특수효과 티어 테이블 (인덱스 = tier 0~3) ─────────────────
// [밸런스] 시뮬 비교로 확정(변경 전후 도달층 델타 측정). 상태이상 부여는 확률형이라
//   양 팀 대칭 적용 시에도 타입 스택 덱이 상대적으로 이득 — 시너지 전략성 강화 목적.
const DOT_CHANCE = [0, 0.20, 0.30, 0.45];   // 화상(불)·독(독) 부여 확률
const STUN_CHANCE = [0, 0.15, 0.22, 0.30];  // 마비(전기)·빙결(얼음) 부여 확률
const LIFESTEAL_PCT = [0, 0.20, 0.30, 0.45]; // 흡혈(풀) — 준 데미지 대비 회복
const CRIT_ADD = [0, 0.10, 0.15, 0.25];     // 급소율 가산(격투)
const CRIT_MULT = [1.5, 1.75, 2.0, 2.25];   // 급소 배율(악)
/** 화상: 매 턴 최대HP의 5%, 2턴. 독: 매 턴 4%, 3턴. (재부여 시 지속턴 갱신) */
export const BURN_TICK_PCT = 0.05;
export const BURN_TURNS = 2;
export const POISON_TICK_PCT = 0.04;
export const POISON_TURNS = 3;

/** 팀에 시너지 버프 적용 + 관통/특수효과 플래그 세팅. (in-place) */
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

    // ─── 특수효과: 본인 타입이 활성 시너지에 속할 때만 부여(관통과 동일 원칙) ───
    const tierOf = (ty: string) => (c.types.includes(ty) ? (byType.get(ty)?.tier ?? 0) : 0);

    // 상태이상 부여(우선순위: 불 > 독 > 전기 > 얼음 — 이중타입이 겹칠 때 하나만)
    const inflictTable: Array<{ ty: string; kind: StatusKind; table: number[] }> = [
      { ty: 'fire', kind: 'burn', table: DOT_CHANCE },
      { ty: 'poison', kind: 'poison', table: DOT_CHANCE },
      { ty: 'electric', kind: 'paralyze', table: STUN_CHANCE },
      { ty: 'ice', kind: 'freeze', table: STUN_CHANCE },
    ];
    c.inflicts = undefined;
    c.inflictChance = 0;
    for (const { ty, kind, table } of inflictTable) {
      const tier = tierOf(ty);
      if (tier > 0) { c.inflicts = kind; c.inflictChance = table[tier]; break; }
    }

    c.lifestealPct = LIFESTEAL_PCT[tierOf('grass')] || undefined;
    c.critChance += CRIT_ADD[tierOf('fighting')];
    c.critMult = CRIT_MULT[tierOf('dark')];
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

    // 진영 무관 동률 해소 키 — 속도 동률/틱 순서 모두 이걸로 정렬(결정론 유지, 편향 제거)
    const tie = new Map<string, number>();
    for (const c of all) tie.set(c.uid, tieKey(c.uid, seed));
    const byTie = (a: BattleCard, b: BattleCard) => tie.get(a.uid)! - tie.get(b.uid)!;

    const sideAlive = (s: BattleSide) => all.some(c => c.side === s && c.currentHp > 0);

    while (sideAlive('player') && sideAlive('enemy') && turn < MAX_TURNS) {
      turn++;

      // ─── 1) 턴 시작: 지속피해(화상/독) 틱 — uid순(결정론) ───
      const afflicted = all
        .filter(c => c.currentHp > 0 && ((c._burnTurns ?? 0) > 0 || (c._poisonTurns ?? 0) > 0))
        .sort(byTie);
      for (const c of afflicted) {
        const tick = (status: StatusKind, pct: number) => {
          if (c.currentHp <= 0) return;
          const dmg = Math.max(1, Math.floor(c.maxHp * pct));
          c.currentHp = Math.max(0, c.currentHp - dmg);
          log.push({
            turn, kind: 'dot', status,
            attackerUid: c.uid, targetUid: c.uid,
            damage: dmg, isCrit: false, effectiveness: 1,
            fainted: c.currentHp <= 0, remainingHp: c.currentHp,
          });
        };
        if ((c._burnTurns ?? 0) > 0) { c._burnTurns!--; tick('burn', BURN_TICK_PCT); }
        if ((c._poisonTurns ?? 0) > 0) { c._poisonTurns!--; tick('poison', POISON_TICK_PCT); }
      }
      if (!sideAlive('player') || !sideAlive('enemy')) break;

      // ─── 2) 행동: 전 유닛 스피드 내림차순(동률은 진영 무관 해시) ───
      const actors = all
        .filter(c => c.currentHp > 0)
        .sort((a, b) => (b.speed !== a.speed ? b.speed - a.speed : byTie(a, b)));

      for (const attacker of actors) {
        if (attacker.currentHp <= 0) continue;

        // 마비/빙결: 이번 행동 건너뜀(1회성 소모)
        if (attacker._stunned) {
          const status = attacker._stunned;
          attacker._stunned = null;
          log.push({
            turn, kind: 'skip', status,
            attackerUid: attacker.uid, targetUid: attacker.uid,
            damage: 0, isCrit: false, effectiveness: 1,
            fainted: false, remainingHp: attacker.currentHp,
          });
          continue;
        }

        const enemies = all.filter(c => c.side !== attacker.side && c.currentHp > 0);
        const target = this.pickTarget(attacker, enemies);
        if (!target) break;

        const { damage, isCrit, effectiveness, moveType } = this.calcDamage(attacker, target, rng);
        target.currentHp = Math.max(0, target.currentHp - damage);
        const fainted = target.currentHp <= 0;

        // 상태이상 부여(대상 생존 + 실제로 피해를 준 경우에만) — rng 소비는 부여 능력 보유자만.
        //   면역(0데미지)으로 튕긴 공격이 화상/마비를 거는 건 부자연스럽다.
        let inflicted: StatusKind | undefined;
        if (attacker.inflicts && (attacker.inflictChance ?? 0) > 0 && !fainted && damage > 0) {
          if (rng() < (attacker.inflictChance ?? 0)) {
            inflicted = attacker.inflicts;
            if (inflicted === 'burn') target._burnTurns = BURN_TURNS;
            else if (inflicted === 'poison') target._poisonTurns = POISON_TURNS;
            else target._stunned = inflicted; // paralyze | freeze
          }
        }

        log.push({
          turn,
          attackerUid: attacker.uid,
          targetUid: target.uid,
          damage, isCrit, effectiveness, fainted, moveType,
          remainingHp: target.currentHp,
          ...(inflicted ? { inflicted } : {}),
        });

        // 흡혈(풀 시너지): 준 데미지 비율만큼 회복
        if (attacker.lifestealPct && damage > 0 && attacker.currentHp > 0 && attacker.currentHp < attacker.maxHp) {
          const heal = Math.min(
            attacker.maxHp - attacker.currentHp,
            Math.max(1, Math.floor(damage * attacker.lifestealPct)),
          );
          attacker.currentHp += heal;
          log.push({
            turn, kind: 'heal',
            attackerUid: attacker.uid, targetUid: attacker.uid,
            damage: heal, isCrit: false, effectiveness: 1,
            fainted: false, remainingHp: attacker.currentHp,
          });
        }
      }
    }

    const playerAlive = playerTeam.filter(c => c.currentHp > 0).length;
    const enemyAlive = enemyTeam.filter(c => c.currentHp > 0).length;
    let winner: BattleSide;
    if (playerAlive > 0 && enemyAlive === 0) winner = 'player';
    else if (enemyAlive > 0 && playerAlive === 0) winner = 'enemy';
    else {
      // 시간초과/동시전멸 — 생존 수 → HP 비율 → 시드 동전던지기.
      // [FIX] 기존엔 HP 비율 동률에서 무조건 enemy 승("방어자 유리")이었는데, 타워엔
      //   방어자 개념이 없고 선공 편향과 방향이 같아 플레이어에게 이중 페널티였다.
      const ratio = (team: BattleCard[]) => {
        const cur = team.reduce((s, c) => s + c.currentHp, 0);
        const max = team.reduce((s, c) => s + c.maxHp, 0) || 1;
        return cur / max;
      };
      const rp = ratio(playerTeam);
      const re = ratio(enemyTeam);
      if (playerAlive !== enemyAlive) winner = playerAlive > enemyAlive ? 'player' : 'enemy';
      else if (Math.abs(rp - re) > 1e-9) winner = rp > re ? 'player' : 'enemy';
      else winner = mulberry32((seed ^ 0x5bf03635) >>> 0)() < 0.5 ? 'player' : 'enemy';
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

  /**
   * 데미지 1회.
   * [FIX] 기술 타입을 types[0]으로 고정하던 걸 '자기 타입 중 상대에게 가장 잘 통하는 쪽'으로 변경.
   *   - 기존엔 이중타입(526종)의 2번 타입이 공격에서 완전히 사장됐다(그중 289종이 손해).
   *     리자몽은 영원히 불꽃으로만, 갸라도스는 물로만 때렸다.
   *   - 또 moveType이 정의상 항상 자기 타입이라 STAB(자속) 판정이 1025종 전부 참 →
   *     '자속 1.5배'는 전 유닛 공통 상수였다. 허구인 자속 항을 걷어내고, 대신 위력 상수를
   *     올려 전체 데미지 수준을 보존한다(상수배는 승패에 영향 없음).
   */
  private calcDamage(attacker: BattleCard, defender: BattleCard, rng: () => number) {
    const r1 = rng(); // crit
    const r2 = rng(); // damage variance

    let moveType = attacker.types[0] ?? 'normal';
    let effectiveness = getTypeEffectiveness(moveType, defender.types, true);
    for (let i = 1; i < attacker.types.length; i++) {
      const e = getTypeEffectiveness(attacker.types[i], defender.types, true);
      if (e > effectiveness) { effectiveness = e; moveType = attacker.types[i]; }
    }
    // 완전 무효 — 카드 모드는 원전대로 0. 로그 패널의 '무효' 뱃지가 여기서 처음 켜진다.
    if (effectiveness === 0) {
      return { damage: 0, isCrit: false, effectiveness: 0, moveType };
    }

    const special = attacker.specialAttack > attacker.attack;
    const atkStat = special ? attacker.specialAttack : attacker.attack;
    const defStat = special ? defender.specialDefense : defender.defense;
    // 구 공식의 (50 + level) × 상수 자속 1.5 를 위력에 흡수한 뒤 POWER_SCALE로 전투 길이 조정
    const power = (50 + attacker.level) * 1.5 * POWER_SCALE;

    const isCrit = r1 < attacker.critChance;
    const variance = 0.85 + r2 * 0.15;

    const level = attacker.level;
    const base = ((2 * level) / 5 + 2) * power * atkStat / Math.max(1, defStat) / 50 + 2;
    let dmg = base * effectiveness * variance;
    if (isCrit) dmg *= attacker.critMult ?? 1.5; // 악 시너지: 급소 배율 상승

    return { damage: Math.max(1, Math.floor(dmg)), isCrit, effectiveness, moveType };
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

    // [FIX] 층별 최소 레어도 — rarityBoost는 가중치만 밀어줄 뿐이라 고층에도 커먼이 섞여
    //   난이도가 들쭉날쭉했다(측정: 전설덱이 F41에서 막히는데 F70은 클리어). 최소 등급을
    //   깔아 층이 오를수록 확실히 강해지게 한다. 0=Bronze … 3=Diamond.
    const minRank = Math.min(3, Math.floor((floor - 1) / 12));
    const pickId = async (r: () => number): Promise<number> => {
      if (minRank > 0) {
        const pool = pokeAPI.getCardIdsAtLeastRarity(minRank);
        if (pool.length > 0) return pool[Math.floor(r() * pool.length)];
      }
      return pokeAPI.getRandomCardId(rarityBoost, r);
    };

    // [DETERMINISM] 6마리 id를 먼저 뽑아 rng 스트림을 고정한다. 재시도가 주 스트림을 소비하면
    //   캐시 상태(오프라인 여부)에 따라 기기마다 적팀이 달라졌다 — 재시도는 별도 스트림에서.
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push(await pickId(rng));
    const retryRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

    const rows: DeckRow[] = ['front', 'front', 'front', 'back', 'back', 'back'];
    const team: BattleCard[] = [];

    for (let i = 0; i < 6; i++) {
      // 페치 실패(오프라인 등) 시 최대 4회까지 다른 후보로 재시도 — 팀이 6마리 미만이 되면
      //   simulate가 루프를 안 돌고 즉시 플레이어 승리 처리되어 '무혈 클리어+보상' 버그가 났었음.
      let p: PokemonData | null = await pokeAPI.getPokemon(ids[i]).catch(() => null);
      for (let tryN = 0; tryN < 4 && !p; tryN++) {
        p = await pokeAPI.getPokemon(await pickId(retryRng)).catch(() => null);
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
