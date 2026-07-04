// src/api/pokeapi.ts
import axios from 'axios';
import { EVOLUTION_CHAINS, getFinalEvolutionId, calculateRarity, RARITY_WEIGHTS, Rarity } from '../data/evolution';
import { GameMove, MoveEffect } from '../types/game';

const API_BASE = 'https://pokeapi.co/api/v2';

// 레어도 랭크(0=Bronze … 5=Legend) — 가중치로 역산. 콘테스트 홀 부스트에 사용.
const RARITY_ORDER: Rarity[] = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Master', 'Legend'];
const WEIGHT_TO_RANK: Record<number, number> = Object.fromEntries(
  RARITY_ORDER.map((r, i) => [RARITY_WEIGHTS[r], i])
);

// [DEADLOCK-FIX] 모든 PokeAPI 요청에 타임아웃(10초).
//   무응답(hang) 시 axios가 reject → spawnEnemy의 catch가 fallback 적을 스폰하여
//   pendingSpawnCount가 정상 감소 → 웨이브가 멈추지 않도록 보장.
//   (axios는 이 프로젝트에서 PokeAPI 전용으로만 사용되므로 전역 설정이 안전)
axios.defaults.timeout = 10000;

// ─── 로컬스토리지 캐시 키 ─────────────────────────────────────────
const LS_STAT_CACHE_KEY = 'pokeapi_stat_cache_v2';
// v3: 가중치 리스트를 '최종진화 레어도' 기준으로 재산정(라벨=드랍확률 일치). 구버전 own-stat 리스트 무효화.
const LS_WEIGHTED_LIST_KEY = 'pokeapi_weighted_list_v3';

const getCurrentLanguage = (): 'ko' | 'en' => {
  const lang = localStorage.getItem('language');
  return lang === 'en' ? 'en' : 'ko';
};

export interface PokemonAbilityData {
  name: string;
  displayName: string;
  description: string;
}

export interface PokemonData {
  id: number;
  name: string;
  displayName: string;
  types: string[];
  stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number };
  sprite: string;
  moves: string[];
  abilities: PokemonAbilityData[];
}

// 웨이브 스폰 전용 경량 캐시 (스탯만 저장, 빠른 조회용)
export interface StatOnlyData {
  id: number;
  statTotal: number;
  types: string[];
}

export interface MoveData {
  name: string;
  displayName: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  damageClass: 'physical' | 'special' | 'status';
  effectChance: number | null;
  target: string;
  effectEntries: string[];
}

const EVOLVED_POKEMON_IDS = new Set(EVOLUTION_CHAINS.map(e => e.to));

// 병렬 요청 최대 동시 수 (PokeAPI rate limit 방지)
const MAX_CONCURRENT = 20;

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

class PokeAPIService {
  // [V8-FIX-5-1] 캐시 키에 언어 포함 → 언어 전환 시 자동 invalidate
  //   pokemonCache: `${lang}:${id}` (예: 'ko:1', 'en:1')
  //   moveCache: `${lang}:${name}` (예: 'ko:tackle', 'en:tackle')
  private pokemonCache = new Map<string, PokemonData>();
  private statCache = new Map<number, StatOnlyData>();   // 경량 스탯 전용 캐시 (언어 무관)
  private moveCache = new Map<string, MoveData>();
  private learnableMovesCache = new Map<string, string[]>(); // [V8-FIX-5-2] 레벨별 학습 기술 캐시 (id:level)
  private rarityCache = new Map<number, Rarity>();
  private weightedPokemonList: Array<{ id: number; weight: number }> = [];
  private preloadPromise: Promise<void> | null = null;

  constructor() {
    // 앱 시작 시 로컬스토리지에서 스탯 캐시 복원 (가장 빠른 경로)
    this.restoreFromLocalStorage();
  }

  // ─── 로컬스토리지 캐시 복원 / 저장 ────────────────────────────────
  private restoreFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(LS_STAT_CACHE_KEY);
      if (raw) {
        const data: StatOnlyData[] = JSON.parse(raw);
        data.forEach(d => this.statCache.set(d.id, d));
        console.log(`[PokeAPI] 로컬캐시 복원: ${this.statCache.size}마리`);
      }

