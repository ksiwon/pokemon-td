// sim/multi2/client.ts
// 헤드리스 멀티플레이 클라이언트 — GameLayout + BattlePhaseUI 의 **프로토콜 부분만** 재현한다.
// React/Konva 없이 같은 순서로 같은 MultiplayerService API 를 때린다.
//
// ⚠ 이 파일은 두 컴포넌트의 미러다. 컴포넌트의 멀티 흐름을 고치면 여기도 같이 고쳐야 한다.
//   (sim/pvp/arenaRunner.ts 가 TFTBattleArena 의 미러인 것과 같은 계약)
//   각 블록에 대응하는 원본 위치를 주석으로 달아 두었다.
//
// 재현하는 것 (= 검증 대상):
//   GameLayout   로딩 리포트/워치독 · 페이즈 구독(웨이브 시작, bye 보너스) · 스토어→FB 동기화
//                · 타워상세 업로드(스로틀) · 웨이브 완료 감지 → flush + markWaveCompleted
//                · lives<=0 → playerDefeated · 배틀 보상 로컬 적용 · 게임종료 감지 · 몰수 워치독
//   BattlePhaseUI 200ms 페이즈 체크 루프 · 카운트다운 만료 시 전환 시도 · 웨이브 교착 강제완료
//                · 배틀 진입 시 아레나 실행(자기 시야의 팀·배치로) · p1 제출 / p2 5초 폴백
//                · 배틀 교착 90초 force-complete · 전원 결과 도착 시 waiting_wave
//
// 재현하지 않는 것: 화면/입력/토스트, 상점 구매(웨이브 스크립트가 대신함), AI 플레이어.

import type { ClientModules } from '../net/clientKit';
import type { TowerDetail } from '../../src/types/multiplayer';
import type { Placement } from '../pvp/arenaRunner';

// BattlePhaseUI 상수와 동일해야 한다.
const WAVE_STUCK_TIMEOUT_MS = 30000;
const BATTLE_STUCK_TIMEOUT_MS = 90000;
const PHASE_CHECK_MS = 200;
const LOADING_WATCHDOG_MS = 40000;
const P2_FALLBACK_MS = 5000;

export interface WaveScript {
  /** 이 라운드 웨이브에 걸리는 시간(가상 ms). 클라마다 다르게 줘서 배리어를 시험한다. */
  durationMs: (round: number) => number;
  /** 이 라운드 PvE 라이프 누수. */
  pveLeak: (round: number) => number;
  /** 이 라운드 종료 시점의 보드. */
  board: (round: number) => TowerDetail[];
  /** 웨이브 보상 골드. */
  goldGain: (round: number) => number;
  /** 아레나 배치. 미지정이면 기본 지그재그. */
  placements?: (round: number, side: 'L' | 'R') => Placement[];
  /** 아레나가 화면에서 도는 데 걸리는 시간(가상 ms). */
  arenaMs?: number;
}

export interface ObservedPhase { at: number; phase: string; round: number }
export interface LocalBattleView {
  round: number;
  /** 이 클라이언트가 자기 시야로 계산한 결과. */
  winnerId: string;
  p1Remaining: number;
  p2Remaining: number;
  finished: boolean;
  /** 아레나에 들어간 입력의 지문 — 양쪽이 같은 걸 봤는지 대조용. */
  myTeamFp: string;
  oppTeamFp: string;
  oppPlacementsReceived: boolean;
}

export interface ClientTrace {
  uid: string;
  phases: ObservedPhase[];
  localBattles: LocalBattleView[];
  /**
   * 실제로 로컬에 반영된 보상 정산 내역.
   * ⚠ `round` 는 "정산이 일어난 시점의 라운드"지 "그 보상이 발생한 라운드"가 아니다 —
   *   원장 방식이라 끊겼다 돌아오면 밀린 라운드 몫이 한 번에 들어온다(`viaRejoin`).
   */
  rewards: Array<{ round: number; gold: number; lives: number; viaRejoin: boolean }>;
  /** 마지막으로 로컬에 반영한 누적 원장 — 서버 rewardLedger 와 맞아야 한다. */
  appliedLedger: { gold: number; lives: number };
  byeBonuses: number[];
  submits: Array<{ round: number; winnerId: string; reason: string }>;
  moneyAt: Array<{ round: number; money: number; lives: number }>;
  defeatedAt: number | null;
  gameOverSeen: boolean;
  /** 스스로 나갔거나(leaveRoom) 탭이 죽은 클라이언트 — 이후 관측 누락은 위반이 아니다. */
  departed: boolean;
  errors: string[];
}

