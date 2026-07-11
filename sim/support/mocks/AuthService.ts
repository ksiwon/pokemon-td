// sim/support/mocks/AuthService.ts
// src/services/AuthService 대체 mock — 항상 비로그인(오프라인) 상태.
// 알려진 메서드는 명시 구현, 그 외 접근은 no-op 함수 반환(Proxy).

const known: Record<string, any> = {
  getCurrentUser: () => null,
  isOfflineMode: () => true,
  onAuthStateChange: (_cb: any) => () => {},
  signOut: async () => {},
};

export const authService: any = new Proxy(known, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return () => null;
  },
});
