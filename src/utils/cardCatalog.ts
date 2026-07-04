// src/utils/cardCatalog.ts
// 미니 포켓 도감/덱편성 공용 정렬·필터·검색 로직.
// Dex(CardLabView)와 DeckBuilder 풀에서 동일하게 재사용.

import { Rarity } from '../data/evolution';

/** 정렬 기준. */
export type CardSortKey = 'number' | 'rarity' | 'stars' | 'recent' | 'name';
export const CARD_SORT_KEYS: CardSortKey[] = ['number', 'rarity', 'stars', 'recent', 'name'];

/** 카드 1종 부가정보(비동기 로드). */
export interface CardMeta { name: string; types: string[]; }

export interface CardFilterState {
  search: string;
  /** 타입 필터(빈 문자열=전체). PokeAPI 타입 슬러그(예: 'fire'). */
  type: string;
  /** 레어도 필터(빈 문자열=전체). */
  rarity: '' | Rarity;
  sort: CardSortKey;
}

export const DEFAULT_CARD_FILTER: CardFilterState = {
  search: '', type: '', rarity: '', sort: 'number',
};

/** 레어도 정렬 랭크(높을수록 희귀). */
const RARITY_ORDER: Rarity[] = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Master', 'Legend'];
const rarityRank = (r: Rarity | undefined): number => (r ? RARITY_ORDER.indexOf(r) : -1);

/** 필터가 하나라도 활성인지(결과 개수 안내용). */
export function isFilterActive(f: CardFilterState): boolean {
  return f.search.trim() !== '' || f.type !== '' || f.rarity !== '';
}

/**
 * 카드 목록에 필터+정렬 적용.
 * meta/rarityMap가 아직 없는 카드는: 필터 비활성 시 표시, 타입/레어도/검색 활성 시엔 제외(로드되면 다시 나타남).
 */
export function applyCardFilter<T extends { pokemonId: number; stars: number; obtainedAt: number }>(
  cards: T[],
  f: CardFilterState,
  meta: Record<number, CardMeta | undefined>,
  rarityMap: Record<number, Rarity | undefined>,
): T[] {
  const q = f.search.trim().toLowerCase();

  const filtered = cards.filter(c => {
    if (f.type) {
      const ty = meta[c.pokemonId]?.types;
      if (!ty || !ty.includes(f.type)) return false;
    }
    if (f.rarity) {
      if (rarityMap[c.pokemonId] !== f.rarity) return false;
    }
    if (q) {
      const name = (meta[c.pokemonId]?.name ?? '').toLowerCase();
      const num = String(c.pokemonId);
      if (!name.includes(q) && !num.includes(q)) return false;
    }
    return true;
  });

  const nameOf = (id: number) => meta[id]?.name ?? '';

  return [...filtered].sort((a, b) => {
    switch (f.sort) {
      case 'number': return a.pokemonId - b.pokemonId;
      case 'rarity': return rarityRank(rarityMap[b.pokemonId]) - rarityRank(rarityMap[a.pokemonId]) || a.pokemonId - b.pokemonId;
      case 'stars':  return b.stars - a.stars || a.pokemonId - b.pokemonId;
      case 'recent': return b.obtainedAt - a.obtainedAt || a.pokemonId - b.pokemonId;
      case 'name':   return nameOf(a.pokemonId).localeCompare(nameOf(b.pokemonId)) || a.pokemonId - b.pokemonId;
      default:       return a.pokemonId - b.pokemonId;
    }
  });
}
