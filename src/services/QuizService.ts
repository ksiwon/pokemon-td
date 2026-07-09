// src/services/QuizService.ts
// 퀴즈 로컬 영속(최고점수·통계). localStorage 단독, TD/카드 세이브와 분리.
// [FREE-TIER] Firestore 리더보드는 P2. 지금은 완전 오프라인 동작.

import { QuizKind, QuizSaveState, QUIZ_KINDS } from '../types/quiz';
import { cardService } from './CardService';

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
