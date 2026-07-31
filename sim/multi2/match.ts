// sim/multi2/match.ts
// 2인 매치 러너 — 방 생성부터 게임 종료까지를 가상 시간으로 돌리고, 프로토콜 불변식을 검사한다.
//
// 두 클라이언트는 서로 다른 모듈 그래프에서 돌고(sim/net/clientKit), 인메모리 RTDB 로만 대화한다.
// 즉 "한쪽이 본 것"과 "다른 쪽이 본 것"이 실제로 갈라질 수 있다 — 그게 검사 대상이다.

import { vi } from 'vitest';
import { resetWorld, readServer, simDisconnect, simReconnect, worldStats } from '../net/rtdb';
import { spawnClient, makeUser, ClientModules } from '../net/clientKit';
import { HeadlessClient, WaveScript, ClientTrace } from './client';
import type { TowerDetail } from '../../src/types/multiplayer';

export interface PlayerSpec {
  uid: string;
  clientId: string;
  latencyMs: number;
  clockSkewMs?: number;
  board: TowerDetail[];
  waveMs: (round: number) => number;
  pveLeak?: (round: number) => number;
  goldGain?: (round: number) => number;
}

export interface MatchEvent {
  /** 게임 시작 후 경과 가상 ms. `when` 을 쓰면 생략 가능. */
  atMs?: number;
  /** 서버 상태 조건으로 발화 — 배틀 페이즈처럼 시각을 미리 못 박기 어려운 지점용. 1회만. */
  when?: (gs: any) => boolean;
  label: string;
  run: (ctx: MatchContext) => void | Promise<void>;
}

export interface MatchContext {
  roomId: string;
  clients: Record<string, HeadlessClient>;
  mods: Record<string, ClientModules>;
}

export interface MatchOptions {
  players: [PlayerSpec, PlayerSpec];
  /** 이 라운드에 도달하면 종료(도달 전 게임오버면 그때 종료). */
  maxRounds?: number;
  maxVirtualMs?: number;
  stepMs?: number;
  events?: MatchEvent[];
  arenaMs?: number;
}

export interface MatchResult {
  roomId: string;
  traces: Record<string, ClientTrace>;
  finalState: any;
  finalRoom: any;
  rounds: number;
  battlesResolved: number;
  endedBy: 'gameover' | 'maxRounds' | 'timeout';
  virtualMs: number;
  rtdb: ReturnType<typeof worldStats>;
  /** 남은 고아 노드 — 게임이 끝난 뒤에도 살아 있으면 안 되는 것들. */
  leftovers: string[];
  /**
   * 실행 중 서버에 실제로 올라온 배틀 결과 전부.
   * ⚠ finalState.battleResults 로는 셀 수 없다 — startWaitingWavePhase 가 매 라운드
   *   `roundNumber >= currentRound - 2` 로 잘라내기 때문에 오래된 결과가 사라진다.
   */
  observedResults: any[];
  /** 한 매치(라운드×페어)에 결과가 2개 이상 관측된 적이 있는가. */
  duplicateResults: string[];
  /** 주입 이벤트(이탈·크래시·재접속)가 던진 오류. */
  eventErrors: string[];
}

function scriptFor(p: PlayerSpec, arenaMs: number): WaveScript {
  return {
    durationMs: p.waveMs,
    pveLeak: p.pveLeak ?? (() => 0),
    goldGain: p.goldGain ?? (() => 60),
    board: () => p.board,
    arenaMs,
  };
}