export function teamFingerprint(team: TowerDetail[]): string {
  return team.map(t =>
    `${t.pokemonId}:${t.level}:${t.maxHp}:${t.attack}:${t.speed}:${(t.equippedMoves ?? []).map(m => m.name).join('|')}`
  ).join(',');
}

export class HeadlessClient {
  readonly uid: string;
  readonly trace: ClientTrace;

  private ms: any;
  private store: any;
  private unsubs: Array<() => void> = [];
  private timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = [];
  private stopped = false;

  // GameLayout refs
  private loadingReported = false;
  private multiLoading = true;
  private syncReady = false;
  private defeated = false;
  private lastPhase: string | null = null;
  private lastAppliedRound = -1;   // 토스트 전용(원본과 동일)
  private lastAppliedByeRound = -1;
  private presenceOfflineSince: Record<string, number> = {};
  // [REWARD-LEDGER] GameLayout 의 appliedRewardRef / applyingRewardRef 미러
  private appliedReward = { gold: 0, lives: 0 };
  private applyingReward = false;

  // BattlePhaseUI refs
  private gameStateRef: any = null;
  private transitionTriggered = false;
  private executeTriggered = false;
  private lastPhaseEndTime: number | null = null;
  private battlePhaseEnteredAt: number | null = null;
  private waveStuckSince: number | null = null;
  private towerDetailsView = new Map<string, TowerDetail[]>();
  private placementsView = new Map<string, Placement[]>();
  private arenaRunForRound = -1;
  private arenaCompleted = false;
  private placementsSubmittedForRound = -1;

  constructor(
    private readonly mods: ClientModules,
    private readonly roomId: string,
    private readonly script: WaveScript,
  ) {
    this.uid = mods.user.uid;
    this.ms = mods.multiplayerService;
    this.store = mods.useGameStore;
    this.trace = {
      uid: this.uid, phases: [], localBattles: [], rewards: [],
      appliedLedger: { gold: 0, lives: 0 }, byeBonuses: [],
      submits: [], moneyAt: [], defeatedAt: null, gameOverSeen: false,
      departed: false, errors: [],
    };
  }

  // ── 수명주기 ──────────────────────────────────────────────────────────────

  start(): void {
    this.ms.initForMultiplayer();
    this.store.setState({ lives: 50, money: 500, towers: [], wave: 0, isWaveActive: false, gameOver: false });
    this.syncReady = true;

    this.subscribeLoading();
    this.subscribePhase();
    this.subscribeStoreSync();
    this.subscribeIsAlive();
    this.subscribeWaveCompletion();
    this.subscribeDefeat();
    this.subscribeBattleRewards();
    this.subscribeGameOver();
    this.subscribeForfeitWatchdog();
    this.subscribeBattlePhaseUI();
  }

  stop(): void {
    this.stopped = true;
    for (const u of this.unsubs) { try { u(); } catch { /* ignore */ } }
    this.unsubs = [];
    for (const t of this.timers) { clearTimeout(t as any); clearInterval(t as any); }
    this.timers = [];
    try { this.ms.stopAutoCleanup(); } catch { /* ignore */ }
  }

  /** 정상 퇴장 — 화면을 닫고 leaveRoom 을 부른다. */
  async leave(): Promise<void> {
    this.trace.departed = true;
    this.stop();
    await this.ms.leaveRoom(this.roomId).catch(() => {});
  }

  /** 브라우저 탭이 죽은 상황 — leaveRoom 없이 클라이언트만 사라진다. */
  crash(): void {
    this.trace.departed = true;
    this.stop();
    this.mods.net.simDisconnect(this.mods.clientId);
  }

