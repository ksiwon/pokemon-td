// sim/support/mocks/AuthService.ts
// src/services/AuthService 대체 mock.
// 기본은 비로그인(오프라인) — 기존 시뮬 전부가 이 전제로 돈다.
// 2인 멀티 하네스는 클라이언트마다 모듈 그래프를 새로 만들고(vi.resetModules),
// import 직전에 globalThis.__SIM_AUTH_USER 를 심어 "그 클라이언트의 로그인 유저"를 주입한다.

const G = globalThis as any;

export interface SimUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  rating: number;
  createdAt: number;
}

let currentUser: SimUser | null = (G.__SIM_AUTH_USER as SimUser | undefined) ?? null;

const listeners = new Set<(u: SimUser | null) => void>();

const known: Record<string, any> = {
  getCurrentUser: () => currentUser,
  isOfflineMode: () => currentUser === null,
  onAuthStateChange: (cb: (u: SimUser | null) => void) => {
    listeners.add(cb);
    try { cb(currentUser); } catch { /* ignore */ }
    return () => { listeners.delete(cb); };
  },
  signOut: async () => { currentUser = null; listeners.forEach(cb => cb(null)); },
  /** 테스트 전용 — 이 모듈 그래프의 로그인 유저 교체. */
  __setUser: (u: SimUser | null) => {
    currentUser = u;
    listeners.forEach(cb => { try { cb(u); } catch { /* ignore */ } });
  },
};

export const authService: any = new Proxy(known, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return () => null;
  },
});
