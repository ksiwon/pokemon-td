// src/data/maps.ts

import { MapData } from "../types/game";

const T = 64;

export const MAPS: MapData[] = [
  // 1. 좁은 직선형 (Easiest)
  {
    id: "easiest_straight",
    name: "초보자의 좁은 길",
    difficulty: "easiest",
    description: "폭이 1줄(실제 3칸)인 기본 맵입니다. 화력 집중이 용이합니다.",
    backgroundType: "grass",
    backgroundImage: "/images/maps/easiest_straight.png",
    teraTiles: [
      { type: "fire", spots: [{ x: 5, y: 3 }, { x: 9, y: 3 }, { x: 3, y: 5 }] },
      { type: "water", spots: [{ x: 10, y: 5 }, { x: 12, y: 3 }, { x: 6, y: 5 }] },
    ],
    spawns: [{ x: -T, y: 4.5 * T }],
    objectives: [{ x: 16 * T, y: 4.5 * T }],
    paths: [
      [
        { x: -T, y: 4.5 * T },
        { x: 16 * T, y: 4.5 * T },
      ],
    ],
  },

  // 2. 외곽 순환형 (Easy)
  {
    id: "easy_loop",
    name: "성벽 순환로",
    difficulty: "easy",
    description: "맵 외곽을 순환합니다. 타워를 배치할 내부 공간이 한정됩니다.",
    backgroundType: "grass",
    backgroundImage: "/images/maps/easy_loop.png",
    teraTiles: [{ type: "water", spots: [{ x: 7, y: 2 }, { x: 9, y: 2 }, { x: 4, y: 7 }] }],
    spawns: [{ x: -T, y: 1.5 * T }],
    objectives: [{ x: -T, y: 3.5 * T }], // 스폰 바로 아래가 골인
    paths: [
      [
        { x: -T, y: 1.5 * T },
        { x: 13.5 * T, y: 1.5 * T },
        { x: 13.5 * T, y: 8.5 * T },
        { x: 1.5 * T, y: 8.5 * T },
        { x: 1.5 * T, y: 3.5 * T },
        { x: -T, y: 3.5 * T },
      ],
    ],
  },

  // 3. 어그로 지름길 (Medium)
  {
    id: "extreme_aggro_shortcut",
    name: "위험한 지름길",
    difficulty: "medium",
    description:
      "기본 경로는 매우 깁니다. 중앙에 타워를 배치해 적의 경로를 바꾸세요.",
    backgroundType: "water",
    backgroundImage: "/images/maps/extreme_aggro_shortcut.png",
    teraTiles: [{ type: "electric", spots: [{ x: 6, y: 7 }, { x: 8, y: 7 }, { x: 11, y: 4 }] }],
    spawns: [{ x: -T, y: 1.5 * T }],
    objectives: [{ x: 16 * T, y: 1.5 * T }],
    paths: [
      [
        // 맵 하단을 크게 U자로 도는 경로
        { x: -T, y: 1.5 * T },
        { x: 1.5 * T, y: 1.5 * T },
        { x: 1.5 * T, y: 8.5 * T },
        { x: 12.5 * T, y: 8.5 * T },
        { x: 12.5 * T, y: 1.5 * T },
        { x: 16 * T, y: 1.5 * T },
      ],
      // 중앙 (x=3~11, y=2~7)이 비어있어 '어그로 섬' 배치 가능
    ],
  },

  // 4. 다중 S자 맵 (Medium)
  {
    id: "medium_multi_s",
    name: "구불구불 동굴",
    difficulty: "medium",
    description: "경로가 길게 굽이쳐, 타워가 공격할 수 있는 시간이 깁니다.",
    backgroundType: "cave",
    backgroundImage: "/images/maps/medium_multi_s.png",
    teraTiles: [{ type: "ground", spots: [{ x: 7, y: 4 }, { x: 4, y: 2 }, { x: 10, y: 4 }] }],
    spawns: [{ x: -T, y: 1.5 * T }],
    objectives: [{ x: 16 * T, y: 8.5 * T }],
    paths: [
      [
        { x: -T, y: 1.5 * T },
        { x: 12.5 * T, y: 1.5 * T },
        { x: 12.5 * T, y: 3.5 * T },
        { x: 2.5 * T, y: 3.5 * T },
        { x: 2.5 * T, y: 5.5 * T },
        { x: 12.5 * T, y: 5.5 * T },
        { x: 12.5 * T, y: 8.5 * T },
        { x: 16 * T, y: 8.5 * T },
      ],
    ],
  },

  // 5. 분기 후 합류형 (Medium)
  {
    id: "medium_merge",
    name: "합류 지점",
    difficulty: "medium",
    description: "두 갈래의 길이 중앙에서 합쳐집니다. 초반 방어가 중요합니다.",
    backgroundType: "desert",
    backgroundImage: "/images/maps/medium_merge.png",
    teraTiles: [{ type: "water", spots: [{ x: 9, y: 3 }, { x: 3, y: 3 }, { x: 9, y: 5 }] }],
    spawns: [
      { x: -T, y: 2.5 * T },
      { x: -T, y: 7.5 * T },
    ],
    objectives: [{ x: 16 * T, y: 4.5 * T }],
    paths: [
      [
        { x: -T, y: 2.5 * T },
        { x: 7.5 * T, y: 2.5 * T },
        { x: 7.5 * T, y: 4.5 * T },
        { x: 16 * T, y: 4.5 * T },
      ], // 위쪽 경로
      [
        { x: -T, y: 7.5 * T },
        { x: 7.5 * T, y: 7.5 * T },
        { x: 7.5 * T, y: 4.5 * T },
        { x: 16 * T, y: 4.5 * T },
      ], // 아래쪽 경로
    ],
  },

  // 6. 넓은 직선형 (Hard)
  {
    id: "hard_straight_wide",
    name: "넓은 초원",
    difficulty: "hard",
    description: "중앙의 넓은 통로(폭 3칸)로 적이 지나갑니다. 딜로스에 주의하세요.",
    backgroundType: "grass",
    backgroundImage: "/images/maps/hard_straight_wide.png",
    teraTiles: [
      { type: "fire", spots: [{ x: 8, y: 2 }, { x: 4, y: 2 }, { x: 11, y: 2 }] },
      { type: "grass", spots: [{ x: 8, y: 6 }, { x: 4, y: 6 }, { x: 11, y: 6 }] },
    ],
    spawns: [
      { x: -T, y: 3.5 * T },
      { x: -T, y: 4.5 * T },
      { x: -T, y: 5.5 * T },
    ],
    objectives: [
      { x: 16 * T, y: 3.5 * T },
      { x: 16 * T, y: 4.5 * T },
      { x: 16 * T, y: 5.5 * T },
    ],
    paths: [
      [
        { x: -T, y: 3.5 * T },
        { x: 16 * T, y: 3.5 * T },
      ], // 적들이 이 라인을 따라감
      [
        { x: -T, y: 4.5 * T },
        { x: 16 * T, y: 4.5 * T },
      ], // 적들이 이 라인을 따라감
      [
        { x: -T, y: 5.5 * T },
        { x: 16 * T, y: 5.5 * T },
      ], // 적들이 이 라인을 따라감
    ],
  },

  // 7. 듀얼 직선형 (커버 불가능) (Hard)
  {
    id: "hard_dual_path",
    name: "분리된 설원",
    difficulty: "hard",
    description: "두 경로가 완전히 분리되어, 양쪽을 따로 방어해야 합니다.",
    backgroundType: "snow",
    backgroundImage: "/images/maps/hard_dual_path.png",
    teraTiles: [
      { type: "fire", spots: [{ x: 8, y: 2 }, { x: 4, y: 2 }, { x: 11, y: 2 }] },
      { type: "ice", spots: [{ x: 8, y: 7 }, { x: 4, y: 7 }, { x: 11, y: 7 }] },
    ],
    spawns: [
      { x: -T, y: 1.5 * T },
      { x: -T, y: 8.5 * T },
    ],
    objectives: [
      { x: 16 * T, y: 1.5 * T },
      { x: 16 * T, y: 8.5 * T },
    ],
    paths: [
      [
        { x: -T, y: 1.5 * T },
        { x: 16 * T, y: 1.5 * T },
      ], // 최상단 경로
      [
        { x: -T, y: 8.5 * T },
        { x: 16 * T, y: 8.5 * T },
      ], // 최하단 경로
    ],
  },

  // 8. 중앙 집중형 (Extreme)
  {
    id: "extreme_central",
    name: "중앙 제단",
    difficulty: "expert",
    description: "네 방향에서 적들이 생성되어 중앙으로 돌격합니다.",
    backgroundType: "cave",
    backgroundImage: "/images/maps/extreme_central.png",
    teraTiles: [
      { type: "fighting", spots: [{ x: 5, y: 3 }, { x: 3, y: 5 }, { x: 11, y: 5 }] },
      { type: "fighting", spots: [{ x: 9, y: 5 }, { x: 11, y: 3 }, { x: 5, y: 5 }] },
    ],
    spawns: [
      { x: -T, y: 4.5 * T },
      { x: 16 * T, y: 4.5 * T },
      { x: 7.5 * T, y: -T },
      { x: 7.5 * T, y: 11 * T },
    ],
    objectives: [{ x: 7.5 * T, y: 4.5 * T }], // 중앙
    paths: [
      [
        { x: -T, y: 4.5 * T },
        { x: 7.5 * T, y: 4.5 * T },
      ], // 서쪽 -> 중앙
      [
        { x: 16 * T, y: 4.5 * T },
        { x: 7.5 * T, y: 4.5 * T },
      ], // 동쪽 -> 중앙
      [
        { x: 7.5 * T, y: -T },
        { x: 7.5 * T, y: 4.5 * T },
      ], // 북쪽 -> 중앙
      [
        { x: 7.5 * T, y: 11 * T },
        { x: 7.5 * T, y: 4.5 * T },
      ], // 남쪽 -> 중앙
    ],
    // 중앙 방어형: 골인 지점 주변 배치 허용 (다른 맵은 입출구 keepout 적용)
    objectiveKeepout: false,
  },
];

