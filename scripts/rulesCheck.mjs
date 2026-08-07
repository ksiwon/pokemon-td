// RTDB 보안 규칙 행위 테스트 — 에뮬레이터에 실제로 붙어서 QuizRoomService가 하는 쓰기를
// 그대로 재현한다. "규칙이 로드된다"가 아니라 "게임 흐름이 규칙을 통과한다"를 확인한다.
import { initializeApp } from 'firebase/app';
import {
  getDatabase, connectDatabaseEmulator, ref, set, update, remove, get, serverTimestamp,
} from 'firebase/database';

const EMU_HOST = '127.0.0.1';
const EMU_PORT = Number(process.env.RULES_DB_PORT || 9166);
// ⚠️ databaseURL은 **운영 형식**이어야 한다. 여기에 에뮬레이터 주소(http://127.0.0.1:port)를
//    바로 넣으면 SDK가 "이미 에뮬레이터"로 보고 connectDatabaseEmulator의 mockUserToken을
//    무시한 채 **인증 없이** 붙는다. RTDB 에뮬레이터는 토큰 없는 연결을 관리자로 취급하므로
//    규칙이 통째로 우회되고, 모든 "차단되어야 함" 케이스가 조용히 통과한다.
const DB_URL = 'https://demo-rulecheck-default-rtdb.firebaseio.com';

const mkDb = (name, uid) => {
  const app = initializeApp({ projectId: 'demo-rulecheck', databaseURL: DB_URL }, name);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, EMU_HOST, EMU_PORT, { mockUserToken: { sub: uid, user_id: uid } });
  return db;
};

const HOST = 'uid_host', P2 = 'uid_p2', P3 = 'uid_p3';
const hostDb = mkDb('host', HOST);
const p2Db = mkDb('p2', P2);
const p3Db = mkDb('p3', P3);

let pass = 0, fail = 0;
const results = [];
async function expect(label, shouldAllow, fn) {
  let ok, err = '';
  try { await fn(); ok = shouldAllow; if (!shouldAllow) err = '허용되면 안 되는데 통과함'; }
  catch (e) { ok = !shouldAllow; err = ok ? '' : String(e.message || e).slice(0, 120); }
  if (ok) { pass++; results.push(`  PASS  ${shouldAllow ? '허용' : '차단'}  ${label}`); }
  else { fail++; results.push(`  FAIL  ${shouldAllow ? '허용되어야' : '차단되어야'}  ${label}  ← ${err}`); }
}

const R = 'room1';
const player = (uid, name) => ({ userId: uid, name, score: 0, correct: 0, joinedAt: Date.now() });
const room = (createdAt = Date.now()) => ({
  id: R, hostId: HOST, hostName: 'Host', createdAt, status: 'waiting', phase: 'lobby',
  config: { rounds: 10, seconds: 15 },
  memberIds: { [HOST]: true },
  players: { [HOST]: player(HOST, 'Host') },
});

// ── 자기검증: 규칙이 정말 켜져 있는지 먼저 확인한다 ──────────────────────────
// 이게 없으면 "관리자로 붙어서 전부 통과" 상태를 "전부 안전"으로 오독한다(실제로 한 번 겪음).
try {
  await set(ref(hostDb, 'definitelyNotARule/x'), 1);
  console.error('\n[치명] 규칙이 적용되지 않은 채 붙었다 — 이 실행 결과는 믿을 수 없다.');
  process.exit(2);
} catch { console.log('사전 확인: 규칙 적용됨(정의되지 않은 경로 쓰기 차단)'); }

console.log('\n─── 방 생성 / 입장 ───');
await expect('호스트가 방 생성', true, () => set(ref(hostDb, `quizRooms/${R}`), room()));
await expect('남이 hostId를 자기 것으로 속여 방 생성', false,
  () => set(ref(p2Db, 'quizRooms/fake'), { ...room(), hostId: HOST, id: 'fake' }));
await expect('참가자가 자기 자리로 입장', true, () => update(ref(p2Db, `quizRooms/${R}`), {
  [`memberIds/${P2}`]: true, [`players/${P2}`]: player(P2, 'P2'),
}));
await expect('참가자가 남의 자리를 만듦', false,
  () => set(ref(p2Db, `quizRooms/${R}/players/${P3}`), player(P3, 'P3')));
