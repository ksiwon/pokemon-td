// src/game/WaveSystem.ts
import { useGameStore } from "../store/gameStore";
import { Enemy } from "../types/game";
import { getMapById } from "../data/maps";
import { pokeAPI } from "../api/pokeapi";

const DIFFICULTY_MULTIPLIERS: Record<
  string,
  { hp: number; attack: number; reward: number }
> = {
  // [BALANCE] reward: medium=1.0 기준 난이도당 0.1씩 차등 → 고난도에 골드 이득을 줘 선택 이유 부여.
  // [BALANCE 실험 이력 2026-07-11] 일괄 -0.1(0.2~1.0) 시뮬 A안: easy/medium p50 +5~8 개선,
  //   easiest 후반벽·hard 초반벽엔 무효, 멀티 PvE 비중 9.6%로 과소 → 원복.
  //   B안(지수 1.08→1.06)과 비교 측정 중.
  // [BALANCE 실험 2026-07-11] 사다리 압축: 0.3~1.1(0.2step) → 0.4~1.0(0.15step)
  //   하단 강화·상단 완화·medium 앵커. 1.06 지수와 조합 측정 중.
  easiest: { hp: 0.4,  attack: 0.4,  reward: 0.8 },
  easy:    { hp: 0.55, attack: 0.55, reward: 0.9 },
  medium:  { hp: 0.7,  attack: 0.7,  reward: 1.0 }, // maps.ts 'medium' 대응
  hard:    { hp: 0.85, attack: 0.85, reward: 1.1 },
  expert:  { hp: 1.0,  attack: 1.0,  reward: 1.2 },
};

// ─── 스토리 모드 챕터별 난이도 배율 ────────────────────────────────────────────
// 30웨이브 기준. 후반 체감 난이도가 과해 곡선을 완만하게 낮춤(상한 1.0).
// 실효 난이도 = 챕터배율 × 1.05^(wave-1). ch8 wave30 ≈ 1.0×4.1 = 4.1x (기존 11.2x).
const STORY_CHAPTER_MULTIPLIERS: Record<number, { hp: number; attack: number; reward: number }> = {
  1: { hp: 0.60, attack: 0.60, reward: 1.0 },
  2: { hp: 0.60, attack: 0.60, reward: 1.0 },
  3: { hp: 0.70, attack: 0.70, reward: 1.0 },
  4: { hp: 0.70, attack: 0.70, reward: 1.0 },
  5: { hp: 0.80, attack: 0.80, reward: 1.0 },
  6: { hp: 0.80, attack: 0.80, reward: 1.0 },
  7: { hp: 0.90, attack: 0.90, reward: 1.0 },
  8: { hp: 0.90, attack: 0.90, reward: 1.0 },
};

// 웨이브별 종족값 범위 (스폰 포켓몬 강도 조절)
const WAVE_STAT_RANGES: Array<{ min: number; max: number }> = [
  { min: 1,   max: 300  }, // 1~5
  { min: 200, max: 380  }, // 6~10
  { min: 280, max: 430  }, // 11~15
  { min: 320, max: 480  }, // 16~20
  { min: 370, max: 510  }, // 21~25
  { min: 410, max: 550  }, // 26~30
  { min: 450, max: 580  }, // 31~35
  { min: 490, max: 600  }, // 36~40
  { min: 520, max: 630  }, // 41~45
  { min: 550, max: 660  }, // 46~50
];

function getStatRange(wave: number): { min: number; max: number } {
  const idx = Math.min(Math.floor((wave - 1) / 5), WAVE_STAT_RANGES.length - 1);
  return WAVE_STAT_RANGES[idx];
}

export class WaveSystem {
  private static instance: WaveSystem;
  private enemyCounter = 0;

  // [수정] 스폰 타이머 ID 추적 (웨이브 전환 시 취소)
  private activeTimers: ReturnType<typeof setTimeout>[] = [];

