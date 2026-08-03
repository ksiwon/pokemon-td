// src/utils/chunkReload.ts
//
// [STALE-CHUNK] 새 배포가 뜨면 Netlify는 이전 스냅샷의 청크 파일을 지운다.
// 그 순간 페이지를 열어둔 탭은 여전히 예전 해시(예: MapSelector-N1nSLmnp.js)를 요청하는데,
// netlify.toml의 SPA 폴백(/* → /index.html 200) 때문에 404가 아니라 index.html이 200 text/html로 온다.
// 브라우저는 그 HTML을 JS 모듈로 파싱하려다 실패 →
//   TypeError: Failed to fetch dynamically imported module
// 코드가 상한 게 아니라 파일이 사라졌을 뿐이므로, 새로고침 한 번이면 최신 청크로 완전히 복구된다.
// (index.html은 max-age=0·must-revalidate라 일반 새로고침으로 충분하다.)
//
// 주의: 이 코드는 "탭에 이미 로드된 번들" 안에서 돈다.
//   → 이 파일이 포함된 버전을 배포하는 순간에는 아직 구버전을 든 탭을 구하지 못한다.
//     실제 효과는 그 다음 배포부터다.

const KEY = 'chunkReloadAt';
/** 새로고침 **이후** 이 시간 안에 또 실패하면 새 배포가 아니라 진짜 장애로 본다 → 새로고침 루프 방지 */
const COOLDOWN_MS = 10_000;

/**
 * 이 페이지 수명 안에서 이미 새로고침을 걸었는지. 리로드되면 모듈이 다시 로드되며 false로 돌아간다.
 * 이게 필요한 이유: reload()는 즉시 페이지를 끊지 않는다. 새로고침을 예약한 뒤에도 죽어가는 페이지에서
 * 후속 오류가 줄줄이 도착하는데(아래 ⚠ 참조), 그것들까지 전부 "처리됨"으로 삼켜야 에러 화면이 안 번쩍인다.
 * sessionStorage 쿨다운은 이 목적에 쓸 수 없다 — 그건 '새로고침을 건너서' 반복되는 루프를 막는 장치다.
 *
 * ⚠ 실제로 도착하는 후속 오류: Vite의 preload 헬퍼는 `import(...).catch(s)` 형태라
 *   vite:preloadError 리스너가 preventDefault()하면 rethrow 대신 **undefined로 resolve**된다.
 *   그러면 이어지는 `.then(m => ({ default: m.MapSelector }))`가 undefined를 읽어 2차 TypeError를 낸다.
 */
let reloadStarted = false;

/**
 * 새 배포로 청크가 사라진 상황이면 새로고침을 실행한다.
 * @returns 새로고침이 진행 중이면 true(내가 방금 걸었든, 이미 걸려 있든) — 호출부는 오류를 삼켜도 된다.
 *   false면 새로고침하지 않았다는 뜻이니 기존 에러 처리로 넘어가야 한다.
 *
 * 쿨다운 안이거나 sessionStorage를 쓸 수 없으면(시크릿 모드·저장소 차단) 새로고침하지 않는다.
 * 기록에 실패한 채 새로고침하면 영원히 반복되므로 "기록에 성공했을 때만 새로고침한다"가 안전 규칙이다.
 */
export const reloadForNewDeploy = (): boolean => {
  if (reloadStarted) return true; // 이미 나가는 중 — 다시 부르지 않고, 후속 오류는 삼키게 한다

  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    return false; // 저장소를 못 읽으면 기록도 못 한다 → 루프 위험, 새로고침 포기
  }
  if (Date.now() - last < COOLDOWN_MS) return false;

  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }

  reloadStarted = true;
  window.location.reload();
  return true;
};

/**
 * 동적 import 실패용 catch 핸들러.
 * 새로고침이 시작됐으면 **영원히 pending인 Promise**를 돌려준다 —
 * 여기서 throw하면 리로드가 실제로 일어나기 전 찰나에 에러 화면이 번쩍인다.
 * 새로고침을 안 했다면(쿨다운·저장소 차단 = 진짜 네트워크 장애) 원래 오류를 그대로 흘려보낸다.
 */
export const onChunkLoadError = <T>(err: unknown): Promise<T> => {
  if (reloadForNewDeploy()) return new Promise<T>(() => {});
  throw err;
};
