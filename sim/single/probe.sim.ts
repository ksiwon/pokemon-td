// sim/single/probe.sim.ts
// 디버그 프로브 — 한 판을 웨이브별 상세 로그와 함께 실행 (봇 결함 진단용).
// 실행: SIM_PROBE_MAP=easy_loop SIM_PROBE_SEED=100000 SIM_PROBE_PERSONA=holdout \
//        npx vitest run --config vitest.sim.config.ts sim/single/probe.sim.ts

import { describe, it, expect, vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { GameManager } from '../../src/game/GameManager';
import { WaveSystem } from '../../src/game/WaveSystem';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { PERSONAS } from './botPolicies';
import { runOneWave, resolveQueues, flushAsync, syncTeraTypes } from './runner';

const MAP = process.env.SIM_PROBE_MAP ?? 'easy_loop';
const SEED = Number(process.env.SIM_PROBE_SEED ?? 100000);
const PERSONA = process.env.SIM_PROBE_PERSONA ?? 'holdout';
const MAX_WAVES = Number(process.env.SIM_PROBE_WAVES ?? 25);

// 전체 스위트(npm run sim)에서는 스킵 — SIM_PROBE=1로 명시 실행 시에만
describe.skipIf(!process.env.SIM_PROBE_MAP && !process.env.SIM_PROBE)('프로브: 웨이브별 상세', () => {
  it(`${MAP}/${PERSONA}/seed${SEED}`, async () => {
    setRngSource(mulberry32(SEED));
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    const policy = PERSONAS[PERSONA]();
    const store = () => useGameStore.getState();

    try {
      store().reset();
      await vi.advanceTimersByTimeAsync(1);
      await flushAsync();
      GameManager.getInstance().resetState();
      WaveSystem.getInstance().cancelPendingSpawns();
      store().setMap(MAP);
      store().setDifficulty('medium' as any);
      useGameStore.setState({ gameSpeed: 1, isPaused: false });

      for (let w = 1; w <= MAX_WAVES; w++) {
        await resolveQueues(policy);
        await policy.prepare();
        await flushAsync();
        syncTeraTypes();

        const pre = store();
        const teamStr = pre.towers.map(t => {
          const tag = t.isFainted ? 'X' : Math.round((t.currentHp / t.maxHp) * 100) + '%';
          const mv = t.equippedMoves[0];
          const mvStr = mv ? `${mv.power ?? 0}${mv.isAOE ? 'A' : ''}` : '-';
          return `${t.displayName}(L${t.level},${tag},${mvStr})`;
        }).join(' ');
        console.log(`[준비 w${w}] 골드 ${pre.money} 라이프 ${pre.lives} | ${teamStr}`);

        const livesStart = pre.lives;
        const goldStart = pre.money;
        await runOneWave({ policy });
        const post = store();
        const kills = post.towers.reduce((s, t) => s + (t.kills ?? 0), 0);
        console.log(
          `[결과 w${w}] 라이프 -${livesStart - post.lives} (남은 ${post.lives})` +
          ` 골드 ${goldStart}→${post.money} 누적킬 ${kills}` +
          ` 생존 ${post.towers.filter(t => !t.isFainted).length}/${post.towers.length}`
        );
        if (post.gameOver) { console.log(`[게임오버] w${w}`); break; }
        if (post.wave50Clear || post.storyClear) { console.log(`[클리어!] w${w}`); break; }
      }
      expect(true).toBe(true);
    } finally {
      try { WaveSystem.getInstance().cancelPendingSpawns(); } catch { /* ignore */ }
      vi.useRealTimers();
      setRngSource(null);
    }
  }, 300_000);
});
