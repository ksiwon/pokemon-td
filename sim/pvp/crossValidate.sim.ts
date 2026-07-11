// sim/pvp/crossValidate.sim.ts
// P0c — 두 전투 엔진 교차검증
//   엔진A: PvPBattleService.simulateBattle (AI vs AI 매치, 타임아웃 보충에 사용 — 시너지 미적용)
//   엔진B: arenaSim (인간 참여 매치 — 시너지 적용, 위치/이동 있음)
// 같은 매치에서 어느 정도 결과가 일치하는지 측정 → 멀티 공정성(AI전 vs 인간전) 정량화.
// 실행: npm run sim:cross

import { describe, it, expect } from 'vitest';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { buildAllBoards } from './boards';
import { runArenaBattle } from './arenaRunner';
import { writeReport, writeMetrics, mdTable, pct } from '../support/report';

const SEEDS = 20;

describe('P0c: 엔진 교차검증 (PvPBattleService vs arenaSim)', () => {
  it('보드 전쌍 × 시드 20 — 승자 일치율', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const n = boards.length;

    interface PairRow {
      pair: string;
      svcWinA: number;    // 엔진A에서 앞쪽 보드 승률
      arenaWinA: number;  // 엔진B에서 앞쪽 보드 승률
      agreement: number;  // 시드별 승자 일치율
    }
    const rows: PairRow[] = [];
    let agreeSum = 0; let cases = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let svcA = 0, arenaA = 0, agree = 0;
        for (let s = 1; s <= SEEDS; s++) {
          const svc = pvpBattleService.simulateBattle(
            boards[i].details, boards[j].details, 'pA', 'pB', s
          );
          const svcAWin = svc.winnerId === 'pA';

          const arena = runArenaBattle(boards[i].details, boards[j].details, 555_000 + s);
          const arenaAWin = arena.myWon;

          if (svcAWin) svcA++;
          if (arenaAWin) arenaA++;
          if (svcAWin === arenaAWin) agree++;
        }
        rows.push({
          pair: `${boards[i].name} vs ${boards[j].name}`,
          svcWinA: svcA / SEEDS,
          arenaWinA: arenaA / SEEDS,
          agreement: agree / SEEDS,
        });
        agreeSum += agree; cases += SEEDS;
      }
    }

    const overall = agreeSum / cases;
    // 방향 불일치(한 엔진은 A 우세, 다른 엔진은 B 우세)인 쌍
    const flipped = rows.filter(r =>
      (r.svcWinA - 0.5) * (r.arenaWinA - 0.5) < 0 &&
      Math.abs(r.svcWinA - 0.5) > 0.15 && Math.abs(r.arenaWinA - 0.5) > 0.15
    );

    let md = `# 전투 엔진 교차검증\n\n`;
    md += `두 엔진이 실서비스에 공존한다:\n`;
    md += `- **PvPBattleService**: AI vs AI 매치 + 타임아웃 보충. 시너지 버프 미적용, 위치 없음(최저HP 타겟).\n`;
    md += `- **arenaSim**: 인간 참여 매치. 시너지 적용, 6×6 그리드 이동/사거리.\n\n`;
    md += `**전체 승자 일치율: ${pct(overall)}** (시드 ${SEEDS} × ${rows.length}쌍)\n\n`;
    md += `## 쌍별 비교\n\n`;
    md += mdTable(
      ['매치업', 'PvPService 승률(앞보드)', 'Arena 승률(앞보드)', '승자 일치율'],
      rows.map(r => [r.pair, pct(r.svcWinA), pct(r.arenaWinA), pct(r.agreement)])
    );
    md += `\n## 우세 방향이 뒤집히는 쌍 (엔진 드리프트 — 밸런스 공정성 이슈)\n\n`;
    md += flipped.length
      ? mdTable(
          ['매치업', 'PvPService', 'Arena'],
          flipped.map(r => [r.pair, pct(r.svcWinA), pct(r.arenaWinA)])
        )
      : `없음\n`;
    md += `\n> 뒤집히는 쌍이 많으면: 같은 보드로 AI를 만나느냐 사람을 만나느냐에 따라\n`;
    md += `> 승패가 달라진다 = 매칭 운이 밸런스를 좌우. 해소 레버: PvPBattleService에\n`;
    md += `> getBuffedStats(시너지) 적용, 또는 AI 매치도 arenaSim으로 해석.\n`;

    writeReport('engine-cross-validation', md);
    writeMetrics('engine-cross-validation', {
      seeds: SEEDS, overallAgreement: overall,
      flippedPairs: flipped.map(f => f.pair),
      rows,
    });

    console.log(`\n[cross] 전체 일치율 ${pct(overall)}, 방향 뒤집힘 ${flipped.length}/${rows.length}쌍`);
    flipped.forEach(f => console.log(`  FLIP ${f.pair}: svc ${pct(f.svcWinA)} vs arena ${pct(f.arenaWinA)}`));

    expect(rows.length).toBe((n * (n - 1)) / 2);
  });
});
