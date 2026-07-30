// sim/pvp/pvpMatrix.sim.ts
// P0a — PvP 보드 풀리그 매트릭스 (PvPBattleService 엔진 = AI vs AI 결정론 시뮬)
// 실행: npm run sim:pvp
//
// 산출:
//   sim/reports/current/pvp-matrix.md        — 승률 매트릭스 + 골드효율 + 등가골드 검증
//   sim/reports/current/metrics/pvp-matrix.json

import { describe, it, expect } from 'vitest';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { buildAllBoards } from './boards';
import { writeReport, writeMetrics, mdTable, pct } from '../support/report';

const SEEDS_PER_PAIR = 40; // roundNumber 1..40 → 시드 40개 (deriveBattleSeed가 라운드 포함)

describe('P0a: PvP 보드 매트릭스', () => {
  it('풀리그 승률 매트릭스 + 골드 등가 검증', async () => {
    // 보드 생성(특성 fallback 랜덤 배정 등)도 결정론이 되도록 시드 고정
    setRngSource(mulberry32(20260711));

    const boards = await buildAllBoards();
    const n = boards.length;

    // ── 풀리그: 모든 쌍 × 시드 40 × 양방향(p1/p2 교대) ────────────────────
    // 예전엔 simulateBattle이 team1 전원 → team2 전원의 진영 순차라 선공 이점이 컸다(거울전 91.5%).
    // 지금은 양 팀 통합 스피드 정렬로 교정됐지만, 양방향 평균은 그대로 유지한다 —
    // 편향이 재발하면 firstMoverEdge 지표가 0.5를 벗어나 바로 드러난다(회귀 감시용).
    const winrate: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    let p1Wins = 0;
    let orderedGames = 0;

    const playOrdered = (i: number, j: number, round: number): boolean => {
      const result = pvpBattleService.simulateBattle(
        boards[i].details, boards[j].details,
        `sim_${boards[i].name}`, `sim_${boards[j].name}`,
        round
      );
      orderedGames++;
      const iWon = result.winnerId === `sim_${boards[i].name}`;
      if (iWon) p1Wins++;
      return iWon;
    };

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let iWins = 0;
        for (let round = 1; round <= SEEDS_PER_PAIR; round++) {
          if (playOrdered(i, j, round)) iWins++;          // i가 선공
          if (!playOrdered(j, i, round)) iWins++;         // j가 선공
        }
        winrate[i][j] = iWins / (SEEDS_PER_PAIR * 2);
        winrate[j][i] = 1 - winrate[i][j];
      }
      winrate[i][i] = 0.5;
    }

    const firstMoverEdge = p1Wins / orderedGames; // 0.5보다 크면 선공 이점

    // ── 지표 집계 ─────────────────────────────────────────────────────────
    const avgWin = boards.map((_, i) =>
      boards.reduce((s, _b, j) => (i === j ? s : s + winrate[i][j]), 0) / (n - 1)
    );
    // 골드효율 = 평균승률 / 구매골드(1000G당). 레벨업은 실전에서 XP로 무료라 구매가 기준.
    const buyGoldOf = (b: (typeof boards)[number]) => b.goldBreakdown.reduce((s, g) => s + g.buy, 0);
    const goldEff = boards.map((b, i) => avgWin[i] / (buyGoldOf(b) / 1000));

    // ── 핵심 실험 체크 ────────────────────────────────────────────────────
    const idx = (name: string) => boards.findIndex(b => b.name === name);
    const pair = (a: string, b: string) => winrate[idx(a)][idx(b)];

    // 이 엔진도 이제 getBuffedStats(시너지)를 적용한다 — 예전엔 미적용이라 인간전 아레나와
    //   전력이 달랐다(엔진 드리프트). 따라서 아래 타입/세대 보드 비교는 "타입 구성 가치 +
    //   시너지 버프"를 합쳐 측정한다. 위치/이동이 없는 점만 아레나와 다르다.
    const checks = [
      // [밴드 재조정] 예전 밴드(0.35~0.65)는 '시너지 미적용 엔진'에서 타입 구성만의 가치를
      //   재던 것이다. 이제 이 엔진도 시너지를 적용하므로 기대치는 "시너지 보드가 이긴다"로 바뀐다.
      //   과대 여부는 아래 magnitude 경고로 따로 감시(밴드에 섞으면 상시 WARN이 되어 신호가 죽는다).
      {
        name: '타입 시너지 가치 (water6 vs nosyn6, 등가골드)',
        value: pair('water6', 'nosyn6'),
        expect: '>0.55 (시너지를 맞춘 쪽이 이겨야 함)',
        pass: pair('water6', 'nosyn6') > 0.55,
      },
      {
        name: '세대 시너지 가치 (gen1x6 vs nosyn6, 등가골드)',
        value: pair('gen1x6', 'nosyn6'),
        expect: '>0.55 (시너지를 맞춘 쪽이 이겨야 함)',
        pass: pair('gen1x6', 'nosyn6') > 0.55,
      },
      {
        name: '진화 가치 (charizard3 vs charmander3, 동일 구매가/레벨)',
        value: pair('charizard3', 'charmander3'),
        expect: '>0.5 (진화가 이득이어야 함)',
        pass: pair('charizard3', 'charmander3') > 0.5,
      },
      // [참고 지표로 강등] 구매가 곡선이 k·(BST/600)^1.5 로 바뀌면서 이 두 보드는 더 이상
      //   등가골드가 아니다(nosyn6 ~603G vs expensive3 ~774G). 고정 로스터라 골드를 맞출 수
      //   없으므로 판정에서 빼고, 수량vs품질의 정식 측정은 sim:gold(goldValue.sim.ts)가 맡는다.
      //   그쪽은 매 실행마다 현재 가격 곡선을 역산해 동일 골드 보드를 새로 구성한다.
      {
        name: '수량vs품질 (참고용 — 등가골드 아님, 정식 측정은 npm run sim:gold)',
        value: pair('nosyn6', 'expensive3'),
        expect: `참고 (골드 ${buyGoldOf(boards[idx('nosyn6')])}G vs ${buyGoldOf(boards[idx('expensive3')])}G)`,
        pass: true,
      },
      {
        name: '선공(p1) 이점 — AI vs AI 매치는 userId 정렬순이 선공이 됨',
        value: firstMoverEdge,
        expect: '0.48~0.52 (이탈 시 선공이 유불리 = 공정성 문제)',
        pass: firstMoverEdge >= 0.48 && firstMoverEdge <= 0.52,
      },
    ];

    // ── 마크다운 리포트 ───────────────────────────────────────────────────
    let md = `# PvP 보드 매트릭스 (PvPBattleService 엔진)\n\n`;
    md += `- 엔진: AI vs AI 결정론 시뮬 (멀티에서 AI 매치·타임아웃 보충에 사용되는 코드 그대로)\n`;
    md += `- 시드: 쌍마다 roundNumber 1~${SEEDS_PER_PAIR}\n\n`;

    md += `## 보드 정의\n\n`;
    md += mdTable(
      ['보드', '설명', '구매골드', '시너지'],
      boards.map(b => [
        b.name, b.description, `${b.gold - b.goldBreakdown.reduce((s, g) => s + g.candy, 0)}G`,
        b.synergies.map(s => `${s.id}(${s.count})`).join(', ') || '—',
      ])
    );

    md += `\n## 승률 매트릭스 (행이 열을 이길 확률)\n\n`;
    md += mdTable(
      ['', ...boards.map(b => b.name)],
      boards.map((b, i) => [b.name, ...winrate[i].map(w => pct(w, 0))])
    );

    md += `\n## 파워 랭킹\n\n`;
    const ranking = boards
      .map((b, i) => ({ name: b.name, avg: avgWin[i], eff: goldEff[i], buyGold: b.goldBreakdown.reduce((s, g) => s + g.buy, 0) }))
      .sort((a, b) => b.avg - a.avg);
    md += mdTable(
      ['순위', '보드', '평균승률', '구매골드', '승률/1000G'],
      ranking.map((r, k) => [k + 1, r.name, pct(r.avg), `${r.buyGold}G`, r.eff.toFixed(2)])
    );

    md += `\n## 핵심 실험 체크\n\n`;
    md += mdTable(
      ['실험', '측정값', '기대', '판정'],
      checks.map(c => [c.name, pct(c.value), c.expect, c.pass ? '✅' : '⚠️'])
    );

    writeReport('pvp-matrix', md);
    writeMetrics('pvp-matrix', {
      seedsPerPair: SEEDS_PER_PAIR,
      firstMoverEdge,
      boards: boards.map((b, i) => ({
        name: b.name,
        buyGold: b.goldBreakdown.reduce((s, g) => s + g.buy, 0),
        synergies: b.synergies.map(s => `${s.id}:${s.count}`),
        avgWinRate: avgWin[i],
        goldEfficiency: goldEff[i],
      })),
      winrate: Object.fromEntries(boards.map((b, i) => [
        b.name,
        Object.fromEntries(boards.map((c, j) => [c.name, winrate[i][j]])),
      ])),
      checks: checks.map(c => ({ name: c.name, value: c.value, pass: c.pass })),
    });

    // 콘솔 요약
    console.log('\n=== PvP 매트릭스 요약 ===');
    ranking.forEach((r, k) => console.log(`${k + 1}. ${r.name}: 평균승률 ${pct(r.avg)} (구매 ${r.buyGold}G)`));
    checks.forEach(c => console.log(`${c.pass ? 'PASS' : 'WARN'} ${c.name}: ${pct(c.value)}`));

    // 시너지 과대 감시 — 무시너지 보드를 상대로 100%면 시너지가 승패를 단독 결정한다.
    for (const [a, b] of [['water6', 'nosyn6'], ['gen1x6', 'nosyn6']] as const) {
      const v = pair(a, b);
      if (v > 0.95) console.log(`SIGNAL 시너지 과대? ${a} vs ${b} = ${pct(v)} — 무시너지 보드가 전패`);
    }

    // 하네스 자체 무결성(밸런스 판정은 리포트로): 매트릭스가 완전하고 대칭 합이 1인지
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(winrate[i][j] + winrate[j][i]).toBeCloseTo(1, 5);
      }
    }
  });

  it('결정론: 같은 보드·시드 → 같은 결과', async () => {
    setRngSource(mulberry32(20260711));
    const boards = await buildAllBoards();
    const a = pvpBattleService.simulateBattle(boards[0].details, boards[1].details, 'p1', 'p2', 7);
    const b = pvpBattleService.simulateBattle(boards[0].details, boards[1].details, 'p1', 'p2', 7);
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.player1RemainingPokemon).toBe(b.player1RemainingPokemon);
    expect(a.battleLog.length).toBe(b.battleLog.length);
  });
});
