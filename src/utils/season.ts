// src/utils/season.ts
// 미니 포켓 주간 시즌 유틸 — ISO 8601 주차 기준(월요일 시작), **KST(Asia/Seoul, UTC+9)** 앵커.
// 타워 랭킹은 seasons/{seasonId}/cardRankings 서브컬렉션에 저장 → 주차가 바뀌면
// 새 경로로 자동 이관되어 "리셋"이 서버 개입 없이 성립한다.
//
// 경계 = 월요일 00:00 KST. 한국 유저에게 직관적(로컬 자정 리셋). 한국은 서머타임이
// 없어 UTC+9 고정 오프셋이 영구히 정확 → Intl/타임존 DB 불필요.
// (비-KST 유저도 동일 순간에 리셋되지만, 비동기 주간 랭킹이라 실질 무해.)

/** KST = UTC+9 고정 오프셋(ms). 한국은 DST 없음. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 실제 UTC 순간을 KST '벽시계'로 옮긴 Date.
 * 이후 getUTC*()로 읽으면 KST 기준 달력 필드(연/월/일/요일)가 나온다.
 */
function toKst(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** 주어진 시각의 ISO 주차 ID(KST 기준). 예: "2026-W27". */
export function seasonId(now: Date = new Date()): string {
  const k = toKst(now);
  // KST 자정 기준 날짜로 정규화
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  // ISO: 목요일이 속한 해가 그 주의 연도 → 목요일로 이동
  const dayNum = (d.getUTCDay() + 6) % 7; // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // 이번 주 목요일
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4)); // 1월 4일은 항상 1주차
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** 주어진 시각의 KST 날짜 ID. 예: "2026-07-09". 일일 보너스 리셋(자정 KST) 기준. */
export function dayId(now: Date = new Date()): string {
  const k = toKst(now);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, '0');
  const d = String(k.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 다음 시즌(다음 주 월요일 00:00 KST)까지 남은 ms. */
export function msUntilSeasonReset(now: Date = new Date()): number {
  const k = toKst(now);
  // KST 벽시계의 오늘 00:00(=shifted 프레임 ms)
  const kstMidnightShifted = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  const dayNum = (new Date(kstMidnightShifted).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const daysUntilNextMonday = 7 - dayNum; // 오늘이 월요일이면 7일 뒤
  const nextMondayShifted = kstMidnightShifted + daysUntilNextMonday * 86400000;
  // shifted 프레임 → 실제 UTC 순간으로 환산(-9h) 후 현재와 차이
  const nextMondayRealUtc = nextMondayShifted - KST_OFFSET_MS;
  return nextMondayRealUtc - now.getTime();
}

/** 시즌 리셋까지 남은 일수(올림, 최소 1). UI 카운트다운용. */
export function daysUntilSeasonReset(now: Date = new Date()): number {
  return Math.max(1, Math.ceil(msUntilSeasonReset(now) / 86400000));
}
