// sim/app/chunkReload.sim.ts
// 배포 직후 '구버전 탭'이 사라진 청크를 요청할 때의 자동 새로고침 규칙 회귀 테스트.
//   실제 사고: 2026-08-03 23:12 KST, 22:04 배포 후 탭을 열어둔 유저가 맵 선택 진입 시
//   MapSelector-N1nSLmnp.js(구 해시)를 요청 → SPA 폴백이 index.html을 200으로 주고
//   "Failed to fetch dynamically imported module" TypeError(Sentry JAVASCRIPT-REACT-4).
//
// 고정하는 계약 4가지:
//   1) 첫 실패는 새로고침한다(= 새 배포로 간주)
//   2) 같은 페이지에서 후속 오류가 줄줄이 와도 새로고침은 한 번, 반환은 계속 true
//      → 죽어가는 페이지에서 에러 화면이 번쩍이지 않는다
//   3) 새로고침을 하고 왔는데 또 실패하면(=쿨다운 안) 포기한다 — 무한 새로고침 방지
//   4) sessionStorage를 못 쓰면 새로고침하지 않는다 — 기록 없이 돌면 루프가 되기 때문
import { describe, it, expect, beforeEach, vi } from 'vitest';

const g = globalThis as any;
let reload: ReturnType<typeof vi.fn>;

/** 브라우저 전역을 갈아끼운다. store=null 이면 sessionStorage 접근이 던진다(시크릿 모드 모사). */
const setupBrowser = (store: Map<string, string> | null) => {
  reload = vi.fn();
  g.window = { location: { reload } };
  g.sessionStorage = store
    ? {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      }
    : {
        getItem: () => { throw new Error('storage blocked'); },
        setItem: () => { throw new Error('storage blocked'); },
      };
};

/**
 * '페이지를 새로 연다'를 모사한다. 모듈이 다시 로드되므로 in-memory 플래그(reloadStarted)는 초기화되고,
 * sessionStorage(store)는 넘겨준 그대로 살아남는다 — 실제 새로고침과 같은 조건.
 */
const freshPage = async (store: Map<string, string> | null) => {
  vi.resetModules();
  setupBrowser(store);
  return import('../../src/utils/chunkReload');
};

describe('청크 로드 실패 → 자동 새로고침', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = new Map(); });

  it('첫 실패는 새로고침한다', async () => {
    const { reloadForNewDeploy } = await freshPage(store);
    expect(reloadForNewDeploy()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('같은 페이지의 후속 오류는 삼키되 새로고침은 한 번만 부른다', async () => {
    const { reloadForNewDeploy } = await freshPage(store);
    expect(reloadForNewDeploy()).toBe(true);
    // Vite preload 헬퍼의 2차 TypeError 등 — 여기서 false를 주면 에러 화면이 번쩍인다
    expect(reloadForNewDeploy()).toBe(true);
    expect(reloadForNewDeploy()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('새로고침하고 왔는데 또 실패하면 포기한다 — 무한 루프 방지', async () => {
    const first = await freshPage(store);
    expect(first.reloadForNewDeploy()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    const second = await freshPage(store); // 새로고침된 페이지. 쿨다운 기록은 살아 있다
    expect(second.reloadForNewDeploy()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('쿨다운이 지난 뒤의 실패는 다시 새로고침한다 — 배포가 연달아 나도 복구된다', async () => {
    const first = await freshPage(store);
    expect(first.reloadForNewDeploy()).toBe(true);

    store.set('chunkReloadAt', String(Date.now() - 11_000)); // 11초 전에 새로고침했던 것으로
    const second = await freshPage(store);
    expect(second.reloadForNewDeploy()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1); // freshPage가 mock을 갈았으므로 이 페이지 기준 1회
  });

  it('sessionStorage가 막혀 있으면 새로고침하지 않는다 — 기록 없이 돌면 무한 루프', async () => {
    const { reloadForNewDeploy } = await freshPage(null);
    expect(reloadForNewDeploy()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  describe('onChunkLoadError (lazy import의 catch 핸들러)', () => {
    it('새로고침 중이면 pending으로 남아 에러 화면이 번쩍이지 않는다', async () => {
      const { onChunkLoadError } = await freshPage(store);
      const p = onChunkLoadError(new TypeError('Failed to fetch dynamically imported module'));
      expect(reload).toHaveBeenCalledTimes(1);
      const settled = await Promise.race([p.then(() => 'settled'), Promise.resolve('pending')]);
      expect(settled).toBe('pending');

      // 같은 페이지의 2차 오류도 마찬가지로 pending — throw하면 RootErrorBoundary가 뜬다
      const p2 = onChunkLoadError(new TypeError("Cannot read properties of undefined"));
      const settled2 = await Promise.race([p2.then(() => 'settled'), Promise.resolve('pending')]);
      expect(settled2).toBe('pending');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('새로고침을 안 했으면 원래 오류를 그대로 흘려보낸다 — 기존 에러 화면 유지', async () => {
      const { onChunkLoadError } = await freshPage(null); // 저장소 차단 → 새로고침 없음
      const err = new TypeError('offline');
      expect(() => onChunkLoadError(err)).toThrow(err);
    });
  });
});
