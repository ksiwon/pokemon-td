// src/services/QuizRoomService.ts
// 퀴즈 속도전(실시간 멀티) 방 서비스 — RTDB `quizRooms/{roomId}`.
//
// 권한 모델(= database.rules.json과 짝):
//   · 방 노드 전체 쓰기는 **호스트만**. 참가자는 자기 `players/{uid}`·`answers/{uid}`만 쓴다.
//   · 정답(accept)과 정답 공개 정보(reveal)는 문제 진행 중 방에 올리지 않는다.
//     방 데이터는 모든 참가자가 읽을 수 있어서, 올리는 순간 콘솔에서 정답이 보인다.
//     채점은 호스트가 로컬(SpeedRound.accept)에서 하고 결과만 방송한다.
//   · 참가자는 답 텍스트만 올리고, 제출 시각은 RTDB serverTimestamp를 쓴다(룰이 `now`와 대조).
//     클라이언트가 시각을 조작해 "0.01초 만에 맞힘"을 만들 수 없다.
//
// [FREE-TIER] 비용 설계
//   · 동시 연결: rtdbBudget에서 TD 멀티와 예산을 나눈다(퀴즈 8방 × 8명 = 64).
//   · 다운로드: 방 1개 구독으로 끝낸다. 페이로드에 이미지는 URL만 담고 실제 이미지는
//     PokeAPI CDN에서 직접 받는다(Netlify 대역폭·RTDB 전송량 모두 0).
//   · 저장: 방은 게임이 끝나면 삭제하고, 남은 고아 방은 1시간 뒤 아무나 지울 수 있다.

import {
  ref, set, update, remove, get, push, onValue, onDisconnect, serverTimestamp,
} from 'firebase/database';
import { rtdb, serverNow } from '../config/firebase';
import { QUIZ_MAX_ACTIVE_ROOMS, QUIZ_MAX_PLAYERS_PER_ROOM } from '../config/rtdbBudget';
import {
  QuizRoom, QuizRoomSummary, QuizRoomPhase, QuizRoundResult, QuizAnswer, QuizRoomLang,
} from '../types/quizRoom';
import { SpeedRoundPayload, SpeedRevealPayload, SpeedQuizKind, speedKindsForLang } from '../types/quiz';
import { authService } from './AuthService';
import { multiplayerService } from './MultiplayerService';

/** 방 만료(고아 정리 기준). 룰의 3600000과 반드시 같아야 한다. */
const ROOM_EXPIRY_MS = 60 * 60 * 1000;

/**
 * 방 설정의 종목 목록을 안전한 배열로 되돌린다.
 * RTDB는 배열을 인덱스 키 객체(`{0:'cry',1:'zoom'}`)로 저장하고, 값이 비면 **키 자체가
 * 사라진다.** 그대로 쓰면 `.map`이 없어 터지거나 빈 풀로 출제가 멈추므로 여기서 정규화한다.
 * 구버전 방(필드 없음)은 전 종목으로 본다.
 */
export function normalizeKinds(raw: unknown, lang?: string): SpeedQuizKind[] {
  // 방 언어에서 불가능한 종목은 저장돼 있어도 걸러 낸다 — 영어 방에 초성이 섞이면
  // 초성열 자리에 영문 이름이 그대로 나와 정답이 보인다.
  const allowed = speedKindsForLang(lang ?? 'ko');
  const list = Array.isArray(raw) ? raw : Object.values((raw ?? {}) as Record<string, unknown>);
  const valid = list.filter((k): k is SpeedQuizKind => allowed.includes(k as SpeedQuizKind));
  return valid.length ? valid : [...allowed];
}

/** UI가 번역해서 보여줄 오류 코드(서비스는 언어를 모른다). */
export const QUIZ_ROOM_ERROR = {
  ROOM_LIMIT: 'QR_ROOM_LIMIT',
  ROOM_FULL: 'QR_ROOM_FULL',
  ROOM_GONE: 'QR_ROOM_GONE',
  ALREADY_STARTED: 'QR_ALREADY_STARTED',
  WRONG_PASS: 'QR_WRONG_PASS',
} as const;

/**
 * 방 비밀번호 해시. 방 id를 소금으로 섞어 같은 비밀번호라도 방마다 값이 다르게 만든다.
 *
 * 왜 해시를 서버에 두고 클라이언트가 비교하지 않는가: quizRooms는 참가자 전원이 읽어야
 * 해서, 방 안에 무엇을 넣든 콘솔에서 보인다. 그래서 해시는 **읽기가 막힌**
 * `quizRoomSecrets/{roomId}/hash`에 두고, 입장할 때 내가 계산한 해시를
 * `joins/{uid}`에 써 본다. 보안 규칙은 클라이언트가 읽을 수 없는 데이터도 참조할 수 있으므로
 * `.validate`가 둘을 대조한다 — 값을 넘겨받지 않고도 서버가 판정한다.
 * joins도 읽기가 막혀 있어(상위 .read가 호스트 전용) 남의 티켓을 베낄 수 없다.
 */
