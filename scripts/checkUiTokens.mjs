// scripts/checkUiTokens.mjs
// ─────────────────────────────────────────────────────────────────────────────
// 창틀 PNG에 구워진 색과 CSS 토큰이 어긋나지 않았는지 검사한다.
//
// 왜 필요한가:
//   창의 채움색은 두 곳에 존재한다. 하나는 scripts/genUiFrames.mjs 가 PNG에
//   구워 넣는 값이고, 다른 하나는 src/styles/tokens.ts 의 C.panel 등이다.
//   PNG는 나인슬라이스 가장자리를, CSS는 그 밖의 면(헤더 띠, 파인 영역 등)을
//   칠하므로 둘이 다르면 같은 패널 안에서 색이 갈리는 이음매가 보인다.
//   눈으로는 잘 안 잡히고 스크린샷을 확대해야 보이는 종류의 버그라, 사람 대신
//   기계가 본다.
//
// 사용:  npm run ui:check
//        팔레트를 고쳤으면 npm run ui:frames 로 PNG를 다시 굽고 이 검사를 돌린다.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';

const gen = readFileSync('scripts/genUiFrames.mjs', 'utf8');
const tok = readFileSync('src/styles/tokens.ts', 'utf8');

/** `const NAME = '#rrggbb'` 형태에서 색을 뽑는다 */
const fromGen = name => {
  const m = gen.match(new RegExp(`const\\s+${name}\\s*=\\s*'(#[0-9a-fA-F]{6})'`));
  return m && m[1].toLowerCase();
};
/** `name: '#rrggbb'` 형태에서 색을 뽑는다 */
const fromTok = name => {
  const m = tok.match(new RegExp(`\\b${name}\\s*:\\s*'(#[0-9a-fA-F]{6})'`));
  return m && m[1].toLowerCase();
};

// [생성기 상수, 토큰 이름, 무엇을 칠하는가]
const PAIRS = [
  ['INK',      'ink',       '창틀 바깥 외곽선'],
  ['FILL_WIN', 'panel',     '창 안쪽 채움'],
  ['FILL_BTN', 'panelBtn',  '버튼 채움'],
  ['FILL_IN',  'panelSunk', '눌린 버튼 / 파인 면'],
];

let bad = 0;
for (const [genName, tokName, what] of PAIRS) {
  const a = fromGen(genName);
  const b = fromTok(tokName);
  if (!a || !b) {
    console.error(`✗ ${what}: 값을 찾지 못했습니다 (genUiFrames.${genName} / tokens.C.${tokName})`);
    bad++;
  } else if (a !== b) {
    console.error(`✗ ${what}: PNG는 ${a}, CSS는 ${b} — 패널에 이음매가 보입니다.`);
    console.error(`   genUiFrames.mjs 의 ${genName} 과 tokens.ts 의 C.${tokName} 을 맞추고 npm run ui:frames`);
    bad++;
  }
}

if (bad) {
  console.error(`\n창틀 색 불일치 ${bad}건.`);
  process.exit(1);
}
console.log(`창틀 색 ${PAIRS.length}쌍 일치.`);