export const getMapById = (id: string) => MAPS.find((m) => m.id === id);

// ─── 시설(프렌들리숍·콘테스트 홀) 위치 = 길에서 가장 먼 칸 자동 계산 ──────────
const FAC_MAP_W = 15;
const FAC_MAP_H = 10;

// 길 타일 집합(GameCanvas의 pathTileSet과 동일한 래스터화).
const pathTilesOf = (map: MapData): Set<string> => {
  const set = new Set<string>();
  for (let ty = 0; ty < FAC_MAP_H; ty++) {
    for (let tx = 0; tx < FAC_MAP_W; tx++) {
      const cx = tx * T + T / 2, cy = ty * T + T / 2;
      for (const path of map.paths) {
        let hit = false;
        for (let i = 0; i < path.length - 1; i++) {
          const s = path[i], e = path[i + 1];
          if (cx >= Math.min(s.x, e.x) - T / 2 && cx <= Math.max(s.x, e.x) + T / 2 &&
              cy >= Math.min(s.y, e.y) - T / 2 && cy <= Math.max(s.y, e.y) + T / 2) { hit = true; break; }
        }
        if (hit) { set.add(`${tx}-${ty}`); break; }
      }
    }
  }
  return set;
};

// 길에서 가장 먼 비-길 타일 n개(멀티소스 BFS, 8방향). 서로 Chebyshev≥2로 떨어지게 고른다.
const farthestTilesFromPath = (map: MapData, n: number): { x: number; y: number }[] => {
  const path = pathTilesOf(map);
  const dist = new Map<string, number>();
  const q: { x: number; y: number }[] = [];
  for (const k of path) { const [x, y] = k.split('-').map(Number); dist.set(k, 0); q.push({ x, y }); }
  for (let head = 0; head < q.length; head++) {
    const { x, y } = q[head];
    const d = dist.get(`${x}-${y}`)!;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= FAC_MAP_W || ny >= FAC_MAP_H) continue;
      const k = `${nx}-${ny}`;
      if (dist.has(k)) continue;
      dist.set(k, d + 1); q.push({ x: nx, y: ny });
    }
  }
  const cands: { x: number; y: number; d: number }[] = [];
  for (let ty = 0; ty < FAC_MAP_H; ty++) for (let tx = 0; tx < FAC_MAP_W; tx++) {
    const k = `${tx}-${ty}`;
    if (path.has(k)) continue;
    cands.push({ x: tx, y: ty, d: dist.get(k) ?? Infinity });
  }
  if (cands.length === 0) return [];
  // 먼 순 → 결정적(좌상단 우선) 정렬. 첫 시설 = 길에서 가장 먼 칸.
  cands.sort((a, b) => b.d - a.d || a.x - b.x || a.y - b.y);
  const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const picked: { x: number; y: number }[] = [{ x: cands[0].x, y: cands[0].y }];
  // 이후 시설 = 여전히 길에서 멀되(거리 우선) 이미 고른 칸들과도 최대한 떨어지게(분산) 선택.
  while (picked.length < n) {
    let best: { x: number; y: number; d: number } | null = null;
    let bestScore = -Infinity;
    for (const c of cands) {
      if (picked.some(p => p.x === c.x && p.y === c.y)) continue;
      const sep = Math.min(...picked.map(p => cheb(p, c)));
      if (sep < 2) continue;
      const score = c.d * 100 + sep; // 길에서 먼 것 우선 + 기존 시설과의 거리 가산
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) break;
    picked.push({ x: best.x, y: best.y });
  }
  return picked;
};

