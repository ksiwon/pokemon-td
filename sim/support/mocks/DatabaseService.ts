// sim/support/mocks/DatabaseService.ts
// src/services/DatabaseService 대체 mock — Firestore 접근 전부 no-op.
// 어떤 메서드를 호출해도 즉시 resolve되는 async no-op을 반환한다.

export const databaseService: any = new Proxy({}, {
  get(_target, prop: string) {
    if (prop === 'then') return undefined; // await databaseService 방어
    return async () => undefined;
  },
});
