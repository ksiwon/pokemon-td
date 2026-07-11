// sim/pvp/placement.sim.ts
// P0b — 아레나 배치 민감도 측정 (인간전 엔진)
// 질문: "prep 30초 배치가 승패를 얼마나 가르나?" (개발자: 키우고 싶은데 현재 유의미하지 않은 듯)
//
// 방법: 대표 매치업마다
//   1) 무작위 배치 60가지 × 시드 12 → 승률 분포(min/max/표준편차) = 배치 민감도
//   2) 역할 배치(탱커 전열) vs 역배치(딜러 전열) → 휴리스틱 효과 크기
// 실행: npm run sim:placement

import { describe, it, expect } from 'vitest';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { buildAllBoards } from './boards';
import {
  runArenaBattle, randomPlacements, roleBasedPlacements, defaultPlacements,
} from './arenaRunner';
import { writeReport, writeMetrics, mdTable, pct, fx } from '../support/report';

const RANDOM_PLACEMENTS = 60;
const SEEDS = 12;

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
      randMean: number; randMin: number; randMax: number; randStd: number;
      rolePlace: number; invertPlace: number; roleDelta: number;
    }
    const rows: Row[] = [];

    for (const [aName, bName] of MATCHUPS) {
      const A = byName[aName]; const B = byName[bName];

      const playWithPlacement = (place: ReturnType<typeof randomPlacements> | undefined, seedOffset: number) => {
        let wins = 0;
        for (let s = 0; s < SEEDS; s++) {
          const out = runArenaBattle(A.details, B.details, 777_000 + seedOffset * 1000 + s, {
            myPlacements: place,
          });
          if (out.myWon) wins++;
        }
        return wins / SEEDS;
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

      // 3) 역할 배치 vs 역배치
      const rolePlace = playWithPlacement(roleBasedPlacements(A.details, 'L', false), 900);
      const invertPlace = playWithPlacement(roleBasedPlacements(A.details, 'L', true), 901);

      rows.push({
        matchup: `${aName} vs ${bName}`,
        baseline,
        randMean: mean,
        randMin: Math.min(...randRates),
        randMax: Math.max(...randRates),
        randStd: std,
        rolePlace,
        invertPlace,
        roleDelta: rolePlace - invertPlace,
      });
      console.log(`[placement] ${aName} vs ${bName}: 기본 ${pct(baseline)}, 무작위 ${pct(mean)}±${fx(std * 100, 1)}%p (${pct(Math.min(...randRates))}~${pct(Math.max(...randRates))}), 역할배치효과 ${fx((rolePlace - invertPlace) * 100, 1)}%p`);
    }

    // 종합 민감도: 무작위 배치 스프레드(max-min)와 역할배치 효과 평균
    const avgSpread = rows.reduce((s, r) => s + (r.randMax - r.randMin), 0) / rows.length;
    const avgRoleDelta = rows.reduce((s, r) => s + Math.abs(r.roleDelta), 0) / rows.length;

    let md = `# 아레나 배치 민감도 (인간전 엔진 arenaSim)\n\n`;
    md += `- 매치업당 무작위 배치 ${RANDOM_PLACEMENTS}가지 × 시드 ${SEEDS} — 상대는 기본 지그재그 고정\n`;
    md += `- **배치 민감도** = 무작위 배치 간 승률 스프레드. 크면 배치가 승패를 가름.\n`;
    md += `- **역할배치 효과** = (탱커 전열) − (딜러 전열) 승률 차.\n\n`;
    md += mdTable(
      ['매치업', '기본배치', '무작위 평균', '무작위 min~max', '표준편차', '탱커전열', '딜러전열', '역할효과'],
      rows.map(r => [
        r.matchup, pct(r.baseline), pct(r.randMean),
        `${pct(r.randMin)}~${pct(r.randMax)}`, `${fx(r.randStd * 100, 1)}%p`,
        pct(r.rolePlace), pct(r.invertPlace), `${fx(r.roleDelta * 100, 1)}%p`,
      ])
    );
    md += `\n## 종합\n\n`;
    md += `- 평균 배치 스프레드(max−min): **${fx(avgSpread * 100, 1)}%p**\n`;
    md += `- 평균 역할배치 효과: **${fx(avgRoleDelta * 100, 1)}%p**\n`;
    md += `\n> 개발자 의향: 배치 영향력을 키우고 싶음. 스프레드/역할효과가 한 자릿수 %p면\n`;
    md += `> 배치는 사실상 장식 — 이동속도·사거리·어그로 규칙이 레버.\n`;

    writeReport('arena-placement', md);
    writeMetrics('arena-placement', {
      randomPlacements: RANDOM_PLACEMENTS, seeds: SEEDS,
      rows, avgSpread, avgRoleDelta,
    });

    expect(rows.length).toBe(MATCHUPS.length);
  });
});
