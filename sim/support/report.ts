// sim/support/report.ts
// 시뮬 결과 저장 — 마크다운(사람용) + 메트릭 JSON(전후 비교용).
//   sim/reports/current/<name>.md
//   sim/reports/current/metrics/<name>.json
//   sim/reports/baseline/         ← npm run sim:baseline 이 current를 복사

import * as fs from 'fs';
import * as path from 'path';

const REPORT_DIR = path.resolve(__dirname, '../reports/current');
const METRIC_DIR = path.join(REPORT_DIR, 'metrics');

export function writeReport(name: string, markdown: string): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${name}.md`);
  fs.writeFileSync(file, markdown, 'utf8');
  console.log(`[report] ${path.relative(process.cwd(), file)} 저장`);
  return file;
}

export function writeMetrics(name: string, data: unknown): string {
  fs.mkdirSync(METRIC_DIR, { recursive: true });
  const file = path.join(METRIC_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  return file;
}

export function readBaselineMetrics(name: string): any | null {
  const file = path.resolve(__dirname, `../reports/baseline/metrics/${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function mdTable(headers: string[], rows: Array<Array<string | number>>): string {
  const h = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${h}\n${sep}\n${body}\n`;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const fx = (x: number, digits = 2) => x.toFixed(digits);