      const weightedRaw = localStorage.getItem(LS_WEIGHTED_LIST_KEY);
      if (weightedRaw) {
        this.weightedPokemonList = JSON.parse(weightedRaw);
        console.log(`[PokeAPI] 가중치 리스트 복원: ${this.weightedPokemonList.length}개`);
      }
    } catch {
      // 파싱 실패 시 무시하고 새로 로드
      localStorage.removeItem(LS_STAT_CACHE_KEY);
      localStorage.removeItem(LS_WEIGHTED_LIST_KEY);
    }
  }

  private saveStatCacheToLocalStorage(): void {
    try {
      const data = Array.from(this.statCache.values());
      localStorage.setItem(LS_STAT_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(LS_WEIGHTED_LIST_KEY, JSON.stringify(this.weightedPokemonList));
    } catch (e) {
      console.warn('[PokeAPI] 로컬스토리지 저장 실패 (용량 초과 가능성)', e);
    }
  }

  // ─── 경량 스탯 전용 조회 (웨이브 스폰용) ──────────────────────────
  // 전체 PokemonData가 아닌 stat만 필요한 경우 API 호출 1회로 처리
  private async getStatOnly(id: number): Promise<StatOnlyData> {
    if (this.statCache.has(id)) return this.statCache.get(id)!;

    const res = await axios.get(`${API_BASE}/pokemon/${id}`);
    const d = res.data;
    const statTotal =
      (d.stats[0]?.base_stat ?? 0) +
      (d.stats[1]?.base_stat ?? 0) +
      (d.stats[2]?.base_stat ?? 0) +
      (d.stats[3]?.base_stat ?? 0) +
      (d.stats[4]?.base_stat ?? 0) +
      (d.stats[5]?.base_stat ?? 0);

    const entry: StatOnlyData = {
      id,
      statTotal,
      types: d.types.map((t: any) => t.type.name),
    };
    this.statCache.set(id, entry);
    return entry;
  }

  // ─── 전체 포켓몬 데이터 조회 (게임 배치용) ───────────────────────
  async getPokemon(id: number): Promise<PokemonData> {
    const lang = getCurrentLanguage();
    const cacheKey = `${lang}:${id}`;
    if (this.pokemonCache.has(cacheKey)) return this.pokemonCache.get(cacheKey)!;

    const res = await axios.get(`${API_BASE}/pokemon/${id}`);
    const d = res.data;

    const [speciesRes, ...abilityResponses] = await Promise.all([
      axios.get(d.species.url),
      ...d.abilities.map((a: any) =>
        axios.get(a.ability.url).catch(() => null)
      ),
    ]);

    const s = speciesRes.data;
    const nameEntry =
      s.names.find((n: any) => n.language.name === lang) ||
      s.names.find((n: any) => n.language.name === 'en');
    const displayName = nameEntry ? nameEntry.name : d.name;

    const abilities: PokemonAbilityData[] = abilityResponses
      .filter(Boolean)
      .map((abilityRes: any) => {
        const info = abilityRes.data;
        const nameE =
          info.names.find((n: any) => n.language.name === lang) ||
          info.names.find((n: any) => n.language.name === 'en');
        const descE =
          info.effect_entries.find((e: any) => e.language.name === lang) ||
          info.effect_entries.find((e: any) => e.language.name === 'en');
        return {
          name: info.name,
          displayName: nameE ? nameE.name : info.name,
          description: descE?.short_effect || descE?.effect || 'No description',
        };
      });

    // 스탯 캐시도 동시에 채움
    const statTotal =
      d.stats[0].base_stat + d.stats[1].base_stat + d.stats[2].base_stat +
      d.stats[3].base_stat + d.stats[4].base_stat + d.stats[5].base_stat;
    if (!this.statCache.has(id)) {
      this.statCache.set(id, {
        id,
        statTotal,
        types: d.types.map((t: any) => t.type.name),
      });
    }

      // [FIX] 레벨업 기술을 앞에 배치 → PokemonPicker가 TM보다 고유 기술을 우선 채용
      const levelUpMoves = d.moves
        .filter((m: any) =>
          m.version_group_details.some(
            (vgd: any) => vgd.move_learn_method?.name === 'level-up'
          )
        )
        .map((m: any) => m.move.name as string);
      const otherMoves = d.moves
        .filter((m: any) =>
          !m.version_group_details.some(
            (vgd: any) => vgd.move_learn_method?.name === 'level-up'
          )
        )
        .map((m: any) => m.move.name as string);

    const pokemon: PokemonData = {
      id: d.id,
      name: d.name,
      displayName,
      types: d.types.map((t: any) => t.type.name),
      stats: {
        hp: d.stats[0].base_stat,
        attack: d.stats[1].base_stat,
        defense: d.stats[2].base_stat,
        specialAttack: d.stats[3].base_stat,
        specialDefense: d.stats[4].base_stat,
        speed: d.stats[5].base_stat,
      },
      sprite:
        d.sprites.front_default ||
        d.sprites.other?.['official-artwork']?.front_default ||
        '',
      moves: [...levelUpMoves, ...otherMoves].slice(0, 20),
      abilities,
    };

    this.pokemonCache.set(cacheKey, pokemon);
    return pokemon;
  }

  async getMove(name: string): Promise<MoveData> {
    const lang = getCurrentLanguage();
    const moveCacheKey = `${lang}:${name}`;
    if (this.moveCache.has(moveCacheKey)) return this.moveCache.get(moveCacheKey)!;
    const res = await axios.get(`${API_BASE}/move/${name}`);
    const d = res.data;

    const nameEntry =
      d.names.find((n: any) => n.language.name === lang) ||
      d.names.find((n: any) => n.language.name === 'en');
    const displayName = nameEntry ? nameEntry.name : d.name;

    const effectEntry =
      d.effect_entries.find((e: any) => e.language.name === lang) ||
      d.effect_entries.find((e: any) => e.language.name === 'en');
    const effectEntries = [
      effectEntry?.short_effect || effectEntry?.effect || 'No description',
    ];

    const move: MoveData = {
      name: d.name,
      displayName,
      type: d.type.name,
      power: d.power,
      accuracy: d.accuracy,
      damageClass: d.damage_class.name,
      effectChance: d.effect_chance,
      target: d.target.name,
      effectEntries,
    };
    this.moveCache.set(moveCacheKey, move);
    return move;
  }

  async getRarity(basePokemonId: number): Promise<Rarity> {
    if (this.rarityCache.has(basePokemonId))
      return this.rarityCache.get(basePokemonId)!;

    try {
      const finalEvolutionId = getFinalEvolutionId(basePokemonId);
      // 경량 스탯으로 레어도 계산 (PokemonData 전체 불필요)
      const stat = await this.getStatOnly(finalEvolutionId);
      const rarity = calculateRarity(stat.statTotal);
      this.rarityCache.set(basePokemonId, rarity);
      return rarity;
    } catch {
      return 'Bronze';
    }
  }

  /**
   * 프리로딩 개선:
   * 1. 로컬스토리지 캐시가 있으면 API 호출 없이 즉시 완료 (< 100ms)
   * 2. 없으면 경량 스탯만 가져옴 (API 호출 1개/포켓몬, 동시 20개 제한)
   * 3. 완료 후 로컬스토리지에 저장 (다음 실행부터 즉시 완료)
   */
  async preloadRarities(
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    // 이미 로딩 중이면 같은 Promise 반환 (중복 호출 방지)
    if (this.preloadPromise) return this.preloadPromise;

    // 실패 시 캐시를 비워 다음 호출에서 재시도 가능하게 함
    // (실패한 Promise가 캐시로 남으면 재시도가 영영 같은 에러만 반환)
    this.preloadPromise = this._doPreload(onProgress).catch(err => {
      this.preloadPromise = null;
      throw err;
    });
    return this.preloadPromise;
  }

  private async _doPreload(
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    const MAX_ID = 1025;

    // 로컬 캐시가 충분하면 즉시 완료
    if (
      this.weightedPokemonList.length > 0 &&
      this.statCache.size >= MAX_ID * 0.95 // 95% 이상 캐시됨
    ) {
      console.log('[PokeAPI] 로컬캐시 사용 - 프리로드 즉시 완료');
      return;
    }

    console.log('[PokeAPI] 포켓몬 스탯 프리로딩 시작 (경량 모드)...');
    const allIds = Array.from({ length: MAX_ID }, (_, i) => i + 1);
    const total = allIds.length;
    let loaded = 0;

    const tasks = allIds.map(id => async () => {
      try {
        await this.getStatOnly(id);
      } catch {
        // 실패 무시
      }
      loaded++;
      onProgress?.(loaded, total);
    });

    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT);

    // 가중치 리스트 재계산
    // [RARITY-FIX] 카드 라벨(getRarity)은 '최종진화' 스탯 기준인데 과거 가중치는 '기초형' 스탯
    //   기준이라 라벨↔드랍확률이 어긋났다(예: 개구마 → Master 라벨인데 Bronze 확률로 흔하게 드랍).
    //   가중치도 최종진화 레어도로 통일 → 라벨과 실제 드랍 희소도가 일치. rarityCache도 동일값으로 채워
    //   세션마다 라벨이 바뀌던 문제(캐시 히트 시 rarityCache 미충전)를 제거.
    const tempWeightedList: Array<{ id: number; weight: number }> = [];
    for (const [id, stat] of this.statCache) {
      if (!EVOLVED_POKEMON_IDS.has(id)) {
        const finalId = getFinalEvolutionId(id);
        const finalStat = this.statCache.get(finalId);
        const rarity = calculateRarity(finalStat ? finalStat.statTotal : stat.statTotal);
        this.rarityCache.set(id, rarity);
        tempWeightedList.push({ id, weight: RARITY_WEIGHTS[rarity] });
      }
    }
    this.weightedPokemonList = tempWeightedList;

    // 로컬스토리지에 저장 (다음 실행 시 즉시 복원)
    this.saveStatCacheToLocalStorage();

    console.log(
      `[PokeAPI] 프리로딩 완료: ${this.statCache.size}마리 캐시, ${this.weightedPokemonList.length}개 가중치 리스트`
    );
  }

  // rarityBoost>0이면 고레어(높은 랭크) 가중치를 끌어올린다(콘테스트 홀). 0이면 기본 분포.
  // [DETERMINISM] rng를 넘기면 그 난수원을 사용(트레이너 타워 결정론 시드용). 미지정 시 Math.random.
  async getRandomPokemonIdWithRarity(rarityBoost = 0, rng?: () => number): Promise<number> {
    if (this.weightedPokemonList.length === 0) {
      await this.preloadRarities();
    }
    const rand = rng ?? Math.random;

    const eff = (p: { id: number; weight: number }) =>
      rarityBoost > 0
        ? p.weight * (1 + rarityBoost * (WEIGHT_TO_RANK[p.weight] ?? 0))
        : p.weight;

    const totalWeight = this.weightedPokemonList.reduce((sum, p) => sum + eff(p), 0);
    let random = rand() * totalWeight;
    for (const pokemon of this.weightedPokemonList) {
      random -= eff(pokemon);
      if (random <= 0) return pokemon.id;
    }
    return this.weightedPokemonList[0]?.id || 1;
  }

  /**
   * [DETERMINISM] 특정 레어도 랭크 이상만 담긴 후보 풀 반환(팩 최소보장·천장용 하드 풀).
   * 재추첨 루프(pickId)가 40회 시도 후에도 못 맞추는 소프트 보장을 대체한다.
   */
  getIdsAtLeastRarity(minRank: number): number[] {
    const out: number[] = [];
    for (const p of this.weightedPokemonList) {
      const rank = WEIGHT_TO_RANK[p.weight] ?? 0;
      if (rank >= minRank) out.push(p.id);
    }
    return out;
  }

  getRandomPokemonId(maxGen: number = 9): number {
    const max =
      maxGen === 1 ? 151 :
      maxGen === 2 ? 251 :
      maxGen === 3 ? 386 :
      maxGen === 4 ? 493 :
      maxGen === 5 ? 649 :
      maxGen === 6 ? 721 :
      maxGen === 7 ? 809 :
      maxGen === 8 ? 905 : 1025;

    let randomId = 0;
    do {
      randomId = Math.floor(Math.random() * max) + 1;
    } while (EVOLVED_POKEMON_IDS.has(randomId));
    return randomId;
  }

  /**
   * WaveSystem 전용: 경량 스탯 캐시로 포켓몬 ID 선택 (API 추가 호출 없음)
   */
  getEnemyPokemonIdByStatRange(minStat: number, maxStat: number): number {
    const suitable: number[] = [];
    for (const [id, stat] of this.statCache) {
      if (stat.statTotal >= minStat && stat.statTotal <= maxStat) {
        suitable.push(id);
      }
    }
    if (suitable.length > 0) {
      return suitable[Math.floor(Math.random() * suitable.length)];
    }
    return Math.floor(Math.random() * 1025) + 1;
  }

  /**
   * 스토리 모드 전용: 타입 편향 + 스탯 범위로 적 포켓몬 선택
   * types 배열 중 하나라도 포함하는 포켓몬을 우선 선택
   */
  getEnemyPokemonIdByTypeAndStat(minStat: number, maxStat: number, types: string[]): number {
    const typedCandidates: number[] = [];
    const fallbackCandidates: number[] = [];
    const typeSet = new Set(types);

    for (const [id, stat] of this.statCache) {
      if (stat.statTotal >= minStat && stat.statTotal <= maxStat) {
        if (stat.types.some(t => typeSet.has(t))) {
          typedCandidates.push(id);
        } else {
          fallbackCandidates.push(id);
        }
      }
    }

    // 타입 매칭 후보가 있으면 100% 그 중에서만 선택
    if (typedCandidates.length > 0) {
      return typedCandidates[Math.floor(Math.random() * typedCandidates.length)];
    }
    // statCache에 해당 타입이 없으면 스탯 범위로 폴백 (초기 캐시 미구축 상황 대비)
    return this.getEnemyPokemonIdByStatRange(minStat, maxStat);
  }

  async getLearnableMoves(pokemonId: number, level: number): Promise<GameMove[]> {
    try {
      const levelKey = `${pokemonId}:${level}`;
      let moveNames: string[];

      if (this.learnableMovesCache.has(levelKey)) {
        moveNames = this.learnableMovesCache.get(levelKey)!;
      } else {
        const res = await axios.get(`${API_BASE}/pokemon/${pokemonId}`);
        const d = res.data;
        moveNames = d.moves
          .filter((m: any) =>
            m.version_group_details.some(
              (vg: any) =>
                vg.move_learn_method.name === 'level-up' &&
                vg.level_learned_at === level
            )
          )
          .map((m: any) => m.move.name)
          .slice(0, 5);
        
        this.learnableMovesCache.set(levelKey, moveNames);
      }

      if (moveNames.length === 0) return [];

      const moves: MoveData[] = await Promise.all(
        moveNames.map((name: string) => this.getMove(name))
      );

      return moves
        .filter(m => m.damageClass !== 'status')
        .map(m => {
          const effect: MoveEffect = { type: 'damage' };
          const effectText = m.effectEntries[0]?.toLowerCase() || '';

          if (
            effectText.includes('drain') ||
            effectText.includes('recover') ||
            effectText.includes('restore')
          ) {
            effect.drainPercent = effectText.includes('75%') ? 0.75 : 0.5;
          }
          if (effectText.includes('burn')) {
            effect.statusInflict = 'burn';
            effect.statusChance = m.effectChance;
          } else if (
            effectText.includes('paralyze') ||
            effectText.includes('paralysis')
          ) {
            effect.statusInflict = 'paralysis';
            effect.statusChance = m.effectChance;
          } else if (effectText.includes('poison')) {
            effect.statusInflict = 'poison';
            effect.statusChance = m.effectChance;
          } else if (
            effectText.includes('freeze') ||
            effectText.includes('frozen')
          ) {
            effect.statusInflict = 'freeze';
            effect.statusChance = m.effectChance;
          } else if (effectText.includes('sleep')) {
            effect.statusInflict = 'sleep';
            effect.statusChance = m.effectChance;
          } else if (effectText.includes('confus')) {
            effect.statusInflict = 'confusion';
            effect.statusChance = m.effectChance;
          }

          if (effectText) effect.additionalEffects = effectText;

          const isAOE = [
            'all-opponents',
            'all-other-pokemon',
            'all-pokemon',
            'user-and-allies',
          ].includes(m.target);

          return {
            name: m.name,
            displayName: m.displayName,
            type: m.type,
            power: m.power || 40,
            accuracy: m.accuracy || 100,
            damageClass: m.damageClass,
            effect,
            cooldown: 2.0,
            currentCooldown: 0,
            isAOE,
            aoeRadius: isAOE ? 100 : undefined,
            manualCast: false,
          };
        });
    } catch (e) {
      console.error('Failed to fetch learnable moves:', e);
      return [];
    }
  }
}

export const pokeAPI = new PokeAPIService();