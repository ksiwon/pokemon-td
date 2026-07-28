// src/services/MultiplayerService.ts
// ──────────────────────────────────────────────────────────────────
// V5 대규모 개편 — 멀티플레이 동기화 정확성 확보
//
// [V5-FIX-MS-1] deleteRoom이 모든 관련 경로를 재귀 삭제 (이미 대부분 있었으나 battleResults 누락 가능성 점검)
// [V5-FIX-MS-2] cleanupExpiredRooms 에 고아(orphan) gameStates/towerDetails 정리 추가
// [V5-FIX-MS-3] cleanupGame(roomId): 게임 종료 직후 즉시 정리용 public 메서드
// [V5-FIX-MS-4] leaveRoom: 호스트 이전 시 비AI 플레이어 우선 선택 (AI가 호스트 되는 상황 방지)
// [V5-FIX-MS-5] submitBattleResult 내 _pendingElimination 경로 제거
// [V5-FIX-MS-6] startBattlePhase: lastSkipPlayerId 결정론 전달
// [V5-FIX-MS-7] updatePlayerTowerDetails 에 tftPlacements 보존 (set 대신 항상 update)
// [V5-FIX-MS-8] updatePlayerState의 이중 경로 차단 (V6에서 money/lives 다시 허용됨)
// [V5-FIX-MS-9] 서버 시간 동기는 firebase.ts의 전역 serverNow() 사용
// [V5-FIX-MS-10] onGameStateUpdateWithPhase 구독에서 players의 배열/객체 정규화
// [V5-FIX-MS-11] finalizeGame이 끝나면 1분 유예 후 cleanupGame 호출
// [V5-FIX-MS-12] submitTFTPlacements: 플레이어 UID 검증 추가
// [V5-FIX-MS-13] markWaveCompleted: 이미 완료된 플레이어는 재호출 금지
//
// ── V7: 사람 매치 완주 보장 + Deadlock 방지 ──
// [V7-FIX-MS-14] leaveRoom: 사람 0명 시 방 자동 삭제 (AI-only deadlock 방지)
// [V7-FIX-MS-15] forcePushTowerDetailsFull 공식 API 추가
//
// ── FREE-TIER 최적화 ──
// [FREE-1] constructor에서 startAutoCleanup() 제거 — 모든 유저가 앱 로드 시
//          RTDB를 읽던 문제 해결. 멀티플레이어 진입 시에만 호출.
// [FREE-2] MAX_ACTIVE_ROOMS(12) 제한 — 동시 연결 96개 이하 유지 (여유 4개)
// [FREE-3] initRtdbListeners() 지연 초기화 — 싱글플레이어는 RTDB 연결 0개
// [BUG-C3] finalizeGame: 마지막 생존자(우승자)에게 placement:1 설정 — ELO 계산 오류 수정
//   - AIPlayer가 fbSet을 직접 호출하던 것을 일원화
//   - throttle 무시 즉시 업로드 + tftPlacements 보존

import {
  ref, set, onValue, push, update, remove, get,
  runTransaction, query, orderByChild, equalTo, endAt, startAt,
} from 'firebase/database';
import {
  rtdb, serverNow, getServerTimeOffset, registerPresence,
  initRtdbListeners, releaseRtdbConnection,
} from '../config/firebase';
import {
  Room, RoomPlayer, PlayerGameState, AIDifficulty, TowerDetail,
  GamePhase, MultiplayerGameState, RoundMatchup, PvPBattleResult,
} from '../types/multiplayer';
import { pvpBattleService } from './PvPBattleService';
import { calcBattleRewards } from './battleRewards';
import { authService } from './AuthService';
import { databaseService } from './DatabaseService';
import { achievementService } from './AchievementService';

const PHASE_COUNTDOWN_SECONDS = 10;
const FIRST_WAVE_PREP_SECONDS = 60;
const BATTLE_WAVE_INTERVAL = 3;

const ROOM_EXPIRY_TIME = 3 * 60 * 60 * 1000;       // 3시간
const FINISHED_GAME_TTL = 5 * 60 * 1000;           // [V5] 종료된 게임 정리까지 5분 대기
const CLEANUP_INTERVAL = 10 * 60 * 1000;           // 10분 간격

// [FREE-2] 무료 플랜 동시 연결 100개 보호: 방 8명 * 12방 = 96연결 + 여유 4
const MAX_ACTIVE_ROOMS = 12;

// [V6-FIX] 클라이언트가 업로드 가능한 필드 — money/lives 복원
//   배틀 보상 및 탈락 처리는 여전히 서버 트랜잭션이 수행하지만,
//   일반 구매/판매는 클라이언트가 로컬에서 즉시 반영하고 Firebase에 푸시.
//   레이스 컨디션 방지는 GameLayout의 "로컬 낙관적 갱신 플래그"가 담당.
// [C2-FIX] isAlive 제거 — 생존 여부는 playerDefeated/leaveRoom 단일 경로만 변경.
//   클라이언트 동기화가 isAlive:false를 먼저 써서 탈락 순위·레이팅이 누락되던 버그 방지.
const CLIENT_WRITABLE_PLAYER_FIELDS: Array<keyof PlayerGameState> = [
  'wave', 'towers', 'waveCompleted',
  'money', 'lives',
];

class MultiplayerService {
  private currentRoomId: string | null = null;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private presenceCleanup: (() => void) | null = null;
  /** 멀티플레이어 화면 참조 수 — 0이 되면 RTDB 연결 슬롯을 반납한다. */
  private _multiplayerRefs = 0;

  constructor() {
    // [FREE-1] constructor에서 startAutoCleanup() 제거.
    // 앱 로드 시 모든 유저가 RTDB에 연결하던 문제 해결.
    // 멀티플레이어 진입 시 initForMultiplayer()를 호출해야 한다.
  }

  /**
   * [FREE-1] 멀티플레이어 화면(로비/게임) 진입 시 호출.
   *   - RTDB 실시간 리스너를 lazy 초기화 (첫 연결 발생)
   *   - 만료 방 자동 정리 시작
   * teardownMultiplayer()와 짝을 이룬다(참조 카운트).
   *
   * 게임 화면도 호출해야 한다 — 게임 중 새로고침하면 로비를 거치지 않고 바로
   * 게임 라우트로 복귀하는데, 그때 초기화가 없으면 serverTimeOffset이 0으로 남아
   * 페이즈 타이머가 클라이언트 시계 오차만큼 어긋난다.
   */
  initForMultiplayer(): void {
    this._multiplayerRefs++;
    initRtdbListeners();                         // [FREE-3] RTDB 연결 시작(내부 refcount)
    if (!this.cleanupIntervalId) this.startAutoCleanup();
  }

  /**
   * [FREE-TIER] 멀티플레이어 화면에서 빠져나올 때 호출.
   * 마지막 참조가 사라지고 방에 속해 있지도 않으면 정리 타이머를 끄고
   * RTDB 동시 연결 슬롯을 반납한다.
   */
  teardownMultiplayer(): void {
    if (this._multiplayerRefs > 0) this._multiplayerRefs--;
    this.maybeReleaseConnection();
  }

  /**
   * 참조가 0이고 방에도 속해 있지 않을 때만 실제로 연결을 반납한다.
   * 방에 남아 있는데 끊으면 presence/게임 상태 동기화가 죽으므로, 방을 나가는
   * 시점(clearCurrentRoom)에 한 번 더 시도한다. releaseRtdbConnection은 멱등.
   */
  private maybeReleaseConnection(): void {
    if (this._multiplayerRefs > 0) return;
    if (this.getCurrentRoomId()) return;
    this.stopAutoCleanup();
    releaseRtdbConnection();
  }

  // [V5-FIX-MS-9] 서버 시간은 firebase.ts 전역 값을 사용
  private now(): number { return serverNow(); }
  getServerTimeOffset(): number { return getServerTimeOffset(); }

