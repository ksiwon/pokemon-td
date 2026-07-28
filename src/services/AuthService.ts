// src/services/AuthService.ts
import {
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithPopup,
  signInAnonymously,  // 추가
  updateProfile       // 추가
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { quotaGuard } from './QuotaGuard';
import { User } from '../types/multiplayer';

class AuthService {
  private currentUser: User | null = null;
  private listeners: ((user: User | null) => void)[] = [];

  // [FREE-TIER] 오프라인(로컬 전용) 세션 상태
  //   Firebase 무료 사용량 초과 등으로 로그인이 불가능할 때 진입.
  //   Firebase를 전혀 사용하지 않는 로컬 유저로 싱글/스토리 모드만 이용.
  private _isOffline = false;
  private readonly OFFLINE_KEY = 'pokemon-td-offline-user';

  // [FIX-QUOTA] lastLogin Firestore 쓰기 24시간 쿨다운
  // 매 auth 상태 변경마다 setDoc을 실행하는 낭비를 방지.
  // [FREE-TIER] 예전엔 메모리 Map이라 새로고침/새 탭마다 리셋 → 쿨다운이 사실상
  //   무력화되고 페이지 로드마다 1 write가 나갔다. localStorage로 올려 실제로 24h 유지.
  private _lastLoginWritten = new Map<string, number>();
  private readonly LAST_LOGIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
  private readonly LAST_LOGIN_LS_PREFIX = 'ptd-lastlogin:';

  private shouldWriteLastLogin(uid: string): boolean {
    let last = this._lastLoginWritten.get(uid);
    if (last === undefined) {
      try {
        const raw = localStorage.getItem(this.LAST_LOGIN_LS_PREFIX + uid);
        if (raw) {
          last = Number(raw);
          if (Number.isFinite(last)) this._lastLoginWritten.set(uid, last);
          else last = undefined;
        }
      } catch { /* localStorage 불가 시 그냥 기록 */ }
    }
    if (last === undefined) return true;
    return Date.now() - last > this.LAST_LOGIN_COOLDOWN_MS;
  }

  private markLastLoginWritten(uid: string): void {
    const now = Date.now();
    this._lastLoginWritten.set(uid, now);
    try { localStorage.setItem(this.LAST_LOGIN_LS_PREFIX + uid, String(now)); } catch { /* ignore */ }
  }

  // [FREE-TIER] Firestore read 최대 대기 시간.
  //   쿼터 초과(resource-exhausted)는 보통 빠르게 throw되지만,
  //   백엔드 지연/네트워크 차단으로 hang하면 로그인이 영영 끝나지 않으므로 상한을 둔다.
  private readonly FIRESTORE_READ_TIMEOUT_MS = 5000;

  /** Promise에 타임아웃을 건다. 초과 시 reject. */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`[timeout] ${label} > ${ms}ms`)), ms)
      ),
    ]);
  }

  /** Firestore 없이도 항상 만들 수 있는 임시 유저(로그인 비차단용). */
  private buildFallbackUser(firebaseUser: FirebaseUser): User {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || 'Anonymous',
      photoURL: firebaseUser.photoURL || '',
      rating: 1000,
      createdAt: Date.now(),
    };
  }

  constructor() {
    // [FREE-TIER] 오프라인 세션을 동기적으로 먼저 복원.
    //   Firebase 응답(onAuthStateChanged) 전에도 currentUser가 채워져
    //   ProtectedRoute가 즉시 통과되고 싱글/스토리 모드를 이용할 수 있음.
    this.restoreOfflineSession();

    // [OFFLINE-FIX] Firebase 초기화가 실패(auth undefined 등)해도 이 싱글톤 생성이 throw하지 않게 방어.
    //   throw하면 모듈 로드 단계라 앱 전체가 화이트스크린. 위에서 오프라인 세션은 이미 복원됐으므로
    //   Firebase 구독이 불가능해도 오프라인 플레이는 정상.
    try {
      onAuthStateChanged(auth, async (firebaseUser) => {
        console.log('AuthService(onAuthStateChanged):', firebaseUser?.displayName || 'null');

        if (firebaseUser) {
          // 실제 Firebase 로그인 성공 → 오프라인 세션보다 우선
          if (this._isOffline) this.clearOfflineSession();
          const user = await this.getUserData(firebaseUser);
          this.currentUser = user;
          this.notifyListeners(user);
        } else {
          // Firebase 유저 없음: 오프라인 세션이 있으면 유지(로그아웃 처리하지 않음)
          if (this._isOffline && this.currentUser) {
            this.notifyListeners(this.currentUser);
          } else {
            this.currentUser = null;
            this.notifyListeners(null);
          }
        }
      });
    } catch (e) {
      console.error('[AuthService] Firebase auth 구독 실패 — 오프라인 세션만 사용합니다.', e);
    }
  }

  // ─── [FREE-TIER] 오프라인 모드 ────────────────────────────────────────────

  /** 현재 오프라인(로컬 전용) 세션 여부 */
  isOfflineMode(): boolean {
    return this._isOffline;
  }

  /**
   * 오프라인(로컬 전용) 모드 진입.
   * Firebase 무료 사용량 초과/장애로 로그인이 불가능할 때 호출.
   * Firebase를 전혀 호출하지 않는 로컬 유저를 생성하여 싱글/스토리 모드를 이용하게 한다.
   * 멀티플레이/랭킹/전당 등 서버 기능은 비활성화된다.
   */
  enterOfflineMode(nickname?: string): void {
    const name = nickname?.trim() || this.currentUser?.displayName || '플레이어';
    // 기존 오프라인 uid가 있으면 재사용(로컬 진행 데이터 일관성), 없으면 새로 생성
    const uid =
      this._isOffline && this.currentUser?.uid
        ? this.currentUser.uid
        : `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const offlineUser: User = {
      uid,
      email: '',
      displayName: name,
      photoURL: '',
      rating: 0,
      createdAt: Date.now(),
    };
    this._isOffline = true;
    this.currentUser = offlineUser;
    try {
      localStorage.setItem(this.OFFLINE_KEY, JSON.stringify(offlineUser));
    } catch { /* ignore */ }
    this.notifyListeners(offlineUser);
  }

  /** localStorage에 저장된 오프라인 세션을 복원(앱 시작 시 1회). */
  private restoreOfflineSession(): void {
    try {
      const raw = localStorage.getItem(this.OFFLINE_KEY);
      if (!raw) return;
      const user = JSON.parse(raw) as User;
      if (user && user.uid) {
        this._isOffline = true;
        this.currentUser = user;
      }
    } catch { /* ignore */ }
  }

  /** 오프라인 세션 정리(실제 로그인 성공 또는 로그아웃 시). */
  private clearOfflineSession(): void {
    this._isOffline = false;
    try { localStorage.removeItem(this.OFFLINE_KEY); } catch { /* ignore */ }
  }

  private async getUserData(firebaseUser: FirebaseUser): Promise<User> {
    try {
      // [FREE-TIER] read에 타임아웃을 걸어 Firestore가 throw하든 hang하든
      //   로그인이 막히지 않게 한다(쿼터 초과 시 resource-exhausted 또는 지연).
      const userDoc = await this.withTimeout(
        getDoc(doc(db, 'users', firebaseUser.uid)),
        this.FIRESTORE_READ_TIMEOUT_MS,
        'getDoc(users)'
      );

      if (!userDoc.exists()) {
        // [수정 1] 신규 유저: Firebase Auth의 displayName 우선 사용 (게스트 닉네임 보존)
        const newUser: User = this.buildFallbackUser(firebaseUser);
        // [FREE-TIER] 쓰기는 fire-and-forget — 실패/지연해도 로그인은 즉시 진행
        // [SEC-PII] users 문서는 보안 룰상 모든 로그인 유저가 읽을 수 있으므로
        //   이메일을 절대 저장하지 않음 (랭킹 표시에는 displayName/rating만 필요)
        setDoc(doc(db, 'users', firebaseUser.uid), {
          ...newUser,
          email: '',
          lastLogin: serverTimestamp()
        })
          .then(() => this.markLastLoginWritten(firebaseUser.uid))
          .catch(err => console.warn('[Auth] new-user setDoc skipped:', err?.code || err?.message || err));
        return newUser;
      }

      // [수정 2] 기존 유저: Firestore 데이터 기반으로 반환하되,
      // displayName이 비어있거나 'Anonymous'이면 Firebase Auth 값으로 보완
      const userData = userDoc.data() as User;

      // [SEC-PII] 과거 버전이 저장해 둔 이메일을 발견하면 지움 (레거시 문서 1회 정리)
      if (userData.email) {
        setDoc(doc(db, 'users', firebaseUser.uid), { email: '' }, { merge: true })
          .catch(() => {});
      }
      const resolvedDisplayName =
        (userData.displayName && userData.displayName !== 'Anonymous')
          ? userData.displayName
          : (firebaseUser.displayName || userData.displayName || 'Anonymous');

      if (resolvedDisplayName !== userData.displayName) {
        // displayName 불일치: 최신화 + lastLogin 갱신 (fire-and-forget)
        setDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: resolvedDisplayName,
          lastLogin: serverTimestamp()
        }, { merge: true })
          .then(() => this.markLastLoginWritten(firebaseUser.uid))
          .catch(err => console.warn('[Auth] displayName setDoc skipped:', err?.code || err?.message || err));
        return { ...userData, displayName: resolvedDisplayName };
      }

      // [FIX-QUOTA] lastLogin 쓰기: 24시간 이상 지났을 때만 실행 (fire-and-forget)
      if (this.shouldWriteLastLogin(firebaseUser.uid)) {
        setDoc(doc(db, 'users', firebaseUser.uid), {
          lastLogin: serverTimestamp()
        }, { merge: true })
          .then(() => this.markLastLoginWritten(firebaseUser.uid))
          .catch(err => console.warn('[Auth] lastLogin setDoc skipped:', err?.code || err?.message || err));
      }
      return userData;
    } catch (error: any) {
      // [FREE-TIER] resource-exhausted(쿼터 초과) / 타임아웃 / 네트워크 차단 모두 여기로.
      //   임시 유저를 반환해 로그인 차단을 방지한다. 싱글/스토리는 정상 이용 가능.
      //   쿼터성 에러면 회로차단기를 내려, 이후 랭킹/전당/업적 화면이 실패 요청을
      //   반복 발사하지 않도록 한다(로그인이 가장 먼저 쿼터 소진을 감지하는 지점).
      quotaGuard.report(error);
      console.error('Firestore Error in getUserData (Quota Exceeded/timeout?):', error?.code || error?.message || error);
      return this.buildFallbackUser(firebaseUser);
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      console.log('AuthService: Popup 로그인 시작');
      const result = await signInWithPopup(auth, googleProvider);
      console.log('AuthService: Popup 로그인 성공:', result.user.displayName);
    } catch (error: any) {
      console.error('AuthService: Popup 로그인 실패:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    // [FREE-TIER] 오프라인 모드: Firebase 호출 없이 로컬 세션만 정리.
    //   onAuthStateChanged가 발생하지 않으므로 수동으로 리스너에 알림.
    if (this._isOffline) {
      this.clearOfflineSession();
      localStorage.removeItem('currentRoomId');
      this.currentUser = null;
      this.notifyListeners(null);
      return;
    }

    // [A3] 로그아웃 전 방 정리 — dynamic import로 순환참조 회피
    const roomId = localStorage.getItem('currentRoomId');
    if (roomId) {
      try {
        const { multiplayerService } = await import('./MultiplayerService');
        await multiplayerService.leaveRoom(roomId).catch(() => {});
      } catch { /* ignore */ }
    }
    localStorage.removeItem('currentRoomId');
    await signOut(auth);
    this.currentUser = null;
  }

  async signInAsGuest(nickname: string): Promise<void> {
    try {
      const result = await signInAnonymously(auth);
      // 닉네임 설정
      await updateProfile(result.user, { displayName: nickname });
      // Firestore에 게스트 유저 저장
      const guestUser: User = {
        uid: result.user.uid,
        email: '',
        displayName: nickname,
        photoURL: '',
        rating: 1000,
        createdAt: Date.now()
      };
      
      try {
        await setDoc(doc(db, 'users', result.user.uid), {
          ...guestUser,
          isGuest: true,
          lastLogin: serverTimestamp()
        });
      } catch (dbError) {
        console.warn('Firestore quota exceeded or error, skipping DB save for guest', dbError);
      }

      // 강제로 상태를 최신화하여 화면에 반영되도록 함
      if (this.currentUser) {
        this.currentUser = { ...this.currentUser, displayName: nickname };
      } else {
        this.currentUser = guestUser;
      }
      this.notifyListeners(this.currentUser);
    } catch (error: any) {
      throw error;
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback);
    // 즉시 현재 상태 전달
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(user: User | null) {
    this.listeners.forEach(listener => listener(user));
  }
}

export const authService = new AuthService();