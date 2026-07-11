// sim/support/mocks/firebase.ts
// src/config/firebase 대체 mock — 시뮬은 네트워크/Firebase 전면 차단.
// 실제 모듈과 동일한 export 표면을 유지한다.

export const auth: any = undefined;
export const db: any = undefined;
export const rtdb: any = undefined;
export const googleProvider: any = undefined;

export function initRtdbListeners(): void {}

export function onRtdbConnected(cb: (c: boolean) => void): () => void {
  try { cb(false); } catch { /* ignore */ }
  return () => {};
}

export function isRtdbConnected(): boolean { return false; }

export function getServerTimeOffset(): number { return 0; }

export function serverNow(): number { return Date.now(); }

export function registerPresence(): () => void { return () => {}; }
