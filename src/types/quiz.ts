// src/types/quiz.ts
// 포켓몬 퀴즈 모음 전용 타입. TD 본편/카드 모드와 독립.
// 데이터 소스는 전부 PokeAPI(getPokemon) + 결정적 공식아트 URL.

/** MVP 퀴즈 4종. */
export type QuizKind = 'silhouette' | 'bstDuel' | 'type' | 'dexNumber';

export const QUIZ_KINDS: QuizKind[] = ['silhouette', 'bstDuel', 'type', 'dexNumber'];

/** 보기 1개. 텍스트(라벨) 또는 이미지 버튼(종족값 대결). */
export interface QuizOption {
  label?: string;
  imageUrl?: string;
}

/** 문제 1개 — 제너레이터가 완성해서 넘기는 표시용 모델(제너릭 렌더러가 소비). */
export interface QuizQuestion {
  kind: QuizKind;
  /** 문제 지문(현지화 완료). */
  prompt: string;
  /** 상단 대표 이미지(실루엣 여부 포함). 종족값 대결은 없음(보기 자체가 이미지). */
  media?: { imageUrl: string; silhouette?: boolean };
  options: QuizOption[];
  correctIndex: number;
  /** 정답 공개 카드에 표시할 정보. */
  reveal: { title: string; subtitle?: string; imageUrl?: string };
}

/** 로컬 영속 상태(localStorage). Firestore 리더보드는 P2. */
export interface QuizSaveState {
  version: number;
  /** 퀴즈별 최고 점수(정답 수). */
  best: Record<QuizKind, number>;
  /** 총 플레이한 라운드 수. */
  totalRounds: number;
  /** 전 종목 통산 최고 연속 정답. */
  bestStreak: number;
}
