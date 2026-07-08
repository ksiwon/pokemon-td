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
import { seasonId } from '../utils/season';

// [FREE-TIER] 무료 플랜 데이터 보존 한도
const HALL_OF_FAME_MAX_AGE_DAYS = 60;  // 이 일수보다 오래된 자신의 기록은 삭제 후보

// ─── AP 랭킹 엔트리 타입 ──────────────────────────────────────────────────────
export interface APRankingEntry {
  userId: string;
  userName: string | null;
  totalAP: number;
  achievementCount: number; // 달성 횟수 합산
  updatedAt: number;
}

// ─── 미니 포켓 랭킹 엔트리 타입 (타워 최고층 / 수집 종 수) ─────────────────────
export interface CardRankingEntry {
  userId: string;
  userName: string | null;
  towerFloor: number;      // 트레이너 타워 최고 클리어 층
  collectionCount: number; // 도감 보유 종 수
  updatedAt: number;
}

// ─── 포켓몬 퀴즈 랭킹 엔트리 타입 (수능 모의고사 최고점, 최대 50점) ─────────────
export interface QuizRankingEntry {
  userId: string;
  userName: string | null;
  examBest: number; // 모의고사 최고 정답 수(0~50, 문항 수 10/30/50)
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

  // [FREE-TIER] 카드 랭킹 쓰기 중복 방지 — 세션 내 동일 값(층:수집수) 재기록 스킵.
  private _lastCardRankSync = '';
  private _lastSeasonSync = '';
  private _lastQuizSync = -1;

  private async cachedRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this._readCache.get(key);
    if (hit && Date.now() - hit.ts < hit.ttl) {
      return hit.data as T;
    }
    // localStorage 계층 (세션/새로고침 간 유지)
    try {
      const raw = localStorage.getItem(this.LS_CACHE_PREFIX + key);
      if (raw) {
        const entry = JSON.parse(raw) as { data: T; ts: number };
        if (Date.now() - entry.ts < this.READ_CACHE_TTL) {
          this._readCache.set(key, { ...entry, ttl: this.READ_CACHE_TTL });
          return entry.data;
        }
        localStorage.removeItem(this.LS_CACHE_PREFIX + key);
      }
    } catch { /* ignore */ }

