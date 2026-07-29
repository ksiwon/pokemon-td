// src/game/arenaSim.ts
// TFT 아레나 전투의 순수 시뮬레이션 코어.
// TFTBattleArena.tsx(렌더링/타이머/네트워크)에서 로직만 분리한 것 — 동작 동일.
// 분리 목적:
//   1) 밸런스 시뮬 하네스(sim/)가 브라우저 없이 전투를 대량 실행
//   2) 컴포넌트와 시뮬이 같은 코드를 쓰므로 모델 드리프트 원천 차단
//
// ⚠ 이 파일의 수치/로직을 바꾸면 실제 멀티 인간전 결과가 바뀐다. 순수 이동만 허용.

import { TowerDetail } from '../types/multiplayer';
import { getTypeEffectiveness } from '../utils/typeEffectiveness';
import { getBuffedStats } from '../utils/synergyManager';
import { GamePokemon, Synergy } from '../types/game';
import { mulberry32 } from '../utils/rng';

export { mulberry32 };

export const COLS = 6;
export const ROWS = 6;
export const CELL = 88;
export const ATTACK_RANGE = 1.4;
export const MOVE_SPEED = 1.0;
export const ATK_COOLDOWN = 1.3;
export const FPS = 30;
export const TICK_MS = 1000 / FPS;

export interface Unit {
  id: string;
  detail: TowerDetail;
  team: 'my' | 'opp';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atkCd: number;
  fainted: boolean;
  isAtk: boolean;
  isHit: boolean;
  // [FIX-5] 상태이상 지원
  statusEffect?: {
    type: 'burn' | 'poison' | 'paralysis' | 'freeze' | 'sleep';
    turnsLeft: number;   // 남은 지속 틱 수
  };
  /**
   * 6마리 타입 시너지(level 3)로 약점이 반감되는 타입 목록.
   * [FIX] 시너지 설명은 "(6) 스탯 1.3배, 해당 타입 약점 데미지 0.5배"인데 이 방어 효과가
   *   싱글(GameManager)에만 구현돼 있었다. 스탯 배율은 4마리(level 2)와 똑같이 1.3이라,
   *   TFT에서는 한 타입을 6마리까지 모을 이유가 전혀 없었다. 여기서 되살린다.
   */
  resistTypes?: string[];
}

/** 팀 시너지에서 level 3(6마리) 타입 목록 중 해당 유닛이 가진 것만 추린다. */
export function sixPieceResistTypes(detail: TowerDetail, synergies: Synergy[]): string[] {
  const own = new Set(detail.types ?? []);
  return synergies
    .filter(s => s.level === 3 && s.id.startsWith('type:'))
    .map(s => s.id.split(':')[1])
    .filter(ty => own.has(ty));
}

export interface FloatTxt {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
}

export const L_POS = [
  { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 },
  { x: 1, y: 3 }, { x: 0, y: 4 }, { x: 1, y: 5 },
];
export const R_POS = [
  { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 2 },
  { x: 4, y: 3 }, { x: 5, y: 4 }, { x: 4, y: 5 },
];

// ─── [FIX-5] 배틀 데미지 계산 결과 타입 ──────────────────────────────────────
export interface DmgResult {
  damage: number;
  isCrit: boolean;
  isStab: boolean;
  effectiveness: number;  // 타입 상성 배율 (0.1/0.5/1/2/4)
  statusInflicted?: 'burn' | 'poison' | 'paralysis' | 'freeze' | 'sleep';
  isMiss: boolean;        // 명중 실패 여부 (accuracy 판정)
  isAOE: boolean;         // 선택된 기술이 광역 기술인지
  drainPercent?: number;  // 기술의 흡혈 비율 (move.effect.drainPercent)
}

