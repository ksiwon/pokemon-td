// sim/multi2/lobby.sim.ts
// 로비/방 수명주기 — MultiplayerService 실코드를 인메모리 RTDB 위에서 그대로 돌린다.
// (이 계층이 시뮬에서 실행된 적이 한 번도 없었다 — sim/support/mocks/firebase.ts 헤더 참조)
// 실행: npm run sim:2p:lobby

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWorld, readServer, getDatabase, ref, get } from '../net/rtdb';
import { spawnClient, makeUser, ClientModules } from '../net/clientKit';

const db = getDatabase();
const flush = (ms = 500) => vi.advanceTimersByTimeAsync(ms);

/**
 * 실제 UI 순서 재현: MultiplayerLobby 는 방 목록을 구독한 뒤 그 목록에서 방을 고른다.
 * ⚠ 이 구독이 joinRoom 의 **전제**다. RTDB 트랜잭션은 로컬 캐시 값으로 먼저 실행되고
 *   업데이터가 undefined 를 돌려주면 서버에 물어보지도 않고 중단하므로, 캐시가 비어 있으면
 *   joinRoom 의 `if (!room) { joinError = 'Room not found'; return; }` 가 즉시 걸린다.
 *   (아래 "찬 캐시 없이 joinRoom" 테스트가 이 성질을 못 박는다)
 */
function enterLobby(c: ClientModules): () => void {
  return c.multiplayerService.onRoomsUpdate(() => {});
}

