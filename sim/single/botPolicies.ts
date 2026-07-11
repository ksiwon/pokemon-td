// sim/single/botPolicies.ts
// 싱글 헤드리스 러너의 봇 — "인간 모델" 아키텍처 (v2).
//
// 구조 (플레이테스트 봇 연구의 표준 패턴):
//   [코어 실력]  openings/배치/응급조치/누수반응/경제 — 모든 페르소나가 공유하는 하나의
//               컨트롤러. SkillKnobs 로 파라미터화되어 skill 0(하수)~1(오라클) 다이얼 제공.
//               → 오라클을 먼저 최강으로 만들고, 노브를 낮춰 인간 사다리에 맞춘다
//                 (Stockfish Skill Level·King·EA 방식: 하향 캘리브레이션).
//   [스타일]    holdout/reroller/worker/tera/lossStreaker — 구매 취향·특수 행동만 다름
//               (procedural personas: 컨트롤러는 하나, 유틸리티만 스왑).
//
// 개발자 확인 실플레이 (2026-07-11 문답):
//   - 오프닝: 시작 500G로 "쓸만한 3~4마리 + 남은 골드 비축" (혼합형)
//   - 초반 배치: 길에 바짝 붙임 — 초반엔 적 공격이 약해 커버리지가 최우선
//   - 이후: 탱커만 바짝, 딜러는 적 사거리(160px) 밖 띠(160~192px)
//   - 목표 사다리(판당 승률): easiest 99 / easy 80 / medium 50 / hard 20 / extreme 1%
//
// 봇은 실제 유저와 같은 액션만 쓴다: 픽커 입장·리롤 20G/구매/배치(합법 타일)/
// 정비 중 재배치(웨이브 중 불가)/사탕·경험사탕·물약·부활(상점가)/웨이브끝 픽/기술 교체/진화.

import { useGameStore, xpToNextLevel } from '../../src/store/gameStore';
import { GamePokemon, GameMove, Item } from '../../src/types/game';
import { pokeAPI, PokemonData } from '../../src/api/pokeapi';
import { getMapById, getBuildableTiles, getFacilityTiles, activeTeraTiles } from '../../src/data/maps';
import {
  pickUsableMove, toEquippedMove, pickRandomAbility, computePokemonCost, statTotalOf,
} from '../../src/game/towerFactory';
import { HELD_ITEMS, shopTier, rarityBoostFromWaves } from '../../src/data/heldItems';
import { getFinalEvolutionId, canEvolveWithItem } from '../../src/data/evolution';
import { EVOLUTION_ITEMS } from '../../src/data/evolutionItems';
import { rng } from '../../src/utils/rng';

const T = 64;
const PICKER_ENTRY = 20;

// ─── 스킬 노브 ────────────────────────────────────────────────────────────────
// 하나의 skill 다이얼(0~1)에서 도출. 개별 오버라이드 가능(튜너가 사용).
// oracle(=1)은 "게임을 아는 유저의 상한" 근사가 목표.

export interface SkillKnobs {
  skill: number;
  /** 오프닝(웨이브1 전)에서 픽커 입장 최대 횟수 (20G/회) */
  openingEntries: number;
  /** 오프닝 "쓸만한 유닛" 최종진화 BST 컷 — 입장을 거듭할수록 눈높이 하강 */
  openingBar: number;
  /** 배치: 상위 K 후보 타일 중 무작위 선택 (1 = 항상 최적) */
  placementTopK: number;
  /** 정비 때 무료 재배치로 팀 전체 레이아웃을 갱신하는가 */
  repositionPrep: boolean;
  /** 딜러가 안전 띠(적 사거리 밖)로 물러나기 시작하는 웨이브 */
  safeWave: number;
  /** 웨이브 중 개입: HP 이 비율 미만이면 물약 */
  careThreshold: number;
  /** 웨이브 중 개입: 물약으로 이 비율까지 회복 (연타) */
  careTopUp: number;
  /** duringWave 틱(~2초)마다 실제로 반응할 확률 (인간 반응속도/한눈팔기) */
  careTickChance: number;
  /** 웨이브 중 부활에 허용하는 보유금 비율 (부활비 = 레벨×10) */
  reviveMoneyFrac: number;
  /** 사탕 몰빵 후 남길 예비비 */
  candyReserve: number;
  /** 라이프 누수에 반응해 예비비·물약 기준을 끌어올리는가 */
  leakAware: boolean;
  /** 갈아타기: 최약체 대비 요구 잠재력(최종진화 BST) 격차 */
  rebuildMargin: number;
  /** 갈아타기: 정비당 픽커 리롤 횟수 (사람의 "리롤 파티완성" 인내) */
  rebuildEntries: number;
  /** 테라 타일 활용 (개발자: "굉장히 중요한 기능") */
  useTera: boolean;
  /** 진화의 돌/연결의 끈 구매 — 아이템 진화 유닛 방치 방지 */
  useItemEvo: boolean;
  /** 알바 파견 (개발자: "싱글은 보통 보냄") + 지닌도구 구매 */
  useAlba: boolean;
  /** 알바 시작 웨이브 (파티 안정 후) */
  albaStartWave: number;
  /** 타입 플랜 — 단일타입 6각+테라 지향 (개발자 확인 고수 메타) */
  useTypePlan: boolean;
}

export function knobsForSkill(s: number): SkillKnobs {
  const lerp = (lo: number, hi: number) => lo + (hi - lo) * s;
  return {
    skill: s,
    // 오라클 쪽 값(두 번째 인자)은 sim:tune 힐클라임 결과(2026-07-11, easiest 67%)
    openingEntries: Math.round(lerp(2, 10)),
    openingBar: lerp(300, 420),
    placementTopK: Math.round(lerp(6, 1)),
    repositionPrep: s >= 0.4,
    safeWave: Math.round(lerp(40, 5)), // 하수는 후퇴 개념이 늦음(사실상 안 함)
    careThreshold: lerp(0.3, 0.65),
    careTopUp: lerp(0.45, 0.7),
    careTickChance: lerp(0.35, 1.0),
    reviveMoneyFrac: lerp(0.15, 0.6),
    candyReserve: lerp(400, 150),
    leakAware: s >= 0.3,
    rebuildMargin: lerp(250, 60),
    rebuildEntries: Math.round(lerp(1, 6)),
    useTera: s >= 0.35,
    useItemEvo: s >= 0.5,
    useAlba: s >= 0.55,
    albaStartWave: Math.round(lerp(22, 12)),
    useTypePlan: s >= 0.6,
  };
}

const SIM_SKILL = Number(process.env.SIM_SKILL ?? 1);

// 튜너 주입용 전역 노브 오버라이드 (우선순위: 스타일 > 전역 > skill 기본)
let GLOBAL_KNOBS: Partial<SkillKnobs> = {};
export function setGlobalKnobs(k: Partial<SkillKnobs>): void { GLOBAL_KNOBS = k; }

// ─── 배치 기하 헬퍼 ───────────────────────────────────────────────────────────

interface Tile { x: number; y: number }

const tileKeyComma = (t: Tile) => `${t.x},${t.y}`;
const towerTile = (tw: GamePokemon): Tile => ({ x: Math.floor(tw.position.x / T), y: Math.floor(tw.position.y / T) });