/**
 * [FIX-5 FINAL] calcDmg — 싱글플레이와 완전 동일한 로직
 *   STAB · 물리/특수 구분 · 타입상성 · 크리티컬 · 명중률 · 상태이상 · 흡혈 · AOE
 *
 * RNG 소비 순서 (결정론 보장 — 항상 정확히 6회 소비):
 *   r1 → 기술 선택 방식 (최강 vs 랜덤)
 *   r2 → 랜덤 기술 인덱스
 *   r3 → 크리티컬 판정
 *   r4 → 데미지 난수 (0.85~1.0)
 *   r5 → 상태이상 부여 판정
 *   r6 → 명중률 판정 (accuracy)
 *
 * ※ miss 시에도 r1~r5 소비 후 r6에서 판정 → 양측 RNG 시퀀스 일치 보장
 */
export function calcDmg(a: Unit, d: Unit, rng: () => number): DmgResult {
  const r1 = rng();
  const r2 = rng();
  const r3 = rng();
  const r4 = rng();
  const r5 = rng();
  const r6 = rng();

  const attackerTypes = a.detail.types ?? [];
  const defenderTypes = d.detail.types ?? [];

  // 데미지가 있는 기술만 (status 기술 제외)
  const damageMoves = (a.detail.equippedMoves ?? []).filter(
    m => m.damageClass !== 'status' && (m.power ?? 0) > 0
  );

  let power = 50 + a.detail.level;
  let moveType: string = attackerTypes[0] ?? 'normal';
  let damageClass: 'physical' | 'special' = 'physical';
  let moveEffect: { statusInflict?: string; statusChance?: number | null; drainPercent?: number } | null = null;
  let accuracy = 100; // 기술 명중률 (기본 100%)
  let isAOE = false;

  if (damageMoves.length > 0) {
    let idx: number;
    if (r1 < 0.3) {
      // 30% 확률: 위력이 가장 높은 기술 사용
      const maxPower = Math.max(...damageMoves.map(m => m.power ?? 0));
      idx = damageMoves.findIndex(m => (m.power ?? 0) === maxPower);
      if (idx < 0) idx = 0;
    } else {
      // 70% 확률: 랜덤 기술 사용
      idx = Math.floor(r2 * damageMoves.length) % damageMoves.length;
    }
    const sel = damageMoves[idx];
    power      = Math.max(30, sel.power ?? power);
    moveType   = sel.type || moveType;
    damageClass = sel.damageClass === 'special' ? 'special' : 'physical';
    moveEffect = sel.effect ?? null;
    accuracy   = sel.accuracy ?? 100;   // [FIX] 기술 명중률 반영
    isAOE      = sel.isAOE ?? false;    // [FIX] 기술 AOE 여부 반영
  }

  // [FIX] 명중률 판정 (싱글플레이 hitChance = m.accuracy / 100 와 동일)
  // r6를 항상 소비하므로 miss여도 r1~r5 계산은 완료된 뒤 판정
  const isMiss = r6 > (accuracy / 100);
  if (isMiss) {
    return { damage: 0, isCrit: false, isStab: false, effectiveness: 1, isMiss: true, isAOE: false };
  }

  // 물리/특수 구분: 기술의 damageClass에 따라 공/방 스탯 선택
  const atkStat = damageClass === 'special'
    ? (a.detail.specialAttack ?? a.detail.attack ?? a.detail.level * 10)
    : (a.detail.attack ?? a.detail.level * 10);
  const defStat = damageClass === 'special'
    ? (d.detail.specialDefense ?? d.detail.defense ?? d.detail.level * 5)
    : (d.detail.defense ?? d.detail.level * 5);

  // 타입 상성: 기술 타입 기준
  const eff = getTypeEffectiveness(moveType, defenderTypes);

  // 6마리 타입 시너지: 그 타입 기준 2배로 들어오는 공격을 반감(GameManager와 동일 규칙)
  let sixPieceResist = 1.0;
  for (const ty of d.resistTypes ?? []) {
    if (getTypeEffectiveness(moveType, [ty]) === 2) { sixPieceResist = 0.5; break; }
  }

  // 자속 보정 (STAB)
  const isStab = attackerTypes.includes(moveType);

  // 크리티컬
  const critRate = a.detail.critChance ?? 0.0625;
  const isCrit = r3 < critRate;

  // 번 상태이상: 물리 공격력 절반
  const burnPenalty = (a.statusEffect?.type === 'burn' && damageClass === 'physical') ? 0.5 : 1.0;

  // 포켓몬 본가 데미지 공식
  const lvl = a.detail.level;
  const base = ((2 * lvl / 5 + 2) * power * atkStat / Math.max(defStat, 1)) / 50 + 2;
  const randomFactor = 0.85 + r4 * 0.15;
  let dmg = base * eff * randomFactor * burnPenalty * sixPieceResist;
  if (isStab) dmg *= 1.5;
  if (isCrit) dmg *= 1.5;

  // 상태이상 부여: 이미 상태이상이 없는 경우만
  let statusInflicted: DmgResult['statusInflicted'];
  if (!d.statusEffect && moveEffect?.statusInflict && moveEffect.statusChance != null) {
    if (r5 * 100 < (moveEffect.statusChance ?? 0)) {
      const s = moveEffect.statusInflict as string;
      if (s === 'burn' || s === 'poison' || s === 'paralysis' || s === 'freeze' || s === 'sleep') {
        statusInflicted = s;
      }
    }
  }

  // [FIX] drainPercent: move.effect.drainPercent (흡혈 기술, 싱글플레이와 동일)
  const drainPercent = moveEffect?.drainPercent;

  return {
    damage: Math.max(1, Math.floor(dmg)),
    isCrit,
    isStab,
    effectiveness: eff,
    statusInflicted,
    isMiss: false,
    isAOE,
    drainPercent,
  };
}

