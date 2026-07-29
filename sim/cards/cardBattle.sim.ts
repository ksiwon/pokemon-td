// sim/cards/cardBattle.sim.ts
// 미니 포켓(카드 오토배틀) 엔진 회귀 측정.
//   - 공정성:   거울전(동일 덱)에서 player/enemy 승률이 50%에 수렴해야 한다
//   - 진행곡선: 덱 강도별 타워 첫 패배 층 + 승→패 전환 완충 구간 폭
//   - 전투 길이: 상태이상(화상 2턴/독 3턴)이 발동할 만큼 턴이 도는가
//   - 결정론:   같은 시드 → 같은 적팀·같은 로그
// 실행: npm run sim:cards

import { describe, it, expect } from 'vitest';
import { pokeAPI } from '../../src/api/pokeapi';
import { cardBattleService, buildBattleCard, BattleCard } from '../../src/services/CardBattleService';
import { DeckRow } from '../../src/types/cards';

const ROWS: DeckRow[] = ['front', 'front', 'front', 'back', 'back', 'back'];

/** 대표 덱 — 스타터(약)에서 전설 6장(이론상 최강)까지. */
const DECKS = {
  스타터: [1, 4, 7, 25, 133, 16],
  중급: [3, 6, 9, 65, 94, 130],
  전설: [150, 249, 250, 384, 483, 484],
};

async function buildTeam(
  ids: number[], stars: number, side: 'player' | 'enemy', prefix = side,
): Promise<BattleCard[]> {
  const out: BattleCard[] = [];
  for (let i = 0; i < ids.length; i++) {
    const p = await pokeAPI.getPokemon(ids[i]);
    out.push(buildBattleCard(p, { stars, row: ROWS[i], slot: i % 3, side, uid: `${prefix}-${i}` }));
  }
  return out;
}

const clone = (t: BattleCard[]) => t.map(c => ({ ...c }));

