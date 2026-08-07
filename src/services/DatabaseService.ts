// src/services/DatabaseService.ts
// [FREE-TIER] Firestore 쿼터 절감을 위한 데이터 정리 로직 추가
//   - hallOfFame: 맵당 최대 50개 유지, 30일 이상 된 항목 삭제
//   - 정리는 게임 클리어 후 20% 확률로 실행 (쿼터 낭비 방지)
import {
  doc, setDoc, getDoc, collection, query, where, orderBy,
  limit, getDocs, addDoc, updateDoc, deleteDoc, writeBatch,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { HallOfFameEntry, LeaderboardEntry } from '../types/multiplayer';
import { Achievement } from '../types/game';
import { authService } from './AuthService';
import { quotaGuard, QuotaBlockedError } from './QuotaGuard';
import { seasonId } from '../utils/season';
import { CARD_STORAGE_KEY } from './CardService';
import { QUIZ_STORAGE_KEY } from './QuizService';

// [FREE-TIER] 무료 플랜 데이터 보존 한도
const HALL_OF_FAME_MAX_AGE_DAYS = 60;  // 이 일수보다 오래된 자신의 기록은 삭제 후보

// [FREE-TIER] "내 순위" 집계 스캔 상한. getCountFromServer는 인덱스 항목 1000개당 1 read라
//   500이면 사실상 1 read. 이보다 뒤 순위는 "500+"로 표시된다.
const RANK_SCAN_LIMIT = 500;

// [FREE-TIER] 랭킹 목록 기본 조회 개수. 문서 1개 = 1 read라 곧 쿼터다.
//   예전엔 100을 받아 10개씩 보여줬다(= 캐시 미스 1회당 100 read, 6개 탭이면 600).
//   50이면 5페이지 — 사다리로 충분하면서 읽기를 절반으로 줄인다.
export const RANKING_FETCH_LIMIT = 50;

// ─── AP 랭킹 엔트리 타입 ──────────────────────────────────────────────────────
export interface APRankingEntry {
  userId: string;
  userName: string | null;
  totalAP: number;
  achievementCount: number; // 달성 횟수 합산
  updatedAt: number;
}

// ─── 미니 포켓 랭킹 엔트리 타입 ────────────────────────────────────────────────
// 두 문서가 이 타입을 공유하되 서로 다른 필드만 채움:
//   cardRankings/{uid}                 → collectionCount (통산 수집)
//   seasons/{주차}/cardRankings/{uid}  → towerFloor (주간 타워)
export interface CardRankingEntry {
  userId: string;
  userName: string | null;
  towerFloor?: number;      // 트레이너 타워 주간 최고 클리어 층 (시즌 문서 전용)
  collectionCount?: number; // 도감 보유 종 수 (통산 문서 전용)
  updatedAt: number;
}

// ─── 포켓몬 퀴즈 랭킹 엔트리 타입 (수능 모의고사 최고점, 최대 50점) ─────────────
export interface QuizRankingEntry {
  userId: string;
  userName: string | null;
  examBest: number; // 모의고사 최고 정답 수(0~50, 문항 수 10/30/50)
  updatedAt: number;
}

// ─── 퀴즈 주간 랭킹 엔트리 (seasons/{주차}/quizRankings/{uid}) ─────────────────
// 보드(종목)마다 문서를 따로 만들지 않고 **유저당 주 1문서**에 scores 맵으로 모은다.
//   - write: 종목을 여러 개 해도 같은 문서에 merge → 문서 수가 유저 수만큼만 늘어난다
//   - read : orderBy('scores.<보드>')는 Firestore **자동 단일 필드 색인**으로 처리돼
//            복합 색인(firestore.indexes.json) 추가가 필요 없다
export interface QuizWeeklyEntry {
  userId: string;
  userName: string | null;
  /** 보드키(QuizBoardKey) → 이번 주 최고 점수. 플레이한 종목만 존재한다. */
  scores: Record<string, number>;
  updatedAt: number;
}

// ─── 퀴즈 속도전(멀티) 통산 랭킹 엔트리 ────────────────────────────────────────
export interface QuizSpeedRankingEntry {
  userId: string;
  userName: string | null;
  wins: number;      // 1등으로 끝낸 판 수 (정렬 기준)
  games: number;     // 참가한 판 수
  bestScore: number; // 한 판 최고 점수
  updatedAt: number;
}

// ─── 미니 포켓 랜덤 대전 주간 승수 랭킹 엔트리 ─────────────────────────────────
export interface PvpSeasonRankingEntry {
  userId: string;
  userName: string | null;
  wins: number; // 이번 주 랜덤 대전 승수
  updatedAt: number;
}

// ─── 미니 포켓 랜덤 대전용 덱 스냅샷 ────────────────────────────────────────────
// 비동기 PvP: 상대의 저장된 덱 스냅샷을 읽어와 로컬에서 오토배틀. 실시간 통신 없음.
export interface CardDeckDoc {
  userId: string;
  userName: string | null;
  deck: { pokemonId: number; stars: number; row: 'front' | 'back'; slot: number }[];
  /** 대략적 전투력 표시용(별 합계). */
  power: number;
  /** 랜덤 매칭 키(0~1). 발행 시마다 리롤되어 매칭 분포를 섞는다. */
  rand: number;
  updatedAt: number;
}

class DatabaseService {

  // [FREE-TIER] 전역 랭킹/전당 조회 결과 캐시.
  //   메모리 + localStorage 2계층, TTL 10분 — 새로고침/재방문에도 Firestore read 0.
  //   읽기 전용·표시용 데이터라 10분 stale은 게임 로직/멀티 통신과 무관하며,
  //   내 기록 갱신 시 invalidateCache()로 해당 키를 즉시 무효화해 체감 지연을 줄임.
  //   빈 결과([])는 실패/오프라인일 수 있어 60초만 캐시하고 localStorage엔 남기지 않음.
  private _readCache = new Map<string, { data: unknown; ts: number; ttl: number }>();
  private readonly READ_CACHE_TTL = 10 * 60_000;
  private readonly EMPTY_CACHE_TTL = 60_000;
  private readonly LS_CACHE_PREFIX = 'ptd-fscache:';


  private async cachedRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this._readCache.get(key);
    if (hit && Date.now() - hit.ts < hit.ttl) {
      return hit.data as T;
    }
    // localStorage 계층 (세션/새로고침 간 유지)
    let staleFromLs: { data: T; ts: number } | null = null;
    try {
      const raw = localStorage.getItem(this.LS_CACHE_PREFIX + key);
      if (raw) {
        const entry = JSON.parse(raw) as { data: T; ts: number };
        if (Date.now() - entry.ts < this.READ_CACHE_TTL) {
          this._readCache.set(key, { ...entry, ttl: this.READ_CACHE_TTL });
          return entry.data;
        }
        staleFromLs = entry;             // 만료됐지만 차단 시 폴백용으로 들고 있는다
        localStorage.removeItem(this.LS_CACHE_PREFIX + key);
      }
    } catch { /* ignore */ }

    // [FREE-TIER] 쿼터가 소진된 상태면 요청 자체를 보내지 않는다.
    //   만료된 캐시라도 있으면 그걸 보여주는 편이 빈 화면보다 낫다.
    if (quotaGuard.isTripped()) {
      if (hit) return hit.data as T;
      if (staleFromLs) return staleFromLs.data;
      throw new QuotaBlockedError();
    }

    let data: T;
    try {
      data = await loader();
      quotaGuard.reportSuccess();
    } catch (err) {
      quotaGuard.report(err);
      throw err;                          // 실패는 캐시하지 않는다
    }

    // [FIX] "결과 없음"은 오래 캐시하지 않는다.
    //   getMy*Rank는 내 기록 문서가 없으면 null(=미등록)을 준다. 예전엔 null이 배열이 아니라서
    //   일반 값으로 취급돼 10분 + localStorage에 박혔고, 방금 첫 기록을 세운 유저가 리더보드엔
    //   자기 이름이 보이는데 "내 순위"만 계속 미등록으로 남았다. []와 같은 부류로 묶는다.
    const isEmpty = data == null || (Array.isArray(data) && data.length === 0);
    this._readCache.set(key, {
      data, ts: Date.now(),
      ttl: isEmpty ? this.EMPTY_CACHE_TTL : this.READ_CACHE_TTL,
    });
    if (!isEmpty) {
      try {
        localStorage.setItem(this.LS_CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
      } catch { /* quota 초과 등 — 무시 */ }
    }
    return data;
  }

  /**
   * [FREE-TIER] Firestore 쓰기를 시도해도 되는 상태인지.
   * 오프라인 세션이거나 무료 쿼터가 소진된 상태면 요청을 아예 만들지 않는다.
   */
  private canWrite(): boolean {
    return !authService.isOfflineMode() && !quotaGuard.isTripped();
  }

  /**
   * 쓰기 결과를 회로차단기에 보고하는 래퍼.
   * 성공하면 차단을 풀고, resource-exhausted면 차단을 내린다. 에러는 그대로 전파.
   */
  private async runWrite<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      quotaGuard.reportSuccess();
      return r;
    } catch (err) {
      quotaGuard.report(err);
      throw err;
    }
  }

  /**
   * [FREE-TIER] "내 순위" 캐시 키. 예전엔 getMy*Rank 6종이 전부 캐시 미대상이라
   * 랭킹 탭을 전환하거나 미니 포켓 허브를 열 때마다 매번 getDoc 1 + 집계 1 = 2 read가
   * 그대로 나갔다. 내 기록을 쓰면 invalidateCache('myRank:')로 즉시 무효화된다.
   * uid를 키에 포함 — 같은 브라우저에서 계정을 바꿔도 남의 순위가 보이지 않도록.
   */
  private myRankKey(board: string): string | null {
    const uid = authService.getCurrentUser()?.uid;
    return uid ? `myRank:${board}:${uid}` : null;
  }

  /** 내 기록 쓰기 직후 관련 랭킹 캐시 무효화 (키 prefix 매칭). */
  private invalidateCache(...prefixes: string[]): void {
    for (const key of Array.from(this._readCache.keys())) {
      if (prefixes.some(p => key.startsWith(p))) this._readCache.delete(key);
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.LS_CACHE_PREFIX)) continue;
        const bare = k.slice(this.LS_CACHE_PREFIX.length);
        if (prefixes.some(p => bare.startsWith(p))) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  }

  // ─── [FREE-TIER] 중복 쓰기 방지: 마지막으로 서버에 기록한 값 기억 ──────────────
  // 예전엔 이 상태가 인스턴스 필드(메모리)에만 있어 새로고침/새 탭마다 리셋됐고,
  // 값이 그대로여도 같은 문서를 다시 썼다. localStorage로 올려 세션 간에도 유지한다.
  // 키에 uid를 포함해 같은 브라우저에서 계정을 바꿔도 서로 섞이지 않는다.
  private static readonly SYNC_LS_PREFIX = 'ptd-sync:';
  private _syncMem = new Map<string, string>();

  private syncKey(scope: string): string | null {
    const uid = authService.getCurrentUser()?.uid;
    return uid ? `${scope}:${uid}` : null;
  }

  /** 이미 같은 값을 기록했으면 true (쓰기 스킵). */
  private alreadySynced(scope: string, value: string): boolean {
    const key = this.syncKey(scope);
    if (!key) return false;
    const mem = this._syncMem.get(key);
    if (mem !== undefined) return mem === value;
    try {
      const stored = localStorage.getItem(DatabaseService.SYNC_LS_PREFIX + key);
      if (stored !== null) this._syncMem.set(key, stored);
      return stored === value;
    } catch {
      return false;
    }
  }

  /** 쓰기 성공 후 호출. 다음 호출부터 동일 값은 스킵된다. */
  private markSynced(scope: string, value: string): void {
    const key = this.syncKey(scope);
    if (!key) return;
    this._syncMem.set(key, value);
    try { localStorage.setItem(DatabaseService.SYNC_LS_PREFIX + key, value); } catch { /* ignore */ }
  }

  /**
   * [FIX-QUOTA] "내 순위" 계산 공통 헬퍼 — 집계 카운트 쿼리 사용.
   * 기존 getDocs().size는 문서를 최대 500개 실제 다운로드(=최대 500 read)했지만,
   * getCountFromServer는 인덱스 항목 1000개당 1 read로 집계만 받아온다.
   */
  private async countPlusOne(q: ReturnType<typeof query>): Promise<number> {
    const agg = await getCountFromServer(q);
    return agg.data().count + 1;
  }

  async addHallOfFameEntry(
    mapId: string,
    mapName: string,
    wave: number,
    pokemonUsed: string[],
    clearTime: number
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return; // [FREE-TIER] 오프라인/쿼터소진 시 Firestore 쓰기 안 함

    const entry: Omit<HallOfFameEntry, 'id'> = {
      userId: user.uid,
      userName: user.displayName,
      mapId,
      mapName,
      wave,
      pokemonUsed,
      clearTime,
      timestamp: Date.now(),
    };
    await this.runWrite(() => addDoc(collection(db, 'hallOfFame'), entry));
    this.invalidateCache('hof:', 'myHof:');

    // [FREE-TIER] 20% 확률로 오래된 기록 정리 (매번 실행 시 Firestore 쿼터 낭비)
    if (Math.random() < 0.2) {
      this.cleanupOldHallOfFame(mapId).catch(() => {});
    }
  }

  /**
   * [FREE-TIER] 현재 유저의 오래된/초과된 전당 기록을 삭제하여 Firestore 용량/쿼터 절감.
   *
   * ★ Firestore 보안 룰: delete는 resource.data.userId == request.auth.uid 만 허용.
   *   → 반드시 자신의 기록만 쿼리·삭제해야 함. 타 유저 항목 삭제 시도 시 permission-denied.
   *
   * 보존 정책:
   *   - clearTime 기준 상위(빠른) 10개는 날짜에 관계없이 영구 보존
   *   - 11위 이하이면서 60일이 지난 기록만 삭제 대상
   *   - 한 번에 최대 5개만 삭제 (Firestore 쓰기 쿼터 보호)
   *
   * composite index 없이 동작하도록 Firestore에서는 == 필터만 사용,
   * clearTime 정렬은 메모리에서 수행.
   */
  private async cleanupOldHallOfFame(mapId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) return;

    try {
      const cutoffMs = Date.now() - HALL_OF_FAME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      const TOP_K = 10; // 상위 K개는 날짜와 무관하게 영구 보존

      // == 필터만 사용 → composite index 불필요 (orderBy 제거)
      const q = query(
        collection(db, 'hallOfFame'),
        where('userId', '==', user.uid),
        where('mapId', '==', mapId),
        limit(100) // 유저당 맵당 현실적 상한
      );
      const snap = await getDocs(q);

      // clearTime 오름차순 정렬 (빠를수록 상위)
      const sorted = snap.docs
        .slice()
        .sort((a, b) =>
          (a.data() as HallOfFameEntry).clearTime -
          (b.data() as HallOfFameEntry).clearTime
        );

      // 상위 TOP_K 개의 ID를 보호 목록에 등록
      const protectedIds = new Set(sorted.slice(0, TOP_K).map(d => d.id));

      // TOP_K 밖이면서 60일 초과된 기록만 삭제 후보
      const toDelete: string[] = [];
      for (const d of sorted.slice(TOP_K)) {
        const ts = (d.data() as HallOfFameEntry).timestamp;
        if (!protectedIds.has(d.id) && ts < cutoffMs) {
          toDelete.push(d.id);
        }
      }

      // 최대 5개씩만 삭제 (Firestore 쓰기 쿼터 보호)
      const batch = toDelete.slice(0, 5);
      await Promise.all(batch.map(id => deleteDoc(doc(db, 'hallOfFame', id))));

      if (batch.length > 0) {
        console.log(`[DB] cleanupOldHallOfFame: deleted ${batch.length} own entries for map ${mapId}`);
      }
    } catch (err) {
      quotaGuard.report(err);
      // 정리 실패는 무시 (게임 진행에 영향 없음)
      console.warn('[DB] cleanupOldHallOfFame failed:', err);
    }
  }

  /**
   * 내 전당 기록. [FREE-TIER] 예전엔 limit도 캐시도 없어 기록이 쌓인 유저일수록
   * 탭을 열 때마다 그 수만큼 read가 나갔다. 상한 50 + 10분 캐시.
   */
  async getUserHallOfFame(): Promise<HallOfFameEntry[]> {
    const user = authService.getCurrentUser();
    if (!user) return [];

    try {
      return await this.cachedRead(`myHof:${user.uid}`, async () => {
        const q = query(
          collection(db, 'hallOfFame'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(RANKING_FETCH_LIMIT)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HallOfFameEntry));
      });
    } catch {
      return [];
    }
  }

  async getGlobalHallOfFame(
    mapId?: string,
    sortBy: 'clearTime' | 'timestamp' = 'clearTime'
  ): Promise<HallOfFameEntry[]> {
    try {
      return await this.cachedRead(`hof:${mapId ?? 'all'}:${sortBy}`, async () => {
        const q = mapId
          ? query(
              collection(db, 'hallOfFame'),
              where('mapId', '==', mapId),
              orderBy(sortBy, 'asc'),
              limit(20)
            )
          : query(
              collection(db, 'hallOfFame'),
              orderBy(sortBy, 'asc'),
              limit(20)
            );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HallOfFameEntry));
      });
    } catch {
      return [];
    }
  }

  async getGlobalHighestWave(mapId?: string): Promise<LeaderboardEntry[]> {
    try {
      return await this.cachedRead(`highestWave:${mapId ?? 'all'}`, async () => {
        const q = mapId
          ? query(
              collection(db, 'leaderboards'),
              where('mapId', '==', mapId),
              orderBy('highestWave', 'desc'),
              limit(20)
            )
          : query(
              collection(db, 'leaderboards'),
              orderBy('highestWave', 'desc'),
              limit(20)
            );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
      });
    } catch {
      return [];
    }
  }

  async updateLeaderboard(
    mapId: string,
    clearTime: number | undefined,
    highestWave: number
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return; // [FREE-TIER] 오프라인/쿼터소진 시 Firestore 쓰기 안 함

    const docRef = doc(db, 'leaderboards', `${user.uid}_${mapId}`);
    const docSnap = await getDoc(docRef);

    const newEntry: LeaderboardEntry = {
      userId: user.uid,
      userName: user.displayName,
      mapId,
      clearTime,
      highestWave,
      timestamp: Date.now(),
      rating: user.rating,
    };

    if (!docSnap.exists()) {
      await setDoc(docRef, newEntry);
      this.invalidateCache('mapLb:', 'highestWave:', 'myRank:');
      return;
    }

    const existing = docSnap.data() as LeaderboardEntry;

    if (clearTime !== undefined) {
      if (!existing.clearTime || clearTime < existing.clearTime) {
        await setDoc(docRef, newEntry);
        this.invalidateCache('mapLb:', 'highestWave:', 'myRank:');
      }
    } else {
      if (highestWave > (existing.highestWave ?? 0)) {
        await setDoc(docRef, { ...existing, highestWave, timestamp: Date.now() });
        this.invalidateCache('mapLb:', 'highestWave:', 'myRank:');
      }
    }
  }

  async getMapLeaderboard(
    mapId: string,
    sortBy: 'clearTime' | 'highestWave'
  ): Promise<LeaderboardEntry[]> {
    // [FIX] 유일하게 catch가 없어, 인덱스 누락/쿼터 소진 시 예외가 UI까지 튀어 올라갔다.
    try {
      return await this.cachedRead(`mapLb:${mapId}:${sortBy}`, async () => {
        const q = query(
          collection(db, 'leaderboards'),
          where('mapId', '==', mapId),
          orderBy(sortBy, sortBy === 'clearTime' ? 'asc' : 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
      });
    } catch {
      return [];
    }
  }

  async getUserRankForMap(
    mapId: string,
    sortBy: 'clearTime' | 'highestWave'
  ): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey(`map:${mapId}:${sortBy}`);
    if (!cacheKey) return null;

    try {
      return await this.cachedRead(cacheKey, async () => {
        const userDocRef = doc(db, 'leaderboards', `${user.uid}_${mapId}`);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) return null;

        const userData = userDoc.data() as LeaderboardEntry;
        const userValue = sortBy === 'clearTime' ? userData.clearTime : userData.highestWave;
        if (!userValue) return null;

        // [FIX-QUOTA] "나보다 나은 기록" 수를 집계 카운트로만 조회 (문서 다운로드 0, 1 read).
        // clearTime: 낮을수록 좋음 → 내 값보다 작은 것이 나보다 앞 순위
        // highestWave: 높을수록 좋음 → 내 값보다 큰 것이 나보다 앞 순위
        const betterOp = sortBy === 'clearTime' ? '<' : '>' as const;
        const q = query(
          collection(db, 'leaderboards'),
          where('mapId', '==', mapId),
          where(sortBy, betterOp as any, userValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q);
      });
    } catch {
      return null;
    }
  }

  async updateUserRating(userId: string, newRating: number): Promise<void> {
    if (!this.canWrite()) return;
    const docRef = doc(db, 'users', userId);
    await this.runWrite(() => updateDoc(docRef, { rating: newRating }));
    this.invalidateCache('pvpRanking:', 'myRank:');
  }

  // ─── [리뉴얼] 업적 저장 — AP 포함 (WriteBatch로 원자적 처리) ───────────────
  // [FIX-QUOTA] 업적 쓰기 + AP 랭킹 갱신을 단일 WriteBatch로 묶어 Firestore 쓰기 횟수 절반 절감.
  // 업적은 단조 증가(취소 불가)이므로 AP 랭킹도 항상 최신값으로 덮어써도 안전.
  // updateAPRanking의 불필요한 read(getDoc)도 제거 — AP가 낮아지는 경우는 없기 때문.
  async updateUserAchievement(achievement: Achievement, totalAP?: number, achievementCount?: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return; // [FREE-TIER] 오프라인/쿼터소진 시 Firestore 쓰기 안 함

    const batch = writeBatch(db);

    // 1) 업적 문서 병합 쓰기
    const achRef = doc(db, 'achievements', `${user.uid}_${achievement.id}`);
    batch.set(achRef, { userId: user.uid, ...achievement }, { merge: true });

    // 2) AP 랭킹 덮어쓰기 (totalAP가 전달된 경우만)
    //    업적은 단조 증가이므로 기존값 확인 없이 항상 overwrite해도 안전
    if (totalAP !== undefined) {
      const apRef = doc(db, 'apRankings', user.uid);
      const apEntry: APRankingEntry = {
        userId: user.uid,
        userName: user.displayName,
        totalAP,
        achievementCount: achievementCount ?? 1,
        updatedAt: Date.now(),
      };
      batch.set(apRef, apEntry);
    }

    await this.runWrite(() => batch.commit());
    if (totalAP !== undefined) {
      this.markSynced('ap', `${totalAP}:${achievementCount ?? 1}`);
      this.invalidateCache('apRanking:', 'myRank:', 'myAch:');
    }
  }

  /**
   * [FREE-TIER] 변경분만 받아 한 번의 WriteBatch로 반영.
   * @param changed 호출부(SaveService)가 DB 값과 비교해 걸러낸 '실제로 달라진' 업적만.
   *                빈 배열이고 AP도 그대로면 쓰기 0회로 끝난다.
   */
  async updateUserAchievementsBulk(changed: Achievement[], totalAP: number, achievementCount: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const apValue = `${totalAP}:${achievementCount}`;
    const apNeedsWrite = !this.alreadySynced('ap', apValue);
    if (changed.length === 0 && !apNeedsWrite) return; // 완전 no-op

    const batch = writeBatch(db);

    for (const ach of changed) {
      const achRef = doc(db, 'achievements', `${user.uid}_${ach.id}`);
      batch.set(achRef, { userId: user.uid, ...ach }, { merge: true });
    }

    // 업적이 하나라도 바뀌면 AP도 재기록(집계값 정합성). 아니면 AP 변화가 있을 때만.
    if (changed.length > 0 || apNeedsWrite) {
      const apRef = doc(db, 'apRankings', user.uid);
      const apEntry: APRankingEntry = {
        userId: user.uid,
        userName: user.displayName,
        totalAP,
        achievementCount,
        updatedAt: Date.now(),
      };
      batch.set(apRef, apEntry);
    }

    await this.runWrite(() => batch.commit());
    this.markSynced('ap', apValue);
    this.invalidateCache('apRanking:', 'myRank:', 'myAch:');
  }

  /**
   * 내 업적 문서 전체. 문서 수 = read 수라 앱 로드/업적 모달마다 수십 read가 나갔다.
   * [FREE-TIER] 10분 캐시 — 업적을 쓰면 invalidateCache('myAch:')로 즉시 무효화된다.
   * (같은 앱 세션 안에서 앱 시작 동기화 + 업적 모달이 캐시를 공유하게 되는 효과)
   */
  async getUserAchievements(): Promise<Achievement[]> {
    const user = authService.getCurrentUser();
    if (!user) return [];
    try {
      return await this.cachedRead(`myAch:${user.uid}`, async () => {
        // limit은 보안 규칙의 list 상한(500)을 통과하기 위해서도 필요하다.
        // 정의된 업적은 73개라 200이면 충분한 여유.
        const q = query(
          collection(db, 'achievements'),
          where('userId', '==', user.uid),
          limit(200)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as Achievement);
      });
    } catch {
      return [];
    }
  }

  // ─── AP 랭킹 ─────────────────────────────────────────────────────────────

  /**
   * 내 AP 랭킹 문서 갱신.
   * [FIX-QUOTA] updateUserAchievement의 WriteBatch에서 일괄 처리되므로,
   * 이 메서드는 외부(SaveService 등)에서 독립적으로 호출될 때만 사용.
   * 업적은 단조 증가이므로 기존값 read 없이 항상 overwrite.
   */
  async updateAPRanking(totalAP: number, achievementCount: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const apValue = `${totalAP}:${achievementCount}`;
    if (this.alreadySynced('ap', apValue)) return; // 동일 값 재기록 방지

    const entry: APRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      totalAP,
      achievementCount,
      updatedAt: Date.now(),
    };
    await this.runWrite(() => setDoc(doc(db, 'apRankings', user.uid), entry));
    this.markSynced('ap', apValue);
    this.invalidateCache('apRanking:', 'myRank:', 'myAch:');
  }

  /**
   * 전체 AP 랭킹 Top 100 조회
   */
  async getAPRanking(limitCount = RANKING_FETCH_LIMIT): Promise<APRankingEntry[]> {
    try {
      return await this.cachedRead(`apRanking:${limitCount}`, async () => {
        const q = query(
          collection(db, 'apRankings'),
          orderBy('totalAP', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as APRankingEntry);
      });
    } catch {
      return [];
    }
  }

  /**
   * 내 AP 랭킹 순위 조회
   */
  async getMyAPRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey('ap');
    if (!cacheKey) return null;

    // try/catch를 cachedRead '바깥'에 둔다 — loader가 throw하면 아무것도 캐시되지 않아
    // 일시적 네트워크 실패가 10분간 '순위 없음'으로 굳지 않는다.
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'apRankings', user.uid));
        if (!myDoc.exists()) return null;

        const myAP = (myDoc.data() as APRankingEntry).totalAP;
        // 나보다 AP 높은 사람 수 + 1 = 내 순위 — [FIX-QUOTA] 집계 카운트(1 read)
        const q = query(
          collection(db, 'apRankings'),
          where('totalAP', '>', myAP),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q);
      });
    } catch {
      return null;
    }
  }

  // ─── PVP 랭킹 ────────────────────────────────────────────────────────────
  async getPVPRanking(limitCount = RANKING_FETCH_LIMIT): Promise<any[]> {
    try {
      return await this.cachedRead(`pvpRanking:${limitCount}`, async () => {
        const q = query(
          collection(db, 'users'),
          orderBy('rating', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          userId: doc.id,
          userName: doc.data().displayName,
          rating: doc.data().rating ?? 1000,
        }));
      });
    } catch (err) {
      console.error('getPVPRanking failed:', err);
      return [];
    }
  }

  async getMyPVPRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey('pvp');
    if (!cacheKey) return null;

    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'users', user.uid));
        if (!myDoc.exists()) return null;

        const myRating = myDoc.data().rating ?? 1000;
        const q = query(
          collection(db, 'users'),
          where('rating', '>', myRating),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
      });
    } catch (err) {
      console.error('getMyPVPRank failed:', err);
      return null;
    }
  }

  // ─── 미니 포켓 랭킹 (타워 최고층 / 수집 종 수) ─────────────────────────────
  /**
   * 내 수집 랭킹 문서 갱신. 수집 수는 단조 증가라 기존값 read 없이 overwrite.
   * (towerFloor는 주간 시즌 문서로 이관되어 이 문서에서 제거 — 죽은 필드 정리)
   * [FREE-TIER] 오프라인/비로그인은 쓰지 않음. 세션 내 동일 값이면 재기록 스킵.
   */
  async updateCardRanking(collectionCount: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const value = `${collectionCount}`;
    if (this.alreadySynced('cardRank', value)) return; // 동일 값 재기록 방지(새로고침 후에도 유지)

    const entry: CardRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      collectionCount,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'cardRankings', user.uid), entry);
      this.markSynced('cardRank', value);
      this.invalidateCache('collectionRanking:', 'myRank:');
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateCardRanking failed:', err);
    }
  }

  /**
   * 이번 주 시즌 타워 최고층 기록.
   * seasons/{seasonId}/cardRankings/{uid} 서브컬렉션 → 주차가 바뀌면 새 경로 = 자동 리셋.
   * 호출부(CardService.recordWeeklyBestFloor)가 '이번 주 개선 시에만' floor를 넘겨줌.
   */
  async updateTowerSeasonRanking(towerFloor: number): Promise<void> {
    // [FIX] 같은 값의 기록 쓰기가 이미 날아가고 있으면 그 약속을 공유한다.
    //   TrainerTower는 fire-and-forget으로 쏘고, 허브(CardLabView)는 내 순위를 읽기 전에
    //   await 한다. 중복 제거가 없으면 그 창에서 setDoc이 두 번 나가고(무료 쿼터 낭비),
    //   더 나쁘게는 허브가 write 완료 전에 읽어 "미등록"을 캐시한다.
    const key = `towerSeason:${seasonId()}:${towerFloor}`;
    const running = this._inflightWrites.get(key);
    if (running) return running;
    const p = this.doUpdateTowerSeasonRanking(towerFloor)
      .finally(() => { this._inflightWrites.delete(key); });
    this._inflightWrites.set(key, p);
    return p;
  }

  private _inflightWrites = new Map<string, Promise<void>>();

  private async doUpdateTowerSeasonRanking(towerFloor: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const season = seasonId();
    const value = `${season}:${towerFloor}`;
    if (this.alreadySynced('towerSeason', value)) return;

    const entry: CardRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      towerFloor, // 시즌 문서는 타워 전용(수집은 통산 cardRankings 사용)
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'seasons', season, 'cardRankings', user.uid), entry);
      this.markSynced('towerSeason', value);
      this.invalidateCache('towerRanking:', 'myRank:');
      this.cleanupMyOldSeasonEntries();
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateTowerSeasonRanking failed:', err);
    }
  }

  /** 이번 주 시즌 타워 최고층 랭킹 Top N. */
  async getTowerRanking(limitCount = RANKING_FETCH_LIMIT): Promise<CardRankingEntry[]> {
    const season = seasonId();
    try {
      return await this.cachedRead(`towerRanking:${season}:${limitCount}`, async () => {
        const q = query(
          collection(db, 'seasons', season, 'cardRankings'),
          orderBy('towerFloor', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as CardRankingEntry);
      });
    } catch {
      return [];
    }
  }

  /** 전체 수집 종 수 랭킹 Top N. */
  async getCollectionRanking(limitCount = RANKING_FETCH_LIMIT): Promise<CardRankingEntry[]> {
    try {
      return await this.cachedRead(`collectionRanking:${limitCount}`, async () => {
        const q = query(
          collection(db, 'cardRankings'),
          orderBy('collectionCount', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as CardRankingEntry);
      });
    } catch {
      return [];
    }
  }

  /** 내 이번 주 시즌 타워 최고층 순위 (나보다 높은 층 수 + 1). */
  async getMyTowerRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const season = seasonId();
    const cacheKey = this.myRankKey(`tower:${season}`);
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'seasons', season, 'cardRankings', user.uid));
        if (!myDoc.exists()) return null;

        const myValue = (myDoc.data() as CardRankingEntry).towerFloor ?? 0;
        const q = query(
          collection(db, 'seasons', season, 'cardRankings'),
          where('towerFloor', '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
      });
    } catch {
      return null;
    }
  }

  /** 내 통산 수집 종 수 순위 (나보다 많은 종 수 + 1). */
  async getMyCollectionRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey('collection');
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'cardRankings', user.uid));
        if (!myDoc.exists()) return null;

        const myValue = (myDoc.data() as CardRankingEntry).collectionCount ?? 0;
        const q = query(
          collection(db, 'cardRankings'),
          where('collectionCount', '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
      });
    } catch {
      return null;
    }
  }

  // ─── 포켓몬 퀴즈 랭킹 (수능 모의고사 최고점) ───────────────────────────────
  /** 내 모의고사 최고점 기록. 최고점은 단조 증가라 overwrite. 오프라인/비로그인 무시. */
  async updateQuizRanking(examBest: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;
    const value = `${examBest}`;
    if (this.alreadySynced('quizRank', value)) return;

    const entry: QuizRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      examBest,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'quizRankings', user.uid), entry);
      this.markSynced('quizRank', value);
      this.invalidateCache('quizRanking:', 'myRank:');
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateQuizRanking failed:', err);
    }
  }

  /** 전체 모의고사 최고점 랭킹 Top N. */
  async getQuizRanking(limitCount = RANKING_FETCH_LIMIT): Promise<QuizRankingEntry[]> {
    try {
      return await this.cachedRead(`quizRanking:${limitCount}`, async () => {
        const q = query(
          collection(db, 'quizRankings'),
          orderBy('examBest', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as QuizRankingEntry);
      });
    } catch {
      return [];
    }
  }

  // ─── 퀴즈 주간 랭킹 (종목별, seasons/{주차}/quizRankings/{uid}) ─────────────
  /**
   * 이번 주 보드 최고 기록 갱신. 호출부(QuizService.recordWeekly)가 **경신했을 때만** 부른다.
   * merge:true — 다른 종목의 점수를 지우지 않고 해당 키만 덮어쓴다.
   */
  async updateQuizWeekly(boardKey: string, score: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const season = seasonId();
    const value = `${season}:${boardKey}:${score}`;
    if (this.alreadySynced('quizWeekly', value)) return;

    try {
      await setDoc(
        doc(db, 'seasons', season, 'quizRankings', user.uid),
        {
          userId: user.uid,
          userName: user.displayName,
          scores: { [boardKey]: score },
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      this.markSynced('quizWeekly', value);
      this.invalidateCache(`quizWeekly:${season}:${boardKey}`, 'myRank:');
      this.cleanupMyOldSeasonEntries();
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateQuizWeekly failed:', err);
    }
  }

  /** 이번 주 특정 보드 Top N. [FREE-TIER] 보드가 17개라 fetch 상한을 30으로 낮춘다. */
  async getQuizWeeklyRanking(boardKey: string, limitCount = 30): Promise<QuizWeeklyEntry[]> {
    const season = seasonId();
    try {
      return await this.cachedRead(`quizWeekly:${season}:${boardKey}:${limitCount}`, async () => {
        const q = query(
          collection(db, 'seasons', season, 'quizRankings'),
          orderBy(`scores.${boardKey}`, 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data() as QuizWeeklyEntry);
      });
    } catch {
      return [];
    }
  }

  /** 이번 주 특정 보드에서 내 순위. 점수가 없으면 null(미참가). */
  async getMyQuizWeeklyRank(boardKey: string): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const season = seasonId();
    const cacheKey = this.myRankKey(`quizWeekly:${season}:${boardKey}`);
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'seasons', season, 'quizRankings', user.uid));
        if (!myDoc.exists()) return null;
        const myValue = (myDoc.data() as QuizWeeklyEntry).scores?.[boardKey];
        if (typeof myValue !== 'number') return null;
        const q = query(
          collection(db, 'seasons', season, 'quizRankings'),
          where(`scores.${boardKey}`, '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // 집계 카운트(1 read)
      });
    } catch {
      return null;
    }
  }

  // ─── 퀴즈 속도전(멀티) 통산 랭킹 ───────────────────────────────────────────
  /** 속도전 통산 전적 업로드. 판이 끝날 때 1 write(승수는 단조 증가라 overwrite). */
  async updateQuizSpeedRanking(stats: { wins: number; games: number; bestScore: number }): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;
    const value = `${stats.wins}:${stats.games}:${stats.bestScore}`;
    if (this.alreadySynced('quizSpeed', value)) return;

    const entry: QuizSpeedRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      wins: stats.wins,
      games: stats.games,
      bestScore: stats.bestScore,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'quizSpeedRankings', user.uid), entry);
      this.markSynced('quizSpeed', value);
      this.invalidateCache('quizSpeedRanking:', 'myRank:');
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateQuizSpeedRanking failed:', err);
    }
  }

  /** 속도전 통산 승수 랭킹 Top N. */
  async getQuizSpeedRanking(limitCount = RANKING_FETCH_LIMIT): Promise<QuizSpeedRankingEntry[]> {
    try {
      return await this.cachedRead(`quizSpeedRanking:${limitCount}`, async () => {
        const q = query(
          collection(db, 'quizSpeedRankings'),
          orderBy('wins', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data() as QuizSpeedRankingEntry);
      });
    } catch {
      return [];
    }
  }

  /** 내 속도전 통산 순위 (나보다 승수 많은 사람 수 + 1). */
  async getMyQuizSpeedRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey('quizSpeed');
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'quizSpeedRankings', user.uid));
        if (!myDoc.exists()) return null;
        const myValue = (myDoc.data() as QuizSpeedRankingEntry).wins;
        const q = query(
          collection(db, 'quizSpeedRankings'),
          where('wins', '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q);
      });
    } catch {
      return null;
    }
  }

  // ─── 미니 포켓 주간 시즌 공통: 구세즌 내 문서 lazy cleanup ────────────────
  // 주차가 바뀌면 새 경로에 쓰므로 지난 주 문서는 영영 남는다(누적). 각 유저가
  // 시즌 쓰기 시점에 자신의 최근 4주 치 옛 문서를 지워 자연 수렴시킨다.
  // (보안 룰: 본인 문서 delete만 허용. 존재하지 않는 문서 delete는 무해한 no-op)
  private _oldSeasonCleanupDone = false;

  private static readonly OLD_SEASON_CLEANUP_LS_KEY = 'ptd-oldseason-cleanup-week';
  private cleanupMyOldSeasonEntries(): void {
    if (this._oldSeasonCleanupDone) return;
    this._oldSeasonCleanupDone = true;
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    // [FREE-TIER] 삭제 대상(2~5주 전)은 한 번 지우면 끝 — 주가 바뀌기 전엔 재삭제 불필요.
    // 세션마다 8 delete(write)를 낭비하지 않도록 '이번 주 이미 정리함'을 localStorage로 게이트.
    const thisWeek = seasonId();
    try {
      if (localStorage.getItem(DatabaseService.OLD_SEASON_CLEANUP_LS_KEY) === thisWeek) return;
    } catch { /* localStorage 불가 시 그냥 진행 */ }

    // 직전 주(i=1)는 보존 — 시즌 순위 셀프 보상(claimSeasonReward)의 근거 문서.
    // 2주 이상 지난 것만 삭제.
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    for (let i = 2; i <= 5; i++) {
      const oldSeason = seasonId(new Date(Date.now() - WEEK_MS * i));
      deleteDoc(doc(db, 'seasons', oldSeason, 'cardRankings', user.uid)).catch(() => {});
      deleteDoc(doc(db, 'seasons', oldSeason, 'pvpRankings', user.uid)).catch(() => {});
      deleteDoc(doc(db, 'seasons', oldSeason, 'quizRankings', user.uid)).catch(() => {});
    }
    try { localStorage.setItem(DatabaseService.OLD_SEASON_CLEANUP_LS_KEY, thisWeek); } catch { /* ignore */ }
  }

  /**
   * 지난 시즌(weekId)의 내 순위 조회 — 시즌 보상 셀프 수령용.
   * 문서 없으면 null(미랭크 = 참가상 처리). 네트워크/집계 실패는 throw로 전파해
   * 호출부가 '수령 확정'을 미루고 재시도하도록 함(실패를 참가상으로 오확정 방지). 최대 2 read.
   */
  async getMyPastSeasonRank(weekId: string, board: 'tower' | 'pvp'): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return null;
    // [FREE-TIER] 쿼터 소진은 '미랭크'가 아니라 '아직 확인 못 함'이다.
    //   여기서 null을 돌려주면 호출부가 참가상으로 수령을 확정해 버려 실제 순위 보상을
    //   영영 못 받는다. throw해서 다음 마운트에 재시도하게 만든다.
    if (quotaGuard.isTripped()) throw new QuotaBlockedError();

    const coll = board === 'tower' ? 'cardRankings' : 'pvpRankings';
    const field = board === 'tower' ? 'towerFloor' : 'wins';
    try {
      const myDoc = await getDoc(doc(db, 'seasons', weekId, coll, user.uid));
      quotaGuard.reportSuccess();
      if (!myDoc.exists()) return null;
      const myValue = (myDoc.data() as any)[field] ?? 0;
      const q = query(
        collection(db, 'seasons', weekId, coll),
        where(field, '>', myValue),
        limit(RANK_SCAN_LIMIT)
      );
      return await this.countPlusOne(q);
    } catch (err) {
      quotaGuard.report(err);
      throw err; // 호출부(CardLabView)가 수령을 미루고 다음에 재시도한다
    }
  }

  // ─── 미니 포켓 랜덤 대전 주간 승수 랭킹 ────────────────────────────────────

  /** 이번 주 랜덤 대전 승수 기록. 단조 증가라 read 없이 overwrite. */
  async updateCardPvpSeasonRanking(wins: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;

    const season = seasonId();
    const value = `${season}:${wins}`;
    if (this.alreadySynced('pvpSeason', value)) return;

    const entry: PvpSeasonRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      wins,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'seasons', season, 'pvpRankings', user.uid), entry);
      this.markSynced('pvpSeason', value);
      this.invalidateCache('cardPvpRanking:', 'myRank:');
      this.cleanupMyOldSeasonEntries();
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] updateCardPvpSeasonRanking failed:', err);
    }
  }

  /** 이번 주 랜덤 대전 승수 랭킹 Top N. */
  async getCardPvpRanking(limitCount = RANKING_FETCH_LIMIT): Promise<PvpSeasonRankingEntry[]> {
    const season = seasonId();
    try {
      return await this.cachedRead(`cardPvpRanking:${season}:${limitCount}`, async () => {
        const q = query(
          collection(db, 'seasons', season, 'pvpRankings'),
          orderBy('wins', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as PvpSeasonRankingEntry);
      });
    } catch {
      return [];
    }
  }

  /** 내 이번 주 랜덤 대전 승수 순위 (나보다 승수 많은 사람 수 + 1). */
  async getMyCardPvpRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const season = seasonId();
    const cacheKey = this.myRankKey(`cardPvp:${season}`);
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'seasons', season, 'pvpRankings', user.uid));
        if (!myDoc.exists()) return null;

        const myValue = (myDoc.data() as PvpSeasonRankingEntry).wins;
        const q = query(
          collection(db, 'seasons', season, 'pvpRankings'),
          where('wins', '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
      });
    } catch {
      return null;
    }
  }

  // ─── 클라우드 세이브 백업 (미니 포켓 + 퀴즈 localStorage 스냅샷) ──────────
  // 수집/기록이 localStorage 단독이라 브라우저 초기화·기기 변경 시 전부 소실되는
  // 문제의 안전망. 문서 1개(backups/{uid})에 JSON 문자열로 저장 — 쿼터 영향 미미.
  // 저장 키는 각 서비스가 단일 출처로 export — 한쪽만 버전이 바뀌어 백업이 엇나가는 것 방지.
  private static readonly CARDS_LS_KEY = CARD_STORAGE_KEY;
  private static readonly QUIZ_LS_KEY = QUIZ_STORAGE_KEY;
  private static readonly LAST_BACKUP_LS_KEY = 'ptd-last-backup-at';
  private static readonly AUTO_BACKUP_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30분

  /** 현재 로컬 세이브를 Firestore에 백업. 성공 시 true. */
  async backupSaves(): Promise<boolean> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return false;

    const cards = localStorage.getItem(DatabaseService.CARDS_LS_KEY) ?? '';
    const quiz = localStorage.getItem(DatabaseService.QUIZ_LS_KEY) ?? '';
    if (!cards && !quiz) return false;

    // 표시용 메타(복원 확인 다이얼로그에서 로컬과 비교)
    let ownedCount = 0, towerProgress = 0, examBest = 0;
    try {
      const c = cards ? JSON.parse(cards) : null;
      ownedCount = c?.collection ? Object.keys(c.collection).length : 0;
      towerProgress = c?.towerProgress ?? 0;
    } catch { /* ignore */ }
    try {
      const q = quiz ? JSON.parse(quiz) : null;
      examBest = q?.examBest ?? 0;
    } catch { /* ignore */ }

    try {
      await setDoc(doc(db, 'backups', user.uid), {
        userId: user.uid,
        cards, quiz,
        ownedCount, towerProgress, examBest,
        updatedAt: Date.now(),
      });
      try { localStorage.setItem(DatabaseService.LAST_BACKUP_LS_KEY, String(Date.now())); } catch { /* ignore */ }
      return true;
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] backupSaves failed:', err);
      return false;
    }
  }

  /** 진행 마일스톤에서 호출되는 자동 백업 — 30분 스로틀(쓰기 절감). */
  autoBackupSaves(): void {
    try {
      const last = Number(localStorage.getItem(DatabaseService.LAST_BACKUP_LS_KEY) ?? 0);
      if (Date.now() - last < DatabaseService.AUTO_BACKUP_MIN_INTERVAL_MS) return;
    } catch { /* ignore */ }
    this.backupSaves().catch(() => {});
  }

  /** 마지막 백업 시각(로컬 기록, ms). 없으면 null. */
  getLastBackupAt(): number | null {
    try {
      const v = Number(localStorage.getItem(DatabaseService.LAST_BACKUP_LS_KEY) ?? 0);
      return v > 0 ? v : null;
    } catch { return null; }
  }

  /** 클라우드 백업 조회(복원 확인용 메타 포함). */
  async fetchBackup(): Promise<{
    cards: string; quiz: string;
    ownedCount: number; towerProgress: number; examBest: number; updatedAt: number;
  } | null> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return null;
    try {
      const snap = await getDoc(doc(db, 'backups', user.uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        cards: d.cards ?? '', quiz: d.quiz ?? '',
        ownedCount: d.ownedCount ?? 0, towerProgress: d.towerProgress ?? 0,
        examBest: d.examBest ?? 0, updatedAt: d.updatedAt ?? 0,
      };
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] fetchBackup failed:', err);
      return null;
    }
  }

  /** 백업 데이터를 로컬에 적용. 호출자가 이후 location.reload()로 서비스 재로드. */
  applyBackupToLocal(backup: { cards: string; quiz: string }): void {
    if (backup.cards) localStorage.setItem(DatabaseService.CARDS_LS_KEY, backup.cards);
    if (backup.quiz) localStorage.setItem(DatabaseService.QUIZ_LS_KEY, backup.quiz);
  }

  // ─── 미니 포켓 랜덤 대전 (비동기 PvP 덱 스냅샷) ────────────────────────────

  /**
   * 내 덱 스냅샷 발행 — 랜덤 대전 매칭 풀에 등록.
   * [FREE-TIER] 세션 내 동일 덱 재발행 스킵(쓰기 1회). 오프라인/비로그인 무시.
   */
  async publishCardDeck(
    deck: { pokemonId: number; stars: number; row: 'front' | 'back'; slot: number }[]
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return;
    if (deck.length === 0) return;

    const value = JSON.stringify(deck);
    if (this.alreadySynced('deck', value)) return;

    const docData: CardDeckDoc = {
      userId: user.uid,
      userName: user.displayName,
      deck,
      power: deck.reduce((s, d) => s + d.stars, 0),
      rand: Math.random(),
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'cardDecks', user.uid), docData);
      this.markSynced('deck', value);
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] publishCardDeck failed:', err);
    }
  }

  /**
   * 랜덤 상대 덱 1개 조회 — 후보 중 전투력(power=별 합) 근접 우선.
   * [FREE-TIER] rand 필드 기준 무작위 지점부터 limit(5) — 호출당 최대 10 read.
   *   (전체 스캔·composite index 없이 무작위 표본을 뽑는 Firestore 관용 패턴,
   *    근접 매칭은 표본 안에서 클라이언트가 고른다)
   * @param myPower 내 덱 별 합(근접 매칭 기준). 0이면 무작위.
   * @param excludeIds 최근 대전 상대 uid — 반복 매칭 방지(후보가 이들뿐이면 허용).
   */
  async getRandomOpponentDeck(myPower = 0, excludeIds: string[] = []): Promise<CardDeckDoc | null> {
    const user = authService.getCurrentUser();
    if (!user || !this.canWrite()) return null;
    try {
      const r = Math.random();
      const fetchSide = async (op: '>=' | '<', dir: 'asc' | 'desc') => {
        const q = query(
          collection(db, 'cardDecks'),
          where('rand', op, r),
          orderBy('rand', dir),
          limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map(d => d.data() as CardDeckDoc)
          .filter(d => d.userId !== user.uid && Array.isArray(d.deck) && d.deck.length > 0);
      };

      let candidates = await fetchSide('>=', 'asc');
      if (candidates.length === 0) candidates = await fetchSide('<', 'desc');
      if (candidates.length === 0) return null;

      // 최근 상대 제외 — 단 전부 최근 상대뿐이면 그대로 사용(풀이 작은 초기 배려)
      const excluded = new Set(excludeIds);
      const fresh = candidates.filter(d => !excluded.has(d.userId));
      const pool = fresh.length > 0 ? fresh : candidates;

      // 전투력 근접 순 정렬 후 최상위 선택
      pool.sort((a, b) =>
        Math.abs((a.power ?? 0) - myPower) - Math.abs((b.power ?? 0) - myPower)
      );
      return pool[0];
    } catch (err) {
      quotaGuard.report(err);
      console.warn('[DB] getRandomOpponentDeck failed:', err);
      return null;
    }
  }

  /** 내 모의고사 순위 (나보다 높은 점수 수 + 1). */
  async getMyQuizRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const cacheKey = this.myRankKey('quiz');
    if (!cacheKey) return null;
    try {
      return await this.cachedRead(cacheKey, async () => {
        const myDoc = await getDoc(doc(db, 'quizRankings', user.uid));
        if (!myDoc.exists()) return null;
        const myValue = (myDoc.data() as QuizRankingEntry).examBest;
        const q = query(
          collection(db, 'quizRankings'),
          where('examBest', '>', myValue),
          limit(RANK_SCAN_LIMIT)
        );
        return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
      });
    } catch {
      return null;
    }
  }
}




export const databaseService = new DatabaseService();