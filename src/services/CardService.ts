// src/services/CardService.ts
// 카드 수집 모드의 영속 상태 관리(지갑·도감·천장)와 팩깡 로직.
// [FREE-TIER] localStorage 단독 저장. Firestore 동기화는 추후 마일스톤만(업적 패턴) 도입.
// TD 본편 SaveService와 분리 → 기존 세이브/업적 정규화 로직에 영향 없음.

import { pokeAPI } from '../api/pokeapi';
import { Rarity } from '../data/evolution';
import { seasonId, dayId } from '../utils/season';
import {
  CardSaveState, CardWallet, CardCollection, PackType, PullResult, Deck, DeckRow,
} from '../types/cards';

/** 미니 포켓 저장 키. 백업/복원(DatabaseService)이 같은 키를 참조하므로 단일 출처. */
export const CARD_STORAGE_KEY = 'pokemon-td-cards-v1';
const STORAGE_KEY = CARD_STORAGE_KEY;
const CURRENT_VERSION = 1;

const MAX_STARS = 5;
/** 별을 1단계 올리는 데 필요한 잉여 중복 수(원본 1 + 중복 2 = 3장 합성, TFT식). */
const MERGE_COPIES = 2;
/** 일반팩 천장: 이만큼 Gold+ 없이 까면 다음 팩에 Gold+ 1장 보장. */
const NORMAL_PACK_PITY = 20;
/** 팩 1개당 카드 장수. */
export const CARDS_PER_PACK = 5;
/** 신규 유저 스타터 코인 — 노말팩(100) 3회 분량. 0코인 데드락 방지. */
const STARTER_COINS = 300;
/**
 * 신규 유저 스타터 카드 6종 — 0장 데드락 방지(팩 없이도 바로 덱 편성·타워 도전 가능).
 * 앞 3장=전열, 뒤 3장=후열로 기본 덱까지 자동 구성. 관도 대표 종으로 친숙하게.
 */
const STARTER_CARD_IDS = [1, 4, 7, 25, 133, 16]; // 이상해씨·파이리·꼬부기·피카츄·이브이·구구

const RARITY_ORDER: Rarity[] = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Master', 'Legend'];
const rarityRank = (r: Rarity): number => RARITY_ORDER.indexOf(r);

/** 별 최대치에서 중복이 나왔을 때 분해 환급되는 코인(레어도별). */
const RARITY_REFUND: Record<Rarity, number> = {
  Bronze: 10, Silver: 20, Gold: 50, Diamond: 100, Master: 150, Legend: 250,
};

/** 팩 정의(비용·화폐·추첨 보정). */
export interface PackDef {
  type: PackType;
  cost: number;
  currency: keyof CardWallet;
  /** getRandomPokemonIdWithRarity에 넘길 고레어 보정(0=기본 분포). */
  rarityBoost: number;
  /** 팩 내 최소 보장 레어도(이 등급 미만이면 1장 상향). */
  guaranteeMin: Rarity;
}

export const PACK_DEFS: Record<PackType, PackDef> = {
  // 일반=저가 대량, 타입=선택 타입 지정(고가치·고가), 프리미엄=하드화폐 고레어.
  normal:  { type: 'normal',  cost: 100, currency: 'coins',      rarityBoost: 0,   guaranteeMin: 'Silver' },
  type:    { type: 'type',    cost: 300, currency: 'coins',      rarityBoost: 0.4, guaranteeMin: 'Silver' },
  premium: { type: 'premium', cost: 50,  currency: 'starShards', rarityBoost: 1.2, guaranteeMin: 'Gold'   },
};

type Listener = (state: CardSaveState) => void;

export class CardService {
  private state: CardSaveState;
  private snapshot: CardSaveState;
  private listeners = new Set<Listener>();
  /** 팩 개봉 재진입 잠금 — 동시/중복 호출로 이중 차감·이중 개봉 방지(동기 플래그). */
  private opening = false;

  constructor() {
    this.state = this.load();
    this.snapshot = this.clone(this.state);
  }

  private clone(s: CardSaveState): CardSaveState {
    return JSON.parse(JSON.stringify(s));
  }