const _facilityCache = new Map<string, { shopTiles: { x: number; y: number }[]; contestTiles: { x: number; y: number }[] }>();

/** 시설 타일 = 길에서 가장 먼 두 칸(가장 먼 칸=프렌들리숍, 그다음=콘테스트 홀). 맵별 1회 계산 캐시. */
export const getFacilityTiles = (map?: MapData) => {
  if (!map) return { shopTiles: [], contestTiles: [] };
  const cached = _facilityCache.get(map.id);
  if (cached) return cached;
  const far = farthestTilesFromPath(map, 2);
  const result = {
    shopTiles: far[0] ? [far[0]] : [],
    contestTiles: far[1] ? [far[1]] : [],
  };
  _facilityCache.set(map.id, result);
  return result;
};

// 테라스탈 타일 위치는 N웨이브마다 후보(spots) 사이로 순환한다.
export const TERA_MOVE_INTERVAL = 5;

/** 현재(또는 곧 시작할) 웨이브 기준 활성 테라 타일 위치를 해석한다.
 *  쉬는 시간(!isWaveActive)엔 다음 웨이브 기준으로 미리 이동시켜 재배치할 시간을 준다. */
export const activeTeraTiles = (
  map: MapData | undefined,
  wave: number,
  isWaveActive: boolean
): { x: number; y: number; type: string }[] => {
  const epoch = Math.floor((isWaveActive ? wave : wave + 1) / TERA_MOVE_INTERVAL);
  return (map?.teraTiles ?? []).map((t) => {
    const s = t.spots[epoch % t.spots.length];
    return { x: s.x, y: s.y, type: t.type };
  });
};

