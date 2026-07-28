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
  readonly VITE_SENTRY_DSN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}