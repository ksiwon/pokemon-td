// src/utils/typeEffectiveness.ts

// 최신 포켓몬 타입 상성표 (18개 타입 - 9세대 기준)
// 2배 효과: 2, 0.5배 효과: 0.5, 무효: 0
import { TYPE_COLOR } from '../styles/tokens';

const TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { 
    rock: 0.5, 
    ghost: 0,
    steel: 0.5
  },
  fire: { 
    fire: 0.5, 
    water: 0.5, 
    grass: 2, 
    ice: 2, 
    bug: 2, 
    rock: 0.5, 
    dragon: 0.5,
    steel: 2,
    fairy: 0.5
  },
  water: { 
    fire: 2, 
    water: 0.5, 
    grass: 0.5, 
    ground: 2, 
    rock: 2, 
    dragon: 0.5 
  },
  electric: { 
    water: 2, 
    electric: 0.5, 
    grass: 0.5, 
    ground: 0, 
    flying: 2, 
    dragon: 0.5 
  },
  grass: { 
    fire: 0.5, 
    water: 2, 
    grass: 0.5, 
    poison: 0.5, 
    ground: 2, 
    flying: 0.5, 
    bug: 0.5, 
    rock: 2, 
    dragon: 0.5,
    steel: 0.5
  },
  ice: { 
    fire: 0.5,
    water: 0.5, 
    grass: 2, 
    ice: 0.5, 
    ground: 2, 
    flying: 2, 
    dragon: 2,
    steel: 0.5
  },
  fighting: { 
    normal: 2, 
    ice: 2, 
    poison: 0.5, 
    flying: 0.5, 
    psychic: 0.5, 
    bug: 0.5, 
    rock: 2, 
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5
  },
  poison: { 
    grass: 2, 
    poison: 0.5, 
    ground: 0.5, 
    rock: 0.5, 
    ghost: 0.5,
    steel: 0,
    fairy: 2
  },
  ground: { 
    fire: 2, 
    electric: 2, 
    grass: 0.5, 
    poison: 2, 
    flying: 0, 
    bug: 0.5, 
    rock: 2,
    steel: 2
  },
  flying: { 
    electric: 0.5, 
    grass: 2, 
    fighting: 2, 
    bug: 2, 
    rock: 0.5,
    steel: 0.5
  },
  psychic: { 
    fighting: 2, 
    poison: 2, 
    psychic: 0.5,
    dark: 0,
    steel: 0.5
  },
  bug: { 
    fire: 0.5, 
    grass: 2, 
    fighting: 0.5, 
    poison: 0.5,
    flying: 0.5, 
    psychic: 2, 
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5
  },
  rock: { 
    fire: 2, 
    ice: 2, 
    fighting: 0.5, 
    ground: 0.5, 
    flying: 2, 
    bug: 2,
    steel: 0.5
  },
  ghost: { 
    normal: 0, 
    psychic: 2, 
    ghost: 2,
    dark: 0.5
  },
  dragon: { 
    dragon: 2,
    steel: 0.5,
    fairy: 0
  },
  dark: {
    fighting: 0.5,
    psychic: 2,
    ghost: 2,
    dark: 0.5,
    fairy: 0.5
  },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5
  }
};

/**
 * 타입 상성 배율.
 * @param trueImmunity 무효(0배)를 그대로 0으로 돌려줄지 여부.
 *   - false(기본, TD 본편): 0배를 0.1배로 완화. 타워가 특정 적에게 아무것도 못 하고
 *     굳어버리는 상황을 막기 위한 규칙 — 배치를 되돌릴 수 없는 TD에선 필요하다.
 *   - true(카드 오토배틀): 원전대로 완전 무효. 덱을 매판 새로 짤 수 있는 모드라
 *     면역이 덱빌딩의 축으로 기능해야 한다.
 */
export function getTypeEffectiveness(
  attackType: string,
  defenseTypes: string[],
  trueImmunity = false,
): number {
  let multiplier = 1;
  for (const defType of defenseTypes) {
    const eff = TYPE_CHART[attackType]?.[defType] ?? 1;
    if (eff === 0) {
      if (trueImmunity) return 0;
      multiplier *= 0.1;
    } else {
      multiplier *= eff;
    }
  }
  return multiplier;
}

