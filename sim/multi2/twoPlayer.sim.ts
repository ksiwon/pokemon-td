// sim/multi2/twoPlayer.sim.ts
// P-2: 2인 멀티플레이 프로토콜 검증 — 실 MultiplayerService + 실 전투엔진 + 인메모리 RTDB.
// 실행: npm run sim:2p
//
// 여기서 재는 것은 밸런스가 아니라 **동기화 정확성**이다:
//   두 사람이 각자 브라우저를 켜고 같은 방에서 놀 때 서로 다른 것을 보게 되는가?
//   지연·이탈·크래시·재접속·보드 변경이 섞여도 게임이 끝나는가? 보상이 정확히 한 번 들어가는가?
//
// 두 클라이언트는 서로 다른 모듈 그래프에서 돈다(각자의 gameStore·MultiplayerService).
// 공유하는 것은 인메모리 RTDB 하나뿐 — 실제 두 대의 브라우저와 같은 구조다.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { buildBoard } from '../support/teamBuilder';
import { BOARD_SPECS } from '../pvp/boards';
import type { TowerDetail } from '../../src/types/multiplayer';
import {
  runTwoPlayerMatch, checkInvariants, readServer, PlayerSpec, MatchResult, Violation,
} from './match';
import { teamFingerprint } from './client';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { writeReport, writeMetrics, mdTable } from '../support/report';

const A = 'u_alice';
const B = 'u_bob';

let boardA: TowerDetail[] = [];
let boardB: TowerDetail[] = [];
let boardStrong: TowerDetail[] = [];
let boardTank: TowerDetail[] = [];

const spec = (name: string) => BOARD_SPECS.find(s => s.name === name)!;

interface Row {
  scenario: string; rounds: number; battles: number; endedBy: string;
  violations: Violation[]; note: string; virtualSec: number;
}
const rows: Row[] = [];

function P(
  uid: string, clientId: string, board: TowerDetail[],
  latencyMs: number, waveMs: number,
  extra: Partial<PlayerSpec> = {},
): PlayerSpec {
  return {
    uid, clientId, board, latencyMs,
    waveMs: () => waveMs,
    pveLeak: () => 0,
    goldGain: () => 60,
    ...extra,
  };
}

function record(scenario: string, r: MatchResult, note = ''): Violation[] {
  const v = checkInvariants(r, [A, B]);
  rows.push({
    scenario, rounds: r.rounds, battles: r.battlesResolved, endedBy: r.endedBy,
    violations: v, note, virtualSec: Math.round(r.virtualMs / 1000),
  });
  if (v.length > 0) {
    console.log(`[2p] ${scenario} — 위반 ${v.length}건 (R${r.rounds}, 배틀 ${r.battlesResolved})`);
    for (const x of v) console.log(`      · ${x.rule}: ${x.detail}`);
  } else {
    console.log(`[2p] ${scenario} — OK (R${r.rounds}, 배틀 ${r.battlesResolved}, ${r.endedBy}, 가상 ${Math.round(r.virtualMs / 1000)}s)`);
  }
  return v;
}

