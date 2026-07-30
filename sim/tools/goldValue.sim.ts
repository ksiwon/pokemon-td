// sim/tools/goldValue.sim.ts
// 수량 vs 품질 — 골드 등가가 실제로 등가인지 측정.
// 실행: SIM_GOLD=1 npm run sim:gold
//
// 배경: pvpMatrix의 '저가6 vs 고가3' 체크가 베이스라인부터 계속 WARN이다
//   (nosyn6 vs expensive3 = 1.3% → 0.0%). 같은 골드를 써도 고가 소수가 저가 다수를 전멸시킨다.
//
// 가설: computePokemonCost(BST) = 25 + (BST/600)*200 는 BST에 **선형**인데,
//   전투력은 BST에 대해 **초선형**이다(데미지 ∝ 공/방 이므로 스탯을 한 유닛에 몰면
//   딜과 생존이 동시에 올라 곱으로 작용). 게다가 고정비 25G 때문에 골드당 BST 자체가
//   고BST 쪽이 더 유리하다 → 품질이 이중으로 이득.
//
// 측정:
//   A. 동일 골드(≈700G)에서 유닛 수 N=3..6 보드의 풀리그 승률
//   B. 6마리 보드와 50:50이 되는 3마리 보드의 BST를 이분 탐색 →
//      "지금 가격표가 고BST를 몇 배 싸게 팔고 있는가"를 배수로 환산

import { describe, it, expect } from 'vitest';
import { pokeAPI } from '../../src/api/pokeapi';
import { computePokemonCost } from '../../src/game/towerFactory';
import { setBalanceOverrides } from '../../src/game/balanceOverrides';
import { getGenerationById } from '../../src/utils/synergyManager';
import { buildBoard, BuiltBoard } from '../support/teamBuilder';
import { runArenaBattle } from '../pvp/arenaRunner';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { writeReport, writeMetrics, mdTable, pct } from '../support/report';

const SEEDS = Number(process.env.SIM_GOLD_SEEDS ?? 24);
const LV = 15;
const GOLD = Number(process.env.SIM_GOLD_BUDGET ?? 700);

/** statCache에서 (id, BST) 목록. bootstrap이 fixture를 넣어두므로 네트워크 0. */
async function bstTable(): Promise<Array<{ id: number; bst: number }>> {
  await pokeAPI.preloadRarities();
  const out: Array<{ id: number; bst: number }> = [];
  const cache: Map<number, { statTotal: number; types: string[] }> =
    (pokeAPI as unknown as { statCache: Map<number, { statTotal: number; types: string[] }> }).statCache;
  cache.forEach((v, id) => { if (id <= 1025) out.push({ id, bst: v.statTotal }); });
  return out.sort((a, b) => a.id - b.id);
}

/**
 * 목표 BST 근처에서 n마리를 고른다. 시너지를 최소화하기 위해 타입·세대 중복을 피한다
 * (시너지가 섞이면 수량/품질 축이 오염된다).
 */
async function pickDistinct(
  table: Array<{ id: number; bst: number }>,
  n: number,
  targetBst: number,
  /** 이미 다른 로스터에 쓴 종 — 서로 겹치지 않는 표본을 여러 개 뽑을 때 사용. */
  exclude: Set<number> = new Set(),
): Promise<number[]> {
  const cache: Map<number, { statTotal: number; types: string[] }> =
    (pokeAPI as unknown as { statCache: Map<number, { statTotal: number; types: string[] }> }).statCache;
  const usedTypes = new Set<string>();
  const usedGens = new Set<number>();
  const picked: number[] = [];

  for (let tol = 8; tol <= 160 && picked.length < n; tol += 8) {
    const pool = table
      .filter(e => Math.abs(e.bst - targetBst) <= tol && !picked.includes(e.id) && !exclude.has(e.id))
      .sort((a, b) => Math.abs(a.bst - targetBst) - Math.abs(b.bst - targetBst));
    for (const e of pool) {
      if (picked.length >= n) break;
      const types = cache.get(e.id)?.types ?? [];
      const gen = getGenerationById(e.id);
      if (types.some(t => usedTypes.has(t))) continue;
      if (usedGens.has(gen)) continue;
      types.forEach(t => usedTypes.add(t));
      usedGens.add(gen);
      picked.push(e.id);
    }
  }
  return picked;
}