await expect('참가자가 score 0이 아닌 상태로 입장', false,
  () => set(ref(p3Db, `quizRooms/${R}/players/${P3}`), { ...player(P3, 'P3'), score: 9999 }));
await expect('참가자가 자기 score를 직접 수정', false,
  () => set(ref(p2Db, `quizRooms/${R}/players/${P2}/score`), 9999));
await expect('참가자가 방 config를 조작', false,
  () => set(ref(p2Db, `quizRooms/${R}/config/rounds`), 1));
await expect('참가자가 방 목록 읽기', true, () => get(ref(p2Db, 'quizRooms')));

console.log('\n─── 진행(호스트 권위) ───');
await expect('호스트가 게임 시작', true,
  () => update(ref(hostDb, `quizRooms/${R}`), { status: 'playing', phase: 'question' }));
await expect('참가자가 게임 시작', false,
  () => update(ref(p2Db, `quizRooms/${R}`), { status: 'playing', phase: 'question' }));

const startedAt = Date.now();
await expect('호스트가 문제 방송(+ 전원 answered 초기화)', true, () => {
  const patch = { phase: 'question', round: { index: 0, startedAt, endsAt: startedAt + 15000, payload: { kind: 'silhouette', imageUrl: 'x', silhouette: true } } };
  for (const uid of [HOST, P2]) patch[`players/${uid}/answered`] = null;
  return update(ref(hostDb, `quizRooms/${R}`), patch);
});
await expect('참가자가 문제를 위조', false,
  () => set(ref(p2Db, `quizRooms/${R}/round/payload/kind`), 'cry'));

console.log('\n─── 답 제출 / 정답 은닉 ───');
await expect('참가자가 serverTimestamp로 답 제출', true,
  () => set(ref(p2Db, `quizAnswers/${R}/${P2}`), { text: '피카츄', at: serverTimestamp() }));
await expect('참가자가 answered 표시', true,
  () => set(ref(p2Db, `quizRooms/${R}/players/${P2}/answered`), true));
await expect('참가자가 제출 시각을 앞당겨 위조', false,
  () => set(ref(p2Db, `quizAnswers/${R}/${P2}`), { text: '피카츄', at: startedAt - 60000 }));
await expect('참가자가 남의 답을 읽음(베끼기)', false, () => get(ref(p2Db, `quizAnswers/${R}`)));
await expect('참가자가 남의 답 노드를 직접 읽음', false, () => get(ref(p2Db, `quizAnswers/${R}/${HOST}`)));
await expect('참가자가 자기 답은 읽음', true, () => get(ref(p2Db, `quizAnswers/${R}/${P2}`)));
await expect('호스트가 전체 답 읽기(채점)', true, () => get(ref(hostDb, `quizAnswers/${R}`)));
await expect('참가자가 남의 답을 덮어씀', false,
  () => set(ref(p2Db, `quizAnswers/${R}/${P3}`), { text: 'x', at: serverTimestamp() }));
await expect('60자 초과 답 제출', false,
  () => set(ref(p2Db, `quizAnswers/${R}/${P2}`), { text: 'a'.repeat(61), at: serverTimestamp() }));

console.log('\n─── 정답 공개 / 종료 ───');
await expect('호스트가 채점 결과 방송', true, () => update(ref(hostDb, `quizRooms/${R}`), {
  phase: 'reveal',
  'round/reveal': { title: '피카츄', imageUrl: 'x' },
  'round/results': { [P2]: { ok: true, ms: 1200, points: 142, order: 1 }, [HOST]: { ok: false, points: 0, order: 0 } },
  [`players/${P2}/score`]: 142, [`players/${P2}/correct`]: 1,
}));
await expect('호스트가 다음 문제로(지난 답안 폐기)', true, () => remove(ref(hostDb, `quizAnswers/${R}`)));
await expect('참가자가 점수 갱신 후 자기 자리를 지웠다 되만듦(점수 세탁)', false, async () => {
  await remove(ref(p2Db, `quizRooms/${R}/players/${P2}`));
  await set(ref(p2Db, `quizRooms/${R}/players/${P2}`), { ...player(P2, 'P2'), score: 99999 });
});
await expect('참가자가 자리 복구(score 0)', true,
  () => set(ref(p2Db, `quizRooms/${R}/players/${P2}`), player(P2, 'P2')));
await expect('호스트가 게임 종료', true,
  () => update(ref(hostDb, `quizRooms/${R}`), { status: 'finished', phase: 'done' }));

