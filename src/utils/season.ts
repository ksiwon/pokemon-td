// src/utils/season.ts
// 미니 포켓 주간 시즌 유틸 — ISO 8601 주차 기준(월요일 시작, UTC).
// 타워 랭킹은 seasons/{seasonId}/cardRankings 서브컬렉션에 저장 → 주차가 바뀌면
// 새 경로로 자동 이관되어 "리셋"이 서버 개입 없이 성립한다.
// 모든 유저가 UTC 기준 동일 경계를 공유해 시즌 공정성 확보.

/** 주어진 시각의 ISO 주차 ID. 예: "2026-W27". */
export function seasonId(now: Date = new Date()): string {
  // UTC 자정 기준 날짜로 정규화
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

/** 다음 시즌(다음 주 월요일 00:00 UTC)까지 남은 ms. */
export function msUntilSeasonReset(now: Date = new Date()): number {
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayNum = (new Date(midnightUtc).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const daysUntilNextMonday = 7 - dayNum; // 오늘이 월요일이면 7일 뒤
  const nextMonday = midnightUtc + daysUntilNextMonday * 86400000;
  return nextMonday - now.getTime();
}

/** 시즌 리셋까지 남은 일수(올림, 최소 1). UI 카운트다운용. */
export function daysUntilSeasonReset(now: Date = new Date()): number {
  return Math.max(1, Math.ceil(msUntilSeasonReset(now) / 86400000));
}