describe('P-1: 방 수명주기 (실 MultiplayerService)', () => {
  let A: ClientModules;
  let B: ClientModules;

  beforeEach(async () => {
    resetWorld();
    localStorage.removeItem('currentRoomId');
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    A = await spawnClient('cA', makeUser('u_alice', 1000), { latencyMs: 20 });
    B = await spawnClient('cB', makeUser('u_bob', 1000), { latencyMs: 20 });
    A.multiplayerService.initForMultiplayer();
    B.multiplayerService.initForMultiplayer();
    await flush(50);
  });

  afterEach(() => {
    try { A?.multiplayerService.stopAutoCleanup(); } catch { /* ignore */ }
    try { B?.multiplayerService.stopAutoCleanup(); } catch { /* ignore */ }
    vi.useRealTimers();
  });

  it('생성 → 참가 → 시작 → 로딩완료 → waiting_wave 까지 간다', async () => {
    const pCreate = A.multiplayerService.createRoom('easiest_straight', '직선');
    await flush(); const roomId = await pCreate;
    expect(roomId).toBeTruthy();

    const unsubB = enterLobby(B);
    await flush();
    const pJoin = B.multiplayerService.joinRoom(roomId);
    await flush(); await pJoin;

    const room = readServer(`rooms/${roomId}`) as any;
    expect(room.players.map((p: any) => p.userId).sort()).toEqual(['u_alice', 'u_bob']);
    expect(room.memberIds).toEqual({ u_alice: true, u_bob: true });

    // B 는 기본 미준비 → 준비 토글
    const pReady = B.multiplayerService.toggleReady(roomId);
    await flush(); await pReady;
    expect((readServer(`rooms/${roomId}`) as any).players.find((p: any) => p.userId === 'u_bob').isReady).toBe(true);

    // 호스트가 아닌 B 의 시작 시도는 거부
    // ⚠ 가짜 타이머라 `await` 만 하면 왕복이 영영 안 끝난다 — 먼저 걸고 시간을 흘린 뒤 확인.
    const badStart = B.multiplayerService.startGame(roomId).then(() => 'ok').catch((e: Error) => e.message);
    await flush();
    expect(await badStart).toMatch(/Only host/);

    const pStart = A.multiplayerService.startGame(roomId);
    await flush(); await pStart;
    expect((readServer(`gameStates/${roomId}`) as any).currentPhase).toBe('loading');

    await flush(4000); // startGame 내부 setTimeout(3000) → status: playing
    expect((readServer(`rooms/${roomId}`) as any).status).toBe('playing');

    // 양쪽 로딩 완료 → waiting_wave
    const l1 = A.multiplayerService.markPlayerLoaded(roomId, 'u_alice');
    await flush(); await l1;
    expect((readServer(`gameStates/${roomId}`) as any).currentPhase).toBe('loading');

    const l2 = B.multiplayerService.markPlayerLoaded(roomId, 'u_bob');
    await flush(); await l2;
    const gs = readServer(`gameStates/${roomId}`) as any;
    expect(gs.currentPhase).toBe('waiting_wave');
    expect(gs.phaseEndTime).toBeGreaterThan(Date.now());
  });

  it('빈 배열/빈 객체 필드는 저장 직후 사라진다 (normalize 가 필요한 이유)', async () => {
    const pCreate = A.multiplayerService.createRoom('easiest_straight', '직선');
    await flush(); const roomId = await pCreate;
    const unsubB = enterLobby(B);
    await flush();
    const pJoin = B.multiplayerService.joinRoom(roomId);
    await flush(); await pJoin;
    const pStart = A.multiplayerService.startGame(roomId);
    await flush(4000); await pStart;

    const raw = readServer(`gameStates/${roomId}`) as any;
    // initializePvPGameState 는 rankings: [], encounterRecord: {}, battleResults: [] 를 쓴다.
    expect(raw.rankings).toBeUndefined();
    expect(raw.encounterRecord).toBeUndefined();
    expect(raw.battleResults).toBeUndefined();
    // 구독 경로는 이걸 배열로 되돌려 준다 — 이게 없으면 전 화면이 터진다.
    let seen: any = null;
    const unsub = A.multiplayerService.onGameStateUpdateWithPhase(roomId, (s: any) => { seen = s; });
    await flush();
    expect(Array.isArray(seen.battleResults)).toBe(true);
    expect(Array.isArray(seen.rankings)).toBe(true);
    expect(Array.isArray(seen.players)).toBe(true);
    unsub();
  });

  it('두 클라이언트가 동시에 참가해도 방이 깨지지 않는다', async () => {
    const C = await spawnClient('cC', makeUser('u_carol'), { latencyMs: 20 });
    C.multiplayerService.initForMultiplayer();

    const pCreate = A.multiplayerService.createRoom('easiest_straight', '직선');
    await flush(); const roomId = await pCreate;

    const unsubB = enterLobby(B); const unsubC = enterLobby(C);
    await flush();
    const j1 = B.multiplayerService.joinRoom(roomId);
    const j2 = C.multiplayerService.joinRoom(roomId);
    await flush(); await Promise.all([j1, j2]);

    const room = readServer(`rooms/${roomId}`) as any;
    expect(room.players.map((p: any) => p.userId).sort()).toEqual(['u_alice', 'u_bob', 'u_carol']);
    C.multiplayerService.stopAutoCleanup();
  });

  it('마지막 사람이 나가면 방과 하위 경로가 전부 사라진다', async () => {
    const pCreate = A.multiplayerService.createRoom('easiest_straight', '직선');
    await flush(); const roomId = await pCreate;
    const unsubB = enterLobby(B);
    await flush();
    const pJoin = B.multiplayerService.joinRoom(roomId);
    await flush(); await pJoin;
    const pStart = A.multiplayerService.startGame(roomId);
    await flush(4000); await pStart;

    const pt = A.multiplayerService.flushTowerUpdate(roomId, 'u_alice', []);
    await flush(); await pt;

    const lb = B.multiplayerService.leaveRoom(roomId);
    await flush(); await lb;
    expect(readServer(`rooms/${roomId}`)).not.toBeNull();

    const la = A.multiplayerService.leaveRoom(roomId);
    await flush(); await la;
    expect(readServer(`rooms/${roomId}`)).toBeNull();
    expect(readServer(`gameStates/${roomId}`)).toBeNull();
    expect(readServer(`towerDetails/${roomId}`)).toBeNull();
    expect(readServer(`presence/${roomId}`)).toBeNull();
  });
});
