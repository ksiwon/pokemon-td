// src/services/SaveService.ts
import { SaveData, GameStats, Achievement } from '../types/game';
import { databaseService } from './DatabaseService';
import { ACHIEVEMENTS } from '../data/achievements';

const SAVE_KEY = 'pokemon-td-save';

class SaveService {
  private static instance: SaveService;

  // ─── [PERF] 세이브 캐시 + 지연 flush ────────────────────────────────────────
  // 예전엔 load()가 매번 localStorage 전체를 JSON.parse + 정규화했고, save()가 그
  // load()를 한 번 더 부른 뒤 JSON.stringify까지 했다. updateAchievement 1회 =
  // 전체 세이브 2회 파싱 + 1회 직렬화. 그런데 AchievementService.onKill은 적 1마리
  // 처치마다 임계값 5개를 돌며 updateAchievement를 부르고, onWaveComplete는 웨이브당
  // 7회를 부른다 → 웨이브 한 판에 수백 회의 전체 세이브 직렬화 = 눈에 띄는 스터터.
  // 파싱은 1회로 줄이고(메모리 캐시), 쓰기는 400ms로 묶는다. 탭 전환/종료 시 즉시 flush.
  private _cache: SaveData | null = null;
  private _dirty = false;
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_DEBOUNCE_MS = 400;

  private constructor() {
    if (typeof window === 'undefined') return;
    // 유실 방지 — 탭을 닫거나 백그라운드로 보낼 때 반드시 내려쓴다.
    window.addEventListener('beforeunload', () => this.flush());
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    // 다른 탭이 세이브를 바꿨을 때: 내 변경이 없으면 캐시를 버리고 다시 읽는다.
    //   (내 변경이 있으면 기존 동작대로 마지막 쓰기가 이긴다)
    window.addEventListener('storage', (e) => {
      if (e.key === SAVE_KEY && !this._dirty) this._cache = null;
    });
  }

  static getInstance() {
    if (!SaveService.instance) {
      SaveService.instance = new SaveService();
    }
    return SaveService.instance;
  }