describe('P-2: 2인 멀티플레이 프로토콜', () => {
  beforeAll(async () => {
    // ⚠ 보드 생성 전에 반드시 시드를 고정한다. mapAbilityToGameEffect 는 매핑 목록에 없는
    //   특성에 rng() 로 효과를 하나 뽑는데(crit1.5/lifesteal0.1/speed1.2/tank0.85), 기본 난수원이
    //   Math.random 이라 안 잡으면 실행마다 보드가 달라진다. critChance 를 와이어에 태우기
    //   전에는 그 추첨이 멀티 결과에 영향이 없어 들키지 않았다 — 지금은 있다.
    //   (다른 시뮬과 같은 시드 20260711 사용)
    setRngSource(mulberry32(20260711));
    boardA = (await buildBoard('nosyn6', '', spec('nosyn6').members)).details;
    boardB = (await buildBoard('gen1x6', '', spec('gen1x6').members)).details;
    boardStrong = (await buildBoard('water6', '', spec('water6').members)).details;
    boardTank = (await buildBoard('tank6', '', spec('tank6').members)).details;
  }, 120_000);

  afterEach(() => { vi.useRealTimers(); });

  // ── S0: 입력 결정론 가드 ───────────────────────────────────────────────────
  // 이 파일의 모든 결론은 "보드가 매 실행 같다"에 기대고 있다. 시드 고정이 빠지면
  // 미매핑 특성이 Math.random 으로 추첨돼 조용히 실행마다 다른 게임을 재게 된다.
  it('S0 보드 결정론 — 같은 시드면 특성까지 같은 보드가 나온다', async () => {
    setRngSource(mulberry32(20260711));
    const again = (await buildBoard('nosyn6', '', spec('nosyn6').members)).details;
    const vec = (b: TowerDetail[]) =>
      b.map(t => `${t.ability?.effect ?? '-'}×${t.ability?.value ?? 0}|${t.critChance}|${t.lifesteal}`);
    // beforeAll 이 같은 시드로 만든 것과 일치해야 한다(= beforeAll 에 시드가 실제로 걸려 있다).
    expect(vec(again)).toEqual(vec(boardA));
    setRngSource(mulberry32(20260711));
  }, 120_000);

  // ── S1: 기준선 ─────────────────────────────────────────────────────────────
  it('S1 정상 대칭 — 지연 20ms, 웨이브 동시 종료', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 20, 8000)],
      maxRounds: 7,
    });
    expect(record('S1 정상 대칭', r)).toEqual([]);
    expect(r.rounds).toBeGreaterThanOrEqual(6);
    expect(r.battlesResolved).toBe(2);
  }, 300_000);

  // ── S2: 비대칭 지연 ────────────────────────────────────────────────────────
  it('S2 비대칭 지연 — 20ms vs 600ms', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 600, 8000)],
      maxRounds: 7,
    });
    expect(record('S2 비대칭 지연(20/600ms)', r)).toEqual([]);
    expect(r.battlesResolved).toBe(2);
  }, 300_000);

  // ── S3: 웨이브 완료 시점 어긋남 ────────────────────────────────────────────
  it('S3 웨이브 배리어 — 한쪽은 4초, 한쪽은 25초', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 4000), P(B, 'cB', boardB, 20, 25000)],
      maxRounds: 7,
    });
    const v = record('S3 웨이브 배리어(4s/25s)', r,
      '느린 쪽이 끝날 때까지 빠른 쪽이 다음 라운드로 못 가야 한다');
    expect(v).toEqual([]);
    // 배리어가 살아 있으면 두 클라이언트가 본 라운드 수열이 같아야 한다.
    const roundsA = [...new Set(r.traces[A].phases.map(p => p.round))];
    const roundsB = [...new Set(r.traces[B].phases.map(p => p.round))];
    expect(roundsA).toEqual(roundsB);
  }, 300_000);

  // ── S4: 시계 오차 ──────────────────────────────────────────────────────────
  it('S4 시계 오차 — 한쪽 클라 시계가 8초 빠름', async () => {
    const r = await runTwoPlayerMatch({
      players: [
        P(A, 'cA', boardA, 20, 8000),
        P(B, 'cB', boardB, 20, 8000, { clockSkewMs: -8000 }),
      ],
      maxRounds: 7,
    });
    expect(record('S4 시계 오차(-8s)', r,
      'phaseEndTime 은 서버 시각 기준 — serverTimeOffset 보정이 없으면 한쪽이 먼저 전환을 밀어붙인다')).toEqual([]);
  }, 300_000);

  // ── S5: 중간 이탈 ──────────────────────────────────────────────────────────
  it('S5 정상 이탈 — 한쪽이 leaveRoom 으로 나가면 게임이 끝난다', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 20, 8000)],
      maxRounds: 12,
      events: [{
        atMs: 120_000, label: 'B leaveRoom',
        run: (ctx) => ctx.clients[B].leave(),
      }],
    });
    const v = record('S5 정상 이탈', r, 'leaveRoom → isAlive=false → 남은 1인 → 게임오버');
    expect(v).toEqual([]);
    expect(r.endedBy).toBe('gameover');
    expect(r.traces[A].gameOverSeen).toBe(true);
  }, 300_000);

  // ── S6: 크래시(무응답) ─────────────────────────────────────────────────────
  it('S6 크래시 — 탭이 죽으면 90초 몰수 워치독이 게임을 끝낸다', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 20, 8000)],
      maxRounds: 20,
      maxVirtualMs: 10 * 60 * 1000,
      events: [{
        atMs: 100_000, label: 'B crash',
        run: (ctx) => { ctx.clients[B].crash(); },
      }],
    });
    const v = record('S6 크래시 + 몰수', r,
      'presence offline 90초 → 남은 심판이 playerDefeated 로 몰수');
    expect(v).toEqual([]);
    expect(r.endedBy).toBe('gameover');
  }, 300_000);

  // ── S7: 크래시 후 재접속 ───────────────────────────────────────────────────
  it('S7 재접속 — 끊겼다 돌아와도 서버 상태로 복원되고 게임이 이어진다', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 20, 8000)],
      maxRounds: 10,
      // 웨이브 도중에 끊고(= A 쪽 웨이브 교착 워치독이 대신 완료 처리해야 함),
      // 배틀 라운드(R3)에 닿기 전에 복귀시킨다. 배틀을 걸치는 경우는 S11이 따로 잰다.
      events: [
        { atMs: 64_000, label: 'B crash (R1 웨이브 중)', run: (ctx) => { ctx.clients[B].crash(); } },
        { atMs: 80_000, label: 'B rejoin', run: (ctx) => ctx.clients[B].rejoin() },
      ],
    });
    const v = record('S7 크래시 → 재접속', r, 'R1 웨이브 중 끊김 → 워치독이 진행 → 복귀 후 정상 합류');
    expect(v).toEqual([]);
    // 몰수당하지 않고 살아 있어야 한다.
    const bState = (r.finalState?.players ?? []).find((p: any) => p.userId === B);
    expect(bState?.isAlive).toBe(true);
  }, 300_000);

  // ── S8: 배틀 직전 보드 변경 ────────────────────────────────────────────────
  it('S8 배틀 직전 보드 변경 — 타워 업로드 스로틀(3초)과의 경쟁', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardA, 20, 8000), P(B, 'cB', boardB, 20, 8000)],
      maxRounds: 7,
      events: [{
        // waiting_battle 카운트다운(10초) 안에 B 가 보드를 통째로 갈아치운다.
        // 타워 업로드 스로틀이 3초라 "전파 완료"와 "배틀 시작"이 겹치는 구간이다.
        when: (gs) => gs.currentPhase === 'waiting_battle' && gs.currentRound === 3,
        label: 'B 보드 교체',
        run: (ctx) => { ctx.clients[B].setBoard(boardTank); },
      }],
    });
    const v = record('S8 배틀 직전 보드 변경', r,
      '양쪽이 서로 다른 보드를 보고 싸우면 아레나 입력 동일성 위반으로 잡힌다');
    expect(v).toEqual([]);

    // 창을 실제로 통과했는지 확인 — 교체한 보드가 R3 전투 입력에 반영됐어야 의미가 있다.
    const b3 = r.traces[B].localBattles.find(x => x.round === 3);
    expect(b3).toBeTruthy();
    expect(b3!.myTeamFp).toBe(teamFingerprint(boardTank));
  }, 300_000);

  // ── S9: 전멸까지 완주 ──────────────────────────────────────────────────────
  it('S9 완주 — 일방적 매치업으로 탈락까지 간다 (순위·ELO 확정)', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardStrong, 20, 6000), P(B, 'cB', boardTank, 20, 6000)],
      maxRounds: 60,
      maxVirtualMs: 25 * 60 * 1000,
    });
    const v = record('S9 완주(전멸)', r, '패자 라이프 0 → playerDefeated → finalizeGame');
    expect(v).toEqual([]);
    expect(r.endedBy).toBe('gameover');
    const players = r.finalState?.players ?? [];
    const placements = players.map((p: any) => p.placement).filter((x: any) => x !== undefined).sort();
    expect(placements).toEqual([1, 2]);
  }, 600_000);

  // ── S11: 배틀 중 접속 끊김 = 패배 페널티 회피? ─────────────────────────────
  // PvP 보상은 서버가 아니라 **클라이언트**가 적용한다(휴먼 한정 — submitBattleResult 는
  // battleRecord 만 갱신하고 money/lives 는 AI 에게만 쓴다). 예전 구현은 적용 조건이
  // `roundNumber === currentRound` 라, 결과가 도착하는 그 창에 오프라인이면 패배 페널티가
  // 영영 사라졌다(재접속 경로가 lastAppliedRound 를 올려 한 번 더 막았다).
  // → 누적 원장(rewardLedger/appliedReward)으로 고친 뒤, 재접속 시 정확히 한 번 정산되는지 검증.
  it('S11 배틀 중 끊김 — 패배 페널티가 재접속 후 정확히 한 번 정산된다', async () => {
    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardStrong, 20, 6000), P(B, 'cB', boardTank, 20, 6000)],
      maxRounds: 8,
      events: [
        {
          when: (gs) => gs.currentPhase === 'battle' && gs.currentRound === 3,
          label: 'B crash (배틀 시작 직후)',
          run: (ctx) => { ctx.clients[B].crash(); },
        },
        {
          when: (gs) => gs.currentRound >= 4,
          label: 'B rejoin',
          run: (ctx) => ctx.clients[B].rejoin(),
        },
      ],
    });

    const r3 = r.observedResults.find(x => x.roundNumber === 3);
    const penalty = r3 ? (B === r3.player1Id ? r3.rewardP1 : r3.rewardP2) : null;
    const bFinal = (r.finalState?.players ?? []).find((p: any) => p.userId === B);
    const tb = r.traces[B];
    // 끊긴 동안의 몫은 재접속 정산으로 들어온다(라운드 단위가 아니라 원장 차이라서).
    const settled = tb.rewards.filter(x => x.viaRejoin);
    const settledLives = settled.reduce((s, x) => s + x.lives, 0);

    const v = checkInvariants(r, [A, B]);
    const note = r3
      ? `R3 기록된 B 보상 ${JSON.stringify(penalty)}`
        + ` / 재접속 정산 lives ${settledLives}`
        + ` / 서버 원장 ${JSON.stringify(bFinal?.rewardLedger)} = 클라 반영 ${JSON.stringify(tb.appliedLedger)}`
      : 'R3 결과 없음';
    rows.push({
      scenario: 'S11 배틀 중 끊김', rounds: r.rounds, battles: r.battlesResolved,
      endedBy: r.endedBy, virtualSec: Math.round(r.virtualMs / 1000),
      violations: v, note,
    });
    console.log(`[2p] S11 배틀 중 끊김 — ${note}`);
    for (const x of v) console.log(`      · ${x.rule}: ${x.detail}`);

    expect(r3).toBeTruthy();
    // 페널티가 실재했는데(패배) 정산이 0이면 그게 바로 예전 버그다.
    expect(penalty!.lives).toBeLessThan(0);
    expect(settledLives).toBeLessThan(0);
    // 정산 완결 + 중복 없음 (불변식 6·7)
    expect(v).toEqual([]);
    expect(bFinal?.rewardLedger?.lives).toBe(tb.appliedLedger.lives);
  }, 300_000);

  // ── S12: 풀 프로세스 e2e ───────────────────────────────────────────────────
  // 로비 → 방 생성/참가/레디 → 게임 시작 → 웨이브·배틀 교차 → 배틀 중 크래시 → 재접속
  // → 정산 → 전멸 → 순위·ELO 확정 → 방 삭제까지 한 판으로 통과시킨다.
  // 세 수정(원장 정산 / critChance 와이어 / 특성 복원)이 **동시에** 걸린 경로다.
  it('S12 풀 프로세스 e2e — 로비부터 방 정리까지 한 판', async () => {
    /** 와이어에 올라간 보드의 "특성 지문" — 재접속 재업로드에서 파생값이 죽는지 본다. */
    const abilityVector = (node: any): string[] =>
      ((node?.towers ?? []) as any[]).map(t =>
        `${t.ability?.effect ?? '-'}×${t.ability?.value ?? 0}|crit=${(t.critChance ?? 0).toFixed(4)}|ls=${t.lifesteal ?? 0}`);
    const snap: { before?: string[]; after?: string[] } = {};

    const r = await runTwoPlayerMatch({
      players: [P(A, 'cA', boardStrong, 40, 6000), P(B, 'cB', boardTank, 120, 6000)],
      maxRounds: 40,
      maxVirtualMs: 25 * 60 * 1000,
      events: [
        {
          when: (gs) => gs.currentPhase === 'battle' && gs.currentRound === 3,
          label: 'B 보드 지문 기록 + 크래시',
          run: (ctx) => {
            snap.before = abilityVector(readServer(`towerDetails/${ctx.roomId}/${B}`));
            ctx.clients[B].crash();
          },
        },
        {
          when: (gs) => gs.currentRound >= 4,
          label: 'B 재접속 → 재업로드 직후 지문 기록',
          run: async (ctx) => {
            await ctx.clients[B].rejoin();   // 내부에서 flushTowerUpdate 까지 끝낸다
            snap.after = abilityVector(readServer(`towerDetails/${ctx.roomId}/${B}`));
          },
        },
      ],
    });

    const tb = r.traces[B];
    const bFinal = (r.finalState?.players ?? []).find((p: any) => p.userId === B);
    const v = record('S12 풀 프로세스 e2e', r,
      `재접속 정산 ${JSON.stringify(tb.rewards.filter(x => x.viaRejoin))}`);
    expect(v).toEqual([]);

    // (1) 게임이 실제로 끝났고 순위·ELO 가 확정됐다.
    expect(r.endedBy).toBe('gameover');
    const players = r.finalState?.players ?? [];
    expect(players.map((p: any) => p.placement).filter((x: any) => x !== undefined).sort())
      .toEqual([1, 2]);
    expect(players.every((p: any) => p.ratingChange !== undefined)).toBe(true);

    // (2) 끊긴 동안의 보상이 정확히 한 번 정산됐다(원장 = 반영).
    expect(tb.rewards.some(x => x.viaRejoin)).toBe(true);
    expect(bFinal?.rewardLedger?.lives).toBe(tb.appliedLedger.lives);
    expect(bFinal?.rewardLedger?.gold).toBe(tb.appliedLedger.gold);

    // (3) 재접속 재업로드가 특성을 죽이지 않았다.
    expect(snap.before).toBeTruthy();
    expect(snap.after).toEqual(snap.before);

    // (4) 이 시나리오가 실제로 크리 특성을 태웠는지 — 아니면 (3)이 공허하게 통과한다.
    const aWire = abilityVector(readServer(`towerDetails/${r.roomId}/${A}`));
    const crits = [...(snap.before ?? []), ...aWire].filter(s => s.includes('crit×2'));
    expect(crits.length).toBeGreaterThan(0);

    console.log(`[2p] S12 특성 지문 — 크래시 전 ${snap.before?.[0]} / 재접속 후 ${snap.after?.[0]}`);
  }, 900_000);

  // ── S10: 지연 조합 스윕 ────────────────────────────────────────────────────
  it('S10 지연 스윕 — 조합 전부에서 프로토콜 위반 0', async () => {
    const combos: Array<[number, number]> = [
      [10, 10], [10, 200], [10, 800], [200, 200], [300, 900], [900, 900],
    ];
    const failures: string[] = [];
    for (const [la, lb] of combos) {
      const r = await runTwoPlayerMatch({
        players: [P(A, 'cA', boardA, la, 7000), P(B, 'cB', boardB, lb, 9000)],
        maxRounds: 4,
      });
      const v = checkInvariants(r, [A, B]);
      if (v.length > 0) failures.push(`${la}/${lb}ms: ${v.map(x => `${x.rule}(${x.detail})`).join('; ')}`);
      if (r.battlesResolved < 1) failures.push(`${la}/${lb}ms: 배틀이 한 번도 성사되지 않음`);
    }
    rows.push({
      scenario: `S10 지연 스윕 (${combos.length}조합)`, rounds: 4, battles: combos.length,
      endedBy: 'maxRounds', violations: failures.map(f => ({ rule: '스윕', detail: f })),
      note: '10~900ms 왕복 조합', virtualSec: 0,
    });
    if (failures.length > 0) console.log('[2p] S10 실패:\n  ' + failures.join('\n  '));
    else console.log(`[2p] S10 지연 스윕 — ${combos.length}조합 전부 OK`);
    expect(failures).toEqual([]);
  }, 900_000);

  // ── 리포트 ─────────────────────────────────────────────────────────────────
  it('리포트 저장', () => {
    const total = rows.length;
    const clean = rows.filter(r => r.violations.length === 0).length;

    let md = '# 2인 멀티플레이 프로토콜 검증\n\n';
    md += '실 `MultiplayerService` + 실 전투엔진을 인메모리 RTDB(`sim/net/rtdb.ts`) 위에서 구동한다.\n';
    md += '두 클라이언트는 **모듈 그래프가 분리**되어 각자의 gameStore/서비스 인스턴스를 갖는다.\n\n';
    md += `- 시나리오 ${total}개 중 위반 0인 것: **${clean}**\n\n`;

    md += '## 시나리오별\n\n';
    md += mdTable(
      ['시나리오', '라운드', '배틀', '종료', '위반', '비고'],
      rows.map(r => [
        r.scenario, r.rounds, r.battles, r.endedBy,
        r.violations.length === 0 ? '없음' : `${r.violations.length}건`,
        r.note || '-',
      ]),
    );

    const allV = rows.flatMap(r => r.violations.map(v => ({ s: r.scenario, ...v })));
    if (allV.length > 0) {
      md += '\n## 위반 상세\n\n';
      md += mdTable(['시나리오', '규칙', '내용'], allV.map(v => [v.s, v.rule, v.detail]));
    }

    md += '\n## 검사한 불변식\n\n';
    md += [
      '1. 라운드 단조성 — 두 클라이언트 모두 라운드가 되돌아가지 않는다',
      '2. 진행 — 데드락 없이 라운드가 올라간다',
      '3. 결과 유일성 — 라운드×페어당 battleResults 는 1개 (동시 제출 방어)',
      '4. 양측 결과 일치 — 각자 자기 시야로 돌린 아레나의 승자/생존수가 같다',
      '5. 아레나 입력 동일성 — 두 클라가 같은 보드를 보고 싸웠다',
      '6. 보상 중복/누락 없음 — 적용한 델타의 합 = 클라가 반영했다고 기록한 원장',
      '7. 보상 정산 완결 — 서버 누적 원장 = 클라 반영 원장 (끊겼다 와도 정확히 한 번, 이탈자 제외)',
      '8. 최종 상태 일치 — 서버의 생존 여부를 클라가 알고 있다',
      '9. ELO 일관성 — ratingChange 는 전원 기록되거나 전원 미기록',
      '10. 고아 노드 없음 — 방이 지워지면 하위 경로도 사라진다',
      '11. 클라 자체 오류 로그 없음',
    ].map(s => `- ${s}`).join('\n') + '\n';

    writeReport('multi-2p-protocol', md);
    writeMetrics('multi-2p-protocol', {
      scenarios: total,
      cleanScenarios: clean,
      violations: allV,
      rows: rows.map(r => ({
        scenario: r.scenario, rounds: r.rounds, battles: r.battles,
        endedBy: r.endedBy, violations: r.violations.length,
      })),
    });
    expect(total).toBeGreaterThan(0);
  });
});
