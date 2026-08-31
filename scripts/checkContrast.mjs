// scripts/checkContrast.mjs
//
// 글자색 × 바탕색 대비표. `npm run ui:contrast`
//
// 왜 있나: 대비는 눈으로 못 잡는다. 어두운 UI에서 "좀 흐린데" 와 "기준 미달" 은
// 같아 보이는데, 앞은 취향이고 뒤는 못 읽는 사람이 생기는 문제다. 실제로 textDim
// (#9a8ea6)이 창 바탕에서 3.26:1 이던 걸 이 표로 잡았다 — 103곳에서 12px 본문
// 글자색으로 쓰이고 있었다.
//
// 값은 tokens.ts 에서 직접 읽는다. 팔레트를 고치면 이 표도 같이 움직인다.
//
// 기준(WCAG 2.1): 본문 4.5:1 / 큰 글자(24px 이상, 굵으면 19px) 3:1.
// 도트 폰트는 획이 1px이라 같은 대비에서도 안티에일리어스된 글꼴보다 먼저
// 뭉개진다 — 기준을 느슨하게 잡을 근거가 아니라 더 지켜야 할 이유다.

import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/styles/tokens.ts', 'utf8');

/** tokens.ts 의 C 객체에서 `이름: '#hex'` 를 읽는다. */
function token(name) {
  const m = SRC.match(new RegExp(`\\n\\s*${name}:\\s*'(#[0-9a-fA-F]{6})'`));
  if (!m) throw new Error(`tokens.ts 에서 C.${name} 을 못 찾았다`);
  return m[1];
}

const BG = ['bg', 'panel', 'panelBtn', 'panelSunk'];
const FG = ['text', 'textSub', 'textDim', 'gold', 'blue', 'red', 'green',
            'purple', 'cyan', 'teal', 'orange', 'plain'];

const srgb = c => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const bg = Object.fromEntries(BG.map(n => [n, token(n)]));
const fg = Object.fromEntries(FG.map(n => [n, token(n)]));

const pad = (s, n) => String(s).padEnd(n);
console.log('\n글자색 × 바탕색 대비 (WCAG 2.1)\n');
console.log(pad('', 10) + BG.map(n => pad(`${n}`, 12)).join(''));
console.log(pad('', 10) + BG.map(n => pad(bg[n], 12)).join(''));

let fail = 0, big = 0;
for (const f of FG) {
  let row = '';
  for (const b of BG) {
    const r = ratio(fg[f], bg[b]);
    // 본문 통과 / 큰 글자만 통과(~) / 미달(!)
    const mark = r >= 4.5 ? ' ' : r >= 3 ? '~' : '!';
    if (mark === '~') big++;
    if (mark === '!') fail++;
    row += pad(`${mark} ${r.toFixed(2)}`, 12);
  }
  console.log(pad(f, 10) + row);
}

console.log('\n  (공백) 본문 통과 4.5+   ~ 큰 글자만 3.0+   ! 미달');
console.log(`  큰 글자 전용 ${big}쌍 · 미달 ${fail}쌍`);
console.log('\n이 표는 "쓰면 안 되는 조합"의 목록이지 결함 목록이 아니다.');
console.log('액센트 색은 창틀 테두리용이라 버튼 면 위 글자로 쓰지 않는 게 전제다.');
console.log('규칙은 docs/DESIGN.md 의 「대비」 절.\n');
