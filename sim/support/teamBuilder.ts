// sim/support/teamBuilder.ts
// 시뮬용 보드(팀) 생성기 — 실게임과 동일한 경로로 TowerDetail을 만든다.
//   구매가/기술 선택: src/game/towerFactory (PokemonPicker와 공유)
//   레벨 성장:        gameStore.addXpToTower와 동일 공식 (growStatsToLevel)
//   TowerDetail 변환: GameLayout.buildTowerDetails와 동일 (critChance/aoeBonus/lifesteal:0)

import { pokeAPI } from '../../src/api/pokeapi';
import { TowerDetail } from '../../src/types/multiplayer';
import { GamePokemon, PokemonAbility, Synergy } from '../../src/types/game';
import {
  pickUsableMove, toEquippedMove, computePokemonCost, statTotalOf,
  growStatsToLevel, candyCostToLevel,
} from '../../src/game/towerFactory';
import { mapAbilityToGameEffect } from '../../src/utils/abilities';
import { getCriticalChance, getAOEDamageMultiplier, toWireAbility } from '../../src/utils/abilities';
import { calculateActiveSynergies } from '../../src/utils/synergyManager';

export interface BoardMember {
  /** 스탯/타입에 쓸 도감번호 (진화체 가능) */
  id: number;
  level: number;
  /** 구매가 계산용 기본형 도감번호 (진화체 보드의 골드 등가 계산). 생략 시 id. */
  baseId?: number;
  /** 특성 인덱스 (결정론). 생략 시 0번. -1이면 특성 없음. */
  abilityIndex?: number;
}

export interface BuiltBoard {
  name: string;
  description: string;
  details: TowerDetail[];
  synergies: Synergy[];
  /** 총 투자 골드 = Σ(기본형 구매가 + 사탕 레벨업 비용) */
  gold: number;
  goldBreakdown: Array<{ id: number; buy: number; candy: number }>;
}

/**
 * 레벨 L 유닛의 대표 기술 — 실플레이 재현.
 * 게임은 레벨업마다 그 레벨에서 배우는 기술을 제안하고(SkillPicker), 유저는 보통 더 좋은
 * 기술로 교체한다(개발자 확인). 재현 규칙: lv2..L에서 제안됐을 기술 중
 * 위력 최고(동률이면 자속 우선)를 장착. 아무것도 없으면 초기 기술(pickUsableMove).
 */
export async function equipBestMoveForLevel(p: Awaited<ReturnType<typeof pokeAPI.getPokemon>>, level: number) {
  const initial = toEquippedMove(await pickUsableMove(p));
  const candidates = [initial];

  for (let lvl = 2; lvl <= level; lvl++) {
    const offered = await pokeAPI.getLearnableMoves(p.id, lvl);
    candidates.push(...offered);
  }

  candidates.sort((a, b) => {
    if ((b.power ?? 0) !== (a.power ?? 0)) return (b.power ?? 0) - (a.power ?? 0);
    const aStab = p.types.includes(a.type) ? 1 : 0;
    const bStab = p.types.includes(b.type) ? 1 : 0;
    if (bStab !== aStab) return bStab - aStab;
    return a.name.localeCompare(b.name); // 결정론 tiebreak
  });
  return candidates[0];
}

export async function buildTowerDetail(member: BoardMember): Promise<{ detail: TowerDetail; buy: number; candy: number }> {
  const p = await pokeAPI.getPokemon(member.id);
  const move = await equipBestMoveForLevel(p, member.level);

  let ability: PokemonAbility | undefined;
  const abilityIndex = member.abilityIndex ?? 0;
  if (abilityIndex >= 0 && p.abilities && p.abilities.length > 0) {
    const a = p.abilities[Math.min(abilityIndex, p.abilities.length - 1)];
    ability = mapAbilityToGameEffect(a);
  }

  const grown = growStatsToLevel(p.stats, member.level);

  // GameLayout.buildTowerDetails와 동일한 파생 필드
  const critChance = getCriticalChance(ability);
  const hasAOEMove = move.isAOE;
  const aoeBonus = hasAOEMove ? 0.5 * getAOEDamageMultiplier(ability) : 0;

  const detail: TowerDetail = {
    pokemonId: p.id,
    name: p.displayName,
    level: member.level,
    sprite: p.sprite,
    position: { x: 0, y: 0 },
    currentHp: grown.hp,
    maxHp: grown.hp,
    isFainted: false,
    attack: grown.attack,
    defense: grown.defense,
    specialAttack: grown.specialAttack,
    specialDefense: grown.specialDefense,
    speed: grown.speed,
    types: p.types,
    equippedMoves: [move],
    critChance,
    aoeBonus,
    lifesteal: 0,
    // buildTowerDetails 와 동일 — 전투에는 안 쓰이지만 재접속 복원이 이걸 본다.
    ability: ability ? toWireAbility(ability) : null,
  };

  // 골드 등가: 구매가는 기본형 기준(진화는 레벨업 부산물 = 무료)
  const baseP = member.baseId ? await pokeAPI.getPokemon(member.baseId) : p;
  const buy = computePokemonCost(statTotalOf(baseP));
  const candy = candyCostToLevel(member.level);

  return { detail, buy, candy };
}

export async function buildBoard(
  name: string,
  description: string,
  members: BoardMember[]
): Promise<BuiltBoard> {
  const built = [];
  for (const m of members) built.push(await buildTowerDetail(m));

  const details = built.map(b => b.detail);
  // 아레나와 동일: 시너지는 팀 전체(기절 없음 가정)로 계산, 스트리머 시너지 포함(멀티 기준)
  const synergies = calculateActiveSynergies(details as unknown as GamePokemon[]);

  return {
    name,
    description,
    details,
    synergies,
    gold: built.reduce((s, b) => s + b.buy + b.candy, 0),
    goldBreakdown: built.map((b, i) => ({ id: members[i].id, buy: b.buy, candy: b.candy })),
  };
}
