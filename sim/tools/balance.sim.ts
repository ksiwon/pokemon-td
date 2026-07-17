// sim/tools/balance.sim.ts
// Phase C — 밸런스 실험 A/B (setBalanceOverrides 주입, 실코드 수치 무손상).
// [[balance-compare-before-change]] 원칙: 여기서 나온 비교표를 보고 개발자가 결정한다.
//
// 실행: SIM_BALANCE=1 npm run sim:balance  (SIM_BAL_EXP로 실험 선택, 기본 cliff)
//   cliff — 난이도 절벽: easy→medium 배율 0.55→0.7 사이 중간 눈금이 medium을
//           목표(30%)에 근접시키는지. easy 하향(0.50)도 함께.
//   xp    — 킬 XP 분할: 전원+10 → 머릿수 분할. "조기 6마리 과보상" 구조 실험.
//   candy — 사탕 단가 25→35/50: 사탕 의존(전략 지배력)이 줄어드는지.
//
// 기준선(2026-07-14 확정 사다리, 같은 시드 100k대 16개 × 4페르소나 — 결정론 직접 비교):
//   easiest 100% / easy 52%(목표 70) / medium 6%(목표 30) / hard 0%(목표 10) / extreme 0%

import { describe, it, expect } from 'vitest';
import { runSingleGame } from '../single/runner';
import { PERSONAS } from '../single/botPolicies';
import { setBalanceOverrides, BalanceOverrides } from '../../src/game/balanceOverrides';
import { writeReport, mdTable, pct } from '../support/report';

const EXP = process.env.SIM_BAL_EXP ?? 'cliff';
const SEEDS = Number(process.env.SIM_BAL_SEEDS ?? 16);
const PERSONA_NAMES = (process.env.SIM_BAL_PERSONAS ?? 'holdout,reroller,worker,tera').split(',');
const MAX_WAVES = Number(process.env.SIM_MAX_WAVES ?? 50);

interface Trial {
  name: string;
  mapId: string;
  overrides: BalanceOverrides;
  /** 같은 시드·페르소나 기준선 (확정 사다리) */
  baselineClear: number;
  target: number;
}

const EXPERIMENTS: Record<string, Trial[]> = {
  cliff: [
    { name: 'medium 0.66', mapId: 'medium_merge', overrides: { difficultyMult: { medium: 0.66 } }, baselineClear: 0.06, target: 0.30 },
    { name: 'medium 0.62', mapId: 'medium_merge', overrides: { difficultyMult: { medium: 0.62 } }, baselineClear: 0.06, target: 0.30 },
    { name: 'easy 0.50', mapId: 'easy_loop', overrides: { difficultyMult: { easy: 0.5 } }, baselineClear: 0.52, target: 0.70 },
  ],
  xp: [
    { name: 'XP 머릿수 분할 (easy)', mapId: 'easy_loop', overrides: { xpSplit: true }, baselineClear: 0.52, target: 0.70 },
    { name: 'XP 머릿수 분할 (medium)', mapId: 'medium_merge', overrides: { xpSplit: true }, baselineClear: 0.06, target: 0.30 },
  ],
  candy: [
    { name: '사탕 단가 35 (easy)', mapId: 'easy_loop', overrides: { candyCostPerLevel: 35 }, baselineClear: 0.52, target: 0.70 },
    { name: '사탕 단가 50 (easy)', mapId: 'easy_loop', overrides: { candyCostPerLevel: 50 }, baselineClear: 0.52, target: 0.70 },
  ],
};

describe.skipIf(!process.env.SIM_BALANCE)(`Phase C: 밸런스 실험 [${EXP}]`, () => {
  it(`${EXP} × 페르소나 ${PERSONA_NAMES.length} × 시드 ${SEEDS}`, async () => {
    const trials = EXPERIMENTS[EXP];
    expect(trials, `알 수 없는 실험: ${EXP}`).toBeTruthy();

    const rows: Array<{ name: string; clear: number; p50: number; baseline: number; target: number }> = [];
    const t0 = Date.now();

    for (const trial of trials) {
      setBalanceOverrides(trial.overrides);
      let clears = 0;
      const waves: number[] = [];
      for (const personaName of PERSONA_NAMES) {
        for (let s = 0; s < SEEDS; s++) {
          const r = await runSingleGame({
            seed: 100_000 + s * 7919, // 확정 사다리와 동일 시드 — 결정론 직접 비교
            policy: PERSONAS[personaName](),
            mapId: trial.mapId,
            difficulty: 'medium' as any,
            maxWaves: MAX_WAVES,
          });
          waves.push(r.wavesCleared);
          if (r.victory) clears++;
        }
      }
      setBalanceOverrides({});
      const n = waves.length;
      const p50 = [...waves].sort((a, b) => a - b)[Math.floor(n / 2)];
      rows.push({ name: trial.name, clear: clears / n, p50, baseline: trial.baselineClear, target: trial.target });
      console.log(
        `[balance] ${trial.name}: 클리어 ${pct(clears / n, 0)} (기준선 ${pct(trial.baselineClear, 0)}` +
        ` → 목표 ${pct(trial.target, 0)}) p50 ${p50} (누적 ${Math.round((Date.now() - t0) / 60000)}분)`
      );
    }

    let md = `# 밸런스 실험 [${EXP}] — 비교표\n\n`;
    md += `- ${PERSONA_NAMES.join(', ')} × 시드 ${SEEDS} (확정 사다리와 동일 시드 — 직접 비교)\n\n`;
    md += mdTable(
      ['실험', '클리어율', '기준선', 'Δ', '목표', 'p50'],
      rows.map(r => [
        r.name, pct(r.clear, 0), pct(r.baseline, 0),
        `${r.clear - r.baseline >= 0 ? '+' : ''}${Math.round((r.clear - r.baseline) * 100)}%p`,
        pct(r.target, 0), r.p50,
      ])
    );
    writeReport(`balance-${EXP}`, md);

    expect(rows.length).toBeGreaterThan(0);
  }, 7_200_000);
});