/** 점-선분 거리 (픽셀) */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function distToPath(mapId: string, tile: Tile): number {
  const map = getMapById(mapId);
  if (!map) return Infinity;
  const cx = tile.x * T + T / 2, cy = tile.y * T + T / 2;
  let best = Infinity;
  for (const path of map.paths) {
    for (let i = 0; i < path.length - 1; i++) {
      best = Math.min(best, distToSegment(cx, cy, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y));
    }
  }
  return best;
}

// 경로 샘플 캐시: 32px 간격 폴리라인 샘플, 경로별 분리 (time-under-fire + 갈래 분산용)
const _pathSampleCache = new Map<string, Array<Array<{ x: number; y: number }>>>();

function pathSamplesByPath(mapId: string): Array<Array<{ x: number; y: number }>> {
  const cached = _pathSampleCache.get(mapId);
  if (cached) return cached;
  const map = getMapById(mapId);
  const out: Array<Array<{ x: number; y: number }>> = [];
  for (const path of map?.paths ?? []) {
    const samples: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.floor(len / 32));
      for (let s = 0; s <= steps; s++) {
        samples.push({ x: a.x + (b.x - a.x) * (s / steps), y: a.y + (b.y - a.y) * (s / steps) });
      }
    }
    out.push(samples);
  }
  _pathSampleCache.set(mapId, out);
  return out;
}

const TOWER_RANGE_PX = 3 * T;     // GamePokemon.range 3타일
const ENEMY_THREAT_PX = 80 * 2;   // GameManager.findTargetTower: dist <= enemy.range(80)×2

/** 경로별 커버리지 = 타워 사거리 안 경로 샘플 수 — "적 노출 시간"의 근사. */
function coverageByPath(mapId: string, tile: Tile): number[] {
  const cx = tile.x * T + T / 2, cy = tile.y * T + T / 2;
  return pathSamplesByPath(mapId).map(samples => {
    let n = 0;
    for (const p of samples) {
      if (Math.hypot(p.x - cx, p.y - cy) <= TOWER_RANGE_PX) n++;
    }
    return n;
  });
}

/** 총 커버리지 (전 경로 합) */
function coverageScore(mapId: string, tile: Tile): number {
  return coverageByPath(mapId, tile).reduce((s, n) => s + n, 0);
}

/** 팀의 경로별 커버리지 합 — 가장 얇은 경로가 다음 배치의 타깃 */
function teamPathCoverage(mapId: string, towers: GamePokemon[]): number[] {
  const nPaths = pathSamplesByPath(mapId).length;
  const acc = new Array(nPaths).fill(0);
  for (const tw of towers) {
    if (tw.isFainted || isOnWorkTile(tw, mapId)) continue;
    const cov = coverageByPath(mapId, towerTile(tw));
    cov.forEach((n, i) => { acc[i] += n; });
  }
  return acc;
}

/** GameCanvas 자유배치 규칙 재현 — 가상 점유 셋 기준(재배치 계획용). */
function legalTilesFor(mapId: string, occupied: Set<string>, includeWorkTiles = false): Tile[] {
  const map = getMapById(mapId);
  const buildable = getBuildableTiles(map);
  const fac = getFacilityTiles(map);
  const workSet = new Set([...fac.shopTiles, ...fac.contestTiles].map(tileKeyComma));

  const wouldFormLine = (tx: number, ty: number) => {
    const run = (dx: number, dy: number) => {
      let n = 0, cx = tx + dx, cy = ty + dy;
      while (occupied.has(`${cx},${cy}`)) { n++; cx += dx; cy += dy; }
      return n;
    };
    return (1 + run(-1, 0) + run(1, 0) >= 3) || (1 + run(0, -1) + run(0, 1) >= 3);
  };

  return buildable.filter(t =>
    !occupied.has(tileKeyComma(t)) &&
    (includeWorkTiles || !workSet.has(tileKeyComma(t))) &&
    !wouldFormLine(t.x, t.y)
  );
}

export function legalPlacementTiles(mapId: string, towers: GamePokemon[], includeWorkTiles = false): Tile[] {
  return legalTilesFor(mapId, new Set(towers.map(tw => tileKeyComma(towerTile(tw)))), includeWorkTiles);
}

interface ScoredTile { t: Tile; cov: number; covByPath: number[]; d: number }

/** targetPath 지정 시 그 경로 커버리지 우선 정렬 (갈래 분산), 아니면 총합 */
function scoredTiles(mapId: string, occupied: Set<string>, targetPath?: number): ScoredTile[] {
  const tiles = legalTilesFor(mapId, occupied).map(t => {
    const covByPath2 = coverageByPath(mapId, t);
    return { t, cov: covByPath2.reduce((s, n) => s + n, 0), covByPath: covByPath2, d: distToPath(mapId, t) };
  });
  const key = (s: ScoredTile) =>
    targetPath !== undefined ? s.covByPath[targetPath] * 1000 + s.cov : s.cov;
  return tiles.sort((a, b) => key(b) - key(a) || a.t.x - b.t.x || a.t.y - b.t.y);
}

/** 다음 배치가 노려야 할 경로 — 팀 커버리지가 가장 얇은 갈래 */
function thinnestPath(mapId: string, towers: GamePokemon[]): number | undefined {
  const acc = teamPathCoverage(mapId, towers);
  if (acc.length <= 1) return undefined;
  return acc.indexOf(Math.min(...acc));
}

/**
 * 단일 유닛 배치 타일 (구매 직후용).
 * 개발자 확인: 초반(safeWave 전)엔 길에 바짝 = 커버리지 최우선.
 * safeWave 이후엔 내구 하위 유닛만 안전 띠(160~192px) 선호.
 */
export function bestPlacementTile(
  mapId: string, towers: GamePokemon[], opts?: { frail?: boolean; wave?: number; knobs?: SkillKnobs },
): Tile | null {
  const knobs = opts?.knobs ?? knobsForSkill(SIM_SKILL);
  const occupied = new Set(towers.map(tw => tileKeyComma(towerTile(tw))));
  // 갈래 분산: 커버리지가 가장 얇은 경로를 노린다 (분리맵 필수, 합류맵은 자연히 중앙)
  const target = thinnestPath(mapId, towers);
  let cands = scoredTiles(mapId, occupied, target);
  if (cands.length === 0) return null;

  const covOf = (c: ScoredTile) => (target !== undefined ? c.covByPath[target] : c.cov);
  const wantSafe = !!opts?.frail && (opts?.wave ?? 0) >= effectiveSafeWave(mapId, knobs);
  if (wantSafe) {
    const safe = cands.filter(c => c.d > ENEMY_THREAT_PX && covOf(c) > 0);
    if (safe.length > 0) cands = safe;
  }

  // 스플래시 분산: 상위 후보(최고 커버리지의 85%+) 중 기존 타워와 Chebyshev 2+ 떨어진 타일 선호
  const top = cands.filter(c => covOf(c) >= covOf(cands[0]) * 0.85);
  const minDistToTowers = (tile: Tile) =>
    towers.length === 0 ? 99 : Math.min(...towers.map(tw => {
      const t2 = towerTile(tw);
      return Math.max(Math.abs(tile.x - t2.x), Math.abs(tile.y - t2.y));
    }));
  top.sort((a, b) =>
    (minDistToTowers(b.t) >= 2 ? 1 : 0) - (minDistToTowers(a.t) >= 2 ? 1 : 0) ||
    covOf(b) - covOf(a) || a.t.x - b.t.x || a.t.y - b.t.y);

  // 실력 노이즈: 상위 K 중 무작위 (K=1이면 항상 최적)
  const k = Math.min(knobs.placementTopK, top.length);
  return top[k <= 1 ? 0 : Math.floor(rng() * k)].t;
}

