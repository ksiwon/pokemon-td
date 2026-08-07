// src/types/quizRoom.ts
// 퀴즈 속도전(실시간 멀티) 방 스키마. RTDB `quizRooms/{roomId}` 한 노드에 전부 담는다.
// TD 멀티(rooms/gameStates/towerDetails)와 경로·스키마를 완전히 분리 — 서로의 정리 로직에
// 얽히지 않게 하고, 방 데이터가 작아 구독 1개로 끝난다([FREE-TIER] RTDB 다운로드 절약).

import { SpeedRoundPayload, SpeedRevealPayload, SpeedQuizKind } from './quiz';

/**
 * 방의 언어. 호스트의 UI 언어를 그대로 기록한다(고르는 값이 아니다).
 *
 * 왜 필요한가: 문제는 호스트 한 명이 만들어 방송하는데, 도감설명·힌트 지문은 원문이라
 * **호스트 언어 그대로** 나간다. 정답 공개 이름도 마찬가지다. 방 목록에 언어 구분이 없으면
 * 영어 유저가 한국어 방에 들어가 한글 지문을 마주하게 된다 — 막지는 않고 미리 알려 준다.
 */
export type QuizRoomLang = 'ko' | 'en';

export type QuizRoomStatus = 'waiting' | 'playing' | 'finished';
/** lobby=대기실 · question=문제 푸는 중 · reveal=정답 공개 중 · done=최종 결과 */
export type QuizRoomPhase = 'lobby' | 'question' | 'reveal' | 'done';

export interface QuizRoomPlayer {
  userId: string;
  name: string;
  /** 누적 점수. 호스트만 쓴다(룰에서 강제). */
  score: number;
  /** 맞힌 문제 수. */
  correct: number;
  joinedAt: number;
  /**
   * 이번 문제에 답을 냈는지. **본문이 아니라 불리언만** 방에 둔다 —
   * 답 본문은 quizAnswers/{roomId}(호스트만 읽기)에 있어서 남의 답을 베낄 수 없다.
   * 이 플래그는 "N명 중 M명 제출" 표시용이라 노출돼도 무해하다.
   */
  answered?: boolean;
}

/** 한 문제의 채점 결과(호스트가 공개 시점에 기록). */
export interface QuizRoundResult {
  ok: boolean;
  /** 문제 시작 후 정답까지 걸린 ms. 오답/무응답은 없음. */
  ms?: number;
  /** 이번 문제에서 얻은 점수. */
  points: number;
  /** 정답자 중 몇 번째였는지(1부터). 오답/무응답은 0. */
  order: number;
}

export interface QuizRoomRound {
  index: number;
  /** 서버 시각 기준 시작/마감(ms). 클라이언트 시계가 달라도 같은 순간에 끝나도록 serverNow와 비교. */
  startedAt: number;
  endsAt: number;
  /** 전원에게 방송되는 문제. 정답 정보는 들어 있지 않다. */
  payload: SpeedRoundPayload;
  /** 정답 공개 시점에만 채워진다. */
  reveal?: SpeedRevealPayload;
  /** 정답 공개 시점에만 채워진다. uid → 채점 결과. */
  results?: Record<string, QuizRoundResult>;
}

export interface QuizRoom {
  id: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  status: QuizRoomStatus;
  phase: QuizRoomPhase;
  config: {
    /** 총 문항 수. */
    rounds: number;
    /** 문항당 제한 시간(초). */
    seconds: number;
    /** 방 언어(호스트 UI 언어). 구버전 방에는 없을 수 있어 optional. */
    lang?: QuizRoomLang;
    /**
     * 출제할 종목. 호스트가 방을 만들 때 고른다. 비었거나 없으면 전 종목.
     * RTDB는 배열을 인덱스 키 객체로 저장하므로 읽을 때 정규화가 필요하다(QuizRoomService).
     */
    kinds?: SpeedQuizKind[];
  };
  memberIds: Record<string, boolean>;
  players: Record<string, QuizRoomPlayer>;
  round?: QuizRoomRound;
}

/** 제출된 답 1건. `quizAnswers/{roomId}/{uid}` — 호스트만 읽을 수 있다. */
export interface QuizAnswer {
  text: string;
  /** RTDB serverTimestamp가 확정한 제출 시각. 룰이 `now`와 대조해 위조를 막는다. */
  at: number;
}

/** 로비 목록에 쓰는 요약(방 전체를 내려받지 않기 위해 필요한 필드만 뽑아 쓴다). */
export interface QuizRoomSummary {
  id: string;
  hostName: string;
  playerCount: number;
  rounds: number;
  seconds: number;
  createdAt: number;
  /** 방 언어. 목록에서 KO/EN 배지로 보여 준다. */
  lang: QuizRoomLang;
  /** 출제 종목(정규화 완료 — 항상 1개 이상). */
  kinds: SpeedQuizKind[];
  /** 정원이 찼는지. 목록에서 숨기지 않고 '가득 참'으로 표시해 붐빈다는 사실을 알린다. */
  full: boolean;
}
