// sim/pvp/placement.sim.ts
// P0b — 아레나 배치 민감도 측정 (인간전 엔진)
// 질문: "prep 30초 배치가 승패를 얼마나 가르나?" (개발자: 키우고 싶은데 현재 유의미하지 않은 듯)
//
// 방법: 대표 매치업마다
//   1) 무작위 배치 N가지 × 시드 M → 승률 분포. max-min은 노이즈에 끌려가므로
//      이항 표본분산을 뺀 "노이즈 보정 σ"를 배치 민감도로 쓴다.
//   2) 역할 배치(탱커 전열) vs 역배치(딜러 전열) → 휴리스틱 효과 크기
// 실행: npm run sim:placement

import { describe, it, expect } from 'vitest';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { buildAllBoards } from './boards';
import {
  runArenaBattle, randomPlacements, roleBasedPlacements, defaultPlacements,
} from './arenaRunner';
import { writeReport, writeMetrics, mdTable, pct, fx } from '../support/report';

const RANDOM_PLACEMENTS = Number(process.env.SIM_PLACEMENTS ?? 60);
/**
 * [표본] 예전 값은 12였다. 배치당 12판이면 승률 오차가 ±28%p라서, 배치가 승률에 **전혀**
 * 영향이 없다고 가정해도 60개 배치의 max-min이 평균 64.6%p 나온다(귀무모형 시뮬).
 * 실제 측정값이 66.7%였으니 이 지표는 배치 민감도가 아니라 표본 노이즈를 재고 있었다.
 * 100판이면 노이즈 스프레드가 23%p로 내려가고, 아래 '노이즈 보정 σ'가 신호만 남긴다.
 */
const SEEDS = Number(process.env.SIM_PLACEMENT_SEEDS ?? 100);
/**
 * 역할배치 비교는 매치업당 배치 2종만 돌리므로(무작위 60종과 달리) 표본을 크게 써도 싸다.
 * 100판이면 두 비율 차의 오차가 ±13.9%p라 한 자릿수 효과를 판정할 수 없다 → 800판(±4.9%p).
 */
const ROLE_SEEDS = Number(process.env.SIM_ROLE_SEEDS ?? 800);