/** 서로 겹치지 않는 로스터 K개를 뽑는다(로스터 정체성 노이즈를 평균으로 지우기 위함). */
async function pickRosters(
  table: Array<{ id: number; bst: number }>,
  n: number,
  targetBst: number,
  k: number,
): Promise<number[][]> {
  const used = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < k; i++) {
    const ids = await pickDistinct(table, n, targetBst, used);
    if (ids.length < n) break;
    ids.forEach(id => used.add(id));
    out.push(ids);
  }
  return out;
}

async function boardOf(name: string, ids: number[]): Promise<BuiltBoard> {
  return buildBoard(name, `${ids.length}마리`, ids.map(id => ({ id, level: LV })));
}

/** 두 보드를 양방향·양엔진으로 붙여 앞 보드의 승률. */
function duel(a: BuiltBoard, b: BuiltBoard): { arena: number; svc: number } {
  let aArena = 0, aSvc = 0, games = 0;
  for (let s = 1; s <= SEEDS; s++) {
    // arena: 양쪽을 my/opp로 번갈아 → 진영 효과 제거
    if (runArenaBattle(a.details, b.details, 900_000 + s).myWon) aArena++;
    if (!runArenaBattle(b.details, a.details, 900_000 + s).myWon) aArena++;
    // service: p1/p2 교대
    if (pvpBattleService.simulateBattle(a.details, b.details, 'pa', 'pb', s).winnerId === 'pa') aSvc++;
    if (pvpBattleService.simulateBattle(b.details, a.details, 'pa', 'pb', s).winnerId === 'pb') aSvc++;
    games += 2;
  }
  return { arena: aArena / games, svc: aSvc / games };
}

const buyGold = (b: BuiltBoard) => b.goldBreakdown.reduce((s, g) => s + g.buy, 0);

/** 로스터 집합 A × B 전 조합 평균 — 특정 종 조합의 상성 운을 지운다. */
function avgDuel(as: BuiltBoard[], bs: BuiltBoard[]): { arena: number; svc: number; pairs: number } {
  let arena = 0, svc = 0, pairs = 0;
  for (const a of as) for (const b of bs) {
    const d = duel(a, b);
    arena += d.arena; svc += d.svc; pairs++;
  }
  return { arena: arena / pairs, svc: svc / pairs, pairs };
}

/** 유닛 수 N · BST b 보드의 이론 전력 = N²b³ (집중포화 + 데미지∝공/방 모델). */
const modelPower = (n: number, b: number) => n * n * Math.pow(b, 3);

