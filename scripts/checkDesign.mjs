// scripts/checkDesign.mjs
//
// docs/DESIGN.md 의 '금지 목록'을 코드에 대조한다. `npm run ui:lint`
//
// 왜 있나: 규칙을 문서에만 적어 두면 다음 화면에서 조용히 되살아난다. 유리 카드와
// 둥근 모서리는 한 번 걷어내도 새 컴포넌트에서 다시 태어나기 쉬운 것들이다.
//
// 문서가 인정한 연출 예외(카드 3D·팩 개봉·컷인)는 건너뛴다 — 다만 그 자리도
// '글자와 색은 토큰을 쓴다'가 원칙이라 색 리터럴 검사는 그대로 받는다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
/** 연출 레이어 예외 — DESIGN.md '의도적 예외' 표와 같아야 한다. */
const FX_EXEMPT = ['CardView', 'PackOpening', 'BossCutIn', 'StoryOpening', 'StoryEnding'];

const RULES = [
  // 유리 카드 — 흰색 저알파 면. 도트 UI에는 반투명 면이 없다.
  { id: '유리 카드',       re: /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.0\d/i, fx: true },
  { id: 'backdrop-filter', re: /backdrop-filter\s*:/i, fx: true },
  // hover 에서만 금지다. 중앙 정렬(translateY(-50%))·등장 애니메이션은 해당 없음.
  { id: 'hover 떠오름',    re: /translateY\(\s*-|scale\(\s*1\.[1-9]/, fx: true, needsHover: true },
  { id: 'eyebrow',         re: /letter-spacing:\s*0\.2em/i, fx: true },
  // 장식용 화살표만. 주석·로그·값 표기(30 → 62)는 대상이 아니다.
  { id: '→ 장식',          re: /→\s*(<\/|\{'\s*'\}|$)/, fx: true, jsxOnly: true },
  { id: 'Tailwind 팔레트',  re: /#(3b82f6|10b981|f59e0b|c084fc|22d3ee|ef4444|8b5cf6|22c55e|84cc16|eab308|f97316|60a5fa|34d399|fbbf24|a855f7|38bdf8|94a3b8|64748b)(?![0-9a-fA-F])/i, fx: false },
  { id: 'border-radius',   re: /border-radius\s*:\s*(?!0)/i, fx: true },
  { id: '번지는 그림자',   re: /box-shadow:[^;]*[0-9]+px\s+[0-9]+px\s+[1-9][0-9]*px/i, fx: true },
  { id: '색 리터럴',       re: /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])|rgba?\(/, fx: false },
];

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p.replaceAll(String.fromCharCode(92), '/'));
  }
})(SRC);

const hits = new Map(RULES.map(r => [r.id, []]));
for (const f of files) {
  if (f.startsWith('src/styles/')) continue;              // 토큰 정의 자리
  const exempt = FX_EXEMPT.some(n => f.includes(`/${n}.`));
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // 주석 줄
    const code = line.split('//')[0];                        // 줄 끝 주석 제거
    if (!code.trim()) return;
    if (/console\.(log|warn|error)/.test(code)) return;       // 로그 문자열
    const near = lines.slice(Math.max(0, i - 4), i + 1).join(' ');
    for (const r of RULES) {
      if (exempt && r.fx) continue;
      if (r.needsHover && !/hover/i.test(near)) continue;
      if (r.jsxOnly && !/<|\{/.test(code)) continue;
      if (r.re.test(code)) hits.get(r.id).push(`${f}:${i + 1}  ${code.trim().slice(0, 88)}`);
    }
  });}

let total = 0;
for (const r of RULES) {
  const h = hits.get(r.id);
  total += h.length;
  console.log(`\n${h.length === 0 ? '✓' : '✗'} ${r.id} — ${h.length}건`);
  for (const l of h.slice(0, 12)) console.log('    ' + l);
  if (h.length > 12) console.log(`    … 외 ${h.length - 12}건`);
}
console.log(`\n합계 ${total}건`);

// 파일별 요약 — 건수보다 '어디를 손봐야 하는지'가 중요하다.
const byFile = new Map();
for (const [id, h] of hits) for (const l of h) {
  const f = l.split(':')[0];
  if (!byFile.has(f)) byFile.set(f, new Map());
  const m = byFile.get(f);
  m.set(id, (m.get(id) ?? 0) + 1);
}
const sum = m => [...m.values()].reduce((x, y) => x + y, 0);
if (byFile.size) {
  console.log('');
  console.log('-- 파일별 --');
  [...byFile.entries()].sort((a, b) => sum(b[1]) - sum(a[1])).forEach(([f, m]) => {
    console.log(`  ${String(sum(m)).padStart(3)}  ${f.replace('src/components/', '')}  [${[...m.keys()].join(', ')}]`);
  });
}
process.exit(0);