/** 내구 지표: 실효 bulk (레벨 복리 반영) */
function bulkOf(tw: GamePokemon): number {
  return (tw.maxHp + tw.defense + tw.specialDefense) * Math.pow(1.05, tw.level - 1);
}

/** 난이도 배율 (WaveSystem DIFFICULTY_MULTIPLIERS와 동일) — 후퇴 시점 스케일용 */
const DIFF_MULT: Record<string, number> = {
  easiest: 0.3, easy: 0.5, medium: 0.7, hard: 0.9, expert: 1.1,
};

/** 딜러 후퇴 시작 웨이브 — 적 공격이 강한 맵일수록 이르다 */
function effectiveSafeWave(mapId: string, knobs: SkillKnobs): number {
  const mult = DIFF_MULT[getMapById(mapId)?.difficulty ?? 'medium'] ?? 0.7;
  return Math.max(3, Math.min(30, Math.round(knobs.safeWave * (0.5 / mult))));
}

/** 알바(숍/콘테스트) 타일 위 = 이동 금지 */
function isOnWorkTile(tw: GamePokemon, mapId: string): boolean {
  const fac = getFacilityTiles(getMapById(mapId));
  const t = towerTile(tw);
  return [...fac.shopTiles, ...fac.contestTiles].some(s => s.x === t.x && s.y === t.y);
}

/** 활성 테라 타일 위 + 타입 일치 = 이동 금지 (테라 이득 유지) */
function isOnMatchingTera(tw: GamePokemon, mapId: string): boolean {
  const st = useGameStore.getState();
  const tiles = activeTeraTiles(getMapById(mapId), st.wave, st.isWaveActive);
  const t = towerTile(tw);
  return tiles.some(tt => tt.x === t.x && tt.y === t.y && tw.types.includes(tt.type));
}

/**
 * 정비 재배치(무료) — 팀 전체 레이아웃 갱신:
 *   탱커(최대 실효 bulk) → 커버리지 1위 타일(바짝).
 *   나머지 → 커버리지 순, safeWave 이후엔 안전 띠 우선.
 *   알바 중/테라 일치 유닛은 건드리지 않음.
 */
function relayoutTeam(knobs: SkillKnobs, faintedEver: Set<string>): void {
  const st = useGameStore.getState();
  const mapId = st.currentMap;
  const movable = st.towers.filter(tw =>
    !isOnWorkTile(tw, mapId) && !isOnMatchingTera(tw, mapId));
  if (movable.length === 0) return;

  const pinned = st.towers.filter(tw => !movable.includes(tw));
  const occupied = new Set(pinned.map(tw => tileKeyComma(towerTile(tw))));

  // 탱커 먼저, 이후 내구 내림차순 (내구 낮을수록 늦게 = 안전 띠 배정)
  const order = [...movable].sort((a, b) => bulkOf(b) - bulkOf(a));
  const assignment: Array<{ id: string; tile: Tile }> = [];
  const safeWave = effectiveSafeWave(mapId, knobs);

  // 갈래 분산: 경로별 커버리지 누계 — 각 유닛은 가장 얇은 경로를 맡는다
  const nPaths = pathSamplesByPath(mapId).length;
  const acc = new Array(nPaths).fill(0);
  for (const p of pinned) {
    coverageByPath(mapId, towerTile(p)).forEach((n, i) => { acc[i] += n; });
  }

  for (let i = 0; i < order.length; i++) {
    const tw = order[i];
    const target = nPaths > 1 ? acc.indexOf(Math.min(...acc)) : undefined;
    let cands = scoredTiles(mapId, occupied, target);
    if (cands.length === 0) break;
    const covOf = (c: ScoredTile) => (target !== undefined ? c.covByPath[target] : c.cov);

    const isTank = i === 0;
    // 후퇴 조건: ① 한 번이라도 기절한 적 있는 유닛(반응형 — "쟤 자꾸 죽네"),
    //           ② safeWave 이후의 내구 하위 절반. 탱커는 항상 바짝(누군가는 어그로).
    const wantSafe = !isTank && (
      (knobs.leakAware && faintedEver.has(tw.id)) ||
      (st.wave >= safeWave && i >= Math.ceil(order.length / 2))
    );
    if (wantSafe) {
      const safe = cands.filter(c => c.d > ENEMY_THREAT_PX && covOf(c) > 0);
      if (safe.length > 0) cands = safe;
    }

    // 스플래시 분산: 최고 커버리지 85%+ 후보 중 이미 배정된 타일과 2칸+ 이격 선호
    const placedTiles = [...assignment.map(a => a.tile), ...pinned.map(p => towerTile(p))];
    const top = cands.filter(c => covOf(c) >= covOf(cands[0]) * 0.85);
    const minD = (tile: Tile) =>
      placedTiles.length === 0 ? 99 : Math.min(...placedTiles.map(p =>
        Math.max(Math.abs(tile.x - p.x), Math.abs(tile.y - p.y))));
    top.sort((a, b) =>
      (minD(b.t) >= 2 ? 1 : 0) - (minD(a.t) >= 2 ? 1 : 0) ||
      covOf(b) - covOf(a) || a.t.x - b.t.x || a.t.y - b.t.y);

    const k = Math.min(knobs.placementTopK, top.length);
    const pick = top[k <= 1 ? 0 : Math.floor(rng() * k)];
    assignment.push({ id: tw.id, tile: pick.t });
    occupied.add(tileKeyComma(pick.t));
    pick.covByPath.forEach((n, j) => { acc[j] += n; });
  }

  for (const a of assignment) {
    useGameStore.getState().updateTower(a.id, {
      position: { x: a.tile.x * T + T / 2, y: a.tile.y * T + T / 2 },
    });
  }
}

// ─── 후보 평가 ───────────────────────────────────────────────────────────────

export interface Candidate {
  data: PokemonData;
  cost: number;
  statTotal: number;
  bulk: number;    // hp + def + spdef
  offense: number; // max(atk, spa) + speed/2
  /** 최종진화 BST — 실플레이 평가 기준("왕귀형"). */
  finalBst: number;
  /** 레벨 40까지 배우는 최고 광역기 위력 (0 = 광역기 없음) — 후반 물량전 핵심 */
  aoePower: number;
}

const _finalBstCache = new Map<number, number>();
const _aoePowerCache = new Map<number, number>();

/**
 * 광역기 잠재력 — "얘 광역기 배우나?" (실플레이 구매 판단 기준).
 * 레벨 2~40 레벨업 학습 기술 중 AOE 최고 위력. getLearnableMoves는
 * 레벨키 캐시 + 디스크 HTTP 캐시가 받쳐줘서 종당 1회만 실비용.
 */
