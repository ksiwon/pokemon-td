// sim/net/rtdb.ts
// ────────────────────────────────────────────────────────────────────────────
// 인메모리 Firebase Realtime Database — `firebase/database` 모듈 자리를 그대로 대체한다
// (vitest.sim.config.ts 의 alias). MultiplayerService 를 **고치지 않고** 실코드 그대로
// 돌리기 위한 것이므로, 흉내가 아니라 RTDB의 관측 가능한 규칙을 재현하는 게 목적이다.
//
// 재현하는 RTDB 규칙 (전부 실제로 게임 버그를 만든 적 있는 것들):
//   1. null 프루닝 — 값이 null이면 키가 사라진다. 빈 배열/빈 객체를 쓰면 **노드가 삭제**된다.
//      → `rankings: []`, `battleResults: []`, `encounterRecord: {}` 는 저장 후 읽으면 undefined.
//   2. 배열↔객체 강제 — 저장은 항상 객체(숫자 키). 읽을 때 "키가 전부 정수 + 0..max 중
//      절반 초과가 존재"면 배열로 복원, 아니면 객체. → players 가 sparse 해지면 객체가 된다
//      (MultiplayerService.normalizePlayers 가 존재하는 이유).
//   3. undefined 거부 — 쓰기 페이로드에 undefined 가 있으면 SDK가 던진다.
//   4. runTransaction 낙관적 재시도 — 업데이터는 **로컬 캐시**(없으면 null)로 먼저 호출되고,
//      서버 값이 다르면 서버 값으로 다시 호출된다. 즉 업데이터는 여러 번 실행되며,
//      중단된 시도의 부수효과(바깥 변수 대입)는 그대로 남는다.
//   5. onValue 는 로컬 캐시가 있으면 **동기적으로** 즉시 1회 발화한다
//      (GameLayout/BattlePhaseUI 의 [LEAK-FIX] 주석이 가리키는 그 동작).
//   6. 오프라인 큐 — 끊긴 동안의 쓰기는 큐에 쌓였다가 재연결 때 나간다. onDisconnect 훅은
//      끊김이 감지될 때 서버가 대신 적용한다.
//
// 재현하지 않는 것 (알고 빼는 것 — 결론을 여기까지만 믿을 것):
//   - 로컬 낙관적 반영(applyLocally): 실 SDK는 트랜잭션 잠정값으로 로컬 리스너를 먼저 때리고
//     서버가 거절하면 되돌린다. 여기선 서버 확정 후에만 알린다. "잠깐 보였다 사라지는 상태"에
//     반응하는 버그는 이 하네스로 못 잡는다.
//   - 보안 룰(database.rules.json). 권한 거부 경로는 검증 대상이 아니다.
//   - 대역폭/쿼터. QuotaGuard 계열은 별도.
//
// 시간: 전부 globalThis.setTimeout 을 쓴다 → vitest fake timers 로 제어된다.
// 세계(데이터/리스너/클라이언트)는 globalThis 에 둔다 — 클라이언트마다 vi.resetModules() 로
// 모듈 그래프를 새로 만들기 때문에, 모듈 스코프에 두면 클라이언트끼리 DB가 갈라진다.

export type Json = null | boolean | number | string | JsonObject | Json[];
interface JsonObject { [k: string]: Json }

// ─── 세계 ───────────────────────────────────────────────────────────────────

interface ClientState {
  id: string;
  online: boolean;
  /** 편도 지연(ms). 왕복은 2배. */
  latencyMs: number;
  /** 서버 시각 - 클라 시각. .info/serverTimeOffset 으로 노출된다. */
  clockSkewMs: number;
  /**
   * 로컬 캐시. 실 SDK 와 마찬가지로 **경로별 값이 아니라 트리**다 — 이게 중요하다.
   * 로비에서 `rooms` 를 쿼리 구독하면 `rooms/{id}` 트랜잭션의 첫 시도 입력이 null 이 아니라
   * 그 방 데이터가 된다. 경로별 맵으로 모델링하면 joinRoom 이 "Room not found"로 즉사한다
   * (실제로 이 하네스를 만들면서 그렇게 틀렸다).
   */
  tree: Json;
  /** 완전한 데이터를 확보한 경로들. 조상이 covered 면 자손도 covered. */
  covered: Set<string>;
  /** 재연결 시 흘려보낼 작업들. */
  offlineQueue: Array<() => void>;
  disconnectHooks: Map<string, Json>;
}

