// src/services/PvPBattleService.ts
// TFT 스타일 PvP 대전 시스템 (AI vs AI 시뮬레이션 전용 — 결정론 강화)
//
// [V5-FIX-PVP-1] Math.random() → 시드 기반 RNG(mulberry32)
//   - 이전: AI vs AI 시뮬레이션 결과가 재실행마다 다름 → 디버깅 불가
//   - 수정: roundNumber + player1Id + player2Id 기반 시드로 결정론적 결과
//
// [V5-FIX-PVP-2] 동점 처리 — player1 자동 승 방식 제거
//   - 이전: HP 비율 동점 시 무조건 player1 승 → 불공정
//   - 수정: HP 합계 → totalSpeed → 시드 기반 RNG 순으로 결정 (모든 경로 결정론)
//
// [V5-FIX-PVP-3] 풀리그 매칭 — tiebreaker 명시화
//   - 페어 정렬 키를 (encounters, 사전순 ID) 로 고정 → 매번 같은 순서 보장
//
// [V5-FIX-PVP-4] 빈 팀 처리 — 양측이 모두 빈 팀이면 무승부 대신
//   "포켓몬이 더 많았어야 하는 쪽(= 살아있어야 할 플레이어)"을 기준으로 player1 승이 아닌
//   플레이어 ID 사전순 결정론으로 처리 (극단적 엣지 케이스 방어)

import {
  TowerDetail, PvPBattleResult, RoundMatchup, EncounterRecord,
  PlayerGameState, BattleLogEntry,
} from '../types/multiplayer';
import { getTypeEffectiveness } from '../utils/typeEffectiveness';
import { calculateActiveSynergies, getBuffedStats } from '../utils/synergyManager';
import { GamePokemon, Synergy } from '../types/game';
import { sortTeamDeterministic, sixPieceResistTypes } from '../game/arenaSim';

// ─── 결정론적 RNG (mulberry32) ────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// djb2 문자열 해시
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

/**
 * 배틀 시드 생성 — 양측 클라이언트에서 동일한 시드를 도출해야 함.
 * BattlePhaseUI의 battleSeed와 동일한 포맷을 사용해야 함.
 */
export function deriveBattleSeed(roundNumber: number, p1: string, p2: string): number {
  // 플레이어 ID 사전순 정렬 → 양측에서 동일한 문자열 보장
  const [a, b] = [p1, p2].sort();
  return djb2(`${roundNumber}-${a}-${b}`);
}

/**
 * [V8-FIX-3-4] 결정론적 matchId 생성 헬퍼
 *   BattlePhaseUI와 PvPBattleService가 동일한 포맷을 사용하도록 export.
 *   p1/p2 순서에 무관하게 항상 같은 ID를 반환 (djb2 해시 min/max 정렬).
 */
export function buildMatchId(roundNumber: number, p1: string, p2: string): string {
  const h1 = djb2(p1);
  const h2 = djb2(p2);
  const [a, b] = h1 <= h2 ? [h1, h2] : [h2, h1];
  return `${roundNumber}-${a}-${b}`;
}

class PvPBattleService {
  /**
   * [V5-FIX-PVP-3] 풀리그 방식 매칭 (결정론 강화)
   */
  generateMatchups(
    players: PlayerGameState[],
    encounterRecord: EncounterRecord,
    roundNumber: number,
    lastSkipPlayerId?: string | null
  ): RoundMatchup {
    const alivePlayers = players.filter(p => p.isAlive);

    let skipPlayerId: string | undefined;
    let playersToMatch = [...alivePlayers];

    if (alivePlayers.length % 2 !== 0) {
      const candidates = lastSkipPlayerId
        ? alivePlayers.filter(p => p.userId !== lastSkipPlayerId)
        : alivePlayers;
      const pool = candidates.length > 0 ? candidates : alivePlayers;

      const totalEncounters = pool.map(p => {
        let total = 0;
        for (const other of alivePlayers) {
          if (other.userId === p.userId) continue;
          total += this.getEncounterCount(encounterRecord, p.userId, other.userId);
        }
        return { player: p, total };
      });

      // 결정론: 총 대전 횟수 최다 → 라이프 최저 → userId 사전순
      totalEncounters.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (a.player.lives !== b.player.lives) return a.player.lives - b.player.lives;
        return a.player.userId.localeCompare(b.player.userId);
      });