/** 귀무모형(배치 무영향) 하에서 기대되는 max-min — 측정값을 이 값과 비교해야 의미가 있다. */
function nullSpread(k: number, n: number, p = 0.5): number {
  // 순서통계 근사: 표준편차 σ=√(p(1-p)/n) 인 정규분포 k개의 기대 범위 ≈ σ · 2·Φ⁻¹((k-0.375)/(k+0.25))
  const sigma = Math.sqrt((p * (1 - p)) / n);
  const q = (k - 0.375) / (k + 0.25);
  // Φ⁻¹ 근사 (Beasley-Springer-Moro 간이형)
  const t = Math.sqrt(-2 * Math.log(1 - q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
    (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return 2 * z * sigma;
}

const MATCHUPS: Array<[string, string]> = [
  ['water6', 'nosyn6'],
  ['tank6', 'expensive3'],
  ['gen1x6', 'mid4'],
  ['nosyn6', 'tank6'],
];

describe('P0b: 아레나 배치 민감도', () => {
  it('무작위 배치 분포 + 역할배치 효과', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const byName = Object.fromEntries(boards.map(b => [b.name, b]));

    interface Row {
      matchup: string;
      baseline: number;
      randMean: number; randMin: number; randMax: number; randStd: number; randStdTrue: number;
      rolePlace: number; invertPlace: number; roleDelta: number;
    }
    const rows: Row[] = [];

    for (const [aName, bName] of MATCHUPS) {
      const A = byName[aName]; const B = byName[bName];

      const playWithPlacement = (
        place: ReturnType<typeof randomPlacements> | undefined,
        seedOffset: number,
        n: number = SEEDS,
      ) => {
        let wins = 0;
        for (let s = 0; s < n; s++) {
          const out = runArenaBattle(A.details, B.details, 777_000 + seedOffset * 1000 + s, {
            myPlacements: place,
          });
          if (out.myWon) wins++;
        }
        return wins / n;
      };

      // 1) 기본 지그재그 배치
      const baseline = playWithPlacement(undefined, 0);

      // 2) 무작위 배치 분포
      const placeRng = mulberry32(4242 + aName.length * 31 + bName.length);
      const randRates: number[] = [];
      for (let p = 0; p < RANDOM_PLACEMENTS; p++) {
        const place = randomPlacements(Math.min(6, A.details.length), 'L', placeRng);
        randRates.push(playWithPlacement(place, p + 1));
      }
      const mean = randRates.reduce((s, x) => s + x, 0) / randRates.length;
      const std = Math.sqrt(randRates.reduce((s, x) => s + (x - mean) ** 2, 0) / randRates.length);

      // ── 노이즈 보정 ─────────────────────────────────────────────────────
      // 관측 분산 = 배치에 의한 진짜 분산 + 이항 표본 분산.
      // 뒤엣것을 빼야 "배치를 바꾸면 승률이 실제로 얼마나 흔들리나"가 남는다.
      const varObs = std * std;
      const varNoise = randRates.reduce((s, p) => s + (p * (1 - p)) / SEEDS, 0) / randRates.length;
      const stdTrue = Math.sqrt(Math.max(0, varObs - varNoise));

      // 3) 역할 배치 vs 역배치
      const rolePlace = playWithPlacement(roleBasedPlacements(A.details, 'L', false), 900, ROLE_SEEDS);
      const invertPlace = playWithPlacement(roleBasedPlacements(A.details, 'L', true), 901, ROLE_SEEDS);

      rows.push({
        matchup: `${aName} vs ${bName}`,
        baseline,
        randMean: mean,
        randMin: Math.min(...randRates),
        randMax: Math.max(...randRates),
        randStd: std,
        randStdTrue: stdTrue,
        rolePlace,
        invertPlace,
        roleDelta: rolePlace - invertPlace,
      });
      console.log(
        `[placement] ${aName} vs ${bName}: 기본 ${pct(baseline)}, 무작위 ${pct(mean)} ` +
        `(관측σ ${fx(std * 100, 1)}%p → 노이즈보정σ ${fx(stdTrue * 100, 1)}%p), ` +
        `역할배치효과 ${fx((rolePlace - invertPlace) * 100, 1)}±${fx(1.96 * Math.sqrt(2 * 0.25 / ROLE_SEEDS) * 100, 1)}%p (n=${ROLE_SEEDS})`
      );
    }

    // 종합 민감도. max−min은 극값 통계라 표본 노이즈에 그대로 끌려간다 → 참고용으로만 두고,
    // 헤드라인은 노이즈 보정 σ로 본다.
    const avgSpread = rows.reduce((s, r) => s + (r.randMax - r.randMin), 0) / rows.length;
    const avgStdTrue = rows.reduce((s, r) => s + r.randStdTrue, 0) / rows.length;
    const avgRoleDelta = rows.reduce((s, r) => s + Math.abs(r.roleDelta), 0) / rows.length;
    const expectedNullSpread = nullSpread(RANDOM_PLACEMENTS, SEEDS);
    const roleCI = 1.96 * Math.sqrt((2 * 0.25) / ROLE_SEEDS); // 두 비율 차의 95% 오차

    let md = `# 아레나 배치 민감도 (인간전 엔진 arenaSim)\n\n`;
    md += `- 매치업당 무작위 배치 ${RANDOM_PLACEMENTS}가지 × 시드 ${SEEDS} — 상대는 기본 지그재그 고정\n`;
    md += `- **배치 민감도** = 배치를 바꿨을 때 승률이 실제로 흔들리는 폭.\n`;
    md += `- **역할배치 효과** = (탱커 전열) − (딜러 전열) 승률 차.\n\n`;
    md += `> ⚠️ **max−min은 배치 민감도가 아니다.** 극값 통계라 표본 노이즈를 그대로 증폭한다.\n`;
    md += `> 배치가 승률에 **전혀** 영향이 없다고 가정해도 배치 ${RANDOM_PLACEMENTS}개를 시드 ${SEEDS}로 재면\n`;
    md += `> max−min이 평균 **${fx(expectedNullSpread * 100, 1)}%p** 나온다(귀무모형). 예전 설정(시드 12)의\n`;
    md += `> 귀무 기대값은 64.6%p였고 측정값이 66.7%였다 — 즉 그 지표는 노이즈만 재고 있었다.\n`;
    md += `> 그래서 헤드라인을 **노이즈 보정 σ**(관측분산에서 이항 표본분산을 뺀 값)로 바꿨다.\n\n`;
    md += mdTable(
      ['매치업', '기본배치', '무작위 평균', 'min~max(참고)', '관측σ', '보정σ', '탱커전열', '딜러전열', '역할효과'],
      rows.map(r => [
        r.matchup, pct(r.baseline), pct(r.randMean),
        `${pct(r.randMin)}~${pct(r.randMax)}`,
        `${fx(r.randStd * 100, 1)}%p`, `**${fx(r.randStdTrue * 100, 1)}%p**`,
        pct(r.rolePlace), pct(r.invertPlace), `${fx(r.roleDelta * 100, 1)}%p`,
      ])
    );
    md += `\n## 종합\n\n`;
    md += `- **평균 배치 민감도(노이즈 보정 σ): ${fx(avgStdTrue * 100, 1)}%p**\n`;
    md += `- 평균 역할배치 효과: **${fx(avgRoleDelta * 100, 1)}%p** (판정 오차 ±${fx(roleCI * 100, 1)}%p)\n`;
    md += `- 참고 — 평균 max−min: ${fx(avgSpread * 100, 1)}%p (귀무 기대 ${fx(expectedNullSpread * 100, 1)}%p)\n`;
    md += `\n> 개발자 의향: 배치 영향력을 키우고 싶음. 보정 σ가 한 자릿수 %p면\n`;
    md += `> 배치는 사실상 장식 — 이동속도·사거리·어그로 규칙이 레버.\n`;
    md += `> 역할효과도 판정 오차보다 작으면 "효과 없음"이 아니라 "이 표본으로는 판정 불가"다.\n`;

    writeReport('arena-placement', md);
    writeMetrics('arena-placement', {
      randomPlacements: RANDOM_PLACEMENTS, seeds: SEEDS,
      rows, avgSpread, avgStdTrue, avgRoleDelta,
      expectedNullSpread, roleDeltaCI: roleCI,
    });

    console.log(
      `[placement] 종합: 배치 민감도(보정σ) ${fx(avgStdTrue * 100, 1)}%p, ` +
      `역할효과 ${fx(avgRoleDelta * 100, 1)}±${fx(roleCI * 100, 1)}%p, ` +
      `max-min ${fx(avgSpread * 100, 1)}%p (귀무 ${fx(expectedNullSpread * 100, 1)}%p)`
    );

    expect(rows.length).toBe(MATCHUPS.length);
  });
});