  // [버그3 수정] 보스 스폰 대기 중 플래그
  // setSpawning(false) 이후에도 보스가 아직 async 스폰 중이면 웨이브 완료 방지
  private _bossSpawnPending = false;

  // [FIX] 비동기 스폰 중인 적 수 추적 (async spawnEnemy가 addEnemy 호출 전까지 카운트)
  private _pendingSpawnCount = 0;

  // [FIX-RACE] 스폰 epoch: cancelPendingSpawns 시 증가 → 이전 async 스폰이 addEnemy 호출 차단
  private _spawnEpoch = 0;

  // [FIX-7] 모든 스폰 타이머가 완료(스케줄링 끝) 되었는지 여부
  // setSpawning(false)는 스케줄 완료 + pendingSpawnCount=0 이 모두 충족될 때만 호출
  private _schedulingComplete = false;

  static getInstance() {
    if (!WaveSystem.instance) {
      WaveSystem.instance = new WaveSystem();
    }
    return WaveSystem.instance;
  }

  // [버그3 수정] GameManager에서 조회 가능한 getter
  get isBossSpawnPending(): boolean {
    return this._bossSpawnPending;
  }

  // [FIX] 모든 비동기 스폰(일반 적 + 보스) 완료 여부 체크
  get hasPendingSpawns(): boolean {
    return this._pendingSpawnCount > 0 || this._bossSpawnPending;
  }

  // [수정] 새 웨이브 시작 전 이전 웨이브의 미실행 타이머 취소
  cancelPendingSpawns() {
    this.activeTimers.forEach(id => clearTimeout(id));
    this.activeTimers = [];
    this._bossSpawnPending = false;
    this._pendingSpawnCount = 0;
    this._schedulingComplete = false;
    // [FIX-RACE] epoch 증가 → 진행 중인 async spawnEnemy가 addEnemy 호출을 건너뜀
    this._spawnEpoch++;
  }

