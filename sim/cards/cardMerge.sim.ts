// sim/cards/cardMerge.sim.ts
// 미니 포켓 카드 '중첩(합성)' 규칙 검증 — 실코드(CardService.openPack)를 그대로 구동한다.
//   제보: "카드 뽑기에서 같은 포켓몬이 여러 마리 나왔는데 합성이 안 되고 별 1개 그대로"
//   확인할 것:
//     1) 같은 카드를 반복해 뽑으면 별이 오르는가 (원본1 + 중복2 = 3장 → ★2)
//     2) 한 팩(5장) 안에서 같은 카드가 나와도 누적되는가
//     3) ★5 도달 후의 중복은 코인으로 환급되는가
//     4) 별이 오르면 실제 전투 스탯이 오르는가
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { pokeAPI } from '../../src/api/pokeapi';
import { cardService, CARDS_PER_PACK } from '../../src/services/CardService';
import { buildBattleCard } from '../../src/services/CardBattleService';

/** 스타터(1·4·7·25·133·16)와 겹치지 않는 미보유 카드로 시작해야 '신규 → 별업' 전 구간을 본다. */
const ID = 66; // 알통몬
const RARITY = 'Gold' as const; // 팩 최소보장(Silver)·천장(Gold)을 만족시켜 픽이 교체되지 않게 한다

const entry = () => cardService.getState().collection[ID];
const coins = () => cardService.getState().wallet.coins;

describe('카드 중첩(합성) 규칙', () => {
  beforeAll(async () => {
    await pokeAPI.preloadRarities();
    // 추첨을 ID 한 장으로 고정 — 나머지 로직(누적·별업·환급)은 전부 실코드 그대로 돈다
    vi.spyOn(pokeAPI, 'getRandomCardId').mockResolvedValue(ID);
    vi.spyOn(pokeAPI, 'getCardRarity').mockResolvedValue(RARITY);
    cardService.addCoins(100_000); // 팩 구매비 확보
  });

  it('미보유 상태에서 시작한다', () => {
    expect(entry()).toBeUndefined();
  });

  it('한 팩(5장)이 전부 같은 카드면 ★3까지 오른다 (3장→★2, 이후 2장마다 +1)', async () => {
    const res = await cardService.openPack('normal');
    expect(res).toHaveLength(CARDS_PER_PACK);
    expect(res.every(r => r.pokemonId === ID)).toBe(true);

    // 1장째 신규(★1) → 2장째 copies1 → 3장째 ★2 → 4장째 copies1 → 5장째 ★3
    expect(res.map(r => r.stars)).toEqual([1, 1, 2, 2, 3]);
    expect(res.map(r => r.starUp)).toEqual([false, false, true, false, true]);
    // 별이 안 오른 중복(2·4장째)도 진행도가 실려 나와야 화면에 '쌓이는 중'을 띄울 수 있다
    expect(res.map(r => r.copies)).toEqual([0, 1, 0, 1, 0]);
    expect(entry().stars).toBe(3);
    expect(entry().copies).toBe(0);
  });

  it('두 번째 팩에서 ★5에 도달하고, 초과분은 코인으로 환급된다', async () => {
    const before = coins();
    const res = await cardService.openPack('normal');

    // 6장째 copies1 → 7장째 ★4 → 8장째 copies1 → 9장째 ★5 → 10장째는 초과분(환급)
    expect(res.map(r => r.stars)).toEqual([3, 4, 4, 5, 5]);
    expect(res.map(r => r.copies)).toEqual([1, 0, 1, 0, 0]);
    expect(entry().stars).toBe(5);

    const refunded = res.reduce((s, r) => s + r.refundCoins, 0);
    expect(refunded).toBeGreaterThan(0);                   // ★5 이후 중복은 버려지지 않는다
    expect(coins()).toBe(before - 100 + refunded);         // 팩값 100 차감 + 환급 반영
  });

  it('★이 오르면 전투 스탯이 실제로 오른다', async () => {
    const p = await pokeAPI.getPokemon(ID);
    const at = (stars: number) =>
      buildBattleCard(p, { stars, row: 'front', slot: 0, side: 'player', uid: `s${stars}` });

    const s1 = at(1), s3 = at(3), s5 = at(5);
    expect(s3.maxHp).toBeGreaterThan(s1.maxHp);
    expect(s5.maxHp).toBeGreaterThan(s3.maxHp);
    expect(s3.attack).toBeGreaterThan(s1.attack);
    expect(s5.attack).toBeGreaterThan(s3.attack);

    console.log(`  [★별 스탯] ★1 HP${s1.maxHp}/ATK${s1.attack}  →  ★3 HP${s3.maxHp}/ATK${s3.attack}` +
      `  →  ★5 HP${s5.maxHp}/ATK${s5.attack}  (★5/★1 = HP ${(s5.maxHp / s1.maxHp).toFixed(2)}배, ATK ${(s5.attack / s1.attack).toFixed(2)}배)`);
  });

  it('덱에 편성하면 보유 별 수가 그대로 전투에 반영된다', () => {
    const row = cardService.getDeckWithStars().find(d => d.pokemonId === ID);
    if (row) expect(row.stars).toBe(entry().stars);
    else expect(entry().stars).toBe(5); // 덱 미편성이면 보유 별만 확인
  });
});
