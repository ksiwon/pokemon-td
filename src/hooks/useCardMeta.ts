// src/hooks/useCardMeta.ts
// 보유 카드들의 부가정보(이름·타입·레어도)를 비동기로 모아 맵으로 제공.
// 도감(CardLabView)·덱편성(DeckBuilder)에서 정렬/필터/검색·시너지·CardView에 공용 사용.

import { useEffect, useState } from 'react';
import { pokeAPI } from '../api/pokeapi';
import { Rarity } from '../data/evolution';
import { CardMeta } from '../utils/cardCatalog';

export function useCardMeta(ids: number[]): {
  meta: Record<number, CardMeta>;
  rarity: Record<number, Rarity>;
} {
  const [meta, setMeta] = useState<Record<number, CardMeta>>({});
  const [rarity, setRarity] = useState<Record<number, Rarity>>({});
  // ids 배열 자체는 매 렌더 새 참조 → 안정적 키로 비교
  const key = ids.join(',');

  useEffect(() => {
    let alive = true;
    const missing = ids.filter(id => !meta[id] || !rarity[id]);
    if (missing.length === 0) return;

    Promise.all(missing.map(async id => {
      const p = meta[id] ? null : await pokeAPI.getPokemon(id).catch(() => null);
      const r = rarity[id] ?? await pokeAPI.getCardRarity(id).catch(() => 'Bronze' as Rarity);
      return { id, p, r };
    })).then(res => {
      if (!alive) return;
      const nm: Record<number, CardMeta> = {};
      const rm: Record<number, Rarity> = {};
      res.forEach(({ id, p, r }) => {
        if (p) nm[id] = { name: p.displayName, types: p.types };
        if (r) rm[id] = r;
      });
      if (Object.keys(nm).length) setMeta(m => ({ ...m, ...nm }));
      if (Object.keys(rm).length) setRarity(m => ({ ...m, ...rm }));
    });

    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { meta, rarity };
}