  startWave(wave: number) {
    this.cancelPendingSpawns();

    const { currentMap, addEnemy, setSpawning } = useGameStore.getState();
    const map = getMapById(currentMap);
    if (!map || map.paths.length === 0) return;

    setSpawning(true);

    // 난이도: 스토리 모드면 챕터 번호 기준, 아니면 맵 difficulty 기준
    const { storyChapterNumber } = useGameStore.getState();
    const mult = (storyChapterNumber !== null && STORY_CHAPTER_MULTIPLIERS[storyChapterNumber])
      ? STORY_CHAPTER_MULTIPLIERS[storyChapterNumber]
      : (DIFFICULTY_MULTIPLIERS[map.difficulty] ?? DIFFICULTY_MULTIPLIERS['medium']);
    const count = this.getEnemyCount(wave);
    const pathsToUse = map.paths;

    // 전 모드 3의 배수 웨이브마다 보스(중간 보스). 스토리도 동일.
    // 단 wave30 보스는 '최종 보스'(고정 에이스 + 대폭 강화) — spawnEnemy에서 분기.
    const isBossWave = wave % 3 === 0;

    // [버그3 수정] 보스 웨이브 시작 시 플래그 ON
    if (isBossWave) {
      this._bossSpawnPending = true;
    }

    // [FIX-BG] 백그라운드 탭에서 setTimeout이 최대 1000ms로 스로틀링되는 문제 대응
    // 절대 시각(waveStartAt) 기반으로 각 스폰의 예정 시각을 계산하고,
    // setTimeout 콜백 내에서 실제 경과 시간을 확인해 지연된 경우에도 즉시 실행
    const waveStartAt = Date.now();

    let lastSpawnTime = 0;

    for (let i = 0; i < count; i++) {
      const pathIndex = i % pathsToUse.length;
      const currentPath = pathsToUse[pathIndex];
      const spawnDelay = Math.floor(i / pathsToUse.length) * 800;
      const scheduledAt = waveStartAt + spawnDelay;

      const timer = setTimeout(() => {
        // 탭이 비활성이었다면 이미 스폰됐어야 할 시간이 지난 것 → 그냥 즉시 실행
        const late = Date.now() - scheduledAt;
        if (late > 5000) {
          // 5초 이상 지연: 탭 비활성으로 인한 지연이므로 스킵하지 않고 즉시 실행
          console.log(`[WaveSystem] Spawning enemy ${i} late by ${late}ms (background tab)`);
        }
        // [FIX] async 스폰 추적: 시작 시 증가, 완료(성공/실패 불문) 시 감소
        this._pendingSpawnCount++;
        this.spawnEnemy(wave, currentPath, false, mult, addEnemy)
          .finally(() => {
            this._pendingSpawnCount--;
            // [FIX-7] 스케줄 완료 후 마지막 async 스폰이 끝나면 isSpawning 해제
            if (this._pendingSpawnCount === 0 && this._schedulingComplete && !this._bossSpawnPending) {
              useGameStore.getState().setSpawning(false);
            }
          });
      }, spawnDelay);
      this.activeTimers.push(timer);
      lastSpawnTime = spawnDelay;
    }

    // 3의 배수 웨이브마다 보스 스폰
    if (isBossWave) {
      const bossSpawnTime = Math.ceil(count / pathsToUse.length) * 800 + 2000;
      const bossTimer = setTimeout(async () => {
        // [FIX] 보스도 pendingSpawnCount로 추적
        this._pendingSpawnCount++;
        try {
          // [버그3 수정] 보스 addEnemy 완료 후 플래그 OFF
          await this.spawnBossInternal(wave, pathsToUse[0], mult, addEnemy);
        } finally {
          this._pendingSpawnCount--;
          this._bossSpawnPending = false;
          // [FIX-7] 보스가 마지막 async 스폰인 경우 isSpawning 해제
          if (this._pendingSpawnCount === 0 && this._schedulingComplete) {
            useGameStore.getState().setSpawning(false);
          }
        }
      }, bossSpawnTime);
      this.activeTimers.push(bossTimer);
      lastSpawnTime = bossSpawnTime;
    }

    const endTimer = setTimeout(() => {
      // [FIX-7] 스케줄링 완료 표시. setSpawning(false)는 async 스폰이
      // 모두 끝난 후에만 호출 — 느린 네트워크에서 조기 완료 방지
      this._schedulingComplete = true;
      this.activeTimers = [];
      if (this._pendingSpawnCount === 0) {
        setSpawning(false);
      }
      // pendingSpawnCount > 0 이면 각 spawnEnemy.finally()에서 호출
    }, lastSpawnTime + 500);
    this.activeTimers.push(endTimer);
  }

  private getEnemyCount(wave: number) {
    return Math.floor(5 + wave * 1.5);
  }

