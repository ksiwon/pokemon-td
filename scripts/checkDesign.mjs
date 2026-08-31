// scripts/checkDesign.mjs
//
// docs/DESIGN.md 의 '금지 목록'을 코드에 대조한다. `npm run ui:lint`
//
// 왜 있나: 규칙을 문서에만 적어 두면 다음 화면에서 조용히 되살아난다. 유리 카드와
// 둥근 모서리는 한 번 걷어내도 새 컴포넌트에서 다시 태어나기 쉬운 것들이다.
//
// 문서가 인정한 연출 예외(카드 3D·팩 개봉·컷인)는 건너뛴다 — 다만 그 자리도
// '글자와 색은 토큰을 쓴다'가 원칙이라 색 리터럴 검사는 그대로 받는다.
//
// 범위 주의: 이 검사기는 **UI 껍데기(CSS)** 만 본다. 처음 만들었을 때는 그 구분이
// 없어서 색 리터럴 267건이 잡혔는데, 최다 파일이 GameCanvas 88건이었고 전부
// ctx.fillStyle 이었다. 캔버스 페인트는 styled-components 토큰이 애초에 닿지
// 않는 표면이라, 그 숫자는 '방치된 위반'이 아니라 잘못 잰 값이었다. 아래
// NON_CSS_PATH / CANVAS_PAINT 가 그 경계다.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
/** 연출 레이어 예외 — DESIGN.md '의도적 예외' 표와 같아야 한다. */
const FX_EXEMPT = ['CardView', 'PackOpening', 'BossCutIn', 'StoryOpening', 'StoryEnding'];

/**
 * 색 규칙(색 리터럴·Tailwind 팔레트)이 적용되지 않는 자리.
 *
 *  · 캔버스 페인트: ctx.fillStyle/strokeStyle 과 react-konva 의 fill/stroke prop 은
 *    CSS가 아니다. 디자인 토큰은 styled-components 문법이라 여기 닿지 않는다.
 *    (그래서 캔버스의 rgba 스크림은 '유리 카드'도 아니다 — 반투명 CSS 면이 아니라
 *    그냥 칠한 사각형이다.)
 *  · src/data · src/game · src/utils · src/services: 화면 껍데기가 아니라
 *    콘텐츠·로직 데이터다. 챕터 테마색이나 등급 배지색은 TYPE_COLOR 와 같은
 *    성격의 '콘텐츠 팔레트'이지 UI 크롬이 아니다.
 *  · src/main.tsx: 크래시 화면. 앱과 토큰 모듈이 죽어도 떠야 하므로 의존을
 *    두지 않는다. 여기에 import 를 넣는 건 이득보다 위험이 크다.
 *
 * 구조 규칙(유리 카드·둥근 모서리 등)은 이 예외와 무관하게 전부 적용된다.
 */
const NON_CSS_PATH = /^src\/(data|game|utils|services)\/|^src\/main\.tsx$/;
/**
 * 포커스 링을 지운 자리에 대체 표시가 있는지 본다.
 *
 * `outline: none` 자체가 잘못은 아니다 — 브라우저 기본 링은 둥근 파란 테두리라
 * 도트 창틀과 충돌한다. 잘못은 지우고 아무것도 안 넣는 것이다. 한때 130곳 중
 * 대체가 있는 건 2곳뿐이었고, 키보드로 도는 사람은 자기 위치를 볼 수 없었다.
 */
const FOCUS_ALT = /(focusRing|cursorOn|outline: [^n;]|inset 0 0 0)/;

