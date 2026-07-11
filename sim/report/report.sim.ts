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

interface Headline { key: string; label: string; value: number; format: 'pct' | 'num'; }

/** 각 시뮬 메트릭 JSON에서 핵심 지표 추출 */
function extractHeadlines(name: string, m: any): Headline[] {
  const out: Headline[] = [];
  const push = (key: string, label: string, value: number, format: 'pct' | 'num' = 'num') => {
    if (typeof value === 'number' && !Number.isNaN(value)) out.push({ key, label, value, format });
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
        push(`${a.key}.clearRate`, `싱글 ${a.key} 클리어율`, a.clearRate, 'pct');
      }
      break;
    case 'multi-runs':
      push('avgRounds', '멀티 평균 게임 길이(라운드)', m.avgRounds);
      push('avgBattles', '멀티 평균 배틀 수', m.avgBattles);
      if (m.lifeLoss) {
        const total = m.lifeLoss.pve + m.lifeLoss.pvp;
        if (total > 0) push('pveLossShare', '라이프 손실 중 PvE 비중', m.lifeLoss.pve / total, 'pct');
      }
      push('spiralRecovery', '2연패 후 다음 배틀 승률', m.spiralRecovery, 'pct');
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

    for (const f of files) {
      const name = f.replace(/\.json$/, '');
      const cur = JSON.parse(fs.readFileSync(path.join(METRIC_DIR, f), 'utf8'));
      const base = readBaselineMetrics(name);
      if (base) hasBaseline = true;

      const curHeads = extractHeadlines(name, cur);
      const baseHeads = base ? extractHeadlines(name, base) : [];
      const baseMap = new Map(baseHeads.map(h => [h.key, h]));

      for (const h of curHeads) {
        const b = baseMap.get(h.key);
        let baseStr = '—'; let deltaStr = '—';
        if (b) {
          baseStr = fmt(h, b.value);
          const d = h.value - b.value;
          const arrow = Math.abs(d) < 1e-9 ? '=' : d > 0 ? '▲' : '▼';
          deltaStr = `${arrow} ${h.format === 'pct' ? `${(d * 100).toFixed(1)}%p` : (Math.round(d * 100) / 100)}`;
        }
        rows.push([`\`${name}\``, h.label, baseStr, fmt(h, h.value), deltaStr]);
      }
    }

    md += mdTable(['시뮬', '지표', '기준선', '현재', '변화'], rows);

    if (!hasBaseline) {
      md += `\n> ⚠ 기준선이 없습니다. 밸런스를 바꾸기 **전에** \`npm run sim:baseline\` 으로 저장하세요.\n`;
    }

    md += `\n## 읽는 법\n\n`;
    md += `- 싱글 도달웨이브 p50: 목표 밴드(예: medium 35±3)를 정하고 이탈 시 난이도/보상 조정.\n`;
    md += `- 멀티 게임 길이: 알바 해금(파견 후 5라운드)이 가능하려면 평균 12+라운드 필요.\n`;
    md += `- PvE 비중: 탈락 원인 축. PvP 밸런스보다 웨이브 난이도가 지배 중이면 여기부터.\n`;
    md += `- 선공 승률/엔진 일치율: 공정성 지표 — 50%/100%에서 멀수록 구조 문제.\n`;

    writeReport('balance-compare', md);
    expect(rows.length).toBeGreaterThan(0);
  });
});
