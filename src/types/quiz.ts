// src/types/quiz.ts
// 포켓몬 퀴즈 모음 전용 타입. TD 본편/카드 모드와 독립.
// 데이터 소스는 전부 PokeAPI(getPokemon) + 결정적 공식아트/울음소리 URL.

/** 퀴즈 종목. */
export type QuizKind =
  | 'silhouette'   // 실루엣
  | 'cry'          // 울음소리
  | 'zoom'         // 확대
  | 'type'         // 타입
  | 'bstDuel'      // 종족값 대결
  | 'dexNumber'    // 도감번호
  | 'flavor';      // 도감설명

export const QUIZ_KINDS: QuizKind[] = [
  'silhouette', 'cry', 'zoom', 'type', 'bstDuel', 'dexNumber', 'flavor',
];

/** 퀴즈 진행 모드: 개별 종목 또는 수능 모의고사(전 종목 혼합). */
export type QuizMode = QuizKind | 'exam';

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
  /** 대표 미디어. 이미지(실루엣/확대) 또는 오디오(울음소리). 종족값 대결은 없음. */
  media?: {
    imageUrl?: string;
    audioUrl?: string;
    silhouette?: boolean;
    /** 확대 퀴즈: 확대 중심(0~100%). 정답 공개 시 원본 노출. */
    zoom?: { x: number; y: number };
  };
  /** 답 방식: 4지선다(choice) 또는 직접 입력(text). 모의고사는 항상 choice. */
  answerType: 'choice' | 'text';
  /** choice: 보기/정답 인덱스. */
  options: QuizOption[];
  correctIndex: number;
  /** text: 인정 정답 후보(원문; 채점 시 정규화·띄어쓰기 무관·복수정답). */
  accept?: string[];
  /** 정답 공개 카드에 표시할 정보. */
  reveal: { title: string; subtitle?: string; imageUrl?: string };
}

/** 로컬 영속 상태(localStorage). */
export interface QuizSaveState {
  version: number;
  /** 퀴즈별 최고 점수(정답 수). */
  best: Record<QuizKind, number>;
  /** 수능 모의고사 최고 점수(정답 수 / 20). */
  examBest: number;
  /** 총 플레이한 라운드 수. */
  totalRounds: number;
  /** 전 종목 통산 최고 연속 정답. */
  bestStreak: number;
}
