// sim/parity/determinism.sim.ts
// P0e — 결정론 & desync 전수 검증
// 실행: npm run sim:determinism
//
// 멀티는 "양쪽 클라이언트가 각자 전투를 돌리고 같은 결과를 봐야" 성립한다(권위 서버 없음).
// 한 번이라도 갈리면 한쪽 화면에서만 이긴 상태가 되므로, 여기서는 세 가지를 전수로 본다:
//   1) 재실행 동일성  — 같은 입력·같은 시드면 몇 번을 돌려도 완전히 같은가 (전 엔진)
//   2) desync        — 보드 전쌍 × 시드 × 배치방식으로 2클라이언트 구동해 승자가 일치하는가
//   3) 진영 대칭성    — 거울전에서 L/R(=p1/p2) 어느 쪽도 유리하지 않은가 (전 보드)
//
// 기존 검사는 보드 1쌍 × 80시드였다. 특정 조합에서만 갈리는 버그는 그걸로 못 잡는다.

import { describe, it, expect } from 'vitest';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { cardBattleService, buildBattleCard } from '../../src/services/CardBattleService';
import { pokeAPI } from '../../src/api/pokeapi';
import { buildAllBoards } from '../pvp/boards';
import {
  runArenaBattle, runArenaBattleTwoClients, roleBasedPlacements,
  randomPlacements, defaultPlacements,
} from '../pvp/arenaRunner';
import { writeReport, writeMetrics, mdTable, pct } from '../support/report';

const DESYNC_SEEDS = Number(process.env.SIM_DESYNC_SEEDS ?? 10);
// [표본] 60이면 밴드가 ±13%p라 8보드 중 7개가 50% 아래로 몰리는 '패턴'이 노이즈로 생겼다.
//   200이면 ±7%p. 파일 전체가 몇 초라 표본을 아낄 이유가 없다.
const MIRROR_SEEDS = Number(process.env.SIM_MIRROR_SEEDS ?? 200);