describe('미니 포켓 오토배틀', () => {
  it('결정론 — 같은 시드면 적팀·로그가 동일', async () => {
    await pokeAPI.preloadRarities();
    const p = await buildTeam(DECKS.스타터, 1, 'player');
    const e1 = await cardBattleService.generateEnemyTeam(12, 12007);
    const e2 = await cardBattleService.generateEnemyTeam(12, 12007);
    expect(e1.map(c => c.pokemonId)).toEqual(e2.map(c => c.pokemonId));
    const r1 = cardBattleService.simulate(clone(p), clone(e1), 12007);
    const r2 = cardBattleService.simulate(clone(p), clone(e2), 12007);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.log.length).toBe(r2.log.length);
    console.log(`  적팀 ${e1.map(c => c.pokemonId).join(',')} / ${r1.winner} ${r1.turns}턴 로그${r1.log.length}`);
  });

  it('공정성 — 거울전(완전 동일 덱) 승률이 50%에 수렴', async () => {
    await pokeAPI.preloadRarities();
    for (const [name, ids] of Object.entries(DECKS)) {
      const a = await buildTeam(ids, 3, 'player');
      const b = await buildTeam(ids, 3, 'enemy');
      let pw = 0;
      const N = 400;
      for (let s = 1; s <= N; s++) {
        if (cardBattleService.simulate(clone(a), clone(b), s).winner === 'player') pw++;
      }
      const pct = (pw / N) * 100;
      console.log(`  ${name} 거울전 ${N}판 → player ${pw} (${pct.toFixed(1)}%)`);
      // 선공권 편향이 없으면 45~55% 안에 들어와야 한다
      expect(pct).toBeGreaterThan(40);
      expect(pct).toBeLessThan(60);
    }
  });

  it('진행 곡선 — 덱별 타워 도달 층과 전환 완충 구간', async () => {
    await pokeAPI.preloadRarities();
    for (const [name, ids] of Object.entries(DECKS)) {
      for (const stars of name === '스타터' ? [1, 3, 5] : [5]) {
        const player = await buildTeam(ids, stars, 'player');
        let firstLoss = -1, lastWin = 0, buffer = 0;
        const detail: string[] = [];
        for (let f = 1; f <= 70; f++) {
          const seed = f * 1000 + 7;
          const enemy = await cardBattleService.generateEnemyTeam(f, seed);
          const r = cardBattleService.simulate(clone(player), clone(enemy), seed);
          if (r.winner === 'player') { lastWin = f; if (r.playerAlive <= 2) buffer++; }
          else if (firstLoss < 0) { firstLoss = f; }
          if (f === firstLoss) detail.push(`첫패 F${f}(${r.playerAlive}v${r.enemyAlive},t${r.turns})`);
        }
        console.log(`  ${name}★${stars}: 첫패배 F${firstLoss} / 최고승 F${lastWin} / 접전승(잔존≤2) ${buffer}층  ${detail.join(' ')}`);
      }
    }
  });

  it('전투 길이 — 상태이상이 발동할 만큼 턴이 도는가', async () => {
    await pokeAPI.preloadRarities();
    const player = await buildTeam(DECKS.중급, 3, 'player');
    const dist: Record<number, number> = {};
    let sum = 0, n = 0;
    for (let f = 1; f <= 40; f++) {
      const seed = f * 1000 + 7;
      const enemy = await cardBattleService.generateEnemyTeam(f, seed);
      const r = cardBattleService.simulate(clone(player), clone(enemy), seed);
      dist[r.turns] = (dist[r.turns] ?? 0) + 1; sum += r.turns; n++;
    }
    console.log(`  타워 F1~40 평균 ${(sum / n).toFixed(1)}턴 / 분포 ${JSON.stringify(dist)}`);

    // 시너지 덱끼리 붙였을 때 상태이상·흡혈이 실제로 발동하는가
    const fire = await buildTeam([6, 59, 136, 146, 157, 392], 3, 'player');
    const grass = await buildTeam([3, 45, 71, 154, 254, 389], 3, 'enemy');
    let dot = 0, skip = 0, heal = 0, inflicted = 0, turns = 0;
    for (let s = 1; s <= 100; s++) {
      const r = cardBattleService.simulate(clone(fire), clone(grass), s);
      turns += r.turns;
      r.log.forEach(e => {
        if (e.kind === 'dot') dot++; else if (e.kind === 'skip') skip++;
        else if (e.kind === 'heal') heal++; else if (e.inflicted) inflicted++;
      });
    }
    console.log(`  불6 vs 풀6 100판: 평균 ${(turns / 100).toFixed(1)}턴 / 상태부여 ${inflicted} / DoT틱 ${dot} / 흡혈 ${heal} / 행동불가 ${skip}`);
    expect(dot).toBeGreaterThan(0);

    // 대칭(거울) 전투 = 전투 길이의 기준선. 여기서 짧으면 상태이상이 영원히 안 돈다.
    const a = await buildTeam(DECKS.중급, 3, 'player');
    const b = await buildTeam(DECKS.중급, 3, 'enemy');
    let mt = 0; const mdist: Record<number, number> = {};
    for (let s = 1; s <= 200; s++) {
      const r = cardBattleService.simulate(clone(a), clone(b), s);
      mt += r.turns; mdist[r.turns] = (mdist[r.turns] ?? 0) + 1;
    }
    console.log(`  거울전 200판 평균 ${(mt / 200).toFixed(1)}턴 / 분포 ${JSON.stringify(mdist)}`);
    // 화상 2턴 / 독 3턴이 최소 한 번은 돌아야 상태이상 설계가 의미를 갖는다
    expect(mt / 200).toBeGreaterThan(4);
  });

  it('타입 활용 — 이중타입 2번 타입과 면역이 전투에 반영되는가', async () => {
    await pokeAPI.preloadRarities();
    // 갸라도스(water/flying) → 괴력몬(fighting): water 1배 vs flying 2배 → flying을 써야 한다
    const gyara = await pokeAPI.getPokemon(130);
    const machamp = await pokeAPI.getPokemon(68);
    const a = [buildBattleCard(gyara, { stars: 3, row: 'front', slot: 0, side: 'player', uid: 'player-0' })];
    const d = [buildBattleCard(machamp, { stars: 3, row: 'front', slot: 0, side: 'enemy', uid: 'enemy-0' })];
    const r = cardBattleService.simulate(clone(a), clone(d), 1);
    const first = r.log.find(e => e.attackerUid === 'player-0' && (!e.kind || e.kind === 'attack'));
    console.log(`  갸라도스→괴력몬 상성배율: ${first?.effectiveness} (water=1, flying=2)`);

    // 팬텀(ghost/poison) → 잠만보(normal): ghost는 무효, poison도 1배 → 면역 처리 확인
    const gengar = await pokeAPI.getPokemon(94);
    const snorlax = await pokeAPI.getPokemon(143);
    const a2 = [buildBattleCard(gengar, { stars: 3, row: 'front', slot: 0, side: 'player', uid: 'player-0' })];
    const d2 = [buildBattleCard(snorlax, { stars: 3, row: 'front', slot: 0, side: 'enemy', uid: 'enemy-0' })];
    const r2 = cardBattleService.simulate(clone(a2), clone(d2), 1);
    const f2 = r2.log.find(e => e.attackerUid === 'player-0' && (!e.kind || e.kind === 'attack'));
    console.log(`  팬텀→잠만보 상성배율: ${f2?.effectiveness} (ghost=무효, poison=1 → 1이어야 함)`);

    // 노말 단일 → 고스트 단일: 완전 무효여야 한다
    const a3 = [buildBattleCard(snorlax, { stars: 3, row: 'front', slot: 0, side: 'player', uid: 'player-0' })];
    const d3 = [buildBattleCard(gengar, { stars: 3, row: 'front', slot: 0, side: 'enemy', uid: 'enemy-0' })];
    const r3 = cardBattleService.simulate(clone(a3), clone(d3), 1);
    const f3 = r3.log.find(e => e.attackerUid === 'player-0' && (!e.kind || e.kind === 'attack'));
    console.log(`  잠만보→팬텀 상성배율: ${f3?.effectiveness} · 데미지 ${f3?.damage} (normal→ghost 무효)`);
  });
});