/**
 * 타입 색 — 단일 출처는 src/styles/tokens.ts 의 TYPE_COLOR 다.
 *
 * 예전에는 이 함수가 자체 팔레트(3세대풍 웹 색)를 들고 있어 UI의 타입 색과
 * 어긋났다. 같은 '불꽃'이 화면마다 다른 주황이었고, 그런 어긋남이 "AI가
 * 디자인한 것 같다"의 원인 중 하나였다. 새 타입 색은 tokens.ts 에만 추가한다.
 */
export function getTypeColor(type: string): string {
  return TYPE_COLOR[type] ?? '#68A090';
}

// 자속 보정 (STAB - Same Type Attack Bonus) 계산
// 포켓몬의 타입과 기술 타입이 같으면 1.5배
export function hasSTAB(attackerTypes: string[], moveType: string): boolean {
  return attackerTypes.includes(moveType);
}

// 테라스탈 반영 자속 배율 (원전 충실형).
//  - 테라 없음:           기술타입 ∈ 원래타입 → 1.5, 아니면 1.0
//  - 테라 == 원래타입:    그 타입 기술 → 2.0 (1.5×1.5), 다른 원래타입 기술 → 1.5
//  - 테라 != 원래타입(새):테라타입 기술 → 1.5, 원래타입 기술도 1.5 (둘 다 자속)
export function stabMultiplier(
  originalTypes: string[],
  teraType: string | undefined,
  moveType: string
): number {
  const matchesOrig = originalTypes.includes(moveType);
  if (!teraType) return matchesOrig ? 1.5 : 1.0;
  const matchesTera = moveType === teraType;
  if (matchesTera && originalTypes.includes(teraType)) return 2.0; // 자속 테라스탈
  if (matchesTera) return 1.5; // 새 타입 테라
  if (matchesOrig) return 1.5; // 원래 타입 기술 자속 유지
  return 1.0;
}

/**
 * 싱글TD 데미지 공식.
 *
 * [레벨 항이 50 고정인 이유 — 버그가 아니라 다른 체계다]
 *   싱글TD는 타워 스탯으로 **종족값을 그대로** 쓴다. 그런데 정통 공식으로 환산하면
 *   비HP 스탯 `(2B×L)/100+5` 는 L=50에서 종족값과 3~10% 차이밖에 안 난다
 *   (종족값 100 → 105). 즉 **싱글TD는 "전원 레벨 50 포켓몬"인 세계**이고,
 *   레벨 항 50 고정은 그 스케일과 서로 정합한다. `level` 필드는 포켓몬 레벨이 아니라
 *   스탯을 5%씩 올리는 별도 강화 트랙이다.
 *   멀티·카드는 반대로 "포켓몬이 실제 레벨"인 체계라 스탯도 레벨도 실제 값을 쓴다.
 *   여기만 실제 레벨로 바꾸면 스탯(레벨50 스케일)과 레벨 항(레벨1~N)이 어긋나 붕괴한다.
 *   → 데미지 **공식**은 네 엔진이 이미 동일하다. 남은 건 '레벨이 무엇인가'라는 설계 차이라
 *     통일하려면 스탯 파생·웨이브 HP·구매가를 통째로 재보정해야 한다(별도 결정 사항).
 *
 * @param randomFactor 데미지 난수(0.85~1.0). 1이면 난수 없음(구 동작).
 */
export function calculateDamage(
  attackerAttack: number,
  defenderDefense: number,
  movePower: number,
  typeEffectiveness: number,
  isCrit: boolean = false,
  stab: number = 1, // 자속 보정 배율 (1=없음, 1.5/2.0=자속·테라)
  randomFactor: number = 1
): number {
  const level = 50;
  const base = ((2 * level / 5 + 2) * movePower * attackerAttack / defenderDefense / 50 + 2);
  let damage = base * typeEffectiveness * randomFactor;

  // 자속 보정 적용 (배율)
  damage *= stab;

  // 크리티컬 (1.5배)
  if (isCrit) damage *= 1.5;

  return Math.max(1, Math.floor(damage));
}

/** 데미지 난수 0.85~1.0 — 아레나·AI서비스·카드가 모두 쓰는 폭. */
export function damageRandomFactor(r: number): number {
  return 0.85 + r * 0.15;
}