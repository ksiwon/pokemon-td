// src/services/QuotaGuard.ts
// ──────────────────────────────────────────────────────────────────
// [FREE-TIER] Firestore 쿼터 소진 회로차단기.
//
// Spark 무료 플랜은 하루 읽기 50K / 쓰기 20K를 넘기면 그 날(태평양시 자정까지)
// 모든 요청이 resource-exhausted로 떨어진다. 예전엔 이 상태를 아무도 기억하지 않아,
// 랭킹·전당·업적 화면이 열릴 때마다 계속 실패 요청을 재발사했다. 쿼터는 이미 0인데
// 요청만 계속 나가니 복구도 안 되고, 사용자에겐 "빈 목록"과 구분되지 않았다.
//
// 정책:
//   - resource-exhausted를 보면 10분간 Firestore 접근을 차단한다(로컬 캐시로만 동작).
//   - 차단 상태는 localStorage에 남아 새로고침해도 유지된다.
//   - 성공 응답이 한 번 오면 즉시 해제한다(잘못 내려간 경우 자동 복구).
//   - permission-denied는 규칙 문제이지 쿼터가 아니므로 차단하지 않는다.
//
// 멀티플레이(RTDB)는 이 차단기의 대상이 아니다 — RTDB는 별도 쿼터(동시 연결/대역폭)이고
// 게임 진행 중 차단하면 판이 깨지기 때문.

const LS_KEY = 'ptd-quota-tripped-until';
/** 차단 유지 시간. 너무 짧으면 재시도 폭풍, 너무 길면 복구가 늦다. */
const COOLDOWN_MS = 10 * 60_000;

type Listener = (tripped: boolean) => void;

/** 차단 중이라 요청을 보내지 않았을 때 던지는 에러. 호출부는 캐시/빈 값으로 폴백한다. */
export class QuotaBlockedError extends Error {
  constructor() {
    super('[quota] Firestore 접근이 일시 차단되었습니다(무료 쿼터 소진).');
    this.name = 'QuotaBlockedError';
  }
}

class QuotaGuard {
  private trippedUntil = 0;
  private listeners = new Set<Listener>();

  constructor() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const v = raw ? Number(raw) : 0;
      if (Number.isFinite(v) && v > Date.now()) this.trippedUntil = v;
      else if (raw) localStorage.removeItem(LS_KEY);
    } catch { /* ignore */ }
  }

  /** 지금 Firestore 접근이 차단 중인가. */
  isTripped(): boolean {
    if (this.trippedUntil === 0) return false;
    if (Date.now() >= this.trippedUntil) {
      this.reset();
      return false;
    }
    return true;
  }

  /** 차단 해제까지 남은 시간(ms). 차단 중이 아니면 0. */
  remainingMs(): number {
    return this.isTripped() ? this.trippedUntil - Date.now() : 0;
  }

  /**
   * Firestore 에러를 보고. 쿼터성 에러면 차단기를 내린다.
   * 그 외 에러(permission-denied, 네트워크 등)는 무시한다.
   */
  report(err: unknown): void {
    const code = (err as { code?: string })?.code ?? '';
    const message = (err as { message?: string })?.message ?? '';
    const isQuota =
      code === 'resource-exhausted' ||
      code === 'auth/quota-exceeded' ||
      message.includes('resource-exhausted') ||
      message.includes('Quota exceeded');
    if (!isQuota) return;
    this.trip();
  }

  /** 성공 응답 보고 — 차단이 걸려 있었다면 해제한다. */
  reportSuccess(): void {
    if (this.trippedUntil !== 0) this.reset();
  }

  private trip(): void {
    const until = Date.now() + COOLDOWN_MS;
    // 이미 차단 중이면 연장하지 않는다(에러가 쏟아져도 차단 시간이 무한히 늘지 않도록).
    if (this.trippedUntil > Date.now()) return;
    this.trippedUntil = until;
    try { localStorage.setItem(LS_KEY, String(until)); } catch { /* ignore */ }
    console.warn(`[quota] Firestore 무료 쿼터 소진 감지 — ${COOLDOWN_MS / 60000}분간 접근을 차단합니다.`);
    this.emit(true);
  }

  private reset(): void {
    this.trippedUntil = 0;
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    this.emit(false);
  }

  /** 차단 상태 변화 구독. 반환값은 해제 함수. */
  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(tripped: boolean): void {
    this.listeners.forEach(cb => {
      try { cb(tripped); } catch (e) { console.error(e); }
    });
  }
}

export const quotaGuard = new QuotaGuard();
