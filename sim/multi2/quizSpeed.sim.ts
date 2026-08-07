// sim/multi2/quizSpeed.sim.ts
// 퀴즈 속도전 2인 프로토콜 — QuizRoomService 실코드를 인메모리 RTDB 위에서 그대로 돌린다.
// 실행: npm run sim:2p:quiz
//
// 왜 유닛테스트로는 부족한가: 속도전의 성질은 전부 **두 클라이언트 사이**에 있다.
//   · 정답(accept)은 호스트만 갖고, 참가자에게는 절대 안 보여야 한다
//   · 남의 답안도 안 보여야 한다(답은 방 밖 quizAnswers/{roomId})
//   · 채점 결과만 방송되고, 순위 보너스는 제출 순서대로 붙는다
// 한 클라이언트 안에서는 "안 보여야 하는 것"을 검증할 수가 없다. 그래서 2인 하네스다.
//
// 못 잡는 것(알고 빼는 것): 보안 규칙(database.rules.json)은 이 하네스가 재현하지 않는다.
// "참가자가 남의 answers를 실제로 읽을 수 있는가"의 최종 방어선은 룰이고, 그쪽은
// scripts/rulesCheck.mjs(에뮬레이터)가 본다. 여기서 보는 건 **클라이언트가 그 데이터를
// 애초에 방에 올리지 않는가**다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWorld, readServer } from '../net/rtdb';
import { spawnClient, makeUser, ClientModules } from '../net/clientKit';
import { SPEED_QUIZ_KINDS, speedKindsForLang, SpeedRoundPayload } from '../../src/types/quiz';

const flush = (ms = 500) => vi.advanceTimersByTimeAsync(ms);

/** pushRound 는 이전 문제의 제출 표시를 비우려고 참가자 uid 목록을 받는다. */
const PLAYERS = ['u_host', 'u_guest'];

/**
 * RTDB 호출 하나를 끝까지 진행시킨다.
 * ⚠ 가상 시계라 **호출 → 시계 진행 → await** 순서를 지켜야 한다. `await 호출()` 을 먼저 하면
 *   타이머가 영영 안 돌아 프로미스가 settle되지 않고 테스트가 통째로 멈춘다(실제로 겪었다).
 */
async function run<T>(p: Promise<T>, ms = 500): Promise<T> {
  await flush(ms);
  return p;
}

/** 실제 UI의 t() 대역 — 키를 그대로 돌려주면 문자열 조립 경로가 그대로 실행된다. */
const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;

