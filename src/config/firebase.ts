// src/config/firebase.ts
// ──────────────────────────────────────────────────────────────────
// [FIX-4b] Firestore 오프라인 persistence 활성화
// [FIX-RTDB] RTDB 연결 상태 감시
// [FIX-V5] 서버 시간 동기 노출, 재연결 훅 단일화, onDisconnect 헬퍼 제공
// [FREE-TIER] RTDB 연결을 lazy 초기화 — 싱글플레이어는 RTDB 연결 없음
//   무료 플랜 동시 연결 100개 한도를 멀티플레이어에만 사용하도록 보존

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  getDatabase, ref, onValue, onDisconnect, set, serverTimestamp,
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

/**
 * 멀티플레이어 진입 시 한 번만 호출. RTDB 실시간 구독을 시작한다.
 * 이후 중복 호출은 no-op.
 */
export function initRtdbListeners(): void {
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