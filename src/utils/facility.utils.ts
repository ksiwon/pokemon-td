// src/utils/facility.utils.ts
// [v2.18] 알바(프렌들리숍·콘테스트 홀) 규칙 단일 출처.
//   기존엔 getFacilityTiles()를 6개 파일에서 각자 호출하고 "근무 중인가?"를 각자 재구현해서,
//   잠금(이동·판매·합체 금지)과 해제(회수 프롬프트)의 조건이 서로 어긋나 있었다.
//   (대표 사례: 멀티플레이는 회수 프롬프트만 꺼져 있고 잠금은 그대로라 영구 잠김)
//
//   규칙 3줄 요약:
//   1) 멀티플레이(TFT식 PvP)에는 알바 시스템이 없다 → 시설 타일 자체가 없는 것으로 취급한다.
//   2) 근무 중이면 잠기지만, 최고 등급(15웨이브)을 채우면 잠금이 풀려 언제든 뺄 수 있다.
//   3) 근무 타일을 벗어나는 순간 누적 근무 웨이브는 0으로 초기화된다(무손실 재활용 방지).

import { MapData } from '../types/game';
import { getFacilityTiles, getMapById } from '../data/maps';
import { multiplayerService } from '../services/MultiplayerService';

const TILE = 64;

export type Tile = { x: number; y: number };
export type FacilityTiles = { shopTiles: Tile[]; contestTiles: Tile[] };

const NO_FACILITY: FacilityTiles = { shopTiles: [], contestTiles: [] };

/** 최고 등급(자유 회수 해금) 기준 누적 근무 웨이브 */
export const WORK_FREE_WITHDRAW_WAVES = 15;

/** 알바 시스템 사용 여부 — 멀티플레이는 미사용(시설 UI·타일·근무 효과 전부 없음) */
export const isWorkSystemEnabled = (): boolean => !multiplayerService.getCurrentRoomId();

/** 모드를 반영한 시설 타일. 멀티에서는 항상 빈 목록. */
export const activeFacilityTiles = (map?: MapData): FacilityTiles =>
  !map || !isWorkSystemEnabled() ? NO_FACILITY : getFacilityTiles(map);

export const facilityTilesOfMap = (mapId: string): FacilityTiles =>
  activeFacilityTiles(getMapById(mapId));

/** 근무 타일(숍 ∪ 콘테스트) 전체 — 내부 헬퍼 */
const workTilesOf = (mapId: string): Tile[] => {
  const f = facilityTilesOfMap(mapId);
  return [...f.shopTiles, ...f.contestTiles];
};

type WorkTower = { position: { x: number; y: number }; shopWavesHeld?: number };

/** 픽셀 좌표가 근무 타일 위인가 — 내부 헬퍼(외부는 isWorking/isWorkLocked/movePatch를 쓴다) */
const isWorkTileAt = (mapId: string, pos: { x: number; y: number }): boolean => {
  const tx = Math.floor(pos.x / TILE), ty = Math.floor(pos.y / TILE);
  return workTilesOf(mapId).some(s => s.x === tx && s.y === ty);
};

/** 근무 중(시설 타일 점유) — 공격·경험치 제외 대상 */
export const isWorking = (tower: WorkTower, mapId: string): boolean =>
  isWorkTileAt(mapId, tower.position);

/**
 * 조작 잠금 여부. 근무 중이라도 최고 등급(15웨이브)을 채웠으면 잠기지 않는다.
 * 이동·교환·판매·합체 금지 판정은 전부 이 함수를 쓴다.
 */
export const isWorkLocked = (tower: WorkTower, mapId: string): boolean =>
  isWorking(tower, mapId) && (tower.shopWavesHeld ?? 0) < WORK_FREE_WITHDRAW_WAVES;

/**
 * 이동 패치 생성. 근무 타일 → 바깥으로 나가는 이동이면 누적 근무를 0으로 초기화한다.
 * (근무 타일 안에서의 이동/교환은 유지 — 실제로는 시설 타일이 1칸씩이라 발생하지 않는다)
 */
export const movePatch = (
  tower: WorkTower,
  mapId: string,
  next: { x: number; y: number }
): { position: { x: number; y: number }; shopWavesHeld?: number } => {
  const leavingWork = isWorkTileAt(mapId, tower.position) && !isWorkTileAt(mapId, next);
  return leavingWork ? { position: next, shopWavesHeld: 0 } : { position: next };
};
