// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { I18nProvider } from './i18n'
import { BrowserRouter } from 'react-router-dom'
import { initSentry, captureError } from './utils/sentry'
import { reloadForNewDeploy } from './utils/chunkReload'

// [STALE-CHUNK] 새 배포로 사라진 청크를 요청했을 때(= 배포 중 열어둔 탭) 조용히 최신 버전으로 다시 들어온다.
//   Vite가 모든 동적 import를 __vitePreload로 감싸므로, 이 이벤트 하나로 라우트 청크뿐 아니라
//   서비스 계층의 import(GameManager·WaveSystem·AIPlayer 등)까지 전부 걸린다.
//   App.tsx의 lazyRoute가 라우트는 먼저 처리하지만(로딩 화면 유지), 그 밖은 여기가 마지막 그물.
//   preventDefault()는 "처리했으니 그대로 throw하지 말라"는 Vite와의 약속 — 자세한 사정은 chunkReload.ts.
window.addEventListener('vite:preloadError', (e) => {
  console.warn('[vite:preloadError] 청크 로드 실패 — 새 배포로 판단하고 새로고침 시도')
  if (reloadForNewDeploy()) e.preventDefault()
})

// Sentry 에러 모니터링(프로덕션 + DSN 설정 시에만, 동적 로드).
// 전역 onerror/unhandledrejection은 Sentry 자체 핸들러가 수집하므로
// 아래 수동 리스너에서는 중복 보고하지 않는다.
initSentry()

// [OFFLINE-FIX] 렌더 단계에서 예기치 못한 오류가 나도 화이트스크린 대신 안내 + 새로고침을 보여준다.
//   (Firebase 등 초기화 실패의 최종 안전망. 모듈-로드 throw는 firebase.ts/AuthService 방어로 별도 차단.)
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('[RootErrorBoundary] 렌더 오류:', error, info)
    // 렌더 오류는 ErrorBoundary가 삼켜서 Sentry 전역 핸들러에 안 잡힘 → 명시적 보고
    captureError(error, { componentStack: (info as { componentStack?: string })?.componentStack })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#0a0c16', color: '#e8edf5', textAlign: 'center', padding: 24,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40 }}>🛡️</div>
          <h1 style={{ fontSize: 20, margin: 0 }}>일시적인 오류가 발생했어요</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
            네트워크 또는 서버 연결에 문제가 있을 수 있습니다.<br />
            새로고침해도 계속되면 로그인 화면에서 <b>오프라인으로 플레이</b>를 이용해 주세요.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '10px 24px', borderRadius: 10, border: 'none',
              background: '#c084fc', color: '#07090f', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}
          >새로고침</button>
        </div>
      )
    }
    return this.props.children
  }
}

// 처리되지 않은 Promise 거부/전역 오류를 콘솔에 남겨 디버깅을 돕는다(화면은 유지).
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
})
window.addEventListener('error', (e) => {
  console.error('[window.onerror]', e.error ?? e.message)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>,
)
