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
  | 'chosungHard'  // 초성(유형 숨김)
  | 'hint'         // 랜덤 힌트: 힌트 3개 보고 이름
  | 'typeOdd'      // 타입 오드원아웃: 4마리 중 타입 조합이 혼자 다른 하나
  | 'special'      // 전설/환상/패러독스/울트라비스트 분류
  | 'similarName'  // 헷갈리는 이름: 유사한 이름 4개 중 고르기
  | 'signature';   // 전용기술: 그 기술을 배우는 유일한 포켓몬

export const QUIZ_KINDS: QuizKind[] = [
  'silhouette', 'cry', 'zoom', 'type', 'typeHard', 'bstDuel', 'dexNumber', 'flavor',
  'chosungEasy', 'chosungHard',
  'hint', 'typeOdd', 'special', 'similarName', 'signature',
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

/** 고를 수 있는 문항 수. 마지막 값이 랭킹 기준이다. */
export const ROUND_SIZES = [10, 30, 50] as const;

/**
 * **랭킹에 반영되는 문항 수.**
 *
 * 점수가 '맞힌 개수'라서 문항 수를 섞으면 보드가 무의미해진다 — 10문항 만점(10점)과
 * 50문항 40점이 같은 줄에 서고, 50문항만 도는 쪽이 언제나 이긴다. 그래서 랭킹은
 * 50문항 완주만 집계한다. 10·30문항은 연습용으로 남기고 개인 기록에만 남는다.
 * (재화 마일스톤은 문항 수를 가리지 않는다 — 10문항으로는 10점이 상한이라
 *  자연히 첫 구간까지만 열린다.)
 */
export const RANKED_ROUND_SIZE = 50;

// ─── 랭킹 보드 ────────────────────────────────────────────────────────────────
/** 주간 랭킹 보드 키 — 종목 15개 + 모의고사 + 속도 퀴즈. 시즌 문서 `scores` 맵의 키. */
export type QuizBoardKey = QuizKind | 'exam' | 'speed';
export const QUIZ_BOARD_KEYS: QuizBoardKey[] = [...QUIZ_KINDS, 'exam', 'speed'];

/** 해당 언어에서 주간 랭킹을 보여줄 보드(초성은 한국어에서만 출제되므로 동일 규칙). */
export const availableBoardKeys = (language: string): QuizBoardKey[] =>
  language === 'ko'
    ? QUIZ_BOARD_KEYS
    : QUIZ_BOARD_KEYS.filter(k => !KO_ONLY_QUIZ_KINDS.includes(k as QuizKind));

// ─── 속도 퀴즈(실시간 멀티) ───────────────────────────────────────────────────
/**
 * 속도 퀴즈 출제 종목 — 전부 **주관식**(입력창). 솔로 종목 이름을 그대로 쓴다.
 * 객관식을 섞지 않는 이유: 보기 4개를 찍어도 0.3초에 눌리므로 속도 경쟁이 운으로 흐른다.
 *
 * 정답의 성격은 둘로 갈린다.
 * - 포켓몬/기술/특성/도구 **이름**을 맞히는 것: silhouette·cry·zoom·flavor·hint·chosung*
 * - **타입**이 걸린 것: `type`은 타입 조합을 입력하고, `typeHard`는 그 타이핑에 정확히
 *   맞는 포켓몬 이름을 입력한다. 둘 다 정답이 여러 개라 호스트가 후보 목록(accept)을
 *   통째로 들고 채점한다 — 목록은 방송되지 않으므로 크기가 커도 무방하다.
 */
export type SpeedQuizKind =
  | 'silhouette' | 'cry' | 'zoom' | 'flavor' | 'hint'
  | 'type' | 'typeHard'
  | 'chosungEasy' | 'chosungHard';
export const SPEED_QUIZ_KINDS: SpeedQuizKind[] = [
  'silhouette', 'cry', 'zoom', 'flavor', 'hint',
  'type', 'typeHard',
  'chosungEasy', 'chosungHard',
];

/**
 * 초성은 한글 음절에서만 만들어진다 — 영어 방에서 출제하면 초성열 자리에 이름이 그대로
 * 나와 정답이 보인다(솔로 퀴즈의 KO_ONLY_QUIZ_KINDS와 같은 이유).
 * 타입 종목은 타입명이 양쪽 언어로 다 번역돼 있어 영어 방에서도 그대로 낼 수 있다.
 */
const KO_ONLY_SPEED_KINDS: SpeedQuizKind[] = ['chosungEasy', 'chosungHard'];

/** 방 언어에서 고를 수 있는 종목. */
export const speedKindsForLang = (lang: string): SpeedQuizKind[] =>
  lang === 'ko' ? SPEED_QUIZ_KINDS : SPEED_QUIZ_KINDS.filter(k => !KO_ONLY_SPEED_KINDS.includes(k));

/**
 * RTDB로 전원에게 뿌리는 문제 페이로드.
 * **정답(accept)과 정답 공개 정보(reveal)는 절대 포함하지 않는다** — 방 데이터는 모든 참가자가
 * 읽을 수 있어서, 여기에 정답을 넣으면 콘솔에서 그대로 보인다. 채점은 호스트만 한다.
 */
export interface SpeedRoundPayload {
  kind: SpeedQuizKind;
  imageUrl?: string;
  audioUrl?: string;
  silhouette?: boolean;
  zoom?: { x: number; y: number };
  /** 도감설명 지문(이름 마스킹 완료, 호스트 언어). flavor 전용. */
  text?: string;
  /** 힌트 줄(호스트 언어). hint 전용. */
  hintLines?: string[];
  /** 크게 강조할 텍스트(초성열). chosung* 전용. */
  bigText?: string;
  /** 초성 문제의 갈래(pokemon/move/ability/item). 각 클라이언트가 키로 번역한다. */
  chosungCat?: string;
  /**
   * 제시 타이핑의 타입 슬러그(예: ['ghost','fire']). typeHard 전용.
   * 라벨이 아니라 슬러그를 보내는 이유는 다른 지문과 같다 — 각 클라이언트가
   * `types.<slug>` 키로 **자기 언어로** 렌더해야 하기 때문이다.
   */
  typeSlugs?: string[];
}

/** 정답 공개 시점에 호스트가 추가로 뿌리는 정보. */
export interface SpeedRevealPayload {
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

/** 호스트가 만든 한 문제 — payload는 방송용, accept/reveal은 공개 전까지 호스트만 보관. */
export interface SpeedRound {
  payload: SpeedRoundPayload;
  reveal: SpeedRevealPayload;
  /** 인정 정답(한글명·영문명·영문 slug). 브로드캐스트 금지. */
  accept: string[];
}

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
  /** 힌트 줄 목록(랜덤 힌트 퀴즈). 있으면 지문 아래 카드 리스트로 렌더. */
  hintLines?: string[];
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
  /** 수령한 **종목별** 마일스톤. 종목 → threshold 목록. 모의고사와 같은 1회성 규칙. */
  claimedKindMilestones?: Partial<Record<QuizKind, number[]>>;
  /**
   * 랭킹에 올린 보드별 최고 기록 — **50문항 완주분만**. best/examBest(문항 수 무관
   * 개인 기록)와 일부러 분리한다. 섞으면 30문항으로 세운 기록이 50문항 보드에
   * 올라가 버린다(RANKED_ROUND_SIZE 주석 참고).
   */
  rankedBest?: Partial<Record<QuizBoardKey, number>>;
  /** 주간 랭킹용 — 이 기록이 속한 시즌(ISO 주차). 주가 바뀌면 weeklyBest를 통째로 비운다. */
  weeklySeason?: string;
  /**
   * 이번 주 보드별 최고 기록. 서버에 이미 올린 값이기도 해서, 이보다 낮은 점수는
   * Firestore 쓰기를 아예 건너뛴다([FREE-TIER] 불필요한 write 차단).
   */
  weeklyBest?: Partial<Record<QuizBoardKey, number>>;
  /** 속도 퀴즈(멀티) 통산 전적. 랭킹은 1등 횟수(wins) 기준. */
  speed?: { wins: number; games: number; bestScore: number };
}
