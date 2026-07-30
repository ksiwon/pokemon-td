// src/game/towerFactory.ts
// 포켓몬 데이터 → 게임 오브젝트(기술/특성/가격) 변환 로직.
// PokemonPicker.tsx(handleSelect)에서 분리 — 밸런스 시뮬 하네스와 공유해
// "사람이 상점에서 뽑는 포켓몬"과 "시뮬 봇이 뽑는 포켓몬"이 항상 동일하게 만들어지도록 한다.
// ⚠ 여기 로직 변경 = 실제 상점 구매 결과 변경. 동작 보존 이동만 허용.

import { pokeAPI, PokemonData } from '../api/pokeapi';
import { GameMove, MoveEffect, PokemonAbility } from '../types/game';
import { TowerDetail } from '../types/multiplayer';
import {
  mapAbilityToGameEffect, getCriticalChance, getAOEDamageMultiplier, getLifestealRatio,
} from '../utils/abilities';
import { rng } from '../utils/rng';
import { BALANCE_OVERRIDES } from './balanceOverrides';

/** 구매가 공식: 25 + BST/600×200 (약 25~265G). PokemonPicker와 AI 밸런스 기준. */
/**
 * 구매가 곡선. 기본값 `269 × (BST/600)^1.5`.
 *
 * [밸런스] 구식 `25 + (BST/600)*200` 은 두 가지 문제가 있었다(sim:gold 측정).
 *   1. 고정비 25G가 약한 유닛에 비율상 더 무거웠다 → 스탯 1점당 가격이
 *      BST 275에서 0.42G, BST 625에서 0.37G. 강한 놈이 골드당 스탯이 더 쌌다.
 *   2. 가격이 BST에 선형인데 전투력은 초선형이다. 데미지 ∝ 공/방 이라 스탯을
 *      한 유닛에 몰면 딜과 생존이 곱으로 작용한다.
 *   결과: 같은 골드에서 고가 3마리가 저가 6마리를 100% 이겼다(0.1% 승률).
 *
 * 전력 모델 `N²·BST³` 에서 예산 G의 마리 수 N=G/cost 를 대입하면
 * 전력 ∝ (G/cost)²·BST³ 이고, 이게 BST와 무관해지려면 cost ∝ BST^1.5 다.
 * k=269 는 BST 450을 구식 가격(175G)에 맞춘 값 — 총 지출 규모를 가장 덜 흔든다.
 *   BST 300: 125G → 95G · BST 450: 175G(불변) · BST 600: 225G → 269G
 */
export const COST_CURVE_EXPONENT = 1.5;
export const COST_CURVE_K = 269;
/** 최저 구매가 — 극저 BST가 사실상 공짜가 되어 6칸 채우기가 지배전략이 되는 것 방지. */
export const COST_MIN = 40;

export function computePokemonCost(statTotal: number): number {
  const c = BALANCE_OVERRIDES.costCurve;
  const exponent = c?.exponent ?? COST_CURVE_EXPONENT;
  const k = c?.k ?? COST_CURVE_K;
  return Math.max(COST_MIN, Math.round(k * Math.pow(statTotal / 600, exponent)));
}

export function statTotalOf(p: PokemonData): number {
  return p.stats.hp + p.stats.attack + p.stats.defense +
         p.stats.specialAttack + p.stats.specialDefense + p.stats.speed;
}

/** 기술 효과 텍스트 파싱 — PokemonPicker.handleSelect 원본과 동일. */
export function parseMoveEffect(usableMove: {
  effectEntries?: string[];
  effectChance?: number | null;
}): MoveEffect {
  const effect: MoveEffect = { type: 'damage' };
  const effectText = usableMove.effectEntries?.[0]?.toLowerCase() || '';

  if (effectText.includes('drain') || effectText.includes('recover') || effectText.includes('restore')) {
    if (effectText.includes('75%')) {
      effect.drainPercent = 0.75;
    } else {
      effect.drainPercent = 0.5;
    }
  }

  if (effectText.includes('burn')) {
    effect.statusInflict = 'burn';
    effect.statusChance = usableMove.effectChance;
  } else if (effectText.includes('paralyze') || effectText.includes('paralysis')) {
    effect.statusInflict = 'paralysis';
    effect.statusChance = usableMove.effectChance;
  } else if (effectText.includes('poison')) {
    effect.statusInflict = 'poison';
    effect.statusChance = usableMove.effectChance;
  } else if (effectText.includes('freeze') || effectText.includes('frozen')) {
    effect.statusInflict = 'freeze';
    effect.statusChance = usableMove.effectChance;
  } else if (effectText.includes('sleep')) {
    effect.statusInflict = 'sleep';
    effect.statusChance = usableMove.effectChance;
  } else if (effectText.includes('confus')) {
    effect.statusInflict = 'confusion';
    effect.statusChance = usableMove.effectChance;
  }

  if (effectText) {
    effect.additionalEffects = effectText;
  }

  return effect;
}

