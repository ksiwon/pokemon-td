// src/utils/sentry.ts
// Sentry 에러 모니터링 — 프로덕션 에러 가시성.
// [PERF] DSN이 설정된 프로덕션 빌드에서만 '동적 import'로 로드 —
//   초기 청크에 Sentry(~30KB gzip)가 포함되지 않고, DSN 미설정 시 완전 비활성.
// [FREE-TIER] 에러 모니터링만 사용(tracing/replay 없음) — 무료 5,000건/월로 충분.

type SentryModule = typeof import('@sentry/react');

let sentryPromise: Promise<SentryModule | null> | null = null;

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
        // 동일 오류 도배는 SDK 기본 Dedupe 통합이 걸러줌(별도 설정 불필요)
      });
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