interface ListenerRec {
  clientId: string;
  path: string;
  constraints: Constraint[];
  cb: (snap: DataSnapshot) => void;
  /** 마지막으로 전달한 값의 직렬화 — 변경 없을 때 재발화하지 않기 위해. */
  lastSerialized: string | undefined;
  alive: boolean;
}

interface World {
  root: Json;
  versions: Map<string, number>;
  seq: number;
  pushSeq: number;
  listeners: Set<ListenerRec>;
  clients: Map<string, ClientState>;
  /** 계측: 경로별 읽기/쓰기 횟수. 프리티어 비용 논의에 쓸 수 있다. */
  stats: { reads: number; writes: number; txnAttempts: number; txnRetries: number };
}

const G = globalThis as any;

function makeWorld(): World {
  return {
    root: null,
    versions: new Map(),
    seq: 0,
    pushSeq: 0,
    listeners: new Set(),
    clients: new Map(),
    stats: { reads: 0, writes: 0, txnAttempts: 0, txnRetries: 0 },
  };
}

function world(): World {
  if (!G.__SIM_RTDB_WORLD) G.__SIM_RTDB_WORLD = makeWorld();
  return G.__SIM_RTDB_WORLD as World;
}

/** 새 시나리오 시작 — 데이터/리스너/클라이언트 전부 초기화. */
export function resetWorld(): void {
  G.__SIM_RTDB_WORLD = makeWorld();
}

export function worldStats() { return { ...world().stats }; }

export function registerClient(
  id: string,
  opts?: { latencyMs?: number; clockSkewMs?: number }
): void {
  const w = world();
  w.clients.set(id, {
    id,
    online: true,
    latencyMs: opts?.latencyMs ?? 20,
    clockSkewMs: opts?.clockSkewMs ?? 0,
    tree: null,
    covered: new Set(),
    offlineQueue: [],
    disconnectHooks: new Map(),
  });
}

function clientState(id: string): ClientState {
  const w = world();
  let c = w.clients.get(id);
  if (!c) { registerClient(id); c = w.clients.get(id)!; }
  return c;
}

/** 이 모듈 인스턴스를 소유한 클라이언트. import 시점에 고정된다. */
const MY_CLIENT_ID: string = G.__SIM_CLIENT_ID ?? 'default';

export function myClientId(): string { return MY_CLIENT_ID; }

/** 클라이언트 소켓 끊김 — onDisconnect 훅이 서버에서 적용되고, 이후 쓰기는 큐에 쌓인다. */
export function simDisconnect(clientId: string): void {
  const c = clientState(clientId);
  if (!c.online) return;
  c.online = false;
  for (const [path, val] of c.disconnectHooks) {
    applyWrite(path, val, 'set');
  }
  c.disconnectHooks.clear();
  notifyInfo(clientId);
}

export function simReconnect(clientId: string): void {
  const c = clientState(clientId);
  if (c.online) return;
  c.online = true;
  const q = c.offlineQueue.splice(0);
  for (const fn of q) fn();
  notifyInfo(clientId);
  // 재연결 시 구독 중인 경로를 서버 최신값으로 다시 채운다(실 SDK 동작).
  for (const l of world().listeners) {
    if (l.clientId === clientId && l.alive) deliverIfChanged(l, true);
  }
}

export function setClientLatency(clientId: string, latencyMs: number): void {
  clientState(clientId).latencyMs = latencyMs;
}

// ─── 경로/값 유틸 ────────────────────────────────────────────────────────────

