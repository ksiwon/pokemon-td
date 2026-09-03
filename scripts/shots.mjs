// scripts/shots.mjs
//
// 화면 캡처 도구 — `npm run shots [이름 ...]`
//
// 왜 있나: UI를 고칠 때 "빌드가 통과했다"는 화면이 멀쩡하다는 뜻이 아니다.
// 창틀이 삐져나오거나 글자가 잘리는 건 눈으로만 보인다. 이 스크립트는 dev 서버를
// 띄운 채 주요 화면을 순서대로 돌며 PNG로 남긴다.
//
// 전제:
//   · dev 서버가 이미 떠 있어야 한다(`npm run dev`, 기본 5180 — 아래 BASE 참고).
//   · 기본은 오프라인 진입이다. `auth: true` 로 표시한 화면은 게스트로 로그인해서 찍는다
//     (멀티 로비, 속도전 로비 등). 로그인이 되려면 두 가지가 갖춰져야 한다:
//       ① dev 서버가 **5173** 이어야 한다. Firebase API 키의 리퍼러 허용 목록이
//          `http://localhost:5173/*` 와 배포 도메인 둘뿐이다(포트 단위로 걸린다).
//       ② `.env` 의 `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` 이 채워져 있고 그 값이
//          Firebase 콘솔 App Check 의 디버그 토큰에 등록돼 있어야 한다. 비워 두면
//          SDK가 프로필마다 새 UUID를 만들어, 실행할 때마다 등록되지 않은 토큰으로
//          `exchangeDebugToken` 403 이 난다.
//
// 산출물: `shots/<이름>.png` (git에 올리지 않는다 — .gitignore 참고)

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

/**
 * dev 서버 주소. 포트가 두 개인 이유 — `.claude/launch.json` 은 5180 고정인데
 * `npm run dev` 는 vite 기본 5173으로 뜬다. 둘 다 두드려 보고 살아 있는 쪽을 쓴다.
 */