export async function aoePowerOf(pokemonId: number): Promise<number> {
  const cached = _aoePowerCache.get(pokemonId);
  if (cached !== undefined) return cached;
  let best = 0;
  try {
    for (let lvl = 2; lvl <= 40; lvl++) {
      const moves = await pokeAPI.getLearnableMoves(pokemonId, lvl);
      for (const m of moves) {
        if (m.isAOE && (m.power ?? 0) > best) best = m.power ?? 0;
      }
    }
  } catch { /* 캐시 미스 등 — 0으로 취급 */ }
  _aoePowerCache.set(pokemonId, best);
  return best;
}

export async function finalBstOf(pokemonId: number): Promise<number> {
  const cached = _finalBstCache.get(pokemonId);
  if (cached !== undefined) return cached;
  try {
    const finalId = getFinalEvolutionId(pokemonId);
    const p = await pokeAPI.getPokemon(finalId);
    const v = statTotalOf(p);
    _finalBstCache.set(pokemonId, v);
    return v;
  } catch {
    _finalBstCache.set(pokemonId, 0);
    return 0;
  }
}

async function drawCandidates(): Promise<Candidate[]> {
  // PokemonPicker.loadChoices 재현: 콘테스트 홀 스카우트의 고레어 부스트 포함
  const st = useGameStore.getState();
  const contestTiles = getFacilityTiles(getMapById(st.currentMap)).contestTiles;
  const scout = st.towers.find(tw =>
    contestTiles.some(s => s.x === Math.floor(tw.position.x / T) && s.y === Math.floor(tw.position.y / T)));
  const boost = scout ? rarityBoostFromWaves(scout.shopWavesHeld ?? 0) : 0;

  const ids = await Promise.all([
    pokeAPI.getRandomPokemonIdWithRarity(boost),
    pokeAPI.getRandomPokemonIdWithRarity(boost),
    pokeAPI.getRandomPokemonIdWithRarity(boost),
  ]);
  const data = await Promise.all(ids.map(id => pokeAPI.getPokemon(id)));
  return Promise.all(data.map(async p => {
    const st2 = statTotalOf(p);
    return {
      data: p,
      cost: computePokemonCost(st2),
      statTotal: st2,
      bulk: p.stats.hp + p.stats.defense + p.stats.specialDefense,
      offense: Math.max(p.stats.attack, p.stats.specialAttack) + p.stats.speed / 2,
      finalBst: await finalBstOf(p.id),
      aoePower: await aoePowerOf(p.id),
    };
  }));
}

/** 시너지 지향 구매 보너스 — 타입 브레이크포인트(2/4/6각) 접근 가산점 */
export function synergyBonus(candidateTypes: string[], towers: GamePokemon[]): number {
  const counts = new Map<string, number>();
  towers.filter(t => !t.isFainted).forEach(t =>
    t.types.forEach(ty => counts.set(ty, (counts.get(ty) ?? 0) + 1)));
  let bonus = 0;
  for (const ty of candidateTypes) {
    const c = counts.get(ty) ?? 0;
    if (c === 1) bonus += 80;        // 2각 완성 (스탯 ×1.1)
    else if (c === 3) bonus += 120;  // 4각 완성 (×1.3)
    else if (c === 5) bonus += 160;  // 6각 완성 (×1.3+약점반감)
    else if (c > 0) bonus += 40;     // 진행 중
  }
  return bonus;
}

/** 구매 확정: GameCanvas.addTower와 동일한 GamePokemon 생성 + 배치 */
async function purchaseAndPlace(c: Candidate, knobs: SkillKnobs): Promise<boolean> {
  const store = useGameStore.getState();
  if (store.towers.length >= 6) return false;
  // 새 유닛의 내구가 팀 하위 절반이면 frail 취급 (안전 띠 후보)
  const frail = store.towers.length >= 2 &&
    (c.bulk < [...store.towers].map(t2 => t2.maxHp + t2.defense + t2.specialDefense).sort((a, b) => a - b)[Math.floor(store.towers.length / 2)]);
  const tile = bestPlacementTile(store.currentMap, store.towers, { frail, wave: store.wave, knobs });
  if (!tile) return false;
  if (!store.spendMoney(c.cost)) return false;

  const poke = c.data;
  const usable = await pickUsableMove(poke);
  const equippedMoves: GameMove[] = [toEquippedMove(usable)];
  const ability = pickRandomAbility(poke);

  useGameStore.getState().addTower({
    id: `tower-sim-${poke.id}-${Math.floor(store.gameTime)}-${store.towers.length}`,
    pokemonId: poke.id, basePokemonId: poke.id, name: poke.name, displayName: poke.displayName,
    level: 1, experience: 0, currentHp: poke.stats.hp, maxHp: poke.stats.hp,
    baseAttack: poke.stats.attack, attack: poke.stats.attack, defense: poke.stats.defense,
    specialAttack: poke.stats.specialAttack, specialDefense: poke.stats.specialDefense, speed: poke.stats.speed,
    types: poke.types, position: { x: tile.x * T + T / 2, y: tile.y * T + T / 2 },
    equippedMoves, rejectedMoves: [], isFainted: false, sprite: poke.sprite, range: 3,
    sellValue: Math.floor(c.cost * 0.5), kills: 0, damageDealt: 0,
    ability, targetEnemyId: null,
  });
  return true;
}

// ─── 코어 루틴 (모든 페르소나 공유) ──────────────────────────────────────────

export type BuyBias = (c: Candidate, towers: GamePokemon[]) => number;

/** 광역기 가산점 — 후반 70마리 웨이브에서 AOE가 처리량을 지배 (실측 최대 효과) */
const aoeScore = (c: Candidate) => (c.aoePower > 0 ? 120 + c.aoePower : 0);

const balancedBias: BuyBias = (c, towers) =>
  c.finalBst + c.bulk * 0.5 + aoeScore(c) + synergyBonus(c.data.types, towers) * 1.5;

/**
 * 오프닝 (개발자 확인: "쓸만한 3~4마리 + 남은 골드 비축"):
 * 입장을 거듭할수록 눈높이(openingBar)를 낮추며 3~4마리 확보.
 * 첫 유닛은 내구 가중(탱커 먼저), 이후 잠재력·시너지.
 */
