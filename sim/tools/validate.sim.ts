// sim/tools/validate.sim.ts
// Phase B' — 튜닝 결과 검증 A/B/C. SA 최적 노브(tune.md)가 과적합인지 판정한다.
//   - 신규 시드(튜닝에 안 쓴 500k대)로 일반화 검증
//   - 튜닝에 없던 medium_merge 포함 — 사다리 하단 회귀 감지
//   - C안(알바 복원)으로 albaStartWave=99의 기여를 단독 분리
//
// 실행: SIM_VALIDATE=1 npm run sim:validate
//   SIM_VAL_SEEDS(기본 8) × 맵3 × 페르소나2 × 설정3 — 약 30~40분
// 산출: sim/reports/current/validate.md

import { describe, it, expect } from 'vitest';
import { runSingleGame } from '../single/runner';
import { PERSONAS, setGlobalKnobs, SkillKnobs } from '../single/botPolicies';
import { writeReport, mdTable, pct } from '../support/report';

const SEEDS = Number(process.env.SIM_VAL_SEEDS ?? 8);
const MAPS = (process.env.SIM_VAL_MAPS ?? 'easiest_straight,easy_loop,medium_merge').split(',');
const PERSONA_NAMES = (process.env.SIM_VAL_PERSONAS ?? 'holdout,reroller').split(',');
const MAX_WAVES = Number(process.env.SIM_MAX_WAVES ?? 50);

// 판정 이력 (신규시드 패널, baseline 83.2 기준 — 전부 기각):
//   SA v1(4시드) 75.6 / SA v2(8시드) 77.4 — 과적합
//   human-meta(오프닝3·w10 6마리·사탕절제) 75.7, 절제: opening3 76.8 /
//   body6w10 69.4(easy 56→19% 붕괴) / candy-light 76.4 — 폐기(2026-07-14).
//   부산물 시그널: 게임 구조가 조기 6마리(전원 킬XP +10)·사탕(+5% 복리)을 과보상.
//
// 사용법: 새 후보 노브를 CONFIGS에 추가해 baseline과 A/B — 이기기 전엔 기본값 반영 금지.
const CONFIGS: Record<string, Partial<SkillKnobs>> = {
  baseline: {}, // 현 knobsForSkill 기본값
};

describe.skipIf(!process.env.SIM_VALIDATE)("Phase B': 튜닝 검증 A/B/C", () => {
  it(`설정 ${Object.keys(CONFIGS).length} × 맵 ${MAPS.length} × 페르소나 ${PERSONA_NAMES.length} × 신규시드 ${SEEDS}`, async () => {
    interface Cell { clears: number; waves: number[]; n: number }
    const results: Record<string, Record<string, Cell>> = {};
    const t0 = Date.now();

    for (const [name, cfg] of Object.entries(CONFIGS)) {
      results[name] = {};
      setGlobalKnobs(cfg);
      for (const mapId of MAPS) {
        const cell: Cell = { clears: 0, waves: [], n: 0 };
        results[name][mapId] = cell;
        for (const personaName of PERSONA_NAMES) {
          for (let s = 0; s < SEEDS; s++) {
            const r = await runSingleGame({
              seed: 500_000 + s * 7919, // 튜닝(100k대)에 안 쓴 시드 — 일반화 검증
              policy: PERSONAS[personaName](),
              mapId,
              difficulty: 'medium' as any,
              maxWaves: MAX_WAVES,
            });
            cell.n++;
            cell.waves.push(r.wavesCleared);
            if (r.victory) cell.clears++;
          }
        }
        console.log(
          `[validate] ${name}/${mapId}: 클리어 ${pct(cell.clears / cell.n, 0)} ` +
          `p50 ${[...cell.waves].sort((a, b) => a - b)[Math.floor(cell.waves.length / 2)]} ` +
          `(누적 ${Math.round((Date.now() - t0) / 60000)}분)`
        );
      }
      setGlobalKnobs({});
    }

    // 종합 score (tune과 동일 정의: 클리어율×100 + 평균 웨이브)
    const scoreOf = (name: string) => {
      let clears = 0, waves = 0, n = 0;
      for (const mapId of MAPS) {
        const c = results[name][mapId];
        clears += c.clears; n += c.n;
        waves += c.waves.reduce((s, w) => s + w, 0);
      }
      return (clears / n) * 100 + waves / n;
    };

    let md = `# 튜닝 검증 A/B/C (신규 시드 ${SEEDS})\n\n`;
    md += `- 맵: ${MAPS.join(', ')} × ${PERSONA_NAMES.join(', ')} — 시드 500k대(튜닝 미사용)\n`;
    md += `- 설정: ${Object.entries(CONFIGS).map(([n, c]) => `${n}=${JSON.stringify(c)}`).join(' / ')}\n\n`;
    md += mdTable(
      ['설정', 'score', ...MAPS],
      Object.keys(CONFIGS).map(name => [
        name, scoreOf(name).toFixed(1),
        ...MAPS.map(m => {
          const c = results[name][m];
          const p50 = [...c.waves].sort((a, b) => a - b)[Math.floor(c.waves.length / 2)];
          return `${pct(c.clears / c.n, 0)} (p50 ${p50})`;
        }),
      ])
    );
    writeReport('validate', md);
    for (const name of Object.keys(CONFIGS)) {
      console.log(`[validate] ${name}: score ${scoreOf(name).toFixed(1)}`);
    }

    expect(Object.keys(results).length).toBe(Object.keys(CONFIGS).length);
  }, 7_200_000);
});
