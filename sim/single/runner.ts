// sim/single/runner.ts
// 싱글플레이 헤드리스 러너 — 실제 게임 코드(GameManager/WaveSystem/gameStore)를
// 렌더링 없이 구동한다. GameCanvas의 rAF 루프 대신 고정 스텝 + vitest fake timers.
//
// 재현하는 오케스트레이션(원래 UI 컴포넌트가 하던 일):
//   - GameLayout.handleStartWave: nextWave() + WaveSystem.startWave()
//   - GameCanvas 테라 동기화: activeTeraTiles ↔ tower.teraType
//   - SkillPicker: 기술 교체/거절 (봇 정책)
//   - EvolutionConfirmModal: 진화 수락 (항상 첫 옵션)
//   - WaveEndPicker: 무료 아이템 픽 (봇 정책)
//   - WorkMilestoneModal(clerkOrScoutPrompt): 알바 지속(봇: 항상 지속)
//
// 결정론: setRngSource(mulberry32(seed)) + Date/타이머 fake + 디스크 캐시(pokeAPI).

import { vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { GameManager } from '../../src/game/GameManager';
import { WaveSystem } from '../../src/game/WaveSystem';
import { setRngSource, mulberry32 } from '../../src/utils/rng';
import { getMapById, activeTeraTiles } from '../../src/data/maps';
import { Difficulty } from '../../src/types/game';
import { BotPolicy } from './botPolicies';

const T = 64;

export interface WaveRecord {
  wave: number;
  livesLost: number;
  goldStart: number;
  goldEnd: number;
  simSeconds: number;
  towersAlive: number;
}

export interface SingleRunResult {
  persona: string;
  mapId: string;
  difficulty: Difficulty;
  seed: number;
  wavesCleared: number;
  victory: boolean;      // 50웨이브 클리어
  gameOver: boolean;     // 라이프 0
  aborted: string | null; // 하네스 이상(웨이브 교착 등)
  livesLeft: number;
  finalGold: number;
  waveRecords: WaveRecord[];
  finalTeam: Array<{ name: string; level: number; heldItem?: string }>;
}

export async function flushAsync(times = 12) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** GameCanvas 테라 동기화 이펙트 재현 */
export function syncTeraTypes() {
  const st = useGameStore.getState();
  const map = getMapById(st.currentMap);
  const active = activeTeraTiles(map, st.wave, st.isWaveActive);
  for (const tower of st.towers) {
    const tx = Math.floor(tower.position.x / T);
    const ty = Math.floor(tower.position.y / T);
    const want = active.find(t2 => t2.x === tx && t2.y === ty)?.type;
    if (tower.teraType !== want) st.updateTower(tower.id, { teraType: want });
  }
}

/** 봇이 처리해야 하는 모달 큐(기술/진화/알바/웨이브끝픽) 전부 해소 */
export async function resolveQueues(policy: BotPolicy) {
  const store = () => useGameStore.getState();

  // 기술 교체 제안
  let guard = 0;
  while (store().skillChoiceQueue.length > 0 && guard++ < 50) {
    const choice = store().skillChoiceQueue[0];
    const tower = store().towers.find(t => t.id === choice.towerId);
    // 제안 묶음에서 정책이 기술을 고른다 (SkillPicker에서 사람이 고르는 것과 동일)
    const newMove = tower && policy.pickBestMove
      ? policy.pickBestMove(tower, choice.newMoves)
      : choice.newMoves[0];
    if (tower && newMove) {
      if (policy.acceptMove(tower, newMove)) {
        store().updateTower(tower.id, { equippedMoves: [newMove] });
      } else {
        store().updateTower(tower.id, {
          rejectedMoves: [...(tower.rejectedMoves || []), ...choice.newMoves.map(m => m.name)],
        });
      }
    }
    store().removeCurrentSkillChoice();
  }

  // 진화 확인 — 항상 첫 옵션 수락 (실플레이 기본)
  guard = 0;
  while (store().evolutionConfirmQueue.length > 0 && guard++ < 20) {
    const q = store().evolutionConfirmQueue[0];
    const opt = q.evolutionOptions[0];
    if (opt) {
      await store().evolvePokemon(q.towerId, undefined, opt.targetId);
      await flushAsync();
    } else {
      store().removeEvolutionConfirm();
    }
    // evolvePokemon이 큐에서 제거함 — 실패 시 무한루프 방지
    if (store().evolutionConfirmQueue[0]?.towerId === q.towerId) {
      store().removeEvolutionConfirm();
    }
  }

  // 알바 지속 프롬프트 — 항상 지속(withdraw=false)
  guard = 0;
  while (store().clerkOrScoutPromptQueue.length > 0 && guard++ < 20) {
    const p = store().clerkOrScoutPromptQueue[0];
    store().resolveClerkOrScoutPrompt(p.towerId, false);
  }

  // 웨이브끝 무료 픽
  const pick = store().waveEndItemPick;
  if (pick && pick.length > 0) {
    const sel = policy.pickWaveEndItem(pick, store().towers);
    if (sel) {
      const t = (sel.item.type as string);
      if (t === 'mega-stone' || t === 'max-mushroom') {
        if (sel.towerId) {
          await store().evolvePokemon(sel.towerId, sel.item.id);
          await flushAsync();
        }
      } else if (sel.towerId) {
        store().useRewardItem(sel.item.type, sel.towerId);
      }
    }
    store().setWaveEndItemPick(null);
  }
}

/**
 * 한 웨이브 실행 (정비 없이 전투만). 멀티 오케스트레이터와 공유.
 * 사전 조건: 스토어에 towers/money/lives/wave 세팅 완료, fake timers 활성.
 */
export async function runOneWave(opts: {
  stepSec?: number;
  maxSimSecPerWave?: number;
  policy: BotPolicy;
}): Promise<{ ended: boolean; simSec: number }> {
  const { stepSec = 0.1, maxSimSecPerWave = 600, policy } = opts;
  const store = () => useGameStore.getState();
  const gm = GameManager.getInstance();

  store().nextWave();
  useGameStore.setState({ isPaused: false });
  WaveSystem.getInstance().startWave(store().wave);
  syncTeraTypes();

  let simSec = 0;
  let ended = false;
  let step = 0;
  while (simSec < maxSimSecPerWave) {
    await vi.advanceTimersByTimeAsync(stepSec * 1000);
    gm.update(stepSec);
    await flushAsync(4);
    simSec += stepSec;
    step++;

    const s = store();
    if (s.gameOver) { ended = true; break; }
    if (!s.isWaveActive && !s.isSpawning) {
      await vi.advanceTimersByTimeAsync(600); // statFlush(500ms) 포함 잔여 타이머
      await flushAsync();
      ended = true;
      break;
    }
    if (s.skillChoiceQueue.length > 0 || s.evolutionConfirmQueue.length > 0) {
      await resolveQueues(policy);
    }
    // 웨이브 중 응급조치 훅 (~2초 간격) — 상처약/응급부활
    if (policy.duringWave && step % Math.max(1, Math.round(2 / stepSec)) === 0) {
      policy.duringWave();
    }
  }
  return { ended, simSec };
}

export interface SingleRunOptions {
  seed: number;
  policy: BotPolicy;
  mapId: string;
  difficulty: Difficulty;
  maxWaves?: number;
  stepSec?: number;
  /** 웨이브당 시뮬 시간 상한(게임 내 초). 초과 = 교착으로 판단하고 중단 기록. */
  maxSimSecPerWave?: number;
}

export async function runSingleGame(opts: SingleRunOptions): Promise<SingleRunResult> {
  const {
    seed, policy, mapId, difficulty,
    maxWaves = 50, stepSec = 0.1, maxSimSecPerWave = 600,
  } = opts;

  setRngSource(mulberry32(seed));
  vi.useFakeTimers({ now: 1_760_000_000_000 });

  const result: SingleRunResult = {
    persona: policy.name, mapId, difficulty, seed,
    wavesCleared: 0, victory: false, gameOver: false, aborted: null,
    livesLeft: 0, finalGold: 0, waveRecords: [], finalTeam: [],
  };

  try {
    const store = () => useGameStore.getState();

    // 리셋 (reset 내부의 dynamic import 완료 대기)
    store().reset();
    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();
    GameManager.getInstance().resetState();
    WaveSystem.getInstance().cancelPendingSpawns();

    store().setMap(mapId);
    store().setDifficulty(difficulty);
    useGameStore.setState({ gameSpeed: 1, isPaused: false });

    for (let targetWave = 1; targetWave <= maxWaves; targetWave++) {
      // ── 정비 페이즈 ────────────────────────────────────────────────
      await resolveQueues(policy);
      await policy.prepare();
      await flushAsync();
      syncTeraTypes();

      const goldStart = store().money;
      const livesStart = store().lives;

      // ── 웨이브 실행 (GameLayout.handleStartWave + 전투 루프) ───────
      const { ended, simSec } = await runOneWave({ stepSec, maxSimSecPerWave, policy });

      const s = store();
      result.waveRecords.push({
        wave: targetWave,
        livesLost: livesStart - s.lives,
        goldStart,
        goldEnd: s.money,
        simSeconds: Math.round(simSec * 10) / 10,
        towersAlive: s.towers.filter(t => !t.isFainted).length,
      });

      if (s.gameOver) { result.gameOver = true; break; }
      if (!ended) { result.aborted = `wave-${targetWave}-stuck`; break; }
      result.wavesCleared = targetWave;
      if (s.wave50Clear || s.storyClear) { result.victory = true; break; }
    }

    const fin = store();
    result.livesLeft = fin.lives;
    result.finalGold = fin.money;
    result.finalTeam = fin.towers.map(t => ({
      name: t.displayName, level: t.level, heldItem: t.heldItem,
    }));
    return result;
  } finally {
    // 다음 실행을 위한 정리
    try { WaveSystem.getInstance().cancelPendingSpawns(); } catch { /* ignore */ }
    vi.useRealTimers();
    setRngSource(null);
  }
}