function segs(path: string): string[] {
  return path.split('/').filter(s => s.length > 0);
}
function joinPath(parts: string[]): string { return parts.join('/'); }

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 쓰기 페이로드 검증 + 저장 형태(객체 트리, null 프루닝)로 변환. */
function sanitize(value: any, path: string, now: number): Json {
  if (value === undefined) {
    throw new Error(`set failed: value argument contains undefined in property '${path}'`);
  }
  if (value === null) return null;
  const t = typeof value;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new Error(`set failed: value argument contains an invalid value (${t}) in property '${path}'`);
  }
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`set failed: value argument contains ${value} in property '${path}'`);
    }
    return value;
  }
  if (t === 'boolean' || t === 'string') return value;

  // serverTimestamp 센티널
  if (isPlainObject(value) && value['.sv'] === 'timestamp') return now;

  const out: JsonObject = {};
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      const s = sanitize(v, `${path}/${i}`, now);
      if (s !== null) out[String(i)] = s;
    });
  } else {
    for (const k of Object.keys(value)) {
      const s = sanitize(value[k], `${path}/${k}`, now);
      if (s !== null) out[k] = s;
    }
  }
  // 빈 객체 = 데이터 없음 = 노드 삭제
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * 저장 형태 → 읽기 형태. 실 SDK 규칙:
 *   키가 전부 정수이고, 0..max 사이 키 중 절반 초과가 존재하면 배열로 복원.
 */
function materialize(node: Json): Json {
  if (!isPlainObject(node)) return node;
  const obj = node as JsonObject;
  const keys = Object.keys(obj);
  const allInt = keys.length > 0 && keys.every(k => /^(0|[1-9]\d*)$/.test(k));
  if (allInt) {
    const nums = keys.map(Number);
    const max = Math.max(...nums);
    if (keys.length * 2 > max + 1) {
      const arr: Json[] = new Array(max + 1).fill(null);
      for (const k of keys) arr[Number(k)] = materialize(obj[k]);
      return arr as Json;
    }
  }
  const out: JsonObject = {};
  for (const k of keys) out[k] = materialize(obj[k]);
  return out;
}

function readRaw(path: string): Json {
  let cur: Json = world().root;
  for (const s of segs(path)) {
    if (!isPlainObject(cur)) return null;
    cur = (cur as JsonObject)[s] ?? null;
  }
  return cur;
}

export function readServer(path: string): Json {
  return materialize(readRaw(path));
}

function versionOf(path: string): number {
  return world().versions.get(normalize(path)) ?? 0;
}

function normalize(path: string): string { return joinPath(segs(path)); }

/** 쓰기 반영 + 영향 노드 버전 증가. mode='set' 은 통째 교체, 'merge' 는 자식 병합. */
function applyWrite(path: string, sanitized: Json, mode: 'set' | 'merge'): void {
  const w = world();
  w.stats.writes++;
  const p = segs(path);

  if (mode === 'merge' && isPlainObject(sanitized)) {
    // update(): 지정한 자식 키만 교체. 이 경로 자체는 남는다.
    for (const [k, v] of Object.entries(sanitized as JsonObject)) {
      applyWrite(joinPath([...p, ...segs(k)]), v, 'set');
    }
    return;
  }
  if (mode === 'merge' && sanitized === null) return; // update({}) — 변화 없음

  // set
  if (p.length === 0) {
    w.root = sanitized;
  } else {
    let cur = w.root;
    if (!isPlainObject(cur)) { cur = {}; w.root = cur; }
    for (let i = 0; i < p.length - 1; i++) {
      const o = cur as JsonObject;
      if (!isPlainObject(o[p[i]])) o[p[i]] = {};
      cur = o[p[i]];
    }
    const parent = cur as JsonObject;
    const leaf = p[p.length - 1];
    if (sanitized === null) delete parent[leaf];
    else parent[leaf] = sanitized;
  }

  // 빈 부모 정리 (RTDB: 자식이 없으면 부모도 사라진다)
  for (let i = p.length - 1; i >= 1; i--) {
    const parentPath = joinPath(p.slice(0, i));
    const node = readRaw(parentPath);
    if (isPlainObject(node) && Object.keys(node as JsonObject).length === 0) {
      applyWriteBare(parentPath, null);
    }
  }

  // 버전: 이 경로 + 모든 조상
  for (let i = p.length; i >= 0; i--) {
    const anc = joinPath(p.slice(0, i));
    w.versions.set(anc, ++w.seq);
  }
  notifyAll();
}

/** 버전 증가/알림 없이 노드만 지우는 내부 헬퍼(빈 부모 정리용). */
function applyWriteBare(path: string, value: Json): void {
  const p = segs(path);
  if (p.length === 0) { world().root = value; return; }
  let cur = world().root;
  for (let i = 0; i < p.length - 1; i++) {
    if (!isPlainObject(cur)) return;
    cur = (cur as JsonObject)[p[i]];
  }
  if (!isPlainObject(cur)) return;
  if (value === null) delete (cur as JsonObject)[p[p.length - 1]];
  else (cur as JsonObject)[p[p.length - 1]] = value;
}

