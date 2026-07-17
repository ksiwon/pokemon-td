// sim/tools/tune.sim.ts
// Phase B — 봇 노브 자동 튜닝 (simulated annealing). 목표: 오라클 강화(사다리 상단 클리어율 최대).
//
// 실행: SIM_TUNE=1 npm run sim:tune
//   SIM_TUNE_ITERS(기본 24) × 판수(맵2 × 페르소나2 × 시드 SIM_TUNE_SEEDS(4)) — 약 30~60분
//   결과: sim/reports/current/tune.md + 콘솔에 최적 노브
//
// 방법론(조사 근거): 휴리스틱 봇의 상수는 손튜닝보다 블랙박스 탐색이 낫다
// (Unreal Tournament 봇 EA 튜닝, Co-CMA-ES 등).
// v1 힐클라임 → v2 simulated annealing: 개선만 수용하는 힐클라임은 국소최적에 갇힘.
// SA는 온도 T에 비례해 악화 스텝도 확률 수용(exp(Δ/T))하며 기하 냉각 —
// 초반엔 넓게 탐사, 후반엔 수렴. best는 별도 추적(수용 여부와 무관하게 최고점 보존).
// 판 시드 고정(common random numbers)으로 설정 간 비교 노이즈 제거.

import { describe, it, expect } from 'vitest';
import { runSingleGame } from '../single/runner';
import { PERSONAS, setGlobalKnobs, knobsForSkill, SkillKnobs } from '../single/botPolicies';
import { writeReport, mdTable, pct } from '../support/report';
import { mulberry32 } from '../../src/utils/rng';

const ITERS = Number(process.env.SIM_TUNE_ITERS ?? 24);
const SEEDS = Number(process.env.SIM_TUNE_SEEDS ?? 4);
const MAPS = (process.env.SIM_TUNE_MAPS ?? 'easiest_straight,easy_loop').split(',');
const PERSONA_NAMES = (process.env.SIM_TUNE_PERSONAS ?? 'holdout,reroller').split(',');
const MAX_WAVES = Number(process.env.SIM_MAX_WAVES ?? 50);

// SA 온도 스케줄 — score 스케일(클리어율×100 + 평균 웨이브)에서 유의미한 Δ는 5~30.
// T0=12: 초반엔 Δ=-8 악화도 ~50% 수용. 기하 냉각으로 마지막엔 사실상 힐클라임.
const T0 = Number(process.env.SIM_TUNE_T0 ?? 12);
const COOLING = Number(process.env.SIM_TUNE_COOLING ?? 0.87);

