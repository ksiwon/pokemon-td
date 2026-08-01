// sim/support/mocks/firebase.ts
// src/config/firebase 대체 mock.
//
// 예전엔 rtdb=undefined 인 전면 no-op 이었다 — 그래서 MultiplayerService(1500줄, 방·페이즈·
// 트랜잭션 전부)가 시뮬에서 **한 줄도 실행되지 않았다**. 멀티 하네스(sim/multi)는 페이즈 머신을
// 로컬에서 다시 구현해 우회했고, 그 결과 "실제 프로토콜"은 검증 공백이었다.
// 이제 rtdb 는 sim/net/rtdb.ts 의 인메모리 RTDB 를 가리킨다. 실코드 그대로 돌리기 위한 것.
//
// Firestore(db)/Auth(auth)는 여전히 undefined — 그쪽은 DatabaseService/AuthService mock 이 막는다.

import {
  getDatabase, ref, onValue, goOffline, goOnline, onDisconnect, set, serverTimestamp,
  myClientId, registerClient,
} from '../../net/rtdb';

export const auth: any = undefined;
export const db: any = undefined;
export const googleProvider: any = undefined;

export const rtdb: any = getDatabase();

// 이 모듈 그래프를 소유한 클라이언트를 세계에 등록(이미 있으면 옵션 유지).
const G = globalThis as any;
if (!G.__SIM_RTDB_WORLD?.clients?.has(myClientId())) {
  registerClient(myClientId(), G.__SIM_CLIENT_OPTS ?? undefined);
}

type ConnectedCallback = (isConnected: boolean) => void;
const connectedListeners = new Set<ConnectedCallback>();
let _rtdbConnected = false;
let _serverTimeOffset = 0;
let _rtdbListenersActive = false;
let _rtdbIntentionallyOffline = false;

export function initRtdbListeners(): void {
  if (_rtdbIntentionallyOffline) {
    _rtdbIntentionallyOffline = false;
    try { goOnline(rtdb); } catch { /* ignore */ }
  }
  if (_rtdbListenersActive) return;
  _rtdbListenersActive = true;

  onValue(ref(rtdb, '.info/connected'), (snap) => {
    _rtdbConnected = snap.val() === true;
    connectedListeners.forEach(cb => { try { cb(_rtdbConnected); } catch { /* ignore */ } });
  });
  onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
    _serverTimeOffset = snap.val() || 0;
  });
}

export function releaseRtdbConnection(): void {
  if (_rtdbIntentionallyOffline) return;
  try {
    goOffline(rtdb);
    _rtdbIntentionallyOffline = true;
    _rtdbConnected = false;
  } catch { /* ignore */ }
}

export function isRtdbReleased(): boolean { return _rtdbIntentionallyOffline; }

export function onRtdbConnected(cb: ConnectedCallback): () => void {
  connectedListeners.add(cb);
  try { cb(_rtdbConnected); } catch { /* ignore */ }
  return () => { connectedListeners.delete(cb); };
}

export function isRtdbConnected(): boolean { return _rtdbConnected; }

export function getServerTimeOffset(): number { return _serverTimeOffset; }

export function serverNow(): number { return Date.now() + _serverTimeOffset; }

/** 실 모듈과 동일: connected 가 true 가 되는 시점에 onDisconnect 훅을 걸고 online 을 쓴다. */
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
      await onDisconnect(presRef).set(payloadOffline);
      await set(presRef, payloadOnline);
    } catch { /* ignore */ }
  });

  return () => {
    try {
      set(presRef, payloadOffline).catch(() => {});
      onDisconnect(presRef).cancel().catch(() => {});
    } catch { /* ignore */ }
    unsubscribe();
  };
}