// ─── 클라이언트 로컬 캐시 트리 ───────────────────────────────────────────────

/** 서버가 준 (materialize 된) 값을 저장 형태로 되돌려 트리에 심는다. */
function cacheWrite(c: ClientState, path: string, value: Json): void {
  const stored = value === null ? null : sanitize(value, path, 0);
  const p = segs(path);
  if (p.length === 0) { c.tree = stored; c.covered.add(''); return; }
  if (!isPlainObject(c.tree)) c.tree = {};
  let cur = c.tree as JsonObject;
  for (let i = 0; i < p.length - 1; i++) {
    if (!isPlainObject(cur[p[i]])) cur[p[i]] = {};
    cur = cur[p[i]] as JsonObject;
  }
  const leaf = p[p.length - 1];
  if (stored === null) delete cur[leaf];
  else cur[leaf] = stored;
  c.covered.add(normalize(path));
}

/** 쿼리 결과는 필터된 자식만 온다 — 형제를 지우지 않도록 자식 단위로 병합한다. */
function cacheWriteChildren(c: ClientState, path: string, value: Json): void {
  if (!isPlainObject(value)) return;
  for (const [k, v] of Object.entries(value as JsonObject)) {
    cacheWrite(c, joinPath([...segs(path), k]), v);
  }
}

function cacheRead(c: ClientState, path: string): Json {
  let cur: Json = c.tree;
  for (const s of segs(path)) {
    if (!isPlainObject(cur)) return null;
    cur = (cur as JsonObject)[s] ?? null;
  }
  return materialize(cur);
}

function cacheCovered(c: ClientState, path: string): boolean {
  const p = segs(path);
  for (let i = 0; i <= p.length; i++) {
    if (c.covered.has(joinPath(p.slice(0, i)))) return true;
  }
  return false;
}

/** 키 순서에 흔들리지 않는 값 비교 — 트랜잭션의 "내가 본 값 == 서버 값" 판정용. */
function canon(v: Json): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const keys = Object.keys(v as JsonObject).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canon((v as JsonObject)[k])}`).join(',')}}`;
}

// ─── 지연 모델 ───────────────────────────────────────────────────────────────

function later(ms: number, fn: () => void): void {
  if (ms <= 0) { Promise.resolve().then(fn); return; }
  setTimeout(fn, ms);
}

/** 클라 → 서버 → 클라 왕복. 서버 작업은 중간 시점에 실행된다. */
function roundTrip<T>(clientId: string, serverFn: () => T): Promise<T> {
  const c = clientState(clientId);
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      later(c.latencyMs, () => {
        let out: T; let err: unknown;
        try { out = serverFn(); } catch (e) { err = e; }
        later(c.latencyMs, () => { if (err) reject(err); else resolve(out!); });
      });
    };
    if (!c.online) c.offlineQueue.push(run);
    else run();
  });
}

// ─── 스냅샷 ─────────────────────────────────────────────────────────────────

export class DataSnapshot {
  constructor(
    readonly key: string | null,
    private readonly _value: Json,
    private readonly _childOrder: string[] | null = null,
  ) {}
  exists(): boolean { return this._value !== null && this._value !== undefined; }
  val(): any { return this._value; }
  child(k: string): DataSnapshot {
    const v = isPlainObject(this._value) ? ((this._value as JsonObject)[k] ?? null) : null;
    return new DataSnapshot(k, v);
  }
  forEach(cb: (child: DataSnapshot) => boolean | void): boolean {
    const v = this._value;
    if (v === null || typeof v !== 'object') return false;
    const keys = this._childOrder ?? defaultChildOrder(v);
    for (const k of keys) {
      const cv = Array.isArray(v) ? (v as Json[])[Number(k)] : (v as JsonObject)[k];
      if (cv === undefined || cv === null) continue;
      if (cb(new DataSnapshot(k, cv)) === true) return true;
    }
    return false;
  }
}

