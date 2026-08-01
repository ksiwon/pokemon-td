// src/config/firebase.ts
// ──────────────────────────────────────────────────────────────────
// [FIX-4b] Firestore 오프라인 persistence 활성화
// [FIX-RTDB] RTDB 연결 상태 감시
// [FIX-V5] 서버 시간 동기 노출, 재연결 훅 단일화, onDisconnect 헬퍼 제공
// [FREE-TIER] RTDB 연결을 lazy 초기화 — 싱글플레이어는 RTDB 연결 없음
//   무료 플랜 동시 연결 100개 한도를 멀티플레이어에만 사용하도록 보존

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  getDatabase, ref, onValue, onDisconnect, set, serverTimestamp, goOffline, goOnline,
} from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// [OFFLINE-FIX] 초기화를 try/catch로 감싼다.
//   env 누락/오설정 등으로 Firebase SDK 초기화가 throw하면 이 모듈을 import하는 앱 전체가
//   렌더 이전에 죽어 '화이트스크린'이 됐다(오프라인 모드조차 진입 불가). 오프라인 모드는 Firebase
//   없이 LocalStorage만으로 동작하므로, 여기서 실패를 삼키고 소비자(AuthService 등)가 각자 방어한다.
let _app: ReturnType<typeof initializeApp> | undefined;
let _auth: ReturnType<typeof getAuth> | undefined;
let _db: ReturnType<typeof initializeFirestore> | undefined;
let _rtdb: ReturnType<typeof getDatabase> | undefined;
let _googleProvider: GoogleAuthProvider | undefined;

