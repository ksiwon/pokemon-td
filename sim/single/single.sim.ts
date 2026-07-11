// sim/single/single.sim.ts
// P1 — 싱글플레이 몬테카를로: 페르소나 × 난이도 × 시드
// 실행: npm run sim:single
//   환경변수: SIM_SEEDS(기본 3), SIM_MAPS(기본 easiest_straight,medium_merge), SIM_MAX_WAVES(기본 50)
//
// 산출: sim/reports/current/single-runs.md + metrics/single-runs.json

import { describe, it, expect } from 'vitest';
import { runSingleGame, SingleRunResult } from './runner';
import { PERSONAS } from './botPolicies';
import { writeReport, writeMetrics, mdTable, pct, fx } from '../support/report';

const SEEDS = Number(process.env.SIM_SEEDS ?? 3);
const MAX_WAVES = Number(process.env.SIM_MAX_WAVES ?? 50);
// 기본 = 난이도 사다리 5맵 (개발자 확인 인간 기준과 봇 클리어율을 비교하는 캘리브레이션)
const MAP_IDS = (process.env.SIM_MAPS ??
  'easiest_straight,easy_loop,medium_merge,hard_dual_path,extreme_central').split(',');
const PERSONA_NAMES = (process.env.SIM_PERSONAS ?? 'holdout,reroller,worker,tera').split(',');

// 개발자 확인 실플레이 기준 (2026-07-11 문답) — 봇 클리어율이 이 사다리를 재현해야
// 하네스를 절대값으로도 신뢰 가능. 재현 못 하면 봇 스킬 갭으로 해석.
const HUMAN_LADDER: Record<string, string> = {
  easiest_straight: '거의 전원 클리어',
  easy_loop: '실패 있지만 보통 성공',
  medium_merge: '리롤+시너지+상처약 쓰면 어렵게 성공',
  hard_dual_path: '포켓몬 운+갈래 배치 실력 필요',
  extreme_central: '거의 불가 (개발자도 못 깸)',
};