const CANVAS_PAINT = /(fillStyle|strokeStyle|shadowColor|addColorStop|create(Linear|Radial)Gradient|[ {](fill|stroke)=)/;

const RULES = [
  // 유리 카드 — 흰색 저알파 면. 도트 UI에는 반투명 면이 없다.
  { id: '유리 카드',       re: /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.0\d/i, fx: true, cssOnly: true },
  { id: 'backdrop-filter', re: /backdrop-filter\s*:/i, fx: true },
  // hover 에서만 금지다. 중앙 정렬(translateY(-50%))·등장 애니메이션은 해당 없음.
  { id: 'hover 떠오름',    re: /translateY\(\s*-|scale\(\s*1\.[1-9]/, fx: true, needsHover: true },
  { id: 'eyebrow',         re: /letter-spacing:\s*0\.2em/i, fx: true },
  // 장식용 화살표만. 주석·로그·값 표기(30 → 62)는 대상이 아니다.
  //
  // 앞에 '>' 가 오는 경우(<Arrow>→</Arrow>)는 제외한다. 화살표가 제 요소의 내용
  // 전부라면 그건 두 항을 잇는 **관계 기호**다 — 전투 로그의 '공격자 → 대상'이
  // 그렇고, 지우면 누가 누구를 때렸는지가 사라진다. 금지 대상은 이미 뜻이 완결된
  // 글자 뒤에 덧붙는 쪽(`다음 →`)이라 앞 글자를 요구한다.
  { id: '→ 장식',          re: /[^>\s]\s*→\s*(<\/|\{'\s*'\}|$)/, fx: true, jsxOnly: true },
  { id: 'Tailwind 팔레트',  re: /#(3b82f6|10b981|f59e0b|c084fc|22d3ee|ef4444|8b5cf6|22c55e|84cc16|eab308|f97316|60a5fa|34d399|fbbf24|a855f7|38bdf8|94a3b8|64748b|4ade80|f87171|fb923c|a3e635)(?![0-9a-fA-F])/i, fx: false, cssOnly: true },
  { id: 'border-radius',   re: /border-radius\s*:\s*(?!0)/i, fx: true },
  { id: '번지는 그림자',   re: /box-shadow:[^;]*[0-9]+px\s+[0-9]+px\s+[1-9][0-9]*px/i, fx: true },
  // 대체 없이 지운 포커스 링. focusRing / cursorOn / inset 테두리가 근처에 있으면
  // 대체가 있는 것으로 본다. 인라인 `outline: none`(input 선언 안)도 잡는다 —
  // 그쪽이 오히려 링이 늘 없다.
  { id: '맨 outline:none', re: /outline: *none/i, fx: true, needsFocusAlt: true },
  { id: '색 리터럴',       re: /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])|rgba?\(/, fx: false, cssOnly: true },
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
    // 포커스 대체는 같은 줄이나 바로 다음 줄에 온다(`outline: none;` 다음 줄의 focusRing)
    const nearAfter = lines.slice(Math.max(0, i - 1), i + 3).join(' ');
    for (const r of RULES) {
      if (exempt && r.fx) continue;
      if (r.needsHover && !/hover/i.test(near)) continue;
      if (r.jsxOnly && !/<|\{/.test(code)) continue;
      if (r.cssOnly && (NON_CSS_PATH.test(f) || CANVAS_PAINT.test(code))) continue;
      if (r.needsFocusAlt && FOCUS_ALT.test(nearAfter)) continue;
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

// ─── 번역 파일의 장식 화살표 ────────────────────────────────────────────────────
//
// 왜 따로 보나: 화살표 금지 규칙이 .tsx 만 훑고 있어서, 글리프가 번역 문자열에
// 들어가 있으면 통과했다. 실제로 `다음 →` `← 메뉴` 가 그렇게 살아남아 있었다.
//
// 판별: 화살표가 **문자열 끝(→) 이나 맨 앞(←)** 이면 라벨에 덧붙은 장식이다.
// 뜻을 지닌 관계 표기는 늘 문장 가운데 온다 — `{from} → {to} 진화!`,
// `쇼핑 → 웨이브 → 배틀`. 그래서 위치만으로 갈린다.
const I18N_DIR = 'src/i18n/translations';
const i18nHits = [];
if (existsSync(I18N_DIR)) {
  for (const f of readdirSync(I18N_DIR).filter(n => n.endsWith('.json'))) {
    const walkJson = (o, path) => {
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) walkJson(v, path ? `${path}.${k}` : k);
      } else if (typeof o === 'string') {
        const t = o.trim();
        if (t.endsWith('→') || t.startsWith('←')) i18nHits.push(`${f}  ${path}  "${t}"`);
      }
    };
    walkJson(JSON.parse(readFileSync(`${I18N_DIR}/${f}`, 'utf8')), '');
  }
}
console.log(`
${i18nHits.length === 0 ? '✓' : '✗'} 번역문 → 장식 — ${i18nHits.length}건`);
for (const l of i18nHits.slice(0, 12)) console.log('    ' + l);

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