export function dst(a: Unit, b: Unit) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** 보드 기준 진영(L/R) — 클라이언트마다 다른 my/opp를 양쪽에서 같은 값으로 환산. */
function boardSide(u: Unit, myPosition: 'L' | 'R'): 'L' | 'R' {
  return (u.team === 'my') === (myPosition === 'L') ? 'L' : 'R';
}

/** 문자열+시드 → 결정론 정수(FNV-1a). 진영과 무관한 행동 순서 tiebreak용. */
function hashKey(key: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 한 틱 안에서 유닛이 행동하는 순서.
 * [FIX] 예전엔 L팀 전원 → R팀 전원 순이었다. myPosition은 player1Id(=userId 사전순 앞선 쪽)가
 *   항상 L이므로, 초기 쿨다운이 양팀 동일한 상황에서 **uid가 사전순으로 앞선 플레이어가
 *   매 틱 먼저 때리는** 구조적 이점이 있었다. 보드 기준 canonical 키를 시드로 해싱해
 *   어느 진영도 편들지 않게 하되, 양쪽 클라이언트에서 동일한 순서가 나오도록 유지한다.
 */
export function buildCanonicalOrder(units: Unit[], myPosition: 'L' | 'R', seed = 0): Unit[] {
  const alive = (u: Unit) => !u.fainted && u.hp > 0 && u.x >= 0;
  const key = (u: Unit) => `${boardSide(u, myPosition)}-${u.id.split('-')[1]}`;

  return units
    .filter(alive)
    .map(u => ({ u, k: key(u) }))
    .sort((a, b) => {
      const ha = hashKey(a.k, seed);
      const hb = hashKey(b.k, seed);
      return ha !== hb ? ha - hb : a.k.localeCompare(b.k);
    })
    .map(x => x.u);
}

export function sortTeamDeterministic(team: TowerDetail[]): TowerDetail[] {
  return (team || []).slice().sort((a, b) => {
    if (a.pokemonId !== b.pokemonId) return a.pokemonId - b.pokemonId;
    if (a.level !== b.level) return b.level - a.level;
    return (a.name || '').localeCompare(b.name || '');
  });
}

// atkCd 초기값: RNG 소비 없이 인덱스 기반 고정 (양측 동일 시퀀스 보장)
export function initialAtkCd(i: number): number { return i * (0.5 / 6); }

export function buildUnits(
  myTeam: TowerDetail[],
  oppTeam: TowerDetail[],
  mySynergies: Synergy[],
  oppSynergies: Synergy[],
): Unit[] {
  const units: Unit[] = [];

  const sortedMy = sortTeamDeterministic(myTeam).slice(0, 6);
  const sortedOpp = sortTeamDeterministic(oppTeam).slice(0, 6);

  sortedMy.forEach((d, i) => {
    // [T11-FIX] 기절 포켓몬도 TFT에서는 풀팀으로 시작.
    //   isFainted:false로 cast해야 getBuffedStats에서 early-return 없이 버프가 정상 적용됨.
    const p = { ...d, isFainted: false } as unknown as GamePokemon;
    const buffed = getBuffedStats(p, mySynergies);
    units.push({
      id: `my-${i}`,
      resistTypes: sixPieceResistTypes(d, mySynergies),
      detail: { ...d, ...buffed },
      team: 'my',
      x: -1,  // 벤치 (prep 중 플레이어가 배치)
      y: i,
      hp: d.maxHp > 0 ? d.maxHp : 100,   // [FIX] 항상 풀HP로 시작 (기력의조각 회복 포함)
      maxHp: d.maxHp > 0 ? d.maxHp : 100,
      atkCd: initialAtkCd(i),
      fainted: false,  // [T11-FIX] TFT는 항상 풀팀으로 시작 (기절 포켓몬도 부활)
      isAtk: false,
      isHit: false,
    });
  });

  sortedOpp.forEach((d, i) => {
    // [T11-FIX] 상대방도 동일하게 기절 포켓몬 포함 풀팀으로 시작
    const p = { ...d, isFainted: false } as unknown as GamePokemon;
    const buffed = getBuffedStats(p, oppSynergies);
    units.push({
      id: `op-${i}`,
      resistTypes: sixPieceResistTypes(d, oppSynergies),
      detail: { ...d, ...buffed },
      team: 'opp',
      x: -2,  // 숨김 (prep 중 보이면 안 됨 — reveal 직전에 배치 확정)
      y: i,
      hp: d.maxHp > 0 ? d.maxHp : 100,   // [FIX] 항상 풀HP로 시작
      maxHp: d.maxHp > 0 ? d.maxHp : 100,
      atkCd: initialAtkCd(i),
      fainted: false,  // [T11-FIX] TFT는 항상 풀팀으로 시작
      isAtk: false,
      isHit: false,
    });
  });
  return units;
}

export function simulateTick(
  units: Unit[],
  myPosition: 'L' | 'R',
  rng: () => number,
  /** 행동 순서 tiebreak 시드 — 양쪽 클라이언트가 공유하는 battleSeed를 넘긴다. */
  seed = 0,
): { units: Unit[]; floats: FloatTxt[]; done: boolean } {
  const next = units.map(u => ({ ...u, isAtk: false, isHit: false }));
  const alive = (u: Unit) => !u.fainted && u.hp > 0 && u.x >= 0;
  const myAlive = next.filter(u => u.team === 'my' && alive(u));
  const oppAlive = next.filter(u => u.team === 'opp' && alive(u));

  if (myAlive.length === 0 || oppAlive.length === 0) {
    return { units: next, floats: [], done: true };
  }

  const canonicalOrder = buildCanonicalOrder(next, myPosition, seed);
  const floats: FloatTxt[] = [];
  let floatSeq = 0;

  // ── [FIX-5] 상태이상 틱 처리 (매 틱마다 적용) ──────────────────
  for (const unit of next) {
    if (!alive(unit) || !unit.statusEffect) continue;
    const se = unit.statusEffect;

    // 독/번 틱 데미지
    if (se.type === 'burn' || se.type === 'poison') {
      const tickDmg = se.type === 'burn'
        ? Math.max(1, Math.floor(unit.maxHp / 16 / FPS))   // 번: 1/16 HP/초
        : Math.max(1, Math.floor(unit.maxHp / 8 / FPS));   // 독: 1/8 HP/초
      unit.hp = Math.max(0, unit.hp - tickDmg);
      if (unit.hp <= 0) unit.fainted = true;
    }

    // 지속 시간 감소
    unit.statusEffect = {
      ...se,
      turnsLeft: se.turnsLeft - 1,
    };
    if (unit.statusEffect.turnsLeft <= 0) {
      unit.statusEffect = undefined;
    }
  }

  for (const unitRef of canonicalOrder) {
    const unit = next.find(u => u.id === unitRef.id)!;
    if (!alive(unit)) continue;

    // ── [FIX-5] 얼음/잠듦: 행동 불가 ──
    if (unit.statusEffect?.type === 'freeze' || unit.statusEffect?.type === 'sleep') {
      // 얼음: 매 틱 20% 확률로 해제 (RNG 소비 없음 — 결정론 유지용 단순 틱 기반)
      if (unit.statusEffect.type === 'freeze' && unit.statusEffect.turnsLeft % 6 === 1) { // 초기값(90)이 6의 배수라 0이면 첫 틱 즉시 해제됨 → 1로 수정
        unit.statusEffect = undefined;
      }
      // 쿨다운만 감소, 공격 스킵
      unit.atkCd = Math.max(0, unit.atkCd - (1 / FPS));
      continue;
    }

    const enemies = unit.team === 'my'
      ? next.filter(u => u.team === 'opp' && alive(u))
      : next.filter(u => u.team === 'my' && alive(u));
    if (!enemies.length) continue;

    // 가장 가까운 적 타겟
    let target = enemies[0];
    let minD = Infinity;
    for (const e of enemies) {
      const d = dst(unit, e);
      if (d < minD - 1e-9) { minD = d; target = e; }
      else if (Math.abs(d - minD) < 1e-9 && e.id.localeCompare(target.id) < 0) { target = e; }
    }

    unit.atkCd = Math.max(0, unit.atkCd - (1 / FPS));

    if (minD <= ATTACK_RANGE) {
      if (unit.atkCd <= 0) {
        // ── [FIX-5] 마비: 25% 확률로 행동 불가 (결정론: 틱 번호 기반) ──
        // RNG를 추가 소비하지 않고 unit.id 해시 + 틱으로 대체해 결정론 유지
        const paraSkip = unit.statusEffect?.type === 'paralysis' &&
          ((parseInt(unit.id.replace(/\D/g, ''), 10) + Math.floor(unit.atkCd * 1000)) % 4 === 0);

        if (!paraSkip) {
          unit.isAtk = true;

          // [FIX-5] 스피드 기반 공격 쿨다운 (speed가 높을수록 빠른 공격)
          const spd = unit.detail.speed ?? 50;
          const speedMult = Math.max(0.4, 1.0 - spd / 400);
          unit.atkCd = ATK_COOLDOWN * speedMult;

          const t2 = next.find(u => u.id === target.id);
          if (t2 && alive(t2)) {
            const result = calcDmg(unit, t2, rng);
            const {
              damage: dmg, isCrit, effectiveness: eff, statusInflicted,
              isMiss, isAOE, drainPercent,
            } = result;

            // ── 명중 실패 (accuracy) ─────────────────────────────────
            if (isMiss) {
              floats.push({
                id: ++floatSeq, text: 'MISS',
                x: t2.x * CELL + CELL / 2, y: t2.y * CELL,
                color: '#aaaaaa',
              });
            } else {
              // ── AOE: 이번 턴에 선택된 기술이 isAOE인 경우만 스플래시 ──
              // aoeBonus = ability AOE 배율 (buildTowerDetails에서 계산)
              if (isAOE && enemies.length > 1) {
                const splashRange = 1.6;
                // aoeBonus: ability AOE 배율(buildTowerDetails에서 계산), 없으면 1.0 기본
                const aoeBonus = (unit.detail.aoeBonus ?? 0) > 0 ? (unit.detail.aoeBonus ?? 1.0) : 1.0;
                const splashDmg = Math.floor(dmg * 0.5 * aoeBonus);
                const splashTargets = enemies
                  .filter(e => e.id !== t2.id && dst(t2, e) <= splashRange)
                  .sort((a, b) => a.id.localeCompare(b.id));
                for (const e of splashTargets) {
                  const spTarget = next.find(u => u.id === e.id);
                  if (spTarget && alive(spTarget)) {
                    spTarget.hp = Math.max(0, spTarget.hp - splashDmg);
                    spTarget.isHit = true;
                    if (spTarget.hp <= 0) spTarget.fainted = true;
                    floats.push({
                      id: ++floatSeq,
                      text: `-${splashDmg}`,
                      x: spTarget.x * CELL + CELL / 2 + 10,
                      y: spTarget.y * CELL - 10,
                      color: '#e67e22',
                    });
                  }
                }
              }

              // ── 메인 타겟 데미지 ──────────────────────────────────
              t2.hp = Math.max(0, t2.hp - dmg);
              t2.isHit = true;
              if (t2.hp <= 0) t2.fainted = true;

              // 플로트 텍스트: 색상으로만 상성 표현 (텍스트 멘트 없음)
              // 크리티컬 + 약점 > 크리티컬 > 4배 > 2배 > 반감 > 무효 > 보통(팀 기준)
              let floatColor: string;
              if (isCrit && eff >= 2)       floatColor = '#ff2200';  // 크리티컬 + 약점: 진빨강
              else if (isCrit)              floatColor = '#f39c12';  // 크리티컬: 골드
              else if (eff >= 4)            floatColor = '#e74c3c';  // 4배: 빨강
              else if (eff >= 2)            floatColor = '#e67e22';  // 2배: 주황
              else if (eff <= 0.15)         floatColor = '#7f8c8d';  // 무효(×0.1): 진회색
              else if (eff <= 0.5)          floatColor = '#5dade2';  // 반감(×0.5): 파랑
              else floatColor = t2.team === 'my' ? '#ff6b6b' : '#ffd93d'; // 보통: 팀색

              const floatText = isCrit ? `💥${dmg}` : `-${dmg}`;

              floats.push({
                id: ++floatSeq, text: floatText,
                x: t2.x * CELL + CELL / 2, y: t2.y * CELL,
                color: floatColor,
              });

              // ── 흡혈: drainPercent(기술 효과) 우선, 없으면 lifesteal 필드 ──
              // 싱글플레이와 동일: proj.effect.drainPercent 기반
              const healRatio = drainPercent ?? (unit.detail.lifesteal || 0);
              if (healRatio > 0 && dmg > 0) {
                const healAmount = Math.floor(dmg * healRatio);
                if (healAmount > 0 && unit.hp < unit.maxHp) {
                  unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
                  floats.push({
                    id: ++floatSeq, text: `+${healAmount}`,
                    x: unit.x * CELL + CELL / 2, y: unit.y * CELL - 15,
                    color: '#2ecc71',
                  });
                }
              }

              // ── 상태이상 부여 ─────────────────────────────────────
              if (statusInflicted && !t2.fainted) {
                const DURATION: Record<string, number> = {
                  burn: FPS * 5, poison: FPS * 5, paralysis: FPS * 4,
                  freeze: FPS * 3, sleep: FPS * 2,
                };
                t2.statusEffect = {
                  type: statusInflicted,
                  turnsLeft: DURATION[statusInflicted] ?? FPS * 3,
                };
                const SE_ICONS: Record<string, string> = {
                  burn: '🔥', poison: '☠️', paralysis: '⚡', freeze: '❄️', sleep: '💤',
                };
                floats.push({
                  id: ++floatSeq,
                  text: SE_ICONS[statusInflicted] ?? '❓',
                  x: t2.x * CELL + CELL / 2 + 20,
                  y: t2.y * CELL - 10,
                  color: '#fff',
                });
              }
            } // end !isMiss
          }
        } else {
          // 마비로 행동 불가
          unit.atkCd = ATK_COOLDOWN * 0.5; // 짧은 페널티
        }
      }
    } else {
      // 이동
      unit.isAtk = false;
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      // [FIX-5] 스피드 기반 이동 속도 (마비 시 절반)
      const spd = unit.detail.speed ?? 50;
      const moveSpeedFinal = MOVE_SPEED * (1 + spd / 200) *
        (unit.statusEffect?.type === 'paralysis' ? 0.5 : 1.0);
      if (len > 0.01) {
        unit.x = Math.max(0, Math.min(COLS - 1, unit.x + (dx / len) * moveSpeedFinal * (1 / FPS)));
        unit.y = Math.max(0, Math.min(ROWS - 1, unit.y + (dy / len) * moveSpeedFinal * (1 / FPS)));
      }
    }
  }

  return { units: next, floats, done: false };
}