  // ─── 스타터(신규 유저) ───────────────────────────────────────────────────────
  /** 스타터 카드 6장 도감. now 기준 미세 시차로 도감 정렬 안정화. */
  private starterCollection(now: number): CardCollection {
    const col: CardCollection = {};
    STARTER_CARD_IDS.forEach((id, i) => {
      col[id] = { pokemonId: id, stars: 1, copies: 0, obtainedAt: now - i, isNew: true };
    });
    return col;
  }

  /** 스타터 기본 덱 — 앞 3장 전열 / 뒤 3장 후열. */
  private starterDeck(): Deck {
    return STARTER_CARD_IDS.map((id, i) => ({
      pokemonId: id,
      row: (i < 3 ? 'front' : 'back') as DeckRow,
      slot: i % 3,
    }));
  }

  // ─── 영속화 ────────────────────────────────────────────────────────────────
  private defaultState(): CardSaveState {
    const now = Date.now();
    return {
      version: CURRENT_VERSION,
      wallet: { coins: STARTER_COINS, starShards: 0 },
      collection: this.starterCollection(now),
      packPity: 0,
      stats: { packsOpened: 0, totalPulls: 0 },
      towerProgress: 0,
      deck: this.starterDeck(),
      season: { weekId: '', bestFloor: 0 },
    };
  }