async function runOpening(knobs: SkillKnobs, bias: BuyBias): Promise<void> {
  const store = () => useGameStore.getState();
  let bar = knobs.openingBar;
  let entries = 0;
  const TARGET = 4;
  const MIN_COST = 85; // 최저가 포켓몬 근사

  while (store().towers.length < TARGET && entries < knobs.openingEntries) {
    if (store().money < PICKER_ENTRY + MIN_COST) break;
    if (!store().spendMoney(PICKER_ENTRY)) break;
    entries++;

    // 첫 유닛은 비싸도 됨(캐리). 이후엔 잔액의 50%까지만 — "쓸만한 3~4마리"가
    // 목표라 두 번째 유닛이 예산을 독식하면 몸 수가 부족해진다.
    const slotsLeft = TARGET - store().towers.length;
    const cap = store().towers.length >= 1 && slotsLeft >= 2
      ? Math.max(MIN_COST, store().money * 0.5) : Infinity;
    const cands = (await drawCandidates())
      .filter(c => c.cost <= store().money && c.cost <= cap);
    const tankSlot = store().towers.length < 1;
    const scored = cands
      .map(c => ({
        c,
        score: tankSlot ? c.bulk * 2 + c.finalBst * 0.5 : bias(c, store().towers),
      }))
      .sort((a, b) => b.score - a.score);

    const lastChance = entries >= knobs.openingEntries - 1 ||
      store().money < PICKER_ENTRY + MIN_COST * 2;
    const pick = scored.find(s2 => s2.c.finalBst >= bar) ??
      // 입장 여력이 끝나가는데 몸이 부족하면 최고점이라도 산다 (몸 우선 폴백)
      (lastChance && store().towers.length < 3 && scored.length > 0 ? scored[0] : null);
    if (pick) await purchaseAndPlace(pick.c, knobs);
    bar *= 0.88; // 눈높이 하강 — 리롤 비용이 쌓일수록 타협
  }
}

/**
 * 보드 유지 — 웨이브에 따라 목표 머릿수 증가(4 → 5@6 → 6@10).
 * urgent(직전 웨이브 누수)면 즉시 6마리 목표 + 예비비 축소.
 */
/** 웨이브별 목표 머릿수 — 6마리 조기 확정이 후반 생존 결정 변수
 * (XP가 전원 분배라 합류가 늦을수록 레벨 빚. 클리어 판 = 전원 L47+, 실패 판 = 낙오자 L21~34) */
function bodyTarget(wave: number, urgent: boolean): number {
  return urgent ? 6 : wave >= 7 ? 6 : wave >= 4 ? 5 : 4;
}

async function maintainBodies(knobs: SkillKnobs, bias: BuyBias, urgent: boolean): Promise<void> {
  const store = () => useGameStore.getState();
  const target = bodyTarget(store().wave, urgent);
  let bar = urgent ? 0 : 360; // 평시엔 쓰레기 안 삼, 급하면 아무거나
  let guard = 0;

  while (store().towers.length < target && guard++ < 8) {
    if (store().money < PICKER_ENTRY + 85) break;
    if (!store().spendMoney(PICKER_ENTRY)) break;
    const cands = (await drawCandidates()).filter(c => c.cost <= store().money);
    const scored = cands.map(c => ({ c, score: bias(c, store().towers) }))
      .sort((a, b) => b.score - a.score);
    const pick = scored.find(s2 => s2.c.finalBst >= bar) ??
      (urgent || guard >= 3 ? scored[0] : null); // 세 번 돌려도 없으면 타협
    if (pick) await purchaseAndPlace(pick.c, knobs);
    bar *= 0.9;
  }
}

/**
 * 판매 리빌드 — 6/6 상태에서 최약체보다 잠재력이 margin+ 높은 후보로 교체,
 * 경험사탕 캐치업.
 */
async function rebuildIfUpgrade(
  knobs: SkillKnobs, minMoney = 250, bonus: (c: Candidate) => number = () => 0,
): Promise<void> {
  const store = () => useGameStore.getState();
  if (store().towers.length < 6 || store().money < minMoney) return;
  // 후반 리빌드 금지 — 공유 XP 구조라 늦게 합류한 유닛은 레벨 빚을 영영 못 갚는다
  // (클리어 판은 전부 일찍 확정한 6마리가 전원 L50+로 동반 성장한 팀).
  if (store().wave > 20) return;

  const ranked: Array<{ id: string; fb: number }> = [];
  for (const tw of store().towers) {
    ranked.push({ id: tw.id, fb: await finalBstOf(tw.basePokemonId ?? tw.pokemonId) });
  }
  ranked.sort((a, b) => a.fb - b.fb);
  const worst = ranked[0];
  if (!worst) return;

  // 리롤 인내: 업그레이드가 뜰 때까지 여러 번 돌린다 (사람의 "리롤 파티완성").
  // 잔고가 minMoney 아래로 내려가면 중단 — 리롤이 전력을 갉아먹지 않게.
  for (let entry = 0; entry < knobs.rebuildEntries; entry++) {
    if (store().money < minMoney) return;
    if (!store().spendMoney(PICKER_ENTRY)) return;
    const cands = (await drawCandidates())
      .filter(c => c.finalBst >= worst.fb + knobs.rebuildMargin)
      .sort((a, b) =>
        (b.finalBst + aoeScore(b) + bonus(b)) - (a.finalBst + aoeScore(a) + bonus(a)));
    const hit = cands[0];
    if (!hit) continue;

    const sellRefund = (() => {
      const tw = store().towers.find(t => t.id === worst.id);
      return tw ? Math.max(tw.level * 20, tw.sellValue || 0) : 0;
    })();
    // 캐치업 예산 포함 요구 — L1 신입을 방치하면 전선에 구멍만 난다
    // (실플레이 정석: "좋은 포켓몬 나오면 경험사탕으로 한번에 레벨업").
    const lvls = [...new Set(store().towers.filter(t2 => !t2.isFainted && t2.id !== worst.id)
      .map(t2 => t2.level))].sort((a, b) => a - b);
    const firstStep = (lvls[0] ?? 10) * 50;
    if (store().money + sellRefund < hit.cost + firstStep + 60) continue;

    if (!store().sellTower(worst.id)) return;
    const ok = await purchaseAndPlace(hit, knobs);
    if (!ok) return;
    expCandyCatchUp(store().towers[store().towers.length - 1].id, 40);
    return;
  }
}

/**
 * 경험사탕 캐치업 — 점프 폭이 클 때만 (비용 = 목표레벨×50으로 고정이라,
 * 레벨 사다리가 촘촘하면 일반 사탕보다 비싸다. 사람은 "한번에 레벨업"할 때만 씀).
 */
function expCandyCatchUp(towerId: string, reserve = 100): void {
  const store = () => useGameStore.getState();
  for (let k = 0; k < 40; k++) {
    const tw = store().towers.find(t2 => t2.id === towerId);
    if (!tw || tw.isFainted) break;
    const higher = store().towers.filter(t2 => !t2.isFainted && t2.level > tw.level)
      .map(t2 => t2.level).sort((a, b) => a - b)[0];
    if (higher === undefined) break;
    // 가성비 검사: 같은 구간을 일반 사탕으로 올리는 비용의 80% 미만일 때만
    const stepCost = higher * 50;
    const candyEquiv = ((tw.level + higher - 1) / 2) * 25 * (higher - tw.level);
    if (stepCost >= candyEquiv * 0.8) break;
    if (store().money - stepCost < reserve) break;
    if (!store().useItem('exp_candy', towerId)) break;
  }
}

/**
 * 사탕 몰빵 — 예비비 이상 잉여는 캐리 레벨에 투입 (+5% 복리가 지배 스케일링).
 * 저레벨 낙오자는 경험사탕 캐치업 먼저 (레벨당 단가가 쌈).
 * 품질 게이트: 캐리가 저품질(finalBst<520)이면 고레벨 사탕은 나쁜 투자 —
 * 리빌드 자금(400)을 비축해 왕귀를 찾는다 (개발자 확인 리롤 메타).
 */