function defaultChildOrder(v: Json): string[] {
  if (Array.isArray(v)) return v.map((_, i) => String(i));
  const keys = Object.keys(v as JsonObject);
  // RTDB: 정수 키가 먼저(수치 오름차순), 그다음 나머지 키(사전순)
  const ints = keys.filter(k => /^(0|[1-9]\d*)$/.test(k)).sort((a, b) => Number(a) - Number(b));
  const rest = keys.filter(k => !/^(0|[1-9]\d*)$/.test(k)).sort();
  return [...ints, ...rest];
}

// ─── 참조 / 쿼리 ─────────────────────────────────────────────────────────────

export interface Database { readonly __sim: true }

export class Reference {
  constructor(readonly path: string) {}
  get key(): string | null {
    const s = segs(this.path);
    return s.length ? s[s.length - 1] : null;
  }
  get constraints(): Constraint[] { return []; }
}

type Constraint =
  | { kind: 'orderByChild'; child: string }
  | { kind: 'orderByKey' }
  | { kind: 'equalTo'; value: Json }
  | { kind: 'startAt'; value: Json }
  | { kind: 'endAt'; value: Json };

export class QueryRef {
  constructor(readonly path: string, readonly constraints: Constraint[]) {}
  get key(): string | null {
    const s = segs(this.path);
    return s.length ? s[s.length - 1] : null;
  }
}

type AnyRef = Reference | QueryRef;

export function getDatabase(_app?: unknown): Database {
  return { __sim: true } as Database;
}

export function ref(_db: unknown, path = ''): Reference {
  return new Reference(normalize(path));
}

export function query(base: AnyRef, ...cs: Constraint[]): QueryRef {
  return new QueryRef(base.path, [...(base as any).constraints ?? [], ...cs]);
}

export function orderByChild(child: string): Constraint { return { kind: 'orderByChild', child }; }
export function orderByKey(): Constraint { return { kind: 'orderByKey' }; }
export function equalTo(value: Json): Constraint { return { kind: 'equalTo', value }; }
export function startAt(value: Json): Constraint { return { kind: 'startAt', value }; }
export function endAt(value: Json): Constraint { return { kind: 'endAt', value }; }

export function serverTimestamp(): Json { return { '.sv': 'timestamp' } as Json; }

function cmp(a: Json, b: Json): number {
  const rank = (v: Json) => v === null ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'number' ? 2 : typeof v === 'string' ? 3 : 4;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}

/** 쿼리 제약을 적용한 (값, 자식순서) 계산. */
function evaluate(path: string, constraints: Constraint[]): { value: Json; order: string[] | null } {
  const raw = readRaw(path);
  if (constraints.length === 0) return { value: materialize(raw), order: null };
  if (!isPlainObject(raw)) return { value: materialize(raw), order: null };

  const obj = raw as JsonObject;
  const orderBy = constraints.find(c => c.kind === 'orderByChild') as { kind: 'orderByChild'; child: string } | undefined;
  const keyOf = (k: string): Json => {
    if (!orderBy) return k;
    const child = obj[k];
    return isPlainObject(child) ? ((child as JsonObject)[orderBy.child] ?? null) : null;
  };

  let keys = Object.keys(obj);
  for (const c of constraints) {
    if (c.kind === 'equalTo') keys = keys.filter(k => cmp(keyOf(k), c.value) === 0);
    else if (c.kind === 'startAt') keys = keys.filter(k => cmp(keyOf(k), c.value) >= 0);
    else if (c.kind === 'endAt') keys = keys.filter(k => cmp(keyOf(k), c.value) <= 0);
  }
  keys.sort((a, b) => {
    const d = cmp(keyOf(a), keyOf(b));
    return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
  });

  if (keys.length === 0) return { value: null, order: [] };
  const out: JsonObject = {};
  for (const k of keys) out[k] = materialize(obj[k]);
  return { value: out, order: keys };
}

// ─── .info 특수 경로 ─────────────────────────────────────────────────────────

function isInfoPath(path: string): boolean { return path.startsWith('.info'); }

function infoValue(clientId: string, path: string): Json {
  const c = clientState(clientId);
  if (path === '.info/connected') return c.online;
  if (path === '.info/serverTimeOffset') return c.clockSkewMs;
  return null;
}

