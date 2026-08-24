// src/game/GameManager.ts
import { useGameStore, INITIAL_LIVES_SINGLE } from '../store/gameStore';
import { GamePokemon, Enemy, Projectile, Position, GameMove } from '../types/game';
import {
  calculateDamage, getTypeEffectiveness, stabMultiplier, damageRandomFactor,
} from '../utils/typeEffectiveness';
import {
  heldDamageMultiplier, heldCritBonus, heldLifesteal,
  heldRecoilRatio, heldRegenPerSec,
} from '../data/heldItems';
import { hasMegaEvolution, hasGigantamax, MEGA_EVOLUTIONS, GIGANTAMAX_FORMS } from '../data/evolution';
import { saveService } from '../services/SaveService';
import { cardService } from '../services/CardService';
import { getCriticalChance, getAOEDamageMultiplier } from '../utils/abilities';
import { rng } from '../utils/rng';
import { BALANCE_OVERRIDES } from './balanceOverrides';
import { getBuffedStats } from '../utils/synergyManager';

/**
 * 싱글TD 데미지 난수 on/off. 아레나·AI서비스·카드는 전부 0.85~1.0을 굴리는데
 * 싱글TD만 없어서 "같은 입력이면 항상 같은 데미지"였다(정합성 매트릭스에서 검출).
 * 켜면 평균 딜이 0.925배가 되므로 밸런스 영향이 있다 → 시뮬로 재고 켠다.
 */
export const DAMAGE_VARIANCE_DEFAULT = true;
function singleDamageRandom(): number {
  const on = BALANCE_OVERRIDES.singleDamageVariance ?? DAMAGE_VARIANCE_DEFAULT;
  return on ? damageRandomFactor(rng()) : 1;
}
import { databaseService } from '../services/DatabaseService';
import { getMapById } from '../data/maps';
import {
  facilityTilesOfMap, isWorking, WORK_FREE_WITHDRAW_WAVES,
} from '../utils/facility.utils';
import { pokeAPI } from '../api/pokeapi';
import { multiplayerService } from '../services/MultiplayerService';
import { achievementService } from '../services/AchievementService';
import { WaveSystem } from './WaveSystem'; // [버그3 수정] 추가

export class GameManager {
  private static instance: GameManager;

  // [수정] checkWaveComplete 중복 실행 방지 플래그
  private isCompletingWave = false;

  // [수정] killEnemy 중복 보상 방지: 이미 처리된 적 ID 추적
  private killedEnemyIds = new Set<string>();

  // [수정] saveService.load() 과다 호출 방지: stats 배치 업데이트
  private pendingStats = {
    enemiesKilled: 0,
    totalMoneyEarned: 0,
    bossesDefeated: 0,
  };
  private statFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private initialTotalMoney = 0;

  // [FIX-ID] 단조 증가 ID 카운터 — Date.now()+Math.random() 조합 충돌 방지
  // AOE 공격처럼 같은 ms 안에 다수의 투사체/데미지 번호가 생성될 때도 고유성 보장
  private _nextId = 0;
  private nextId(): number { return ++this._nextId; }

  // 알바 칸(프렌들리숍 ∪ 콘테스트 홀) 점유 여부 — 공격·경험치 차단에 사용.
  // 멀티플레이에는 알바 시스템이 없으므로 isWorking()이 항상 false를 돌려준다.
  private isOnWorkTile(tw: GamePokemon, currentMap: string): boolean {
    return isWorking(tw, currentMap);
  }

  // [먹다남은음식] 초당 회복을 위한 누적(타워별)
  private regenAccum = new Map<string, number>();

