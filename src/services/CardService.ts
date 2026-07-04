// src/services/CardService.ts
// 카드 수집 모드의 영속 상태 관리(지갑·도감·천장)와 팩깡 로직.
// [FREE-TIER] localStorage 단독 저장. Firestore 동기화는 추후 마일스톤만(업적 패턴) 도입.
// TD 본편 SaveService와 분리 → 기존 세이브/업적 정규화 로직에 영향 없음.

import { pokeAPI } from '../api/pokeapi';
import { Rarity } from '../data/evolution';
import {
  CardSaveState, CardWallet, CardCollection, PackType, PullResult, Deck,
} from '../types/cards';

const STORAGE_KEY = 'pokemon-td-cards-v1';
const CURRENT_VERSION = 1;

const MAX_STARS = 5;
/** 별을 1단계 올리는 데 필요한 잉여 중복 수(원본 1 + 중복 2 = 3장 합성, TFT식). */
const MERGE_COPIES = 2;
/** 일반팩 천장: 이만큼 Gold+ 없이 까면 다음 팩에 Gold+ 1장 보장. */
const NORMAL_PACK_PITY = 20;
/** 팩 1개당 카드 장수. */
export const CARDS_PER_PACK = 5;

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
  normal:  { type: 'normal',  cost: 150, currency: 'coins',      rarityBoost: 0,   guaranteeMin: 'Silver' },
  type:    { type: 'type',    cost: 250, currency: 'coins',      rarityBoost: 0.4, guaranteeMin: 'Silver' },
  premium: { type: 'premium', cost: 50,  currency: 'starShards', rarityBoost: 1.2, guaranteeMin: 'Gold'   },
};

type Listener = (state: CardSaveState) => void;

class CardService {
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

  // ─── 영속화 ────────────────────────────────────────────────────────────────
  private defaultState(): CardSaveState {
    return {
      version: CURRENT_VERSION,
      wallet: { coins: 0, starShards: 0 },
      collection: {},
      packPity: 0,
      stats: { packsOpened: 0, totalPulls: 0 },
      towerProgress: 0,
      deck: [],
    };
  }

  private load(): CardSaveState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CardSaveState;
        // 얕은 마이그레이션 — 누락 필드 보강
        return { ...this.defaultState(), ...parsed,
          wallet: { ...this.defaultState().wallet, ...parsed.wallet },
          stats: { ...this.defaultState().stats, ...parsed.stats },
        };
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
    return { pokemonId, rarity, isNew: false, starUp, stars: entry.stars, refundCoins: 0 };
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
  async openPack(type: PackType): Promise<PullResult[]> {
    const def = PACK_DEFS[type];
    if (this.opening) throw new Error('PACK_ALREADY_OPENING');
    if (!this.canAfford(def)) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    // 동기 잠금 + 선(先)차감: await 이전에 화폐를 깎아 두 번째 호출이 canAfford에서 걸리게 함.
    //   (기존엔 preloadRarities await 뒤에 차감 → 두 호출이 모두 통과해 -음수 지갑/이중 개봉 가능)
    this.opening = true;
    this.state.wallet[def.currency] -= def.cost;
    try {
      return await this._openPackInner(type, def);
    } catch (e) {
      // 실패 시 차감 롤백
      this.state.wallet[def.currency] += def.cost;
      throw e;
    } finally {
      this.opening = false;
    }
  }

  private async _openPackInner(type: PackType, def: PackDef): Promise<PullResult[]> {
    // 추첨 리스트 보장(캐시되어 있으면 즉시 반환)
    await pokeAPI.preloadRarities();

    // 천장: 일반팩에서 Gold+ 가뭄이 한계를 넘으면 이번 팩에 Gold+ 보장
    const pityForcesGold = type === 'normal' && this.state.packPity >= NORMAL_PACK_PITY;

    // 5장 추첨
    const picks: { id: number; rarity: Rarity }[] = [];
    for (let i = 0; i < CARDS_PER_PACK; i++) {
      picks.push(await this.pickId(def.rarityBoost));
    }

    // 최소 보장: 팩 내 guaranteeMin 미만뿐이면 가장 낮은 1장을 상향
    const hasGuarantee = picks.some(p => rarityRank(p.rarity) >= rarityRank(def.guaranteeMin));
    if (!hasGuarantee) {
      const worstIdx = this.lowestRarityIdx(picks);
      picks[worstIdx] = await this.pickId(def.rarityBoost, def.guaranteeMin);
    }

    // 천장 강제: Gold+ 한 장도 없으면 1장을 Gold로 상향
    if (pityForcesGold && !picks.some(p => rarityRank(p.rarity) >= rarityRank('Gold'))) {
      const worstIdx = this.lowestRarityIdx(picks);
      picks[worstIdx] = await this.pickId(def.rarityBoost, 'Gold');
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

  /** 레어도 가중 추첨 1회. minRarity 지정 시 그 등급 이상만 담긴 하드 풀에서 추첨(보장 확정). */
  private async pickId(rarityBoost: number, minRarity?: Rarity): Promise<{ id: number; rarity: Rarity }> {
    // minRarity 보장: 소프트 재추첨(40회 후 실패값 반환)이 아니라 해당 등급 이상 풀에서 직접 뽑아
    //   반드시 보장 등급이 나오도록 함. 풀이 비면(캐시 미구축) 소프트 경로로 폴백.
    if (minRarity) {
      const pool = pokeAPI.getIdsAtLeastRarity(rarityRank(minRarity));
      if (pool.length > 0) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const rarity = await pokeAPI.getRarity(id);
        return { id, rarity };
      }
    }
    const MAX_TRIES = 40;
    let last: { id: number; rarity: Rarity } | null = null;
    for (let i = 0; i < MAX_TRIES; i++) {
      const id = await pokeAPI.getRandomPokemonIdWithRarity(rarityBoost);
      const rarity = await pokeAPI.getRarity(id);
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

  // ─── 트레이너 타워 진행 ───────────────────────────────────────────────────────
  setTowerProgress(floor: number) {
    if (floor > this.state.towerProgress) { this.state.towerProgress = floor; this.persist(); }
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