  // ─── 자동 정리 ─────────────────────────────────────────────────
  private startAutoCleanup(): void {
    if (this.cleanupIntervalId) clearInterval(this.cleanupIntervalId);
    this.cleanupExpiredRooms().catch(e => console.warn('[MS] initial cleanup failed:', e));
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredRooms().catch(e => console.warn('[MS] periodic cleanup failed:', e));
    }, CLEANUP_INTERVAL);
  }

  // ─── [FREE-TIER] 고아 노드 회수 큐 ─────────────────────────────
  // 예전 구현은 gameStates/towerDetails/battleResults/presence의 '루트'를 shallow REST로
  // 훑어 rooms에 없는 키를 지웠다. 그런데 database.rules.json은 이 네 경로의 .read를
  // $roomId 하위에만 두고 루트에는 두지 않는다(RTDB 규칙은 상위로 캐스케이드되지 않음).
  // → 루트 조회는 항상 403 → 스캔이 한 번도 동작한 적이 없었고, deleteRoom이 중간에
  //   실패해 생긴 고아 서브트리가 영구 잔존해 RTDB 1GB 저장 한도를 잠식했다.
  // 루트 .read를 여는 것은 "로그인만 하면 전체 게임 데이터를 통째로 내려받을 수 있다"는
  // 뜻이라 10GB 다운로드 한도상 더 위험하다. 그래서 방향을 뒤집는다:
  //   삭제를 '시도한 방'을 로컬 큐에 적어 두고, 하위 경로가 전부 지워질 때까지 재시도한다.
  // 큐는 localStorage에 있어 탭이 죽어도 다음 로비 진입 때 이어서 회수한다.
  private static readonly ORPHAN_QUEUE_LS_KEY = 'ptd-orphan-cleanup-queue';
  private static readonly ORPHAN_CHILD_PATHS = ['gameStates', 'towerDetails', 'battleResults', 'presence'] as const;
  /** 큐 항목 최대 보관 기간 — 이보다 오래 실패하면 회수 불가로 보고 버린다(무한 재시도 방지). */
  private static readonly ORPHAN_QUEUE_TTL = 24 * 60 * 60 * 1000;

  private readOrphanQueue(): Record<string, number> {
    try {
      const raw = localStorage.getItem(MultiplayerService.ORPHAN_QUEUE_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeOrphanQueue(q: Record<string, number>): void {
    try {
      localStorage.setItem(MultiplayerService.ORPHAN_QUEUE_LS_KEY, JSON.stringify(q));
    } catch { /* ignore */ }
  }

  private enqueueOrphanCleanup(roomId: string): void {
    const q = this.readOrphanQueue();
    if (q[roomId] === undefined) {
      q[roomId] = Date.now();
      this.writeOrphanQueue(q);
    }
  }

  private dequeueOrphanCleanup(roomId: string): void {
    const q = this.readOrphanQueue();
    if (q[roomId] !== undefined) {
      delete q[roomId];
      this.writeOrphanQueue(q);
    }
  }

  /**
   * 큐에 남은 방들의 하위 경로를 재삭제 시도. 전부 성공하면 큐에서 제거.
   * 하위 경로 삭제는 "방이 이미 없을 때"만 규칙이 허용하므로, rooms가 지워진 뒤에만 통한다.
   */
  private async drainOrphanQueue(): Promise<void> {
    const q = this.readOrphanQueue();
    const roomIds = Object.keys(q);
    if (roomIds.length === 0) return;

    const now = Date.now();
    for (const roomId of roomIds) {
      if (now - (q[roomId] ?? 0) > MultiplayerService.ORPHAN_QUEUE_TTL) {
        this.dequeueOrphanCleanup(roomId);
        continue;
      }

      // [SAFETY] 방이 아직 살아 있으면 절대 하위 경로를 지우지 않는다.
      //   보안 룰은 "그 방의 멤버"에게도 gameStates/{room} 쓰기를 허용하므로,
      //   rooms 삭제가 실패한 상태에서 그대로 밀어붙이면 진행 중인 게임의 상태를
      //   날려버릴 수 있다. createdAt 스칼라 하나만 읽어 존재 여부를 확인(수 바이트).
      let roomStillAlive = true;
      try {
        const probe = await get(ref(rtdb, `rooms/${roomId}/createdAt`));
        roomStillAlive = probe.exists();
      } catch {
        continue; // 확인 자체가 실패하면 이번 회차는 건너뛴다(안전 우선)
      }
      if (roomStillAlive) continue; // 다음 회차에 재확인

      const ok = await this.removeRoomChildren(roomId);
      if (ok) {
        this.dequeueOrphanCleanup(roomId);
        console.log(`[MS] Orphan cleanup completed for ${roomId}`);
      }
    }
  }

  /** 방 하위 4개 경로를 삭제. 전부 성공했으면 true. */
  private async removeRoomChildren(roomId: string): Promise<boolean> {
    const results = await Promise.allSettled(
      MultiplayerService.ORPHAN_CHILD_PATHS.map(p => remove(ref(rtdb, `${p}/${roomId}`)))
    );
    return results.every(r => r.status === 'fulfilled');
  }

  /**
   * [V5-FIX-MS-2] 만료 방 + 종료된 방 정리 + 고아 회수 큐 배수
   * [FREE-TIER] 전체 트리 다운로드 제거:
   *   - 만료/종료 방은 서버측 쿼리(orderByChild)로 해당 방만 수신 (평상시 0건 = 몇 바이트).
   *     database.rules.json의 rooms .indexOn(["status","createdAt"])이 전제 —
   *     인덱스가 없으면 SDK가 전체를 받아 클라이언트에서 거르므로 절감 효과가 사라진다.
   */
  private async cleanupExpiredRooms(): Promise<void> {
    try {
      // 실패해서 남아 있던 하위 경로부터 회수(가장 싸고 확실한 절감).
      await this.drainOrphanQueue();

      const now = Date.now();
      const roomsToDelete = new Set<string>();

      // 3시간 만료 방 — createdAt이 컷오프 이전인 방만 다운로드
      const expiredSnap = await get(query(
        ref(rtdb, 'rooms'),
        orderByChild('createdAt'),
        endAt(now - ROOM_EXPIRY_TIME)
      ));
      if (expiredSnap.exists()) {
        expiredSnap.forEach((child) => { roomsToDelete.add(child.key!); });
      }

      // 종료 후 TTL 지난 방 — status==='finished'인 방만 다운로드
      const finishedSnap = await get(query(
        ref(rtdb, 'rooms'),
        orderByChild('status'),
        equalTo('finished')
      ));
      if (finishedSnap.exists()) {
        finishedSnap.forEach((child) => {
          const room = child.val() as Room & { finishedAt?: number };
          if (room.finishedAt && now - room.finishedAt > FINISHED_GAME_TTL) {
            roomsToDelete.add(child.key!);
          }
        });
      }

      for (const roomId of roomsToDelete) await this.deleteRoom(roomId);
    } catch (error: any) {
      if (error?.message?.includes('Permission denied')) return;
      console.error('Failed to cleanup expired rooms:', error);
    }
  }

  /**
   * [V5-FIX-MS-1] 방과 모든 관련 데이터 완전 삭제
   * [FREE-TIER] 하위 경로 삭제가 하나라도 실패하면 회수 큐에 남겨 다음 회차에 재시도한다.
   */
  private async deleteRoom(roomId: string): Promise<void> {
    // rooms 삭제 '전에' 큐에 적는다 — rooms를 지운 직후 탭이 죽어도 흔적이 남도록.
    this.enqueueOrphanCleanup(roomId);
    try {
      // [SEC] rooms를 먼저 삭제해야 함 — 새 보안 룰에서 하위 경로(towerDetails 등)의
      // 전체 삭제는 "방이 없거나 만료/종료됨"일 때만 허용되므로 순서가 중요.
      await remove(ref(rtdb, `rooms/${roomId}`));
      const ok = await this.removeRoomChildren(roomId);
      if (ok) {
        this.dequeueOrphanCleanup(roomId);
        console.log(`[MS] Deleted room and all related data: ${roomId}`);
      } else {
        console.warn(`[MS] Room ${roomId} deleted but some child paths remain — queued for retry`);
      }
    } catch (error) {
      // rooms 삭제 자체가 실패했으면 하위 경로는 아직 지울 수 없다(규칙상). 큐에 남겨 둔다.
      console.error(`Failed to delete room ${roomId}:`, error);
    }
  }

  /**
   * [V5-FIX-MS-3] 게임 종료 직후 호출. 랭킹 확정 후 수 분 뒤 실제 삭제.
   */
  async cleanupGame(roomId: string, immediate = false): Promise<void> {
    if (immediate) {
      await this.deleteRoom(roomId);
      return;
    }
    // 방 상태만 finished로 표기 → cleanupExpiredRooms가 5분 후 실삭제
    try {
      await update(ref(rtdb, `rooms/${roomId}`), {
        status: 'finished',
        finishedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[MS] cleanupGame mark finished failed:', err);
    }
  }

  public stopAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  // ─── 방 CRUD ────────────────────────────────────────────────────
  async createRoom(mapId: string, mapName: string): Promise<string> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    // [FREE-2] 활성 방 수가 MAX_ACTIVE_ROOMS(12) 이상이면 생성 거부
    // 동시 연결 100개 한도 보호: 12방 * 8명 = 96연결
    // [FREE-TIER] 전체 트리 대신 만료 전(3시간 이내) 방만 서버측 쿼리로 수신
    const existingRoomsSnap = await get(query(
      ref(rtdb, 'rooms'),
      orderByChild('createdAt'),
      startAt(Date.now() - ROOM_EXPIRY_TIME)
    ));
    if (existingRoomsSnap.exists()) {
      const activeRooms = Object.values(existingRoomsSnap.val() as Record<string, any>)
        .filter((r: any) => r.status === 'waiting' || r.status === 'playing' || r.status === 'starting');
      if (activeRooms.length >= MAX_ACTIVE_ROOMS) {
        throw new Error('서버가 혼잡합니다. 잠시 후 다시 시도하거나 기존 방에 참가해주세요. (최대 동시 방 수 초과)');
      }
    }
    const newRoomRef = push(ref(rtdb, 'rooms'));
    const roomId = newRoomRef.key!;
    const room: Room = {
      id: roomId,
      name: `${user.displayName}의 방`,
      mapId, mapName,
      hostId: user.uid,
      hostName: user.displayName,
      players: [{
        userId: user.uid,
        userName: user.displayName,
        isReady: true, isAI: false,
        rating: user.rating,
      }],
      maxPlayers: 8,
      status: 'waiting',
      createdAt: Date.now(),
      // [SEC] 보안 룰 멤버십 맵 — 방 관련 쓰기는 이 맵에 있는 uid만 허용
      memberIds: { [user.uid]: true },
    };
    await set(newRoomRef, room);
    this.setCurrentRoom(roomId);
    return roomId;
  }

  async joinRoom(roomId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const roomRef = ref(rtdb, `rooms/${roomId}`);

    // 트랜잭션으로 동시 참가 레이스 방지
    // [SEC] 실패/멱등 경로는 `return undefined`로 트랜잭션을 '중단'한다(기존엔 room을 그대로 반환 → 무의미한 쓰기).
    //   보안 룰이 비멤버의 대기방 쓰기를 "가입(=결과 데이터에 본인 memberIds 포함)"으로만 제한하므로,
    //   변경 없는 되쓰기는 permission_denied가 되어 아래 joinError 메시지를 덮어써 버린다.
    //   중단하면 쓰기 자체가 발생하지 않아 원래 에러 메시지가 그대로 전달되고 RTDB 쓰기 쿼터도 아낀다.
    let joinError: Error | null = null;
    await runTransaction(roomRef, (room: Room | null) => {
      if (!room) { joinError = new Error('Room not found'); return; }
      if (Date.now() - room.createdAt > ROOM_EXPIRY_TIME) {
        joinError = new Error('Room has expired'); return;
      }
      const isAlreadyPlayer = room.players.some(p => p.userId === user.uid);
      if (isAlreadyPlayer) return; // 멱등 — 이미 참가자면 쓰기 없이 중단
      // [SEC] 강퇴당한 유저는 즉시 재입장 불가.
      if ((room.kickedUserIds ?? []).includes(user.uid)) {
        joinError = new Error('You were removed from this room'); return;
      }
      if (room.players.length >= room.maxPlayers) {
        joinError = new Error('Room is full'); return;
      }
      if (room.status !== 'waiting') {
        joinError = new Error('Game already started'); return;
      }
      const newPlayer: RoomPlayer = {
        userId: user.uid, userName: user.displayName,
        isReady: false, isAI: false, rating: user.rating,
      };
      return {
        ...room,
        players: [...room.players, newPlayer],
        // [SEC] 멤버십 맵 갱신 — 이후 게임 중 쓰기 권한의 근거
        memberIds: { ...(room.memberIds ?? {}), [user.uid]: true },
      };
    });
    if (joinError) throw joinError;
    this.setCurrentRoom(roomId);
  }

  async rejoinRoom(roomId: string): Promise<{ room: Room; canRejoin: boolean }> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const snapshot = await get(ref(rtdb, `rooms/${roomId}`));
    if (!snapshot.exists()) {
      this.clearCurrentRoom();
      return { room: null as any, canRejoin: false };
    }
    const room = snapshot.val() as Room;
    if (Date.now() - room.createdAt > ROOM_EXPIRY_TIME) {
      await this.deleteRoom(roomId);
      this.clearCurrentRoom();
      return { room: null as any, canRejoin: false };
    }
    const isPlayerInRoom = room.players.some(p => p.userId === user.uid);
    if (!isPlayerInRoom) {
      this.clearCurrentRoom();
      return { room: null as any, canRejoin: false };
    }

    // [V8-FIX-11-4] 게임 진행 중인 방에 재접속 시 gameState 데이터가 실제로 존재하는지 검증
    // Firebase 함수 에러나 네트워크 문제로 방은 playing인데 gameState가 없는 유령 방(Ghost Room) 상태 방지
    if (room.status === 'playing' || room.status === 'starting') {
      const gsSnap = await get(ref(rtdb, `gameStates/${roomId}`));
      if (!gsSnap.exists()) {
        console.warn(`[MultiplayerService] Rejoin failed: Room ${roomId} is playing but gameStates missing. Cleaning up.`);
        await this.deleteRoom(roomId);
        this.clearCurrentRoom();
        return { room: null as any, canRejoin: false };
      }
    }

    this.setCurrentRoom(roomId);
    return { room, canRejoin: true };
  }

  /**
   * [V5-FIX-MS-4] leaveRoom — 호스트 이전 시 비AI 플레이어 우선 선택
   * [V7-FIX-MS-14] 사람이 한 명도 안 남으면 방 자동 삭제 (AI-only deadlock 방지)
   */
  async leaveRoom(roomId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) return;

    // [FREE-TIER] 퇴장하는 유저의 스로틀 pending 폐기 — 퇴장 후 지연 쓰기 방지
    const pendingKey = `${roomId}:${user.uid}`;
    const pendingTimer = this.playerStateTimers.get(pendingKey);
    if (pendingTimer) { clearTimeout(pendingTimer); this.playerStateTimers.delete(pendingKey); }
    this.pendingPlayerState.delete(pendingKey);
    this.lastPlayerStateWrite.delete(pendingKey); // [FREE-TIER] 스로틀 타임스탬프도 정리(누수 방지)
    // 타워 상세도 동일 — 퇴장 후 지연 업로드가 나가면 permission_denied만 남는다.
    this.cancelPendingTowerUpdate(pendingKey);
    this.lastTowerUpdate.delete(pendingKey);

    const roomRef = ref(rtdb, `rooms/${roomId}`);

    let shouldDelete = false;
    await runTransaction(roomRef, (room: Room | null) => {
      if (!room) return room;
      // [SEC] 이미 나갔거나 강퇴된 유저의 no-op 쓰기 방지 — 트랜잭션 중단(권한 오류 회피)
      if (!room.players.some(p => p.userId === user.uid)) return undefined;
      const updatedPlayers = room.players.filter(p => p.userId !== user.uid);
      if (updatedPlayers.length === 0) {
        shouldDelete = true;
        return room;
      }

      // [V7-FIX-MS-14] 사람 0명이면 방 삭제
      const humanRemaining = updatedPlayers.filter(p => !p.isAI);
      if (humanRemaining.length === 0) {
        console.log('[MS] No humans left in room; marking for deletion');
        shouldDelete = true;
        return room;
      }

      // [SEC] memberIds에서 제거하지 않음(톰스톤 유지) — 직후의 gameStates
      // isAlive:false 쓰기와 이후 정리 작업이 보안 룰을 통과해야 하기 때문.
      // 게임 중 참가자였던 uid의 쓰기 권한이 방 만료까지 유지되는 것은 의도된 동작.

      let newHostId = room.hostId;
      let newHostName = room.hostName;
      if (room.hostId === user.uid) {
        // [V5-FIX-MS-4] 비AI 플레이어 우선 승격
        const nextHost = humanRemaining[0];
        newHostId = nextHost.userId;
        newHostName = nextHost.userName;
      }
      return { ...room, players: updatedPlayers, hostId: newHostId, hostName: newHostName };
    });

    if (shouldDelete) {
      await this.deleteRoom(roomId);
    } else {
      // gameStates 에서 isAlive=false 표시
      const gsRef = ref(rtdb, `gameStates/${roomId}`);
      await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
        if (!gs) return gs;
        // [SEC] 게임 참가자가 아니면 no-op 쓰기 대신 트랜잭션 중단
        if (!gs.players?.some(p => p.userId === user.uid)) return undefined;
        const updatedPlayers = gs.players.map(p =>
          p.userId === user.uid ? { ...p, isAlive: false } : p
        );
        return { ...gs, players: updatedPlayers };
      });
    }

    this.clearCurrentRoom();
  }

  /**
   * 호스트가 특정 플레이어를 방에서 강퇴.
   * - 호스트만 호출 가능, 게임 시작 전(waiting) 상태에서만 동작
   * - AI 강퇴도 동일하게 처리 (클라이언트 알림 불필요)
   * - 강퇴된 플레이어는 onRoomUpdate에서 자신이 players에 없음을 감지해 퇴장 처리
   */
  async kickPlayer(roomId: string, targetUserId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    let kickError: Error | null = null;

    await runTransaction(roomRef, (room: Room | null) => {
      if (!room) { kickError = new Error('Room not found'); return room; }
      if (room.hostId !== user.uid) { kickError = new Error('Only host can kick players'); return room; }
      if (room.status !== 'waiting') { kickError = new Error('Cannot kick after game started'); return room; }
      if (targetUserId === user.uid) { kickError = new Error('Cannot kick yourself'); return room; }

      const updatedPlayers = room.players.filter(p => p.userId !== targetUserId);
      // kickedUserIds에 기록 → 강퇴된 클라이언트가 자발적 퇴장과 구분 가능
      const kickedUserIds: string[] = [...(room.kickedUserIds ?? []), targetUserId];
      // [SEC] 강퇴된 유저는 멤버십 맵에서도 제거 — 게임 시작 후 쓰기 권한 차단
      const memberIds = { ...(room.memberIds ?? {}) };
      delete memberIds[targetUserId];
      return { ...room, players: updatedPlayers, kickedUserIds, memberIds };
    });

    if (kickError) throw kickError;
  }

  async addAI(roomId: string, difficulty: AIDifficulty): Promise<void> {
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    let err: Error | null = null;
    await runTransaction(roomRef, (room: Room | null) => {
      if (!room) { err = new Error('Room not found'); return room; }
      if (room.players.length >= room.maxPlayers) {
        err = new Error('Room is full'); return room;
      }
      const aiId = `ai_${difficulty}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const aiPlayer: RoomPlayer = {
        userId: aiId,
        userName: `AI (${difficulty})`,
        isReady: true, isAI: true,
        aiDifficulty: difficulty,
        rating: difficulty === 'easy' ? 800 : difficulty === 'medium' ? 1000 : 1200,
      };
      return { ...room, players: [...room.players, aiPlayer] };
    });
    if (err) throw err;
  }

  async toggleReady(roomId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    await runTransaction(roomRef, (room: Room | null) => {
      if (!room) return room;
      const updatedPlayers = room.players.map(p =>
        p.userId === user.uid ? { ...p, isReady: !p.isReady } : p
      );
      return { ...room, players: updatedPlayers };
    });
  }

  async startGame(roomId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) throw new Error('Room not found');
    const room = snapshot.val() as Room;
    if (room.hostId !== user.uid) throw new Error('Only host can start game');
    if (room.players.length < 2) throw new Error('Need at least 2 players');
    // [M5-FIX] 이미 시작된 방에서 재호출(더블클릭 등) 시 진행 중 gameStates가 초기화되는 것 방지.
    if (room.status !== 'waiting') throw new Error('Game already started');
    await this.initializePvPGameState(roomId, room.players);
    await update(roomRef, { status: 'starting' });
    setTimeout(async () => {
      await update(roomRef, { status: 'playing' }).catch(() => {});
    }, 3000);
  }

  private async initializePvPGameState(roomId: string, players: RoomPlayer[]): Promise<void> {
    const loadingReady: Record<string, boolean> = {};
    for (const p of players) loadingReady[p.userId] = p.isAI; // AI는 즉시 loaded
    const initialState: MultiplayerGameState = {
      roomId,
      players: players.map(p => ({
        userId: p.userId, userName: p.userName,
        wave: 0, lives: 50, money: 500, towers: 0,
        isAlive: true, rating: p.rating,
        waveCompleted: false,
        battleRecord: { wins: 0, losses: 0, currentWinStreak: 0, currentLoseStreak: 0 },
      })),
      startTime: this.now(),
      rankings: [],
      currentRound: 0,
      currentPhase: 'loading',
      encounterRecord: {},
      battleResults: [],
      phaseEndTime: null,
      loadingReady,
    };
    await set(ref(rtdb, `gameStates/${roomId}`), initialState);
  }

  async markPlayerLoaded(roomId: string, userId: string): Promise<boolean> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    let updated = false;
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      const loadingReady = { ...((gs as any).loadingReady || {}) };
      if (loadingReady[userId]) { updated = true; return gs; }
      loadingReady[userId] = true;
      updated = true;
      // [C1-FIX] 살아있는(=이탈하지 않은) 플레이어만 로딩 완료 대상으로 요구.
      //   예전엔 gs.players 전원을 요구 → 로딩 중 이탈/크래시한 사람이 있으면
      //   나머지가 로딩 화면에 영영 갇혔음. leaveRoom은 isAlive=false로 표시하므로 제외됨.
      const allLoaded = gs.players.filter(p => p.isAlive).every(p => loadingReady[p.userId] === true);
      if (allLoaded) {
        return {
          ...gs,
          loadingReady,
          currentPhase: 'waiting_wave' as GamePhase,
          phaseEndTime: this.now() + FIRST_WAVE_PREP_SECONDS * 1000,
        };
      }
      return { ...gs, loadingReady };
    });
    return updated;
  }

  /**
   * [C1-FIX] 로딩 워치독 — 크래시(leaveRoom 미호출)한 플레이어가 loadingReady를 채우지 않아
   *   전원이 로딩에 갇히는 경우를 대비한 강제 시작. 아직 loading 페이즈일 때만 waiting_wave로 전환.
   *   어떤 클라이언트가 호출해도 안전(트랜잭션 멱등).
   */
  async forceStartFromLoading(roomId: string): Promise<void> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      if (gs.currentPhase !== 'loading') return gs;
      return {
        ...gs,
        currentPhase: 'waiting_wave' as GamePhase,
        phaseEndTime: this.now() + FIRST_WAVE_PREP_SECONDS * 1000,
      };
    });
  }

  async setGamePhase(roomId: string, phase: GamePhase): Promise<void> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    const needsCountdown = phase === 'waiting_wave' || phase === 'waiting_battle';
    await update(gsRef, {
      currentPhase: phase,
      phaseEndTime: needsCountdown ? this.now() + PHASE_COUNTDOWN_SECONDS * 1000 : null,
    });
  }

  async startSynchronizedWave(roomId: string): Promise<void> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      if (gs.currentPhase === 'wave') return gs;
      if (gs.currentPhase !== 'waiting_wave') return gs;
      const newRound = gs.currentRound + 1;
      const updatedPlayers = gs.players.map(p => ({
        ...p,
        wave: p.isAlive ? newRound : p.wave,
        waveCompleted: false,
      }));
      return {
        ...gs,
        currentRound: newRound,
        currentPhase: 'wave' as GamePhase,
        players: updatedPlayers,
        phaseEndTime: null,
      };
    });
  }

  /**
   * [V5-FIX-MS-13] 멱등성 보장: 이미 완료된 플레이어는 재호출해도 변경 없음
   */
  async markWaveCompleted(roomId: string, userId: string): Promise<void> {
    // [FREE-TIER] 스로틀에 묶인 wave/money/lives를 페이즈 전환 판정 전에 반영
    await this.flushPlayerState(roomId, userId).catch(() => {});

    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    let shouldTransition = false;
    let transitionPhase: GamePhase = 'waiting_wave';
    let currentRound = 0;

    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      if (gs.currentPhase !== 'wave') return gs;
      const target = gs.players.find(p => p.userId === userId);
      if (!target) return gs;
      // [V5-FIX-MS-13] 이미 완료 → no-op
      if (target.waveCompleted) return gs;

      const updatedPlayers = gs.players.map(p =>
        p.userId === userId ? { ...p, waveCompleted: true } : p
      );
      const alivePlayers = updatedPlayers.filter(p => p.isAlive);
      const allCompleted = alivePlayers.length > 0 && alivePlayers.every(p => p.waveCompleted);
      currentRound = gs.currentRound;
      if (allCompleted) {
        shouldTransition = true;
        transitionPhase =
          gs.currentRound > 0 && gs.currentRound % BATTLE_WAVE_INTERVAL === 0
            ? 'waiting_battle'
            : 'waiting_wave';
        return {
          ...gs,
          players: updatedPlayers,
          currentPhase: transitionPhase,
          phaseEndTime: this.now() + PHASE_COUNTDOWN_SECONDS * 1000,
        };
      }
      return { ...gs, players: updatedPlayers };
    });

    if (shouldTransition) {
      console.log(`[MS] All completed wave ${currentRound} → ${transitionPhase}`);
    }
  }

  // ─── [FREE-TIER] 플레이어 상태 업로드 스로틀 ─────────────────────
  // money는 적 처치마다 바뀌므로(GameLayout store 구독 → 매 킬 호출) 즉시 쓰기 시
  // 게임당 수천 번의 전체 gameStates 트랜잭션이 발생했음.
  // 3초 윈도우로 병합 업로드하고, 정합성이 필요한 시점
  // (markWaveCompleted / playerDefeated = 페이즈 전환·탈락 판정 직전)에는 flush로 즉시 반영.
  private readonly PLAYER_STATE_THROTTLE_MS = 3000;
  private pendingPlayerState = new Map<string, Partial<PlayerGameState>>();
  private playerStateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastPlayerStateWrite = new Map<string, number>();

  /**
   * [V5-FIX-MS-8] 클라이언트가 업로드 가능한 필드만 허용.
   * isAlive 는 서버 트랜잭션(playerDefeated/leaveRoom)만 수정할 수 있음.
   */
  async updatePlayerState(
    roomId: string,
    userId: string,
    state: Partial<PlayerGameState>
  ): Promise<void> {
    // 화이트리스트 필터링
    const filtered: Partial<PlayerGameState> = {};
    for (const key of CLIENT_WRITABLE_PLAYER_FIELDS) {
      if (state[key] !== undefined) (filtered as any)[key] = state[key];
    }
    if (Object.keys(filtered).length === 0) return;

    const key = `${roomId}:${userId}`;
    this.pendingPlayerState.set(key, {
      ...(this.pendingPlayerState.get(key) ?? {}),
      ...filtered,
    });

    const elapsed = Date.now() - (this.lastPlayerStateWrite.get(key) ?? 0);
    if (elapsed >= this.PLAYER_STATE_THROTTLE_MS) {
      await this.flushPlayerState(roomId, userId);
    } else if (!this.playerStateTimers.has(key)) {
      const timer = setTimeout(() => {
        this.playerStateTimers.delete(key);
        this.flushPlayerState(roomId, userId).catch(() => {});
      }, this.PLAYER_STATE_THROTTLE_MS - elapsed);
      this.playerStateTimers.set(key, timer);
    }
  }

  /** 대기 중인 플레이어 상태를 즉시 업로드. 페이즈 전환 전 반드시 호출. */
  async flushPlayerState(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}:${userId}`;
    const timer = this.playerStateTimers.get(key);
    if (timer) { clearTimeout(timer); this.playerStateTimers.delete(key); }

    const pending = this.pendingPlayerState.get(key);
    if (!pending || Object.keys(pending).length === 0) return;
    this.pendingPlayerState.delete(key);
    this.lastPlayerStateWrite.set(key, Date.now());

    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      const updatedPlayers = (gs.players || []).map(p =>
        p.userId === userId ? { ...p, ...pending } : p
      );
      return { ...gs, players: updatedPlayers };
    });
  }

  // ─── 타워 상세 업로드 ──────────────────────────────────────────
  // [FREE-TIER] 스로틀 500ms → 3000ms. 웨이브 중 타워 HP가 갱신될 때마다
  // 전체 보드(기술 포함 수십 KB)가 업로드·전파되던 것을 완화.
  // 정확한 상태가 필요한 시점(웨이브 종료/재접속/배틀 배치)은 flushTowerUpdate/
  // forcePushTowerDetailsFull/submitTFTPlacements가 즉시 쓰므로 게임 로직 영향 없음.
  // [FIX] 스로틀 맵 키를 `roomId:userId`로 — 예전엔 userId만이라 같은 uid가
  //   방을 옮기면 이전 방의 예약 업로드가 살아 남거나 서로의 타이머를 취소했다.
  private lastTowerUpdate: Map<string, number> = new Map();
  private towerUpdateThrottle = 3000;
  private towerUpdateTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private towerKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  /** 예약된 타워 업로드 취소(즉시 쓰기 직전에 호출). */
  private cancelPendingTowerUpdate(key: string): void {
    const t = this.towerUpdateTimeouts.get(key);
    if (t) { clearTimeout(t); this.towerUpdateTimeouts.delete(key); }
  }

  /**
   * [V5-FIX-MS-7] update() 를 써서 tftPlacements 같은 sibling 필드 보존
   */
  async updatePlayerTowerDetails(
    roomId: string,
    userId: string,
    towerDetails: TowerDetail[]
  ): Promise<void> {
    const now = Date.now();
    const key = this.towerKey(roomId, userId);
    const lastUpdate = this.lastTowerUpdate.get(key) || 0;
    this.cancelPendingTowerUpdate(key);

    const doUpdate = async () => {
      const tRef = ref(rtdb, `towerDetails/${roomId}/${userId}`);
      await update(tRef, {
        towers: this.normalizeTowerDetails(towerDetails),
        updatedAt: this.now(),
      });
      this.lastTowerUpdate.set(key, Date.now());
    };
    if (now - lastUpdate >= this.towerUpdateThrottle) {
      await doUpdate();
    } else {
      const timeout = setTimeout(() => {
        this.towerUpdateTimeouts.delete(key);
        doUpdate().catch(err => console.warn('[MS] throttled tower update failed:', err));
      }, this.towerUpdateThrottle - (now - lastUpdate));
      this.towerUpdateTimeouts.set(key, timeout);
    }
  }

  /**
   * [V5] 배틀 결정론을 위한 타워 데이터 정규화
   *   - currentCooldown 등 런타임 필드 제거
   *   - equippedMoves를 name 기준 사전순 정렬 (Firebase key 순서 의존 제거)
   *   - undefined 제거
   */
  private normalizeTowerDetails(towerDetails: TowerDetail[]): TowerDetail[] {
    return (towerDetails || []).map(td => {
      const moves = Array.isArray(td.equippedMoves) ? td.equippedMoves : [];
      const sortedMoves = moves.slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      ).map((m: any) => {
        // currentCooldown 등 런타임 상태 제거
        const { currentCooldown, ...rest } = m;
        return rest;
      });
      return {
        pokemonId: td.pokemonId,
        name: td.name,
        level: td.level,
        sprite: td.sprite,
        position: td.position,
        currentHp: td.currentHp,
        maxHp: td.maxHp,
        isFainted: !!td.isFainted,
        attack: td.attack ?? 0,
        defense: td.defense ?? 0,
        specialAttack: td.specialAttack ?? 0,
        specialDefense: td.specialDefense ?? 0,
        speed: td.speed ?? 0,
        types: Array.isArray(td.types) ? td.types.slice() : [],
        equippedMoves: sortedMoves,
        lifesteal: td.lifesteal ?? 0,
        aoeBonus: td.aoeBonus ?? 0,
      };
    });
  }

  async flushTowerUpdate(
    roomId: string,
    userId: string,
    towerDetails: TowerDetail[]
  ): Promise<void> {
    const key = this.towerKey(roomId, userId);
    this.cancelPendingTowerUpdate(key);
    const tRef = ref(rtdb, `towerDetails/${roomId}/${userId}`);
    await update(tRef, {
      towers: this.normalizeTowerDetails(towerDetails),
      updatedAt: this.now(),
    });
    this.lastTowerUpdate.set(key, Date.now());
    console.log(`[MS] flushTowerUpdate: ${towerDetails.length} towers for ${userId}`);
  }

  /**
   * [V7-FIX-MS-15] throttle 무시 즉시 업로드 (AIPlayer.forcePushTowerDetails 대체)
   *   AIPlayer가 fbSet을 직접 호출하던 것을 공식 API로 일원화.
   *   - set이 아닌 update 사용 → tftPlacements 등 sibling 필드 보존
   *   - normalizeTowerDetails() 경유 → 결정론 정렬 + 런타임 필드 제거
   *   - 향후 Firebase Security Rules가 강화돼도 이 경로 하나만 점검하면 됨.
   */
  async forcePushTowerDetailsFull(
    roomId: string,
    userId: string,
    towerDetails: TowerDetail[]
  ): Promise<void> {
    const key = this.towerKey(roomId, userId);
    this.cancelPendingTowerUpdate(key);
    const tRef = ref(rtdb, `towerDetails/${roomId}/${userId}`);
    await update(tRef, {
      towers: this.normalizeTowerDetails(towerDetails),
      updatedAt: this.now(),
    });
    this.lastTowerUpdate.set(key, Date.now());
  }

  /**
   * [V5-FIX-MS-12] 본인 UID 만 배치 업로드 가능
   */
  async submitTFTPlacements(
    roomId: string,
    userId: string,
    placements: { id: string; x: number; y: number }[]
  ): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user || user.uid !== userId) {
      // AI의 경우 userId가 ai_로 시작 — 호스트 권한으로 허용
      if (!userId.startsWith('ai_')) {
        throw new Error('Cannot submit placements for another player');
      }
    }
    const tRef = ref(rtdb, `towerDetails/${roomId}/${userId}`);
    await update(tRef, { tftPlacements: placements });
  }

  onAllTFTPlacementsUpdate(
    roomId: string,
    callback: (placements: Map<string, { id: string; x: number; y: number }[]>) => void
  ): () => void {
    const tRef = ref(rtdb, `towerDetails/${roomId}`);
    // [LEAK-FIX] onValue의 반환값(Unsubscribe)을 그대로 돌려준다. off(ref,'value',unsub)은
    //   SDK가 '원본 콜백 동일성'으로 매칭하므로 절대 해제되지 않는다(아래 모든 구독 동일).
    return onValue(tRef, (snapshot) => {
      const combined = new Map<string, { id: string; x: number; y: number }[]>();
      if (!snapshot.exists()) { callback(combined); return; }
      const data = snapshot.val();
      Object.keys(data).forEach((userId) => {
        if (data[userId] && Array.isArray(data[userId].tftPlacements)) {
          combined.set(userId, data[userId].tftPlacements);
        } else {
          combined.set(userId, []);
        }
      });
      callback(combined);
    });
  }

  async playerDefeated(roomId: string, userId: string): Promise<void> {
    // [FREE-TIER] 스로틀에 묶인 최종 lives/money를 탈락 확정 전에 반영
    await this.flushPlayerState(roomId, userId).catch(() => {});

    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    let placementRank = 0;
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      const target = gs.players.find(p => p.userId === userId);
      if (!target || !target.isAlive) return gs;
      const aliveCount = gs.players.filter(p => p.isAlive).length;
      placementRank = aliveCount;
      const rankings = [...(gs.rankings || []), userId];
      const updatedPlayers = gs.players.map(p =>
        p.userId === userId
          ? { ...p, isAlive: false, placement: placementRank }
          : p
      );
      const next: MultiplayerGameState = { ...gs, players: updatedPlayers, rankings };

      // [C3-FIX] 웨이브 진행 중 어떤 플레이어가 죽으면 '살아있는 미완료자'가 사라져
      //   웨이브가 영영 안 끝나던 데드락 방지 — 사망 반영 후 남은 생존자 전원이 이미
      //   웨이브를 끝냈다면 여기서 다음 페이즈로 전환한다(markWaveCompleted와 동일 규칙).
      if (gs.currentPhase === 'wave') {
        const aliveAfter = updatedPlayers.filter(p => p.isAlive);
        if (aliveAfter.length > 0 && aliveAfter.every(p => p.waveCompleted)) {
          next.currentPhase =
            gs.currentRound > 0 && gs.currentRound % BATTLE_WAVE_INTERVAL === 0
              ? ('waiting_battle' as GamePhase)
              : ('waiting_wave' as GamePhase);
          next.phaseEndTime = this.now() + PHASE_COUNTDOWN_SECONDS * 1000;
        }
      }
      return next;
    });
    console.log(`[MS] Player ${userId} defeated at rank ${placementRank}`);
  }

  /**
   * [V5-FIX-MS-6] startBattlePhase — lastSkipPlayerId 결정론 전달
   * [V8-FIX-3-1] battleStartTime 서버 시각 기록 → 양측 tick 동기화
   */
  async startBattlePhase(roomId: string): Promise<RoundMatchup | null> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    let resultMatchup: RoundMatchup | null = null;

    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      if (gs.currentPhase === 'battle') return gs;
      if (gs.currentPhase !== 'waiting_battle') return gs;

      const alivePlayers = gs.players.filter(p => p.isAlive);
      if (alivePlayers.length <= 1) return gs;

      const lastSkipPlayerId = gs.roundMatchups?.skipPlayerId ?? null;
      const matchups = pvpBattleService.generateMatchups(
        alivePlayers,
        gs.encounterRecord || {},
        gs.currentRound,
        lastSkipPlayerId,
      );
      resultMatchup = matchups;

      // [V6-FIX] Bye 보너스는 클라이언트가 자체 반영 (skipPlayerId 필드로 감지)
      // [V8-FIX-1-5] AI 플레이어는 클라이언트가 없으므로 서버 트랜잭션에서 부전승 보상 직접 적용
      const updatedPlayers = gs.players.map(p => {
        if (p.userId === matchups.skipPlayerId && p.userId.startsWith('ai_')) {
          return { ...p, money: (p.money ?? 0) + 50 };
        }
        return p;
      });

      // [V8-FIX-3-1] battleStartTime: 서버 시각 기록 (this.now() = Firebase 서버 시각 오프셋 적용)
      return {
        ...gs,
        players: updatedPlayers,
        currentPhase: 'battle' as GamePhase,
        roundMatchups: matchups,
        phaseEndTime: null,
        battleStartTime: this.now(),
      };
    });

    return resultMatchup;
  }

  // [SIM-EXTRACT] 보상 공식은 src/services/battleRewards.ts로 이동(동작 동일) —
  //   밸런스 시뮬 하네스와 단일 출처 공유. 이 메서드는 위임만 한다.
  private calcBattleRewards(
    player: PlayerGameState,
    isWinner: boolean,
    myRemaining: number,
    oppRemaining: number
  ): { goldDelta: number; livesDelta: number } {
    return calcBattleRewards(player, isWinner, myRemaining, oppRemaining);
  }

  /**
   * [V6-FIX] submitBattleResult — 서버 트랜잭션은 보상(rewardP1/P2)과
   * battleRecord, 중복 제출 방지만 담당. money/lives 실제 적용은 클라이언트가
   * 자체 Firebase 구독을 보고 수행 (로컬 권위).
   *
   * 탈락 처리: 클라이언트가 보상 적용 후 lives <= 0 이면 playerDefeated() 호출.
   * 여기서는 트랜잭션으로 중복만 차단.
   */
  async submitBattleResult(roomId: string, result: PvPBattleResult): Promise<void> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);

    const { committed } = await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      const existing = (gs.battleResults || []).find(
        r => r.roundNumber === result.roundNumber
          && ((r.player1Id === result.player1Id && r.player2Id === result.player2Id)
            || (r.player1Id === result.player2Id && r.player2Id === result.player1Id))
      );
      if (existing) return gs; // 중복 제출 무시

      const loserId = result.winnerId === result.player1Id ? result.player2Id : result.player1Id;
      const encounterRecord = pvpBattleService.updateEncounterRecord(
        gs.encounterRecord || {},
        result.player1Id, result.player2Id,
      );
      const winnerRemaining = result.winnerId === result.player1Id
        ? result.player1RemainingPokemon : result.player2RemainingPokemon;
      const loserRemaining = result.winnerId === result.player1Id
        ? result.player2RemainingPokemon : result.player1RemainingPokemon;

      let rewardP1: { gold: number; lives: number } | undefined;
      let rewardP2: { gold: number; lives: number } | undefined;

      // [V6-FIX] money/lives 는 변경하지 않고 battleRecord 만 갱신
      const updatedPlayers = gs.players.map(p => {
        const isWinner = p.userId === result.winnerId;
        const isLoser = p.userId === loserId;
        if (!isWinner && !isLoser) return p;
        const { goldDelta, livesDelta } = this.calcBattleRewards(
          p, isWinner,
          isWinner ? winnerRemaining : loserRemaining,
          isWinner ? loserRemaining : winnerRemaining,
        );
        if (p.userId === result.player1Id) rewardP1 = { gold: goldDelta, lives: livesDelta };
        if (p.userId === result.player2Id) rewardP2 = { gold: goldDelta, lives: livesDelta };
        
        // [V8-FIX-1-5] AI 플레이어 생명력/골드 직접 갱신 (클라이언트가 없으므로 서버 트랜잭션에서 처리)
        let newLives = p.lives;
        let newMoney = p.money;
        if (p.userId.startsWith('ai_')) {
          newLives = Math.max(0, (p.lives ?? 0) + livesDelta);
          newMoney = (p.money ?? 0) + goldDelta;
        }

        return {
          ...p,
          lives: newLives,
          money: newMoney,
          battleRecord: {
            wins: isWinner ? (p.battleRecord?.wins ?? 0) + 1 : (p.battleRecord?.wins ?? 0),
            losses: isLoser ? (p.battleRecord?.losses ?? 0) + 1 : (p.battleRecord?.losses ?? 0),
            // [NEW-3 FIX] 연속 streak: 승리 시 winStreak++/loseStreak 리셋, 패배 시 반대
            currentWinStreak: isWinner ? (p.battleRecord?.currentWinStreak ?? 0) + 1 : 0,
            currentLoseStreak: isLoser ? (p.battleRecord?.currentLoseStreak ?? 0) + 1 : 0,
          },
        };
      });

      const battleResults = [...(gs.battleResults || []), { ...result, rewardP1, rewardP2 }];
      return {
        ...gs,
        players: updatedPlayers,
        encounterRecord,
        battleResults,
      };
    });

    if (committed) {
      const currentUser = authService.getCurrentUser();
      if (currentUser && result.winnerId === currentUser.uid) {
        achievementService.onMultiWin(currentUser.rating ?? 1000);
      }
    }
  }

  async checkAllBattlesComplete(roomId: string): Promise<boolean> {
    const snap = await get(ref(rtdb, `gameStates/${roomId}`));
    if (!snap.exists()) return false;
    const gs = snap.val() as MultiplayerGameState;
    if (!gs.roundMatchups) return true;
    const current = (gs.battleResults || []).filter(r => r.roundNumber === gs.currentRound);
    return current.length >= gs.roundMatchups.matches.length;
  }

  async startWaitingWavePhase(roomId: string): Promise<void> {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    await runTransaction(gsRef, (gs: MultiplayerGameState | null) => {
      if (!gs) return gs;
      if (gs.currentPhase === 'waiting_wave') return gs;
      if (gs.currentPhase !== 'battle') return gs;
      const currentRound = gs.currentRound;
      const recentResults = (gs.battleResults || []).filter(
        r => r.roundNumber >= currentRound - 2
      );

      // [V8-FIX-1-5] AI 플레이어 탈락 판정
      // 라운드 종료 시 생명력이 0 이하인 AI가 있다면 호스트 권한(트랜잭션)으로 탈락 처리
      let rankings = [...(gs.rankings || [])];
      const alivePlayersCount = gs.players.filter(p => p.isAlive).length;
      let eliminatedThisRound = 0;

      const updatedPlayers = gs.players.map(p => {
        if (p.isAlive && p.userId.startsWith('ai_') && p.lives <= 0) {
          eliminatedThisRound++;
          rankings.push(p.userId);
          return { ...p, isAlive: false, placement: alivePlayersCount - eliminatedThisRound + 1 };
        }
        return p;
      });

      return {
        ...gs,
        players: updatedPlayers,
        rankings,
        currentPhase: 'waiting_wave' as GamePhase,
        phaseEndTime: this.now() + PHASE_COUNTDOWN_SECONDS * 1000,
        battleResults: recentResults,
      };
    });

    // [V5] 배틀 종료 → tftPlacements 정리 (다음 라운드 혼동 방지)
    // [SEC] 보안 룰상 타 유저 경로에는 쓸 수 없으므로 본인 + AI 경로만 정리.
    //   모든 클라이언트가 이 함수를 호출하므로 인간 플레이어는 각자 자신의 것을,
    //   AI 것은 먼저 도달한 클라이언트가 정리하게 됨(멱등).
    try {
      const me = authService.getCurrentUser();
      const tdRef = ref(rtdb, `towerDetails/${roomId}`);
      const snap = await get(tdRef);
      if (snap.exists()) {
        const updates: Record<string, any> = {};
        snap.forEach((child) => {
          const userId = child.key!;
          if (userId.startsWith('ai_') || userId === me?.uid) {
            updates[`${userId}/tftPlacements`] = null;
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(tdRef, updates);
        }
      }
    } catch (err) {
      console.warn('[MS] tftPlacements cleanup failed:', err);
    }
  }

  async finalizeGame(roomId: string): Promise<void> {
    const snap = await get(ref(rtdb, `gameStates/${roomId}`));
    if (!snap.exists()) return;
    const gs = snap.val() as MultiplayerGameState;

    // [BUG-C3] 마지막 생존자(우승자)에게 placement:1 설정.
    // playerDefeated()로 탈락한 플레이어는 placement가 설정되지만
    // 우승자는 placement가 undefined → ELO 계산에서 틀리게 처리되던 버그 수정.
    const winner = gs.players.find(p => p.isAlive && !p.userId.startsWith('ai_'));
    if (winner && !winner.placement) {
      const gsRef = ref(rtdb, `gameStates/${roomId}`);
      await runTransaction(gsRef, (state: MultiplayerGameState | null) => {
        if (!state) return state;
        return {
          ...state,
          players: state.players.map(p =>
            p.userId === winner.userId ? { ...p, placement: 1 } : p
          ),
        };
      }).catch(err => console.warn('[MS] winner placement set failed:', err));
      // 업데이트된 상태로 재조회
      const updatedSnap = await get(ref(rtdb, `gameStates/${roomId}`));
      if (updatedSnap.exists()) {
        await this.updateRatings(updatedSnap.val() as MultiplayerGameState);
      }
    } else {
      await this.updateRatings(gs);
    }

    // [V5-FIX-MS-11] 랭킹 업데이트 후 방 상태를 finished로 표기
    await this.cleanupGame(roomId, false).catch(() => {});
  }

  /**
   * [A1] updateRatings 전면 교체
   *   - AI 플레이어를 ELO 계산에서 제외 (AI 대전 승리로 레이팅 팽창 방지)
   *   - 각 플레이어의 ratingChange를 Firebase gameState.players에 기록 (모달 UI 표시용)
   *
   * [SEC-ELO] 중복 적용 방지 재설계:
   *   - finalizeGame은 각 클라이언트가 게임오버 모달을 닫을 때마다 호출됨.
   *   - 계산은 "게임 시작 시점 rating + placement"만 사용하는 순수 함수로,
   *     누가 몇 번 실행해도 동일한 결과 → gameState의 rating 필드는 절대 변경하지 않음
   *     (기존에는 rating을 덮어써서 두 번째 실행 시 변화량이 이중 적용됐음).
   *   - Firestore 보안 룰상 본인 users 문서만 쓸 수 있으므로 본인 rating만 갱신
   *     (타인 문서 쓰기는 어차피 permission-denied — 불필요한 실패 요청 제거).
   *   - ratingChange 기록은 이미 기록돼 있으면 트랜잭션 중단(1회만 기록).
   */
  private async updateRatings(gs: MultiplayerGameState): Promise<void> {
    const humanPlayers = gs.players.filter(p => !p.userId.startsWith('ai_'));
    const currentUser = authService.getCurrentUser();
    const updates: Array<{ userId: string; newRating: number; ratingChange: number }> = [];

    for (let i = 0; i < humanPlayers.length; i++) {
      const player = humanPlayers[i];
      let ratingChange = 0;
      for (let j = 0; j < humanPlayers.length; j++) {
        if (i === j) continue;
        const opp = humanPlayers[j];
        const expected = 1 / (1 + Math.pow(10, (opp.rating - player.rating) / 400));
        const actual = (player.placement ?? humanPlayers.length) < (opp.placement ?? humanPlayers.length) ? 1 : 0;
        ratingChange += Math.round(32 * (actual - expected));
      }
      const newRating = Math.max(0, player.rating + ratingChange);
      updates.push({ userId: player.userId, newRating, ratingChange });
    }

    // 본인 rating만 Firestore에 반영 (같은 값 재기록은 무해 — 멱등)
    const myUpdate = currentUser ? updates.find(u => u.userId === currentUser.uid) : undefined;
    if (myUpdate) {
      try {
        await databaseService.updateUserRating(myUpdate.userId, myUpdate.newRating);
        achievementService.onRatingUpdate(myUpdate.newRating);
      } catch (err) {
        console.warn('[MS] rating update failed:', err);
      }
    }

    // ratingChange 기록 — 이미 기록돼 있으면 중단. rating 필드는 건드리지 않음.
    if (updates.length > 0) {
      const gsRef = ref(rtdb, `gameStates/${gs.roomId}`);
      await runTransaction(gsRef, (state: MultiplayerGameState | null) => {
        if (!state) return state;
        const alreadyApplied = state.players.some(
          p => p.ratingChange !== undefined && p.ratingChange !== null
        );
        if (alreadyApplied) return undefined; // 트랜잭션 중단(no-op)
        const updatedPlayers = state.players.map(p => {
          const u = updates.find(x => x.userId === p.userId);
          return u ? { ...p, ratingChange: u.ratingChange } : p;
        });
        return { ...state, players: updatedPlayers };
      }).catch(err => console.warn('[MS] gameState ratingChange write failed:', err));
    }
  }

  // ─── 재접속 상태 복원 ───────────────────────────────────────────
  async getPlayerStateForRejoin(roomId: string, userId: string): Promise<{
    lives: number;
    money: number;
    wave: number;
    towerDetails: TowerDetail[];
    isAlive: boolean;
    currentRound: number;
    currentPhase: GamePhase;
  } | null> {
    try {
      const [gsSnap, tdSnap] = await Promise.all([
        get(ref(rtdb, `gameStates/${roomId}`)),
        get(ref(rtdb, `towerDetails/${roomId}/${userId}`)),
      ]);
      if (!gsSnap.exists()) return null;

      const gs = gsSnap.val() as MultiplayerGameState;
      const playerState = gs.players.find(p => p.userId === userId);
      if (!playerState) return null;

      const towerDetails: TowerDetail[] = tdSnap.exists()
        ? (tdSnap.val().towers || [])
        : [];

      return {
        lives: playerState.lives,
        money: playerState.money,
        wave: playerState.wave,
        towerDetails,
        isAlive: playerState.isAlive,
        currentRound: gs.currentRound,
        currentPhase: gs.currentPhase,
      };
    } catch (err) {
      console.error('[MS] getPlayerStateForRejoin error:', err);
      return null;
    }
  }

  // ─── 구독 메서드들 ─────────────────────────────────────────────
  // [FREE-TIER] 로비 목록은 status==='waiting' 방만 서버측 쿼리로 구독.
  //   playing/finished 방의 게임 중 변경사항이 로비 대기자 전원에게
  //   전파되던 다운로드 낭비 제거. (rooms .indexOn 전제)
  onRoomsUpdate(callback: (rooms: Room[]) => void): () => void {
    const waitingQuery = query(ref(rtdb, 'rooms'), orderByChild('status'), equalTo('waiting'));
    const unsubscribe = onValue(waitingQuery, (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const rooms: Room[] = [];
      const now = Date.now();
      snapshot.forEach((child) => {
        const room = child.val() as Room;
        if (now - room.createdAt <= ROOM_EXPIRY_TIME) {
          rooms.push(room);
        }
      });
      callback(rooms);
    });
    return unsubscribe;
  }

  onRoomUpdate(roomId: string, callback: (room: Room | null) => void): () => void {
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    return onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) { callback(null); return; }
      const room = snapshot.val() as Room;
      if (Date.now() - room.createdAt > ROOM_EXPIRY_TIME) {
        this.deleteRoom(roomId).catch(() => {});
        callback(null);
        return;
      }
      callback(room);
    });
  }

  // [V5-FIX-MS-10] players 정규화
  private normalizePlayers(raw: any): PlayerGameState[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return Object.values(raw).filter(Boolean) as PlayerGameState[];
  }

  onGameStateUpdate(roomId: string, callback: (players: PlayerGameState[]) => void): () => void {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    return onValue(gsRef, (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const gs = snapshot.val();
      callback(this.normalizePlayers(gs.players));
    });
  }

  onGameStateUpdateWithPhase(
    roomId: string,
    callback: (state: MultiplayerGameState | null) => void
  ): () => void {
    const gsRef = ref(rtdb, `gameStates/${roomId}`);
    return onValue(gsRef, (snapshot) => {
      if (!snapshot.exists()) { callback(null); return; }
      const gs = snapshot.val() as MultiplayerGameState;
      // [V5-FIX-MS-10] players / battleResults / rankings 정규화
      const normalized: MultiplayerGameState = {
        ...gs,
        players: this.normalizePlayers(gs.players),
        battleResults: Array.isArray(gs.battleResults)
          ? gs.battleResults
          : gs.battleResults ? Object.values(gs.battleResults) as PvPBattleResult[] : [],
        rankings: Array.isArray(gs.rankings) ? gs.rankings : (gs.rankings ? Object.values(gs.rankings) as string[] : []),
      };
      callback(normalized);
    });
  }

  onMatchupUpdate(
    roomId: string,
    callback: (matchups: RoundMatchup | null) => void
  ): () => void {
    const matchupRef = ref(rtdb, `gameStates/${roomId}/roundMatchups`);
    return onValue(matchupRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  onTowerDetailsUpdate(
    roomId: string,
    userId: string,
    callback: (towers: TowerDetail[]) => void
  ): () => void {
    const tRef = ref(rtdb, `towerDetails/${roomId}/${userId}`);
    return onValue(tRef, (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const data = snapshot.val();
      callback(Array.isArray(data.towers) ? data.towers : []);
    });
  }

  onAllTowerDetailsUpdate(
    roomId: string,
    callback: (allTowers: Map<string, TowerDetail[]>) => void
  ): () => void {
    const tRef = ref(rtdb, `towerDetails/${roomId}`);
    return onValue(tRef, (snapshot) => {
      const combined = new Map<string, TowerDetail[]>();
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          const userId = child.key!;
          const data = child.val();
          if (data && Array.isArray(data.towers)) combined.set(userId, data.towers);
        });
      }
      callback(combined);
    });
  }

  async getAllTowerDetailsOnce(roomId: string): Promise<Map<string, TowerDetail[]>> {
    const snap = await get(ref(rtdb, `towerDetails/${roomId}`));
    const combined = new Map<string, TowerDetail[]>();
    if (snap.exists()) {
      snap.forEach((child) => {
        const userId = child.key!;
        const data = child.val();
        if (data && Array.isArray(data.towers) && data.towers.length > 0) {
          combined.set(userId, data.towers);
        }
      });
    }
    return combined;
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const snap = await get(ref(rtdb, `rooms/${roomId}`));
    return snap.exists() ? (snap.val() as Room) : null;
  }

  /**
   * [C4-FIX] 프레즌스(접속) 상태 구독. 생존 클라이언트가 장기 연결끊김 플레이어를 몰수(forfeit)해
   *   게임이 3h TTL까지 멈추지 않게 하는 워치독의 입력. { [userId]: {online, ...} } 형태.
   */
  onPresenceUpdate(
    roomId: string,
    callback: (presence: Record<string, { online: boolean; joinedAt?: number; lastSeen?: number }>) => void
  ): () => void {
    const pRef = ref(rtdb, `presence/${roomId}`);
    return onValue(pRef, (snap) => {
      callback(snap.exists() ? snap.val() : {});
    });
  }

  getCurrentRoomId(): string | null {
    if (!this.currentRoomId) this.currentRoomId = localStorage.getItem('currentRoomId');
    return this.currentRoomId;
  }

  private setCurrentRoom(roomId: string): void {
    this.currentRoomId = roomId;
    localStorage.setItem('currentRoomId', roomId);
    // [V5] presence 등록 — 브라우저 종료 시 자동으로 isAlive=false 가 아니라
    // presence 노드에만 기록. 실제 isAlive는 leaveRoom/탈락 로직이 담당.
    const user = authService.getCurrentUser();
    if (user && this.presenceCleanup) { this.presenceCleanup(); this.presenceCleanup = null; }
    if (user) {
      // [FIX] offline 페이로드를 넘기지 않는다 — registerPresence의 기본값이
      //   `{ online: false, lastSeen: serverTimestamp() }`라 서버가 '끊긴 시각'을 채운다.
      //   예전엔 여기서 Date.now()를 넣어, 등록(=입장) 시각이 lastSeen으로 박혀 있었다.
      this.presenceCleanup = registerPresence(
        `presence/${roomId}/${user.uid}`,
        { online: true, joinedAt: Date.now() },
      );
    }
  }

  clearCurrentRoom(): void {
    this.currentRoomId = null;
    localStorage.removeItem('currentRoomId');
    if (this.presenceCleanup) { this.presenceCleanup(); this.presenceCleanup = null; }
    // 화면은 이미 내려갔는데 방에 묶여 있어 보류됐던 연결 반납을 여기서 마무리.
    this.maybeReleaseConnection();
  }

  getRoomRemainingTime(room: Room): number {
    return Math.max(0, ROOM_EXPIRY_TIME - (Date.now() - room.createdAt));
  }

  isRoomExpired(room: Room): boolean {
    return Date.now() - room.createdAt > ROOM_EXPIRY_TIME;
  }
}

export const multiplayerService = new MultiplayerService();