async function investGold(knobs: SkillKnobs, reserveOverride?: number): Promise<void> {
  const store = () => useGameStore.getState();
  let reserve = reserveOverride ?? knobs.candyReserve;

  const carryNow = store().towers.filter(t2 => !t2.isFainted)
    .sort((a, b) => b.level - a.level || b.attack - a.attack)[0];
  if (carryNow && store().wave >= 8) {
    const fb = await finalBstOf(carryNow.basePokemonId ?? carryNow.pokemonId);
    // 탈출 밸브: 리빌드가 계속 불발이면 700G 초과분은 그냥 현재 캐리에 붓는다
    // — 사람은 골드를 쥔 채 죽지 않는다.
    if (fb < 520 && store().money <= 700) reserve = Math.max(reserve, 400);
  }

  // 1) 낙오자 캐치업 (팀 최고 레벨과 8+ 차이)
  const alive = () => store().towers.filter(t2 => !t2.isFainted);
  const maxLv = () => Math.max(0, ...alive().map(t2 => t2.level));
  for (const tw of [...alive()].sort((a, b) => a.level - b.level)) {
    if (maxLv() - tw.level >= 8) expCandyCatchUp(tw.id, reserve + 100);
  }

  // 2) 캐리 사탕 (매 반복 최신 캐리 재평가)
  for (let k = 0; k < 200; k++) {
    const carry = alive().filter(t2 => t2.level < 100)
      .sort((a, b) => b.level - a.level || b.attack - a.attack)[0];
    if (!carry) break;
    if (store().money - carry.level * 25 < reserve) break;
    if (!store().useItem('candy', carry.id)) break;
  }
}

/** 정비 중 부활 — 전투 밖이라 항상 이득(부활비 = 레벨×10) */
function reviveDeadPrep(reserve: number): void {
  const store = useGameStore.getState();
  for (const tw of store.towers) {
    if (!tw.isFainted) continue;
    if (store.money - tw.level * 10 < reserve) continue;
    store.useItem('revive', tw.id);
  }
}

/**
 * 아이템 진화 — 돌/연결의 끈으로만 진화하는 유닛의 방치 방지 (Shop.tsx 흐름 재현:
 * 아이템 구매(spendMoney) → evolvePokemon(towerId, itemId)). 진화 = 즉시 스탯 점프.
 */
async function itemEvolutions(reserve = 250): Promise<void> {
  const store = () => useGameStore.getState();
  for (const tw of [...store().towers]) {
    if (tw.isFainted) continue;
    for (const item of Object.values(EVOLUTION_ITEMS)) {
      if (!canEvolveWithItem(tw.pokemonId, item.id)) continue;
      if (store().money - item.price < reserve) break;
      if (!store().spendMoney(item.price)) break;
      const ok = await store().evolvePokemon(tw.id, item.id);
      if (!ok) store().addMoney(item.price); // 실패 시 환불 (Shop.handleCancel과 동일)
      break;
    }
  }
}

/** 테라 타일 배치 — 타입 일치 최고레벨 유닛들을 활성 테라 타일로 (자속+방어상성) */
function assignTeraTiles(): void {
  const cur = () => useGameStore.getState();
  const map = getMapById(cur().currentMap);
  const tiles = activeTeraTiles(map, cur().wave, cur().isWaveActive);
  const assigned = new Set<string>();
  for (const tt of tiles) {
    const st = cur();
    const occupied = st.towers.some(tw =>
      Math.floor(tw.position.x / T) === tt.x && Math.floor(tw.position.y / T) === tt.y);
    if (occupied) continue;
    const cand = st.towers.filter(tw =>
      !tw.isFainted && !assigned.has(tw.id) && tw.types.includes(tt.type) &&
      !isOnMatchingTera(tw, st.currentMap))
      .sort((a, b) => b.level - a.level)[0];
    if (cand) {
      st.updateTower(cand.id, { position: { x: tt.x * T + T / 2, y: tt.y * T + T / 2 } });
      assigned.add(cand.id);
    }
  }
}

/**
 * 알바 + 지닌도구 — 파티 안정(6마리·비긴급·albaStartWave+) 시:
 *   1호: 콘테스트 홀(스카우트) → 픽커 고레어 부스트 (리빌드 품질 상승)
 *   2호: +6웨이브 후 여유(600G+) 있으면 프렌들리숍(점원) → 지닌도구 해금
 * 등급 해금 시 도구 구매 → 캐리 장착.
 */
async function albaAndShopping(
  knobs: SkillKnobs, urgent: boolean, boughtItems: Set<string>, leakStreak: number,
): Promise<void> {
  const store = () => useGameStore.getState();
  const st = store();
  const fac = getFacilityTiles(getMapById(st.currentMap));
  const contestTile = fac.contestTiles[0];
  const shopTile = fac.shopTiles[0];

  const onTile = (tile?: Tile) => tile && store().towers.find(tw =>
    Math.floor(tw.position.x / T) === tile.x && Math.floor(tw.position.y / T) === tile.y);
  const lowestFighter = () => [...store().towers]
    .filter(t2 => !t2.isFainted && !isOnWorkTile(t2, st.currentMap))
    .sort((a, b) => a.level - b.level)[0];

  // 리콜 — 방어선이 흔들리면 알바를 전선으로 복귀 (하이리스크 관리, 인간의 적응)
  if (st.lives < 40 || leakStreak >= 2) {
    for (const tile of [contestTile, shopTile]) {
      const w = onTile(tile);
      if (w) {
        const spot = bestPlacementTile(st.currentMap, store().towers.filter(t2 => t2.id !== w.id), { knobs });
        if (spot) store().updateTower(w.id, { position: { x: spot.x * T + T / 2, y: spot.y * T + T / 2 } });
      }
    }
    return;
  }

  if (urgent || st.wave < knobs.albaStartWave) return;

  // 파견 조건: "충분히 안정" = 라이프 거의 만땅 + 자금 흑자 + 6마리 전원 생존
  const stable = st.lives >= 45 && store().money >= 400 &&
    store().towers.filter(t2 => !t2.isFainted).length >= 6;

  // 1호 스카우트 (콘테스트 홀 → 픽커 고레어 부스트)
  if (stable && contestTile && !onTile(contestTile)) {
    const w = lowestFighter();
    if (w) store().updateTower(w.id, { position: { x: contestTile.x * T + T / 2, y: contestTile.y * T + T / 2 } });
  }

  // 2호 점원 (더 늦게, 더 부유할 때만 — 전투 5마리로 감수)
  if (shopTile && !onTile(shopTile) && st.wave >= knobs.albaStartWave + 6 &&
    st.lives >= 48 && store().money >= 800 &&
    store().towers.filter(t2 => !t2.isFainted).length >= 6) {
    const w = lowestFighter();
    if (w) store().updateTower(w.id, { position: { x: shopTile.x * T + T / 2, y: shopTile.y * T + T / 2 } });
  }

  // 지닌도구 구매 (점원 등급 해금 시)
  const clerk = onTile(shopTile);
  if (clerk) {
    const tier = shopTier(clerk.shopWavesHeld ?? 0);
    const wish = [
      { grade: 3, id: 'shell-bell' },
      { grade: 2, id: 'muscle-band' },
    ];
    for (const w of wish) {
      if (tier >= w.grade && !boughtItems.has(w.id)) {
        const def = HELD_ITEMS.find(h => h.id === w.id)!;
        const carry = store().towers.filter(t2 => !t2.isFainted && !t2.heldItem)
          .sort((a, b) => b.level - a.level || b.attack - a.attack)[0];
        if (carry && store().money >= def.cost + 100 && store().spendMoney(def.cost)) {
          store().addHeldItem(def.id);
          store().equipHeldItem(carry.id, def.id);
          boughtItems.add(w.id);
        }
      }
    }
  }
}

