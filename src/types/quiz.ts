// src/types/quiz.ts
// 포켓몬 퀴즈 모음 전용 타입. TD 본편/카드 모드와 독립.
// 데이터 소스는 전부 PokeAPI(getPokemon) + 결정적 공식아트/울음소리 URL.

/** 퀴즈 종목. */
export type QuizKind =
  | 'silhouette'   // 실루엣
  | 'cry'          // 울음소리
  | 'zoom'         // 확대
  | 'type'         // 타입(쉬움): 포켓몬 보고 타입 고르기
  | 'typeHard'     // 타입(어려움): 타입 보고 그 타입 포켓몬 입력
  | 'bstDuel'      // 종족값 대결
  | 'dexNumber'    // 도감번호
  | 'flavor'       // 도감설명
  | 'chosungEasy'  // 초성(유형 표시)
  | 'chosungHard'; // 초성(유형 숨김)

export const QUIZ_KINDS: QuizKind[] = [
  'silhouette', 'cry', 'zoom', 'type', 'typeHard', 'bstDuel', 'dexNumber', 'flavor',
  'chosungEasy', 'chosungHard',
];

/**
 * 한국어 전용 종목 — 초성열은 한글 음절에서만 만들어진다(QuizEngine.toChosung).
 * 다른 언어에선 이름이 그대로 노출돼 정답이 보이므로 출제하지 않는다.
 */
export const KO_ONLY_QUIZ_KINDS: QuizKind[] = ['chosungEasy', 'chosungHard'];

/**
 * 해당 언어에서 출제 가능한 종목.
 * QUIZ_KINDS 자체는 줄이지 않는다 — QuizService가 이 배열로 Record<QuizKind, number>
 * 최고점수 레코드를 만들기 때문에, 빼면 저장 스키마가 깨지고 한국어 기록도 사라진다.
 */
export const availableQuizKinds = (language: string): QuizKind[] =>
  language === 'ko' ? QUIZ_KINDS : QUIZ_KINDS.filter(k => !KO_ONLY_QUIZ_KINDS.includes(k));

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
  /** 지문 아래 크게 강조 표시할 텍스트(초성 퀴즈의 초성열 등). 없으면 미표시. */
  bigText?: string;
  /** 주관식 입력창 placeholder 커스텀(초성 카테고리별). 없으면 기본값 사용. */
  inputPlaceholder?: string;
  /** 대표 미디어. 이미지(실루엣/확대) 또는 오디오(울음소리). 종족값 대결은 없음. */
  media?: {
    imageUrl?: string;
    audioUrl?: string;
    silhouette?: boolean;
    /** 확대 퀴즈: 확대 중심(0~100%). 정답 공개 시 원본 노출. */
    zoom?: { x: number; y: number };
  };
  /** 종족값 대결(HigherLower) 전용 페이로드. 있으면 QuizPlay가 DuelView로 렌더(왼쪽 값 공개·오른쪽 더많이/더적게). */
  duel?: {
    statLabel: string;
    left: { name: string; imageUrl: string; value: number };
    right: { name: string; imageUrl: string; value: number };
  };
  /** 답 방식: 4지선다(choice) 또는 직접 입력(text). 모의고사는 항상 choice. */
  answerType: 'choice' | 'text';
  /** choice: 보기/정답 인덱스. */
  options: QuizOption[];
  correctIndex: number;
  /** text: 인정 정답 후보(원문; 채점 시 정규화·띄어쓰기 무관·복수정답). */
  accept?: string[];
  /** text 동적 채점(정규화된 입력 → 정답 여부). 타입(어려움)처럼 정답 후보가 방대할 때 사용. accept보다 우선. */
  validateText?: (normalizedInput: string) => boolean;
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
  /** 수령한 모의고사 마일스톤(점수 threshold 목록). 1회성 보상 중복 방지. */
  claimedExamMilestones?: number[];
}