const PORTS = [5173, 5180];
async function findBase() {
  if (process.env.SHOTS_BASE) return process.env.SHOTS_BASE;
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return `http://localhost:${port}`;
    } catch { /* 다음 포트 */ }
  }
  console.error(`dev 서버를 못 찾았다 (${PORTS.join(', ')}). 먼저 \`npm run dev\` 를 띄울 것.`);
  process.exit(1);
}
const BASE = await findBase();
const OUT = 'shots';
const VIEWPORT = { width: 1280, height: 900 };
/** 좁은 화면 회귀용. 이름 뒤에 `@mobile` 을 붙이면 이 크기로 한 장 더 찍는다. */
const MOBILE = { width: 420, height: 860 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 로그인이 필요한 화면은 이 프로필을 재사용한다. 매번 빈 컨텍스트로 띄우면 게스트
 * 계정이 실행마다 새로 만들어져 Firebase에 익명 유저가 쌓인다. 프로필을 남겨 두면
 * 첫 실행에 만든 계정 하나로 계속 들어간다.
 */
const PROFILE = '.playwright-profile';
const GUEST_NAME = '캡처봇';

/** 글자 그대로인 버튼/칸을 눌러 준다. 없으면 조용히 넘어간다(화면 구성이 바뀔 수 있으므로). */
async function clickText(page, text, { exact = true, last = false } = {}) {
  const all = page.getByText(text, { exact });
  const el = last ? all.last() : all.first();
  try {
    await el.waitFor({ state: 'visible', timeout: 4000 });
    await el.click();
    await sleep(600);
    return true;
  } catch {
    console.warn(`  ! "${text}" 를 못 찾아 건너뜀`);
    return false;
  }
}

/**
 * 찍을 화면 목록.
 * 각 항목은 메인 메뉴에서 출발해 목적지까지 가는 조작을 담는다.
 */
const SHOTS = {
  menu: async () => {},

  docsSingle: async page => { await clickText(page, '자료실'); },
  docsMulti:  async page => { await clickText(page, '자료실'); await clickText(page, '멀티'); },
  docsCards:  async page => { await clickText(page, '자료실'); await clickText(page, '미니 포켓', { last: true }); },
  docsQuiz:   async page => { await clickText(page, '자료실'); await clickText(page, '퀴즈'); },

  guideCards: async page => { await clickText(page, '미니 포켓 가이드'); },

  // URL로 바로 들어가지 않는다. 새로고침이 걸리면 인증 복원이 끝나기 전에
  // ProtectedRoute가 먼저 판단해 메인으로 되돌아온다. 눌러서 들어갈 것.
  quizHub: async page => { await clickText(page, '포켓몬 퀴즈'); await sleep(2500); },

  // 싱글에 처음 들어가면 가이드가 먼저 뜬다 — 닫아야 맵 선택 화면이 보인다.
  mapSelect: async page => {
    await clickText(page, '싱글 플레이');
    await sleep(1200);
    await clickText(page, '✕');
    await sleep(1200);
  },

  patchNotes: async page => { await clickText(page, '패치노트'); },

  // ── 로그인이 필요한 화면 ───────────────────────────────────────────────────
  // 방을 만들지 않는 화면만 담는다. 방을 만들면 RTDB에 남아 실유저의 방 목록을
  // 더럽히고(TD는 상한 4), 끝나고 손으로 회수해야 한다.
  multiLobby:  { auth: true, go: async page => { await clickText(page, '멀티 플레이'); await sleep(2000); } },
  speedLobby:  { auth: true, go: async page => {
    await clickText(page, '포켓몬 퀴즈'); await sleep(2500);
    await clickText(page, '속도전 (멀티)'); await sleep(2500);
  } },
  rankings:    { auth: true, go: async page => { await clickText(page, '랭킹'); await sleep(2500); } },
  hallOfFame:  { auth: true, go: async page => { await clickText(page, '전당'); await sleep(2500); } },
  achievements: async page => { await clickText(page, '업적'); await sleep(1200); },
  settings: async page => {
    await page.locator('button[title]').last().click();
    await sleep(800);
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SHOTS);

await mkdir(OUT, { recursive: true });

/** 항목은 함수이거나 `{ auth, go }` 다. 둘 다 같은 모양으로 편다. */
const normalize = v => (typeof v === 'function' ? { auth: false, go: v } : v);

/** 로그인 화면이면 게스트로 들어간다. 이미 세션이 있으면 아무 것도 하지 않는다. */
async function ensureSignedIn(page) {
  if (!/\/login/.test(page.url())) return true;
  await clickText(page, '게스트로 플레이');
  const box = page.locator('input').first();
  if (await box.count()) await box.fill(GUEST_NAME);
  await clickText(page, '게스트로 입장');
  await sleep(5000);
  if (/\/login/.test(page.url())) {
    console.error('  ! 로그인 실패 — dev 서버가 5173인지, App Check 디버그 토큰이 등록됐는지 확인할 것');
    return false;
  }
  return true;
}

const browser = await chromium.launch();
/** 로그인 컨텍스트는 하나만 열어 재사용한다(프로필 디렉터리는 동시에 못 연다). */
let authCtx = null;

for (const raw of names) {
  const [name, size] = raw.split('@');
  const entry = SHOTS[name] && normalize(SHOTS[name]);
  if (!entry) { console.error(`알 수 없는 화면: ${name}`); continue; }

  const viewport = size === 'mobile' ? MOBILE : VIEWPORT;
  let ctx;
  if (entry.auth) {
    // 프로필은 창 크기를 기억하므로 모바일 컷이 섞이면 새로 연다.
    if (authCtx && authCtx._size !== size) { await authCtx.close(); authCtx = null; }
    if (!authCtx) {
      authCtx = await chromium.launchPersistentContext(PROFILE, {
        headless: true, viewport, deviceScaleFactor: 2,
      });
      authCtx._size = size;
    }
    ctx = authCtx;
  } else {
    ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  }

  const page = ctx.pages()[0] && entry.auth ? ctx.pages()[0] : await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  if (entry.auth) {
    if (!(await ensureSignedIn(page))) { if (!entry.auth) await ctx.close(); continue; }
    await sleep(1500);
  } else {
    // 새 컨텍스트는 매번 로그인 화면에서 시작한다(세션이 비어 있으므로).
    await clickText(page, '오프라인으로 플레이', { exact: false });
  }
  // 배경 맵 타일까지 그려지길 기다린다. 너무 일찍 찍으면 빈 화면이 나온다.
  await sleep(2000);
  await entry.go(page);
  await sleep(400);

  const file = `${OUT}/${raw.replace('@', '-')}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}${errors.length ? `  ⚠ 페이지 오류 ${errors.length}건: ${errors[0]}` : ''}`);
  if (!entry.auth) await ctx.close();
}

if (authCtx) await authCtx.close();
await browser.close();