/**
 * 웨이브 중 응급조치 — careThreshold 미만이면 careTopUp까지 물약 연타(인간 클릭 재현,
 * 틱당 최대 6개). 부활은 보유금의 reviveMoneyFrac까지 허용(방치 = DPS·XP 손실).
 * careTickChance로 반응속도(하수는 한눈판다)를 모델링.
 */
export function emergencyCare(knobs: SkillKnobs, moneyFloor = 40): void {
  const store = () => useGameStore.getState();
  if (rng() >= knobs.careTickChance) return;

  for (const tw of [...store().towers]) {
    if (tw.isFainted) {
      const cost = tw.level * 10;
      if (cost <= Math.max(60, store().money * knobs.reviveMoneyFrac)
        && store().money - cost >= 20) {
        store().useItem('revive', tw.id);
      }
      continue;
    }
    if (tw.currentHp / tw.maxHp >= knobs.careThreshold) continue;

    for (let n = 0; n < 6; n++) {
      const cur = store().towers.find(t2 => t2.id === tw.id);
      if (!cur || cur.isFainted || cur.currentHp / cur.maxHp >= knobs.careTopUp) break;
      const money = store().money;
      // 회복 효율·처리량 균형: HP 풀이 크면 상급 물약(틱당 회복량이 커야 언더런 방지)
      if (cur.maxHp >= 1500 && money - 500 >= moneyFloor) { if (!store().useItem('potion_super', cur.id)) break; }
      else if (cur.maxHp >= 600 && money - 100 >= moneyFloor) { if (!store().useItem('potion_good', cur.id)) break; }
      else if (money - 20 >= moneyFloor) { if (!store().useItem('potion', cur.id)) break; }
      else break;
    }
  }
}

// ─── 페르소나 인터페이스 ─────────────────────────────────────────────────────

export interface BotPolicy {
  name: string;
  /** 웨이브 시작 전 정비(구매/재배치/아이템). */
  prepare(): Promise<void>;
  /** 레벨업 기술 제안 — true면 교체. */
  acceptMove(tower: GamePokemon, newMove: GameMove): boolean;
  /** 기술 제안 묶음에서 배울 기술 선택 (SkillPicker의 선택 재현) — 없으면 첫 항목 */
  pickBestMove?(tower: GamePokemon, moves: GameMove[]): GameMove | null;
  /** 웨이브끝 무료 아이템 픽 — 사용할 아이템 선택(없으면 skip). */
  pickWaveEndItem(items: Item[], towers: GamePokemon[]): { item: Item; towerId?: string } | null;
  /** 웨이브 도중 주기 호출(~2초 간격) — 상처약/응급부활 등. */
  duringWave?(): void;
}

// 기술 교체 — 유효위력 = 위력 × 자속(1.5) × AOE 가중(2.5): 후반 70마리 웨이브 필수
function moveValue(tower: GamePokemon, m: GameMove): number {
  const stab = tower.types.includes(m.type) ? 1.5 : 1;
  const aoe = m.isAOE ? 2.5 : 1;
  return (m.power ?? 0) * stab * aoe * ((m.accuracy ?? 100) / 100);
}

function defaultAcceptMove(tower: GamePokemon, newMove: GameMove): boolean {
  const cur = tower.equippedMoves[0];
  if (!cur) return true;
  return moveValue(tower, newMove) > moveValue(tower, cur);
}

// 웨이브끝 픽 — 메가/다이 > 부활(기절 있으면) > 사탕(최고레벨 생존자)
function defaultWaveEndPick(items: Item[], towers: GamePokemon[]) {
  const special = items.find(i => (i.type as string) === 'mega-stone' || (i.type as string) === 'max-mushroom');
  if (special) {
    const target = towers.find(tw => tw.pokemonId === (special as any).targetPokemonId && !tw.isFainted);
    if (target) return { item: special, towerId: target.id };
  }
  const fainted = towers.find(tw => tw.isFainted);
  const revive = items.find(i => i.type === 'revive');
  if (fainted && revive) return { item: revive, towerId: fainted.id };
  const candy = items.find(i => i.type === 'candy');
  const carry = towers.filter(tw => !tw.isFainted && tw.level < 100)
    .sort((a, b) => b.level - a.level || b.attack - a.attack)[0];
  if (candy && carry) return { item: candy, towerId: carry.id };
  return null;
}

// ─── 인간 모델 코어 (스타일 훅 주입) ─────────────────────────────────────────

interface StyleHooks {
  name: string;
  buyBias?: BuyBias;
  /** 노브 오버라이드 (예: worker의 이른 알바) — 튜너도 이 경로를 사용 */
  knobsOverride?: Partial<SkillKnobs>;
  /** 오프닝 대신 실행할 특수 오프닝 (reroller 등) */
  opening?: (knobs: SkillKnobs) => Promise<void>;
  /** 정비 마지막에 실행 (스파이크 판단 등 스타일 고유 행동) */
  extras?: (knobs: SkillKnobs, urgent: boolean) => Promise<void>;
  /** 사탕 예비비 오버라이드 (undefined = knobs 기본) */
  candyReserve?: (knobs: SkillKnobs, urgent: boolean) => number | undefined;
}

