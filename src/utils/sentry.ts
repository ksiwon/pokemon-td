// src/utils/sentry.ts
// Sentry — 프로덕션 에러 가시성 + **몇 명이 들어왔는지**.
// [PERF] DSN이 설정된 프로덕션 빌드에서만 '동적 import'로 로드 —
//   초기 청크에 Sentry(~30KB gzip)가 포함되지 않고, DSN 미설정 시 완전 비활성.
// [FREE-TIER] 에러 모니터링 + 세션만 사용(tracing/replay 없음). 세션은 과금 대상이
//   아니라 Stats(사용량) 화면에 아예 안 나온다 — Releases 화면에서 본다.
//
// ─── 왜 여기서 사람을 세는가 ────────────────────────────────────────────────
// Firebase는 **로그인한 사람만** 센다. 이 게임엔 「오프라인으로 플레이」가 있어서
// 그 길로 들어온 사람은 계정이 아예 안 생기고, 그래서 users 컬렉션에 흔적이 없다.
// Sentry의 세션은 화면이 뜨는 순간 남으므로 로그인과 무관하게 방문을 센다.
//
// 보는 곳: Sentry → **Releases** → Display 드롭다운에서 Sessions ↔ Users.
//
// ⚠️ **release가 없으면 아무것도 안 보인다.** 그 화면이 릴리스 단위로만 열린다.
//   여기 release를 빼면 세션은 나가는데 볼 데가 없다 — 실제로 그 상태였다.
// ⚠️ **lifecycle은 'page'다.** SDK 기본값은 'route'라 화면을 옮길 때마다 세션을
//   새로 시작한다. 메뉴 → 맵 선택 → 게임으로 라우트가 바뀌는 이 SPA에서는 한 사람이
//   세션 서너 개로 부풀어 보인다.
// ⚠️ **id는 브라우저에 저장한 UUID 하나뿐이다.** 이름도 이메일도 IP도 안 보낸다 —
//   같은 브라우저를 한 사람으로 묶는 것이 전부고, 그래야 Users 수가 나온다.

type SentryModule = typeof import('@sentry/react');

let sentryPromise: Promise<SentryModule | null> | null = null;

const VISITOR_KEY = 'aegis.visitor';

/** 이 브라우저를 가리키는 이름 없는 번호. 사생활 보호 모드면 undefined. */
function visitorId(): string | undefined {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return undefined; // 저장이 막힌 브라우저 — 세션만 세고 사람은 못 묶는다
  }
}

/** 앱 부트 시 1회 호출. DSN 없음/개발 모드면 no-op. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || import.meta.env.DEV) return; // 개발 중 소음·이벤트 낭비 방지
  if (sentryPromise) return;

  sentryPromise = import('@sentry/react')
    .then(Sentry => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: `pokemon-aegis@${__APP_VERSION__}`,
        // 기본 통합 목록과 이름으로 합쳐진다 — 같은 이름이면 이쪽이 이긴다
        integrations: [Sentry.browserSessionIntegration({ lifecycle: 'page' })],
        // 동일 오류 도배는 SDK 기본 Dedupe 통합이 걸러줌(별도 설정 불필요)
      });
      const id = visitorId();
      if (id) Sentry.setUser({ id });
      return Sentry;
    })
    .catch(err => {
      console.warn('[sentry] 초기화 실패(무시):', err);
      return null;
    });
}

/**
 * 명시적 예외 보고 — React ErrorBoundary처럼 Sentry 전역 핸들러가
 * 잡지 못하는 지점에서 사용. 초기화 전/미설정이면 조용히 무시.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  sentryPromise?.then(Sentry => {
    if (!Sentry) return;
    Sentry.captureException(error, context ? { extra: context } : undefined);
  });
}
