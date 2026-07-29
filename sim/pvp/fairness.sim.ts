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
import { mulberry32 } from '../../src/utils/rng';
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

  it('desync 방지 — 같은 전투를 양쪽 클라이언트 관점에서 돌리면 결과가 같아야', async () => {
    // 클라이언트 A: 자기가 L (my=boardA, opp=boardB, myPosition='L')
    // 클라이언트 B: 자기가 R (my=boardB, opp=boardA, myPosition='R')
    // 물리적으로 동일한 전투이므로 승자(보드 기준)가 일치해야 한다.
    const A = await board(MIXED);
    const B = await board([1, 2, 25, 26, 143, 149]);
    let mismatch = 0;
    for (let s = 1; s <= 60; s++) {
      const fromA = runArena(A.map(x => ({ ...x })), B.map(x => ({ ...x })), 'L', s); // my=A
      const fromB = runArena(B.map(x => ({ ...x })), A.map(x => ({ ...x })), 'R', s); // my=B
      // fromA가 'my'면 A 승, fromB가 'opp'면 A 승 → 서로 뒤집힌 표현이 일치해야 한다
      const aWinsPerA = fromA === 'my' ? 'A' : fromA === 'opp' ? 'B' : 'draw';
      const aWinsPerB = fromB === 'opp' ? 'A' : fromB === 'my' ? 'B' : 'draw';
      if (aWinsPerA !== aWinsPerB) {
        mismatch++;
        if (mismatch <= 3) console.log(`  ✗ seed ${s}: A관점=${aWinsPerA} B관점=${aWinsPerB}`);
      }
    }
    console.log(`  양측 관점 60판 비교 → 불일치 ${mismatch}건 (0이어야 desync 없음)`);
    expect(mismatch).toBe(0);
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
});