export function humanPolicy(hooks: StyleHooks, skill = SIM_SKILL): BotPolicy {
  const knobs: SkillKnobs = { ...knobsForSkill(skill), ...GLOBAL_KNOBS, ...hooks.knobsOverride };
  const boughtItems = new Set<string>();

  // 타입 플랜 — 맵 테라타입을 기둥으로 단일타입 6각 지향 (고수 메타)
  let planType: string | null = null;
  const planBonus = (c: Candidate) =>
    knobs.useTypePlan && planType && c.data.types.includes(planType) ? 260 : 0;
  const baseBias = hooks.buyBias ?? balancedBias;
  const bias: BuyBias = (c, towers) => baseBias(c, towers) + planBonus(c);
  let prevLives: number | null = null;
  let leakStreak = 0;
  // 웨이브 중 물약이 넘지 못하는 자금 하한 — 보드가 미달이면 몸값을 지킨다
  let careFloor = 40;
  // 기절 이력 — 반응형 후퇴("쟤 자꾸 죽네 → 뒤로")의 근거
  const faintedEver = new Set<string>();

  return {
    name: hooks.name,
    async prepare() {
      const store = () => useGameStore.getState();

      // 누수 감지 → 긴급 모드
      const lives = store().lives;
      const leaked = prevLives !== null && lives < prevLives;
      prevLives = lives;
      leakStreak = leaked ? leakStreak + 1 : 0;
      const understaffed = store().wave >= 2 && store().towers.length < 4;
      const urgent = knobs.leakAware && (leaked || lives <= 20 || understaffed);

      // 타입 플랜 확정 (웨이브 2, 오프닝 후): 테라타입 중 팀과 겹치는 것 우선
      if (knobs.useTypePlan && !planType && store().wave >= 2) {
        const teraTypes = (getMapById(store().currentMap)?.teraTiles ?? []).map(t2 => t2.type);
        const teamTypes = store().towers.flatMap(t2 => t2.types);
        planType = teraTypes.find(ty => teamTypes.includes(ty)) ?? teraTypes[0] ?? null;
      }

      reviveDeadPrep(urgent ? 0 : 40);

      // 오프닝 / 보드 유지
      if (store().wave < 1 && store().towers.length < 4) {
        await (hooks.opening ? hooks.opening(knobs) : runOpening(knobs, bias));
      } else {
        await maintainBodies(knobs, bias, urgent);
      }

      // 갈아타기 — 누수 중이라도 팀이 쓰레기면 질적 개선이 유일한 탈출구
      await rebuildIfUpgrade(knobs, urgent ? 300 : 250, planBonus);

      // 표준 인간 테크 (개발자 확인: 테라 핵심·알바 보통 보냄) — 스킬 게이트
      if (knobs.useItemEvo) await itemEvolutions();
      if (knobs.useAlba) await albaAndShopping(knobs, urgent, boughtItems, leakStreak);

      // 스타일 특수 행동 (스파이크 판단 등)
      if (hooks.extras) await hooks.extras(knobs, urgent);

      // 잉여 골드 투자 — 스타일 오버라이드 > 긴급(예비비 최소화) > 기본.
      // 보드가 목표 머릿수 미달이면 다음 몸값(입장 20+최저 85+α)을 반드시 남긴다
      // — 사탕이 몸 구매 문턱을 갉아먹는 빈곤 루프 방지 (몸 먼저, 사탕은 잉여).
      const styleReserve = hooks.candyReserve?.(knobs, urgent);
      let reserve = styleReserve !== undefined ? styleReserve : (urgent ? 60 : knobs.candyReserve);
      const boardShort = store().towers.length < Math.min(6, bodyTarget(store().wave, urgent));
      if (boardShort) reserve = Math.max(reserve, 260);
      await investGold(knobs, reserve);
      careFloor = store().towers.length < 4 ? 200 : (urgent ? 20 : 60);

      // 테라 타일 배치(핵심 기능) → 무료 재배치(탱커 바짝/딜러 안전 띠/기절 이력자 후퇴)
      // 순서 중요: relayout은 활성 테라 위 타입 일치 유닛을 건드리지 않는다.
      if (knobs.useTera) assignTeraTiles();
      if (knobs.repositionPrep) relayoutTeam(knobs, faintedEver);
    },
    acceptMove: defaultAcceptMove,
    pickBestMove(tower, moves) {
      // 제안 묶음 중 유효위력(자속·AOE 가중) 최고를 고른다 — 사람의 SkillPicker 선택
      const best = [...moves].sort((a, b) => moveValue(tower, b) - moveValue(tower, a))[0];
      return best ?? null;
    },
    pickWaveEndItem: defaultWaveEndPick,
    duringWave: () => {
      const store = () => useGameStore.getState();
      for (const tw of store().towers) {
        if (tw.isFainted) faintedEver.add(tw.id);
      }
      emergencyCare(knobs, careFloor);
      // 후반 웨이브 중 사탕 — 킬 수입이 실시간으로 쌓이는데 놀리면 손해.
      // 사람도 여유 골드가 차면 웨이브 중에 캐리를 먹인다.
      if (store().wave >= 15) {
        for (let k = 0; k < 6; k++) {
          const carry = store().towers.filter(t2 => !t2.isFainted && t2.level < 100)
            .sort((a, b) => b.level - a.level || b.attack - a.attack)[0];
          if (!carry) break;
          // 하한은 물약 비상금(400)만 — 사탕값 자체가 커도 잉여면 산다
          if (store().money - carry.level * 25 < 400) break;
          if (!store().useItem('candy', carry.id)) break;
        }
      }
    },
  };
}

// ─── 스타일 (페르소나) ───────────────────────────────────────────────────────

/** 버티기형: 내구 가중 구매, 존버 */
export function holdoutPolicy(): BotPolicy {
  return humanPolicy({
    name: 'holdout',
    buyBias: (c, towers) => c.bulk + c.finalBst * 0.7 + synergyBonus(c.data.types, towers),
  });
}

/** 리롤형: 오프닝을 길게 돌려 고잠재(finalBst 520+)를 노림 */
export function rerollerPolicy(): BotPolicy {
  return humanPolicy({
    name: 'reroller',
    buyBias: (c, towers) => c.finalBst * 1.3 + aoeScore(c) + synergyBonus(c.data.types, towers),
    async opening(knobs) {
      const boosted: SkillKnobs = {
        ...knobs,
        openingEntries: Math.round(knobs.openingEntries * 1.6),
        openingBar: knobs.openingBar + 60,
      };
      await runOpening(boosted, (c, towers) =>
        c.finalBst * 1.3 + aoeScore(c) + synergyBonus(c.data.types, towers));
    },
    candyReserve: knobs => knobs.candyReserve + 150, // 리롤 여력 비축
  });
}

/** 알바형: 알바를 이르게(웨이브 8) 보내 스카우트/도구를 빨리 연다 */
export function workerPolicy(): BotPolicy {
  return humanPolicy({
    name: 'worker',
    knobsOverride: { albaStartWave: 8 },
  });
}

/** 테라형: 맵 테라타입 일치 후보 가중 (단일 타입 시너지 지향) */
export function teraPolicy(): BotPolicy {
  return humanPolicy({
    name: 'tera',
    buyBias: (c, towers) => {
      const st = useGameStore.getState();
      const teraTypes = (getMapById(st.currentMap)?.teraTiles ?? []).map(t2 => t2.type);
      const match = c.data.types.some(ty => teraTypes.includes(ty)) ? 180 : 0;
      return c.finalBst + c.bulk * 0.4 + match + aoeScore(c) + synergyBonus(c.data.types, towers) * 1.5;
    },
  });
}

/** 연패형 (멀티 전용): 최소 투자·비축 → 라이프 25 이하에서 스파이크 */
export function lossStreakerPolicy(): BotPolicy {
  let spiked = false;
  return humanPolicy({
    name: 'lossStreaker',
    async extras() {
      if (!spiked && useGameStore.getState().lives <= 25) spiked = true;
    },
    candyReserve: () => (spiked ? 60 : 100_000), // 스파이크 전엔 사탕 봉인(비축)
  });
}

export const PERSONAS: Record<string, () => BotPolicy> = {
  holdout: holdoutPolicy,
  reroller: rerollerPolicy,
  worker: workerPolicy,
  tera: teraPolicy,
  lossStreaker: lossStreakerPolicy,
};

export { xpToNextLevel };