  /**
   * 새로고침 후 복귀 — GameLayout 의 "멀티플레이어 초기화 + 재접속 상태 복원" 경로.
   * 서버가 가진 lives/money/wave/towerDetails 로 로컬을 되살리고,
   * 끊겨 있는 동안 확정된 PvP 보상은 원장 차이로 정산한다.
   */
  async rejoin(): Promise<void> {
    this.mods.net.simReconnect(this.mods.clientId);
    this.trace.departed = false;
    this.stopped = false;
    this.syncReady = false;
    this.ms.initForMultiplayer();

    const restored = await this.ms.getPlayerStateForRejoin(this.roomId, this.uid);
    if (restored) {
      // [REWARD-LEDGER] 못 받은 몫 = 서버 원장 - 내가 반영한 누적.
      const pendGold = restored.rewardLedger.gold - restored.appliedReward.gold;
      const pendLives = restored.rewardLedger.lives - restored.appliedReward.lives;
      this.store.setState({
        lives: Math.max(0, restored.lives + pendLives),
        money: restored.money + pendGold,
        wave: restored.wave,
        isWaveActive: false, isPaused: false, gameOver: false,
      });
      this.appliedReward = { gold: restored.rewardLedger.gold, lives: restored.rewardLedger.lives };
      this.trace.appliedLedger = { ...this.appliedReward };
      this.lastAppliedRound = restored.currentRound;
      this.lastAppliedByeRound = restored.currentRound;
      if (pendGold !== 0 || pendLives !== 0) {
        this.trace.rewards.push({
          round: restored.currentRound, gold: pendGold, lives: pendLives, viaRejoin: true,
        });
        const s = this.store.getState();
        await this.ms.updatePlayerState(this.roomId, this.uid, {
          lives: s.lives, money: s.money, appliedReward: { ...this.appliedReward },
        }).catch(() => {});
        await this.ms.flushPlayerState(this.roomId, this.uid).catch(() => {});
      }
      if (restored.towerDetails?.length) {
        const towers = restored.towerDetails.map((td: any, i: number) => ({
          ...td, id: `restored-${i}`, displayName: td.name,
          // [REJOIN-FIX] 예전엔 무조건 '' — 다음 업로드에서 특성 파생값이 통째로 리셋됐다.
          ability: this.mods.fromWireAbility(td.ability) ?? '',
        }));
        this.store.setState({ towers });
        await this.ms.flushTowerUpdate(this.roomId, this.uid, this.mods.buildTowerDetails(towers))
          .catch(() => {});
      }
      if (!restored.isAlive) this.defeated = true;
    }
    this.syncReady = true;
    this.loadingReported = false;
    this.multiLoading = false;
    this.lastPhase = null;
    this.bpLastPhase = null;

    this.subscribePhase();
    this.subscribeStoreSync();
    this.subscribeIsAlive();
    this.subscribeWaveCompletion();
    this.subscribeDefeat();
    this.subscribeBattleRewards();
    this.subscribeGameOver();
    this.subscribeForfeitWatchdog();
    this.subscribeBattlePhaseUI();
  }

  /** 웨이브 밖에서 보드가 바뀌는 상황(구매/판매) — 타워 업로드 스로틀과의 경쟁을 만든다. */
  setBoard(board: TowerDetail[]): void {
    const towers = board.map((t, i) => ({
      ...t, id: `${this.uid}-x${i}`, displayName: t.name,
      ability: this.mods.fromWireAbility(t.ability) ?? '',
      position: { x: 64 * (i + 1), y: 64 * 3 },
    }));
    this.store.setState({ towers });
  }

