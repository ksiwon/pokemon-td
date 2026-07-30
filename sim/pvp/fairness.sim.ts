// sim/pvp/fairness.sim.ts
// TFT 두 전투 엔진의 진영 공정성·시너지 반영 회귀 측정.
//   engine A: PvPBattleService (AI vs AI + stuck 타임아웃 강제종료)
//   engine B: arenaSim        (사람이 참여하는 실제 전투)
// 완전히 동일한 보드끼리 붙였을 때 어느 쪽도 유리해선 안 된다.
// 실행: npm run sim:fairness

import { describe, it, expect } from 'vitest';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { buildUnits, simulateTick, calcDmg, sixPieceResistTypes, Unit } from '../../src/game/arenaSim';
import { calculateActiveSynergies } from '../../src/utils/synergyManager';
import { mulberry32, setRngSource } from '../../src/utils/rng';
import { runArenaBattleTwoClients, roleBasedPlacements } from './arenaRunner';
import { TowerDetail } from '../../src/types/multiplayer';
import { GamePokemon } from '../../src/types/game';
import { pokeAPI } from '../../src/api/pokeapi';

async function board(ids: number[], level = 20): Promise<TowerDetail[]> {
  const out: TowerDetail[] = [];
  for (const id of ids) {
    const p = await pokeAPI.getPokemon(id);
    out.push({
      pokemonId: p.id, name: p.displayName, level, sprite: p.sprite, position: { x: 0, y: 0 },
      currentHp: 300, maxHp: 300, isFainted: false,
      attack: p.stats.attack, defense: p.stats.defense,
      specialAttack: p.stats.specialAttack, specialDefense: p.stats.specialDefense,
      speed: p.stats.speed, types: p.types, equippedMoves: [], critChance: 0.0625,
      aoeBonus: 0, lifesteal: 0,
    } as unknown as TowerDetail);
  }
  return out;
}

const MIXED = [6, 9, 3, 65, 94, 130];
const MONO_FIRE = [4, 5, 6, 37, 38, 58]; // 전원 불꽃 → 6마리 타입 시너지(level 3)

/** arenaSim을 끝까지 돌려 승자를 판정(L/R 보드 기준). */
function runArena(
  my: TowerDetail[], opp: TowerDetail[], myPosition: 'L' | 'R', seed: number,
): 'my' | 'opp' | 'draw' {
  const syn = (t: TowerDetail[]) => calculateActiveSynergies(
    t.map(x => ({ ...x, isFainted: false })) as unknown as GamePokemon[],
  );
  let units: Unit[] = buildUnits(my, opp, syn(my), syn(opp));
  // 전투 시작 위치 배치(기본 포지션)
  const L = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 3 }, { x: 0, y: 4 }, { x: 1, y: 5 }];
  const R = [{ x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 4 }, { x: 4, y: 5 }];
  units = units.map((u, i) => {
    const idx = parseInt(u.id.split('-')[1]);
    const side = (u.team === 'my') === (myPosition === 'L') ? L : R;
    return { ...u, x: side[idx].x, y: side[idx].y };
  });
  const rng = mulberry32(seed);
  for (let tick = 0; tick < 30 * 90; tick++) {
    const res = simulateTick(units, myPosition, rng, seed);
    units = res.units;
    if (res.done) break;
  }
  const alive = (t: 'my' | 'opp') =>
    units.filter(u => u.team === t && !u.fainted && u.hp > 0).length;
  const a = alive('my'), b = alive('opp');
  return a > b ? 'my' : b > a ? 'opp' : 'draw';
}