export async function runTwoPlayerMatch(opts: MatchOptions): Promise<MatchResult> {
  const {
    players, maxRounds = 12, maxVirtualMs = 20 * 60 * 1000,
    // 하네스가 서버 상태를 들여다보는 주기. 타이머는 advanceTimersByTimeAsync 안에서
    // 순서대로 전부 발화하므로 이 값이 커져도 클라이언트 동작은 달라지지 않는다
    // (200ms 페이즈 체크도 그대로 돈다). 관측 해상도와 벽시계 비용의 트레이드오프일 뿐.
    stepMs = 500, events = [], arenaMs = 2000,
  } = opts;

  resetWorld();
  localStorage.removeItem('currentRoomId');
  vi.useFakeTimers({ now: 1_760_000_000_000 });

  const mods: Record<string, ClientModules> = {};
  for (const p of players) {
    mods[p.uid] = await spawnClient(p.clientId, makeUser(p.uid), {
      latencyMs: p.latencyMs, clockSkewMs: p.clockSkewMs ?? 0,
    });
  }
  const [P1, P2] = players;
  const host = mods[P1.uid];
  const guest = mods[P2.uid];

  const flush = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  try {
    // ── 로비 ────────────────────────────────────────────────────────────────
    // 셋업 대기는 왕복 지연에 맞춰 늘린다. 고정값(500ms)으로 두면 지연 600ms 클라에서
    // 방 목록이 도착하기 전에 joinRoom 이 나가고, 로컬 캐시가 비어 있어 트랜잭션이
    // 첫 시도에서 "Room not found"로 중단된다(= 하네스 결함이지 제품 버그가 아님).
    const netWait = Math.max(1000, 8 * Math.max(P1.latencyMs, P2.latencyMs));

    host.multiplayerService.initForMultiplayer();
    guest.multiplayerService.initForMultiplayer();
    await flush(netWait);

    const pCreate = host.multiplayerService.createRoom('easiest_straight', '직선');
    await flush(netWait);
    const roomId: string = await pCreate;

    // 실 UI 와 동일하게 게스트는 방 목록을 구독한 뒤 참가한다(트랜잭션 캐시 전제).
    const unsubLobby = guest.multiplayerService.onRoomsUpdate(() => {});
    await flush(netWait);
    const pJoin = guest.multiplayerService.joinRoom(roomId);
    await flush(netWait); await pJoin;
    const pReady = guest.multiplayerService.toggleReady(roomId);
    await flush(netWait); await pReady;
    unsubLobby();

    const pStart = host.multiplayerService.startGame(roomId);
    await flush(4000 + netWait); await pStart;

    // ── 클라이언트 기동 ─────────────────────────────────────────────────────
    const clients: Record<string, HeadlessClient> = {};
    for (const p of players) {
      clients[p.uid] = new HeadlessClient(mods[p.uid], roomId, scriptFor(p, arenaMs));
    }
    const ctx: MatchContext = { roomId, clients, mods };
    for (const p of players) clients[p.uid].start();

    // ── 본 루프 ─────────────────────────────────────────────────────────────
    const t0 = Date.now();
    const timed = events.filter(e => e.atMs !== undefined).sort((a, b) => a.atMs! - b.atMs!);
    const conditional = events.filter(e => e.when !== undefined);
    const pending = timed;
    let endedBy: MatchResult['endedBy'] = 'timeout';
    let elapsed = 0;
    const observed = new Map<string, any>();
    const duplicateResults: string[] = [];
    const eventErrors: string[] = [];
    const matchKey = (r: any) => {
      const [x, y] = [r.player1Id, r.player2Id].sort();
      return `${r.roundNumber}:${x}:${y}`;
    };

    while (elapsed < maxVirtualMs) {
      await flush(stepMs);
      elapsed = Date.now() - t0;

      const due: MatchEvent[] = [];
      while (pending.length > 0 && pending[0].atMs! <= elapsed) due.push(pending.shift()!);
      {
        const gsNow = readServer(`gameStates/${roomId}`) as any;
        for (let i = conditional.length - 1; i >= 0; i--) {
          if (gsNow && conditional[i].when!(gsNow)) due.push(...conditional.splice(i, 1));
        }
      }
      for (const ev of due) {
        // ⚠ await 하지 않는다. 이벤트가 네트워크를 타면(leaveRoom·rejoin) 완료에 타이머 전진이
        //   필요한데, 그 타이머를 돌리는 게 바로 이 루프다 → await 하면 서로를 기다리다 멈춘다.
        void Promise.resolve()
          .then(() => ev.run(ctx))
          .catch(e => eventErrors.push(`${ev.label}: ${e?.message ?? e}`));
      }

      const gs = readServer(`gameStates/${roomId}`) as any;
      // 잘려 나가기 전에 결과를 훔쳐 둔다(그리고 중복 제출이 살아남았는지 본다).
      if (gs) {
        const seen = new Map<string, number>();
        for (const res of (gs.battleResults ?? [])) {
          const k = matchKey(res);
          seen.set(k, (seen.get(k) ?? 0) + 1);
          if (!observed.has(k)) observed.set(k, res);
        }
        for (const [k, n] of seen) {
          if (n > 1 && !duplicateResults.includes(k)) duplicateResults.push(`${k} ×${n}`);
        }
      }
      if (!gs) { endedBy = 'gameover'; break; }
      const alive = (gs.players ?? []).filter((p: any) => p.isAlive);
      if (alive.length <= 1) { endedBy = 'gameover'; break; }
      if ((gs.currentRound ?? 0) >= maxRounds && gs.currentPhase === 'waiting_wave') {
        endedBy = 'maxRounds'; break;
      }
    }

    // 종료 처리(모달 닫기 → finalizeGame)까지 조금 더 흘린다.
    await flush(5000);

    const finalState = readServer(`gameStates/${roomId}`) as any;
    const finalRoom = readServer(`rooms/${roomId}`) as any;
    const traces: Record<string, ClientTrace> = {};
    for (const p of players) traces[p.uid] = clients[p.uid].trace;

    const battlesResolved = observed.size;
    const rounds = finalState?.currentRound ?? 0;

    for (const p of players) clients[p.uid].stop();

    const leftovers: string[] = [];
    if (finalRoom === null) {
      for (const path of ['gameStates', 'towerDetails', 'battleResults', 'presence']) {
        if (readServer(`${path}/${roomId}`) !== null) leftovers.push(`${path}/${roomId}`);
      }
    }

    return {
      roomId, traces, finalState, finalRoom, rounds, battlesResolved,
      endedBy, virtualMs: elapsed, rtdb: worldStats(), leftovers,
      observedResults: [...observed.values()], duplicateResults, eventErrors,
    };
  } finally {
    for (const p of players) {
      try { mods[p.uid].multiplayerService.stopAutoCleanup(); } catch { /* ignore */ }
    }
    vi.useRealTimers();
  }
}