describe('P0e: 결정론 & desync 전수', () => {
  it('재실행 동일성 — 같은 시드면 전 엔진이 완전히 같은 결과', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const findings: string[] = [];

    // ── AI서비스: 승자·잔존·로그 전체(데미지 시퀀스까지) 동일해야 ────────────
    for (let i = 0; i < boards.length - 1; i++) {
      const a = boards[i].details, b = boards[i + 1].details;
      const sig = () => {
        const r = pvpBattleService.simulateBattle(a, b, 'pA', 'pB', 7);
        return JSON.stringify({
          w: r.winnerId, p1: r.player1RemainingPokemon, p2: r.player2RemainingPokemon,
          log: r.battleLog.map(l => `${l.turn}:${l.attackerId}>${l.targetId}:${l.damage}:${l.isCrit ? 1 : 0}`),
        });
      };
      const first = sig();
      for (let k = 0; k < 3; k++) {
        if (sig() !== first) findings.push(`AI서비스 ${boards[i].name} vs ${boards[i + 1].name}`);
      }
    }

    // ── 아레나: 최종 유닛 HP 벡터까지 동일해야 ──────────────────────────────
    for (let i = 0; i < boards.length - 1; i++) {
      const a = boards[i].details, b = boards[i + 1].details;
      const sig = () => JSON.stringify(runArenaBattle(a, b, 4242));
      const first = sig();
      for (let k = 0; k < 3; k++) {
        if (sig() !== first) findings.push(`아레나 ${boards[i].name} vs ${boards[i + 1].name}`);
      }
    }

    // ── 카드: 승자·턴수·로그 동일해야 ───────────────────────────────────────
    const mk = async (ids: number[], side: 'player' | 'enemy') => {
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const p = await pokeAPI.getPokemon(ids[i]);
        out.push(buildBattleCard(p, {
          stars: 3, row: i < 3 ? 'front' : 'back', slot: i % 3, side, uid: `${side}-${i}`,
        }));
      }
      return out;
    };
    const cp = await mk([1, 4, 7, 25, 39, 52], 'player');
    const ce = await mk([10, 13, 16, 19, 21, 23], 'enemy');
    const cardSig = () => {
      const r = cardBattleService.simulate(cp.map(c => ({ ...c })), ce.map(c => ({ ...c })), 909);
      return JSON.stringify({
        w: r.winner, t: r.turns,
        log: r.log.map(l => `${l.turn}:${l.attackerUid}>${l.targetUid}:${l.damage}`),
      });
    };
    const cardFirst = cardSig();
    for (let k = 0; k < 3; k++) if (cardSig() !== cardFirst) findings.push('카드');

    console.log(`  재실행 동일성: ${findings.length === 0 ? '전 엔진 통과' : `실패 ${findings.join(', ')}`}`);
    expect(findings).toEqual([]);
  }, 300_000);

  it('desync 전수 — 보드 전쌍 × 시드 × 배치방식', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const n = boards.length;

    // 배치방식을 바꿔가며 본다. 배치는 클라이언트마다 로컬 상태로 들고 있다가 서로 주고받는
    // 값이라, 배치가 비대칭일수록 desync가 드러나기 쉽다.
    const schemes: Array<{ name: string; a: (t: never[], i: number) => unknown; }> = [];
    let total = 0, mismatch = 0;
    const bad: string[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = boards[i].details, B = boards[j].details;
        for (let s = 1; s <= DESYNC_SEEDS; s++) {
          const variants = [
            { name: '기본배치', pa: defaultPlacements(Math.min(6, A.length), 'L'), pb: defaultPlacements(Math.min(6, B.length), 'R') },
            { name: '역할배치', pa: roleBasedPlacements(A, 'L'), pb: roleBasedPlacements(B, 'R') },
            { name: '비대칭(역할 vs 반전)', pa: roleBasedPlacements(A, 'L'), pb: roleBasedPlacements(B, 'R', true) },
            {
              name: '무작위',
              pa: randomPlacements(Math.min(6, A.length), 'L', mulberry32(s * 31)),
              pb: randomPlacements(Math.min(6, B.length), 'R', mulberry32(s * 37)),
            },
          ];
          for (const vr of variants) {
            const r = runArenaBattleTwoClients(A, B, 800_000 + s, { placementsA: vr.pa, placementsB: vr.pb });
            total++;
            if (!r.agree) {
              mismatch++;
              if (bad.length < 5) bad.push(`${boards[i].name} vs ${boards[j].name} / ${vr.name} / seed ${s}`);
            }
          }
        }
      }
    }

    console.log(`  desync 전수: ${total}판 (${(n * (n - 1)) / 2}쌍 × 시드 ${DESYNC_SEEDS} × 배치 4종) → 불일치 ${mismatch}건`);
    bad.forEach(b => console.log(`    ✗ ${b}`));
    writeMetrics('determinism', { desyncRuns: total, desyncMismatch: mismatch, examples: bad });
    expect(mismatch).toBe(0);
    void schemes;
  }, 900_000);

  it('진영 대칭성 — 전 보드 거울전에서 어느 진영도 유리하지 않아야', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const rows: Array<[string, string, string]> = [];
    const offenders: string[] = [];

    for (const b of boards) {
      // AI서비스: p1(uid 사전순 앞)이 이기는 비율
      let p1 = 0;
      for (let s = 1; s <= MIRROR_SEEDS; s++) {
        if (pvpBattleService.simulateBattle(b.details, b.details, 'pA', 'pB', s).winnerId === 'pA') p1++;
      }
      // 아레나: L진영이 이기는 비율
      let lWin = 0;
      for (let s = 1; s <= MIRROR_SEEDS; s++) {
        if (runArenaBattle(b.details, b.details, 900_000 + s).myWon) lWin++;
      }
      const svcRate = p1 / MIRROR_SEEDS;
      const arenaRate = lWin / MIRROR_SEEDS;
      rows.push([b.name, pct(svcRate), pct(arenaRate)]);
      // 표본 노이즈를 감안한 밴드(95% CI 반폭 ×1.5). 이 밖이면 구조적 편향으로 본다.
      const band = 1.5 * 1.96 * Math.sqrt(0.25 / MIRROR_SEEDS);
      if (Math.abs(svcRate - 0.5) > band) offenders.push(`AI서비스 ${b.name} ${pct(svcRate)}`);
      if (Math.abs(arenaRate - 0.5) > band) offenders.push(`아레나 ${b.name} ${pct(arenaRate)}`);
    }

    let md = `# 결정론 & 진영 공정성 (전수)\n\n`;
    md += `## 거울전 진영 승률 (보드별, 시드 ${MIRROR_SEEDS})\n\n`;
    md += `같은 보드끼리 붙이면 50%가 나와야 한다. 벗어나면 "먼저 행동하는 진영"이 유리하다는 뜻이다.\n\n`;
    md += mdTable(['보드', 'AI서비스 p1 승률', '아레나 L 승률'], rows);
    md += `\n> 밴드 ±13%p (n=${MIRROR_SEEDS}의 노이즈 폭). 이 밖이면 구조적 편향.\n`;
    writeReport('determinism', md);

    console.log('  거울전 진영 편향:');
    rows.forEach(r => console.log(`    ${r[0].padEnd(12)} AI ${r[1]} / 아레나 ${r[2]}`));
    offenders.forEach(o => console.log(`    ⚠️ ${o}`));
    expect(offenders).toEqual([]);
  }, 900_000);
});