describe('TFT 진영 공정성', () => {
  it('PvPBattleService — 동일 보드 거울전에서 team1/team2 승률', async () => {
    const t = await board(MIXED);
    let p1 = 0;
    const N = 400;
    for (let r = 1; r <= N; r++) {
      const res = pvpBattleService.simulateBattle(
        t.map(x => ({ ...x })), t.map(x => ({ ...x })), 'aaa_player', 'zzz_player', r,
      );
      if (res.winnerId === 'aaa_player') p1++;
    }
    const pct = (p1 / N) * 100;
    console.log(`  PvPBattleService 거울전 ${N}판 → team1(uid 사전순 앞) ${p1} (${pct.toFixed(1)}%)`);
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);
  });

  it('arenaSim — 동일 보드 거울전에서 L/R 승률', async () => {
    const t = await board(MIXED);
    let lWins = 0, decided = 0;
    const N = 200;
    for (let s = 1; s <= N; s++) {
      // myPosition='L'로 고정 → 'my'가 곧 L진영
      const w = runArena(t.map(x => ({ ...x })), t.map(x => ({ ...x })), 'L', s);
      if (w === 'draw') continue;
      decided++;
      if (w === 'my') lWins++;
    }
    const pct = (lWins / Math.max(1, decided)) * 100;
    console.log(`  arenaSim 거울전 ${decided}판(무승부 제외) → L진영 ${lWins} (${pct.toFixed(1)}%)`);
    expect(pct).toBeGreaterThan(35);
    expect(pct).toBeLessThan(65);
  });

  it('desync 방지 — 클라이언트 2개를 독립 구동해 결과가 일치해야', async () => {
    const A = await board(MIXED);
    const B = await board([1, 2, 25, 26, 143, 149]);

    // (1) 정상: 양쪽이 서로의 배치를 수신
    let mismatch = 0;
    for (let s = 1; s <= 80; s++) {
      const r = runArenaBattleTwoClients(A, B, s, {
        placementsA: roleBasedPlacements(A, 'L'),
        placementsB: roleBasedPlacements(B, 'R'),
      });
      if (!r.agree) {
        mismatch++;
        if (mismatch <= 3) console.log(`  ✗ seed ${s}: A관점=${r.perA} B관점=${r.perB} (틱 ${r.ticksA}/${r.ticksB})`);
      }
    }
    console.log(`  클라 2개 독립 구동 80판 → 불일치 ${mismatch}건`);
    expect(mismatch).toBe(0);

    // (2) 배치 수신 실패(경쟁 조건)는 반드시 갈린다 — 컴포넌트의 기본배치 폴백이 위험하다는 근거.
    //     실제로는 isOpponentReady 게이트가 사람 상대에선 수신 전 진입을 막지만,
    //     그 게이트가 무력화되면 어떻게 되는지 회귀로 고정해 둔다.
    let dropMismatch = 0;
    for (let s = 1; s <= 80; s++) {
      const r = runArenaBattleTwoClients(A, B, s, {
        placementsA: roleBasedPlacements(A, 'L'),
        placementsB: roleBasedPlacements(B, 'R'),
        dropBToA: true,
      });
      if (!r.agree) dropMismatch++;
    }
    console.log(`  상대 배치 미수신 시 80판 → 불일치 ${dropMismatch}건 (0이 아니어야 정상: 폴백은 위험)`);
    expect(dropMismatch).toBeGreaterThan(0);
  });

  it('6마리 타입 시너지 — 약점 데미지가 실제로 반감되는가', async () => {
    const mono = await board(MONO_FIRE);
    const synergies = calculateActiveSynergies(
      mono.map(x => ({ ...x, isFainted: false })) as unknown as GamePokemon[],
    );
    const fire = synergies.find(s => s.id === 'type:fire');
    console.log(`  불꽃6 시너지: level ${fire?.level} (count ${fire?.count})`);
    expect(fire?.level).toBe(3);
    // 스탯 배율은 4마리와 동일 1.3 — 6마리의 차별점은 '약점 반감'뿐이므로 그게 동작해야 한다
    expect(sixPieceResistTypes(mono[0], synergies)).toContain('fire');

    // 동일한 방어 유닛 2개(시너지 有/無)에 같은 물 공격을 넣어 데미지 비교
    const water = await board([9]);       // 거북왕 — 물 기술
    const target = await board([6]);      // 리자몽 — 물 2배 약점
    const mk = (d: TowerDetail, resist: string[]): Unit => ({
      id: 'op-0', detail: d, team: 'opp', x: 5, y: 0,
      hp: d.maxHp, maxHp: d.maxHp, atkCd: 0, fainted: false, isAtk: false, isHit: false,
      resistTypes: resist,
    });
    const atk: Unit = { ...mk(water[0], []), id: 'my-0', team: 'my', x: 0, y: 0 };

    // equippedMoves가 비어 있으면 moveType = 공격자 1번 타입(water) → 상성 2배 경로 그대로
    const dmgPlain = calcDmg(atk, mk(target[0], []), mulberry32(42));
    const dmgResist = calcDmg(atk, mk(target[0], ['fire']), mulberry32(42));
    const ratio = dmgResist.damage / dmgPlain.damage;
    console.log(`  물 공격 → 리자몽: 시너지 없음 ${dmgPlain.damage} / 불꽃6 시너지 ${dmgResist.damage} (배율 ${ratio.toFixed(2)})`);
    console.log(`  상성 배율 ${dmgPlain.effectiveness} (2배여야 반감이 걸린다)`);
    expect(dmgPlain.effectiveness).toBe(2);
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });

  /**
   * 시너지 단독 가치 — **같은 보드끼리** 붙이고 한쪽만 버프를 켠다.
   *
   * 예전엔 pvpMatrix가 "water6 vs nosyn6" 같은 서로 다른 보드 승률로 이걸 쟀는데,
   * 그건 시너지가 아니라 두 보드의 종족 궁합을 재는 것이었다. 실제로 gen1x6은 노말 기술이
   * 많고 nosyn6에는 노말 무효인 단칼빙이 있어서, 시너지가 멀쩡히 동작해도 41%가 나왔다.
   * 여기서는 로스터가 양쪽 동일하므로 차이는 오직 시너지 버프뿐이다.
   */
  it('시너지 단독 가치 — 같은 보드, 한쪽만 버프 ON', async () => {
    const { buildAllBoards } = await import('./boards');
    const { runArenaBattle, teamSynergies } = await import('./arenaRunner');
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();

    const N = 40;
    const results: Array<{ name: string; syn: string; winRate: number }> = [];
    for (const b of boards) {
      const syn = teamSynergies(b.details);
      if (!syn.length) continue;
      let on = 0;
      for (let s = 1; s <= N; s++) {
        // 양방향 — 진영 편향이 섞이지 않게
        if (runArenaBattle(b.details, b.details, 700_000 + s,
          { mySynergies: syn, oppSynergies: [] }).myWon) on++;
        if (!runArenaBattle(b.details, b.details, 700_000 + s,
          { mySynergies: [], oppSynergies: syn }).myWon) on++;
      }
      const winRate = on / (N * 2);
      results.push({ name: b.name, syn: syn.map(x => `${x.id}:L${x.level}`).join(' '), winRate });
      console.log(`  ${b.name.padEnd(12)} [${syn.map(x => `${x.id}:L${x.level}`).join(' ')}] 시너지측 승률 ${(winRate * 100).toFixed(1)}%`);
    }

    // 시너지가 붙은 쪽이 유리해야 한다(하한). 상한은 판정하지 않고 신호로만 —
    // 스탯 ×1.3은 공/방 양쪽에 걸려 dps비가 1.69배가 되므로 6v6에서 100%는 산술적 귀결이다.
    // "그 설계가 맞느냐"는 밸런스 결정이라 하네스가 단독으로 실패시키지 않는다.
    for (const r of results) {
      expect(r.winRate).toBeGreaterThan(0.5);
      if (r.winRate > 0.95) {
        console.log(`  SIGNAL 시너지 결정력 과다: ${r.name}(${r.syn}) = ${(r.winRate * 100).toFixed(1)}% — 시너지만으로 승패 확정`);
      }
    }
    expect(results.length).toBeGreaterThan(0);
  }, 300_000);
});
