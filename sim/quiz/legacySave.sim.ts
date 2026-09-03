// sim/quiz/legacySave.sim.ts
// ─────────────────────────────────────────────────────────────────────────────
// v2.25 퀴즈 변경이 **기존 세이브**에 어떤 영향을 주는지 실코드로 측정한다.
//
// 확인하려는 것 셋:
//   ① 새 필드(claimedKindMilestones·rankedBest)가 없는 구 세이브가 그대로 열리는가
//   ② 이미 높은 기록을 가진 유저가 한 판 완주할 때 재화가 얼마나 한꺼번에 들어오는가
//   ③ 랭킹 집계가 정말 50문항에서만 열리는가(10·30은 개인 기록에는 남아야 한다)
//
// quizService/cardService 는 import 시점에 localStorage를 읽는 싱글턴이므로
// **세이브를 먼저 심고 동적 import** 해야 한다.
import { describe, it, expect } from 'vitest';

const QUIZ_KEY = 'pokemon-td-quiz-v1';

describe('v2.25 퀴즈 변경 — 기존 세이브 영향', () => {
  it('구 스키마 세이브가 열리고, 재화 지급·랭킹 게이팅이 의도대로 동작한다', async () => {
    const { QUIZ_KINDS } = await import('../../src/types/quiz');

    // ── ① 구 세이브 심기: 새 필드가 아예 없다 ────────────────────────────────
    const legacyBest: Record<string, number> = {};
    for (const k of QUIZ_KINDS) legacyBest[k] = 50;          // 전 종목 만점 이력
    localStorage.setItem(QUIZ_KEY, JSON.stringify({
      version: 1, best: legacyBest, examBest: 50,
      totalRounds: 300, bestStreak: 40,
      // claimedKindMilestones / rankedBest 없음 — 구 버전 세이브
    }));

    const { quizService, getKindMilestones, getExamMilestones } = await import('../../src/services/QuizService');
    const { cardService } = await import('../../src/services/CardService');

    // 열리는가
    expect(quizService.getState().best.silhouette).toBe(50);
    expect(quizService.getState().totalRounds).toBe(300);

    // ── ② 전 종목 완주 시 들어오는 재화 총량 ────────────────────────────────
    const before = { ...cardService.getState().wallet };
    let coins = 0, shards = 0;
    for (const k of QUIZ_KINDS) {
      for (const m of quizService.claimKindMilestones(k)) { coins += m.coins; shards += m.starShards; }
    }
    const after = cardService.getState().wallet;

    const perKind = getKindMilestones().reduce(
      (a, m) => ({ c: a.c + m.coins, s: a.s + m.starShards }), { c: 0, s: 0 });
    const examTotal = getExamMilestones().reduce(
      (a, m) => ({ c: a.c + m.coins, s: a.s + m.starShards }), { c: 0, s: 0 });

    console.log(`\n  종목 수                 : ${QUIZ_KINDS.length}`);
    console.log(`  종목 1개 누적           : ${perKind.c}코인 · ${perKind.s}별조각`);
    console.log(`  모의고사 1개 누적       : ${examTotal.c}코인 · ${examTotal.s}별조각 (참고)`);
    console.log(`  전 종목 만점 유저 소급  : ${coins}코인 · ${shards}별조각`);
    console.log(`  지갑 ${before.coins}→${after.coins}코인, ${before.starShards}→${after.starShards}별조각`);

    expect(after.coins - before.coins).toBe(coins);
    expect(after.starShards - before.starShards).toBe(shards);
    expect(coins).toBe(perKind.c * QUIZ_KINDS.length);

    // 두 번째 완주에는 아무것도 안 준다(1회성)
    let again = 0;
    for (const k of QUIZ_KINDS) again += quizService.claimKindMilestones(k).length;
    expect(again).toBe(0);
    console.log(`  재수령 시도             : ${again}건 (0이어야 정상)`);

    // ── ③ 랭킹 게이팅 ────────────────────────────────────────────────────────
    expect(quizService.recordRankedExam(40, 10)).toBeNull();   // 10문항 → 미집계
    expect(quizService.recordRankedExam(40, 30)).toBeNull();   // 30문항 → 미집계
    expect(quizService.recordRankedExam(40, 50)).toBe(40);     // 50문항 → 집계
    expect(quizService.recordWeekly('exam', 40, 10)).toBe(false);
    expect(quizService.recordWeekly('exam', 40, 50)).toBe(true);
    // 속도전은 문항 수 규칙이 달라 roundSize 없이 통과
    expect(quizService.recordWeekly('speed', 300)).toBe(true);
    console.log(`  랭킹 게이팅             : 10·30 차단 / 50 통과 / 속도전 통과 ✓`);

    // 개인 기록은 문항 수와 무관하게 그대로 남는다
    expect(quizService.getState().examBest).toBe(50);
  });
});