export async function hashRoomPass(roomId: string, pass: string): Promise<string> {
  const data = new TextEncoder().encode(`${roomId}:${pass}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 속도 점수 = 남은 시간 비례(0~100) + 순위 보너스(1등 50 · 2등 30 · 3등 15).
 *
 * 왜 이 배합인가: 시간 비례만 쓰면 0.2초 차이가 1점 차이라 "먼저 맞힌 사람"의 쾌감이 없고,
 * 순위 보너스만 쓰면 늦게라도 1등이면 만점이라 빨리 칠 이유가 없다. 둘을 겹쳐서
 * **빨리 칠수록 + 남보다 먼저일수록** 이득이 되게 한다. 오답·무응답은 0점.
 */
export function speedPoints(msTaken: number, limitMs: number, order: number): number {
  const remain = Math.max(0, Math.min(1, 1 - msTaken / Math.max(1, limitMs)));
  const bonus = order === 1 ? 50 : order === 2 ? 30 : order === 3 ? 15 : 0;
  return Math.round(100 * remain) + bonus;
}

class QuizRoomService {
  private currentRoomId: string | null = null;
  /** 접속이 끊겼을 때 내 자리를 자동으로 비우는 훅의 해제 함수. */
  private disconnectCleanup: (() => void) | null = null;

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  constructor() {
    // 방에 들어가 있는 동안엔 연결을 끊지 못하게 한다. 이게 없으면 로비의 withConnection이
    // 반납을 시도할 때 goOffline이 걸리고, 서버가 onDisconnect를 발동시켜
    // **방금 들어간 내 자리가 즉시 삭제된다.**
    multiplayerService.registerRtdbBusyProbe(() => this.currentRoomId !== null);
  }

  /**
   * 속도전 **방 화면**의 진입/이탈. 방에 있는 동안은 연결을 계속 잡아야 한다(실제 플레이어).
   * 참조 카운트는 MultiplayerService가 단독 관리하므로(firebase.ts 주석) 거기에 합류한다.
   */
  acquire(): void { multiplayerService.acquireRtdb(); }
  release(): void { multiplayerService.releaseRtdb(); }

  /**
   * **로비용** — 한 번의 조회/작업 동안만 연결을 잡고 반납한다.
   * 방 목록만 구경하는 사람이 동시 연결 슬롯을 물고 있지 않게 하는 장치.
   */
  withConnection<T>(fn: () => Promise<T>): Promise<T> {
    return multiplayerService.withRtdb(fn);
  }

  // ─── 방 목록 ────────────────────────────────────────────────────────────────
  /**
   * 대기 중인 방 목록 + 현재 활성 방 수.
   *
   * **정원이 찬 방도 `full: true`로 함께 돌려준다.** 예전엔 숨겼는데, 방이 다 차면 로비가
   * "대기 중인 방이 없어요"로 보이면서 방 만들기까지 상한에 걸려 거부돼 — 왜 못 들어가는지
   * 알 수 없는 상태가 됐다. 붐빈다는 사실 자체를 보여 주는 편이 낫다.
   *
   * activeCount는 playing 상태까지 포함한 활성 방 수 — 방 만들기 상한 안내에 쓴다.
   */
  async listWaitingRooms(): Promise<{ rooms: QuizRoomSummary[]; activeCount: number }> {
    const snap = await get(ref(rtdb, 'quizRooms'));
    const val = (snap.val() ?? {}) as Record<string, QuizRoom>;
    const now = serverNow();
    const alive = Object.values(val).filter(r => r && r.createdAt && now - r.createdAt < ROOM_EXPIRY_MS);
    const rooms = alive
      .filter(r => r.status === 'waiting')
      .map(r => {
        const playerCount = Object.keys(r.players ?? {}).length;
        // 언어 표기가 없는 구버전 방은 한국어로 본다(이 기능 이전 방은 전부 한국어였다).
        const lang: QuizRoomLang = r.config?.lang === 'en' ? 'en' : 'ko';
        return {
          id: r.id,
          hostName: r.hostName,
          playerCount,
          rounds: r.config?.rounds ?? 0,
          seconds: r.config?.seconds ?? 0,
          lang,
          kinds: normalizeKinds(r.config?.kinds, lang),
          hasPass: r.config?.hasPass === true,
          createdAt: r.createdAt,
          full: playerCount >= QUIZ_MAX_PLAYERS_PER_ROOM,
        };
      })
      // 사람이 0명인 방은 유령이다(호스트가 나갔는데 방 삭제 권한이 없어 남은 경우).
      .filter(r => r.playerCount > 0)
      .sort((a, b) => Number(a.full) - Number(b.full) || b.createdAt - a.createdAt);
    return { rooms, activeCount: alive.length };
  }

  /**
   * 만료된 방 정리. 로비를 열 때 한 번만 부른다(주기 타이머 없음 —
   * 모든 유저가 주기적으로 RTDB를 읽으면 무료 한도가 그쪽으로 샌다).
   */
  async cleanupExpiredRooms(): Promise<void> {
    try {
      const snap = await get(ref(rtdb, 'quizRooms'));
      const val = (snap.val() ?? {}) as Record<string, QuizRoom>;
      const now = serverNow();
      await Promise.all(
        Object.entries(val)
          .filter(([, r]) => !r?.createdAt || now - r.createdAt > ROOM_EXPIRY_MS)
          .flatMap(([id]) => [
            remove(ref(rtdb, `quizRooms/${id}`)).catch(() => {}),
            // 방이 사라진 뒤엔 누구나 지울 수 있게 룰이 열려 있다(고아 답안·비밀 회수).
            remove(ref(rtdb, `quizAnswers/${id}`)).catch(() => {}),
            remove(ref(rtdb, `quizRoomSecrets/${id}`)).catch(() => {}),
          ])
      );
    } catch {
      // 정리는 실패해도 게임 진행에 지장 없음
    }
  }

  // ─── 방 생성 / 입장 / 퇴장 ──────────────────────────────────────────────────
  async createRoom(
    rounds: number, seconds: number, lang: QuizRoomLang, kinds: SpeedQuizKind[],
    pass?: string,
  ): Promise<string> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error(QUIZ_ROOM_ERROR.ROOM_GONE);

    // [FREE-TIER] 동시 연결 예산을 넘지 않도록 활성 방 수를 먼저 확인.
    const activeSnap = await get(ref(rtdb, 'quizRooms'));
    const active = Object.values((activeSnap.val() ?? {}) as Record<string, QuizRoom>)
      .filter(r => r && r.createdAt && serverNow() - r.createdAt < ROOM_EXPIRY_MS);
    if (active.length >= QUIZ_MAX_ACTIVE_ROOMS) throw new Error(QUIZ_ROOM_ERROR.ROOM_LIMIT);

    const newRef = push(ref(rtdb, 'quizRooms'));
    const roomId = newRef.key!;
    const name = user.displayName || 'Player';
    const room: QuizRoom = {
      id: roomId,
      hostId: user.uid,
      hostName: name,
      createdAt: serverNow(),
      status: 'waiting',
      phase: 'lobby',
      // 종목은 정규화해서 저장한다 — 빈 배열이 올라가면 RTDB가 필드를 통째로 지워
      // 다음 문제 생성에서 풀이 비고, 호스트가 1.5초마다 재시도하며 게임이 시작되지 않는다.
      config: { rounds, seconds, lang, kinds: normalizeKinds(kinds, lang), hasPass: !!pass },
      memberIds: { [user.uid]: true },
      players: {
        [user.uid]: { userId: user.uid, name, score: 0, correct: 0, joinedAt: serverNow() },
      },
    };
    await set(newRef, room);
    // 방을 먼저 만들어야 한다 — 비밀 노드의 쓰기 규칙이 quizRooms의 hostId를 본다.
    // 해시가 없는 동안은 joins의 validate가 통과할 수 없어 아무도 못 들어온다(잠긴 상태로 시작).
    if (pass) {
      await set(ref(rtdb, `quizRoomSecrets/${roomId}/hash`), await hashRoomPass(roomId, pass));
    }
    this.currentRoomId = roomId;
    this.armDisconnectCleanup(roomId, user.uid);
    return roomId;
  }

  async joinRoom(roomId: string, pass?: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error(QUIZ_ROOM_ERROR.ROOM_GONE);

    const snap = await get(ref(rtdb, `quizRooms/${roomId}`));
    const room = snap.val() as QuizRoom | null;
    if (!room) throw new Error(QUIZ_ROOM_ERROR.ROOM_GONE);
    if (room.status !== 'waiting') throw new Error(QUIZ_ROOM_ERROR.ALREADY_STARTED);
    const count = Object.keys(room.players ?? {}).length;
    if (count >= QUIZ_MAX_PLAYERS_PER_ROOM && !room.players?.[user.uid]) {
      throw new Error(QUIZ_ROOM_ERROR.ROOM_FULL);
    }

    // 비밀번호 방이면 먼저 입장권을 끊는다. 규칙이 내가 쓴 해시를 (내가 읽을 수 없는)
    // 방 해시와 대조하므로, 틀리면 여기서 permission_denied로 막힌다.
    if (room.config?.hasPass) {
      const ticket = await hashRoomPass(roomId, pass ?? '');
      try {
        await set(ref(rtdb, `quizRoomSecrets/${roomId}/joins/${user.uid}`), ticket);
      } catch {
        throw new Error(QUIZ_ROOM_ERROR.WRONG_PASS);
      }
    }

    const name = user.displayName || 'Player';
    // 멀티패스 업데이트 — 각 경로가 자기 룰로 검사된다(참가자는 자기 자리만 쓸 수 있음).
    await update(ref(rtdb, `quizRooms/${roomId}`), {
      [`memberIds/${user.uid}`]: true,
      [`players/${user.uid}`]: { userId: user.uid, name, score: 0, correct: 0, joinedAt: serverNow() },
    });
    this.currentRoomId = roomId;
    this.armDisconnectCleanup(roomId, user.uid);
  }

  /**
   * 브라우저를 닫거나 네트워크가 끊기면 내 자리를 자동으로 비운다.
   * 이게 없으면 유령 참가자 때문에 방이 영영 정원 초과로 보인다.
   */
  private armDisconnectCleanup(roomId: string, uid: string): void {
    this.disarmDisconnectCleanup();
    const playerRef = ref(rtdb, `quizRooms/${roomId}/players/${uid}`);
    const memberRef = ref(rtdb, `quizRooms/${roomId}/memberIds/${uid}`);
    onDisconnect(playerRef).remove().catch(() => {});
    onDisconnect(memberRef).remove().catch(() => {});
    this.disconnectCleanup = () => {
      onDisconnect(playerRef).cancel().catch(() => {});
      onDisconnect(memberRef).cancel().catch(() => {});
    };
  }

  private disarmDisconnectCleanup(): void {
    this.disconnectCleanup?.();
    this.disconnectCleanup = null;
  }

  /** 방 나가기. 마지막 사람이 나가면 방을 통째로 지운다(빈 방이 목록에 남지 않게). */
  async leaveRoom(roomId: string): Promise<void> {
    const user = authService.getCurrentUser();
    this.disarmDisconnectCleanup();
    this.currentRoomId = null;
    if (!user) return;

    try {
      await remove(ref(rtdb, `quizRooms/${roomId}/players/${user.uid}`));
      await remove(ref(rtdb, `quizRooms/${roomId}/memberIds/${user.uid}`));
      const snap = await get(ref(rtdb, `quizRooms/${roomId}/players`));
      if (!snap.exists() || Object.keys(snap.val() ?? {}).length === 0) {
        // 방 노드 삭제는 호스트만 가능 — 실패하면 1시간 뒤 만료 정리가 치운다.
        await remove(ref(rtdb, `quizRooms/${roomId}`)).catch(() => {});
        // 방 노드가 사라진 뒤라야 이 둘의 고아 삭제 규칙이 열린다(순서를 지킬 것).
        await remove(ref(rtdb, `quizAnswers/${roomId}`)).catch(() => {});
        await remove(ref(rtdb, `quizRoomSecrets/${roomId}`)).catch(() => {});
      }
    } catch {
      // 이미 지워진 방 — 무시
    }
  }

  /**
   * **네트워크 없이** 방 소속만 지운다. 방이 사라졌거나(roomClosed) 아예 연결하지 못했을 때
   * (serverBusy) 쓴다 — 그 상황에서 leaveRoom을 부르면 응답이 오지 않는 remove를 기다리며
   * 화면이 멈춘다. 이걸 빠뜨리면 currentRoomId가 남아 busy 프로브가 계속 true를 돌려주고,
   * **연결 슬롯이 탭을 닫을 때까지 반납되지 않는다.**
   */
  forgetRoom(): void {
    this.disarmDisconnectCleanup();
    this.currentRoomId = null;
  }

  /** 방 상태 구독. 반환값은 구독 해제 함수. */
  subscribeRoom(roomId: string, cb: (room: QuizRoom | null) => void): () => void {
    const roomRef = ref(rtdb, `quizRooms/${roomId}`);
    const off = onValue(roomRef, snap => {
      const room = snap.val() as QuizRoom | null;
      if (room) {
        // RTDB는 빈 객체를 저장하지 않아 필드가 통째로 사라진다 → 항상 있는 것으로 정규화.
        room.players = room.players ?? {};
        room.memberIds = room.memberIds ?? {};
      }
      cb(room);
    });
    return () => off();
  }

  // ─── 호스트 전용: 진행 ──────────────────────────────────────────────────────
  /** 게임 시작 — 대기실 → 첫 문제 직전. */
  async startGame(roomId: string): Promise<void> {
    await update(ref(rtdb, `quizRooms/${roomId}`), { status: 'playing', phase: 'question' });
  }

  /**
   * 새 문제 방송. 이전 문제의 제출 상태를 비우고 새 라운드로 교체한다.
   * reveal/results가 없는 상태로 나가므로 이 시점엔 방 어디에도 정답이 없다.
   */
  async pushRound(
    roomId: string, index: number, payload: SpeedRoundPayload, seconds: number, playerIds: string[],
  ): Promise<void> {
    const startedAt = serverNow();
    const patch: Record<string, unknown> = {
      phase: 'question' as QuizRoomPhase,
      round: { index, startedAt, endsAt: startedAt + seconds * 1000, payload },
    };
    for (const uid of playerIds) patch[`players/${uid}/answered`] = null;
    await Promise.all([
      update(ref(rtdb, `quizRooms/${roomId}`), patch),
      remove(ref(rtdb, `quizAnswers/${roomId}`)), // 지난 문제의 답안 본문 폐기
    ]);
  }

  /** 답안 구독(호스트 전용 — 룰이 호스트에게만 읽기를 허용한다). */
  subscribeAnswers(roomId: string, cb: (answers: Record<string, QuizAnswer>) => void): () => void {
    const off = onValue(ref(rtdb, `quizAnswers/${roomId}`), snap => {
      cb((snap.val() ?? {}) as Record<string, QuizAnswer>);
    });
    return () => off();
  }

  /** 정답 공개 — 정답·채점 결과·갱신된 점수를 한 번에 방송(왕복 1회). */
  async pushReveal(
    roomId: string,
    reveal: SpeedRevealPayload,
    results: Record<string, QuizRoundResult>,
    players: Record<string, { score: number; correct: number }>,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      phase: 'reveal' as QuizRoomPhase,
      'round/reveal': reveal,
      'round/results': results,
    };
    for (const [uid, p] of Object.entries(players)) {
      patch[`players/${uid}/score`] = p.score;
      patch[`players/${uid}/correct`] = p.correct;
    }
    await update(ref(rtdb, `quizRooms/${roomId}`), patch);
  }

  /** 최종 결과 화면으로. 방은 남겨 두고(결과 확인) 나갈 때 정리한다. */
  async finishGame(roomId: string): Promise<void> {
    await Promise.all([
      update(ref(rtdb, `quizRooms/${roomId}`), {
        status: 'finished' as const,
        phase: 'done' as QuizRoomPhase,
      }),
      remove(ref(rtdb, `quizAnswers/${roomId}`)),
    ]);
  }

  /**
   * 호스트가 나가 버렸을 때 남은 사람이 게임을 끝낸다.
   * 호스트만 문제를 만들고 채점할 수 있으므로(정답을 호스트만 들고 있다) 진행을 이어받을 수
   * 없다 → 그 시점까지의 점수로 결과 화면을 띄운다. 룰도 `status`만 예외로 열어 둔다.
   */
  async forceFinishHostGone(roomId: string): Promise<void> {
    try {
      await set(ref(rtdb, `quizRooms/${roomId}/status`), 'finished');
    } catch {
      // 룰이 막으면(호스트가 아직 살아 있음) 무시 — 정상 진행 중이라는 뜻
    }
  }

  // ─── 참가자: 답 제출 ────────────────────────────────────────────────────────
  /**
   * 답 제출. 본문은 호스트만 읽을 수 있는 quizAnswers로, "냈다"는 사실만 방에 남긴다.
   * 시각은 RTDB serverTimestamp — 룰(`newData.child('at').val() === now`)이 서버 시각과
   * 대조하므로 클라이언트가 앞당겨 쓸 수 없다.
   */
  async submitAnswer(roomId: string, text: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user) return;
    await set(ref(rtdb, `quizAnswers/${roomId}/${user.uid}`), {
      text: text.slice(0, 60),
      at: serverTimestamp(),
    });
    // 제출 표시는 실패해도 채점에 영향이 없으므로 조용히 무시한다.
    await set(ref(rtdb, `quizRooms/${roomId}/players/${user.uid}/answered`), true).catch(() => {});
  }
}

export const quizRoomService = new QuizRoomService();