console.log('\n─── 호스트 이탈 / 정리 ───');
await expect('호스트가 살아 있는데 참가자가 강제 종료', false,
  () => set(ref(p2Db, `quizRooms/${R}/status`), 'finished'));
await expect('호스트가 방을 떠남', true, () => remove(ref(hostDb, `quizRooms/${R}/players/${HOST}`)));
await expect('호스트가 사라지면 참가자가 강제 종료', true,
  () => set(ref(p2Db, `quizRooms/${R}/status`), 'finished'));
await expect('참가자가 방 노드를 통째로 삭제', false, () => remove(ref(p2Db, `quizRooms/${R}`)));
await expect('호스트가 방 삭제', true, () => remove(ref(hostDb, `quizRooms/${R}`)));

console.log('\n─── 비밀번호 방 ───');
// 방 노드에는 hasPass 플래그만 두고, 해시는 읽기가 막힌 quizRoomSecrets에 둔다.
// 규칙은 클라이언트가 읽을 수 없는 데이터도 참조할 수 있으므로, 입장권 검증이 서버에서 끝난다.
const PR = 'passroom';
const RIGHT = 'hash-of-correct-password';
const WRONG = 'hash-of-wrong-password';
const passRoom = { ...room(), id: PR, config: { rounds: 10, seconds: 15, hasPass: true } };
await expect('호스트가 비밀번호 방 생성', true, () => set(ref(hostDb, `quizRooms/${PR}`), passRoom));
await expect('해시 설정 전에는 아무도 입장 불가(잠긴 채 시작)', false,
  () => set(ref(p2Db, `quizRooms/${PR}/players/${P2}`), player(P2, 'P2')));
await expect('호스트가 비밀번호 해시 등록', true,
  () => set(ref(hostDb, `quizRoomSecrets/${PR}/hash`), RIGHT));
await expect('참가자가 방 해시를 훔쳐봄', false, () => get(ref(p2Db, `quizRoomSecrets/${PR}/hash`)));
await expect('참가자가 입장권 전체를 훔쳐봄', false, () => get(ref(p2Db, `quizRoomSecrets/${PR}/joins`)));
await expect('틀린 비밀번호로 입장권 발급', false,
  () => set(ref(p2Db, `quizRoomSecrets/${PR}/joins/${P2}`), WRONG));
await expect('입장권 없이 방 입장', false,
  () => set(ref(p2Db, `quizRooms/${PR}/players/${P2}`), player(P2, 'P2')));
await expect('맞는 비밀번호로 입장권 발급', true,
  () => set(ref(p2Db, `quizRoomSecrets/${PR}/joins/${P2}`), RIGHT));
await expect('입장권으로 방 입장', true,
  () => set(ref(p2Db, `quizRooms/${PR}/players/${P2}`), player(P2, 'P2')));
await expect('남의 입장권을 대신 발급', false,
  () => set(ref(p3Db, `quizRoomSecrets/${PR}/joins/${P2}`), RIGHT));
await expect('비밀번호 모르는 제3자는 여전히 입장 불가', false,
  () => set(ref(p3Db, `quizRooms/${PR}/players/${P3}`), player(P3, 'P3')));
await expect('비밀번호 방에서도 자기 자리 삭제는 가능', true,
  () => remove(ref(p2Db, `quizRooms/${PR}/players/${P2}`)));
await expect('호스트가 비밀번호 방 정리', true, () => remove(ref(hostDb, `quizRooms/${PR}`)));
await expect('방이 사라지면 고아 비밀 노드 삭제', true, () => remove(ref(p2Db, `quizRoomSecrets/${PR}`)));

const OLD = 'oldroom';
await expect('만료된 방 준비(호스트가 생성)', true,
  () => set(ref(hostDb, `quizRooms/${OLD}`), { ...room(Date.now() - 2 * 3600 * 1000), id: OLD }));
await expect('만료된 방은 아무나 삭제(고아 회수)', true, () => remove(ref(p2Db, `quizRooms/${OLD}`)));
await expect('없는 방의 답안 노드에 쓰레기 주입(용량 부풀리기)', false,
  () => set(ref(p2Db, 'quizAnswers/ghost'), { [P2]: { text: 'x', at: serverTimestamp() } }));
await expect('없는 방의 고아 답안 삭제', true, () => remove(ref(p2Db, 'quizAnswers/ghost')));

console.log('\n' + results.join('\n'));
console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
