// src/services/QuizService.ts
// 퀴즈 로컬 영속(최고점수·통계). localStorage 단독, TD/카드 세이브와 분리.
// [FREE-TIER] Firestore 리더보드는 P2. 지금은 완전 오프라인 동작.

import { QuizKind, QuizBoardKey, QuizSaveState, QUIZ_KINDS, RANKED_ROUND_SIZE } from '../types/quiz';
import { cardService } from './CardService';
import { seasonId } from '../utils/season';

/** 퀴즈 저장 키. 백업/복원(DatabaseService)이 같은 키를 참조하므로 단일 출처. */
export const QUIZ_STORAGE_KEY = 'pokemon-td-quiz-v1';
const STORAGE_KEY = QUIZ_STORAGE_KEY;
const CURRENT_VERSION = 1;

/** 모의고사 최고점 1회성 마일스톤 보상(미니 포켓 재화).
 *  [경제] 일회성 누적 총 660코인+55별조각 — 싱글 완주(350코인+50조각)와 비슷한 규모의
 *  원타임 보너스. 반복 파밍 불가(최고점 경신 시에만 새 구간 해금). */
export interface ExamMilestoneReward {
  threshold: number; // 모의고사 최고 정답 수(최대 50)
  coins: number;
  starShards: number;
}
const EXAM_MILESTONES: ExamMilestoneReward[] = [
  { threshold: 10, coins: 50, starShards: 0 },
  { threshold: 20, coins: 80, starShards: 5 },
  { threshold: 30, coins: 120, starShards: 10 },
  { threshold: 40, coins: 160, starShards: 15 },
  { threshold: 50, coins: 250, starShards: 25 },
];

/**
 * 종목별 마일스톤 = 모의고사의 **1/5**. 규칙(최고 정답 수 기준·1회성)은 동일하다.
 *
 * [경제] 종목 하나를 50문항 만점까지 밀면 132코인 + 11별조각. 한국어 15종목을 전부
 * 만점 내면 1,980코인 + 165별조각이 되는데, 이건 '전 종목 만점'이라는 사실상의
 * 도전과제 보상이고 반복은 불가능하다(구간마다 1회). 모의고사 하나만 파던 예전보다
 * 총량은 늘지만, 종목 하나당 수급은 모의고사의 1/5로 눌러 두어 "쉬운 종목만 돌면
 * 이득"이 되지 않게 했다.
 */
const KIND_MILESTONES: ExamMilestoneReward[] = EXAM_MILESTONES.map(m => ({
  threshold: m.threshold,
  coins: Math.round(m.coins / 5),
  starShards: Math.round(m.starShards / 5),
}));

/** UI(문서 화면)에서 표로 보여주기 위한 읽기 전용 사본. */
export const getExamMilestones = (): readonly ExamMilestoneReward[] => EXAM_MILESTONES;
export const getKindMilestones = (): readonly ExamMilestoneReward[] => KIND_MILESTONES;

class QuizService {
  private state: QuizSaveState;

  constructor() {
    this.state = this.load();
  }

