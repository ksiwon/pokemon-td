// sim/report/report.sim.ts
// 종합 비교 리포트 — 각 시뮬의 핵심 지표를 모아 baseline과 전후 비교표를 만든다.
// 사용 흐름:
//   1) npm run sim              (전체 시뮬 실행 → reports/current 갱신)
//   2) npm run sim:baseline     (현재를 기준선으로 저장)
//   3) 밸런스 상수 수정
//   4) npm run sim && npm run sim:report
//      → sim/reports/current/balance-compare.md 에 전후 비교표
//
// "밸런스 변경 전 비교표 먼저" 원칙의 자동화 장치.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { writeReport, readBaselineMetrics, mdTable } from '../support/report';

const METRIC_DIR = path.resolve(__dirname, '../reports/current/metrics');

/** n = 그 지표가 몇 판에서 나온 비율인지(비율 지표만). 노이즈 바닥 계산에 쓴다. */
interface Headline { key: string; label: string; value: number; format: 'pct' | 'num'; n?: number; }

/**
 * 관측 비율 p̂ 의 95% Wilson 구간 반폭. 정규근사와 달리 p̂=0/1에서도 폭이 죽지 않는다
 * (0/40 → ±4.4%p 상당, 0.5/40 → ±15%p). 델타가 이 안이면 표본 노이즈와 구분 불가.
 */
