// src/services/battleRewards.ts
// PvP 배틀 보상 계산 — MultiplayerService.calcBattleRewards에서 분리한 순수 함수.
// 밸런스 시뮬 하네스(멀티 오케스트레이터)와 공유한다.
// ⚠ 여기 수치 변경 = 실제 멀티 보상 변경. (연승/연패 커브·라이프 손실 공식의 단일 출처)

import { PlayerGameState } from '../types/multiplayer';

export function calcBattleRewards(
  player: PlayerGameState,
  isWinner: boolean,
  myRemaining: number,
  oppRemaining: number
): { goldDelta: number; livesDelta: number } {
  if (isWinner) {
    // [FIX] 승리 골드 감소 (기존 80 → 40 기본)
    let gold = 40;
    // [NEW-3 FIX] 실제 연속 승리 수(currentWinStreak)를 사용
    const winStreak = (player.battleRecord?.currentWinStreak ?? 0) + 1;
    if (winStreak >= 4) gold += 50;
    else if (winStreak >= 3) gold += 30;
    else if (winStreak >= 2) gold += 15;
    if (myRemaining >= 3) gold += 20;
    return { goldDelta: gold, livesDelta: 0 };
  } else {
    // [FIX] lives 감소: 2+상대생존 → 3+상대생존
    const livesLost = 3 + oppRemaining;
    // [NEW-3 FIX] 실제 연속 패배 수(currentLoseStreak)를 사용
    let consolation = 0;
    const loseStreak = (player.battleRecord?.currentLoseStreak ?? 0) + 1;
    if (loseStreak >= 5) consolation = 200;
    else if (loseStreak >= 4) consolation = 150;
    else if (loseStreak >= 3) consolation = 100;
    else if (loseStreak >= 2) consolation = 60;
    if (player.lives <= 10) consolation += 60;
    else if (player.lives <= 20) consolation += 30;
    return { goldDelta: consolation, livesDelta: -livesLost };
  }
}
