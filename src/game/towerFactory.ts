// src/game/towerFactory.ts
// 포켓몬 데이터 → 게임 오브젝트(기술/특성/가격) 변환 로직.
// PokemonPicker.tsx(handleSelect)에서 분리 — 밸런스 시뮬 하네스와 공유해
// "사람이 상점에서 뽑는 포켓몬"과 "시뮬 봇이 뽑는 포켓몬"이 항상 동일하게 만들어지도록 한다.
// ⚠ 여기 로직 변경 = 실제 상점 구매 결과 변경. 동작 보존 이동만 허용.

import { pokeAPI, PokemonData } from '../api/pokeapi';
import { GameMove, MoveEffect, PokemonAbility } from '../types/game';
import { TowerDetail } from '../types/multiplayer';
import { mapAbilityToGameEffect, getCriticalChance, getAOEDamageMultiplier } from '../utils/abilities';
import { rng } from '../utils/rng';

/** 구매가 공식: 25 + BST/600×200 (약 25~265G). PokemonPicker와 AI 밸런스 기준. */
export function computePokemonCost(statTotal: number): number {
  return Math.floor(25 + (statTotal / 600) * 200);
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
      lifesteal:     0,
    });
  });