function ciHalfWidth(p?: number, n?: number): number | null {
  if (!n || n <= 0 || typeof p !== 'number') return null;
  const z = 1.96, z2 = z * z, denom = 1 + z2 / n;
  return (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
}

/** 각 시뮬이 몇 판짜리였는지 — 기준선과 표본 크기가 다르면 비교 자체가 무효다. */
function sampleSizeOf(name: string, m: any): { label: string; value: number } | null {
  if (name === 'single-runs' && typeof m.seeds === 'number') return { label: '시드/맵·페르소나', value: m.seeds };
  if (name === 'multi-runs' && typeof m.games === 'number') return { label: '게임', value: m.games };
  if (name === 'pvp-matrix' && typeof m.seedsPerPair === 'number') return { label: '시드/쌍', value: m.seedsPerPair };
  return null;
}

/** 각 시뮬 메트릭 JSON에서 핵심 지표 추출 */
function extractHeadlines(name: string, m: any): Headline[] {
  const out: Headline[] = [];
  const push = (key: string, label: string, value: number, format: 'pct' | 'num' = 'num', n?: number) => {
    if (typeof value === 'number' && !Number.isNaN(value)) out.push({ key, label, value, format, n });
  };

  switch (name) {
    case 'pvp-matrix':
      push('firstMoverEdge', '선공(p1) 승률 (AI매치 공정성)', m.firstMoverEdge, 'pct');
      for (const b of m.boards ?? []) {
        push(`board.${b.name}.avgWinRate`, `보드 ${b.name} 평균승률`, b.avgWinRate, 'pct');
      }
      break;
    case 'arena-placement':
      push('avgSpread', '배치 민감도(무작위 스프레드)', m.avgSpread, 'pct');
      push('avgRoleDelta', '역할배치(탱전열) 효과', m.avgRoleDelta, 'pct');
      break;
    case 'engine-cross-validation':
      push('overallAgreement', '두 전투엔진 승자 일치율', m.overallAgreement, 'pct');
      push('flippedPairs', '우세 방향 뒤집힌 쌍 수', (m.flippedPairs ?? []).length);
      break;
    case 'single-runs':
      for (const a of m.aggregates ?? []) {
        push(`${a.key}.waveP50`, `싱글 ${a.key} 도달웨이브 p50`, a.waveP50);
        push(`${a.key}.clearRate`, `싱글 ${a.key} 클리어율`, a.clearRate, 'pct', a.games);
      }
      // 맵 단위 클리어율 — 목표 사다리 판정이 걸리는 지표라 페르소나 합산으로 따로 본다.
      for (const l of m.ladder ?? []) {
        push(`ladder.${l.mapId}.clearRate`, `사다리 ${l.mapId} 클리어율`, l.clear, 'pct', l.games);
      }
      break;
    case 'multi-runs':
      push('avgRounds', '멀티 평균 게임 길이(라운드)', m.avgRounds);
      push('avgBattles', '멀티 평균 배틀 수', m.avgBattles);
      if (m.lifeLoss) {
        const total = m.lifeLoss.pve + m.lifeLoss.pvp;
        if (total > 0) push('pveLossShare', '라이프 손실 중 PvE 비중', m.lifeLoss.pve / total, 'pct');
      }
      push('spiralRecovery', '2연패 후 다음 배틀 승률', m.spiralRecovery, 'pct', m.spiralSamples);
      for (const [persona, p] of Object.entries<any>(m.personas ?? {})) {
        push(`persona.${persona}.avgPlacement`, `멀티 ${persona} 평균순위`, p.avgPlacement);
      }
      break;
  }
  return out;
}

const fmt = (h: Headline, v: number) =>
  h.format === 'pct' ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100) / 100}`;

describe('종합 비교 리포트', () => {
  it('current vs baseline 비교표 생성', () => {
    if (!fs.existsSync(METRIC_DIR)) {
      console.log('[report] metrics 없음 — 먼저 npm run sim 을 실행하세요.');
      expect(true).toBe(true);
      return;
    }

    const files = fs.readdirSync(METRIC_DIR).filter(f => f.endsWith('.json'));
    let md = `# 밸런스 전후 비교 리포트\n\n`;
    md += `생성 기준: sim/reports/current vs sim/reports/baseline\n\n`;

    let hasBaseline = false;
    const rows: Array<Array<string>> = [];
    const sampleRows: Array<Array<string>> = [];
    const mismatches: string[] = [];

    for (const f of files) {
      const name = f.replace(/\.json$/, '');
      const cur = JSON.parse(fs.readFileSync(path.join(METRIC_DIR, f), 'utf8'));
      const base = readBaselineMetrics(name);
      if (base) hasBaseline = true;

      // 표본 크기가 다르면 델타가 코드 변화인지 표본 변화인지 구분되지 않는다 → 먼저 경고.
      const curN = sampleSizeOf(name, cur);
      const baseN = base ? sampleSizeOf(name, base) : null;
      if (curN) {
        const same = baseN ? baseN.value === curN.value : true;
        if (baseN && !same) mismatches.push(`\`${name}\` (${curN.label}: 기준선 ${baseN.value} vs 현재 ${curN.value})`);
        sampleRows.push([
          `\`${name}\``, curN.label,
          baseN ? String(baseN.value) : '—', String(curN.value),
          !baseN ? '—' : same ? '✅ 동일' : '⚠️ 불일치',
        ]);
      }

      const curHeads = extractHeadlines(name, cur);
      const baseHeads = base ? extractHeadlines(name, base) : [];
      const baseMap = new Map(baseHeads.map(h => [h.key, h]));

      for (const h of curHeads) {
        const b = baseMap.get(h.key);
        let baseStr = '—'; let deltaStr = '—'; let noiseStr = '—';
        const hw = ciHalfWidth(h.value, h.n);
        if (hw !== null) noiseStr = `±${(hw * 100).toFixed(0)}%p (n=${h.n})`;
        if (b) {
          baseStr = fmt(h, b.value);
          const d = h.value - b.value;
          const arrow = Math.abs(d) < 1e-9 ? '=' : d > 0 ? '▲' : '▼';
          deltaStr = `${arrow} ${h.format === 'pct' ? `${(d * 100).toFixed(1)}%p` : (Math.round(d * 100) / 100)}`;
          // 두 비율의 차이는 각자의 오차가 합쳐진다 → √(hw_c² + hw_b²) 보다 작으면 노이즈.
          const bhw = ciHalfWidth(b.value, b.n);
          if (hw !== null && bhw !== null) {
            const combined = Math.sqrt(hw * hw + bhw * bhw);
            if (Math.abs(d) <= combined) deltaStr += ` (노이즈 한계 ±${(combined * 100).toFixed(0)}%p 이내)`;
          }
        }
        rows.push([`\`${name}\``, h.label, baseStr, fmt(h, h.value), deltaStr, noiseStr]);
      }
    }

    if (sampleRows.length) {
      md += `## 표본 크기 대조\n\n`;
      md += mdTable(['시뮬', '단위', '기준선', '현재', '판정'], sampleRows);
      if (mismatches.length) {
        md += `\n> ⚠ **표본 크기가 기준선과 다릅니다** — ${mismatches.join(', ')}.\n`;
        md += `> 아래 변화량에는 코드 변화와 표본 변화가 섞여 있습니다. 같은 조건으로 다시 돌리거나 기준선을 갱신하세요.\n`;
      }
      md += `\n## 지표 비교\n\n`;
    }

    md += mdTable(['시뮬', '지표', '기준선', '현재', '변화', '노이즈 바닥'], rows);

    if (!hasBaseline) {
      md += `\n> ⚠ 기준선이 없습니다. 밸런스를 바꾸기 **전에** \`npm run sim:baseline\` 으로 저장하세요.\n`;
    }

    md += `\n## 읽는 법\n\n`;
    md += `- 싱글 도달웨이브 p50: 목표 밴드(예: medium 35±3)를 정하고 이탈 시 난이도/보상 조정.\n`;
    md += `- 멀티 게임 길이: 알바 해금(파견 후 5라운드)이 가능하려면 평균 12+라운드 필요.\n`;
    md += `- PvE 비중: 탈락 원인 축. PvP 밸런스보다 웨이브 난이도가 지배 중이면 여기부터.\n`;
    md += `- 선공 승률/엔진 일치율: 공정성 지표 — 50%/100%에서 멀수록 구조 문제.\n`;
    md += `- **노이즈 바닥**: 그 비율 지표가 표본만으로 흔들릴 수 있는 폭(95% Wilson 구간 반폭).\n`;
    md += `  변화량이 이 안에 있으면 "바뀌었다"고 읽으면 안 된다 — 시드를 늘려야 판정 가능하다.\n`;

    writeReport('balance-compare', md);
    expect(rows.length).toBeGreaterThan(0);
  });
});
