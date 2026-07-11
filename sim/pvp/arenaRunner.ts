// sim/pvp/arenaRunner.ts
// 헤드리스 아레나 러너 — 인간전 전투 엔진(src/game/arenaSim)을 브라우저 없이 구동.
// TFTBattleArena 컴포넌트의 오케스트레이션을 재현:
//   시너지 = calculateActiveSynergies(sortTeamDeterministic(team).filter(!isFainted))
//   배치   = 지정 배치 or 기본 지그재그(L_POS/R_POS, autoPlaceRemainingUnits와 동일)
//   전투   = simulateTick 반복, 시드 mulberry32
// 컴포넌트에는 전투 시간 상한이 없지만(교착 시 BattlePhaseUI 워치독이 처리),
// 헤드리스는 maxSeconds 초과 시 HP비율 → 스피드합 → 시드 순 결정론 타이브레이크.

import {
  buildUnits, simulateTick, Unit, L_POS, R_POS, FPS,
  sortTeamDeterministic, mulberry32,
} from '../../src/game/arenaSim';
import { calculateActiveSynergies } from '../../src/utils/synergyManager';
import { TowerDetail } from '../../src/types/multiplayer';
import { GamePokemon } from '../../src/types/game';

export interface Placement { x: number; y: number }

export interface ArenaOutcome {
  myWon: boolean;
  myRemaining: number;
  oppRemaining: number;
  ticks: number;
  timedOut: boolean;
}

export function teamSynergies(team: TowerDetail[]) {
  return calculateActiveSynergies(
    sortTeamDeterministic(team).filter(t => !t.isFainted) as unknown as GamePokemon[]
  );
}

/** 기본 배치(자동배치와 동일): 벤치 순서대로 지그재그 슬롯. */
export function defaultPlacements(count: number, side: 'L' | 'R'): Placement[] {
  const defs = side === 'L' ? L_POS : R_POS;
  return Array.from({ length: count }, (_, i) => defs[i % defs.length]);
}

export function runArenaBattle(
  myTeam: TowerDetail[],
  oppTeam: TowerDetail[],
  seed: number,
  opts?: {
    myPlacements?: Placement[];
    oppPlacements?: Placement[];
    maxSeconds?: number;
  }
): ArenaOutcome {
  const mySyn = teamSynergies(myTeam);
  const oppSyn = teamSynergies(oppTeam);

  let units: Unit[] = buildUnits(myTeam, oppTeam, mySyn, oppSyn);

  const myCount = units.filter(u => u.team === 'my').length;
  const oppCount = units.filter(u => u.team === 'opp').length;
  const myPlace = opts?.myPlacements ?? defaultPlacements(myCount, 'L');
  const oppPlace = opts?.oppPlacements ?? defaultPlacements(oppCount, 'R');

  // buildUnits는 정렬 순서대로 my-0.. / op-0.. id를 부여 → 같은 순서로 배치 적용
  let mi = 0, oi = 0;
  units = units.map(u => {
    if (u.team === 'my') { const p = myPlace[mi++]; return { ...u, x: p.x, y: p.y }; }
    const p = oppPlace[oi++]; return { ...u, x: p.x, y: p.y };
  });

  const rng = mulberry32(seed);
  const maxTicks = Math.floor((opts?.maxSeconds ?? 60) * FPS);
  let tick = 0;
  let done = false;

  while (tick < maxTicks) {
    const res = simulateTick(units, 'L', rng);
    units = res.units;
    tick++;
    if (res.done) { done = true; break; }
  }

  const alive = (u: Unit) => !u.fainted && u.hp > 0 && u.x >= 0;
  const myAlive = units.filter(u => u.team === 'my' && alive(u));
  const oppAlive = units.filter(u => u.team === 'opp' && alive(u));

  let myWon: boolean;
  if (done || myAlive.length === 0 || oppAlive.length === 0) {
    myWon = myAlive.length > 0;
  } else {
    // 타임아웃 — 결정론 타이브레이크 (PvPBattleService 규칙 준용)
    const ratio = (us: Unit[], team: 'my' | 'opp') => {
      const mine = units.filter(u => u.team === team);
      const hp = mine.reduce((s, u) => s + Math.max(0, u.hp), 0);
      const max = mine.reduce((s, u) => s + u.maxHp, 0) || 1;
      return hp / max;
    };
    const rMy = ratio(units, 'my');
    const rOpp = ratio(units, 'opp');
    if (rMy !== rOpp) myWon = rMy > rOpp;
    else {
      const spd = (team: 'my' | 'opp') =>
        units.filter(u => u.team === team).reduce((s, u) => s + (u.detail.speed ?? 0), 0);
      myWon = spd('my') !== spd('opp') ? spd('my') > spd('opp') : rng() < 0.5;
    }
  }

  return {
    myWon,
    myRemaining: myAlive.length,
    oppRemaining: oppAlive.length,
    ticks: tick,
    timedOut: !done && tick >= maxTicks,
  };
}

/** 좌열(0,1) 12칸 중 6칸 무작위 배치 — 시드 결정론. */
export function randomPlacements(count: number, side: 'L' | 'R', rand: () => number): Placement[] {
  const cols = side === 'L' ? [0, 1] : [4, 5];
  const cells: Placement[] = [];
  for (const x of cols) for (let y = 0; y < 6; y++) cells.push({ x, y });
  // Fisher–Yates
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count);
}

/**
 * 휴리스틱 배치: 내구(탱커) 전열, 화력 후열.
 * 전열 = 적과 가까운 열(L이면 col1), 후열 = col0.
 * invert=true면 정반대(딜러 전열) — 배치 영향력 측정용.
 */
export function roleBasedPlacements(
  team: TowerDetail[],
  side: 'L' | 'R',
  invert = false
): Placement[] {
  const sorted = sortTeamDeterministic(team).slice(0, 6);
  const bulk = (t: TowerDetail) => (t.maxHp ?? 0) + 2 * (t.defense ?? 0) + 2 * (t.specialDefense ?? 0);
  // bulk 내림차순 순위 → 상위 3 = 전열
  const ranked = sorted
    .map((t, i) => ({ i, b: bulk(t) }))
    .sort((a, b) => (invert ? a.b - b.b : b.b - a.b));

  const frontCol = side === 'L' ? 1 : 4;
  const backCol = side === 'L' ? 0 : 5;
  const frontRows = [1, 2, 3];  // 중앙 위주
  const backRows = [1, 2, 3];

  const out: Placement[] = new Array(sorted.length);
  ranked.forEach((r, k) => {
    if (k < 3) out[r.i] = { x: frontCol, y: frontRows[k % 3] };
    else out[r.i] = { x: backCol, y: backRows[(k - 3) % 3] };
  });
  return out;
}
