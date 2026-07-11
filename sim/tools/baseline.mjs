// sim/tools/baseline.mjs
// 현재 리포트(sim/reports/current)를 기준선(sim/reports/baseline)으로 저장.
// 밸런스 상수를 바꾸기 전에 실행 → 바꾼 후 npm run sim && npm run sim:report 로 전후 비교.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cur = path.resolve(here, '../reports/current');
const base = path.resolve(here, '../reports/baseline');

if (!fs.existsSync(cur)) {
  console.error('[baseline] sim/reports/current 가 없습니다. 먼저 npm run sim 을 실행하세요.');
  process.exit(1);
}
fs.rmSync(base, { recursive: true, force: true });
fs.cpSync(cur, base, { recursive: true });
console.log('[baseline] 저장 완료: sim/reports/baseline (이후 sim:report가 이 기준과 비교합니다)');