  static getInstance() {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
      GameManager.instance.initialTotalMoney = saveService.load().stats.totalMoneyEarned;
    }
    return GameManager.instance;
  }

  /**
   * [BUG-C2] 게임 재시작 시 싱글턴 내부 상태 초기화.
   * gameStore.reset()에서 호출됨.
   * pendingStats / statFlushTimer / isCompletingWave 가 이전 게임에서 누적되던 버그 수정.
   */
  resetState() {
    this.isCompletingWave = false;
    this.killedEnemyIds.clear();
    this.pendingStats = { enemiesKilled: 0, totalMoneyEarned: 0, bossesDefeated: 0 };
    if (this.statFlushTimer) {
      clearTimeout(this.statFlushTimer);
      this.statFlushTimer = null;
    }
    this._nextId = 0;
    this.regenAccum.clear();
    this.initialTotalMoney = saveService.load().stats.totalMoneyEarned;
  }


  // [FIX-HANG] Firestore 쓰기는 회선 단절 시(오프라인 모드 아님) 서버 ACK까지 영원히
  //   pending일 수 있음 → checkWaveComplete의 finally가 실행되지 않아 isCompletingWave가
  //   true로 고착되고 이후 웨이브 정산 전체가 멈추는 문제 방지용 타임아웃 래퍼.
  private withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
    return Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('firestore-timeout')), ms)
      ),
    ]);
  }

  // stats를 배치로 모아서 0.5초마다 한 번에 저장
  private flushStats() {
    if (this.statFlushTimer) clearTimeout(this.statFlushTimer);
    this.statFlushTimer = setTimeout(() => {
      if (
        this.pendingStats.enemiesKilled > 0 ||
        this.pendingStats.totalMoneyEarned > 0 ||
        this.pendingStats.bossesDefeated > 0
      ) {
        const cur = saveService.load().stats;
        saveService.updateStats({
          enemiesKilled: cur.enemiesKilled + this.pendingStats.enemiesKilled,
          totalMoneyEarned: cur.totalMoneyEarned + this.pendingStats.totalMoneyEarned,
          bossesDefeated: cur.bossesDefeated + this.pendingStats.bossesDefeated,
        });
        this.pendingStats = { enemiesKilled: 0, totalMoneyEarned: 0, bossesDefeated: 0 };
      }
    }, 500);
  }

  update(dt: number) {
    const { isPaused, gameOver, gameSpeed } = useGameStore.getState();
    if (isPaused || gameOver) return;

    const delta = dt * gameSpeed;
    useGameStore.getState().incrementGameTime(dt);

    this.updateCooldowns(delta);
    this.updateStatusEffects(delta);
    this.updateEnemies(delta);
    this.updateTowers(delta);
    this.updateProjectiles(delta);
    this.updateDamageNumbers(delta);
    this.checkWaveComplete();
  }

  // [FIX-MUT] 직접 변이(mutation) 제거 → setState를 통한 불변 업데이트
  private updateCooldowns(dt: number) {
    useGameStore.setState(state => ({
      towers: state.towers.map(tower => {
        if (tower.isFainted) return tower;
        const needsUpdate = tower.equippedMoves.some(m => m.currentCooldown > 0);
        if (!needsUpdate) return tower;
        return {
          ...tower,
          equippedMoves: tower.equippedMoves.map(m =>
            m.currentCooldown > 0
              ? { ...m, currentCooldown: Math.max(0, m.currentCooldown - dt) }
              : m
          ),
        };
      }),
    }));
  }

  private updateStatusEffects(dt: number) {
    const deadEnemyIds: string[] = [];

    useGameStore.setState(state => {
      let towersUpdated = false;
      const nextTowers = state.towers.map(t => {
        if (!t.statusEffect) return t;
        towersUpdated = true;
        const remaining = t.statusEffect.duration - dt;

        if (remaining <= 0) {
          return {
            ...t,
            statusEffect: undefined,
            attack: t.statusEffect.type === 'burn' ? t.baseAttack : t.attack,
          };
        } else if (t.statusEffect.tickDamage) {
          const dmg = t.statusEffect.tickDamage * dt;
          const newHp = Math.max(0, t.currentHp - dmg);
          if (newHp <= 0 && !t.isFainted) {
            return {
              ...t,
              currentHp: 0,
              isFainted: true,
              statusEffect: { ...t.statusEffect, duration: remaining },
            };
          } else {
            return {
              ...t,
              currentHp: newHp,
              statusEffect: { ...t.statusEffect, duration: remaining },
            };
          }
        } else {
          return {
            ...t,
            statusEffect: { ...t.statusEffect, duration: remaining },
          };
        }
      });

      let enemiesUpdated = false;
      const nextEnemies = state.enemies.map(e => {
        if (!e.statusEffect) return e;
        enemiesUpdated = true;
        const remaining = e.statusEffect.duration - dt;

        if (remaining <= 0) {
          return { ...e, statusEffect: undefined };
        } else if (e.statusEffect.tickDamage) {
          const dmg = e.statusEffect.tickDamage * dt;
          const newHp = Math.max(0, e.hp - dmg);
          if (newHp <= 0) deadEnemyIds.push(e.id);
          return {
            ...e,
            hp: newHp,
            statusEffect: { ...e.statusEffect, duration: remaining },
          };
        } else {
          return {
            ...e,
            statusEffect: { ...e.statusEffect, duration: remaining },
          };
        }
      });

      if (!towersUpdated && !enemiesUpdated) return state;

      return {
        towers: towersUpdated ? nextTowers : state.towers,
        enemies: enemiesUpdated ? nextEnemies : state.enemies,
      };
    });

    deadEnemyIds.forEach(id => this.killEnemy(id));
  }

  private updateEnemies(dt: number) {
    const { enemies, lives } = useGameStore.getState();
    if (lives <= 0) return;

    let lifeLost = 0;
    const toRemoveIds = new Set<string>();
    const enemyUpdates = new Map<string, Partial<Enemy>>();

    enemies.forEach(enemy => {
      if (enemy.statusEffect?.type === 'sleep' || enemy.statusEffect?.type === 'freeze') return;

      const speedMult = enemy.statusEffect?.type === 'paralysis' ? 0.5 : 1;
      let newPos = enemy.position;
      let newPathIndex = enemy.pathIndex;
      let isRemoved = false;

      if (enemy.pathIndex < enemy.path.length - 1) {
        const targetPos = enemy.path[enemy.pathIndex + 1];
        const { reached, newPos: computedPos } = this.moveEnemy(enemy, targetPos, dt, speedMult);
        newPos = computedPos;
        if (reached) {
          newPathIndex = enemy.pathIndex + 1;
        }
      } else {
        // 목표 지점 도달
        toRemoveIds.add(enemy.id);
        lifeLost += enemy.livesTaken ?? 1;
        isRemoved = true;
      }

      if (!isRemoved) {
        let newAttackCooldown = enemy.attackCooldown;
        if (newAttackCooldown > 0) {
          newAttackCooldown = Math.max(0, newAttackCooldown - dt);
        } else {
          const target = this.findTargetTower(enemy, newPos);
          if (target) {
            this.enemyAttackTower(enemy, target);
            newAttackCooldown = 2.0;
          }
        }
        
        enemyUpdates.set(enemy.id, {
          position: newPos,
          pathIndex: newPathIndex,
          attackCooldown: newAttackCooldown
        });
      }
    });

    if (toRemoveIds.size > 0 || enemyUpdates.size > 0) {
      // [WAVE-RECORD-FIX] 게임오버 '전환' 감지용. setState updater 안에서 직접
      //   비동기 쓰기를 하면 updater가 재실행될 때 중복 전송될 수 있어, 플래그만 세우고
      //   setState 밖에서 1회 전송한다.
      let justGameOver = false;

      useGameStore.setState(state => {
        let newLives = state.lives;
        let isGameOver = state.gameOver;
        let isWaveActive = state.isWaveActive;

        if (lifeLost > 0) {
          newLives = Math.max(0, state.lives - lifeLost);
          console.log(`[GameManager] Enemy reached end. Current lives: ${newLives}`);
          if (newLives <= 0 && state.lives > 0) {
            const multiRoomId = multiplayerService.getCurrentRoomId();
            if (!multiRoomId) {
              isGameOver = true;
              isWaveActive = false;
              justGameOver = true;
            }
          }
        }

        return {
          lives: newLives,
          gameOver: isGameOver,
          isWaveActive: isWaveActive,
          enemies: state.enemies
            .filter(e => !toRemoveIds.has(e.id))
            .map(e => {
              const updates = enemyUpdates.get(e.id);
              return updates ? { ...e, ...updates } : e;
            })
        };
      });

      // [WAVE-RECORD-FIX] 최고 웨이브 기록의 마지막 조각을 여기서 채운다.
      //   기존에는 completeWave의 `wave % 5 === 0`에서만 리더보드를 갱신했기 때문에
      //   도달 웨이브가 항상 5의 배수로 내림됐다(예: 64웨이브 도달 → 60으로 기록,
      //   최대 4웨이브 손실). 게임오버는 런당 1회뿐이라 Firestore 쓰기 부담도 없다.
      if (justGameOver) {
        const { wave, currentMap } = useGameStore.getState();
        // state.wave는 nextWave()에서 '웨이브 시작 시' 올라간다 → 게임오버 시점의 wave는
        // 실패 중인 웨이브 번호다. 기록 기준은 completeWave와 동일하게 '클리어한 웨이브'이므로 -1.
        //   예) 64웨이브 클리어 후 65웨이브에서 전멸 → wave=65 → 64로 기록.
        const clearedWave = wave - 1;
        if (clearedWave > 0) {
          this.withTimeout(databaseService.updateLeaderboard(currentMap, undefined, clearedWave))
            .catch(() => {}); // 오프라인/쿼터 소진/타임아웃은 무시 (게임오버 연출을 막지 않는다)
        }
      }
    }
  }

  private moveEnemy(enemy: Enemy, targetPos: Position, dt: number, speedMult: number): { reached: boolean; newPos: Position } {
    const dx = targetPos.x - enemy.position.x;
    const dy = targetPos.y - enemy.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return { reached: true, newPos: targetPos };

    const move = enemy.moveSpeed * speedMult * dt;
    const ratio = Math.min(move / dist, 1);
    return {
      reached: false,
      newPos: {
        x: enemy.position.x + dx * ratio,
        y: enemy.position.y + dy * ratio,
      }
    };
  }

  private findTargetTower(enemy: Enemy, explicitPos?: Position): GamePokemon | undefined {
    const pos = explicitPos ?? enemy.position;

    const { towers } = useGameStore.getState();
    let closest: GamePokemon | null = null;
    let minDist = Infinity;

    for (const tower of towers) {
      if (tower.isFainted) continue;
      const dx = tower.position.x - pos.x;
      const dy = tower.position.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist && dist <= enemy.range * 2) {
        minDist = dist;
        closest = tower;
      }
    }
    return closest || undefined;
  }

  private enemyAttackTower(enemy: Enemy, tower: GamePokemon) {
    const { updateTower, activeSynergies, towers, addDamageNumber } = useGameStore.getState();
    const buffedStats = getBuffedStats(tower, activeSynergies);
    const enemyAttackType = enemy.types[0] || 'normal';
    // 테라스탈 타일 점유 시 방어 상성은 테라타입 단일로 계산(원전 충실형)
    const defenseTypes = tower.teraType ? [tower.teraType] : tower.types;
    let eff = getTypeEffectiveness(enemyAttackType, defenseTypes);

    let finalDamageMultiplier = 1.0;
    const sixPieceTypeSynergies = activeSynergies.filter(
      s => s.id.startsWith('type:') && s.level === 3
    );
    for (const syn of sixPieceTypeSynergies) {
      const synergyType = syn.id.split(':')[1];
      if (tower.types.includes(synergyType)) {
        const singleTypeEff = getTypeEffectiveness(enemyAttackType, [synergyType]);
        if (singleTypeEff === 2) {
          finalDamageMultiplier = 0.5;
          break;
        }
      }
    }

    // [통일] 데미지 난수 — 아레나·AI서비스·카드는 모두 0.85~1.0을 굴리는데 싱글TD만 없었다.
    const dmg = calculateDamage(
      enemy.attack, buffedStats.defense, 40, eff, false, 1, singleDamageRandom()
    );
    // [BUG-FIX] ability.effect === 'tank' 적용: 피해 감소 특성 반영
    const tankMultiplier = tower.ability?.effect === 'tank' ? (tower.ability.value ?? 0.75) : 1.0;
    const finalDmg = Math.max(1, Math.floor(dmg * finalDamageMultiplier * tankMultiplier));
    const newHp = Math.max(0, tower.currentHp - finalDmg);

    if (newHp <= 0) {
      updateTower(tower.id, { currentHp: 0, isFainted: true });
      useGameStore.getState().updateEnemy(enemy.id, { targetTowerId: undefined });
    } else {
      updateTower(tower.id, { currentHp: newHp });

      // ── 지닌 도구(일회성 열매): 피격 반응 ─────────────────────────
      // 한카포열매: 효과가 굉장한 공격을 맞으면 HP 25% 회복(1회 소모)
      if (tower.heldItem === 'enigma-berry' && eff > 1) {
        const healed = Math.min(tower.maxHp, newHp + Math.floor(tower.maxHp * 0.25));
        updateTower(tower.id, { currentHp: healed, heldItem: undefined });
      } else if (tower.heldItem === 'sitrus-berry' && newHp / tower.maxHp < 0.5) {
        // 자뭉열매: HP 50% 미만으로 떨어지면 20% 회복 후 소모
        const healed = Math.min(tower.maxHp, newHp + Math.floor(tower.maxHp * 0.20));
        updateTower(tower.id, { currentHp: healed, heldItem: undefined });
      }
    }

    // 인접 타워 광역 피해: 주 피격 타워 주변 100px(약 1.5타일) 이내 타워에 주 피해의 30%
    const splashRadius = 100;
    const splashDmg = Math.floor(finalDmg * 0.3);
    if (splashDmg > 0) {
      towers.forEach(otherTower => {
        if (otherTower.id === tower.id || otherTower.isFainted) return;
        const dx = otherTower.position.x - tower.position.x;
        const dy = otherTower.position.y - tower.position.y;
        if (Math.sqrt(dx * dx + dy * dy) > splashRadius) return;

        const otherNewHp = Math.max(0, otherTower.currentHp - splashDmg);
        updateTower(otherTower.id, { currentHp: otherNewHp, isFainted: otherNewHp <= 0 });

        // 스플래시 피해 수치 표시
        addDamageNumber({
          id: `splash-${this.nextId()}`,
          value: splashDmg,
          position: { ...otherTower.position },
          isCrit: false,
          lifetime: 0.8,
        });
      });
    }
  }

  private updateTowers(dt: number) {
    const { towers, enemies, updateTower, currentMap } = useGameStore.getState();
    // 알바 포켓몬(프렌들리숍·콘테스트 홀 점유)은 근무 중이라 공격하지 않는다.
    const isWorking = (tw: GamePokemon) => this.isOnWorkTile(tw, currentMap);
    towers.forEach(tower => {
      if (tower.currentHp <= 0 && !tower.isFainted) {
        updateTower(tower.id, { currentHp: 0, isFainted: true });
        return;
      }
      if (tower.isFainted) return;

      // 먹다남은음식: 초당 일정 비율 회복(전투 중 유지)
      const regen = heldRegenPerSec(tower.heldItem);
      if (regen > 0 && tower.currentHp < tower.maxHp) {
        const acc = (this.regenAccum.get(tower.id) ?? 0) + tower.maxHp * regen * dt;
        if (acc >= 1) {
          const heal = Math.floor(acc);
          updateTower(tower.id, { currentHp: Math.min(tower.maxHp, tower.currentHp + heal) });
          this.regenAccum.set(tower.id, acc - heal);
        } else {
          this.regenAccum.set(tower.id, acc);
        }
      }

      if (isWorking(tower)) return; // 알바는 공격 생략

      const target = this.findTarget(tower, enemies);
      if (target) {
        const move = tower.equippedMoves.find(m => m.currentCooldown <= 0);
        if (move) {
          this.towerAttack(tower, target, move);
        }
      }
    });
  }

  private findTarget(tower: GamePokemon, enemies: Enemy[]): Enemy | null {
    const range = tower.range * 64;
    let closest: Enemy | null = null;
    let minDist = Infinity;

    for (const enemy of enemies) {
      const dx = enemy.position.x - tower.position.x;
      const dy = enemy.position.y - tower.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= range && dist < minDist) {
        minDist = dist;
        closest = enemy;
      }
    }
    return closest;
  }

  private towerAttack(tower: GamePokemon, target: Enemy, move: GameMove) {
    // [BUG-FIX] ability.effect === 'speed' 적용: 공격 속도 증가 특성 반영
    let speedStat = tower.speed;
    if (tower.ability?.effect === 'speed') {
      speedStat = Math.min(speedStat * (tower.ability.value ?? 1.5), 290); // 최대 쿨다운 0.2 하한 보호
    }
    const speedMultiplier = Math.max(0.2, 1 - speedStat / 300);

    const m = tower.equippedMoves.find(m => m.name === move.name);
    if (m) {
      const hitChance = m.accuracy / 100;
      if (rng() > hitChance) {
        useGameStore.getState().addDamageNumber({
          id: `miss-${this.nextId()}`,
          value: 0,
          position: { ...target.position },
          isCrit: false,
          isMiss: true,
          lifetime: 1.0,
        });
        // [FIX-MUT] 직접 변이 제거 → updateTower 경유
        useGameStore.getState().updateTower(tower.id, {
          equippedMoves: tower.equippedMoves.map(mv =>
            mv.name === move.name
              ? { ...mv, currentCooldown: mv.cooldown * speedMultiplier }
              : mv
          ),
        });
        return;
      }
      // [FIX-MUT] 직접 변이 제거 → updateTower 경유
      useGameStore.getState().updateTower(tower.id, {
        equippedMoves: tower.equippedMoves.map(mv =>
          mv.name === move.name
            ? { ...mv, currentCooldown: mv.cooldown * speedMultiplier }
            : mv
        ),
      });
    }

    const { activeSynergies } = useGameStore.getState();
    const buffedStats = getBuffedStats(tower, activeSynergies);
    const attackPower =
      move.damageClass === 'physical' ? buffedStats.attack : buffedStats.specialAttack;

    useGameStore.getState().addProjectile({
      id: `proj-${this.nextId()}`,
      from: { ...tower.position },
      to: { ...target.position },
      current: { ...tower.position },
      // 리샘열매: 이번 1회 공격 위력 ×1.5
      damage: move.power * (tower.heldItem === 'liechi-berry' ? 1.5 : 1),
      type: move.type,
      effect: move.effect,
      speed: 400,
      targetId: target.id,
      isAOE: move.isAOE,
      aoeRadius: move.aoeRadius,
      attackPower,
      damageClass: move.damageClass,
      attackerTypes: tower.types,
      attackerId: tower.id,
    } as any);

    // ── 지닌 도구: 발사 시점 효과 ───────────────────────────────────
    // 리샘열매: 1회 사용 후 소모
    if (tower.heldItem === 'liechi-berry') {
      useGameStore.getState().updateTower(tower.id, { heldItem: undefined });
    }
    // 생명의구슬: 공격마다 최대 HP의 일부 소모(HP 1 하한)
    const recoil = heldRecoilRatio(tower.heldItem);
    if (recoil > 0) {
      const cost = Math.floor(tower.maxHp * recoil);
      const newHp = Math.max(1, tower.currentHp - cost);
      if (newHp !== tower.currentHp) useGameStore.getState().updateTower(tower.id, { currentHp: newHp });
    }
  }

  private updateProjectiles(dt: number) {
    const { enemies } = useGameStore.getState();

    // [BUG-FIX] 직접 변이(mutation) 제거 → setState를 통한 불변 업데이트
    // 충돌·제거 대상과 이동 대상을 분리 후 단일 setState로 처리
    const toRemoveIds = new Set<string>();
    const hits: Array<{ proj: Projectile; target: Enemy }> = [];

    useGameStore.setState(state => {
      const updatedProjectiles = state.projectiles.map(proj => {
        const target = enemies.find(e => e.id === proj.targetId);
        if (!target) {
          toRemoveIds.add(proj.id);
          return proj;
        }
        const dx = target.position.x - proj.current.x;
        const dy = target.position.y - proj.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) {
          hits.push({ proj, target });
          toRemoveIds.add(proj.id);
          return proj;
        }
        const move = proj.speed * dt;
        const ratio = Math.min(move / dist, 1);
        return {
          ...proj,
          current: {
            x: proj.current.x + dx * ratio,
            y: proj.current.y + dy * ratio,
          },
        };
      }).filter(p => !toRemoveIds.has(p.id));
      return { projectiles: updatedProjectiles };
    });

    // 충돌 처리는 setState 밖에서 실행
    hits.forEach(({ proj, target }) => this.projectileHit(proj, target));
  }

  private projectileHit(proj: Projectile, enemy: Enemy) {
    if (proj.isAOE && proj.aoeRadius) {
      this.applyAOEDamage(proj.current, proj.aoeRadius, proj);
    } else {
      this.applyDamage(proj, enemy);
    }
  }

  private applyAOEDamage(center: Position, radius: number, proj: Projectile) {
    const { enemies } = useGameStore.getState();
    const affected = enemies.filter(e => {
      const dx = e.position.x - center.x;
      const dy = e.position.y - center.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
    affected.forEach(e => this.applyDamage(proj, e));
  }

  private applyDamage(proj: Projectile, enemy: Enemy) {
    // [FIX-STALE-HP] 같은 프레임에 여러 투사체가 동일 적에 명중하면, hits 스냅샷의
    //   낡은 hp 기준으로 각자 newHp를 계산해 먼저 맞은 데미지가 덮어써졌음.
    //   최신 상태에서 재조회해 누적 피해가 정확히 반영되게 한다.
    const freshEnemy = useGameStore.getState().enemies.find(e => e.id === enemy.id);
    if (!freshEnemy) return; // 이미 처치/제거된 적
    enemy = freshEnemy;

    const { addDamageNumber, towers, updateTower } = useGameStore.getState();
    const eff = getTypeEffectiveness(proj.type, enemy.types);

    const attacker = proj.attackerId
      ? towers.find(t => t.id === proj.attackerId)
      : undefined;
    const held = attacker?.heldItem;
    const critChance = getCriticalChance(attacker?.ability) + heldCritBonus(held); // 초점렌즈
    const isCrit = rng() < critChance;
    // 테라스탈 반영 자속 배율. 명중 시점의 타워 상태(teraType)를 사용; 타워가 없으면 투사체에 실린 원래타입으로 폴백.
    const atkTypes = attacker?.types ?? proj.attackerTypes;
    const stab = stabMultiplier(atkTypes, attacker?.teraType, proj.type);

    const defense =
      proj.damageClass === 'physical' ? enemy.defense : enemy.specialDefense;
    let dmg = calculateDamage(
      proj.attackPower, defense, proj.damage, eff, isCrit, stab, singleDamageRandom()
    );

    // 지닌 도구 데미지 배율 (생명의구슬/달인의띠/근육밴드/신비의구슬)
    if (held) {
      dmg = Math.floor(dmg * heldDamageMultiplier(held, eff > 1, proj.damageClass));
    }

    if (proj.isAOE && attacker?.ability) {
      const aoeMultiplier = getAOEDamageMultiplier(attacker.ability);
      dmg = Math.floor(dmg * aoeMultiplier);
    }

    const newHp = Math.max(0, enemy.hp - dmg);
    useGameStore.getState().updateEnemy(enemy.id, { hp: newHp });

    // 흡혈(drainPercent > ability.lifesteal, + 조개껍질방울) + 전투 통계를 한 번에 반영.
    // [STATS-FIX 2026-07-12] kills/damageDealt는 생성 시 0으로만 세팅되고 아무 데서도
    //   증가하지 않아 포켓몬 관리 패널에 항상 0으로 표시되던 버그 — 여기서 집계한다.
    //   같은 프레임 다중 명중의 낡은 스냅샷 문제를 피하려고 최신 상태를 재조회(흡혈도 동일 수혜).
    if (attacker) {
      const freshAtk = useGameStore.getState().towers.find(t => t.id === attacker.id);
      if (freshAtk) {
        const updates: Partial<typeof freshAtk> = {
          damageDealt: (freshAtk.damageDealt ?? 0) + dmg,
        };
        if (!freshAtk.isFainted) {
          const drainRatio = (proj.effect.drainPercent
            ?? (freshAtk.ability?.effect === 'lifesteal' ? (freshAtk.ability.value ?? 0) : 0))
            + heldLifesteal(freshAtk.heldItem);
          if (drainRatio > 0) {
            updates.currentHp = Math.min(freshAtk.maxHp, freshAtk.currentHp + Math.floor(dmg * drainRatio));
          }
        }
        // 킬 귀속: 이 명중이 막타면 +1 (killEnemy가 removeEnemy를 동기 실행하므로 중복 귀속 없음)
        if (newHp <= 0 && !this.killedEnemyIds.has(enemy.id)) {
          updates.kills = (freshAtk.kills ?? 0) + 1;
        }
        updateTower(attacker.id, updates);
      }
    }

    addDamageNumber({
      id: `dmg-${this.nextId()}`,
      value: dmg,
      position: { ...enemy.position },
      isCrit,
      effectiveness: eff,
      lifetime: 1.0,
    });

    // 상태이상 부여
    if (proj.effect.statusInflict && proj.effect.statusChance != null) {
      if (rng() * 100 < proj.effect.statusChance) {
        const duration =
          proj.effect.statusInflict === 'freeze' ||
          proj.effect.statusInflict === 'sleep'
            ? 2.0
            : 5.0;
        useGameStore.getState().updateEnemy(enemy.id, {
          statusEffect: {
            type: proj.effect.statusInflict,
            duration,
            tickDamage:
              proj.effect.statusInflict === 'poison' ? 10 : undefined,
          },
        });
      }
    }

    if (newHp <= 0) this.killEnemy(enemy.id);
  }

  // [수정] 중복 보상 방지: killedEnemyIds로 이미 처리된 적 추적
  // [수정 5] 업적 체크 시 pendingStats의 미저장 값도 포함하여 올바른 누적치로 체크
  private killEnemy(id: string) {
    if (this.killedEnemyIds.has(id)) return;
    this.killedEnemyIds.add(id);

    const { enemies, removeEnemy, addMoney, addXpToTower } = useGameStore.getState();
    const enemy = enemies.find(e => e.id === id);
    if (!enemy) return;

    const reward = enemy.reward ?? 10;
    addMoney(reward);
    removeEnemy(id);
    useGameStore.setState(state => ({ combo: state.combo + 1 }));

    // [BUG-1 FIX] isFainted 타워는 XP 지급 제외(쓰러진 상태 레벨업 방지).
    // 알바 포켓몬(숍·콘테스트 홀)도 근무 중이라 경험치를 받지 않는다.
    // 시뮬 밸런스 실험 오버라이드(xpPerKill/xpSplit) — 프로덕션은 미설정 = 10/50 유지.
    const baseXp = BALANCE_OVERRIDES.xpPerKill ?? 10;
    const xpAmount = enemy.isBoss ? baseXp * 5 : baseXp;
    const curMap = useGameStore.getState().currentMap;
    const recipients = useGameStore.getState().towers
      .filter(t => !t.isFainted && !this.isOnWorkTile(t, curMap));
    const each = BALANCE_OVERRIDES.xpSplit && recipients.length > 0
      ? Math.max(1, Math.round(xpAmount / recipients.length))
      : xpAmount;
    recipients.forEach(t => {
      addXpToTower(t.id, each);
    });

    // [수정 5] pendingStats 증가
    this.pendingStats.enemiesKilled++;
    this.pendingStats.totalMoneyEarned += reward;
    if (enemy.isBoss) this.pendingStats.bossesDefeated++;
    this.flushStats();

    // [A2-FIX] pendingStats flush 딜레이(500ms)로 인해 localStorage가 stale일 수 있음.
    //   저장값 + 미flush 누적값 합산 → 정확한 현재 처치 수를 onKill에 직접 전달.
    const savedStats = saveService.load().stats;
    const accumulatedKills = savedStats.enemiesKilled + this.pendingStats.enemiesKilled;
    const accumulatedBosses = savedStats.bossesDefeated + this.pendingStats.bossesDefeated;
    achievementService.onKill(enemy.name, enemy.isBoss, accumulatedKills, accumulatedBosses);
    // [FIX-6] setTimeout 5초 딜레이 클리어 제거 — checkWaveComplete.finally에서
    // killedEnemyIds.clear()가 일괄 처리하므로 개별 setTimeout 불필요 (타이밍 중복 방지)
  }

  // [FIX-MUT] 직접 변이(mutation) 제거 → setState를 통한 불변 업데이트
  // 만료된 항목 필터링과 position/lifetime 갱신을 단일 setState로 처리
  private updateDamageNumbers(dt: number) {
    useGameStore.setState(state => {
      if (state.damageNumbers.length === 0) return state;
      return {
        damageNumbers: state.damageNumbers
          .filter(dmg => dmg.lifetime > dt)
          .map(dmg => ({
            ...dmg,
            lifetime: dmg.lifetime - dt,
            position: { x: dmg.position.x, y: dmg.position.y - 20 * dt },
          })),
      };
    });
  }

  // [수정] checkWaveComplete: isCompletingWave 플래그로 중복 실행 방지
  // [수정] 멀티플레이에서 isPaused: true 설정 안 함 (BattlePhaseUI가 페이즈 전환 담당)
  // [FIX] 보스뿐 아니라 일반 적의 async 스폰도 완료될 때까지 웨이브 종료 방지
  private async checkWaveComplete() {
    const { enemies, isWaveActive, isSpawning, lives } = useGameStore.getState();

    // [FIX] hasPendingSpawns: 보스 + 일반 적의 async 스폰 모두 체크
    const waveSystem = WaveSystem.getInstance();
    if (!isWaveActive || isSpawning || enemies.length !== 0 || waveSystem.hasPendingSpawns) return;
    if (this.isCompletingWave) return;

    // [FIX-3] 멀티플레이에서 라이프가 0이 된 경우(탈락 상태) 웨이브 완료 처리 방지
    // GameLayout의 defeatedRef 구독이 처리하기 전에 markWaveCompleted가 호출되는
    // 레이스 컨디션을 방지. 탈락자가 아직 살아있는 것으로 카운트되면 안 됨.
    const multiRoomId = multiplayerService.getCurrentRoomId();
    if (multiRoomId && lives <= 0) return;

    this.isCompletingWave = true;

    try {
      const { healAllTowers, setWaveEndItemPick, towers, wave, gameTime, currentMap, lives: currentLives, difficulty } =
        useGameStore.getState();

      const isMultiplayer = !!multiRoomId; // 위에서 선언한 multiRoomId 재사용

      // 웨이브 종료 처리
      // 멀티플레이: isPaused 설정 안 함 (BattlePhaseUI가 카운트다운 관리)
      // 싱글플레이: isPaused: true로 설정
      useGameStore.setState({
        isWaveActive: false,
        combo: 0,
        isPaused: !isMultiplayer,
      });

      healAllTowers();

      // [알바] 프렌들리숍·콘테스트 홀에 올라간 타워의 누적 근무 웨이브 +1 → 상점 등급/레어도 부스트 해금
      //   (멀티플레이는 알바 시스템 자체가 없어 isOnWorkTile이 항상 false)
      for (const tw of towers) {
        if (this.isOnWorkTile(tw, currentMap)) {
          const nextWaves = (tw.shopWavesHeld ?? 0) + 1;
          useGameStore.getState().updateTower(tw.id, { shopWavesHeld: nextWaves });

          // 회수 프롬프트는 5·10·15웨이브에서만. 15(최고 등급)부터는 잠금이 풀려
          // 웨이브 사이에 언제든 직접 뺄 수 있으므로 더 물어볼 필요가 없다.
          if (nextWaves % 5 === 0 && nextWaves <= WORK_FREE_WITHDRAW_WAVES) {
            const fac = facilityTilesOfMap(currentMap);
            const tx = Math.floor(tw.position.x / 64);
            const ty = Math.floor(tw.position.y / 64);
            const isClerk = fac.shopTiles.some(s => s.x === tx && s.y === ty);

            useGameStore.getState().addClerkOrScoutPrompt({
              towerId: tw.id,
              waves: nextWaves,
              pokemonName: tw.displayName,
              facilityKey: isClerk ? 'shop' : 'contest'
            });
          }
        }
      }

      const itemChoices = this.buildWaveEndItems(towers, wave);
      setWaveEndItemPick(itemChoices);

      // [카드모드][경제] 웨이브 클리어 코인 — 싱글 전용, 도달 웨이브 비례(져도 도달분 적립).
      //   미니 포켓 재화의 '큰' 수급처가 싱글/멀티가 되도록 웨이브당 코인을 상향.
      if (!isMultiplayer) {
        cardService.grantRewards({ coins: 4 + Math.floor(wave / 6) });
      }

      // 웨이브 클리어 (싱글플레이 전용)
      // 멀티플레이는 PvP 모드라 "50웨이브 클리어" 개념 자체가 없다.
      // 스토리 모드: storyTotalWaves 기준 / 일반 모드: 50웨이브
      const { storyTotalWaves, storyChapterNumber } = useGameStore.getState();
      const clearWave = storyTotalWaves ?? 50;
      const isStoryClear = !isMultiplayer && storyChapterNumber !== null && wave === clearWave;
      const isNormalClear = !isMultiplayer && storyChapterNumber === null && wave === 50;

      if (isStoryClear || isNormalClear) {
        useGameStore.setState({
          wave50Clear: !isStoryClear,  // 일반 모드만 wave50Clear
          storyClear: isStoryClear,    // 스토리 모드 클리어
        });
        // [카드모드][경제] 클리어 보너스 — 싱글 완주는 큰 보상(팩깡 여러 번 분량). 일반/스토리 공통.
        cardService.grantRewards({ coins: 350, starShards: 50 });
        // [전당등록] 싱글 플레이(일반 모드) 결과만 전당/리더보드에 반영.
        // 스토리 모드 클리어는 전당등록 대상이 아니다.
        if (isNormalClear) {
          // [OFFLINE-FIX] 로컬 업적/보상을 Firestore 쓰기보다 '먼저' 확정한다.
          //   예전엔 addHallOfFameEntry/updateLeaderboard await 뒤에 있어, 쿼터 초과로 그 쓰기가
          //   throw하면 catch가 삼켜 wave50 업적과 별조각 보상이 통째로 유실됐음.
          saveService.updateAchievement('wave50', 50);
          try {
            const map = getMapById(currentMap);
            const pokemonUsed = towers.map(t => t.displayName);
            await this.withTimeout(databaseService.addHallOfFameEntry(
              currentMap,
              map?.name || 'Unknown Map',
              wave,
              pokemonUsed,
              gameTime
            ));
            await this.withTimeout(databaseService.updateLeaderboard(currentMap, gameTime, wave));
          } catch (err) {
            console.error('Failed to save Wave 50 clear data:', err);
          }
        }
        return;
      }

      // 싱글플레이 업적 체크
      if (!isMultiplayer) {
        try {
          // 도전 업적 (퍼펙트/스피드런/불패/난이도/속도) → AchievementService 위임
          achievementService.onWaveComplete(wave, currentLives, INITIAL_LIVES_SINGLE, gameTime, difficulty, towers);

          // 전설 포켓몬 수집 업적
          for (const tower of towers) {
            if (!tower.isFainted) {
              const rarity = await pokeAPI.getRarity(tower.pokemonId);
              if (rarity === 'Legend') {
                saveService.updateAchievement('legendary', 1);
                break;
              }
            }
          }

          // 누적 골드 업적 (한 게임 기준)
          const currentTotalMoney = saveService.load().stats.totalMoneyEarned + this.pendingStats.totalMoneyEarned;
          const inGameMoney = currentTotalMoney - this.initialTotalMoney;
          achievementService.onMoneyEarned(inGameMoney);

          // 시너지 업적 (현재 활성 시너지 기준)
          const { activeSynergies } = useGameStore.getState();
          achievementService.onSynergyUpdate(activeSynergies);

        } catch (err) {
          console.error('Failed to check achievements:', err);
        }

        // [FREE-TIER] 리더보드 업데이트: 매 웨이브가 아닌 5웨이브마다 1회만 업데이트.
        // 50웨이브 완주 시 50회 → 10회로 Firestore 쓰기 80% 절감.
        if (wave % 5 === 0) {
          try {
            await this.withTimeout(databaseService.updateLeaderboard(currentMap, undefined, wave));
          } catch {
            // 무시 (타임아웃 포함)
          }
        }
      }
    } finally {
      this.isCompletingWave = false;
      // 다음 웨이브를 위해 killedEnemyIds 초기화
      this.killedEnemyIds.clear();
    }
  }

  private buildWaveEndItems(towers: GamePokemon[], _wave: number) {
    const { hasMegaEvolution: _hasMega, hasGigantamax: _hasGiga } = { hasMegaEvolution, hasGigantamax };
    const itemChoices = [
      {
        id: 'rare_candy',
        name: 'waveEnd.candyName',
        type: 'candy' as const,
        cost: 0,
        effect: 'waveEnd.candyDesc',
      },
      {
        id: 'revive_shard',
        name: 'waveEnd.reviveName',
        type: 'revive' as const,
        cost: 0,
        effect: 'waveEnd.reviveDesc',
      },
    ];

    // 스토리 모드에서는 메가스톤 / 다이버섯 미등장
    const isStoryMode = useGameStore.getState().storyChapterNumber !== null;
    if (isStoryMode) return itemChoices;

    const megaEligible = towers.filter(t => hasMegaEvolution(t.pokemonId));
    if (megaEligible.length > 0 && rng() < 0.1 * megaEligible.length) {
      const randomPokemon = megaEligible[Math.floor(rng() * megaEligible.length)];
      const megaData = MEGA_EVOLUTIONS.find(m => m.from === randomPokemon.pokemonId);
      if (megaData) {
        itemChoices.push({
          id: `mega_stone_${megaData.item}`,
          // 다른 보상 아이템과 같이 번역 키를 담는다 — 포켓몬 이름은 파라미터로 넘긴다.
          name: 'waveEnd.megaStoneName',
          type: 'mega-stone' as any,
          cost: 0,
          effect: 'waveEnd.megaStoneEffect',
          i18nParams: { name: randomPokemon.displayName },
          targetPokemonId: randomPokemon.pokemonId,
        } as any);
      }
    }

    const gigaEligible = towers.filter(t => hasGigantamax(t.pokemonId));
    if (gigaEligible.length > 0 && rng() < 0.1 * gigaEligible.length) {
      const randomPokemon = gigaEligible[Math.floor(rng() * gigaEligible.length)];
      const gigaData = GIGANTAMAX_FORMS.find(g => g.from === randomPokemon.pokemonId);
      if (gigaData) {
        itemChoices.push({
          id: `max_mushroom_${randomPokemon.pokemonId}`,
          name: 'waveEnd.maxMushroomName',
          type: 'max-mushroom' as any,
          cost: 0,
          effect: 'waveEnd.maxMushroomEffect',
          i18nParams: { name: randomPokemon.displayName },
          targetPokemonId: randomPokemon.pokemonId,
        } as any);
      }
    }

    return itemChoices;
  }
}