  private load(): CardSaveState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CardSaveState;
        // 얕은 마이그레이션 — 누락 필드 보강
        const merged: CardSaveState = { ...this.defaultState(), ...parsed,
          wallet: { ...this.defaultState().wallet, ...parsed.wallet },
          stats: { ...this.defaultState().stats, ...parsed.stats },
        };
        // 스타터 소급 지급: 팩 한 번도 안 열고 도감이 비어있는 '카드 미착수' 저장본 구제.
        // (스타터 도입 이전에 카드 모드를 연 유저 = 0장 데드락 방지. 카드/덱은 지갑과
        //  무관하게 지급하고, 코인은 완전 0일 때만 보충해 이미 번 코인을 덮어쓰지 않음.)
        const neverCollected = merged.stats.packsOpened === 0
          && Object.keys(merged.collection).length === 0;
        if (neverCollected) {
          merged.collection = this.starterCollection(Date.now());
          if (merged.deck.length === 0) merged.deck = this.starterDeck();
          if (merged.wallet.coins === 0 && merged.wallet.starShards === 0) {
            merged.wallet.coins = STARTER_COINS;
          }
        } else if (parsed.deck === undefined) {
          // 레거시 세이브(카드는 보유하나 deck 필드 자체가 없음): defaultState의 스타터 덱이
          //   병합돼 '안 가진 스타터 카드'가 덱에 뜨는 것 방지 → 빈 덱으로.
          merged.deck = [];
        }
        return merged;
      }
    } catch (e) {
      console.warn('[CardService] load 실패, 기본값 사용', e);
    }
    return this.defaultState();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[CardService] 저장 실패', e);
    }
    // 새 불변 스냅샷 생성 후 통지 (useSyncExternalStore 참조 안정성 보장)
    this.snapshot = this.clone(this.state);
    this.emit();
  }

  private emit() {
    this.listeners.forEach(l => l(this.snapshot));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  /** 변경 시에만 참조가 바뀌는 불변 스냅샷. */
  getState(): CardSaveState {
    return this.snapshot;
  }

  getWallet(): CardWallet { return { ...this.state.wallet }; }
  getCollection(): CardCollection { return JSON.parse(JSON.stringify(this.state.collection)); }
  getTowerProgress(): number { return this.state.towerProgress; }
  getOwnedCount(): number { return Object.keys(this.state.collection).length; }

  // ─── 화폐 ──────────────────────────────────────────────────────────────────
  addCoins(n: number) { if (n <= 0) return; this.state.wallet.coins += n; this.persist(); }
  addStarShards(n: number) { if (n <= 0) return; this.state.wallet.starShards += n; this.persist(); }

  /** 여러 화폐를 한 번에 지급(보상 훅에서 사용) — 1회 저장. */
  grantRewards(reward: { coins?: number; starShards?: number }) {
    let touched = false;
    if (reward.coins && reward.coins > 0) { this.state.wallet.coins += reward.coins; touched = true; }
    if (reward.starShards && reward.starShards > 0) { this.state.wallet.starShards += reward.starShards; touched = true; }
    if (touched) this.persist();
  }

  private canAfford(def: PackDef): boolean {
    return this.state.wallet[def.currency] >= def.cost;
  }

  // ─── 도감 / 카드 부여 ────────────────────────────────────────────────────────
  /** 카드 1장을 도감에 반영. 신규/별업/환급 결과 반환. (저장은 호출자가 일괄 처리) */
  private grantCard(pokemonId: number, rarity: Rarity): PullResult {
    const now = Date.now();
    const col = this.state.collection;
    let entry = col[pokemonId];

    if (!entry) {
      entry = { pokemonId, stars: 1, copies: 0, obtainedAt: now, isNew: true };
      col[pokemonId] = entry;
      return { pokemonId, rarity, isNew: true, starUp: false, stars: 1, refundCoins: 0 };
    }

    // 중복
    if (entry.stars >= MAX_STARS) {
      const refund = RARITY_REFUND[rarity];
      this.state.wallet.coins += refund;
      return { pokemonId, rarity, isNew: false, starUp: false, stars: entry.stars, refundCoins: refund };
    }

    entry.copies += 1;
    let starUp = false;
    while (entry.copies >= MERGE_COPIES && entry.stars < MAX_STARS) {
      entry.copies -= MERGE_COPIES;
      entry.stars += 1;
      starUp = true;
    }
    // 최대 별에 도달하고도 남은 중복은 영영 쓸 데가 없다 → 그 자리에서 코인 환급.
    let refundCoins = 0;
    if (entry.stars >= MAX_STARS && entry.copies > 0) {
      refundCoins = RARITY_REFUND[rarity] * entry.copies;
      entry.copies = 0;
      this.state.wallet.coins += refundCoins;
    }
    return { pokemonId, rarity, isNew: false, starUp, stars: entry.stars, refundCoins };
  }

  /** 도감 열람 시 NEW 뱃지 해제. */
  clearNewFlag(pokemonId: number) {
    const e = this.state.collection[pokemonId];
    if (e && e.isNew) { e.isNew = false; this.persist(); }
  }
  clearAllNewFlags() {
    let touched = false;
    Object.values(this.state.collection).forEach(e => { if (e.isNew) { e.isNew = false; touched = true; } });
    if (touched) this.persist();
  }

  // ─── 팩깡 ──────────────────────────────────────────────────────────────────
  /** 구매 가능 여부(UI 버튼 활성화용). */
  canOpenPack(type: PackType): boolean {
    return this.canAfford(PACK_DEFS[type]);
  }

  /**
   * 팩 1개 개봉. 화폐 차감 → 5장 추첨(보장·천장 반영) → 도감 반영 → 저장.
   * 추첨은 pokeAPI의 레어도 가중 리스트를 사용하므로 사전 preloadRarities 권장.
   */
  async openPack(type: PackType, filterType?: string): Promise<PullResult[]> {
    const def = PACK_DEFS[type];
    if (this.opening) throw new Error('PACK_ALREADY_OPENING');
    if (!this.canAfford(def)) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    // 타입팩은 반드시 타입 지정 필요
    const ft = type === 'type' ? filterType : undefined;
    if (type === 'type' && !ft) throw new Error('TYPE_PACK_NEEDS_TYPE');
    // 동기 잠금 + 선(先)차감: await 이전에 화폐를 깎아 두 번째 호출이 canAfford에서 걸리게 함.
    //   (기존엔 preloadRarities await 뒤에 차감 → 두 호출이 모두 통과해 -음수 지갑/이중 개봉 가능)
    this.opening = true;
    this.state.wallet[def.currency] -= def.cost;
    try {
      return await this._openPackInner(type, def, ft);
    } catch (e) {
      // 실패 시 차감 롤백
      this.state.wallet[def.currency] += def.cost;
      throw e;
    } finally {
      this.opening = false;
    }
  }

  private async _openPackInner(type: PackType, def: PackDef, filterType?: string): Promise<PullResult[]> {
    // 추첨 리스트 보장(캐시되어 있으면 즉시 반환)
    await pokeAPI.preloadRarities();

    // 천장: 일반팩에서 Gold+ 가뭄이 한계를 넘으면 이번 팩에 Gold+ 보장
    const pityForcesGold = type === 'normal' && this.state.packPity >= NORMAL_PACK_PITY;

    // 5장 추첨
    const picks: { id: number; rarity: Rarity }[] = [];
    for (let i = 0; i < CARDS_PER_PACK; i++) {
      picks.push(await this.pickId(def.rarityBoost, undefined, filterType));
    }

    // 최소 보장: 팩 내 guaranteeMin 미만뿐이면 가장 낮은 1장을 상향
    const hasGuarantee = picks.some(p => rarityRank(p.rarity) >= rarityRank(def.guaranteeMin));
    if (!hasGuarantee) {
      const worstIdx = this.lowestRarityIdx(picks);
      picks[worstIdx] = await this.pickId(def.rarityBoost, def.guaranteeMin, filterType);
    }

    // 천장 강제: Gold+ 한 장도 없으면 1장을 Gold로 상향(일반팩 전용 → filterType 없음)
    if (pityForcesGold && !picks.some(p => rarityRank(p.rarity) >= rarityRank('Gold'))) {
      const worstIdx = this.lowestRarityIdx(picks);
      picks[worstIdx] = await this.pickId(def.rarityBoost, 'Gold', filterType);
    }

    // 도감 반영
    const results = picks.map(p => this.grantCard(p.id, p.rarity));

    // 천장 카운터 갱신
    const gotGold = results.some(r => rarityRank(r.rarity) >= rarityRank('Gold'));
    if (type === 'normal') {
      this.state.packPity = gotGold ? 0 : this.state.packPity + 1;
    }

    this.state.stats.packsOpened += 1;
    this.state.stats.totalPulls += results.length;

    this.persist();
    return results;
  }

  /**
   * 레어도 가중 추첨 1회. minRarity 지정 시 그 등급 이상만 담긴 하드 풀에서 추첨(보장 확정).
   * filterType 지정(타입팩) 시 그 타입 카드만 대상.
   */
  private async pickId(rarityBoost: number, minRarity?: Rarity, filterType?: string): Promise<{ id: number; rarity: Rarity }> {
    // minRarity 보장: 소프트 재추첨(40회 후 실패값 반환)이 아니라 해당 등급 이상 풀에서 직접 뽑아
    //   반드시 보장 등급이 나오도록 함. 풀이 비면(캐시 미구축) 소프트 경로로 폴백.
    if (minRarity) {
      const pool = filterType
        ? pokeAPI.getCardIdsOfTypeAtLeastRarity(filterType, rarityRank(minRarity))
        : pokeAPI.getCardIdsAtLeastRarity(rarityRank(minRarity));
      if (pool.length > 0) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const rarity = await pokeAPI.getCardRarity(id);
        return { id, rarity };
      }
    }
    const MAX_TRIES = 40;
    let last: { id: number; rarity: Rarity } | null = null;
    for (let i = 0; i < MAX_TRIES; i++) {
      const id = filterType
        ? await pokeAPI.getRandomCardIdOfType(filterType, rarityBoost)
        : await pokeAPI.getRandomCardId(rarityBoost);
      const rarity = await pokeAPI.getCardRarity(id);
      last = { id, rarity };
      if (!minRarity || rarityRank(rarity) >= rarityRank(minRarity)) return last;
    }
    return last ?? { id: 1, rarity: 'Bronze' };
  }

  private lowestRarityIdx(picks: { rarity: Rarity }[]): number {
    let idx = 0;
    let best = Infinity;
    picks.forEach((p, i) => {
      const r = rarityRank(p.rarity);
      if (r < best) { best = r; idx = i; }
    });
    return idx;
  }

  // ─── 덱 편성 ──────────────────────────────────────────────────────────────────
  getDeck(): Deck {
    // 보유하지 않은 카드가 덱에 남아있으면 제외(분해/이관 대비)
    return this.state.deck.filter(s => !!this.state.collection[s.pokemonId]);
  }
  setDeck(deck: Deck) {
    // 검증: 중복 포켓몬 제거(같은 uid 충돌 방지) + 유효 행/슬롯만 + 최대 6칸.
    const seen = new Set<number>();
    const clean: Deck = [];
    for (const s of deck.slice(0, 6)) {
      if (!s || seen.has(s.pokemonId)) continue;
      if (s.row !== 'front' && s.row !== 'back') continue;
      if (typeof s.slot !== 'number' || s.slot < 0 || s.slot > 2) continue;
      seen.add(s.pokemonId);
      clean.push(s);
    }
    this.state.deck = clean;
    this.persist();
  }

  /** 덱 + 보유 별 스냅샷 — 랜덤 대전 발행/전투 빌드용. */
  getDeckWithStars(): { pokemonId: number; stars: number; row: DeckRow; slot: number }[] {
    return this.getDeck().map(s => ({
      ...s,
      stars: this.state.collection[s.pokemonId]?.stars ?? 1,
    }));
  }

  // ─── 랜덤 대전(비동기 PvP) 전적 ──────────────────────────────────────────────
  getPvpRecord(): { wins: number; losses: number } {
    return { wins: this.state.pvp?.wins ?? 0, losses: this.state.pvp?.losses ?? 0 };
  }

  /** 이번 주 랜덤 대전 승수(주차 바뀌면 0). 랭킹 배지 표시용. */
  getWeeklyPvpWins(): number {
    const wk = seasonId();
    const s = this.state.pvpSeason;
    return s && s.weekId === wk ? s.wins : 0;
  }

  // ─── 랜덤 대전 일일 판수 제한 ────────────────────────────────────────────────
  // [FREE-TIER/무결성] 매칭 1회 = Firestore 쿼리 2회(최대 10 read)에 주간 승수 랭킹까지
  //   올라간다. 제한이 없으면 "다시 매칭" 연타로 시즌 보드를 승수로 도배할 수 있고
  //   무료 쿼터도 샌다. 하루 상한을 둬 실력이 아니라 시간만으로 1위가 되는 걸 막는다.
  static readonly PVP_DAILY_LIMIT = 30;

  /** 오늘 남은 랜덤 대전 판수(KST 자정 리셋). */
  getPvpMatchesLeft(): number {
    const today = dayId();
    const d = this.state.daily;
    const used = d && d.dayId === today ? (d.pvpMatches ?? 0) : 0;
    return Math.max(0, CardService.PVP_DAILY_LIMIT - used);
  }

  /** 소모한 1판 되돌리기 — 상대를 못 찾았거나 매칭이 실패한 경우(플레이어 책임 아님). */
  refundPvpMatch(): void {
    const d = this.state.daily;
    if (!d || d.dayId !== dayId() || !d.pvpMatches) return;
    d.pvpMatches -= 1;
    this.persist();
  }

  /** 대전 1판 소모 기록. 상한을 넘었으면 false(호출자가 매칭을 중단). */
  consumePvpMatch(): boolean {
    const today = dayId();
    let d = this.state.daily;
    if (!d || d.dayId !== today) { d = { dayId: today, winClaimed: false, pvpMatches: 0 }; this.state.daily = d; }
    if ((d.pvpMatches ?? 0) >= CardService.PVP_DAILY_LIMIT) return false;
    d.pvpMatches = (d.pvpMatches ?? 0) + 1;
    this.persist();
    return true;
  }

  /**
   * 대전 결과 기록(통산 + 주간). 승리 시 이번 주 누적 승수를 반환
   * (=Firestore 주간 랭킹에 기록할 값), 패배면 null.
   */
  recordPvpResult(win: boolean): number | null {
    const rec = this.state.pvp ?? { wins: 0, losses: 0 };
    if (win) rec.wins += 1; else rec.losses += 1;
    this.state.pvp = rec;

    let weeklyWins: number | null = null;
    if (win) {
      const wk = seasonId();
      let s = this.state.pvpSeason;
      if (!s || s.weekId !== wk) {
        // 주 경계 통과 — 미청구 직전 주 승수를 스냅샷(보상 근거 보존)
        if (s && s.wins > 0 && !(this.state.claimedSeasonWeeks ?? []).includes(s.weekId)) {
          this.state.prevPvpSeason = { weekId: s.weekId, wins: s.wins };
        }
        s = { weekId: wk, wins: 0 }; this.state.pvpSeason = s;
      }
      s.wins += 1;
      weeklyWins = s.wins;
    }
    this.persist();
    return weeklyWins;
  }

  // ─── 일일 첫 승 보너스 ────────────────────────────────────────────────────────
  // [경제] 소액 고정(30코인+1별조각) — 매일 접속할 이유를 만드는 리텐션 훅.
  //   타워 승리/랜덤 대전 승리 공통 1회(KST 자정 리셋, 시즌과 동일 앵커).
  claimDailyFirstWin(): { coins: number; starShards: number } | null {
    const today = dayId();
    const d = this.state.daily;
    if (d && d.dayId === today && d.winClaimed) return null;

    // 같은 날짜면 pvpMatches를 보존(통째로 덮어쓰면 일일 판수 카운터가 리셋된다)
    this.state.daily = {
      dayId: today,
      winClaimed: true,
      pvpMatches: d && d.dayId === today ? (d.pvpMatches ?? 0) : 0,
    };
    const reward = { coins: 30, starShards: 1 };
    this.state.wallet.coins += reward.coins;
    this.state.wallet.starShards += reward.starShards;
    this.persist();
    return reward;
  }

  // ─── 도감 수집 마일스톤 (1회성) ───────────────────────────────────────────────
  // [경제] 1025종 수집의 중간 목표. 퀴즈 마일스톤과 동일 패턴(수령 목록 영속).
  private static readonly DEX_MILESTONES: Array<{ threshold: number; coins: number; starShards: number }> = [
    { threshold: 10, coins: 30, starShards: 0 },
    { threshold: 25, coins: 50, starShards: 3 },
    { threshold: 50, coins: 80, starShards: 5 },
    { threshold: 100, coins: 120, starShards: 10 },
    { threshold: 200, coins: 160, starShards: 15 },
    { threshold: 300, coins: 200, starShards: 20 },
    { threshold: 500, coins: 300, starShards: 30 },
    { threshold: 750, coins: 400, starShards: 40 },
    { threshold: 1025, coins: 1000, starShards: 100 }, // 도감 완성
  ];

  /** 보유 종 수 기준 새로 도달한 도감 마일스톤 수령. 반환: 이번에 받은 목록. */
  claimDexMilestones(): Array<{ threshold: number; coins: number; starShards: number }> {
    const owned = this.getOwnedCount();
    const claimed = new Set(this.state.claimedDexMilestones ?? []);
    const earned = CardService.DEX_MILESTONES.filter(m => owned >= m.threshold && !claimed.has(m.threshold));
    if (earned.length === 0) return [];

    earned.forEach(m => claimed.add(m.threshold));
    this.state.claimedDexMilestones = Array.from(claimed).sort((a, b) => a - b);
    this.state.wallet.coins += earned.reduce((s, m) => s + m.coins, 0);
    this.state.wallet.starShards += earned.reduce((s, m) => s + m.starShards, 0);
    this.persist();
    return earned;
  }

  // ─── 지난주 시즌 순위 보상 (셀프 수령) ────────────────────────────────────────
  // 서버(Functions) 없이 클라이언트가 지난주 자기 순위를 읽고 1회 수령.
  // 직전 주만 대상(그 이전 주 문서는 lazy cleanup으로 삭제됨). 로컬 시즌 캐시가
  // 참가 증거 — 캐시 유실(기기 변경) 시 수령 불가는 백업 기능으로 완화.
  getUnclaimedSeasonWeek(): { weekId: string; bestFloor: number; pvpWins: number } | null {
    const prevWeek = seasonId(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    if ((this.state.claimedSeasonWeeks ?? []).includes(prevWeek)) return null;

    // 현재 시즌 캐시가 직전 주면 그대로, 아니면(새 주 진입으로 덮어써진 경우) 스냅샷에서 복구
    const bestFloor = this.state.season?.weekId === prevWeek ? this.state.season.bestFloor
      : this.state.prevSeason?.weekId === prevWeek ? this.state.prevSeason.bestFloor : 0;
    const pvpWins = this.state.pvpSeason?.weekId === prevWeek ? this.state.pvpSeason.wins
      : this.state.prevPvpSeason?.weekId === prevWeek ? this.state.prevPvpSeason.wins : 0;
    if (bestFloor <= 0 && pvpWins <= 0) return null;
    return { weekId: prevWeek, bestFloor, pvpWins };
  }

  /** 시즌 보상 수령 확정 — 주차를 수령 목록에 기록하고 재화 지급. */
  claimSeasonReward(weekId: string, reward: { coins: number; starShards: number }): void {
    const claimed = new Set(this.state.claimedSeasonWeeks ?? []);
    if (claimed.has(weekId)) return;
    claimed.add(weekId);
    // 목록 무한 성장 방지 — 최근 8개만 유지(직전 주만 검사하므로 충분)
    this.state.claimedSeasonWeeks = Array.from(claimed).sort().slice(-8);
    this.state.wallet.coins += reward.coins;
    this.state.wallet.starShards += reward.starShards;
    this.persist();
  }

  // ─── 트레이너 타워 진행 ───────────────────────────────────────────────────────
  setTowerProgress(floor: number) {
    if (floor > this.state.towerProgress) { this.state.towerProgress = floor; this.persist(); }
  }

  /** 이번 주 시즌 최고 도달 층(주차 바뀌면 0). 허브 위젯 표시용. */
  getWeeklyBestFloor(): number {
    const wk = seasonId();
    const s = this.state.season;
    return s && s.weekId === wk ? s.bestFloor : 0;
  }

  /**
   * 이번 주 시즌 최고층 갱신. 주차가 바뀌었으면 초기화 후 기록.
   * 개선됐으면 새 최고층을 반환(=Firestore 시즌 랭킹에 기록할 값), 아니면 null.
   * 로컬 캐시로 불필요한 Firestore write를 막는다.
   */
  recordWeeklyBestFloor(floor: number): number | null {
    const wk = seasonId();
    let s = this.state.season;
    if (!s || s.weekId !== wk) {
      // 주 경계 통과 — 미청구 직전 주 기록을 스냅샷(뷰가 마운트된 채 새 주 첫 판을 돌려도 보상 근거 보존)
      if (s && s.bestFloor > 0 && !(this.state.claimedSeasonWeeks ?? []).includes(s.weekId)) {
        this.state.prevSeason = { weekId: s.weekId, bestFloor: s.bestFloor };
      }
      s = { weekId: wk, bestFloor: 0 }; this.state.season = s;
    }
    if (floor > s.bestFloor) { s.bestFloor = floor; this.persist(); return floor; }
    return null;
  }

  // ─── 디버그/개발용 ────────────────────────────────────────────────────────────
  /** 개발 중 테스트용 화폐 지급. (정식 출시 전 제거 예정) */
  devGrant(coins: number, starShards: number) {
    this.state.wallet.coins += coins;
    this.state.wallet.starShards += starShards;
    this.persist();
  }
}

export const cardService = new CardService();

/** 시즌 순위 밴드 → 보상. rank null(조회 실패/문서 없음)이면 참가상.
 *  [경제] 1위 300코인+30조각 = 멀티 1위와 동급의 주간 원타임. */
export function seasonRewardForRank(rank: number | null): { coins: number; starShards: number } {
  if (rank === 1) return { coins: 300, starShards: 30 };
  if (rank !== null && rank <= 3) return { coins: 200, starShards: 20 };
  if (rank !== null && rank <= 10) return { coins: 120, starShards: 12 };
  if (rank !== null && rank <= 50) return { coins: 60, starShards: 6 };
  return { coins: 30, starShards: 2 }; // 참가상
}
