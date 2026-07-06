// src/services/QuizService.ts
// 퀴즈 로컬 영속(최고점수·통계). localStorage 단독, TD/카드 세이브와 분리.
// [FREE-TIER] Firestore 리더보드는 P2. 지금은 완전 오프라인 동작.

import { QuizKind, QuizSaveState, QUIZ_KINDS } from '../types/quiz';

const STORAGE_KEY = 'pokemon-td-quiz-v1';
const CURRENT_VERSION = 1;

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
