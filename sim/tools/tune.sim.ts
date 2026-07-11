// sim/tools/tune.sim.ts
// Phase B — 봇 노브 자동 튜닝 (힐클라임). 목표: 오라클 강화(사다리 상단 클리어율 최대).
//
// 실행: SIM_TUNE=1 npm run sim:tune
//   SIM_TUNE_ITERS(기본 16) × 판수(맵2 × 페르소나2 × 시드 SIM_TUNE_SEEDS(4)) — 약 20~40분
//   결과: sim/reports/current/tune.md + 콘솔에 최적 노브
//
// 방법론(조사 근거): 휴리스틱 봇의 상수는 손튜닝보다 블랙박스 탐색이 낫다
// (Unreal Tournament 봇 EA 튜닝, Co-CMA-ES 등). 여기선 이웃 랜덤 스텝 힐클라임.

import { describe, it, expect } from 'vitest';
import { runSingleGame } from '../single/runner';
import { PERSONAS, setGlobalKnobs, knobsForSkill, SkillKnobs } from '../single/botPolicies';
import { writeReport, mdTable, pct } from '../support/report';
import { mulberry32 } from '../../src/utils/rng';

const ITERS = Number(process.env.SIM_TUNE_ITERS ?? 16);
const SEEDS = Number(process.env.SIM_TUNE_SEEDS ?? 4);
const MAPS = (process.env.SIM_TUNE_MAPS ?? 'easiest_straight,easy_loop').split(',');
const PERSONA_NAMES = (process.env.SIM_TUNE_PERSONAS ?? 'holdout,reroller').split(',');
const MAX_WAVES = Number(process.env.SIM_MAX_WAVES ?? 50);

// 탐색 공간: 노브별 후보값 (현 오라클 기본값 주변)
const SPACE: Record<string, number[]> = {
  safeWave: [5, 8, 12, 16],
  careThreshold: [0.35, 0.5, 0.65],
  careTopUp: [0.6, 0.7, 0.85],
  candyReserve: [80, 150, 300],
  rebuildMargin: [60, 100, 160],
  rebuildEntries: [4, 6, 10],
  openingBar: [420, 500, 560],
  openingEntries: [8, 10, 14],
  albaStartWave: [10, 12, 16, 99], // 99 = 사실상 알바 금지
};

interface Config { [k: string]: number }

async function evaluate(cfg: Config): Promise<{ score: number; detail: string }> {
  setGlobalKnobs(cfg as Partial<SkillKnobs>);
  let clears = 0, waves = 0, games = 0;
  const perMap: Record<string, { c: number; n: number }> = {};
  for (const mapId of MAPS) {
    perMap[mapId] = { c: 0, n: 0 };
    for (const personaName of PERSONA_NAMES) {
      for (let s = 0; s < SEEDS; s++) {
        const r = await runSingleGame({
          seed: 100_000 + s * 7919,
          policy: PERSONAS[personaName](),
          mapId,
          difficulty: 'medium' as any,
          maxWaves: MAX_WAVES,
        });
        games++;
        waves += r.wavesCleared;
        if (r.victory) { clears++; perMap[mapId].c++; }
        perMap[mapId].n++;
      }
    }
  }
  setGlobalKnobs({});
  // 목표: 클리어 최우선(×100), 도달 웨이브 보조(진행 신호)
  const score = (clears / games) * 100 + waves / games;
  const detail = MAPS.map(m => `${m}:${pct(perMap[m].c / perMap[m].n, 0)}`).join(' ');
  return { score, detail };
}

describe.skipIf(!process.env.SIM_TUNE)('Phase B: 노브 힐클라임', () => {
  it(`${ITERS}회 반복 × ${MAPS.length}맵 × ${PERSONA_NAMES.length}페르소나 × ${SEEDS}시드`, async () => {
    const rand = mulberry32(777);
    const keys = Object.keys(SPACE);
    const oracle = knobsForSkill(1);

    // 시작점 = 현 오라클 기본값 (SPACE에 있는 키만)
    let best: Config = {};
    for (const k of keys) {
      const cur = (oracle as any)[k] as number;
      // SPACE 후보 중 기본값에 가장 가까운 값으로 스냅
      best[k] = SPACE[k].reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a);
    }

    const t0 = Date.now();
    let bestEval = await evaluate(best);
    console.log(`[tune] 시작점 score ${bestEval.score.toFixed(1)} (${bestEval.detail}) — ${JSON.stringify(best)}`);

    const history: Array<{ iter: number; score: number; detail: string; cfg: Config; accepted: boolean }> = [
      { iter: 0, score: bestEval.score, detail: bestEval.detail, cfg: { ...best }, accepted: true },
    ];

    for (let i = 1; i <= ITERS; i++) {
      // 이웃: 노브 1~2개를 무작위로 다른 후보값으로
      const cand: Config = { ...best };
      const nMut = 1 + Math.floor(rand() * 2);
      for (let m = 0; m < nMut; m++) {
        const k = keys[Math.floor(rand() * keys.length)];
        const options = SPACE[k].filter(v => v !== cand[k]);
        cand[k] = options[Math.floor(rand() * options.length)];
      }

      const ev = await evaluate(cand);
      const accepted = ev.score > bestEval.score;
      if (accepted) { best = cand; bestEval = ev; }
      history.push({ iter: i, score: ev.score, detail: ev.detail, cfg: { ...cand }, accepted });
      console.log(
        `[tune] #${i}/${ITERS} score ${ev.score.toFixed(1)} (${ev.detail})` +
        `${accepted ? ' ✅ 채택' : ''} — 변이 ${JSON.stringify(cand)} (누적 ${Math.round((Date.now() - t0) / 60000)}분)`
      );
    }

    console.log(`[tune] 최종 최적: score ${bestEval.score.toFixed(1)} (${bestEval.detail})`);
    console.log(`[tune] 노브: ${JSON.stringify(best, null, 2)}`);

    let md = `# 노브 힐클라임 결과\n\n`;
    md += `- 대상: ${MAPS.join(', ')} × ${PERSONA_NAMES.join(', ')} × 시드 ${SEEDS} × ${ITERS}회\n`;
    md += `- 최적 score: ${bestEval.score.toFixed(1)} (${bestEval.detail})\n\n`;
    md += `## 최적 노브\n\n\`\`\`json\n${JSON.stringify(best, null, 2)}\n\`\`\`\n\n`;
    md += `## 이력\n\n`;
    md += mdTable(
      ['#', 'score', '맵별 클리어', '채택', '설정'],
      history.map(h => [h.iter, h.score.toFixed(1), h.detail, h.accepted ? '✅' : '—', JSON.stringify(h.cfg)])
    );
    writeReport('tune', md);

    expect(bestEval.score).toBeGreaterThan(0);
  }, 3_600_000);
});
