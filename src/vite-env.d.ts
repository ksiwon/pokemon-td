/// <reference types="vite/client" />

// 선택: 커스텀 키가 있다면 명시적으로 선언
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_DATABASE_URL?: string
  /** App Check(reCAPTCHA v3) 사이트 키. 없으면 App Check 비활성. */
  readonly VITE_FIREBASE_APPCHECK_SITE_KEY?: string
  /** 로컬 개발용 App Check 고정 디버그 토큰. DEV 빌드에서만 사용, 커밋 금지. */
  readonly VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?: string
  readonly VITE_SENTRY_DSN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json의 버전. vite.config.ts의 define이 빌드 때 박아 넣는다. */
declare const __APP_VERSION__: string