  private every(ms: number, fn: () => void): void {
    this.timers.push(setInterval(() => { if (!this.stopped) fn(); }, ms));
  }
  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(() => { if (!this.stopped) fn(); }, ms));
  }
  private sub(u: () => void): void { this.unsubs.push(u); }

  // ── GameLayout: 로딩 ──────────────────────────────────────────────────────
  // 원본: GameLayout.tsx "로딩 완료 리포트" + "[C1-FIX] 로딩 워치독"
  private subscribeLoading(): void {
    let unsub: (() => void) | null = null;
    let unsubRequested = false;
    const stop = () => { if (unsub) unsub(); else unsubRequested = true; };

    unsub = this.ms.onGameStateUpdateWithPhase(this.roomId, (state: any) => {
      if (!state || this.loadingReported) return;
      this.loadingReported = true;
      if (state.currentPhase !== 'loading') { this.multiLoading = false; stop(); return; }
      this.ms.markPlayerLoaded(this.roomId, this.uid)
        .then((ok: boolean) => { if (ok) stop(); else this.loadingReported = false; })
        .catch(() => { this.loadingReported = false; });
    });
    if (unsubRequested) unsub!();
    this.sub(() => unsub?.());

    this.after(LOADING_WATCHDOG_MS, () => {
      if (this.multiLoading) this.ms.forceStartFromLoading(this.roomId).catch(() => {});
    });
  }

  // ── GameLayout: 페이즈 구독 ───────────────────────────────────────────────
  // 원본: GameLayout.tsx "페이즈 구독 (웨이브·배틀 전환, AI 시작, Bye 보너스 등)"
  private subscribePhase(): void {
    this.sub(this.ms.onGameStateUpdateWithPhase(this.roomId, (state: any) => {
      if (!state) return;
      const phase = state.currentPhase as string;
      const round = state.currentRound as number;
      this.trace.phases.push({ at: Date.now(), phase, round });
      if (phase !== 'loading') this.multiLoading = false;

      const last = this.lastPhase;

      if (phase === 'wave' && last !== 'wave') {
        if (!this.defeated) this.beginWave(round);
      }
      // 재접속: wave 도중 첫 연결
      if (phase === 'wave' && last === null && round > 0 && !this.defeated) {
        this.beginWave(round);
      }

      // [V6-FIX-GL-5] Bye 보너스 로컬 적용
      if ((phase === 'battle' || phase === 'waiting_battle')
        && state.roundMatchups?.skipPlayerId === this.uid
        && this.lastAppliedByeRound < round) {
        this.lastAppliedByeRound = round;
        if (last !== null) {
          this.store.getState().addMoney(50);
          this.trace.byeBonuses.push(round);
        }
      }

      this.lastPhase = phase;
    }));
  }

  /** 웨이브 실행(합성) — 실게임의 WaveSystem 자리. 프로토콜 검증이 목적이라 시간·결과만 흉내낸다. */
  private beginWave(round: number): void {
    const s = this.store.getState();
    if (s.isWaveActive) return;
    this.store.setState({ wave: round, isWaveActive: true, isPaused: false });

    this.after(this.script.durationMs(round), () => {
      if (this.defeated) return;
      const leak = this.script.pveLeak(round);
      const gold = this.script.goldGain(round);
      const board = this.script.board(round).map((t, i) => ({
        ...t,
        id: `${this.uid}-t${i}`,
        displayName: t.name,
        // 보드 스펙이 특성을 들고 있으면 유지한다 — 실게임의 상점 구매 결과와 같은 모양.
        ability: this.mods.fromWireAbility(t.ability) ?? '',
        position: { x: 64 * (i + 1), y: 64 * 2 },
      }));
      const cur = this.store.getState();
      this.store.setState({
        towers: board,
        lives: Math.max(0, cur.lives - leak),
        money: cur.money + gold,
        isWaveActive: false,
      });
      this.trace.moneyAt.push({ round, money: this.store.getState().money, lives: this.store.getState().lives });
    });
  }

  // ── GameLayout: 로컬 → Firebase 상태 동기화 ───────────────────────────────
  private subscribeStoreSync(): void {
    this.sub(this.store.subscribe((state: any, prev: any) => {
      if (!this.syncReady || this.defeated) return;
      if (this.applyingReward) return;   // 정산 중간 상태는 흘리지 않는다(원본과 동일)
      const changed = state.wave !== prev.wave || state.lives !== prev.lives
        || state.money !== prev.money || state.towers.length !== prev.towers.length;
      if (!changed) return;
      this.ms.updatePlayerState(this.roomId, this.uid, {
        wave: state.wave, lives: state.lives, money: state.money, towers: state.towers.length,
      });
    }));

    // 타워 상세 업로드 — 원본은 towers 변경 useEffect
    this.sub(this.store.subscribe((state: any, prev: any) => {
      if (state.towers === prev.towers) return;
      if (state.towers.length === 0) return;
      this.ms.updatePlayerTowerDetails(this.roomId, this.uid, this.mods.buildTowerDetails(state.towers));
    }));
  }

  // ── GameLayout: isAlive=false 감지 ────────────────────────────────────────
  private subscribeIsAlive(): void {
    this.sub(this.ms.onGameStateUpdate(this.roomId, (players: any[]) => {
      const me = players.find(p => p.userId === this.uid);
      if (!me) return;
      if (!me.isAlive && !this.defeated) {
        this.defeated = true;
        this.trace.defeatedAt = this.gameStateRef?.currentRound ?? -1;
        this.store.setState({ gameOver: true });
      }
    }));
  }

  // ── GameLayout: 웨이브 완료 감지 → flush + markWaveCompleted ──────────────
  private subscribeWaveCompletion(): void {
    let wasActive = false;
    this.sub(this.store.subscribe((state: any, prev: any) => {
      if (this.defeated) { wasActive = state.isWaveActive; return; }
      if (prev.isWaveActive && !state.isWaveActive && wasActive) {
        const details = this.mods.buildTowerDetails(this.store.getState().towers);
        this.ms.flushTowerUpdate(this.roomId, this.uid, details)
          .then(() => this.ms.markWaveCompleted(this.roomId, this.uid))
          .catch(() => this.ms.markWaveCompleted(this.roomId, this.uid).catch(() => {}));
      }
      wasActive = state.isWaveActive;
    }));
  }

  // ── GameLayout: lives<=0 → playerDefeated ─────────────────────────────────
  private subscribeDefeat(): void {
    this.sub(this.store.subscribe((state: any) => {
      if (state.lives <= 0 && !this.defeated) {
        this.defeated = true;
        this.trace.defeatedAt = this.gameStateRef?.currentRound ?? -1;
        this.ms.playerDefeated(this.roomId, this.uid).catch(() => {});
      }
    }));
  }

  // ── GameLayout: 배틀 보상 로컬 적용 ───────────────────────────────────────
  // [REWARD-LEDGER] 금액은 라운드가 아니라 서버 누적 원장과의 차이로 적용한다(원본과 동일).
  private subscribeBattleRewards(): void {
    this.sub(this.ms.onGameStateUpdateWithPhase(this.roomId, (state: any) => {
      if (!state) return;

      // 토스트 자리 — 라운드 단위 관측만 남긴다.
      const mine = (state.battleResults || []).find((r: any) =>
        r.roundNumber === state.currentRound
        && r.roundNumber > this.lastAppliedRound
        && (r.player1Id === this.uid || r.player2Id === this.uid));
      if (mine) {
        this.lastAppliedRound = mine.roundNumber;
        const reward = this.uid === mine.player1Id ? mine.rewardP1 : mine.rewardP2;
        if (!reward) this.trace.errors.push(`R${mine.roundNumber}: 보상 필드 없음`);
      }

      if (!this.syncReady || this.applyingReward) return;
      const me = (state.players || []).find((p: any) => p.userId === this.uid);
      const ledger = me?.rewardLedger;
      if (!ledger) return;
      const dGold = ledger.gold - this.appliedReward.gold;
      const dLives = ledger.lives - this.appliedReward.lives;
      if (dGold === 0 && dLives === 0) return;

      this.applyingReward = true;
      try {
        const st = this.store.getState();
        if (dGold !== 0) st.addMoney(dGold);
        if (dLives !== 0) st.addLives(dLives);
      } finally {
        this.applyingReward = false;
      }
      this.appliedReward = { gold: ledger.gold, lives: ledger.lives };
      this.trace.appliedLedger = { ...this.appliedReward };
      this.trace.rewards.push({
        round: state.currentRound, gold: dGold, lives: dLives, viaRejoin: false,
      });

      const s = this.store.getState();
      this.ms.updatePlayerState(this.roomId, this.uid, {
        wave: s.wave, lives: s.lives, money: s.money, towers: s.towers.length,
        appliedReward: { ...this.appliedReward },
      })
        .then(() => this.ms.flushPlayerState(this.roomId, this.uid))
        .catch(() => {});
    }));
  }

  // ── GameLayout: 게임 종료 감지 ────────────────────────────────────────────
  private subscribeGameOver(): void {
    this.sub(this.ms.onGameStateUpdate(this.roomId, (players: any[]) => {
      const alive = players.filter(p => p.isAlive);
      if (alive.length <= 1 && players.length > 1) {
        if (!this.trace.gameOverSeen) {
          this.trace.gameOverSeen = true;
          this.ms.finalizeGame(this.roomId).catch(() => {});
        }
      }
    }));
  }

  // ── GameLayout: [C4-FIX] 연결끊김 몰수 워치독 ─────────────────────────────
  private subscribeForfeitWatchdog(): void {
    const FORFEIT_MS = 90000;
    let players: any[] = [];
    let presence: Record<string, { online: boolean }> = {};

    const evaluate = () => {
      const now = Date.now();
      for (const p of players) {
        const online = presence[p.userId]?.online;
        if (online === false && p.isAlive && !String(p.userId).startsWith('ai_')) {
          if (!this.presenceOfflineSince[p.userId]) this.presenceOfflineSince[p.userId] = now;
        } else {
          delete this.presenceOfflineSince[p.userId];
        }
      }
      if (this.defeated) return;
      const me = players.find(p => p.userId === this.uid);
      if (!me || !me.isAlive) return;
      const aliveHumans = players
        .filter(p => p.isAlive && !String(p.userId).startsWith('ai_'))
        .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
      if (aliveHumans[0]?.userId !== this.uid) return;
      for (const p of players) {
        if (!p.isAlive || p.userId === this.uid || String(p.userId).startsWith('ai_')) continue;
        const since = this.presenceOfflineSince[p.userId];
        if (since && now - since >= FORFEIT_MS) {
          this.ms.playerDefeated(this.roomId, p.userId).catch(() => {});
        }
      }
    };

    this.sub(this.ms.onPresenceUpdate(this.roomId, (pres: any) => { presence = pres; evaluate(); }));
    this.sub(this.ms.onGameStateUpdate(this.roomId, (pl: any[]) => { players = pl; evaluate(); }));
    this.every(15000, evaluate);
  }

  // ── BattlePhaseUI ─────────────────────────────────────────────────────────
  private subscribeBattlePhaseUI(): void {
    this.sub(this.ms.onGameStateUpdateWithPhase(this.roomId, (state: any) => {
      this.gameStateRef = state;
      if (!state) return;
      if (state.currentPhase !== this.bpLastPhase) {
        this.bpLastPhase = state.currentPhase;
        this.transitionTriggered = false;
        this.executeTriggered = false;
        this.battlePhaseEnteredAt = state.currentPhase === 'battle' ? Date.now() : null;
      }
      if (state.phaseEndTime && state.phaseEndTime !== this.lastPhaseEndTime) {
        this.lastPhaseEndTime = state.phaseEndTime;
        this.transitionTriggered = false;
      }
      if (state.currentRound !== this.bpLastRound) {
        this.bpLastRound = state.currentRound;
        this.arenaCompleted = false;
      }
    }));

    // 타워 상세 구독 — 원본은 battle/waiting_battle 페이즈에만 건다(프리티어 절감).
    this.sub(this.ms.onAllTowerDetailsUpdate(this.roomId, (all: Map<string, TowerDetail[]>) => {
      all.forEach((towers, uid) => { if (towers.length > 0) this.towerDetailsView.set(uid, towers); });
    }));
    this.sub(this.ms.onAllTFTPlacementsUpdate(this.roomId, (all: Map<string, Placement[]>) => {
      all.forEach((pl, uid) => { if (pl.length > 0) this.placementsView.set(uid, pl as any); });
    }));

    this.every(PHASE_CHECK_MS, () => this.phaseCheck());
  }

  private bpLastPhase: string | null = null;
  private bpLastRound = -1;

  private phaseCheck(): void {
    const gs = this.gameStateRef;
    if (!gs) return;

    // [V10-FIX] 웨이브 교착 강제완료
    if (gs.currentPhase === 'wave') {
      const alive = gs.players.filter((p: any) => p.isAlive);
      const someCompleted = alive.some((p: any) => p.waveCompleted);
      const stragglers = alive.filter((p: any) => !p.waveCompleted);
      if (someCompleted && stragglers.length > 0) {
        if (this.waveStuckSince === null) this.waveStuckSince = Date.now();
        else if (Date.now() - this.waveStuckSince > WAVE_STUCK_TIMEOUT_MS) {
          this.waveStuckSince = Date.now();
          for (const p of stragglers) this.ms.markWaveCompleted(this.roomId, p.userId).catch(() => {});
        }
      } else this.waveStuckSince = null;
    } else this.waveStuckSince = null;

    const serverNow = Date.now() + this.ms.getServerTimeOffset();
    if (gs.phaseEndTime && serverNow >= gs.phaseEndTime && !this.transitionTriggered) {
      this.transitionTriggered = true;
      const phase = gs.currentPhase;
      const p = phase === 'waiting_wave' ? this.ms.startSynchronizedWave(this.roomId)
        : phase === 'waiting_battle' ? this.ms.startBattlePhase(this.roomId)
          : Promise.resolve();
      p.catch(() => { this.transitionTriggered = false; });
      return;
    }

    if (gs.currentPhase === 'battle' && !this.executeTriggered) {
      this.executeTriggered = true;
      this.runArenaWhenReady(gs);
    }

    if (gs.currentPhase === 'battle' && !this.transitionTriggered) {
      const matches = gs.roundMatchups?.matches || [];
      const results = (gs.battleResults || []).filter((r: any) => r.roundNumber === gs.currentRound);
      if (matches.length > 0 && results.length >= matches.length) {
        this.transitionTriggered = true;
        this.ms.startWaitingWavePhase(this.roomId).catch(() => {});
        return;
      }
    }

    // [V5-FIX-BP-3] 배틀 교착 90초 → 누락 매치 보충 후 전환
    if (gs.currentPhase === 'battle' && this.battlePhaseEnteredAt !== null
      && Date.now() - this.battlePhaseEnteredAt > BATTLE_STUCK_TIMEOUT_MS) {
      this.battlePhaseEnteredAt = null;
      this.transitionTriggered = true;
      const aliveHumans = gs.players
        .filter((p: any) => p.isAlive && !p.userId.startsWith('ai_'))
        .sort((a: any, b: any) => a.userId.localeCompare(b.userId));
      const host = aliveHumans[0] ?? gs.players[0];
      if (host?.userId === this.uid) this.forceCompletePending(gs);
      this.ms.startWaitingWavePhase(this.roomId).catch(() => {});
    }
  }

  private forceCompletePending(gs: any): void {
    const pending = (gs.roundMatchups?.matches ?? []).filter((m: any) =>
      !(gs.battleResults || []).some((r: any) =>
        r.roundNumber === gs.currentRound
        && ((r.player1Id === m.player1Id && r.player2Id === m.player2Id)
          || (r.player1Id === m.player2Id && r.player2Id === m.player1Id))));
    for (const m of pending) {
      const t1 = this.towerDetailsView.get(m.player1Id) ?? [];
      const t2 = this.towerDetailsView.get(m.player2Id) ?? [];
      try {
        const result = this.mods.pvpBattleService.simulateBattle(t1, t2, m.player1Id, m.player2Id, gs.currentRound);
        this.trace.submits.push({ round: gs.currentRound, winnerId: result.winnerId, reason: 'force-complete' });
        this.ms.submitBattleResult(this.roomId, result).catch(() => {});
      } catch (e: any) {
        this.trace.errors.push(`force-complete 실패 R${gs.currentRound}: ${e?.message}`);
      }
    }
  }

  // ── 아레나 ────────────────────────────────────────────────────────────────
  // 원본: BattlePhaseUI "showArena 트리거" → TFTBattleArena → handleArenaBattleComplete
  private runArenaWhenReady(gs: any): void {
    const round = gs.currentRound;
    if (this.arenaRunForRound === round) return;
    const match = (gs.roundMatchups?.matches ?? []).find(
      (m: any) => m.player1Id === this.uid || m.player2Id === this.uid);
    if (!match) return; // bye

    const oppId = match.player1Id === this.uid ? match.player2Id : match.player1Id;
    const amP1 = match.player1Id === this.uid;
    const myPos: 'L' | 'R' = amP1 ? 'L' : 'R';

    // 내 배치 제출 (원본: prep 단계에서 submitTFTPlacements)
    if (this.placementsSubmittedForRound !== round) {
      this.placementsSubmittedForRound = round;
      const myTeamNow = this.towerDetailsView.get(this.uid) ?? [];
      const place = this.script.placements?.(round, myPos)
        ?? this.mods.arena.defaultPlacements(Math.min(6, myTeamNow.length || 6), myPos);
      this.ms.submitTFTPlacements(this.roomId, this.uid,
        place.map((p, i) => ({ id: `${this.uid}-${i}`, x: p.x, y: p.y }))).catch(() => {});
    }

    // 양측 팀 데이터가 올 때까지 대기 — 원본의 showArena 게이트와 동일한 조건
    const tryStart = () => {
      if (this.stopped || this.arenaRunForRound === round) return;
      const myTeam = this.towerDetailsView.get(this.uid) ?? [];
      const oppTeam = this.towerDetailsView.get(oppId) ?? [];
      if (myTeam.length === 0 || oppTeam.length === 0) { this.after(PHASE_CHECK_MS, tryStart); return; }
      this.arenaRunForRound = round;

      const seed = this.mods.deriveBattleSeed(round, match.player1Id, match.player2Id);
      const myPlace = this.script.placements?.(round, myPos)
        ?? this.mods.arena.defaultPlacements(Math.min(6, myTeam.length), myPos);
      const recvOpp = this.placementsView.get(oppId) ?? null;
      const oppPlace = recvOpp ? recvOpp.map(p => ({ x: p.x, y: p.y })) : null;

      const out = this.mods.arena.runArenaBattleAsClient(
        myTeam, oppTeam, myPos, seed, myPlace, oppPlace, 60);

      const p1Rem = amP1 ? out.myRemaining : out.oppRemaining;
      const p2Rem = amP1 ? out.oppRemaining : out.myRemaining;
      // TFTBattleArena 규칙: winner = p1Alive > 0 ? player1 : player2
      const winnerId = p1Rem > 0 ? match.player1Id : match.player2Id;

      this.trace.localBattles.push({
        round, winnerId, p1Remaining: p1Rem, p2Remaining: p2Rem,
        finished: out.done,
        myTeamFp: teamFingerprint(myTeam),
        oppTeamFp: teamFingerprint(oppTeam),
        oppPlacementsReceived: oppPlace !== null,
      });

      // 컴포넌트는 res.done 일 때만 onBattleComplete 를 부른다.
      if (!out.done) return;
      this.after(this.script.arenaMs ?? 2000, () => this.onArenaComplete(round, match, amP1, winnerId, p1Rem, p2Rem));
    };
    tryStart();
  }

  private hasResult(round: number, match: any): boolean {
    return (this.gameStateRef?.battleResults || []).some((r: any) =>
      r.roundNumber === round
      && ((r.player1Id === match.player1Id && r.player2Id === match.player2Id)
        || (r.player1Id === match.player2Id && r.player2Id === match.player1Id)));
  }

  private onArenaComplete(
    round: number, match: any, amP1: boolean,
    winnerId: string, p1Rem: number, p2Rem: number,
  ): void {
    if (this.arenaCompleted) return;
    if (this.hasResult(round, match)) { this.arenaCompleted = true; return; }

    const build = () => ({
      matchId: `${round}-${match.player1Id}-${match.player2Id}`,
      roundNumber: round,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      winnerId,
      player1RemainingPokemon: p1Rem,
      player2RemainingPokemon: p2Rem,
      lifeLost: 3 + (winnerId === match.player1Id ? p1Rem : p2Rem),
      battleLog: [],
      timestamp: Date.now(),
    });

    if (amP1) {
      // [V9] 인간 vs 인간: player1 만 제출
      this.arenaCompleted = true;
      this.trace.submits.push({ round, winnerId, reason: 'player1' });
      this.ms.submitBattleResult(this.roomId, build()).catch(() => {});
    } else {
      // [V9] player2: 5초 대기 후에도 결과가 없으면 자기 결과 제출
      this.after(P2_FALLBACK_MS, () => {
        if (this.arenaCompleted) return;
        if (this.hasResult(round, match)) { this.arenaCompleted = true; return; }
        this.arenaCompleted = true;
        this.trace.submits.push({ round, winnerId, reason: 'player2-fallback' });
        this.ms.submitBattleResult(this.roomId, build()).catch(() => {});
      });
    }
  }
}