      skipPlayerId = totalEncounters[0]?.player.userId;
      playersToMatch = alivePlayers.filter(p => p.userId !== skipPlayerId);
    }

    // 페어 생성 — userId 사전순으로 정규화 (p1 < p2)
    const matches: Array<{ player1Id: string; player2Id: string }> = [];
    const matched = new Set<string>();

    type Pair = { p1: string; p2: string; encounters: number };
    const pairs: Pair[] = [];

    for (let i = 0; i < playersToMatch.length; i++) {
      for (let j = i + 1; j < playersToMatch.length; j++) {
        const a = playersToMatch[i].userId;
        const b = playersToMatch[j].userId;
        const [p1, p2] = a < b ? [a, b] : [b, a];
        pairs.push({ p1, p2, encounters: this.getEncounterCount(encounterRecord, p1, p2) });
      }
    }

    // 결정론: 만남 횟수 적은 순 → p1 사전순 → p2 사전순
    pairs.sort((a, b) => {
      if (a.encounters !== b.encounters) return a.encounters - b.encounters;
      if (a.p1 !== b.p1) return a.p1.localeCompare(b.p1);
      return a.p2.localeCompare(b.p2);
    });

    for (const pair of pairs) {
      if (matched.has(pair.p1) || matched.has(pair.p2)) continue;
      matches.push({ player1Id: pair.p1, player2Id: pair.p2 });
      matched.add(pair.p1);
      matched.add(pair.p2);
    }

    return {
      roundNumber,
      matches,
      skipPlayerId: skipPlayerId || null,
      timestamp: Date.now(),
    };
  }

  private getEncounterCount(record: EncounterRecord, p1: string, p2: string): number {
    return (record[p1]?.[p2] ?? 0) + (record[p2]?.[p1] ?? 0);
  }

  updateEncounterRecord(
    record: EncounterRecord,
    player1Id: string,
    player2Id: string
  ): EncounterRecord {
    const newRecord = { ...record };
    if (!newRecord[player1Id]) newRecord[player1Id] = {};
    if (!newRecord[player2Id]) newRecord[player2Id] = {};
    newRecord[player1Id][player2Id] = (newRecord[player1Id][player2Id] ?? 0) + 1;
    newRecord[player2Id][player1Id] = (newRecord[player2Id][player1Id] ?? 0) + 1;
    return newRecord;
  }

  /**
   * [V5-FIX-PVP-1] AI vs AI 전용 배틀 시뮬레이션 (결정론)
   * 양측에서 호출되어도 동일한 시드라면 동일한 결과를 반환.
   */
  simulateBattle(
    team1: TowerDetail[],
    team2: TowerDetail[],
    player1Id: string,
    player2Id: string,
    roundNumber: number
  ): PvPBattleResult {
    const battleLog: BattleLogEntry[] = [];
    const safeTeam1 = Array.isArray(team1) ? team1 : [];
    const safeTeam2 = Array.isArray(team2) ? team2 : [];

    // [V5-FIX-PVP-1] 시드 기반 RNG (Math.random 제거)
    const seed = deriveBattleSeed(roundNumber, player1Id, player2Id);
    const rng = mulberry32(seed);

    // [FIX] TFTBattleArena(arenaSim)와 동일한 규칙으로 팀을 구성한다. 예전엔 이 엔진만
    //   기절 유닛을 제외하고 시너지도 적용하지 않아, 같은 보드가 어느 엔진으로 판정되느냐에
    //   따라 결과가 달라졌다(사람 매치도 stuck 타임아웃 시 이 엔진으로 강제 종료된다).
    //     · TFT 규칙: 기절 포함 풀팀, 항상 풀HP, 상위 6마리
    //     · 시너지 버프(getBuffedStats)를 전투 전에 적용
    const prepare = (team: TowerDetail[], tag: 'p1' | 'p2') => {
      const roster = sortTeamDeterministic(team).slice(0, 6);
      const synergies: Synergy[] = calculateActiveSynergies(
        roster.map(p => ({ ...p, isFainted: false })) as unknown as GamePokemon[],
      );
      return roster.map((p, idx) => {
        const buffed = getBuffedStats({ ...p, isFainted: false } as unknown as GamePokemon, synergies);
        const maxHp = p.maxHp > 0 ? p.maxHp : 100;
        return {
          ...p, ...buffed,
          maxHp,
          currentHp: maxHp,
          isFainted: false,
          battleId: `${tag}-${idx}`,
          resistTypes: sixPieceResistTypes(p, synergies),
        };
      });
    };

    const team1Battle = prepare(safeTeam1, 'p1');
    const team2Battle = prepare(safeTeam2, 'p2');

    let turn = 0;
    const maxTurns = 100;

    while (
      team1Battle.some(p => p.currentHp > 0) &&
      team2Battle.some(p => p.currentHp > 0) &&
      turn < maxTurns
    ) {
      turn++;
      this.executeTurnWithLog(team1Battle, team2Battle, turn, battleLog, rng, seed);
    }

    const team1Remaining = team1Battle.filter(p => p.currentHp > 0).length;
    const team2Remaining = team2Battle.filter(p => p.currentHp > 0).length;

    let winnerId: string;
    let lifeLost: number;

    if (team1Remaining > 0 && team2Remaining === 0) {
      winnerId = player1Id;
      // [FIX-2] lifeLost = 3 + 승자 생존 수 (calcBattleRewards와 일치)
      lifeLost = 3 + team1Remaining;
    } else if (team2Remaining > 0 && team1Remaining === 0) {
      winnerId = player2Id;
      lifeLost = 3 + team2Remaining;
    } else {
      // [V5-FIX-PVP-2] 동점/시간초과 — 결정론적 tiebreaker
      const t1HpSum = team1Battle.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
      const t1HpMax = team1Battle.reduce((s, p) => s + p.maxHp, 0) || 1;
      const t2HpSum = team2Battle.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
      const t2HpMax = team2Battle.reduce((s, p) => s + p.maxHp, 0) || 1;

      const t1Ratio = t1HpSum / t1HpMax;
      const t2Ratio = t2HpSum / t2HpMax;

      // 타이브레이커: 최소 3 라이프 손실 보장
      if (t1Ratio > t2Ratio) {
        winnerId = player1Id; lifeLost = 3;
      } else if (t2Ratio > t1Ratio) {
        winnerId = player2Id; lifeLost = 3;
      } else if (t1HpSum !== t2HpSum) {
        winnerId = t1HpSum > t2HpSum ? player1Id : player2Id; lifeLost = 3;
      } else {
        // Speed 합 tiebreaker
        const t1Spd = team1Battle.reduce((s, p) => s + (p.speed ?? 0), 0);
        const t2Spd = team2Battle.reduce((s, p) => s + (p.speed ?? 0), 0);
        if (t1Spd !== t2Spd) {
          winnerId = t1Spd > t2Spd ? player1Id : player2Id; lifeLost = 3;
        } else {
          // 최종: 시드 기반 RNG (양측이 동일한 seed를 쓰므로 동일 결과)
          winnerId = rng() < 0.5 ? player1Id : player2Id;
          lifeLost = 3;
        }
      }
    }

    // [V5-FIX-PVP-4] 양측 빈 팀 엣지 케이스 — player1 자동 승 방지
    if (team1Battle.length === 0 && team2Battle.length === 0) {
      console.warn(`[PvPBattleService] Both teams empty! Defaulting to player1 (deterministic).`);
      winnerId = player1Id;
      lifeLost = 0;
    }

    return {
      // [V8-FIX-3-4] buildMatchId 헬퍼 사용 (BattlePhaseUI와 동일 포맷)
      matchId: buildMatchId(roundNumber, player1Id, player2Id),
      roundNumber,
      player1Id,
      player2Id,
      winnerId,
      player1RemainingPokemon: team1Remaining,
      player2RemainingPokemon: team2Remaining,
      lifeLost,
      battleLog,
      timestamp: Date.now(),
    };
  }

  /**
   * 한 턴 실행 — 양 팀을 스피드 순으로 **통합** 정렬해 번갈아 행동시킨다.
   * [FIX] 예전엔 team1 전원 공격 → team2 전원 공격의 진영 순차였다. 그래서
   *   (a) 스피드가 팀 내부 정렬에만 쓰여 느린 team1 유닛이 빠른 team2 유닛보다 먼저 때리고,
   *   (b) player1Id는 userId 사전순으로 정규화되므로 **uid가 앞선 쪽이 매 턴 전체 선공**했다.
   *   동일 팀 거울전 측정 결과 team1 승률 91.5%. 통합 정렬 + 진영 무관 해시 tiebreak로 교정.
   */
  private executeTurnWithLog(
    team1: (TowerDetail & { battleId: string })[],
    team2: (TowerDetail & { battleId: string })[],
    turn: number,
    log: BattleLogEntry[],
    rng: () => number,
    seed: number
  ): void {
    const all = [...team1, ...team2];
    const tie = new Map<string, number>();
    for (const u of all) tie.set(u.battleId, djb2(`${seed}:${u.battleId}`));

    const actors = all
      .filter(p => p.currentHp > 0)
      .sort((a, b) => {
        const sa = a.speed ?? 100;
        const sb = b.speed ?? 100;
        if (sa !== sb) return sb - sa;
        return tie.get(a.battleId)! - tie.get(b.battleId)!;
      });

    for (const attacker of actors) {
      if (attacker.currentHp <= 0) continue;

      const defenders = attacker.battleId.startsWith('p1-') ? team2 : team1;
      const livingDefenders = defenders.filter(p => p.currentHp > 0);
      if (livingDefenders.length === 0) continue;

      // 최저 HP 타겟 — 동률 시 battleId 사전순
      const target = livingDefenders.reduce((best, p) => {
        if (p.currentHp !== best.currentHp) return p.currentHp < best.currentHp ? p : best;
        return p.battleId.localeCompare(best.battleId) < 0 ? p : best;
      });

      const { damage, isCrit, moveName } = this.calculateBattleDamage(attacker, target, rng);
      target.currentHp -= damage;

      const isFainted = target.currentHp <= 0;

      log.push({
        turn,
        attackerId: attacker.battleId,
        targetId: target.battleId,
        action: 'attack',
        damage,
        isCrit,
        isMiss: false,
        isFainted,
        moveName: moveName ?? 'Attack',
        timestamp: turn, // [V5] Date.now() 대신 turn 번호 (결정론)
      });
    }
  }

  /**
  /**
   * [FIX-5 FINAL] 대전 데미지 계산 — STAB·물리/특수 구분·크리티컬·타입상성·명중률 완전 적용
   *
   * RNG 소비 순서 (결정론 보장 — 항상 정확히 5회):
   *   r1 → 기술 선택 방식 (최강 vs 랜덤)
   *   r2 → 랜덤 기술 인덱스
   *   r3 → 크리티컬 판정
   *   r4 → 데미지 난수 (0.85~1.0)
   *   r5 → 명중률 판정 (accuracy)
   */
  private calculateBattleDamage(
    attacker: TowerDetail,
    defender: TowerDetail,
    rng: () => number
  ): { damage: number; isCrit: boolean; moveName?: string } {
    const r1 = rng();
    const r2 = rng();
    const r3 = rng();
    const r4 = rng();
    const r5 = rng();

    const attackerTypes = attacker.types ?? [];
    const defenderTypes = defender.types ?? [];

    // 데미지가 있는 기술만 (status 기술 제외)
    const damageMoves = (attacker.equippedMoves ?? []).filter(
      m => m.damageClass !== 'status' && (m.power ?? 0) > 0
    );

    let power = 50 + attacker.level;
    let moveType: string = attackerTypes[0] ?? 'normal';
    let damageClass: 'physical' | 'special' = 'physical';
    let moveName: string | undefined;
    let accuracy = 100;

    if (damageMoves.length > 0) {
      let idx: number;
      if (r1 < 0.3) {
        const maxP = Math.max(...damageMoves.map(m => m.power ?? 0));
        idx = damageMoves.findIndex(m => (m.power ?? 0) === maxP);
        if (idx < 0) idx = 0;
      } else {
        idx = Math.floor(r2 * damageMoves.length) % damageMoves.length;
      }
      const sel = damageMoves[idx];
      power    = Math.max(30, sel.power ?? power);
      moveType = sel.type || moveType;
      damageClass = sel.damageClass === 'special' ? 'special' : 'physical';
      moveName = sel.displayName || sel.name;
      accuracy = sel.accuracy ?? 100;
    }

    // 명중률 판정 (싱글플레이와 동일: hitChance = accuracy / 100)
    const isMiss = r5 > (accuracy / 100);
    if (isMiss) {
      return { damage: 0, isCrit: false, moveName };
    }

    // 물리/특수 구분: damageClass에 따라 공/방 스탯 선택
    const atkStat = damageClass === 'special'
      ? (attacker.specialAttack ?? attacker.attack ?? attacker.level * 10)
      : (attacker.attack ?? attacker.level * 10);
    const defStat = damageClass === 'special'
      ? (defender.specialDefense ?? defender.defense ?? defender.level * 5)
      : (defender.defense ?? defender.level * 5);

    // 타입 상성: 기술 타입 기준
    const typeEff = getTypeEffectiveness(moveType, defenderTypes);

    // 6마리 타입 시너지: 그 타입 기준 2배 공격을 반감 (arenaSim·GameManager와 동일 규칙)
    let sixPieceResist = 1.0;
    for (const ty of (defender as { resistTypes?: string[] }).resistTypes ?? []) {
      if (getTypeEffectiveness(moveType, [ty]) === 2) { sixPieceResist = 0.5; break; }
    }

    // 자속 보정 (STAB): 공격자 타입과 기술 타입 일치 시 1.5배
    const isStab = attackerTypes.includes(moveType);

    // 크리티컬 (기본 6.25%)
    const critRate = attacker.critChance ?? 0.0625;
    const isCrit = r3 < critRate;

    const level = attacker.level;
    const base = ((2 * level / 5 + 2) * power * atkStat / Math.max(1, defStat) / 50 + 2);
    const randomFactor = 0.85 + r4 * 0.15;
    let damage = base * typeEff * randomFactor * sixPieceResist;
    if (isStab) damage *= 1.5;
    if (isCrit) damage *= 1.5;

    return { damage: Math.max(1, Math.floor(damage)), isCrit, moveName };
  }
}

export const pvpBattleService = new PvPBattleService();