const AOE_TARGETS = ['all-opponents', 'all-other-pokemon', 'all-pokemon', 'user-and-allies'];

export function isAOETarget(target?: string): boolean {
  return AOE_TARGETS.includes(target || '');
}

/**
 * 후보 기술 선택 — 기술 목록 앞 10개 중 첫 번째 non-status 기술.
 * 없으면 tackle 폴백. PokemonPicker.handleSelect 원본과 동일.
 */
export async function pickUsableMove(
  poke: PokemonData,
  fallbackDisplayName = '몸통박치기'
): Promise<any> {
  const moveNames = poke.moves.slice(0, 10);
  let usableMove: any = null;

  for (const name of moveNames) {
    const move = await pokeAPI.getMove(name);
    if (move.damageClass !== 'status') {
      usableMove = move;
      break;
    }
  }

  if (!usableMove) {
    usableMove = {
      name: 'tackle',
      displayName: fallbackDisplayName,
      type: 'normal',
      power: 40,
      accuracy: 100,
      damageClass: 'physical',
      target: 'selected-pokemon',
      effectEntries: ['Inflicts regular damage with no additional effect.'],
      effectChance: null,
    };
  }
  return usableMove;
}

/** MoveData → 장착 기술(GameMove) 변환 — PokemonPicker.handleSelect 원본과 동일. */
export function toEquippedMove(usableMove: any): GameMove {
  const effect = parseMoveEffect(usableMove);
  const isAOE = isAOETarget(usableMove.target);
  return {
    name: usableMove.name,
    displayName: usableMove.displayName,
    type: usableMove.type,
    power: usableMove.power || 40,
    accuracy: usableMove.accuracy || 100,
    damageClass: usableMove.damageClass,
    effect: effect,
    cooldown: 2.0,
    currentCooldown: 0,
    isAOE: isAOE,
    aoeRadius: isAOE ? 100 : undefined,
    manualCast: false,
  };
}

/** 특성 랜덤 배정 — PokemonPicker.handleSelect 원본과 동일(난수원만 rng로 통일). */
export function pickRandomAbility(poke: PokemonData): PokemonAbility | undefined {
  if (poke.abilities && poke.abilities.length > 0) {
    const randomIndex = Math.floor(rng() * poke.abilities.length);
    const randomAbility = poke.abilities[randomIndex];
    return mapAbilityToGameEffect(randomAbility);
  }
  return undefined;
}

/**
 * 레벨업 성장 재현 — gameStore.addXpToTower와 동일한 누적 공식.
 * 레벨당: 속도 제외 전 스탯 += floor(현재값 × 0.05). 속도 고정.
 */
export function growStatsToLevel(
  base: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number },
  level: number
) {
  let hp = base.hp;
  let attack = base.attack;
  let defense = base.defense;
  let specialAttack = base.specialAttack;
  let specialDefense = base.specialDefense;

  for (let l = 1; l < level; l++) {
    hp += Math.floor(hp * 0.05);
    attack += Math.floor(attack * 0.05);
    defense += Math.floor(defense * 0.05);
    specialAttack += Math.floor(specialAttack * 0.05);
    specialDefense += Math.floor(specialDefense * 0.05);
  }

  return { hp, attack, defense, specialAttack, specialDefense, speed: base.speed };
}

/** 이상한사탕으로 레벨 L까지 올리는 총 골드(Σ l×25, l=1..L-1) — 골드 등가 비교용. */
export function candyCostToLevel(level: number): number {
  return 25 * level * (level - 1) / 2;
}

// ── Tower detail builder ──────────────────────────────────────────
// GameLayout에서 이동(동작 동일) — GamePokemon → PvP용 TowerDetail 변환. JSON scrub 포함.
const scrub = (obj: any): any => JSON.parse(JSON.stringify(obj));

export const buildTowerDetails = (towers: any[]): TowerDetail[] =>
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
      // [FIX] 흡혈 특성이 멀티에서 통째로 죽어 있었다(상수 0 하드코딩).
      //   크리·AOE 특성은 위에서 계산해 넘기는데 흡혈만 누락 — 싱글(GameManager)과 동일하게 반영.
      lifesteal:     getLifestealRatio(ability),
    });
  });