function notifyInfo(clientId: string): void {
  for (const l of world().listeners) {
    if (l.clientId !== clientId || !l.alive || !isInfoPath(l.path)) continue;
    const v = infoValue(clientId, l.path);
    const ser = JSON.stringify(v);
    if (ser === l.lastSerialized) continue;
    l.lastSerialized = ser;
    l.cb(new DataSnapshot(l.path.split('/').pop() ?? null, v));
  }
}

// ─── 리스너 ─────────────────────────────────────────────────────────────────

function deliverIfChanged(l: ListenerRec, force = false): void {
  if (!l.alive) return;
  const c = clientState(l.clientId);
  const { value, order } = evaluate(l.path, l.constraints);
  const ser = JSON.stringify(value ?? null);
  if (!force && ser === l.lastSerialized) return;

  const send = () => {
    if (!l.alive) return;
    if (ser === l.lastSerialized && !force) return;
    l.lastSerialized = ser;
    if (l.constraints.length === 0) cacheWrite(c, l.path, value);
    else cacheWriteChildren(c, l.path, value);
    l.cb(new DataSnapshot(new Reference(l.path).key, value, order));
  };
  if (!c.online) { c.offlineQueue.push(send); return; }
  later(c.latencyMs, send);
}

function notifyAll(): void {
  for (const l of [...world().listeners]) {
    if (!isInfoPath(l.path)) deliverIfChanged(l);
  }
}

export type Unsubscribe = () => void;

export function onValue(
  target: AnyRef,
  cb: (snap: DataSnapshot) => void,
  _errCb?: (e: Error) => void,
): Unsubscribe {
  const path = target.path;
  const constraints = (target as any).constraints ?? [];
  const clientId = MY_CLIENT_ID;
  const c = clientState(clientId);

  const rec: ListenerRec = { clientId, path, constraints, cb, lastSerialized: undefined, alive: true };
  world().listeners.add(rec);

  if (isInfoPath(path)) {
    // .info 는 로컬 상태 — 즉시 동기 발화
    const v = infoValue(clientId, path);
    rec.lastSerialized = JSON.stringify(v);
    cb(new DataSnapshot(path.split('/').pop() ?? null, v));
  } else if (constraints.length === 0 && cacheCovered(c, path)) {
    // [실 SDK] 로컬 캐시가 있으면 **동기적으로** 즉시 1회 발화한다.
    const cached = cacheRead(c, path);
    rec.lastSerialized = JSON.stringify(cached ?? null);
    cb(new DataSnapshot(new Reference(path).key, cached));
    deliverIfChanged(rec); // 서버 최신값이 다르면 뒤이어 한 번 더
  } else {
    deliverIfChanged(rec, true);
  }

  return () => {
    rec.alive = false;
    world().listeners.delete(rec);
  };
}

// ─── 읽기/쓰기 API ───────────────────────────────────────────────────────────

export async function get(target: AnyRef): Promise<DataSnapshot> {
  const path = target.path;
  const constraints = (target as any).constraints ?? [];
  const clientId = MY_CLIENT_ID;
  if (isInfoPath(path)) {
    return new DataSnapshot(path.split('/').pop() ?? null, infoValue(clientId, path));
  }
  return roundTrip(clientId, () => {
    world().stats.reads++;
    const { value, order } = evaluate(path, constraints);
    const c = clientState(clientId);
    if (constraints.length === 0) cacheWrite(c, path, value);
    else cacheWriteChildren(c, path, value);
    return new DataSnapshot(new Reference(path).key, value, order);
  });
}

// ⚠ async 함수가 아니다 — 실 SDK 는 값 검증을 **동기적으로** 수행하고 던진다
//   (undefined 가 섞이면 Promise 거부가 아니라 즉시 throw). 호출부 try/catch 위치가 달라지므로
//   이 차이를 재현해야 실코드의 오류 처리 경로가 그대로 검증된다.
export function set(target: Reference, value: any): Promise<void> {
  const clientId = MY_CLIENT_ID;
  const now = Date.now() + clientState(clientId).clockSkewMs;
  const sanitized = sanitize(value, target.path, now);
  return roundTrip(clientId, () => {
    applyWrite(target.path, sanitized, 'set');
    cacheWrite(clientState(clientId), target.path, readServer(target.path));
  });
}

