// sim/multi/multi.sim.ts
// P2 — 멀티플레이 몬테카를로: 8인 팟 × 시드
// 실행: npm run sim:multi
//   환경변수: SIM_GAMES(기본 2), SIM_MULTI_MAP(기본 medium_merge), SIM_ENGINE(arena|service)
//
// 측정(개발자 시그널 대응):
//   - 게임 길이(라운드/배틀 수)          ← "멀티가 너무 빨리 끝남, 알바 못 씀"
//   - 라이프 손실 출처 분해(PvE vs PvP)  ← "탈락 주원인이 뭐냐"
//   - 데스 스파이럴(2연패 후 회복률)      ← "지면 돈 없어 회복 못해 계속 내줌"
//   - 연패형 페르소나 EV                 ← "의도적 연패, 리턴 부족하다더라"

import { describe, it, expect } from 'vitest';
import { runMultiGame, MultiGameResult } from './orchestrator';
import { writeReport, writeMetrics, mdTable, pct, fx } from '../support/report';

const GAMES = Number(process.env.SIM_GAMES ?? 2);
// 기본 easiest: 봇이 사람보다 약해 어려운 맵에선 PvE 전멸이 배틀 신호를 덮는다.
// 어려운 방 기준을 보려면 SIM_MULTI_MAP=medium_merge 등으로 실행.
const MAP_ID = process.env.SIM_MULTI_MAP ?? 'easiest_straight';
const ENGINE = (process.env.SIM_ENGINE ?? 'arena') as 'arena' | 'service';

// 8인 팟: 실플레이 분포 근사 (버티기 3, 리롤 2, 알바 1, 테라 1, 연패 1)
const POD = ['holdout', 'holdout', 'holdout', 'reroller', 'reroller', 'worker', 'tera', 'lossStreaker'];

describe('P2: 멀티 8인 팟 몬테카를로', () => {
  it(`팟(${POD.length}인) × ${GAMES}게임 (engine=${ENGINE})`, async () => {
    const games: MultiGameResult[] = [];

    for (let g = 0; g < GAMES; g++) {
      const t0 = performance.now();
      const r = await runMultiGame({
        seed: 500_000 + g * 7919,
        pod: POD,
        mapId: MAP_ID,
        engine: ENGINE,
      });
      games.push(r);
      const wall = ((performance.now() - t0) / 1000).toFixed(0);
      console.log(
        `[multi] game${g}: ${r.rounds}라운드/${r.battles}배틀, 우승 ${r.winnerPersona} (실행 ${wall}s)`
      );
      for (const p of [...r.players].sort((a, b) => a.placement - b.placement)) {
        console.log(
          `  #${p.placement} ${p.persona}: PvE누수 ${p.pveLivesLost} PvP손실 ${p.pvpLivesLost} 배틀골드 ${p.battleGold} (${p.wins}승${p.losses}패${p.eliminatedRound ? `, R${p.eliminatedRound} 탈락` : ''})`
        );
      }
    }

    // ── 집계 ─────────────────────────────────────────────────────────────
    const roundsArr = games.map(g2 => g2.rounds);
    const battlesArr = games.map(g2 => g2.battles);

    // 페르소나별 평균 순위/승률
    const personaAgg = new Map<string, { placements: number[]; pve: number[]; pvp: number[]; gold: number[] }>();
    for (const g2 of games) {
      for (const p of g2.players) {
        if (!personaAgg.has(p.persona)) personaAgg.set(p.persona, { placements: [], pve: [], pvp: [], gold: [] });
        const a = personaAgg.get(p.persona)!;
        a.placements.push(p.placement);
        a.pve.push(p.pveLivesLost);
        a.pvp.push(p.pvpLivesLost);
        a.gold.push(p.battleGold);
      }
    }

    // 라이프 손실 출처 (전체)
    const totalPvE = games.flatMap(g2 => g2.players).reduce((s, p) => s + p.pveLivesLost, 0);
    const totalPvP = games.flatMap(g2 => g2.players).reduce((s, p) => s + p.pvpLivesLost, 0);

    // 데스 스파이럴: 2연패 직후 다음 배틀 승률
    let spiralNext = 0, spiralWins = 0;
    for (const g2 of games) {
      for (const p of g2.players) {
        const fights = p.battleResults.filter(b => !b.bye);
        for (let i = 2; i < fights.length; i++) {
          if (!fights[i - 1].won && !fights[i - 2].won) {
            spiralNext++;
            if (fights[i].won) spiralWins++;
          }
        }
      }
    }
    const spiralRecovery = spiralNext > 0 ? spiralWins / spiralNext : NaN;

    // ── 리포트 ────────────────────────────────────────────────────────────
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

    let md = `# 멀티플레이 몬테카를로 (${ENGINE} 엔진)\n\n`;
    md += `- 팟: ${POD.join(', ')} / 맵 ${MAP_ID} / ${GAMES}게임\n\n`;
    md += `## 게임 길이\n\n`;
    md += `- 라운드: ${roundsArr.join(', ')} (평균 ${fx(avg(roundsArr), 1)})\n`;
    md += `- 배틀 수: ${battlesArr.join(', ')} (평균 ${fx(avg(battlesArr), 1)})\n`;
    md += `- 참고: 개발자 체감 "배틀 5번쯤이면 결판". 알바 해금은 근무 5웨이브(=파견 후 5라운드) 필요.\n\n`;

    md += `## 페르소나 성적 (평균 순위 낮을수록 강함)\n\n`;
    md += mdTable(
      ['페르소나', '평균 순위', 'PvE 누수(평균)', 'PvP 손실(평균)', '배틀골드(평균)'],
      [...personaAgg.entries()].sort((a, b) => avg(a[1].placements) - avg(b[1].placements))
        .map(([name, a]) => [
          name, fx(avg(a.placements), 2), fx(avg(a.pve), 1), fx(avg(a.pvp), 1), Math.round(avg(a.gold)),
        ])
    );

    md += `\n## 라이프 손실 출처\n\n`;
    md += `- PvE 누수: ${totalPvE} (${pct(totalPvE / Math.max(1, totalPvE + totalPvP))})\n`;
    md += `- PvP 패배: ${totalPvP} (${pct(totalPvP / Math.max(1, totalPvE + totalPvP))})\n\n`;

    md += `## 데스 스파이럴\n\n`;
    md += `- 2연패 직후 다음 배틀 승률: ${Number.isNaN(spiralRecovery) ? '표본 없음' : pct(spiralRecovery)} (표본 ${spiralNext})\n`;
    md += `- 50%보다 크게 낮으면 연패가 연패를 부르는 구조 = 위로금 커브 보강 필요.\n`;

    writeReport('multi-runs', md);
    writeMetrics('multi-runs', {
      games: GAMES, engine: ENGINE, mapId: MAP_ID, pod: POD,
      avgRounds: avg(roundsArr), avgBattles: avg(battlesArr),
      lifeLoss: { pve: totalPvE, pvp: totalPvP },
      spiralRecovery, spiralSamples: spiralNext,
      personas: Object.fromEntries(
        [...personaAgg.entries()].map(([name, a]) => [name, {
          avgPlacement: avg(a.placements),
          avgPveLoss: avg(a.pve), avgPvpLoss: avg(a.pvp), avgBattleGold: avg(a.gold),
        }])
      ),
      raw: games,
    });

    expect(games.length).toBe(GAMES);
    for (const g2 of games) {
      // 하네스 무결성: 순위가 1..8 전부 배정됐는지
      const placements = g2.players.map(p => p.placement).sort((a, b) => a - b);
      expect(placements).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
});