// ─── 자유 배치 가능 타일 ───────────────────────────────────────────────────────
// 자유배치 규칙: 길 타일과 입출구 3칸 keepout만 제외하면 어디든 배치 가능
// (일직선 3연속 제약은 호출부에서 별도 처리).
// GameCanvas의 buildableTileSet과 동일 규칙을 단일 소스로 공유한다.
export const getBuildableTiles = (map?: MapData): { x: number; y: number }[] => {
  if (!map) return [];
  const path = pathTilesOf(map);
  const clampT = (p: { x: number; y: number }) => ({
    tx: Math.max(0, Math.min(FAC_MAP_W - 1, Math.floor(p.x / T))),
    ty: Math.max(0, Math.min(FAC_MAP_H - 1, Math.floor(p.y / T))),
  });
  const endpoints = [
    ...(map.spawns ?? []).map(clampT),
    ...(map.objectiveKeepout === false ? [] : (map.objectives ?? []).map(clampT)),
  ];
  const out: { x: number; y: number }[] = [];
  for (let ty = 0; ty < FAC_MAP_H; ty++) {
    for (let tx = 0; tx < FAC_MAP_W; tx++) {
      if (path.has(`${tx}-${ty}`)) continue;
      if (endpoints.some(e => Math.max(Math.abs(tx - e.tx), Math.abs(ty - e.ty)) < 3)) continue;
      out.push({ x: tx, y: ty });
    }
  }
  return out;
};
