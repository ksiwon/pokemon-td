// src/game/balanceOverrides.ts
// 시뮬 전용 밸런스 오버라이드 훅 — 실코드 수치를 바꾸지 않고 A/B 실험한다.
// rng.setRngSource와 같은 패턴: 프로덕션 경로는 오버라이드 미설정 = 기존 값 그대로.
// 사용처: WaveSystem(난이도 배율), GameManager(킬 XP), gameStore(사탕 단가).

export interface BalanceOverrides {
  /** 맵 난이도별 hp/attack 배율 교체 (예: { medium: 0.62 }) — reward는 원값 유지 */
  difficultyMult?: Record<string, number>;
  /** 일반 킬 XP (기본 10; 보스는 ×5 배율 유지) */
  xpPerKill?: number;
  /** true면 킬 XP를 수령 타워 수로 분할 — "머릿수 과보상" 실험 */
  xpSplit?: boolean;
  /** 사탕 레벨당 단가 (기본 25) */
  candyCostPerLevel?: number;
}

export let BALANCE_OVERRIDES: BalanceOverrides = {};

export function setBalanceOverrides(o: BalanceOverrides): void {
  BALANCE_OVERRIDES = o;
}