describe('Q-1: 퀴즈 속도전 2인 (실 QuizRoomService)', () => {
  let A: ClientModules;   // 호스트
  let B: ClientModules;   // 참가자

  beforeEach(async () => {
    resetWorld();
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    A = await spawnClient('qA', makeUser('u_host', 1000), { latencyMs: 20 });
    B = await spawnClient('qB', makeUser('u_guest', 1000), { latencyMs: 20 });
    await flush(50);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 방 하나를 만들고 B까지 넣는다. 반환값은 roomId. */
  async function makeRoomWithTwo(kinds = [...SPEED_QUIZ_KINDS], lang: 'ko' | 'en' = 'ko') {
    const roomId = await run(A.quizRoomService.createRoom(10, 15, lang, kinds));
    expect(roomId, '방 생성 실패').toBeTruthy();

    // TD 로비와 달리 퀴즈 joinRoom 은 트랜잭션이 아니라 get()+update() 라
    // 방 목록 구독(찬 캐시)이 전제 조건이 아니다.
    await run(B.quizRoomService.joinRoom(roomId));
    return roomId as string;
  }

  it('생성 → 참가 → 두 사람이 같은 방에 들어온다', async () => {
    const roomId = await makeRoomWithTwo();
    const room = readServer(`quizRooms/${roomId}`) as any;
    expect(Object.keys(room.players).sort()).toEqual(['u_guest', 'u_host']);
    expect(room.memberIds).toEqual({ u_host: true, u_guest: true });
    expect(room.hostId).toBe('u_host');
    expect(room.status).toBe('waiting');
  });

  it('문제를 방송해도 정답이 방 데이터에 실리지 않는다', async () => {
    // 이 종목의 존재 이유. payload에 accept/reveal이 섞이면 참가자가 콘솔에서 정답을 본다.
    const roomId = await makeRoomWithTwo();
    await run(A.quizRoomService.startGame(roomId));

    const payload: SpeedRoundPayload = { kind: 'silhouette', imageUrl: 'x.png', silhouette: true };
    await run(A.quizRoomService.pushRound(roomId, 1, payload, 15, PLAYERS));

    const wire = JSON.stringify(readServer(`quizRooms/${roomId}`));
    expect(wire).not.toContain('accept');
    expect(wire).not.toContain('reveal');

    // B가 실제로 보는 값에도 없어야 한다(서버 상태와 구독 결과가 갈릴 수 있으므로 따로 본다).
    let seen: any = null;
    const stop = B.quizRoomService.subscribeRoom(roomId, (r: any) => { seen = r; });
    await flush();
    stop();
    expect(seen?.round?.payload?.kind).toBe('silhouette');
    expect(seen?.round?.payload).not.toHaveProperty('accept');
    expect(JSON.stringify(seen)).not.toContain('reveal');
  });

  it('제출한 답은 방이 아니라 방 밖(quizAnswers)에 쌓인다', async () => {
    // 방 안에 두면 상위 .read 허용 때문에 남의 답을 그대로 베낄 수 있다.
    const roomId = await makeRoomWithTwo();
    await run(A.quizRoomService.startGame(roomId));
    await run(A.quizRoomService.pushRound(roomId, 1, { kind: 'cry', audioUrl: 'c.ogg' }, 15, PLAYERS));
    await run(B.quizRoomService.submitAnswer(roomId, '피카츄'));

    const room = readServer(`quizRooms/${roomId}`) as any;
    expect(JSON.stringify(room)).not.toContain('피카츄');
    // 방에는 "냈다"는 사실만 남는다.
    expect(room.players.u_guest.answered).toBe(true);

    const answers = readServer(`quizAnswers/${roomId}`) as any;
    expect(answers.u_guest.text).toBe('피카츄');
    // 제출 시각은 서버가 찍는다 — 클라이언트가 "0.01초 만에 맞힘"을 만들 수 없어야 한다.
    expect(typeof answers.u_guest.at).toBe('number');
  });

  it('호스트가 채점하면 순위 보너스가 붙은 점수만 방송된다', async () => {
    const roomId = await makeRoomWithTwo();
    await run(A.quizRoomService.startGame(roomId));
    await run(A.quizRoomService.pushRound(
      roomId, 1, { kind: 'zoom', imageUrl: 'z.png', zoom: { x: 50, y: 50 } }, 15, PLAYERS));

    // 1등 A(50 보너스) / 2등 B(30 보너스). 남은 시간 비례 점수는 별도로 더해진다.
    const results = {
      u_host: { ok: true, ms: 1_000, points: A.speedPoints(1_000, 15_000, 1), order: 1 },
      u_guest: { ok: true, ms: 3_000, points: A.speedPoints(3_000, 15_000, 2), order: 2 },
    };
    const next = {
      u_host: { score: results.u_host.points, correct: 1 },
      u_guest: { score: results.u_guest.points, correct: 1 },
    };
    await run(A.quizRoomService.pushReveal(roomId, { title: '피카츄' }, results, next));

    const room = readServer(`quizRooms/${roomId}`) as any;
    expect(room.phase).toBe('reveal');
    expect(room.players.u_host.score).toBe(results.u_host.points);
    expect(room.players.u_guest.score).toBe(results.u_guest.points);
    // 먼저 맞힌 쪽이 반드시 높아야 한다(순위 보너스 + 남은 시간 둘 다 A가 유리).
    expect(room.players.u_host.score).toBeGreaterThan(room.players.u_guest.score);
    // 이 시점엔 정답 공개가 허용된다 — 위 테스트와 달리 reveal이 실려 있어야 한다.
    expect(room.round.reveal.title).toBe('피카츄');
  });

  it('타입(어려움)은 타입 슬러그를 싣고, 초성(어려움)은 갈래를 숨긴다', async () => {
    // 새로 들어온 4종목이 와이어를 제대로 타는지. 슬러그가 없으면 참가자 화면은 빈 지문이 되고,
    // 초성 어려움에 갈래가 실리면 그 종목의 정의(유형 힌트 X)가 페이로드에서 무너진다.
    const roomId = await makeRoomWithTwo();
    await run(A.quizRoomService.startGame(roomId));

    await run(A.quizRoomService.pushRound(
      roomId, 1, { kind: 'typeHard', typeSlugs: ['ghost', 'fire'] }, 15, PLAYERS));
    let seen: any = null;
    let stop = B.quizRoomService.subscribeRoom(roomId, (r: any) => { seen = r; });
    await flush(); stop();
    expect(seen.round.payload.typeSlugs).toEqual(['ghost', 'fire']);

    await run(A.quizRoomService.pushRound(
      roomId, 2, { kind: 'chosungHard', bigText: 'ㅍㅋㅊ' }, 15, PLAYERS));
    stop = B.quizRoomService.subscribeRoom(roomId, (r: any) => { seen = r; });
    await flush(); stop();
    expect(seen.round.payload.bigText).toBe('ㅍㅋㅊ');
    expect(seen.round.payload.chosungCat).toBeUndefined();
  });

  it('영어 방은 초성 종목을 저장하지 않는다', async () => {
    // 영어 이름에 초성열을 만들면 이름이 그대로 나와 정답이 보인다. 방 설정 단계에서 막혀야 한다.
    const roomId = await makeRoomWithTwo([...SPEED_QUIZ_KINDS], 'en');
    const room = readServer(`quizRooms/${roomId}`) as any;
    const kinds: string[] = room.config.kinds ?? [];
    expect(kinds).not.toContain('chosungEasy');
    expect(kinds).not.toContain('chosungHard');
    expect(kinds.sort()).toEqual([...speedKindsForLang('en')].sort());
  });

  it('호스트가 나가면 게임이 끝난다', async () => {
    // 출제권과 정답이 호스트에만 있으므로 이어받을 수 없다. 남은 사람이 멈춰 있으면 안 된다.
    const roomId = await makeRoomWithTwo();
    await run(A.quizRoomService.startGame(roomId));

    await run(A.quizRoomService.leaveRoom(roomId));
    await run(B.quizRoomService.forceFinishHostGone(roomId));

    const room = readServer(`quizRooms/${roomId}`) as any;
    // 방이 통째로 사라졌거나(호스트가 마지막이었다면) finished 로 닫혀 있어야 한다.
    expect(room === null || room.status === 'finished').toBe(true);
  });
});