// 탐색 공간: 노브별 후보값 (현 오라클 기본값 주변)
const SPACE: Record<string, number[]> = {
  // ── 행동 노브 ──
  safeWave: [5, 8, 12, 16],
  careThreshold: [0.35, 0.5, 0.65],
  careTopUp: [0.6, 0.7, 0.85],
  candyReserve: [80, 150, 300, 600],
  openingTarget: [3, 4, 5],
  body6Wave: [5, 7, 10],
  rebuildMargin: [60, 100, 160],
  rebuildEntries: [4, 6, 10],
  openingBar: [420, 500, 560],
  openingEntries: [8, 10, 14],
  albaStartWave: [10, 12, 16, 99], // 99 = 사실상 알바 금지
  // ── 구매 편향 가중치 (v2에서 노브화 — balancedBias/investGold의 구 하드코딩 계수) ──
  buyWBulk: [0.25, 0.5, 0.8],
  buyWAoeBase: [60, 120, 200],
  buyWEarly: [1.5, 2.5, 4],
  buyWSynergy: [0.75, 1.5, 2.5],
  carryQualityBar: [460, 520, 580],
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

describe.skipIf(!process.env.SIM_TUNE)('Phase B: 노브 SA 튜닝', () => {
  it(`SA ${ITERS}회 × ${MAPS.length}맵 × ${PERSONA_NAMES.length}페르소나 × ${SEEDS}시드 (T0=${T0}, cooling=${COOLING})`, async () => {
    const rand = mulberry32(777);
    const keys = Object.keys(SPACE);
    const oracle = knobsForSkill(1);

    // 시작점 = 현 오라클 기본값 (SPACE에 있는 키만)
    let cur: Config = {};
    for (const k of keys) {
      const def = (oracle as any)[k] as number;
      // SPACE 후보 중 기본값에 가장 가까운 값으로 스냅
      cur[k] = SPACE[k].reduce((a, b) => Math.abs(b - def) < Math.abs(a - def) ? b : a);
    }

    const t0 = Date.now();
    let curEval = await evaluate(cur);
    let best: Config = { ...cur };
    let bestEval = curEval;
    console.log(`[tune] 시작점 score ${curEval.score.toFixed(1)} (${curEval.detail}) — ${JSON.stringify(cur)}`);

    const history: Array<{
      iter: number; temp: number; score: number; detail: string;
      cfg: Config; accepted: boolean; isBest: boolean;
    }> = [
      { iter: 0, temp: T0, score: curEval.score, detail: curEval.detail, cfg: { ...cur }, accepted: true, isBest: true },
    ];

    let temp = T0;
    for (let i = 1; i <= ITERS; i++) {
      // 이웃: 노브 1~2개를 무작위로 다른 후보값으로 (온도 높을 땐 2개 변이 가중)
      const cand: Config = { ...cur };
      const nMut = rand() < temp / T0 * 0.6 + 0.2 ? 2 : 1;
      const mutKeys = new Set<string>();
      while (mutKeys.size < nMut) mutKeys.add(keys[Math.floor(rand() * keys.length)]);
      for (const k of mutKeys) {
        const options = SPACE[k].filter(v => v !== cand[k]);
        cand[k] = options[Math.floor(rand() * options.length)];
      }

      const ev = await evaluate(cand);
      // 메트로폴리스 수용: 개선은 무조건, 악화는 exp(Δ/T) 확률
      const delta = ev.score - curEval.score;
      const accepted = delta >= 0 || rand() < Math.exp(delta / temp);
      if (accepted) { cur = cand; curEval = ev; }
      const isBest = ev.score > bestEval.score;
      if (isBest) { best = { ...cand }; bestEval = ev; }
      history.push({ iter: i, temp, score: ev.score, detail: ev.detail, cfg: { ...cand }, accepted, isBest });
      console.log(
        `[tune] #${i}/${ITERS} T=${temp.toFixed(1)} score ${ev.score.toFixed(1)} (${ev.detail})` +
        `${accepted ? ' ✅수용' : ' ✗기각'}${isBest ? ' 🏆best' : ''}` +
        ` — 변이 ${[...mutKeys].map(k => `${k}=${cand[k]}`).join(',')} (누적 ${Math.round((Date.now() - t0) / 60000)}분)`
      );
      temp *= COOLING;
    }

    console.log(`[tune] 최종 최적: score ${bestEval.score.toFixed(1)} (${bestEval.detail})`);
    console.log(`[tune] 노브: ${JSON.stringify(best, null, 2)}`);

    let md = `# 노브 SA 튜닝 결과\n\n`;
    md += `- 대상: ${MAPS.join(', ')} × ${PERSONA_NAMES.join(', ')} × 시드 ${SEEDS} × ${ITERS}회 (T0=${T0}, cooling=${COOLING})\n`;
    md += `- 최적 score: ${bestEval.score.toFixed(1)} (${bestEval.detail})\n\n`;
    md += `## 최적 노브\n\n\`\`\`json\n${JSON.stringify(best, null, 2)}\n\`\`\`\n\n`;
    md += `## 이력\n\n`;
    md += mdTable(
      ['#', 'T', 'score', '맵별 클리어', '수용', 'best', '설정'],
      history.map(h => [
        h.iter, h.temp.toFixed(1), h.score.toFixed(1), h.detail,
        h.accepted ? '✅' : '—', h.isBest ? '🏆' : '', JSON.stringify(h.cfg),
      ])
    );
    writeReport('tune', md);

    expect(bestEval.score).toBeGreaterThan(0);
  }, 14_400_000); // 8시드 × 24반복 실측 ~2시간 초과 — 4시간 상한
});