export function update(target: Reference, values: Record<string, any>): Promise<void> {
  const clientId = MY_CLIENT_ID;
  const now = Date.now() + clientState(clientId).clockSkewMs;
  const sanitized = sanitize(values, target.path, now);
  return roundTrip(clientId, () => {
    applyWrite(target.path, sanitized, 'merge');
    cacheWrite(clientState(clientId), target.path, readServer(target.path));
  });
}

export function remove(target: Reference): Promise<void> {
  const clientId = MY_CLIENT_ID;
  return roundTrip(clientId, () => {
    applyWrite(target.path, null, 'set');
    cacheWrite(clientState(clientId), target.path, null);
  });
}

/** 테스트 전용 — 지연/캐시 없이 서버 상태를 직접 심는다(클라 캐시는 건드리지 않는다). */
export function seedServer(path: string, value: any): void {
  applyWrite(path, sanitize(value, path, Date.now()), 'set');
}

export function push(target: Reference, value?: any): Reference {
  const w = world();
  // 실 RTDB의 push-id 는 시간순 정렬되는 20자. 여기선 결정론 카운터로 대체하되 정렬성은 유지.
  const key = `-SIM${String(++w.pushSeq).padStart(12, '0')}`;
  const child = new Reference(joinPath([...segs(target.path), key]));
  if (value !== undefined) void set(child, value);
  return child;
}

const MAX_TXN_RETRIES = 25;

export async function runTransaction<T>(
  target: Reference,
  updater: (current: any) => any,
): Promise<{ committed: boolean; snapshot: DataSnapshot }> {
  const clientId = MY_CLIENT_ID;
  const c = clientState(clientId);
  const path = target.path;
  const w = world();

  // 실 SDK 는 "내가 본 값"을 함께 보내고 서버가 현재 값과 대조한다(버전 번호가 아니라 값).
  // 캐시가 없으면 본 값은 null → 서버에 데이터가 있으면 불일치 → 서버 값으로 업데이터 재실행.
  let base: Json = cacheCovered(c, path) ? cacheRead(c, path) : null;

  for (let attempt = 0; attempt < MAX_TXN_RETRIES; attempt++) {
    w.stats.txnAttempts++;
    if (attempt > 0) w.stats.txnRetries++;

    const input = base === null ? null : structuredClone(base);
    const out = updater(input);

    // undefined = 트랜잭션 중단
    if (out === undefined) {
      return { committed: false, snapshot: new DataSnapshot(target.key, base) };
    }

    const now = Date.now() + c.clockSkewMs;
    const sanitized = sanitize(out, path, now);
    const expected = canon(base);

    const res = await roundTrip(clientId, () => {
      const cur = readServer(path);
      if (canon(cur) !== expected) {
        return { ok: false as const, value: cur };
      }
      applyWrite(path, sanitized, 'set');
      return { ok: true as const, value: readServer(path) };
    });

    cacheWrite(c, path, res.value);
    if (res.ok) {
      return { committed: true, snapshot: new DataSnapshot(target.key, res.value) };
    }
    base = res.value;
  }
  throw new Error('transaction failed: maxretry');
}

// ─── onDisconnect / 연결 제어 ────────────────────────────────────────────────

export function onDisconnect(target: Reference) {
  const clientId = MY_CLIENT_ID;
  return {
    async set(value: any): Promise<void> {
      const now = Date.now() + clientState(clientId).clockSkewMs;
      clientState(clientId).disconnectHooks.set(target.path, sanitize(value, target.path, now));
    },
    async remove(): Promise<void> {
      clientState(clientId).disconnectHooks.set(target.path, null);
    },
    async update(values: Record<string, any>): Promise<void> {
      const now = Date.now() + clientState(clientId).clockSkewMs;
      clientState(clientId).disconnectHooks.set(target.path, sanitize(values, target.path, now));
    },
    async cancel(): Promise<void> {
      clientState(clientId).disconnectHooks.delete(target.path);
    },
  };
}

export function goOffline(_db?: unknown): void { simDisconnect(MY_CLIENT_ID); }
export function goOnline(_db?: unknown): void { simReconnect(MY_CLIENT_ID); }

// 실제 모듈 표면 맞추기용(사용되지 않지만 import 되면 존재해야 함)
export function child(base: Reference, p: string): Reference {
  return new Reference(joinPath([...segs(base.path), ...segs(p)]));
}
export function increment(delta: number): Json { return delta as Json; }