  private emptyBest(): Record<QuizKind, number> {
    return QUIZ_KINDS.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Record<QuizKind, number>);
  }

  private defaultState(): QuizSaveState {
    return { version: CURRENT_VERSION, best: this.emptyBest(), examBest: 0, totalRounds: 0, bestStreak: 0 };
  }

  private load(): QuizSaveState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QuizSaveState;
        // 얕은 마이그레이션 — 누락 필드/신규 종목 보강
        return {
          ...this.defaultState(),
          ...parsed,
          best: { ...this.emptyBest(), ...parsed.best },
        };
      }
    } catch (e) {
      console.warn('[QuizService] load 실패, 기본값 사용', e);
    }
    return this.defaultState();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[QuizService] 저장 실패', e);
    }
  }

  getState(): QuizSaveState {
    return { ...this.state, best: { ...this.state.best } };
  }

  getBest(kind: QuizKind): number {
    return this.state.best[kind] ?? 0;
  }

  getExamBest(): number {
    return this.state.examBest ?? 0;
  }

  /** 모의고사 정산. 최고점수/최고연속/총라운드 갱신. 반환: 최고점 경신 여부. */
  recordExam(score: number, maxStreak: number): boolean {
    const isNewBest = score > (this.state.examBest ?? 0);
    if (isNewBest) this.state.examBest = score;
    if (maxStreak > this.state.bestStreak) this.state.bestStreak = maxStreak;
    this.state.totalRounds += 1;
    this.persist();
    return isNewBest;
  }

  /**
   * 모의고사 최고점 기준으로 새로 도달한 마일스톤을 수령 처리하고 재화를 지급.
   * recordExam 직후 호출. 이미 받은 구간은 스킵(1회성). 반환: 이번에 받은 목록(UI 표시용).
   */
  claimExamMilestones(): ExamMilestoneReward[] {
    const best = this.state.examBest ?? 0;
    const claimed = new Set(this.state.claimedExamMilestones ?? []);
    const earned = EXAM_MILESTONES.filter(m => best >= m.threshold && !claimed.has(m.threshold));
    if (earned.length === 0) return [];

    earned.forEach(m => claimed.add(m.threshold));
    this.state.claimedExamMilestones = Array.from(claimed).sort((a, b) => a - b);
    this.persist();

    cardService.grantRewards({
      coins: earned.reduce((s, m) => s + m.coins, 0),
      starShards: earned.reduce((s, m) => s + m.starShards, 0),
    });
    return earned;
  }

  /**
   * 종목 최고점 기준으로 새로 도달한 마일스톤을 수령 처리하고 재화를 지급.
   * recordRound 직후 호출. 모의고사와 완전히 같은 규칙이고 액수만 1/5다.
   */
  claimKindMilestones(kind: QuizKind): ExamMilestoneReward[] {
    const best = this.state.best[kind] ?? 0;
    const claimed = new Set(this.state.claimedKindMilestones?.[kind] ?? []);
    const earned = KIND_MILESTONES.filter(m => best >= m.threshold && !claimed.has(m.threshold));
    if (earned.length === 0) return [];

    earned.forEach(m => claimed.add(m.threshold));
    this.state.claimedKindMilestones = {
      ...(this.state.claimedKindMilestones ?? {}),
      [kind]: Array.from(claimed).sort((a, b) => a - b),
    };
    this.persist();

    cardService.grantRewards({
      coins: earned.reduce((s, m) => s + m.coins, 0),
      starShards: earned.reduce((s, m) => s + m.starShards, 0),
    });
    return earned;
  }

  // ─── 주간 랭킹(보드별) ─────────────────────────────────────────────────────
  /** 이번 주 기록이 아니면 비운다. 주차 경계(월요일 00:00 KST)를 넘으면 로컬도 리셋. */
  private ensureCurrentSeason(): void {
    const now = seasonId();
    if (this.state.weeklySeason !== now) {
      this.state.weeklySeason = now;
      this.state.weeklyBest = {};
      this.persist();
    }
  }

  /** 이번 주 해당 보드의 내 최고 기록(로컬 기준). */
  getWeeklyBest(key: QuizBoardKey): number {
    this.ensureCurrentSeason();
    return this.state.weeklyBest?.[key] ?? 0;
  }

  /** 통산 보드에 올린 내 기록(50문항 완주분). 개인 최고(best/examBest)와 다를 수 있다. */
  getRankedBest(key: QuizBoardKey): number {
    return this.state.rankedBest?.[key] ?? 0;
  }

  /**
   * 랭킹 반영 대상인 판인지.
   * `roundSize`를 넘기지 않는 호출(속도전)은 문항 수 규칙이 다르므로 그대로 통과시킨다.
   */
  private isRankedRound(roundSize?: number): boolean {
    return roundSize === undefined || roundSize === RANKED_ROUND_SIZE;
  }

  /**
   * 이번 주 기록 갱신 시도. **반환값이 true일 때만** 서버에 올린다.
   * [FREE-TIER] 한 판마다 Firestore에 쓰면 write가 판 수만큼 늘어난다.
   * 주간 최고를 로컬에서 들고 있다가 경신될 때만 1 write.
   *
   * 50문항이 아닌 판은 아예 집계하지 않는다(RANKED_ROUND_SIZE 참고).
   */
  recordWeekly(key: QuizBoardKey, score: number, roundSize?: number): boolean {
    if (!this.isRankedRound(roundSize)) return false;
    this.ensureCurrentSeason();
    const prev = this.state.weeklyBest?.[key] ?? 0;
    if (score <= prev) return false;
    this.state.weeklyBest = { ...(this.state.weeklyBest ?? {}), [key]: score };
    this.persist();
    return true;
  }

  /**
   * 통산 모의고사 보드 갱신 시도. 반환: 서버에 올릴 값(경신 없으면 null).
   *
   * examBest를 그대로 올리지 않는 이유 — examBest는 문항 수를 가리지 않는 개인 기록이라,
   * 30문항으로 세운 30점을 들고 50문항 보드에 올라가 버린다.
   */
  recordRankedExam(score: number, roundSize: number): number | null {
    if (!this.isRankedRound(roundSize)) return null;
    const prev = this.state.rankedBest?.exam ?? 0;
    if (score <= prev) return null;
    this.state.rankedBest = { ...(this.state.rankedBest ?? {}), exam: score };
    this.persist();
    return score;
  }

  // ─── 속도 퀴즈(멀티) 통산 전적 ──────────────────────────────────────────────
  getSpeedStats(): { wins: number; games: number; bestScore: number } {
    return this.state.speed ?? { wins: 0, games: 0, bestScore: 0 };
  }

  /** 속도 퀴즈 한 판 종료 정산. 반환: 서버 랭킹을 갱신할 값(호출부가 그대로 업로드). */
  recordSpeedGame(score: number, won: boolean): { wins: number; games: number; bestScore: number } {
    const cur = this.getSpeedStats();
    const next = {
      wins: cur.wins + (won ? 1 : 0),
      games: cur.games + 1,
      bestScore: Math.max(cur.bestScore, score),
    };
    this.state.speed = next;
    this.persist();
    return next;
  }

  /** 라운드 종료 정산. 최고점수/최고연속/총라운드 갱신 후 저장.
   *  반환: 이번 점수가 해당 종목 최고 기록을 경신했는지. */
  recordRound(kind: QuizKind, score: number, maxStreak: number): boolean {
    const prevBest = this.state.best[kind] ?? 0;
    const isNewBest = score > prevBest;
    if (isNewBest) this.state.best[kind] = score;
    if (maxStreak > this.state.bestStreak) this.state.bestStreak = maxStreak;
    this.state.totalRounds += 1;
    this.persist();
    return isNewBest;
  }
}

export const quizService = new QuizService();