// ─── 불변식 ─────────────────────────────────────────────────────────────────

export interface Violation { rule: string; detail: string }

export function checkInvariants(r: MatchResult, uids: string[]): Violation[] {
  const v: Violation[] = [];
  const [a, b] = uids;
  const ta = r.traces[a], tb = r.traces[b];

  // 1. 페이즈 라운드 단조성 — 두 클라이언트 모두 라운드가 뒤로 가지 않는다.
  for (const t of [ta, tb]) {
    let last = -1;
    for (const p of t.phases) {
      if (p.round < last) {
        v.push({ rule: '라운드 단조성', detail: `${t.uid}: R${last} → R${p.round} (${p.phase})` });
        break;
      }
      last = p.round;
    }
  }

  // 2. 데드락 없음 — 라운드가 실제로 진행됐다.
  if (r.rounds < 1) v.push({ rule: '진행', detail: `라운드가 ${r.rounds}에서 멈췄다` });

  // 3. 라운드×매치당 결과는 정확히 1개 (양쪽이 동시에 제출해도 하나만 남아야 한다).
  for (const dup of r.duplicateResults) {
    v.push({ rule: '결과 유일성', detail: `중복 기록 ${dup}` });
  }

  // 4. 양측 로컬 계산 일치 — 각자 자기 시야로 돌린 아레나가 같은 승자/생존수를 냈는가.
  //    어긋나면 "한쪽 화면과 실제 기록이 다르다"는 뜻이다.
  for (const la of ta.localBattles) {
    const lb = tb.localBattles.find(x => x.round === la.round);
    if (!lb) continue;
    if (la.winnerId !== lb.winnerId) {
      v.push({
        rule: '양측 결과 일치',
        detail: `R${la.round}: ${a}는 ${la.winnerId} 승, ${b}는 ${lb.winnerId} 승`
          + ` / 입력 동일? my↔opp ${la.myTeamFp === lb.oppTeamFp} ${la.oppTeamFp === lb.myTeamFp}`,
      });
    } else if (la.p1Remaining !== lb.p1Remaining || la.p2Remaining !== lb.p2Remaining) {
      v.push({
        rule: '양측 생존수 일치',
        detail: `R${la.round}: ${a} ${la.p1Remaining}:${la.p2Remaining} vs ${b} ${lb.p1Remaining}:${lb.p2Remaining}`,
      });
    }
  }

  // 5. 아레나 입력 동일성 — 두 클라가 같은 보드를 보고 싸웠는가(스로틀/지연으로 갈릴 수 있다).
  for (const la of ta.localBattles) {
    const lb = tb.localBattles.find(x => x.round === la.round);
    if (!lb) continue;
    if (la.myTeamFp !== lb.oppTeamFp || la.oppTeamFp !== lb.myTeamFp) {
      v.push({ rule: '아레나 입력 동일성', detail: `R${la.round}: 두 클라가 서로 다른 보드를 봤다` });
    }
  }

  // 6. 정산은 정확히 한 번씩 — 클라가 적용한 델타의 합이 마지막 원장과 같아야 한다.
  //    (중복 적용이면 합이 원장을 넘고, 누락이면 모자란다)
  for (const t of [ta, tb]) {
    const sum = t.rewards.reduce(
      (acc, x) => ({ gold: acc.gold + x.gold, lives: acc.lives + x.lives }),
      { gold: 0, lives: 0 },
    );
    if (sum.gold !== t.appliedLedger.gold || sum.lives !== t.appliedLedger.lives) {
      v.push({
        rule: '보상 중복/누락',
        detail: `${t.uid}: 적용 합계 ${JSON.stringify(sum)} ≠ 반영 원장 ${JSON.stringify(t.appliedLedger)}`,
      });
    }
  }

  // 7. 보상 정산 완결 — 서버가 확정한 누적 원장을 클라가 전부 반영했는가.
  //    ⚠ 이게 걸린다는 것은 "그 골드/라이프 변화가 영구 소실됐다"는 뜻이다. 예전에는
  //    보상 적용 조건이 `roundNumber === currentRound` 라, **배틀 페이즈에 끊겨 있으면
  //    패배 페널티가 통째로 사라졌다**(= 지겠다 싶으면 끊는 게 이득). 지금은 누적 원장
  //    차이로 적용하므로 창을 놓쳐도, 재접속해도 정확히 한 번 정산돼야 한다. S11 이 실측한다.
  //    이탈자(다시 안 돌아온 클라)는 제외 — 정산할 클라이언트 자체가 없다.
  for (const t of [ta, tb]) {
    if (t.departed) continue;
    const sp = (r.finalState?.players ?? []).find((p: any) => p.userId === t.uid);
    const ledger = sp?.rewardLedger;
    if (!ledger) continue;   // 배틀이 한 번도 없었으면 원장 자체가 없다
    if (ledger.gold !== t.appliedLedger.gold || ledger.lives !== t.appliedLedger.lives) {
      v.push({
        rule: '보상 정산 미완',
        detail: `${t.uid}: 서버 원장 ${JSON.stringify({ gold: ledger.gold, lives: ledger.lives })}`
          + ` vs 클라 반영 ${JSON.stringify(t.appliedLedger)}`,
      });
    }
  }

  // 8. 최종 상태 일치 — 서버 기록과 각 클라의 로컬 lives 가 어긋나지 않아야 한다.
  //    (money 는 웨이브 보상 등 로컬 권위라 제외)
  for (const t of [ta, tb]) {
    if (t.departed) continue;
    const sp = (r.finalState?.players ?? []).find((p: any) => p.userId === t.uid);
    if (!sp) { v.push({ rule: '최종 상태', detail: `${t.uid}: 서버에 플레이어가 없다` }); continue; }
    if (sp.isAlive === false && t.defeatedAt === null && !t.gameOverSeen) {
      v.push({ rule: '최종 상태', detail: `${t.uid}: 서버는 탈락인데 클라는 모른다` });
    }
  }

  // 9. ELO 는 한 번만 — ratingChange 가 기록됐다면 값이 일관돼야 한다.
  const withChange = (r.finalState?.players ?? []).filter((p: any) => p.ratingChange !== undefined);
  if (withChange.length > 0 && withChange.length !== (r.finalState?.players ?? []).length) {
    v.push({ rule: 'ELO', detail: `ratingChange 가 일부에만 기록됨(${withChange.length}/${(r.finalState?.players ?? []).length})` });
  }

  // 10. 방이 지워졌으면 하위 경로도 남으면 안 된다.
  if (r.leftovers.length > 0) {
    v.push({ rule: '고아 노드', detail: r.leftovers.join(', ') });
  }

  // 11. 클라이언트가 스스로 기록한 오류
  for (const t of [ta, tb]) {
    for (const e of t.errors) v.push({ rule: '클라 오류', detail: `${t.uid}: ${e}` });
  }
  for (const e of r.eventErrors) v.push({ rule: '이벤트 오류', detail: e });

  return v;
}

export { simDisconnect, simReconnect, readServer };
