// src/types/cards.ts
// 카드 수집 / 오토배틀 모드 전용 타입.
// TD 본편(types/game.ts)과 독립. 영속 데이터는 CardService가 localStorage로 관리.

import { Rarity } from '../data/evolution';

/** 한 종(species)의 보유 카드 1장. pokemonId로 키잉. */
export interface CardEntry {
  pokemonId: number;
  /** 강화 단계 1~5 (중복 합성으로 상승). 전투 스탯 배율의 근거. */
  stars: number;
  /** 합성에 쓸 수 있는 잉여 중복 수 (별 상승 시 소모). */
  copies: number;
  /** 최초 획득 시각(ms). 도감 정렬용. */
  obtainedAt: number;
  /** 도감에서 "NEW" 뱃지 표시 여부 (열람 시 false 처리). */
  isNew: boolean;
}

export interface CardCollection {
  [pokemonId: number]: CardEntry;
}

export interface CardWallet {
  /** 소프트 화폐 — 일반/타입팩. */
  coins: number;
  /** 하드 화폐 — 고급팩·별합성. */
  starShards: number;
}

export type PackType = 'normal' | 'type' | 'premium';

export type DeckRow = 'front' | 'back';

/** 덱 한 칸. row=전열/후열, slot=같은 열 내 위치(0~2). 비어있으면 collection엔 없음. */
export interface DeckSlot {
  pokemonId: number;
  row: DeckRow;
  slot: number;     // 0..2
}

/** 6칸 덱(전열3+후열3). 길이 0~6. */
export type Deck = DeckSlot[];

/** 팩 1개를 깠을 때 카드 1장의 결과. 리빌 애니메이션·요약에 사용. */
export interface PullResult {
  pokemonId: number;
  rarity: Rarity;
  /** 이번에 도감에 처음 추가됐는가. */
  isNew: boolean;
  /** 중복으로 별이 올랐는가. */
  starUp: boolean;
  /** 적용 후 별 단계. */
  stars: number;
  /**
   * 적용 후 남은 잉여 중복 수(0 = 방금 별로 소모됨 또는 최대 별).
   * 별이 오르지 않은 중복도 "쌓이고 있다"를 화면에 보여주기 위해 필요하다 —
   * 이게 없으면 2장째 중복이 아무 표시 없이 지나가 합성이 고장난 것처럼 보인다.
   */
  copies: number;
  /** 중복이라 분해 환급된 코인(있으면). */
  refundCoins: number;
}

/** CardService가 보관/직렬화하는 전체 상태. */
export interface CardSaveState {
  version: number;
  wallet: CardWallet;
  collection: CardCollection;
  /** 일반팩 천장 카운터 — Gold+ 안 나온 누적 팩 수. */
  packPity: number;
  stats: {
    packsOpened: number;
    totalPulls: number;
  };
  /** 트레이너 타워 최고 도달 층. */
  towerProgress: number;
  /** 저장된 편성 덱(전투에 출전). */
  deck: Deck;
  /** 주간 시즌 타워 기록 — weekId(ISO 주차)와 그 주의 최고 도달 층. 주차가 바뀌면 초기화. */
  season?: { weekId: string; bestFloor: number };
  /** 직전 주 시즌 타워 스냅샷 — 주 경계를 넘겨 플레이해도 지난주 보상 청구 근거를 보존. */
  prevSeason?: { weekId: string; bestFloor: number };
  /** 랜덤 대전(비동기 PvP) 통산 전적. */
  pvp?: { wins: number; losses: number };
  /** 랜덤 대전 주간 시즌 승수 — weekId가 바뀌면 초기화. */
  pvpSeason?: { weekId: string; wins: number };
  /** 직전 주 랜덤 대전 시즌 스냅샷 — 보상 청구 근거 보존용. */
  prevPvpSeason?: { weekId: string; wins: number };
  /** 일일 첫 승 보너스(KST 날짜 기준) 수령 상태 + 랜덤 대전 일일 소화 판수. */
  daily?: { dayId: string; winClaimed: boolean; pvpMatches?: number };
  /** 수령한 도감 수집 마일스톤(보유 종 수 threshold 목록). */
  claimedDexMilestones?: number[];
  /** 시즌 순위 보상을 수령(또는 만료 처리)한 주차 ID 목록. */
  claimedSeasonWeeks?: string[];
}
