// sim/multi2/rtdbSemantics.sim.ts
// 가짜 RTDB(sim/net/rtdb.ts)가 실제 RTDB 규칙을 지키는지 먼저 못 박는다.
// 이 파일이 통과하지 못하면 위층(2인 프로토콜 검증)의 결론은 전부 무의미하다.
// 실행: npm run sim:2p:rtdb

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resetWorld, registerClient, getDatabase, ref, set, get, update, remove, push,
  onValue, runTransaction, query, orderByChild, equalTo, startAt, endAt,
  readServer, simDisconnect, simReconnect, onDisconnect, serverTimestamp, seedServer,
} from '../net/rtdb';

const db = getDatabase();

async function flush(ms = 200) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('가짜 RTDB — 실제 RTDB 규칙 재현', () => {
  beforeEach(() => {
    resetWorld();
    registerClient('default', { latencyMs: 5 });
    vi.useFakeTimers({ now: 1_760_000_000_000 });
  });

  it('null 프루닝 — 빈 배열/빈 객체/null 은 노드를 삭제한다', async () => {
    const p = set(ref(db, 'gs/room1'), {
      roomId: 'room1',
      rankings: [],             // → 사라짐
      battleResults: [],        // → 사라짐
      encounterRecord: {},      // → 사라짐
      phaseEndTime: null,       // → 사라짐
      currentRound: 0,
    });
    await flush(); await p;

    const v = readServer('gs/room1') as any;
    expect(v.roomId).toBe('room1');
    expect(v.rankings).toBeUndefined();
    expect(v.battleResults).toBeUndefined();
    expect(v.encounterRecord).toBeUndefined();
    expect(v.phaseEndTime).toBeUndefined();
    expect(v.currentRound).toBe(0);   // 0 은 남는다 (falsy 지만 값)
  });

  it('배열↔객체 — dense 는 배열, sparse 는 객체로 돌아온다', async () => {
    const a = set(ref(db, 't/dense'), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await flush(); await a;
    expect(Array.isArray(readServer('t/dense'))).toBe(true);

    // 가운데를 지우면 0,2 만 남아 "0..2 중 2/3" → 여전히 배열(절반 초과)
    const b = update(ref(db, 't/dense'), { 1: null });
    await flush(); await b;
    expect(Array.isArray(readServer('t/dense'))).toBe(true);

    // 0 하나만 남기면 키 {2} → 0..2 중 1/3 → 객체
    const c = set(ref(db, 't/sparse'), { 5: { id: 'x' } });
    await flush(); await c;
    expect(Array.isArray(readServer('t/sparse'))).toBe(false);
    expect((readServer('t/sparse') as any)['5'].id).toBe('x');
  });

  it('undefined 페이로드는 즉시 던진다', () => {
    expect(() => set(ref(db, 't/bad'), { a: 1, b: undefined })).toThrow(/undefined/);
  });

  it('serverTimestamp 는 서버에서 숫자로 치환된다', async () => {
    const p = set(ref(db, 't/ts'), { at: serverTimestamp() });
    await flush(); await p;
    expect(typeof (readServer('t/ts') as any).at).toBe('number');
  });

  it('runTransaction — 캐시 없으면 null 로 먼저 호출되고, 서버 값으로 재시도한다', async () => {
    // 다른 클라이언트가 써 둔 상태를 흉내 — 이 클라의 캐시는 비어 있다.
    seedServer('t/txn', { n: 10 });

    // 이 클라이언트는 t/txn 을 구독/조회한 적이 없다 → 첫 호출 입력은 null
    const seen: any[] = [];
    const p = runTransaction(ref(db, 't/txn'), (cur: any) => {
      seen.push(cur);
      if (!cur) return cur;              // null 가드 (실코드 패턴)
      return { n: cur.n + 1 };
    });
    await flush(); const res = await p;

    expect(seen[0]).toBeNull();          // 1차: 캐시 없음
    expect(seen[1]).toEqual({ n: 10 });  // 2차: 서버 값으로 재시도
    expect(res.committed).toBe(true);
    expect((readServer('t/txn') as any).n).toBe(11);
  });

  it('runTransaction — 동시 갱신 시 한쪽이 재시도해 둘 다 반영된다', async () => {
    const seed = set(ref(db, 't/race'), { n: 0 });
    await flush(); await seed;
    const warm = get(ref(db, 't/race'));
    await flush(); await warm;

    const bump = () => runTransaction(ref(db, 't/race'), (cur: any) =>
      cur ? { n: cur.n + 1 } : cur);

    const [r1, r2] = [bump(), bump()];
    await flush(); await Promise.all([r1, r2]);
    expect((readServer('t/race') as any).n).toBe(2);
  });

  it('업데이터가 undefined 를 반환하면 중단되고 쓰기가 없다', async () => {
    const seed = set(ref(db, 't/abort'), { n: 1 });
    await flush(); await seed;
    const warm = get(ref(db, 't/abort'));
    await flush(); await warm;

    const p = runTransaction(ref(db, 't/abort'), () => undefined);
    await flush(); const res = await p;
    expect(res.committed).toBe(false);
    expect((readServer('t/abort') as any).n).toBe(1);
  });

  it('onValue — 캐시가 있으면 동기적으로 즉시 1회 발화한다', async () => {
    const seed = set(ref(db, 't/live'), { n: 1 });
    await flush(); await seed;   // 자기 쓰기로 캐시가 채워진다

    let syncFired = false;
    let unsub: (() => void) | null = null;
    unsub = onValue(ref(db, 't/live'), () => {
      if (unsub === null) syncFired = true;   // 아직 대입 전 = 동기 발화
    });
    expect(syncFired).toBe(true);
    unsub!();
  });

  it('onValue — 값이 안 바뀌면 재발화하지 않는다', async () => {
    const seed = set(ref(db, 't/quiet'), { n: 1 });
    await flush(); await seed;

    let calls = 0;
    const unsub = onValue(ref(db, 't/quiet'), () => { calls++; });
    await flush();
    const before = calls;

    const same = set(ref(db, 't/quiet'), { n: 1 });   // 같은 값 재기록
    await flush(); await same;
    expect(calls).toBe(before);

    const diff = set(ref(db, 't/quiet'), { n: 2 });
    await flush(); await diff;
    expect(calls).toBe(before + 1);
    unsub();
  });

  it('query — orderByChild + equalTo / startAt / endAt', async () => {
    const p = set(ref(db, 'rooms'), {
      r1: { status: 'waiting', createdAt: 100 },
      r2: { status: 'playing', createdAt: 200 },
      r3: { status: 'waiting', createdAt: 300 },
    });
    await flush(); await p;

    const q1 = get(query(ref(db, 'rooms'), orderByChild('status'), equalTo('waiting')));
    await flush(); const s1 = await q1;
    const got: string[] = [];
    s1.forEach(c => { got.push(c.key!); });
    expect(got.sort()).toEqual(['r1', 'r3']);

    const q2 = get(query(ref(db, 'rooms'), orderByChild('createdAt'), endAt(150)));
    await flush(); const s2 = await q2;
    const old: string[] = [];
    s2.forEach(c => { old.push(c.key!); });
    expect(old).toEqual(['r1']);

    const q3 = get(query(ref(db, 'rooms'), orderByChild('createdAt'), startAt(250)));
    await flush(); const s3 = await q3;
    const recent: string[] = [];
    s3.forEach(c => { recent.push(c.key!); });
    expect(recent).toEqual(['r3']);
  });

  it('push — 정렬 가능한 고유 키를 만든다', async () => {
    const a = push(ref(db, 'list')).key!;
    const b = push(ref(db, 'list')).key!;
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });

  it('remove — 노드와 빈 부모가 함께 사라진다', async () => {
    const p = set(ref(db, 'x/y/z'), { v: 1 });
    await flush(); await p;
    const r = remove(ref(db, 'x/y/z'));
    await flush(); await r;
    expect(readServer('x/y/z')).toBeNull();
    expect(readServer('x/y')).toBeNull();
    expect(readServer('x')).toBeNull();
  });

  it('onDisconnect — 끊김 시 서버가 대신 적용한다', async () => {
    const hook = onDisconnect(ref(db, 'presence/room/u1')).set({ online: false });
    await hook;
    const p = set(ref(db, 'presence/room/u1'), { online: true });
    await flush(); await p;
    expect((readServer('presence/room/u1') as any).online).toBe(true);

    simDisconnect('default');
    expect((readServer('presence/room/u1') as any).online).toBe(false);
    simReconnect('default');
  });

  it('오프라인 쓰기는 큐에 쌓였다가 재연결 때 나간다', async () => {
    simDisconnect('default');
    const p = set(ref(db, 't/queued'), { n: 7 });
    await flush(500);
    expect(readServer('t/queued')).toBeNull();

    simReconnect('default');
    await flush(); await p;
    expect((readServer('t/queued') as any).n).toBe(7);
  });
});
