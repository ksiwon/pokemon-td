// src/utils/rng.ts
// 게임 로직 공용 난수원. 기본은 Math.random(프로덕션 동작 불변).
// 시뮬레이션(밸런스 하네스)이 setRngSource(mulberry32(seed))로 교체하면
// GameManager/WaveSystem 스폰/pokeapi 추첨/특성 배정까지 전 게임 로직이 결정론이 된다.
//
// 주의: UI 전용 난수(배경 별똥별, 토스트 등)는 교체 대상이 아님 — 게임 결과에 영향 없는 곳은
// Math.random을 그대로 쓴다.

let _source: () => number = Math.random;

/** 게임 로직 난수. Math.random 대신 이 함수를 호출한다. */
export const rng = (): number => _source();

/** 난수원 교체. null이면 Math.random으로 복원. 시뮬레이션 전용. */
export function setRngSource(fn: (() => number) | null): void {
  _source = fn ?? Math.random;
}

/** 시드 기반 결정론 RNG (PvPBattleService/TFTBattleArena와 동일 구현). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