  private async spawnEnemy(
    wave: number,
    path: any[],
    isBoss: boolean,
    mult: any,
    addEnemy: (enemy: Enemy) => void
  ) {
    // [FIX-RACE] 스폰 시작 시 epoch를 캡처 — await 후 epoch가 바뀌면 웨이브가 취소된 것
    const epochAtStart = this._spawnEpoch;
    try {
      let pokemonId = this.getEnemyPokemonId(wave);
      const { storyChapterNumber } = useGameStore.getState();
      // 최종 보스(wave30)만 챕터 고정 에이스. 중간 보스(3·6·…·27)는 랜덤 타입 적.
      if (isBoss && wave === 30 && storyChapterNumber !== null) {
        // 스토리 모드 최종 보스 고정 ID 매핑 (Ch1 -> 피죤 등)
        const bossIdMap: Record<number, number> = {
          1: 17,  // 피죤 (Pidgeotto)
          2: 123, // 스라크 (Scyther)
          3: 241, // 밀탱크 (Miltank)
          4: 94,  // 팬텀 (Gengar)
          5: 62,  // 강챙이 (Poliwrath)
          6: 208, // 강철톤 (Steelix)
          7: 221, // 메꾸리 (Piloswine)
          8: 230, // 킹드라 (Kingdra)
        };
        if (bossIdMap[storyChapterNumber]) {
          pokemonId = bossIdMap[storyChapterNumber];
        }
      }
      const pokemonData = await pokeAPI.getPokemon(pokemonId);

      // [FIX-RACE] await 복귀 후 epoch 검증 — 바뀌었으면 새 웨이브가 시작된 것이므로 스폰 중단
      if (this._spawnEpoch !== epochAtStart) return;

      // 지수적 스케일링 — 모드 분기.
      // [BALANCE 2026-07-11] 싱글/멀티 1.08 → 1.05: 타워 성장(+5%/레벨)과 동일 복리 정렬.
      //   웨이브당 1레벨 유지 = 파워 균형, 사탕/시너지/테라는 순수 잉여 전력. w30: 4.1x, w50: 10.9x.
      //   시뮬 실측(배율 0.4~1.0 압축과 조합): easiest 100%(목표 99)·easy 75%(목표 80)·
      //   extreme 0%(목표 1) 정렬. 이력: 1.08(easiest 58%) → 1.06(100%/33%) → 1.05(100%/75%).
      // 스토리 모드는 원 곡선(1.08) 유지 — 챕터 밸런스가 1.08 기준으로 최근 튜닝됨.
      const waveMultiplier = Math.pow(storyChapterNumber !== null ? 1.08 : 1.05, wave - 1);

      const baseHp = pokemonData.stats.hp * waveMultiplier * mult.hp;
      const baseAttack = pokemonData.stats.attack * waveMultiplier * mult.attack;
      // [FIX] 방어/특방은 '적 내구력'이므로 hp 배율에 묶는다(기존엔 mult.attack 사용).
      //   현재 전 프리셋이 hp==attack이라 수치 무변 — 향후 비대칭 튜닝 대비 의미 정정.
      const baseDefense = pokemonData.stats.defense * waveMultiplier * mult.hp;
      const baseSpecialAttack = pokemonData.stats.specialAttack * waveMultiplier * mult.attack;
      const baseSpecialDefense = pokemonData.stats.specialDefense * waveMultiplier * mult.hp;

      // [수정] 보스 보상: 일반 적의 5배. mult.reward 레버 반영(현재 전 난이도 1.0 → 수치 무변).
      const reward = Math.round((isBoss ? 50 : 10) * (mult.reward ?? 1));

      // [최종 보스] 스토리 한정 wave30 보스만 대폭 강화(×8hp/×4stat/−10라이프).
      //   싱글/멀티는 wave30도 일반 보스(×4/×2/−3) — 스토리 전용 스파이크 누출 방지.
      // [BALANCE] 스토리 최종보스 하향: 히어로풀이 2~3마리로 고정이라 ×8HP/×4스탯은 경로시간 내
      //   처치 불가('가짜 킬')였음 → ×6HP/×3스탯으로 낮춰 실제 승부가 되게. 실패 페널티(−10)는 유지.
      const isFinalBoss = isBoss && wave === 30 && storyChapterNumber !== null;
      const hpMult = isFinalBoss ? 6 : (isBoss ? 4 : 1);
      const statMult = isFinalBoss ? 3 : (isBoss ? 2 : 1);
      const livesTaken = isFinalBoss ? 10 : (isBoss ? 3 : 1);

      // [보스 강화] HP 5배, 공격/특공/방어/특방 2.5배, 이동속도 40
      const enemy: Enemy = {
        id: `enemy-${this.enemyCounter++}`,
        name: pokemonData.name,
        pokemonId: pokemonData.id,
        hp: baseHp * hpMult,
        maxHp: baseHp * hpMult,
        baseAttack: baseAttack * statMult,
        attack: baseAttack * statMult,
        defense: baseDefense * statMult,
        specialAttack: baseSpecialAttack * statMult,
        specialDefense: baseSpecialDefense * statMult,
        speed: pokemonData.stats.speed,
        position: { ...path[0] },
        path: [...path],
        pathIndex: 0,
        isNamed: isBoss,
        isBoss,
        reward,
        moveSpeed: isFinalBoss ? 20 : (isBoss ? 40 : 60),
        types: pokemonData.types,
        sprite: pokemonData.sprite,
        range: 80,
        attackCooldown: 0,
        livesTaken,
      };
      addEnemy(enemy);
    } catch (e) {
      console.error('Failed to spawn enemy pokemon:', e);
      // [FIX-RACE] fallback도 취소된 웨이브면 스폰 안 함
      if (this._spawnEpoch !== epochAtStart) return;
      this.spawnFallbackEnemy(wave, path, isBoss, mult, addEnemy);
    }
  }