    const data = await loader();
    const isEmpty = Array.isArray(data) && data.length === 0;
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
    if (!user || authService.isOfflineMode()) return; // [FREE-TIER] 오프라인은 Firestore 쓰기 안 함

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
    await addDoc(collection(db, 'hallOfFame'), entry);
    this.invalidateCache('hof:');

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
      // 정리 실패는 무시 (게임 진행에 영향 없음)
      console.warn('[DB] cleanupOldHallOfFame failed:', err);
    }
  }

  async getUserHallOfFame(): Promise<HallOfFameEntry[]> {
    const user = authService.getCurrentUser();
    if (!user) return [];

    const q = query(
      collection(db, 'hallOfFame'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as HallOfFameEntry));
  }

  async getGlobalHallOfFame(
    mapId?: string,
    sortBy: 'clearTime' | 'timestamp' = 'clearTime'
  ): Promise<HallOfFameEntry[]> {
    return this.cachedRead(`hof:${mapId ?? 'all'}:${sortBy}`, async () => {
      try {
        let q;
        if (mapId) {
          q = query(
            collection(db, 'hallOfFame'),
            where('mapId', '==', mapId),
            orderBy(sortBy, 'asc'),
            limit(20)
          );
        } else {
          q = query(
            collection(db, 'hallOfFame'),
            orderBy(sortBy, 'asc'),
            limit(20)
          );
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HallOfFameEntry));
      } catch {
        return [];
      }
    });
  }

  async getGlobalHighestWave(mapId?: string): Promise<LeaderboardEntry[]> {
    return this.cachedRead(`highestWave:${mapId ?? 'all'}`, async () => {
      try {
        let q;
        if (mapId) {
          q = query(
            collection(db, 'leaderboards'),
            where('mapId', '==', mapId),
            orderBy('highestWave', 'desc'),
            limit(20)
          );
        } else {
          q = query(
            collection(db, 'leaderboards'),
            orderBy('highestWave', 'desc'),
            limit(20)
          );
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
      } catch {
        return [];
      }
    });
  }

  async updateLeaderboard(
    mapId: string,
    clearTime: number | undefined,
    highestWave: number
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return; // [FREE-TIER] 오프라인은 Firestore 쓰기 안 함

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
      this.invalidateCache('mapLb:', 'highestWave:');
      return;
    }

    const existing = docSnap.data() as LeaderboardEntry;

    if (clearTime !== undefined) {
      if (!existing.clearTime || clearTime < existing.clearTime) {
        await setDoc(docRef, newEntry);
        this.invalidateCache('mapLb:', 'highestWave:');
      }
    } else {
      if (highestWave > (existing.highestWave ?? 0)) {
        await setDoc(docRef, { ...existing, highestWave, timestamp: Date.now() });
        this.invalidateCache('mapLb:', 'highestWave:');
      }
    }
  }

  async getMapLeaderboard(
    mapId: string,
    sortBy: 'clearTime' | 'highestWave'
  ): Promise<LeaderboardEntry[]> {
    return this.cachedRead(`mapLb:${mapId}:${sortBy}`, async () => {
      const q = query(
        collection(db, 'leaderboards'),
        where('mapId', '==', mapId),
        orderBy(sortBy, sortBy === 'clearTime' ? 'asc' : 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
    });
  }

  async getUserRankForMap(
    mapId: string,
    sortBy: 'clearTime' | 'highestWave'
  ): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;

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
      limit(500)
    );
    return this.countPlusOne(q);
  }

  async updateUserRating(userId: string, newRating: number): Promise<void> {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, { rating: newRating });
    this.invalidateCache('pvpRanking:');
  }

  // ─── [리뉴얼] 업적 저장 — AP 포함 (WriteBatch로 원자적 처리) ───────────────
  // [FIX-QUOTA] 업적 쓰기 + AP 랭킹 갱신을 단일 WriteBatch로 묶어 Firestore 쓰기 횟수 절반 절감.
  // 업적은 단조 증가(취소 불가)이므로 AP 랭킹도 항상 최신값으로 덮어써도 안전.
  // updateAPRanking의 불필요한 read(getDoc)도 제거 — AP가 낮아지는 경우는 없기 때문.
  async updateUserAchievement(achievement: Achievement, totalAP?: number, achievementCount?: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return; // [FREE-TIER] 오프라인은 Firestore 쓰기 안 함

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

    await batch.commit();
    if (totalAP !== undefined) this.invalidateCache('apRanking:');
  }

  async updateUserAchievementsBulk(achievements: Achievement[], totalAP: number, achievementCount: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return;

    const batch = writeBatch(db);

    for (const ach of achievements) {
      if (ach.unlocked || (ach.progress ?? 0) > 0) {
        const achRef = doc(db, 'achievements', `${user.uid}_${ach.id}`);
        batch.set(achRef, { userId: user.uid, ...ach }, { merge: true });
      }
    }

    const apRef = doc(db, 'apRankings', user.uid);
    const apEntry: APRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      totalAP,
      achievementCount,
      updatedAt: Date.now(),
    };
    batch.set(apRef, apEntry);

    await batch.commit();
    this.invalidateCache('apRanking:');
  }

  async getUserAchievements(): Promise<Achievement[]> {
    const user = authService.getCurrentUser();
    if (!user) return [];
    const q = query(
      collection(db, 'achievements'),
      where('userId', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Achievement);
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
    if (!user) return;

    const entry: APRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      totalAP,
      achievementCount,
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, 'apRankings', user.uid), entry);
    this.invalidateCache('apRanking:');
  }

  /**
   * 전체 AP 랭킹 Top 100 조회
   */
  async getAPRanking(limitCount = 100): Promise<APRankingEntry[]> {
    return this.cachedRead(`apRanking:${limitCount}`, async () => {
      try {
        const q = query(
          collection(db, 'apRankings'),
          orderBy('totalAP', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as APRankingEntry);
      } catch {
        return [];
      }
    });
  }

  /**
   * 내 AP 랭킹 순위 조회
   */
  async getMyAPRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;

    try {
      const myDoc = await getDoc(doc(db, 'apRankings', user.uid));
      if (!myDoc.exists()) return null;

      const myAP = (myDoc.data() as APRankingEntry).totalAP;
      // 나보다 AP 높은 사람 수 + 1 = 내 순위 — [FIX-QUOTA] 집계 카운트(1 read)
      const RANK_SCAN_LIMIT = 500;
      const q = query(
        collection(db, 'apRankings'),
        where('totalAP', '>', myAP),
        limit(RANK_SCAN_LIMIT)
      );
      return this.countPlusOne(q);
    } catch {
      return null;
    }
  }

  // ─── PVP 랭킹 ────────────────────────────────────────────────────────────
  async getPVPRanking(limitCount = 100): Promise<any[]> {
    return this.cachedRead(`pvpRanking:${limitCount}`, async () => {
      try {
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
      } catch (err) {
        console.error('getPVPRanking failed:', err);
        return [];
      }
    });
  }

  async getMyPVPRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;

    try {
      const myDoc = await getDoc(doc(db, 'users', user.uid));
      if (!myDoc.exists()) return null;

      const myRating = myDoc.data().rating ?? 1000;
      const RANK_SCAN_LIMIT = 500;
      const q = query(
        collection(db, 'users'),
        where('rating', '>', myRating),
        limit(RANK_SCAN_LIMIT)
      );
      return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
    } catch (err) {
      console.error('getMyPVPRank failed:', err);
      return null;
    }
  }

  // ─── 미니 포켓 랭킹 (타워 최고층 / 수집 종 수) ─────────────────────────────
  /**
   * 내 카드 랭킹 문서 갱신. 타워층·수집수는 단조 증가라 기존값 read 없이 overwrite.
   * [FREE-TIER] 오프라인/비로그인은 쓰지 않음. 세션 내 동일 값이면 재기록 스킵.
   */
  async updateCardRanking(towerFloor: number, collectionCount: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return;

    const key = `${towerFloor}:${collectionCount}`;
    if (key === this._lastCardRankSync) return; // 동일 값 재기록 방지

    const entry: CardRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      towerFloor,
      collectionCount,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'cardRankings', user.uid), entry);
      this._lastCardRankSync = key;
      this.invalidateCache('collectionRanking:');
    } catch (err) {
      console.warn('[DB] updateCardRanking failed:', err);
    }
  }

  /**
   * 이번 주 시즌 타워 최고층 기록.
   * seasons/{seasonId}/cardRankings/{uid} 서브컬렉션 → 주차가 바뀌면 새 경로 = 자동 리셋.
   * 호출부(CardService.recordWeeklyBestFloor)가 '이번 주 개선 시에만' floor를 넘겨줌.
   */
  async updateTowerSeasonRanking(towerFloor: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return;

    const season = seasonId();
    const key = `${season}:${towerFloor}`;
    if (key === this._lastSeasonSync) return;

    const entry: CardRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      towerFloor,
      collectionCount: 0, // 시즌 문서는 타워 전용(수집은 통산 cardRankings 사용)
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'seasons', season, 'cardRankings', user.uid), entry);
      this._lastSeasonSync = key;
      this.invalidateCache('towerRanking:');
    } catch (err) {
      console.warn('[DB] updateTowerSeasonRanking failed:', err);
    }
  }

  /** 이번 주 시즌 타워 최고층 랭킹 Top N. */
  async getTowerRanking(limitCount = 100): Promise<CardRankingEntry[]> {
    const season = seasonId();
    return this.cachedRead(`towerRanking:${season}:${limitCount}`, async () => {
      try {
        const q = query(
          collection(db, 'seasons', season, 'cardRankings'),
          orderBy('towerFloor', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as CardRankingEntry);
      } catch {
        return [];
      }
    });
  }

  /** 전체 수집 종 수 랭킹 Top N. */
  async getCollectionRanking(limitCount = 100): Promise<CardRankingEntry[]> {
    return this.cachedRead(`collectionRanking:${limitCount}`, async () => {
      try {
        const q = query(
          collection(db, 'cardRankings'),
          orderBy('collectionCount', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as CardRankingEntry);
      } catch {
        return [];
      }
    });
  }

  /** 내 이번 주 시즌 타워 최고층 순위 (나보다 높은 층 수 + 1). */
  async getMyTowerRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    const season = seasonId();
    try {
      const myDoc = await getDoc(doc(db, 'seasons', season, 'cardRankings', user.uid));
      if (!myDoc.exists()) return null;

      const myValue = (myDoc.data() as CardRankingEntry).towerFloor;
      const RANK_SCAN_LIMIT = 500;
      const q = query(
        collection(db, 'seasons', season, 'cardRankings'),
        where('towerFloor', '>', myValue),
        limit(RANK_SCAN_LIMIT)
      );
      return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
    } catch {
      return null;
    }
  }

  /** 내 통산 수집 종 수 순위 (나보다 많은 종 수 + 1). */
  async getMyCollectionRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    try {
      const myDoc = await getDoc(doc(db, 'cardRankings', user.uid));
      if (!myDoc.exists()) return null;

      const myValue = (myDoc.data() as CardRankingEntry).collectionCount;
      const RANK_SCAN_LIMIT = 500;
      const q = query(
        collection(db, 'cardRankings'),
        where('collectionCount', '>', myValue),
        limit(RANK_SCAN_LIMIT)
      );
      return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
    } catch {
      return null;
    }
  }

  // ─── 포켓몬 퀴즈 랭킹 (수능 모의고사 최고점) ───────────────────────────────
  /** 내 모의고사 최고점 기록. 최고점은 단조 증가라 overwrite. 오프라인/비로그인 무시. */
  async updateQuizRanking(examBest: number): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return;
    if (examBest === this._lastQuizSync) return;

    const entry: QuizRankingEntry = {
      userId: user.uid,
      userName: user.displayName,
      examBest,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'quizRankings', user.uid), entry);
      this._lastQuizSync = examBest;
      this.invalidateCache('quizRanking:');
    } catch (err) {
      console.warn('[DB] updateQuizRanking failed:', err);
    }
  }

  /** 전체 모의고사 최고점 랭킹 Top N. */
  async getQuizRanking(limitCount = 100): Promise<QuizRankingEntry[]> {
    return this.cachedRead(`quizRanking:${limitCount}`, async () => {
      try {
        const q = query(
          collection(db, 'quizRankings'),
          orderBy('examBest', 'desc'),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as QuizRankingEntry);
      } catch {
        return [];
      }
    });
  }

  // ─── 미니 포켓 랜덤 대전 (비동기 PvP 덱 스냅샷) ────────────────────────────
  private _lastDeckPublish = '';

  /**
   * 내 덱 스냅샷 발행 — 랜덤 대전 매칭 풀에 등록.
   * [FREE-TIER] 세션 내 동일 덱 재발행 스킵(쓰기 1회). 오프라인/비로그인 무시.
   */
  async publishCardDeck(
    deck: { pokemonId: number; stars: number; row: 'front' | 'back'; slot: number }[]
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return;
    if (deck.length === 0) return;

    const key = JSON.stringify(deck);
    if (key === this._lastDeckPublish) return;

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
      this._lastDeckPublish = key;
    } catch (err) {
      console.warn('[DB] publishCardDeck failed:', err);
    }
  }

  /**
   * 랜덤 상대 덱 1개 조회.
   * [FREE-TIER] rand 필드 기준 무작위 지점부터 limit(3) — 호출당 최대 6 read.
   *   (전체 스캔 없이 무작위 표본을 뽑는 Firestore 관용 패턴)
   */
  async getRandomOpponentDeck(): Promise<CardDeckDoc | null> {
    const user = authService.getCurrentUser();
    if (!user || authService.isOfflineMode()) return null;
    try {
      const r = Math.random();
      const pick = async (op: '>=' | '<', dir: 'asc' | 'desc') => {
        const q = query(
          collection(db, 'cardDecks'),
          where('rand', op, r),
          orderBy('rand', dir),
          limit(3)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map(d => d.data() as CardDeckDoc)
          .find(d => d.userId !== user.uid && Array.isArray(d.deck) && d.deck.length > 0) ?? null;
      };
      // 무작위 지점 이후 → 없으면 반대 방향(순환)
      return (await pick('>=', 'asc')) ?? (await pick('<', 'desc'));
    } catch (err) {
      console.warn('[DB] getRandomOpponentDeck failed:', err);
      return null;
    }
  }

  /** 내 모의고사 순위 (나보다 높은 점수 수 + 1). */
  async getMyQuizRank(): Promise<number | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;
    try {
      const myDoc = await getDoc(doc(db, 'quizRankings', user.uid));
      if (!myDoc.exists()) return null;
      const myValue = (myDoc.data() as QuizRankingEntry).examBest;
      const RANK_SCAN_LIMIT = 500;
      const q = query(
        collection(db, 'quizRankings'),
        where('examBest', '>', myValue),
        limit(RANK_SCAN_LIMIT)
      );
      return this.countPlusOne(q); // [FIX-QUOTA] 집계 카운트(1 read)
    } catch {
      return null;
    }
  }
}




export const databaseService = new DatabaseService();