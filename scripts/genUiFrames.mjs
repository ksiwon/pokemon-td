// scripts/genUiFrames.mjs
// ─────────────────────────────────────────────────────────────────────────────
// NDS 4세대(플라티나·HGSS)풍 나인슬라이스 창틀 PNG 생성기.
//
// 왜 PNG인가:
//   border-radius로 흉내내면 모서리가 안티에일리어싱된 곡선이 되어 "웹 카드"로
//   읽힌다. DS 창틀의 정체성은 모서리가 픽셀 계단이라는 점이다.
//
// 왜 얇은가:
//   4세대 창은 '외곽선 1px + 흰 하이라이트 1px + 밝은 채움'이다. 띠를 여러 겹
//   쌓으면 GBA·패미컴 쪽으로 넘어가 지나치게 낡아 보인다.
//
// 사용:  node scripts/genUiFrames.mjs
// 출력:  public/images/ui/{win,btn}-*.png
// ─────────────────────────────────────────────────────────────────────────────
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ── 최소 PNG 인코더 (RGBA8, 무필터) ──────────────────────────────────────────
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const encodePng = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
};

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const NONE = [0, 0, 0, 0];

// ── 라운드 사각형 포함 판정 (모서리를 픽셀 계단으로 깎는다) ──────────────────
const inside = (x, y, w, h, r) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (r <= 0) return true;
  const cx = x < r ? r - 0.5 - x : x >= w - r ? x - (w - r) + 0.5 : 0;
  const cy = y < r ? r - 0.5 - y : y >= h - r ? y - (h - r) + 0.5 : 0;
  if (cx === 0 || cy === 0) return true;
  return Math.hypot(cx + 0.5, cy + 0.5) <= r;
};

// ── 렌더 ─────────────────────────────────────────────────────────────────────
// 채움까지 PNG에 구워 border-image의 fill 키워드로 중앙을 한 번에 그린다.
// 채움을 CSS 배경으로 두면 깎아낸 모서리 바깥으로 네모난 색이 삐져나온다.
//
// 띠는 바깥에서 안쪽으로 임의 겹수를 쌓는다.
//
// 참고한 구조(포케로그): 얇은 검은 외곽선 → 밝은 액센트 띠 2겹 → 어두운 안쪽
// 그림자 → 탁한 보라회색 채움. 채움색은 테마와 무관하게 공통이고, 테마는
// '액센트 띠 색'만 바꾼다. 그래서 창이 여러 색이어도 화면이 산만해지지 않는다.
//
// 파일을 가져온 게 아니라 구조만 참고해 다시 그린 것이다. 포케로그는
// AGPL-3.0-only 라 코드·에셋을 복사하면 이 프로젝트까지 전염된다.
// 두께 두 종류를 만든다.
//
//  normal : 큰 창·큰 버튼용. 띠 4겹.
//  thin   : X 버튼, 로그아웃처럼 작은 컨트롤용. 띠 2겹.
//
// thin이 필요한 이유: normal 창틀은 사방 12px(4 art px × SCALE 3)을 먹는다.
// 44×36 짜리 X 버튼에 씌우면 가로 44 중 24가 테두리라 버튼이 거의 전부
// 테두리가 되고, 납작한 컨트롤이 아니라 부풀어 오른 덩어리로 보인다.
// 포케로그도 같은 문제를 WindowVariant(NORMAL/THIN/XTHIN)로 푼다.
export const NORMAL = { size: 20, radius: 4, depth: 4 };
export const THIN = { size: 12, radius: 2, depth: 2 };

const render = (bands, fill, geo) => {
  const { size, radius } = geo;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let depth = -1;
      for (let k = 0; k <= bands.length; k++) {
        if (inside(x - k, y - k, size - 2 * k, size - 2 * k, Math.max(0, radius - k))) depth = k;
        else break;
      }
      const c = depth < 0 ? NONE : depth < bands.length ? bands[depth] : fill;
      buf.set(c, (y * size + x) * 4);
    }
  }
  return buf;
};

// ── 팔레트 ───────────────────────────────────────────────────────────────────
//
// 패널 면은 딥 슬레이트 네이비. 채도를 낮게 유지하는 게 핵심이다. 이 게임 앞에는
// 1025종 스프라이트가 온갖 색으로 올라오고 맵은 초록·황토·파랑이라, 패널이
// 채도를 가지면 어떤 타입 색과는 반드시 충돌하고 스프라이트가 묻힌다.
// 정체성은 면이 아니라 '테두리 액센트'가 진다.
//
// 이 값들은 src/styles/tokens.ts 의 C.ink / C.panel / C.panelBtn / C.panelSunk
// 와 반드시 같아야 한다. 창틀 PNG에 구워지는 값이라 어긋나면 이음매가 보인다.

/** 모든 창의 바깥 외곽선 */
const INK = '#161b28';
/** 모든 창의 공통 채움 — 테마는 액센트 띠 색만 바꾼다 */
const FILL_WIN = '#39415c';
/** 버튼은 창보다 한 톤 밝게 해서 눌러야 할 면임을 알린다 */
const FILL_BTN = '#4a5372';
/** 눌린 버튼은 창보다 어둡게 — 안으로 들어간 면 */
const FILL_IN  = '#2c3348';

// 어두운 액센트는 네이비 면 위에서 그림자로 읽혀야 하므로 전부 남색 쪽으로
// 당겨 잡았다. 보라 계열로 두면 면과 이질적으로 뜬다.
//        밝은 액센트  어두운 액센트
const ACCENT = {
  plain:  ['#c5cbd8', '#4e5670'],
  red:    ['#dd5748', '#7a3a44'],
  teal:   ['#48ddaa', '#2f6a6b'],
  gold:   ['#ebc07c', '#7a6340'],
  blue:   ['#6fa8e8', '#3a5a8c'],
  purple: ['#b48ce0', '#5a4a80'],
  green:  ['#7fd070', '#3f6a52'],
  cyan:   ['#6fd8e8', '#3a6a80'],
  navy:   ['#8a9ccc', '#333c5c'],
};

const write = (file, bands, fill, geo) =>
  writeFileSync(`public/images/ui/${file}.png`, encodePng(geo.size, geo.size, render(bands, fill, geo)));

mkdirSync('public/images/ui', { recursive: true });
let n = 0;
for (const [name, [lo, hi]] of Object.entries(ACCENT)) {
  // 바깥→안쪽: 검은 외곽선 / 밝은 액센트 2겹 / 어두운 안쪽 그림자
  const bands   = [hex(INK), hex(lo), hex(lo), hex(hi)];
  // 눌림 — 액센트 띠의 명암을 뒤집고 채움을 어둡게 해서 파이게 한다
  const inBands = [hex(INK), hex(hi), hex(hi), hex(lo)];
  write(`win-${name}`,    bands,   hex(FILL_WIN), NORMAL);
  write(`btn-${name}`,    bands,   hex(FILL_BTN), NORMAL);
  write(`btn-${name}-in`, inBands, hex(FILL_IN),  NORMAL);

  // 얇은 변형 — 작은 컨트롤용. 띠가 2겹뿐이라 납작하게 읽힌다.
  const thin   = [hex(INK), hex(lo)];
  const thinIn = [hex(INK), hex(hi)];
  write(`win-${name}-thin`,    thin,   hex(FILL_WIN), THIN);
  write(`btn-${name}-thin`,    thin,   hex(FILL_BTN), THIN);
  write(`btn-${name}-thin-in`, thinIn, hex(FILL_IN),  THIN);
  n += 6;
}
console.log('생성 완료:', n, '개');
