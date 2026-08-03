// sim/single/workRules.sim.ts
// 알바(프렌들리숍·콘테스트 홀) 잠금/회수 규칙 회귀 테스트 — 네트워크 없이 store만 구동한다.
//   v2.18에서 바뀐 계약 4가지를 고정한다:
//   1) 멀티플레이에는 알바 시스템이 없다(타일·근무 효과·잠금 전부 없음)
//   2) 잠금은 누적 15웨이브 미만에서만 — 최고 등급이면 이동·판매 자유
//   3) 회수는 즉시 순간이동이 아니라 '배치 대기열' → 플레이어가 칸을 찍는다(폴백 있음)
//   4) 근무 타일을 벗어나면 누적 근무는 0으로 초기화된다
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { multiplayerService } from '../../src/services/MultiplayerService';
import { getMapById } from '../../src/data/maps';
import {
  facilityTilesOfMap, isWorkLocked, isWorking, isWorkSystemEnabled, movePatch,
} from '../../src/utils/facility.utils';

const MAP = 'easy_loop';
const T = 64;

const shopTile = () => facilityTilesOfMap(MAP).shopTiles[0];

const fakeTower = (id: string, tile: { x: number; y: number }, waves = 0): any => ({
  id, pokemonId: 25, displayName: `T-${id}`, sprite: '',
  position: { x: tile.x * T + T / 2, y: tile.y * T + T / 2 },
  level: 5, currentHp: 100, maxHp: 100, isFainted: false,
  shopWavesHeld: waves, sellValue: 100, types: ['electric'], moves: [],
});

describe('알바 회수 규칙', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentMap: MAP, towers: [], isWaveActive: false,
      pendingWorkWithdrawIds: [], clerkOrScoutPromptQueue: [], money: 0,
    } as any);
  });

  it('싱글에서는 시설 타일이 존재한다', () => {
    expect(isWorkSystemEnabled()).toBe(true);
    expect(shopTile()).toBeTruthy();
    expect(getMapById(MAP)).toBeTruthy();
  });

  it('근무 중 잠금은 15웨이브 미만에서만 걸린다', () => {
    const tile = shopTile();
    const low = fakeTower('a', tile, 10);
    const max = fakeTower('b', tile, 15);
    expect(isWorking(low, MAP)).toBe(true);
    expect(isWorkLocked(low, MAP)).toBe(true);
    expect(isWorkLocked(max, MAP)).toBe(false);
  });

  it('회수는 배치 대기열에 올라가고, 플레이어가 찍은 칸에 놓이며 누적이 초기화된다', () => {
    const tile = shopTile();
    useGameStore.setState({ towers: [fakeTower('a', tile, 10)] } as any);

    const res = useGameStore.getState().beginWorkWithdraw('a');
    expect(res.success).toBe(true);
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual(['a']);
    // 대기 중에는 아직 근무 타일 위 + 누적 유지
    expect(useGameStore.getState().towers[0].shopWavesHeld).toBe(10);

    const target = { x: 3 * T + T / 2, y: 3 * T + T / 2 };
    useGameStore.getState().completeWorkWithdraw(target);
    const after = useGameStore.getState().towers[0];
    expect(after.position).toEqual(target);
    expect(after.shopWavesHeld).toBe(0);
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual([]);
  });

  it('폴백(칸을 안 찍고 웨이브 시작)에서도 반드시 타일을 벗어난다', () => {
    const tile = shopTile();
    useGameStore.setState({ towers: [fakeTower('a', tile, 5)] } as any);
    useGameStore.getState().beginWorkWithdraw('a');
    useGameStore.getState().completeWorkWithdraw();
    const after = useGameStore.getState().towers[0];
    expect(isWorking(after, MAP)).toBe(false);
    expect(after.shopWavesHeld).toBe(0);
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual([]);
  });

  it('마일스톤 모달 회수 선택이 배치 대기열로 이어진다', () => {
    const tile = shopTile();
    useGameStore.setState({
      towers: [fakeTower('a', tile, 5)],
      clerkOrScoutPromptQueue: [{ towerId: 'a', waves: 5, pokemonName: 'T-a', facilityKey: 'shop' }],
    } as any);
    const r = useGameStore.getState().resolveClerkOrScoutPrompt('a', true);
    expect(r.success).toBe(true);
    expect(useGameStore.getState().clerkOrScoutPromptQueue).toEqual([]);
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual(['a']);
  });

  it('두 시설이 같은 웨이브에 회수돼도 한 마리씩 순서대로 처리된다', () => {
    const fac = facilityTilesOfMap(MAP);
    useGameStore.setState({
      towers: [fakeTower('a', fac.shopTiles[0], 5), fakeTower('b', fac.contestTiles[0], 5)],
    } as any);
    useGameStore.getState().beginWorkWithdraw('a');
    useGameStore.getState().beginWorkWithdraw('b');
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual(['a', 'b']);
    useGameStore.getState().completeWorkWithdraw({ x: 3 * T + T / 2, y: 3 * T + T / 2 });
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual(['b']);
    useGameStore.getState().completeWorkWithdraw();
    expect(useGameStore.getState().pendingWorkWithdrawIds).toEqual([]);
    expect(useGameStore.getState().towers.every(t => !isWorking(t, MAP))).toBe(true);
  });

  it('판매는 15웨이브부터 풀린다', () => {
    const tile = shopTile();
    useGameStore.setState({ towers: [fakeTower('a', tile, 14)] } as any);
    expect(useGameStore.getState().sellTower('a')).toBe(false);

    useGameStore.setState({ towers: [fakeTower('a', tile, 15)] } as any);
    expect(useGameStore.getState().sellTower('a')).toBe(true);
    expect(useGameStore.getState().towers).toHaveLength(0);
  });

  it('멀티플레이에서는 알바 시스템이 통째로 없다', () => {
    const tile = shopTile();
    const spy = vi.spyOn(multiplayerService, 'getCurrentRoomId').mockReturnValue('room-1');
    try {
      expect(isWorkSystemEnabled()).toBe(false);
      expect(facilityTilesOfMap(MAP).shopTiles).toEqual([]);
      expect(facilityTilesOfMap(MAP).contestTiles).toEqual([]);

      const tw = fakeTower('a', tile, 0);
      expect(isWorking(tw, MAP)).toBe(false);   // 공격·경험치 제외 안 됨
      expect(isWorkLocked(tw, MAP)).toBe(false); // 이동·판매 잠금 없음

      useGameStore.setState({ towers: [tw] } as any);
      expect(useGameStore.getState().sellTower('a')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('근무 타일을 벗어나는 이동은 누적을 초기화한다', () => {
    const tile = shopTile();
    const tw = fakeTower('a', tile, 15);
    const patch = movePatch(tw, MAP, { x: 3 * T + T / 2, y: 3 * T + T / 2 });
    expect(patch.shopWavesHeld).toBe(0);
    // 일반 칸 → 일반 칸 이동은 건드리지 않는다
    const normal = fakeTower('b', { x: 3, y: 3 }, 7);
    expect(movePatch(normal, MAP, { x: 4 * T + T / 2, y: 4 * T + T / 2 }).shopWavesHeld).toBeUndefined();
  });
});