describe.skipIf(!process.env.SIM_GOLD)('수량 vs 품질: 골드 등가 검증', () => {
  it(`동일 골드(≈${GOLD}G) 유닛수별 승률 + 공정가 배수`, async () => {
    setRngSource(mulberry32(20260730));
    const table = await bstTable();

    // ── A. 동일 골드에서 N=3..6 보드 ─────────────────────────────────────
    // N마리로 GOLD를 다 쓰는 BST: cost(b) = GOLD/N  →  b = (GOLD/N - 25)/200*600
    const bstFor = (n: number) => ((GOLD / n) - 25) / 200 * 600;
    const K = Number(process.env.SIM_GOLD_ROSTERS ?? 4);
    const groups: Array<{ n: number; bst: number; boards: BuiltBoard[] }> = [];
    for (const n of [6, 5, 4, 3]) {
      const target = Math.round(bstFor(n));
      const rosters = await pickRosters(table, n, target, K);
      if (rosters.length === 0) { console.log(`  (N=${n}: 후보 부족, 건너뜀)`); continue; }
      const boards: BuiltBoard[] = [];
      for (let i = 0; i < rosters.length; i++) boards.push(await boardOf(`q${n}_${i}`, rosters[i]));
      groups.push({ n, bst: target, boards });
      const gold = Math.round(boards.reduce((s, b) => s + buyGold(b), 0) / boards.length);
      console.log(
        `  q${n}: 목표BST ${target} · 평균구매 ${gold}G · 로스터 ${boards.length}종` +
        ` · 이론전력 ${(modelPower(n, target) / 1e9).toFixed(2)}e9`
      );
    }

    const rows: string[][] = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i], B = groups[j];
        const d = avgDuel(A.boards, B.boards);
        const ratio = modelPower(A.n, A.bst) / modelPower(B.n, B.bst);
        rows.push([
          `q${A.n} vs q${B.n}`, ratio.toFixed(2), pct(d.arena), pct(d.svc), String(d.pairs),
        ]);
        console.log(
          `  q${A.n} vs q${B.n}: 이론전력비 ${ratio.toFixed(2)}` +
          ` → arena ${pct(d.arena)} / service ${pct(d.svc)} (조합 ${d.pairs})`
        );
      }
    }
    const boards = groups.map(g => g.boards[0]);

    // ── B. 공정가 배수: 6마리 보드와 50:50이 되는 3마리 BST 이분 탐색 ──────
    const six = groups.find(g => g.n === 6)?.boards[0];
    expect(six).toBeTruthy();
    let lo = 250, hi = Math.round(bstFor(3)), fairBst = hi, iters = 0;
    while (hi - lo > 12 && iters < 8) {
      iters++;
      const mid = Math.round((lo + hi) / 2);
      const ids = await pickDistinct(table, 3, mid);
      if (ids.length < 3) break;
      const cand = await boardOf('probe3', ids);
      const w = avgDuel([cand], groups.find(g => g.n === 6)!.boards).arena;
      console.log(`  탐색: 3마리 BST≈${mid} → vs q6 승률 ${pct(w)}`);
      if (w > 0.5) { hi = mid; fairBst = mid; } else { lo = mid; }
    }

    const actualBst = Math.round(bstFor(3));
    const actualCost = computePokemonCost(actualBst);
    const fairCost = GOLD / 3;                      // 6마리 보드와 등가가 되려면 이 값이어야
    const fairCostAtFairBst = computePokemonCost(fairBst);
    const underpriced = actualCost / fairCostAtFairBst;

    console.log(`\n  현재 가격표: BST ${actualBst} = ${actualCost}G`);
    console.log(`  실측 등가점: BST ${fairBst} 정도가 6마리 보드와 대등 (현 가격 ${fairCostAtFairBst}G)`);
    console.log(`  → 같은 값어치를 ${underpriced.toFixed(2)}배 싸게 팔고 있다 (1.0이면 공정)`);
    console.log(`  참고: 3마리로 ${GOLD}G를 쓰려면 유닛당 ${fairCost.toFixed(0)}G`);

    // ── 리포트 ────────────────────────────────────────────────────────────
    let md = `# 수량 vs 품질 — 골드 등가 검증\n\n`;
    md += `- 예산 ${GOLD}G · 레벨 ${LV} · 시드 ${SEEDS}(양방향) · 엔진 arena/service 병기\n`;
    md += `- 가격식: \`computePokemonCost(BST) = 25 + (BST/600)*200\` (BST에 선형)\n\n`;
    md += `## 보드\n\n`;
    md += mdTable(['보드', '구매골드', 'ΣBST', 'BST/G', '시너지'],
      boards.map(b => {
        const bst = b.goldBreakdown.reduce((s, g) => s + (table.find(e => e.id === g.id)?.bst ?? 0), 0);
        return [b.name, `${buyGold(b)}G`, bst, (bst / buyGold(b)).toFixed(2), b.synergies.length];
      }));
    md += `\n## 대전 결과 (앞 보드 승률)\n\n`;
    md += mdTable(['매치업', '이론전력비(N²b³)', 'arena', 'service', '조합 수'], rows);
    md += `\n## 공정가\n\n`;
    md += `- 현재: BST ${actualBst} 유닛 = **${actualCost}G**\n`;
    md += `- 실측 등가: 3마리 보드가 6마리 보드와 대등해지는 지점은 BST **${fairBst}** 근처\n`;
    md += `- 즉 지금 가격표는 고BST를 **약 ${underpriced.toFixed(2)}배 싸게** 판다\n\n`;
    md += `> 원인 두 가지가 겹친다.\n`;
    md += `> 1. 고정비 25G 때문에 골드당 BST가 고BST 쪽이 더 유리(선형식의 절편 효과).\n`;
    md += `> 2. 전투력이 BST에 초선형 — 데미지 ∝ 공/방 이라 스탯을 한 유닛에 몰면\n`;
    md += `>    딜과 생존이 동시에 올라 곱으로 작용한다. 유닛 수는 선형으로만 늘어난다.\n`;

    writeReport('gold-value', md);
    writeMetrics('gold-value', {
      gold: GOLD, seeds: SEEDS, level: LV,
      boards: boards.map(b => ({ name: b.name, buyGold: buyGold(b), synergies: b.synergies.length })),
      duels: rows,
      actualBst, actualCost, fairBst, fairCostAtFairBst, underpricedRatio: underpriced,
    });

    expect(boards.length).toBeGreaterThanOrEqual(3);
  });

  // ── C. 제안 곡선 A/B ────────────────────────────────────────────────────
  // 실측 지수 α ≈ 1.475 (3×440^α = 6×275^α 를 만족하는 값)를 가격에 그대로 반영하면
  // "골드당 전투력"이 유닛 수와 무관해진다. k는 중간대(BST 450 ≈ 175G)를 보존하도록 잡는다.
  it('제안 곡선(cost = k·(BST/600)^α) A/B — 수량/품질이 등가가 되는가', async () => {
    const EXP = Number(process.env.SIM_GOLD_EXP ?? 1.475);
    const K = Number(process.env.SIM_GOLD_K ?? 268);
    const table = await bstTable();

    // 가격표 비교
    console.log(`\n  [가격표] 현재 vs 제안(α=${EXP}, k=${K})`);
    const priceRows: string[][] = [];
    for (const bst of [200, 275, 350, 450, 525, 600, 680, 720]) {
      setBalanceOverrides({});
      const cur = computePokemonCost(bst);
      setBalanceOverrides({ costCurve: { exponent: EXP, k: K } });
      const prop = computePokemonCost(bst);
      setBalanceOverrides({});
      const d = (((prop - cur) / cur) * 100).toFixed(0);
      priceRows.push([String(bst), `${cur}G`, `${prop}G`, `${Number(d) > 0 ? '+' : ''}${d}%`]);
      console.log(`    BST ${String(bst).padStart(3)}: ${String(cur).padStart(3)}G → ${String(prop).padStart(3)}G (${Number(d) > 0 ? '+' : ''}${d}%)`);
    }

    // 제안 곡선에서 동일 골드 보드를 다시 구성해 대전
    setBalanceOverrides({ costCurve: { exponent: EXP, k: K } });
    const bstForNew = (n: number) => 600 * Math.pow((GOLD / n) / K, 1 / EXP);
    const R = Number(process.env.SIM_GOLD_ROSTERS ?? 4);
    const newGroups: Array<{ n: number; bst: number; boards: BuiltBoard[] }> = [];
    for (const n of [6, 5, 4, 3]) {
      const target = Math.round(bstForNew(n));
      if (target > 700 || target < 150) { console.log(`  (N=${n}: 목표BST ${target} 범위 밖, 건너뜀)`); continue; }
      const rosters = await pickRosters(table, n, target, R);
      if (rosters.length === 0) { console.log(`  (N=${n}: 후보 부족)`); continue; }
      const boards: BuiltBoard[] = [];
      for (let i = 0; i < rosters.length; i++) boards.push(await boardOf(`p${n}_${i}`, rosters[i]));
      newGroups.push({ n, bst: target, boards });
      const gold = Math.round(boards.reduce((s, b) => s + buyGold(b), 0) / boards.length);
      console.log(
        `  p${n}: 목표BST ${target} · 평균구매 ${gold}G · 로스터 ${boards.length}종` +
        ` · 이론전력 ${(modelPower(n, target) / 1e9).toFixed(2)}e9`
      );
    }

    const abRows: string[][] = [];
    for (let i = 0; i < newGroups.length; i++) {
      for (let j = i + 1; j < newGroups.length; j++) {
        const A = newGroups[i], B = newGroups[j];
        const d = avgDuel(A.boards, B.boards);
        const ratio = modelPower(A.n, A.bst) / modelPower(B.n, B.bst);
        abRows.push([`p${A.n} vs p${B.n}`, ratio.toFixed(2), pct(d.arena), pct(d.svc), String(d.pairs)]);
        console.log(
          `  p${A.n} vs p${B.n}: 이론전력비 ${ratio.toFixed(2)}` +
          ` → arena ${pct(d.arena)} / service ${pct(d.svc)} (조합 ${d.pairs})`
        );
      }
    }
    setBalanceOverrides({});

    let md = `\n## 제안 곡선 A/B (α=${EXP}, k=${K})\n\n`;
    md += mdTable(['BST', '현재가', '제안가', '변화'], priceRows);
    md += `\n### 제안 곡선에서 동일 골드 대전\n\n`;
    md += mdTable(['매치업', '이론전력비(N²b³)', 'arena', 'service', '조합 수'], abRows);
    writeReport('gold-value-ab', md);
    writeMetrics('gold-value-ab', { exponent: EXP, k: K, priceRows, abRows });

    expect(newGroups.length).toBeGreaterThanOrEqual(3);
  });

  // ── D. 승률이 전력차에 얼마나 민감한가 (S곡선 기울기) ──────────────────────
  // 이론: 집중포화 + 데미지∝공/방 이면 A가 이기는 조건은 N_A²·b_A³ > N_B²·b_B³ 이다.
  //   (A가 B를 지우는 시간 T_A = N_B·b_B²/(N_A·b_A), 반대도 대칭 → 교차정리)
  //   실측 등가점 6@275 ≈ 3@438 을 이 식에 넣으면 275·2^(2/3)=437 로 정확히 맞는다.
  // 그렇다면 공정 가격은 cost ∝ b^1.5 인데, 그 곡선으로도 등가가 안 됐다(위 C).
  // 남은 설명: 승률이 전력비의 **계단함수**라서 1~2% 우위가 곧 100% 승률이 된다는 것.
  // 유닛 수를 양쪽 6으로 고정해 '수량' 축을 제거하고, BST만 흔들어 기울기를 직접 잰다.
  it('전력차 → 승률 민감도 (같은 유닛 수, BST만 변화, 로스터 다표본 평균)', async () => {
    const table = await bstTable();
    const BASE = 275;
    const K = Number(process.env.SIM_GOLD_ROSTERS ?? 5);

    // 기준 로스터 K개(서로 겹치지 않는 종 구성) — 특정 조합의 상성 운을 평균으로 지운다
    const baseRosters = await pickRosters(table, 6, BASE, K);
    const baseBoards: BuiltBoard[] = [];
    for (let i = 0; i < baseRosters.length; i++) baseBoards.push(await boardOf(`base${i}`, baseRosters[i]));
    console.log(`\n  기준: 6마리 BST≈${BASE}, 로스터 ${baseBoards.length}종 (평균 ${Math.round(baseBoards.reduce((s, b) => s + buyGold(b), 0) / baseBoards.length)}G)`);

    const rows: string[][] = [];
    for (const bst of [230, 250, 265, 275, 285, 300, 330]) {
      const rosters = await pickRosters(table, 6, bst, K);
      if (rosters.length === 0) continue;
      const boards: BuiltBoard[] = [];
      for (let i = 0; i < rosters.length; i++) boards.push(await boardOf(`c${bst}_${i}`, rosters[i]));

      // 모든 (후보 로스터 × 기준 로스터) 조합을 양방향으로 → 로스터 노이즈 평균
      let arenaSum = 0, svcSum = 0, pairs = 0;
      for (const c of boards) for (const b of baseBoards) {
        const d = duel(c, b);
        arenaSum += d.arena; svcSum += d.svc; pairs++;
      }
      const arena = arenaSum / pairs, svc = svcSum / pairs;
      const gold = Math.round(boards.reduce((s, b) => s + buyGold(b), 0) / boards.length);
      const powerRatio = Math.pow(bst / BASE, 3);
      rows.push([String(bst), `${gold}G`, powerRatio.toFixed(3), pct(arena), pct(svc), String(pairs)]);
      console.log(
        `    BST ${String(bst).padStart(3)} (${gold}G): 전력비 ${powerRatio.toFixed(3)}` +
        ` → arena ${pct(arena)} / service ${pct(svc)}  (조합 ${pairs})`
      );
    }

    let md = `\n## 전력차 → 승률 민감도 (유닛 수 6 고정)\n\n`;
    md += `기준 보드: 6마리 BST≈${BASE}. 전력비 = (BST/${BASE})³ (집중포화 모델).\n\n`;
    md += mdTable(['BST', '구매골드(평균)', '전력비', 'arena 승률', 'service 승률', '조합 수'], rows);
    md += `\n> 전력비가 1 근처에서 승률이 0%↔100%로 급변하면, 골드 가격표를 어떻게 고쳐도\n`;
    md += `> "비슷한 전력이면 비슷한 승률"이 성립하지 않는다 = 가격 문제가 아니라 엔진 문제.\n`;
    writeReport('gold-value-sensitivity', md);
    writeMetrics('gold-value-sensitivity', { base: BASE, rows });

    expect(rows.length).toBeGreaterThan(3);
  });
});
