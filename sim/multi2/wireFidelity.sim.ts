// sim/multi2/wireFidelity.sim.ts
// P-3: 와이어 왕복 충실도 — 로컬 보드가 Firebase 를 한 바퀴 돌아 상대 화면에 도착할 때
//      무엇이 살아남고 무엇이 사라지는가.
// 실행: npm run sim:2p:wire
//
// 멀티 전투의 입력은 **로컬 타워가 아니라 RTDB 에서 내려받은 TowerDetail** 이다
// (BattlePhaseUI 는 towerDetailsRef 에서 양쪽 팀을 꺼낸다 — 자기 팀도 포함).
// 따라서 업로드 경로에서 떨어져 나간 필드는 그 순간 게임에서 사라진다.
// 경로: buildTowerDetails(towerFactory) → normalizeTowerDetails(MultiplayerService) → RTDB → 상대

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { resetWorld, seedServer } from '../net/rtdb';
import { spawnClient, makeUser, ClientModules } from '../net/clientKit';
import { buildBoard } from '../support/teamBuilder';
import { BOARD_SPECS } from '../pvp/boards';
import { runArenaBattle } from '../pvp/arenaRunner';
import { BASE_CRIT_CHANCE } from '../../src/utils/abilities';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import type { TowerDetail } from '../../src/types/multiplayer';
import type { PokemonAbility } from '../../src/types/game';
import { writeReport, writeMetrics, mdTable, pct } from '../support/report';

const flush = (ms = 2000) => vi.advanceTimersByTimeAsync(ms);
const spec = (name: string) => BOARD_SPECS.find(s => s.name === name)!;

const CRIT_ABILITY: PokemonAbility = {
  name: 'blaze', displayName: '맹화', description: '', effect: 'crit', value: 2.0,
};
const LIFESTEAL_ABILITY: PokemonAbility = {
  name: 'regenerator', displayName: '재생력', description: '', effect: 'lifesteal', value: 0.15,
};

let base: TowerDetail[] = [];
let oppBoard: TowerDetail[] = [];
const findings: Array<{ 항목: string; 결과: string }> = [];

/** gameStore 의 towers 모양 — ability 는 **객체**다(GameCanvas.addTower 가 poke.ability 를 그대로 넣는다). */
function asStoreTowers(details: TowerDetail[]): any[] {
  return details.map((t, i) => ({
    ...t,
    id: `t${i}`,
    displayName: t.name,
    // 앞의 둘은 크리 특성, 셋째는 흡혈 특성, 나머지는 특성 없음
    ability: i < 2 ? CRIT_ABILITY : i === 2 ? LIFESTEAL_ABILITY : undefined,
  }));
}