  /** 대기 중인 변경을 즉시 localStorage에 기록. */
  flush(): void {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    if (!this._dirty || !this._cache) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this._cache));
      this._dirty = false; // 성공한 뒤에만 내린다 — 용량 초과로 실패하면 다음 기회에 재시도
    } catch (error) {
      console.error('Failed to save game:', error);
    }
  }

  private scheduleFlush(): void {
    this._dirty = true;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, this.FLUSH_DEBOUNCE_MS);
  }

  save(data: Partial<SaveData>) {
    const existing = this.load();
    // 캐시 객체를 그대로 갱신 — load()가 반환한 참조를 호출부가 수정한 경우(updateStats,
    // updateAchievement 등)도 동일 객체라 병합이 안전하다.
    this._cache = { ...existing, ...data };
    this.scheduleFlush();
  }

  load(): SaveData {
    if (this._cache) return this._cache;
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.totalAP === undefined) parsed.totalAP = 0;

        let changed = false;
        if (parsed.achievements && Array.isArray(parsed.achievements)) {
          let recalculatedAP = 0;
          parsed.achievements.forEach((a: any) => {
            const tierPoints: Record<string, number> = { bronze: 3, silver: 10, gold: 25, diamond: 50, legendary: 100 };
            const ptsPer = a.tier ? tierPoints[a.tier] ?? 3 : 3;
            const unlocked = a.unlocked || (a.completions ?? 0) > 0 || a.progress >= a.target;
            const targetCompletions = unlocked ? 1 : 0;
            const targetTotalPoints = unlocked ? ptsPer : 0;

            if (a.completions !== targetCompletions || a.totalPoints !== targetTotalPoints || a.unlocked !== unlocked) {
              a.unlocked = unlocked;
              a.completions = targetCompletions;
              a.totalPoints = targetTotalPoints;
              a.pointsPerCompletion = ptsPer;
              changed = true;
            }
            recalculatedAP += a.totalPoints;
          });

          if (parsed.totalAP !== recalculatedAP) {
            parsed.totalAP = recalculatedAP;
            changed = true;
          }
        }

        this._cache = parsed;
        if (changed) this.scheduleFlush(); // 정규화 결과는 다음 flush에 함께 내려간다
        return parsed;
      }
    } catch (error) {
      console.error('Failed to load game:', error);
    }
    // 세이브가 없거나 깨진 경우 — 기본값도 캐시해야 이후 save()가 같은 객체 위에 병합된다.
    this._cache = this.getDefaultSave();
    return this._cache;
  }

  getDefaultSave(): SaveData {
    return {
      stats: {
        totalPlayTime: 0,
        enemiesKilled: 0,
        pokemonUsed: 0,
        highestWave: 0,
        totalMoneyEarned: 0,
        evolutionsAchieved: 0,
        bossesDefeated: 0,
        mapClears: {},
      },
      achievements: [],
      unlockedMaps: ['beginner'],
      settings: {
        musicVolume: 0.2,
        gameSpeed: 1,
        showDamageNumbers: true,
        showGrid: true,
        autoSave: true,
        language: 'ko',
      },
      highScores: [],
      totalAP: 0,
    };
  }

  updateStats(updates: Partial<GameStats>) {
    const data = this.load();
    data.stats = { ...data.stats, ...updates };
    this.save(data);
  }


  // ─── [리뉴얼] 업적 업데이트 — 중복 달성 불가능하도록 completions 1로 고정 및 AP 정규화 ─────────────────
  updateAchievement(achievementId: string, progress: number) {
    const data = this.load();
    let achievement: Achievement | undefined = data.achievements.find(
      a => a.id === achievementId
    );

    if (!achievement) {
      const base = ACHIEVEMENTS.find(a => a.id === achievementId);
      if (base) {
        achievement = {
          ...base,
          progress: 0,
          unlocked: false,
          completions: 0,
          totalPoints: 0,
        };
        data.achievements.push(achievement);
      } else {
        console.warn(`Attempted to update undefined achievement: ${achievementId}`);
        return;
      }
    }

    const pointsPerCompletion = achievement.tier ? { bronze:3, silver:10, gold:25, diamond:50, legendary:100 }[achievement.tier] ?? 3 : 3;
    achievement.pointsPerCompletion = pointsPerCompletion;

    const prevProgress = achievement.progress;
    let justUnlocked = false;

    // 이미 달성된 업적이면 더 이상 처리하지 않음 (반복 달성 버그 방지)
    if (!achievement.unlocked) {
      achievement.progress = Math.max(prevProgress, progress);

      // 달성 조건: target 도달
      if (achievement.progress >= achievement.target) {
        achievement.unlocked = true;
        justUnlocked = true;

        achievement.completions = 1;
        achievement.totalPoints = pointsPerCompletion;

        // [A5] Vite ESM 환경에서 require는 동작 불보장 → dynamic import로 전환
        import('../store/gameStore')
          .then(m => m.useGameStore.getState()
            .showAchievementToast(achievement!.id, achievement!.name, pointsPerCompletion, true))
          .catch(() => {});

        // [카드모드] 업적 최초 달성 시 티어별 별조각 지급
        import('./CardService')
          .then(({ cardService }) => {
            const shardByTier: Record<string, number> = { bronze: 2, silver: 5, gold: 12, diamond: 25, legendary: 50 };
            cardService.grantRewards({ starShards: shardByTier[achievement!.tier] ?? 2 });
          })
          .catch(() => {});
      }
    } else {
      // 이미 달성되었음에도 혹시 카운트가 잘못되어 있다면 정규화
      achievement.completions = 1;
      achievement.totalPoints = pointsPerCompletion;
    }

    // 총 AP 누적 오류 방지를 위해 전체 합산 방식으로 재계산
    data.totalAP = data.achievements.reduce((sum, a) => sum + (a.totalPoints ?? 0), 0);
    this.save(data);

    // [FREE-TIER] 업적이 최초로 달성되었을 때만 Firestore에 저장 (쿼터 보호)
    if (justUnlocked) {
      import('./AuthService')
        .then(({ authService }) => {
          // [FREE-TIER] 오프라인 모드는 Firestore 쓰기를 건너뜀
          if (authService.getCurrentUser() && !authService.isOfflineMode()) {
            const unlockedCount = data.achievements.filter(a => a.unlocked).length;
            databaseService
              .updateUserAchievement(achievement!, data.totalAP, unlockedCount)
              .catch((err: any) => {
                if (err?.code !== 'permission-denied') {
                  console.warn('[SaveService] Failed to persist achievement to DB:', err);
                }
              });
          }
        })
        .catch(() => {});
    }
  }

  // ─── 총 AP 조회 ──────────────────────────────────────────────────────────
  getTotalAP(): number {
    return this.load().totalAP ?? 0;
  }

  unlockMap(mapId: string) {
    const data = this.load();
    if (!data.unlockedMaps.includes(mapId)) {
      data.unlockedMaps.push(mapId);
      this.save(data);
    }
  }

  // ─── Firebase → localStorage 병합 (중복 달성 데이터 강제 정규화 실행) ────────
  async syncAchievementsFromDB(): Promise<void> {
    try {
      const dbAchievements = await databaseService.getUserAchievements();
      const data = this.load();

      // [FIX] DB도 비어있고 로컬도 진척도가 전혀 없다면 굳이 Firestore 쓰기를 하지 않고 리턴 (쿼터 절약)
      const localHasProgress = (data.totalAP ?? 0) > 0 || data.achievements.some(a => (a.progress ?? 0) > 0);
      if ((!dbAchievements || dbAchievements.length === 0) && !localHasProgress) {
        return;
      }

      if (dbAchievements && dbAchievements.length > 0) {
        for (const dbAch of dbAchievements) {
          const localIdx = data.achievements.findIndex(a => a.id === dbAch.id);
          const pointsPerCompletion = dbAch.tier ? { bronze:3, silver:10, gold:25, diamond:50, legendary:100 }[dbAch.tier] ?? 3 : 3;
          const isUnlocked = dbAch.unlocked || (dbAch.completions ?? 0) > 0 || dbAch.progress >= dbAch.target;

          const normalizedAch: Achievement = {
            ...dbAch,
            unlocked: isUnlocked,
            completions: isUnlocked ? 1 : 0,
            totalPoints: isUnlocked ? pointsPerCompletion : 0,
            pointsPerCompletion
          };

          if (localIdx === -1) {
            data.achievements.push(normalizedAch);
          } else {
            const local = data.achievements[localIdx];
            const localPointsPer = local.tier ? { bronze:3, silver:10, gold:25, diamond:50, legendary:100 }[local.tier] ?? 3 : 3;
            const localUnlocked = local.unlocked || (local.completions ?? 0) > 0 || local.progress >= local.target;

            data.achievements[localIdx] = {
              ...local,
              unlocked: localUnlocked || isUnlocked,
              completions: (localUnlocked || isUnlocked) ? 1 : 0,
              totalPoints: (localUnlocked || isUnlocked) ? localPointsPer : 0,
              pointsPerCompletion: localPointsPer,
              progress: Math.max(local.progress, dbAch.progress),
            };
          }
        }
      }

      // 모든 로컬 데이터의 Completions와 AP 정규화 강제 적용
      for (let i = 0; i < data.achievements.length; i++) {
        const a = data.achievements[i];
        const ptsPer = a.tier ? { bronze:3, silver:10, gold:25, diamond:50, legendary:100 }[a.tier] ?? 3 : 3;
        const unlocked = a.unlocked || (a.completions ?? 0) > 0 || a.progress >= a.target;
        data.achievements[i] = {
          ...a,
          unlocked,
          completions: unlocked ? 1 : 0,
          totalPoints: unlocked ? ptsPer : 0,
          pointsPerCompletion: ptsPer
        };
      }

      data.totalAP = data.achievements.reduce((sum, a) => sum + (a.totalPoints ?? 0), 0);
      this.save(data);

      // [FREE-TIER] DB에 실제로 '달라진' 업적만 골라 쓴다.
      //   예전엔 진척도 있는 업적 전부를 무조건 재기록해, 새로고침 1회당
      //   (업적 수 + 1)회의 Firestore 쓰기가 발생했다(80개 보유 시 81 write).
      //   대부분의 세션은 로컬=DB라 변경분이 0 → 쓰기도 0이 된다.
      const dbById = new Map((dbAchievements ?? []).map(a => [a.id, a]));
      const changed = data.achievements.filter(a => {
        if (!a.unlocked && (a.progress ?? 0) <= 0) return false; // 진척 없는 건 애초에 안 씀
        const remote = dbById.get(a.id);
        if (!remote) return true;                                // DB에 없음 → 신규 기록
        return (
          !!remote.unlocked !== !!a.unlocked ||
          (remote.progress ?? 0) !== (a.progress ?? 0) ||
          (remote.completions ?? 0) !== (a.completions ?? 0) ||
          (remote.totalPoints ?? 0) !== (a.totalPoints ?? 0)
        );
      });

      import('./AuthService')
        .then(async ({ authService }) => {
          const user = authService.getCurrentUser();
          if (user && !authService.isOfflineMode()) {
            const unlockedCount = data.achievements.filter(a => a.unlocked).length;
            await databaseService.updateUserAchievementsBulk(changed, data.totalAP, unlockedCount);
          }
        })
        .catch(() => {});

    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('[SaveService] Failed to sync achievements from DB:', err);
      }
    }
  }

  clearSave() {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this._cache = null;
    this._dirty = false; // 대기 중이던 flush가 삭제 직후 되살아나지 않도록
    localStorage.removeItem(SAVE_KEY);
    console.log('Save data cleared');
  }
}

export const saveService = SaveService.getInstance();