// 개발자 지정 목표 (2026-07-12 갱신): 인간 목표는 99/80/50/20/1이지만 봇은 인간 테크
// (도구·시너지 완성·전설 스왑)를 다 못 쓰므로, 봇 사다리는 하향 눈금 95/70/30/10/0으로 판정.
const TARGET_CLEAR: Record<string, number> = {
  easiest_straight: 0.95,
  easy_loop: 0.70,
  medium_merge: 0.30,
  hard_dual_path: 0.10,
  extreme_central: 0.0,
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

describe('P1: 싱글 헤드리스 몬테카를로', () => {
  it(`페르소나(${PERSONA_NAMES.length}) × 맵(${MAP_IDS.length}) × 시드(${SEEDS})`, async () => {
    const runs: SingleRunResult[] = [];

    for (const mapId of MAP_IDS) {
      for (const personaName of PERSONA_NAMES) {
        for (let s = 0; s < SEEDS; s++) {
          const seed = 100_000 + s * 7919;
          const t0 = performance.now();
          const r = await runSingleGame({
            seed,
            policy: PERSONAS[personaName](),
            mapId,
            difficulty: 'medium' as any, // setDifficulty는 사용되지 않음 — 난이도는 맵에 내장
            maxWaves: MAX_WAVES,
          });
          const wall = ((performance.now() - t0) / 1000).toFixed(1);
          runs.push(r);
          console.log(
            `[single] ${mapId}/${personaName}/seed${s}: 웨이브 ${r.wavesCleared}${r.victory ? ' 🏆' : r.gameOver ? ' 💀' : ''}` +
            ` 라이프 ${r.livesLeft} 골드 ${r.finalGold} (실행 ${wall}s${r.aborted ? `, ABORT:${r.aborted}` : ''})`
          );
        }
      }
    }

    // ── 집계 ──────────────────────────────────────────────────────────────
    interface Agg {
      key: string;
      games: number;
      waveP25: number; waveP50: number; waveP75: number;
      clearRate: number;
      avgLivesLeft: number;
      avgFinalGold: number;
      aborts: number;
    }
    const groups = new Map<string, SingleRunResult[]>();
    for (const r of runs) {
      const key = `${r.mapId} / ${r.persona}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const aggs: Agg[] = [];
    for (const [key, rs] of groups) {
      const waves = rs.map(r => r.wavesCleared).sort((a, b) => a - b);
      aggs.push({
        key,
        games: rs.length,
        waveP25: quantile(waves, 0.25),
        waveP50: quantile(waves, 0.5),
        waveP75: quantile(waves, 0.75),
        clearRate: rs.filter(r => r.victory).length / rs.length,
        avgLivesLeft: rs.reduce((s2, r) => s2 + r.livesLeft, 0) / rs.length,
        avgFinalGold: rs.reduce((s2, r) => s2 + r.finalGold, 0) / rs.length,
        aborts: rs.filter(r => r.aborted).length,
      });
    }

    // 웨이브별 평균 라이프 손실 (맵별)
    const waveLoss = new Map<string, Map<number, number[]>>();
    for (const r of runs) {
      if (!waveLoss.has(r.mapId)) waveLoss.set(r.mapId, new Map());
      const m = waveLoss.get(r.mapId)!;
      for (const w of r.waveRecords) {
        if (!m.has(w.wave)) m.set(w.wave, []);
        m.get(w.wave)!.push(w.livesLost);
      }
    }

    // ── 리포트 ────────────────────────────────────────────────────────────
    let md = `# 싱글플레이 몬테카를로\n\n`;
    md += `- 페르소나: ${PERSONA_NAMES.join(', ')} / 맵: ${MAP_IDS.join(', ')} / 시드 ${SEEDS} / 최대 ${MAX_WAVES}웨이브\n\n`;

    // ── 난이도 사다리 캘리브레이션 (인간 기준 vs 봇) ─────────────────────────
    md += `## 난이도 사다리 캘리브레이션\n\n`;
    md += `봇 클리어율이 인간 기준(개발자 확인)을 재현할수록 하네스의 절대값 신뢰도가 높다.\n\n`;
    const mapAgg = MAP_IDS.map(mapId => {
      const rs = runs.filter(r => r.mapId === mapId);
      const clear = rs.filter(r => r.victory).length / Math.max(1, rs.length);
      const waves = rs.map(r => r.wavesCleared).sort((a, b) => a - b);
      return { mapId, clear, p50: quantile(waves, 0.5), best: waves[waves.length - 1] ?? 0 };
    });
    md += mdTable(
      ['맵', '인간 기준', '목표(판당)', '봇 클리어율', 'Δ', '봇 도달 p50', '봇 최고'],
      mapAgg.map(m => {
        const tgt = TARGET_CLEAR[m.mapId];
        return [
          m.mapId, HUMAN_LADDER[m.mapId] ?? '—',
          tgt !== undefined ? pct(tgt, 0) : '—',
          pct(m.clear, 0),
          tgt !== undefined ? (m.clear - tgt >= 0 ? '+' : '') + Math.round((m.clear - tgt) * 100) + '%p' : '—',
          m.p50, m.best,
        ];
      })
    );
    md += `\n`;
    mapAgg.forEach(m => {
      const tgt = TARGET_CLEAR[m.mapId];
      console.log(
        `[ladder] ${m.mapId}: 클리어 ${pct(m.clear, 0)}` +
        (tgt !== undefined ? ` (목표 ${pct(tgt, 0)}, Δ${Math.round((m.clear - tgt) * 100)}%p)` : '') +
        `, p50 ${m.p50}, 최고 ${m.best}`
      );
    });

    md += `## 페르소나별 성과\n\n`;
    md += mdTable(
      ['맵 / 페르소나', '판수', '도달웨이브 p25/p50/p75', '클리어율', '평균 잔여라이프', '평균 잔여골드', '중단'],
      aggs.map(a => [
        a.key, a.games, `${a.waveP25}/${a.waveP50}/${a.waveP75}`,
        pct(a.clearRate, 0), fx(a.avgLivesLeft, 1), Math.round(a.avgFinalGold), a.aborts || '—',
      ])
    );

    md += `\n## 웨이브별 평균 라이프 손실 (난이도 곡선)\n\n`;
    for (const [mapId, m] of waveLoss) {
      const waves = [...m.keys()].sort((a, b) => a - b);
      md += `\n### ${mapId}\n\n`;
      md += mdTable(
        ['웨이브', ...waves.filter(w => w % 5 === 0 || w === 1).map(String)],
        [[
          '평균 손실',
          ...waves.filter(w => w % 5 === 0 || w === 1).map(w => {
            const xs = m.get(w)!;
            return fx(xs.reduce((s2, x) => s2 + x, 0) / xs.length, 1);
          }),
        ]]
      );
    }

    md += `\n## 개별 판 상세\n\n`;
    md += mdTable(
      ['맵', '페르소나', '시드', '도달', '결과', '라이프', '골드', '최종 팀'],
      runs.map(r => [
        r.mapId, r.persona, r.seed, r.wavesCleared,
        r.victory ? '클리어' : r.gameOver ? '패배' : (r.aborted ?? '진행중단'),
        r.livesLeft, r.finalGold,
        r.finalTeam.map(t2 => `${t2.name}${t2.level}`).join(' '),
      ])
    );

    writeReport('single-runs', md);
    writeMetrics('single-runs', {
      seeds: SEEDS, maxWaves: MAX_WAVES, maps: MAP_IDS, personas: PERSONA_NAMES,
      ladder: mapAgg,
      aggregates: aggs,
      runs: runs.map(r => ({
        mapId: r.mapId, persona: r.persona, seed: r.seed,
        wavesCleared: r.wavesCleared, victory: r.victory, gameOver: r.gameOver,
        aborted: r.aborted, livesLeft: r.livesLeft, finalGold: r.finalGold,
      })),
    });

    // 하네스 무결성: 교착으로 중단된 판이 없어야 함
    const aborted = runs.filter(r => r.aborted);
    expect(aborted, `교착 발생: ${aborted.map(a => `${a.persona}/seed${a.seed}:${a.aborted}`).join(', ')}`).toEqual([]);
  });

  it('결정론: 같은 시드 → 같은 결과', async () => {
    const { PERSONAS: P } = await import('./botPolicies');
    const a = await runSingleGame({
      seed: 424242, policy: P.holdout(), mapId: 'easiest_straight',
      difficulty: 'medium' as any, maxWaves: 5,
    });
    const b = await runSingleGame({
      seed: 424242, policy: P.holdout(), mapId: 'easiest_straight',
      difficulty: 'medium' as any, maxWaves: 5,
    });
    expect(a.wavesCleared).toBe(b.wavesCleared);
    expect(a.livesLeft).toBe(b.livesLeft);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalTeam).toEqual(b.finalTeam);
  });
});