try {
  _app = initializeApp(firebaseConfig);

  // [APP-CHECK] 무료 플랜엔 Cloud Functions가 없어 서버측 유량 제어가 불가능하다.
  //   익명 로그인이 열려 있어 스크립트로 계정을 무한 생성하면 읽기/쓰기 쿼터를
  //   외부에서 통째로 소진시킬 수 있는데, App Check(reCAPTCHA v3)는 Spark에서 무료로
  //   "이 요청이 진짜 우리 웹앱에서 왔는가"를 검증해준다. 사실상 유일한 방어선.
  //   ※ 코드만으로는 토큰을 붙일 뿐이고, 실제 차단은 Firebase 콘솔에서
  //     Firestore/RTDB에 App Check '적용(enforce)'을 켜야 발동한다.
  //   사이트 키가 없으면(로컬/미설정) 조용히 건너뛴다 — 기존 배포가 깨지지 않도록.
  initAppCheck(_app);

  _auth = getAuth(_app);
  _db = initializeFirestore(_app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  _googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error('[firebase] 초기화 실패 — 오프라인 모드로만 이용 가능합니다.', e);
}

function initAppCheck(app: ReturnType<typeof initializeApp>): void {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;
  if (!siteKey) {
    if (import.meta.env.PROD) {
      console.warn('[firebase] App Check 사이트 키 미설정 — 쿼터 어뷰징 방어가 비활성화됩니다.');
    }
    return;
  }
  try {
    // 개발 빌드는 reCAPTCHA 대신 '디버그 토큰'으로 통과한다(구글이 정한 로컬 개발 경로).
    //   → 사이트 키는 DEV에서 검증에 쓰이지 않는다. .env에 키를 넣어도 이 토큰을
    //     Firebase 콘솔에 등록하지 않으면 enforce가 켜진 순간 로컬이 막힌다.
    //
    //   VITE_FIREBASE_APPCHECK_DEBUG_TOKEN을 지정하면 그 값을 고정 토큰으로 쓴다.
    //   지정하지 않으면 SDK가 브라우저 프로필마다 랜덤 UUID를 새로 만들어 콘솔에 찍고,
    //   기기·브라우저를 바꿀 때마다 등록을 반복해야 한다.
    //
    //   ※ 이 토큰은 App Check를 무력화하는 값이다. 커밋·프로덕션 환경변수 금지.
    //     아래 분기는 PROD 빌드에서 통째로 제거되므로 배포 번들에는 남지 않는다.
    if (import.meta.env.DEV) {
      const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined;
      (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
      if (!debugToken) {
        console.info(
          '[firebase] App Check 디버그 토큰 자동 생성 모드입니다. 아래 로그의 토큰을 ' +
          'Firebase 콘솔(App Check → 앱 → ⋮ → 디버그 토큰 관리)에 등록하세요. ' +
          '.env의 VITE_FIREBASE_APPCHECK_DEBUG_TOKEN에 고정값을 넣으면 재등록이 필요 없습니다.'
        );
      }
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // App Check 실패가 앱 전체를 막아선 안 된다(오프라인 모드 진입조차 못 하게 됨).
    console.warn('[firebase] App Check 초기화 실패 — 검증 없이 계속합니다.', e);
  }
}

// RTDB는 별도 격리 — databaseURL 미지정 등으로 실패해도 Auth/Firestore(및 오프라인)는 살린다.
try {
  if (_app) _rtdb = getDatabase(_app);
} catch (e) {
  console.error('[firebase] RTDB 초기화 실패 — 멀티플레이만 비활성화됩니다.', e);
}

export const auth = _auth as ReturnType<typeof getAuth>;
export const db = _db as ReturnType<typeof initializeFirestore>;
export const rtdb = _rtdb as ReturnType<typeof getDatabase>;
export const googleProvider = _googleProvider as GoogleAuthProvider;

// ─── [FIX-RTDB] RTDB 연결 상태 감시 ────────────────────────────
// [FREE-TIER] 무료 플랜 동시 연결 100개 한도 보호:
//   모듈 로드 시 즉시 연결하지 않고, initRtdbListeners() 호출 시에만 연결.
//   싱글플레이어 유저는 RTDB를 전혀 사용하지 않아 연결 슬롯을 소모하지 않음.
type ConnectedCallback = (isConnected: boolean) => void;
const connectedListeners = new Set<ConnectedCallback>();
let _rtdbConnected = false;
let _serverTimeOffset = 0;
let _rtdbListenersActive = false;

// [FREE-TIER] 동시 연결 슬롯(무료 100개) 반납.
//   예전엔 한 번 연결하면 탭이 닫힐 때까지 슬롯을 계속 점유했다. 로비만 열어 보고
//   싱글로 돌아간 유저도 계속 1슬롯을 먹어, "12방 × 8명 = 96 + 여유 4" 산정이 실제와 달랐다.
//   멀티 관련 화면이 전부 빠져나가면 goOffline()으로 소켓을 끊어 슬롯을 돌려준다.
//   ※ "언제 반납할지"(참조 카운트)는 MultiplayerService가 단독으로 판단한다.
//     여기서도 카운트를 세면 두 곳이 각자 세다가 어긋난다.
let _rtdbIntentionallyOffline = false;

/**
 * 멀티플레이어 화면(로비/게임) 진입 시 호출. RTDB 실시간 구독을 시작한다.
 * 반납해 둔 연결이 있으면 다시 연결한다. 중복 호출은 안전(멱등).
 */
export function initRtdbListeners(): void {
  // 이전에 슬롯을 반납해 둔 상태면 다시 연결한다.
  if (_rtdbIntentionallyOffline) {
    _rtdbIntentionallyOffline = false;
    try { goOnline(rtdb); } catch (e) { console.warn('[firebase] goOnline 실패:', e); }
  }

  if (_rtdbListenersActive) return;
  _rtdbListenersActive = true;

  onValue(ref(rtdb, '.info/connected'), (snap) => {
    const prev = _rtdbConnected;
    _rtdbConnected = snap.val() === true;
    if (prev !== _rtdbConnected) {
      console.log(`[firebase] RTDB connected: ${_rtdbConnected}`);
    }
    connectedListeners.forEach(cb => {
      try { cb(_rtdbConnected); } catch (e) { console.error(e); }
    });
  });

  // [FIX-V5] 서버 시간 오프셋을 전역으로 관리 (모든 서비스가 동일한 값을 보도록)
  onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
    _serverTimeOffset = snap.val() || 0;
  });
}

/**
 * 멀티플레이어를 완전히 벗어났을 때 호출(호출 시점 판단은 MultiplayerService 담당).
 * 소켓을 끊어 동시 연결 슬롯을 반납한다. 중복 호출은 안전(멱등).
 * `.info/connected` 구독은 유지되므로 goOnline() 시 그대로 되살아난다.
 */
export function releaseRtdbConnection(): void {
  if (_rtdbIntentionallyOffline) return;
  try {
    goOffline(rtdb);
    _rtdbIntentionallyOffline = true;
    _rtdbConnected = false;
    console.log('[firebase] RTDB 연결 반납 — 동시 연결 슬롯 회수');
  } catch (e) {
    console.warn('[firebase] goOffline 실패:', e);
  }
}

/** RTDB 연결을 의도적으로 끊어 둔 상태인지(디버그·테스트용). */
export function isRtdbReleased(): boolean {
  return _rtdbIntentionallyOffline;
}

/** RTDB 연결 상태 구독. 반환값은 구독 해제 함수. */
export function onRtdbConnected(cb: ConnectedCallback): () => void {
  connectedListeners.add(cb);
  // 즉시 현재 상태 전달
  try { cb(_rtdbConnected); } catch (e) { console.error(e); }
  return () => { connectedListeners.delete(cb); };
}

/** 현재 RTDB 연결 여부 동기 조회 */
export function isRtdbConnected(): boolean {
  return _rtdbConnected;
}

/** 서버 시간 오프셋 (ms). 클라이언트 시각 → 서버 시각 보정용 */
export function getServerTimeOffset(): number {
  return _serverTimeOffset;
}

/** 서버 기준 현재 시각 (ms) */
export function serverNow(): number {
  return Date.now() + _serverTimeOffset;
}

/**
 * [FIX-V5] 플레이어 Presence 등록.
 * 유저가 브라우저를 닫거나 네트워크가 끊기면 자동으로 Firebase가
 * presencePath를 `{ online: false, lastSeen: <serverTimestamp> }` 로 업데이트하고,
 * `disconnectCleanupPath` 를 준비된 값으로 교체합니다.
 *
 * 반환: 수동으로 해제(로그아웃 등)할 때 호출하는 함수.
 */
export function registerPresence(
  presencePath: string,
  payloadOnline: Record<string, unknown> = { online: true },
  payloadOffline: Record<string, unknown> = { online: false, lastSeen: serverTimestamp() },
): () => void {
  const presRef = ref(rtdb, presencePath);
  const connectedRef = ref(rtdb, '.info/connected');

  const unsubscribe = onValue(connectedRef, async (snap) => {
    if (snap.val() !== true) return;
    try {
      // 먼저 disconnect 훅을 설정 (반드시 online write 전에)
      await onDisconnect(presRef).set(payloadOffline);
      await set(presRef, payloadOnline);
    } catch (err) {
      console.warn('[firebase] registerPresence failed:', err);
    }
  });

  return () => {
    try {
      // 즉시 offline 처리
      set(presRef, payloadOffline).catch(() => {});
      // onDisconnect 취소
      onDisconnect(presRef).cancel().catch(() => {});
    } catch (e) { /* ignore */ }
    unsubscribe();
  };
}