  private async spawnBossInternal(
    wave: number,
    path: any[],
    mult: any,
    addEnemy: (enemy: Enemy) => void
  ) {
    await this.spawnEnemy(wave, path, true, mult, addEnemy);
  }

  /**
   * [수정] 경량 스탯 캐시 사용 - 추가 API 호출 없음
   * 스토리 모드에서는 챕터 enemyTypes로 타입 편향 필터링 적용
   */
  private getEnemyPokemonId(wave: number): number {
    const { min, max } = getStatRange(wave);
    const { storyEnemyTypes } = useGameStore.getState();

    if (storyEnemyTypes && storyEnemyTypes.length > 0) {
      return pokeAPI.getEnemyPokemonIdByTypeAndStat(min, max, storyEnemyTypes);
    }
    return pokeAPI.getEnemyPokemonIdByStatRange(min, max);
  }

  private spawnFallbackEnemy(
    wave: number,
    path: any[],
    isBoss: boolean,
    mult: any,
    addEnemy: (enemy: Enemy) => void
  ) {
    const baseHp = (50 + wave * 12) * mult.hp;
    const baseAttack = (10 + wave * 2) * mult.attack;
    const baseDefense = 5 + wave;
    const reward = Math.round((isBoss ? 50 : 10) * (mult.reward ?? 1));

    // [최종 보스] 스토리 한정 wave30만 대폭 강화. 싱글/멀티는 일반 보스 유지.
    // [BALANCE] 최종보스 하향(spawnEnemy와 동일 배율) — fallback 경로도 일치시킴.
    const isFinalBoss = isBoss && wave === 30 && useGameStore.getState().storyChapterNumber !== null;
    const hpMult = isFinalBoss ? 6 : (isBoss ? 4 : 1);
    const statMult = isFinalBoss ? 3 : (isBoss ? 2 : 1);
    const livesTaken = isFinalBoss ? 10 : (isBoss ? 3 : 1);

    // [보스 강화] fallback도 동일 배율 적용
    const enemy: Enemy = {
      id: `enemy-${this.enemyCounter++}`,
      name: isBoss ? `Boss ${wave}` : `Enemy ${wave}`,
      pokemonId: 0,
      hp: baseHp * hpMult,
      maxHp: baseHp * hpMult,
      baseAttack: baseAttack * statMult,
      attack: baseAttack * statMult,
      defense: baseDefense * statMult,
      specialAttack: baseAttack * statMult,
      specialDefense: baseDefense * statMult,

      speed: 50 + wave,
      position: { ...path[0] },
      path: [...path],
      pathIndex: 0,
      isNamed: isBoss,
      isBoss,
      reward,
      moveSpeed: isFinalBoss ? 20 : (isBoss ? 40 : 60),
      types: ['normal'],
      sprite: '',
      range: 80,
      attackCooldown: 0,
      livesTaken,
    };
    addEnemy(enemy);
  }
}