describe('P-3: 와이어 왕복 충실도', () => {
  let C: ClientModules;

  beforeAll(async () => {
    // 보드 생성 전 시드 고정 — twoPlayer.sim.ts 의 같은 주석 참조(미매핑 특성은 rng 추첨).
    setRngSource(mulberry32(20260711));
    base = (await buildBoard('nosyn6', '', spec('nosyn6').members)).details;
    oppBoard = (await buildBoard('gen1x6', '', spec('gen1x6').members)).details;
  }, 120_000);

  afterEach(() => { vi.useRealTimers(); });

  it('업로드 → 다운로드 후 어떤 필드가 사라지는가', async () => {
    resetWorld();
    localStorage.removeItem('currentRoomId');
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    C = await spawnClient('cW', makeUser('u_wire'), { latencyMs: 10 });

    const towers = asStoreTowers(base);
    const local = C.buildTowerDetails(towers);

    // 로컬 계산은 특성을 제대로 반영한다.
    expect(local[0].critChance).toBeCloseTo(BASE_CRIT_CHANCE * 2, 6);
    expect(local[2].lifesteal).toBeCloseTo(0.15, 6);

    const p = C.multiplayerService.flushTowerUpdate('roomW', 'u_wire', local);
    await flush(); await p;
    const g = C.multiplayerService.getAllTowerDetailsOnce('roomW');
    await flush(); const all = await g;
    const wire = all.get('u_wire') as TowerDetail[];

    expect(wire).toBeTruthy();
    expect(wire.length).toBe(local.length);

    const fields = [
      'pokemonId', 'name', 'level', 'position', 'currentHp', 'maxHp', 'isFainted',
      'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'types',
      'equippedMoves', 'lifesteal', 'aoeBonus', 'critChance', 'ability',
    ] as const;

    const lost: string[] = [];
    for (const f of fields) {
      const localHas = local.some(t => (t as any)[f] !== undefined);
      const wireHas = wire.some(t => (t as any)[f] !== undefined);
      if (localHas && !wireHas) lost.push(f);
    }

    findings.push({
      항목: '왕복에서 소실된 필드',
      결과: lost.length ? lost.join(', ') : '없음',
    });
    // ⚠ 이 단정이 깨지면 normalizeTowerDetails 화이트리스트에서 뭔가 또 떨어져 나간 것이다.
    //   그 필드는 그 순간 멀티에서 존재하지 않게 된다(전투 입력이 이 왕복값이므로).
    expect(lost).toEqual([]);

    // 살아남아야 하는 것들은 실제로 살아남는다.
    expect(wire[2].lifesteal).toBeCloseTo(0.15, 6);
    expect(wire[0].attack).toBe(local[0].attack);
    expect(wire[0].equippedMoves?.length).toBe(local[0].equippedMoves?.length);

    // [FIX] critChance — 예전엔 화이트리스트에 없어 크리 특성이 멀티에서 통째로 죽어 있었다.
    findings.push({
      항목: 'critChance 왕복',
      결과: wire[0].critChance === undefined
        ? `소실 (로컬 ${local[0].critChance?.toFixed(4)} → 와이어 undefined → 전투엔진 폴백 ${BASE_CRIT_CHANCE.toFixed(4)})`
        : `보존 (${wire[0].critChance.toFixed(4)}, 특성 없는 유닛 ${wire[3].critChance?.toFixed(4)})`,
    });
    expect(wire[0].critChance).toBeCloseTo(BASE_CRIT_CHANCE * 2, 6);
    expect(wire[3].critChance).toBeCloseTo(BASE_CRIT_CHANCE, 6);

    // [FIX] 특성 원본도 압축본으로 함께 간다(설명문은 대역폭 때문에 뺀다).
    findings.push({
      항목: '특성 원본 왕복',
      결과: wire[0].ability
        ? `보존 (${wire[0].ability.name}/${wire[0].ability.effect}×${wire[0].ability.value}`
          + `, description 미전송 ${!(wire[0].ability as any).description})`
        : '소실',
    });
    expect(wire[0].ability?.effect).toBe('crit');
    expect(wire[2].ability?.effect).toBe('lifesteal');
    expect((wire[0].ability as any).description).toBeUndefined();
    C.multiplayerService.stopAutoCleanup();
  }, 120_000);

  it('재접속 복원 후 다음 업로드에서 특성 파생값이 어떻게 되는가', async () => {
    resetWorld();
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    const C2 = await spawnClient('cW2', makeUser('u_wire2'), { latencyMs: 10 });

    const local = C2.buildTowerDetails(asStoreTowers(base));
    const p = C2.multiplayerService.flushTowerUpdate('roomW2', 'u_wire2', local);
    await flush(); await p;
    // getPlayerStateForRejoin 은 gameStates 가 있어야 복원값을 돌려준다.
    seedServer('gameStates/roomW2', {
      roomId: 'roomW2', currentRound: 3, currentPhase: 'wave', startTime: Date.now(),
      players: [{ userId: 'u_wire2', userName: 'w2', wave: 3, lives: 40, money: 700, towers: 6, isAlive: true, rating: 1000 }],
    });

    // GameLayout 의 재접속 복원 경로 — [FIX] 이제 와이어의 ability 를 되살린다.
    //   예전엔 무조건 `ability: ""` 라, 복원 직후 값은 멀쩡해 보여도 **다음 업로드에서**
    //   buildTowerDetails 가 파생값을 재계산하며 흡혈 0.15 → 0, 크리 ×2 → 기본이 됐다.
    //   = 새로고침 한 번이면 그 게임 내내 특성 없는 팀.
    const g = C2.multiplayerService.getPlayerStateForRejoin('roomW2', 'u_wire2');
    await flush(); const restored = await g;
    const restoredTowers = (restored?.towerDetails ?? []).map((td: any, i: number) => ({
      ...td, id: `restored-${i}`, displayName: td.name,
      ability: C2.fromWireAbility(td.ability) ?? '',   // ← GameLayout.tsx 복원 코드와 동일
      lifesteal: td.lifesteal ?? 0,
      aoeBonus: td.aoeBonus ?? 0,
    }));

    // 복원 직후 값 자체는 살아 있다.
    const restoredLifesteal = restoredTowers[2]?.lifesteal;
    // 그리고 이후 어떤 업로드든 buildTowerDetails 를 다시 거치는데, 이제 같은 값이 나온다.
    const afterRebuild = C2.buildTowerDetails(restoredTowers);

    findings.push({
      항목: '재접속 후 흡혈',
      결과: `복원값 ${restoredLifesteal} → 재업로드 계산값 ${afterRebuild[2].lifesteal}`,
    });
    findings.push({
      항목: '재접속 후 크리',
      결과: `재업로드 계산값 ${afterRebuild[0].critChance?.toFixed(4)} (기본 ${BASE_CRIT_CHANCE.toFixed(4)})`,
    });
    expect(afterRebuild[2].lifesteal).toBeCloseTo(0.15, 6);
    expect(afterRebuild[0].critChance).toBeCloseTo(BASE_CRIT_CHANCE * 2, 6);
    C2.multiplayerService.stopAutoCleanup();
  }, 120_000);

  // 수정으로 되찾은 크기를 기록해 둔다 — "critChance 를 화이트리스트에 넣었다"가
  // 실제 승률로 몇 %p 인지. (수정 전 = afterWire 쪽, 수정 후 = withAbility 쪽)
  it('크리 특성 소실의 전투 영향 실측 (수정 전/후 A/B)', () => {
    // 같은 보드를 두 판본으로: (a) 로컬 계산대로 크리 특성 반영, (b) 와이어 통과 후(=폴백).
    const withAbility = base.map((t, i) => ({
      ...t, critChance: i < 2 ? BASE_CRIT_CHANCE * 2 : BASE_CRIT_CHANCE,
    }));
    const afterWire = base.map(t => ({ ...t, critChance: undefined as any }));

    // ⚠ 같은 시드로 두 판본을 돌리는 **짝지은 비교**다. 두 승률에 각각 이항 신뢰구간을 씌워
    //   "구간이 겹치니 무의미"라고 읽으면 틀린다(공통 시드 분산이 상쇄되므로 검정력이 훨씬 높다).
    //   불일치 쌍만 세는 McNemar 로 판정한다. — sim-measurement-pitfalls 참조.
    const SEEDS = 1500;
    let winWith = 0, winWire = 0, onlyWith = 0, onlyWire = 0;
    for (let s = 0; s < SEEDS; s++) {
      const seed = 7_000_000 + s * 7919;
      const a = runArenaBattle(withAbility, oppBoard, seed).myWon;
      const b = runArenaBattle(afterWire, oppBoard, seed).myWon;
      if (a) winWith++;
      if (b) winWire++;
      if (a && !b) onlyWith++;
      if (!a && b) onlyWire++;
    }
    const rWith = winWith / SEEDS;
    const rWire = winWire / SEEDS;
    const disc = onlyWith + onlyWire;
    const diff = (onlyWith - onlyWire) / SEEDS;
    const se = disc > 0 ? Math.sqrt(disc) / SEEDS : 0;
    const lo = (diff - 1.96 * se) * 100;
    const hi = (diff + 1.96 * se) * 100;
    const significant = lo > 0 || hi < 0;

    findings.push({ 항목: '크리 특성 반영 시 승률', 결과: `${pct(rWith)} (n=${SEEDS})` });
    findings.push({ 항목: '와이어 통과 후 승률', 결과: `${pct(rWire)} (n=${SEEDS})` });
    findings.push({
      항목: '짝지은 차이 (McNemar)',
      결과: `${(diff * 100).toFixed(1)}%p, 95% CI [${lo.toFixed(1)}, ${hi.toFixed(1)}]%p`
        + ` · 불일치 쌍 ${disc}/${SEEDS} · ${significant ? '유의' : '판정불가'}`,
    });

    console.log(`[wire] 크리 특성 보드: 반영 ${pct(rWith)} vs 소실 ${pct(rWire)}`
      + ` → 짝지은 차이 ${(diff * 100).toFixed(1)}%p CI [${lo.toFixed(1)}, ${hi.toFixed(1)}] (n=${SEEDS})`);
    expect(disc).toBeGreaterThanOrEqual(0);
  }, 300_000);

  it('리포트 저장', () => {
    let md = '# 와이어 왕복 충실도 (2인 멀티)\n\n';
    md += '멀티 전투의 입력은 로컬 타워가 아니라 **RTDB 에서 내려받은 TowerDetail** 이다';
    md += '(`BattlePhaseUI` 는 자기 팀도 `towerDetailsRef` 에서 꺼낸다).\n';
    md += '경로: `buildTowerDetails` → `normalizeTowerDetails` → RTDB → 상대/본인\n\n';
    md += mdTable(['항목', '결과'], findings.map(f => [f.항목, f.결과]));
    md += '\n> 승률 A/B 는 같은 보드·같은 시드에서 `critChance` 만 바꾼 단일요인 비교다.\n';
    writeReport('multi-2p-wire', md);
    writeMetrics('multi-2p-wire', { findings });
    for (const f of findings) console.log(`[wire] ${f.항목}: ${f.결과}`);
    expect(findings.length).toBeGreaterThan(0);
  });
});
