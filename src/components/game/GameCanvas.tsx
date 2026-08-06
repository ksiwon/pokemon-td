// src/components/game/GameCanvas.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Group,
  Rect,
  Line,
  Circle,
  Text,
  Image as KonvaImage,
} from "react-konva";
import Konva from "konva";
import styled, { keyframes } from "styled-components";
import { useTranslation } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { GameManager } from "../../game/GameManager";
import { getMapById, activeTeraTiles } from "../../data/maps";
import {
  activeFacilityTiles, isWorkLocked, isWorking, movePatch, WORK_FREE_WITHDRAW_WAVES,
} from "../../utils/facility.utils";
import { GamePokemon } from "../../types/game";
import { lMedia, isMobileOrTablet, isTouchDevice } from "../../utils/responsive.utils";
import { buyableHeldItems, shopTier, wavesToNextTier, getHeldItem } from "../../data/heldItems";
import { getAchievementById, resolveAchievementText } from "../../data/achievements";
import { Emoji } from "../shared/Emoji";
import { showToast } from "../shared/Toast";

const TILE_SIZE = 64;
const MAP_WIDTH = 15;
const MAP_HEIGHT = 10;
const TYPE_ICON_API_BASE = 'https://www.serebii.net/pokedex-bw/type/';

// ─── 맵 배경 타입별 타일 테마 ─────────────────────────────────────────────────
type BackgroundType = 'grass' | 'desert' | 'snow' | 'cave' | 'water';

interface TileTheme {
  tileA: string;
  tileB: string;
  pathFill: string;
  stroke: string;
  pathStroke: string;
  pathLineStroke: string;
  pathLineOpacity: number;
}

const TILE_THEMES: Record<BackgroundType, TileTheme> = {
  grass: {
    tileA: '#4a7c3f', tileB: '#3d6b34', pathFill: '#7a5c3a',
    stroke: '#2d4f28', pathStroke: '#5c3f20', pathLineStroke: '#4a2e10', pathLineOpacity: 0.6,
  },
  desert: {
    tileA: '#c4a256', tileB: '#b8924a', pathFill: '#8a6a30',
    stroke: '#9a7830', pathStroke: '#6b4f22', pathLineStroke: '#5a3e18', pathLineOpacity: 0.6,
  },
  snow: {
    tileA: '#d0e8f5', tileB: '#b8d4e8', pathFill: '#7fb3d3',
    stroke: '#8ab4cc', pathStroke: '#5a90b8', pathLineStroke: '#3a70a0', pathLineOpacity: 0.55,
  },
  cave: {
    tileA: '#3a3240', tileB: '#2e2734', pathFill: '#1a1520',
    stroke: '#1e1824', pathStroke: '#0f0c14', pathLineStroke: '#080610', pathLineOpacity: 0.7,
  },
  water: {
    tileA: '#2a6fa8', tileB: '#235e90', pathFill: '#1a4a72',
    stroke: '#184060', pathStroke: '#102d4a', pathLineStroke: '#081e30', pathLineOpacity: 0.65,
  },
};

const getTileTheme = (bgType?: string): TileTheme =>
  TILE_THEMES[(bgType as BackgroundType) ?? 'grass'] ?? TILE_THEMES.grass;

// ─── 포켓몬 타입 색상 (테라스탈 타일·뱃지용) ────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878', fire: '#F08030', water: '#6890F0', electric: '#F8D030',
  grass: '#78C850', ice: '#98D8D8', fighting: '#C03028', poison: '#A040A0',
  ground: '#E0C068', flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
  rock: '#B8A038', ghost: '#705898', dragon: '#7038F8', dark: '#705848',
  steel: '#B8B8D0', fairy: '#EE99AC',
};
const typeColor = (t?: string) => (t && TYPE_COLORS[t]) || '#dddddd';
// 타입 한글/영문 라벨은 i18n(types.*)으로 처리한다 → 컴포넌트 내 typeLabel() 헬퍼 사용.

// ─── 포켓몬 이미지 렌더링 헬퍼 ───────────────────────────────────────────────
const PokemonImage: React.FC<{
  src: string;
  x: number;
  y: number;
  isFainted: boolean;
  size?: number;
}> = ({ src, x, y, isFainted, size = 64 }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<any>(null);
  const imageSize = size;

  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.src = src;
    img.crossOrigin = "Anonymous";
    img.onload = () => setImage(img);
  }, [src]);

  useEffect(() => {
    if (imageRef.current) {
      if (isFainted) {
        imageRef.current.cache();
        imageRef.current.filters([Konva.Filters.Grayscale]);
      } else {
        // [REVIVE-FIX] 필터만 비우면 캐시된 회색조 비트맵이 남아 부활 후에도 회색으로 보임.
        //   캐시를 해제해 원본 컬러로 다시 렌더.
        imageRef.current.filters([]);
        imageRef.current.clearCache();
      }
    }
  }, [isFainted, image]);

  if (!image) return null;

  return (
    <KonvaImage
      ref={imageRef}
      image={image || undefined}
      x={x - imageSize / 2}
      y={y - imageSize / 2}
      width={imageSize}
      height={imageSize}
      opacity={isFainted ? 0.4 : 1}
      imageSmoothingEnabled={false}
    />
  );
};

// ─── 유리구슬 투사체 오버레이 (Canvas 2D) ────────────────────────────────────
// [수정③] 포켓몬 공식 타입 배경색 + 유리 느낌 투명도/굴절 표현

const TYPE_MARBLE_COLORS: Record<string, {
  base: string;
  light: string;   // 밝은 면 (굴절광)
  dark: string;    // 어두운 면 (그림자)
  glow: string;    // 외부 글로우
  rim: string;     // 테두리 하이라이트
}> = {
  // 노말 — #9FA19F
  normal:   { base: '#9FA19F', light: '#D8DAD8', dark: 'rgba(60,62,60,0.5)',   glow: 'rgba(159,161,159,0.40)', rim: 'rgba(255,255,255,0.50)' },
  // 불꽃 — #E62829
  fire:     { base: '#E62829', light: '#FF8060', dark: 'rgba(100,10,10,0.55)', glow: 'rgba(230,40,41,0.50)',   rim: 'rgba(255,160,100,0.70)' },
  // 물 — #2980EF
  water:    { base: '#2980EF', light: '#90C8FF', dark: 'rgba(10,40,100,0.55)', glow: 'rgba(41,128,239,0.50)',  rim: 'rgba(160,210,255,0.70)' },
  // 풀 — #3FA129
  grass:    { base: '#3FA129', light: '#90D870', dark: 'rgba(20,60,15,0.55)',  glow: 'rgba(63,161,41,0.50)',   rim: 'rgba(150,230,120,0.70)' },
  // 전기 — #FAC000
  electric: { base: '#FAC000', light: '#FFE878', dark: 'rgba(100,75,0,0.50)',  glow: 'rgba(250,192,0,0.55)',   rim: 'rgba(255,240,140,0.75)' },
  // 얼음 — #3DCEF3
  ice:      { base: '#3DCEF3', light: '#B0EEFF', dark: 'rgba(10,80,110,0.50)', glow: 'rgba(61,206,243,0.45)',  rim: 'rgba(200,245,255,0.75)' },
  // 격투 — #FF8000
  fighting: { base: '#FF8000', light: '#FFB860', dark: 'rgba(110,45,0,0.55)',  glow: 'rgba(255,128,0,0.50)',   rim: 'rgba(255,200,120,0.70)' },
  // 독 — #9141CB
  poison:   { base: '#9141CB', light: '#C880EE', dark: 'rgba(50,15,80,0.55)',  glow: 'rgba(145,65,203,0.50)',  rim: 'rgba(200,150,240,0.70)' },
  // 땅 — #915121
  ground:   { base: '#915121', light: '#C89060', dark: 'rgba(50,25,5,0.55)',   glow: 'rgba(145,81,33,0.45)',   rim: 'rgba(210,160,100,0.65)' },
  // 비행 — #81B9EF
  flying:   { base: '#81B9EF', light: '#C4DEFF', dark: 'rgba(30,70,120,0.45)', glow: 'rgba(129,185,239,0.40)', rim: 'rgba(210,235,255,0.70)' },
  // 에스퍼 — #EF4179
  psychic:  { base: '#EF4179', light: '#FF90B0', dark: 'rgba(100,10,40,0.55)', glow: 'rgba(239,65,121,0.50)',  rim: 'rgba(255,170,195,0.70)' },
  // 벌레 — #91A119
  bug:      { base: '#91A119', light: '#C4CC60', dark: 'rgba(45,52,5,0.55)',   glow: 'rgba(145,161,25,0.45)',  rim: 'rgba(200,215,90,0.65)' },
  // 바위 — #AFA981
  rock:     { base: '#AFA981', light: '#D8D4B8', dark: 'rgba(55,52,30,0.50)',  glow: 'rgba(175,169,129,0.40)', rim: 'rgba(230,226,200,0.60)' },
  // 고스트 — #704170
  ghost:    { base: '#704170', light: '#A870A8', dark: 'rgba(30,10,30,0.60)',  glow: 'rgba(112,65,112,0.50)',  rim: 'rgba(180,130,180,0.65)' },
  // 드래곤 — #5060E1
  dragon:   { base: '#5060E1', light: '#90A0FF', dark: 'rgba(20,25,100,0.60)', glow: 'rgba(80,96,225,0.50)',   rim: 'rgba(170,185,255,0.70)' },
  // 악 — #624D4E
  dark:     { base: '#624D4E', light: '#9A8080', dark: 'rgba(20,15,15,0.65)',  glow: 'rgba(98,77,78,0.45)',    rim: 'rgba(155,130,130,0.55)' },
  // 강철 — #60A1B8
  steel:    { base: '#60A1B8', light: '#B0D5E8', dark: 'rgba(20,50,70,0.50)',  glow: 'rgba(96,161,184,0.40)',  rim: 'rgba(200,230,245,0.70)' },
  // 페어리 — #EF70EF
  fairy:    { base: '#EF70EF', light: '#FFB8FF', dark: 'rgba(100,20,100,0.50)', glow: 'rgba(239,112,239,0.50)', rim: 'rgba(255,200,255,0.75)' },
};

const getMarbleColor = (type: string) =>
  TYPE_MARBLE_COLORS[type] ?? TYPE_MARBLE_COLORS.normal;

interface ProjectileOverlayProps {
  projectiles: Array<{ id: string; current: { x: number; y: number }; type: string; isAOE: boolean }>;
  canvasScale: number;
}

const ProjectileOverlay: React.FC<ProjectileOverlayProps> = ({ projectiles, canvasScale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const projectilesRef = useRef(projectiles);
  projectilesRef.current = projectiles;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = MAP_WIDTH * TILE_SIZE;
    const H = MAP_HEIGHT * TILE_SIZE;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      for (const proj of projectilesRef.current) {
        const cx = proj.current.x;
        const cy = proj.current.y;
        const r = proj.isAOE ? 12 : 7;
        const c = getMarbleColor(proj.type);

        // ── 1. 아주 약한 외부 글로우 (너무 강하지 않게)
        const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.2);
        glowGrad.addColorStop(0, c.glow);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // ── 2. 구슬 본체 — 유리처럼 투명한 느낌을 위해 중심~하단 어둡게
        const bodyGrad = ctx.createRadialGradient(
          cx - r * 0.28, cy - r * 0.28, r * 0.02,  // 좌상단 하이라이트 중심
          cx + r * 0.15, cy + r * 0.20, r           // 우하단으로 그라디언트 끝
        );
        bodyGrad.addColorStop(0,    c.light);                  // 밝은 진입광
        bodyGrad.addColorStop(0.30, c.base + 'CC');            // 타입 색 (80% 불투명)
        bodyGrad.addColorStop(0.70, c.base + '99');            // 중간 (60% 불투명 — 유리 투과)
        bodyGrad.addColorStop(1,    c.dark);                   // 하단 그림자
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // ── 3. 내부 굴절광 — 구슬 하단 반사 (유리 특유의 아래쪽 반달 빛)
        const refGrad = ctx.createRadialGradient(
          cx + r * 0.10, cy + r * 0.55, 0,
          cx + r * 0.10, cy + r * 0.55, r * 0.55
        );
        refGrad.addColorStop(0,   'rgba(255,255,255,0.18)');
        refGrad.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = refGrad;
        ctx.fill();

        // ── 4. 메인 하이라이트 — 좌상단 타원형 (굴절된 빛의 핵심)
        const hlGrad = ctx.createRadialGradient(
          cx - r * 0.30, cy - r * 0.30, 0,
          cx - r * 0.30, cy - r * 0.30, r * 0.44
        );
        hlGrad.addColorStop(0,   'rgba(255,255,255,0.88)');
        hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.38)');
        hlGrad.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.beginPath();
        // 타원형으로 더 자연스럽게
        ctx.save();
        ctx.translate(cx - r * 0.30, cy - r * 0.30);
        ctx.scale(1, 0.65);
        ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
        ctx.restore();
        ctx.fillStyle = hlGrad;
        ctx.fill();

        // ── 5. 림 하이라이트 — 구슬 가장자리 얇은 빛 (유리 테두리)
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = c.rim;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH * TILE_SIZE}
      height={MAP_HEIGHT * TILE_SIZE}
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: `translate(-50%, 0) scale(${canvasScale})`,
        transformOrigin: 'center top',
        pointerEvents: 'none',
      }}
    />
  );
};

// ─── 보스 글로우 pulse 오버레이 (Canvas 2D) ──────────────────────────────────
// [수정②] 적당한 강도의 붉은 pulse 글로우 — 너무 과하지 않게 조정

interface BossGlowOverlayProps {
  enemies: Array<{ id: string; position: { x: number; y: number }; isBoss: boolean }>;
  canvasScale: number;
}

const BossGlowOverlay: React.FC<BossGlowOverlayProps> = ({ enemies, canvasScale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const startTimeRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = MAP_WIDTH * TILE_SIZE;
    const H = MAP_HEIGHT * TILE_SIZE;

    const draw = (now: number) => {
      ctx.clearRect(0, 0, W, H);

      const elapsed = (now - startTimeRef.current) / 1000;

      for (const enemy of enemiesRef.current) {
        if (!enemy.isBoss) continue;

        const cx = enemy.position.x;
        const cy = enemy.position.y;

        // pulse: 1.6초 주기 사인파, 0~1
        const pulse = (Math.sin(elapsed * (Math.PI * 2 / 1.6)) + 1) / 2;

        // [수정①] 글로우 반경을 줄임: 38~50px (기존 44~62px)
        const glowR = 38 + pulse * 12;
        // [수정①] 투명도도 낮춤: 0.10~0.24 (기존 0.18~0.42)
        const outerAlpha = 0.05 + pulse * 0.07;
        const innerAlpha = 0.10 + pulse * 0.08;

        // 외부 넓은 글로우
        const outerGrad = ctx.createRadialGradient(cx, cy, glowR * 0.25, cx, cy, glowR);
        outerGrad.addColorStop(0, `rgba(255, 50, 20, ${innerAlpha})`);
        outerGrad.addColorStop(0.6, `rgba(210, 20, 0, ${outerAlpha})`);
        outerGrad.addColorStop(1, 'rgba(180, 0, 0, 0)');

        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = outerGrad;
        ctx.fill();

        // 내부 코어 글로우 (작고 은은하게)
        const coreR = 16 + pulse * 5;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, `rgba(255, 100, 60, ${0.12 + pulse * 0.10})`);
        coreGrad.addColorStop(1, 'rgba(255, 40, 10, 0)');

        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH * TILE_SIZE}
      height={MAP_HEIGHT * TILE_SIZE}
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: `translate(-50%, 0) scale(${canvasScale})`,
        transformOrigin: 'center top',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
};

// HP 바 컴포넌트
const HPBar: React.FC<{
  x: number;
  y: number;
  current: number;
  max: number;
  width?: number;
  level?: number;
}> = ({ x, y, current, max, width = 50, level }) => {
  const ratio = Math.max(0, Math.min(1, current / max));
  const color = ratio > 0.5 ? "#2ecc71" : ratio > 0.25 ? "#f39c12" : "#e74c3c";

  return (
    <>
      {level !== undefined && (
        <Text
          x={x - width / 2 - 28}
          y={y - 38}
          text={`Lv.${level}`}
          fontSize={11}
          fill="#ffffff"
          fontStyle="bold"
          stroke="#000"
          strokeWidth={0.5}
          shadowColor="#000"
          shadowBlur={3}
          shadowOpacity={0.8}
        />
      )}
      <Rect
        x={x - width / 2}
        y={y - 35}
        width={width}
        height={6}
        fill="#2c3e50"
        stroke="#1a242f"
        strokeWidth={1}
      />
      <Rect
        x={x - width / 2}
        y={y - 35}
        width={width * ratio}
        height={6}
        fill={color}
      />
    </>
  );
};

const AchievementToastDisplay: React.FC = () => {
  const { t } = useTranslation();
  const achievementToast = useGameStore(s => s.achievementToast);
  if (!achievementToast) return null;
  const ap = achievementToast.earnedAP ?? 3;
  const tierColor = ap >= 100 ? '#ff80ff' : ap >= 50 ? '#b9f2ff' : ap >= 25 ? '#FFD700' : ap >= 10 ? '#c0c0c0' : '#cd7f32';
  const isFirst = achievementToast.isFirstTime;
  // 세이브에 굳은 이름(achievementToast.name)이 아니라 정의를 통해 푼다 — 구버전 세이브는 한국어다.
  const def = getAchievementById(achievementToast.id);
  const label = def ? resolveAchievementText(def, t, 'name') : achievementToast.name;
  return (
    <AchievementToastPill key={achievementToast.timestamp} $color={tierColor} $first={isFirst}>
      <Emoji glyph={isFirst ? '🏆' : '✅'} size={14} />{' '}
      <AchPillName $first={isFirst}>{label}</AchPillName>
      {isFirst && <AchPillAP $color={tierColor}> +{ap}AP</AchPillAP>}
    </AchievementToastPill>
  );
};

export const GameCanvas: React.FC = () => {
  const { t } = useTranslation();
  const {
    pokemonToPlace, setPokemonToPlace, addTower, spendMoney, addMoney,
    isWaveActive, towers, enemies, projectiles, damageNumbers, currentMap, evolutionToast,
  } = useGameStore((state) => ({
    pokemonToPlace: state.pokemonToPlace,
    setPokemonToPlace: state.setPokemonToPlace,
    addTower: state.addTower,
    spendMoney: state.spendMoney,
    addMoney: state.addMoney,
    isWaveActive: state.isWaveActive,
    towers: state.towers,
    enemies: state.enemies,
    projectiles: state.projectiles,
    damageNumbers: state.damageNumbers,
    currentMap: state.currentMap,
    evolutionToast: state.evolutionToast,
  }));

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [rawMousePos, setRawMousePos] = useState({ x: 0, y: 0 });
  const [placementImage, setPlacementImage] = useState<HTMLImageElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [hoveredTower, setHoveredTower] = useState<GamePokemon | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ kind: 'tera' | 'shop' | 'contest'; type?: string } | null>(null);
  const [repositionMode, setRepositionMode] = useState(false);
  const [selectedTowerForReposition, setSelectedTowerForReposition] = useState<GamePokemon | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [mapBgImage, setMapBgImage] = useState<HTMLImageElement | null>(null);
  // 알바 회수 배치 대기열 — 선두 한 마리씩 플레이어가 칸을 찍는다.
  const pendingWorkWithdrawId = useGameStore(s => s.pendingWorkWithdrawIds[0] ?? null);
  const manageTowerId = useGameStore(s => s.manageTowerId);
  const setManageTowerId = useGameStore(s => s.setManageTowerId);
  const money = useGameStore(s => s.money);
  const heldItemInventory = useGameStore(s => s.heldItemInventory);
  const wave = useGameStore(s => s.wave);

  const lastTimeRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const map = React.useMemo(() => getMapById(currentMap), [currentMap]);
  // 활성 테라 타일(위치는 N웨이브마다 후보 spots 사이로 순환; 쉬는 시간에 미리 이동)
  const activeTera = React.useMemo(
    () => activeTeraTiles(map, wave, isWaveActive),
    [map, wave, isWaveActive]
  );
  // 시설(프렌들리숍·콘테스트 홀) = 길에서 가장 먼 칸 자동 계산. 멀티플레이는 빈 목록(알바 없음).
  const facility = React.useMemo(() => activeFacilityTiles(map), [map]);

  // ── i18n 헬퍼 ──────────────────────────────────────────────────────────────
  const typeLabel = (ty?: string) => (ty ? t(`types.${ty}`) : '');
  const heldName = (id?: string) => { const it = getHeldItem(id); return it ? t(`heldItems.${it.id}.name`) : ''; };
  const heldDesc = (id?: string) => { const it = getHeldItem(id); return it ? t(`heldItems.${it.id}.desc`) : ''; };

  // 테라스탈 타일 점유 동기화: 타워가 (현재 활성) teraTile 위에 있으면 teraType 세팅, 벗어나면 해제.
  useEffect(() => {
    const updateTower = useGameStore.getState().updateTower;
    for (const tower of towers) {
      const tx = Math.floor(tower.position.x / TILE_SIZE);
      const ty = Math.floor(tower.position.y / TILE_SIZE);
      const want = activeTera.find((t) => t.x === tx && t.y === ty)?.type;
      if (tower.teraType !== want) updateTower(tower.id, { teraType: want });
    }
  }, [towers, activeTera]);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const padding = isMobileOrTablet() ? 8 : 32;
      const scaleX = (container.clientWidth - padding) / (MAP_WIDTH * TILE_SIZE);
      const scaleY = (container.clientHeight - padding) / (MAP_HEIGHT * TILE_SIZE);
      const maxScale = isMobileOrTablet() ? 1.2 : 1.5;
      setCanvasScale(Math.min(scaleX, scaleY, maxScale));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    return () => { window.removeEventListener("resize", updateScale); window.removeEventListener("orientationchange", updateScale); };
  }, []);

  useEffect(() => {
    let rafId: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const BG_FPS = 30;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      GameManager.getInstance().update(dt);
    };
    const startRaf = () => {
      if (rafId !== null) return;
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      lastTimeRef.current = Date.now();
      const loop = () => { tick(); rafId = requestAnimationFrame(loop); };
      rafId = requestAnimationFrame(loop);
    };
    const startInterval = () => {
      if (intervalId !== null) return;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      lastTimeRef.current = Date.now();
      intervalId = setInterval(tick, 1000 / BG_FPS);
    };
    const handleVisibility = () => { if (document.hidden) startInterval(); else startRaf(); };
    document.addEventListener('visibilitychange', handleVisibility);
    document.hidden ? startInterval() : startRaf();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (pokemonToPlace?.sprite) {
      const img = new window.Image();
      img.src = pokemonToPlace.sprite;
      img.crossOrigin = "Anonymous";
      img.onload = () => setPlacementImage(img);
    } else {
      setPlacementImage(null);
    }
  }, [pokemonToPlace]);

  useEffect(() => {
    if (!map?.backgroundImage) { setMapBgImage(null); return; }
    const img = new window.Image();
    img.src = map.backgroundImage;
    img.onload = () => setMapBgImage(img);
    img.onerror = () => setMapBgImage(null);
  }, [map?.backgroundImage]);

  useEffect(() => {
    if (!isWaveActive && towers.length > 0) setRepositionMode(true);
    else if (isWaveActive) {
      // 회수 배치를 마치지 않은 채 웨이브를 시작하면 임의의 빈 칸으로 폴백 배치(갇힘 방지).
      // completeWorkWithdraw()는 어떤 경로로도 큐 선두를 제거하므로 루프는 반드시 끝난다.
      let guard = 0;
      while (useGameStore.getState().pendingWorkWithdrawIds.length > 0 && guard++ < 8) {
        useGameStore.getState().completeWorkWithdraw();
      }
      setRepositionMode(false); setSelectedTowerForReposition(null);
    }
  }, [isWaveActive, towers.length]);

  // [회수 배치] 회수를 고르면 곧바로 배치 모드로 넘겨 원하는 칸을 찍게 한다.
  useEffect(() => {
    if (!pendingWorkWithdrawId) return;
    const tw = useGameStore.getState().towers.find(t => t.id === pendingWorkWithdrawId);
    if (!tw) return;
    setRepositionMode(true);
    setSelectedTowerForReposition(tw);
    const img = new window.Image();
    img.src = tw.sprite; img.crossOrigin = "Anonymous";
    img.onload = () => setPlacementImage(img);
    showToast(t('work.placeHint', { name: tw.displayName }), 'info');
  }, [pendingWorkWithdrawId]);

  const handleTouchStart = (e: any) => {
    if (!isTouchDevice()) return;
    const pos = e.target.getStage().getPointerPosition();
    if (pos) setTouchStartPos({ x: pos.x, y: pos.y });
  };

  const handleTouchMove = (e: any) => {
    if (!isTouchDevice() || !touchStartPos) return;
    const pos = e.target.getStage().getPointerPosition();
    if (pos) {
      setRawMousePos({ x: pos.x, y: pos.y });
      if (pokemonToPlace || selectedTowerForReposition) {
        setMousePos({ x: Math.floor(pos.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, y: Math.floor(pos.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2 });
      }
    }
  };

  const handleTouchEnd = (e: any) => {
    if (!isTouchDevice() || !touchStartPos) return;
    const pos = e.target.getStage().getPointerPosition();
    if (pos && Math.abs(pos.x - touchStartPos.x) < 10 && Math.abs(pos.y - touchStartPos.y) < 10) handleClick(e);
    setTouchStartPos(null);
  };

  const handleMouseMove = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (pos) setRawMousePos({ x: pos.x, y: pos.y });
    if (pokemonToPlace && pos) {
      setMousePos({ x: Math.floor(pos.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, y: Math.floor(pos.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2 });
    } else if (selectedTowerForReposition && pos) {
      setMousePos({ x: Math.floor(pos.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, y: Math.floor(pos.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2 });
    } else {
      setMousePos(pos || { x: 0, y: 0 });
      if (pos) {
        const tower = towers.find(t => Math.abs(t.position.x - pos.x) < 32 && Math.abs(t.position.y - pos.y) < 32) || null;
        setHoveredTower(tower);
        // 타워가 없을 때만 특수 타일(테라/숍) 힌트 표시
        if (!tower) {
          const tx = Math.floor(pos.x / TILE_SIZE), ty = Math.floor(pos.y / TILE_SIZE);
          const tera = activeTera.find(t => t.x === tx && t.y === ty);
          const shop = facility.shopTiles.some(s => s.x === tx && s.y === ty);
          const contest = facility.contestTiles.some(s => s.x === tx && s.y === ty);
          setHoveredTile(tera ? { kind: 'tera', type: tera.type } : shop ? { kind: 'shop' } : contest ? { kind: 'contest' } : null);
        } else {
          setHoveredTile(null);
        }
      }
    }
  };

  const theme = React.useMemo(() => getTileTheme(map?.backgroundType), [map?.backgroundType]);

  const pathTileSet = React.useMemo(() => {
    const set = new Set<string>();
    if (!map) return set;
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const cx = tx * TILE_SIZE + TILE_SIZE / 2;
        const cy = ty * TILE_SIZE + TILE_SIZE / 2;
        for (const path of map.paths) {
          for (let i = 0; i < path.length - 1; i++) {
            const s = path[i], e = path[i + 1];
            if (cx >= Math.min(s.x, e.x) - TILE_SIZE / 2 && cx <= Math.max(s.x, e.x) + TILE_SIZE / 2 &&
                cy >= Math.min(s.y, e.y) - TILE_SIZE / 2 && cy <= Math.max(s.y, e.y) + TILE_SIZE / 2) {
              set.add(`${tx}-${ty}`); break;
            }
          }
        }
      }
    }
    return set;
  }, [map]);

  // 자유 배치(울타리 폐기): 길 타일과 입구/출구 3칸 keepout만 제외하면 어디든 배치 가능.
  // 길에서 먼 '잉여 타일'도 허용해야 프렌들리숍 타일 운용이 가능하므로 길-인접 규칙은 두지 않는다.
  const buildableTileSet = React.useMemo(() => {
    const set = new Set<string>();
    // 입구/출구 타일 (맵 밖 좌표는 화면상 마커처럼 맵 안으로 클램프해서 거리 측정)
    // objectiveKeepout === false 면 출구 3칸 제한 미적용(중앙 방어형 맵)
    const clamp = (p: { x: number; y: number }) => ({
      tx: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(p.x / TILE_SIZE))),
      ty: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(p.y / TILE_SIZE))),
    });
    const endpoints = [
      ...(map?.spawns ?? []).map(clamp),
      ...(map?.objectiveKeepout === false ? [] : (map?.objectives ?? []).map(clamp)),
    ];
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const key = `${tx}-${ty}`;
        if (pathTileSet.has(key)) continue; // 길은 항상 제외
        if (endpoints.some(e => Math.max(Math.abs(tx - e.tx), Math.abs(ty - e.ty)) < 3)) continue; // 입출구 3칸 이내 금지
        set.add(key);
      }
    }
    return set;
  }, [map, pathTileSet]);

  // 인접 직선 3개 금지: 새 타일을 놓으면 좌우 또는 상하로 3연속이 되는지 검사.
  // occ = 점유 타일 집합. true면 일직선 3+ 형성 → 배치 불가.
  const wouldFormLine = (ntx: number, nty: number, occ: Set<string>) => {
    const run = (dx: number, dy: number) => { let n = 0, cx = ntx + dx, cy = nty + dy; while (occ.has(`${cx}-${cy}`)) { n++; cx += dx; cy += dy; } return n; };
    return (1 + run(-1, 0) + run(1, 0) >= 3) || (1 + run(0, -1) + run(0, 1) >= 3);
  };

  const occupiedTileSet = React.useMemo(() =>
    new Set(towers.map(t => `${Math.floor(t.position.x / TILE_SIZE)}-${Math.floor(t.position.y / TILE_SIZE)}`)),
    [towers]);

  const validPlacementSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const key of buildableTileSet) {
      const [tx, ty] = key.split('-').map(Number);
      if (occupiedTileSet.has(key)) continue;
      if (wouldFormLine(tx, ty, occupiedTileSet)) continue; // 일직선 3연속 방지
      set.add(key);
    }
    return set;
  }, [buildableTileSet, occupiedTileSet]);

  const isValidPlacement = (x: number, y: number, excludeId?: string) => {
    if (x < 0 || x >= MAP_WIDTH * TILE_SIZE || y < 0 || y >= MAP_HEIGHT * TILE_SIZE) return false;
    const ntx = Math.floor(x / TILE_SIZE), nty = Math.floor(y / TILE_SIZE);
    if (!buildableTileSet.has(`${ntx}-${nty}`)) return false;
    const occ = new Set(towers.filter(t => !excludeId || t.id !== excludeId)
      .map(t => `${Math.floor(t.position.x / TILE_SIZE)}-${Math.floor(t.position.y / TILE_SIZE)}`));
    if (occ.has(`${ntx}-${nty}`)) return false;
    if (wouldFormLine(ntx, nty, occ)) return false;
    return true;
  };

  const handleClick = (e: any) => {
    // getPointerPosition()이 null인 경우(일부 터치/합성 이벤트) 직전 hover 좌표로 폴백
    const pos = e.target.getStage().getPointerPosition() || rawMousePos;
    if (!pos) return;
    const snappedX = Math.floor(pos.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    const snappedY = Math.floor(pos.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;

    if (repositionMode && !pokemonToPlace) {
      // 근무 잠금 — 근무 중이라도 최고 등급(15웨이브)이면 자유롭게 옮길 수 있다.
      const isLocked = (tw: GamePokemon) => isWorkLocked(tw, currentMap);
      const updateTower = useGameStore.getState().updateTower;

      if (selectedTowerForReposition) {
        const A = selectedTowerForReposition;
        const isWithdrawing = pendingWorkWithdrawId === A.id;
        // 클릭 칸에 다른 타워(B)가 있으면 A·B 위치 교환
        const B = towers.find(t => t.id !== A.id && Math.floor(t.position.x / TILE_SIZE) === Math.floor(snappedX / TILE_SIZE) && Math.floor(t.position.y / TILE_SIZE) === Math.floor(snappedY / TILE_SIZE));
        if (B) {
          // 회수 배치 중에는 교환 불가 — 근무 타일을 비우는 게 목적이므로 빈 칸만 허용
          if (isWithdrawing) { showToast(t('work.placeOnEmpty')); return; }
          if (isLocked(A) || isLocked(B)) {
            showToast(t('facility.alertCannotMoveSwap'));
            return;
          }
          updateTower(A.id, movePatch(A, currentMap, { x: B.position.x, y: B.position.y }));
          updateTower(B.id, movePatch(B, currentMap, { x: A.position.x, y: A.position.y }));
          setSelectedTowerForReposition(null);
          return;
        }
        if (!isValidPlacement(snappedX, snappedY, A.id)) { showToast(t('alerts.cannotPlaceHere')); return; }
        if (!isWithdrawing && isLocked(A)) {
          showToast(t('facility.alertCannotMove'));
          return;
        }
        if (isWithdrawing) {
          // 회수 확정 — 누적 근무 초기화까지 store가 처리
          useGameStore.getState().completeWorkWithdraw({ x: snappedX, y: snappedY });
        } else {
          updateTower(A.id, movePatch(A, currentMap, { x: snappedX, y: snappedY }));
        }
        setSelectedTowerForReposition(null);
      } else {
        const clicked = towers.find(t => Math.abs(t.position.x - pos.x) < 32 && Math.abs(t.position.y - pos.y) < 32);
        if (clicked) {
          // 근무 중인 포켓몬은 집어 올리는 대신 시설 모달을 연다.
          // (최고 등급이라 잠금이 풀렸어도, 실수로 끌어내 누적을 날리는 사고를 막고
          //  모달 안의 '회수하기' 버튼으로만 명시적으로 빼게 한다)
          if (isWorking(clicked, currentMap)) {
            setManageTowerId(clicked.id);
            return;
          }
          setSelectedTowerForReposition(clicked);
          const img = new window.Image(); img.src = clicked.sprite; img.crossOrigin = "Anonymous"; img.onload = () => setPlacementImage(img);
        }
      }
      return;
    }

    // 배치/재배치 중이 아닐 때 타워 클릭 → 관리 모달(상점/지닌도구). 점원이면 상점 섹션 노출.
    if (!pokemonToPlace && !repositionMode) {
      const ctx = Math.floor(snappedX / TILE_SIZE), cty = Math.floor(snappedY / TILE_SIZE);
      const clicked = towers.find(tw => Math.floor(tw.position.x / TILE_SIZE) === ctx && Math.floor(tw.position.y / TILE_SIZE) === cty);
      if (clicked) { setManageTowerId(clicked.id); return; }
    }

    if (!pokemonToPlace) return;
    if (towers.length >= 6) { showToast(t('alerts.maxPokemon')); if (pokemonToPlace.originalCost) addMoney(pokemonToPlace.originalCost); setPokemonToPlace(null); return; }
    if (!isValidPlacement(snappedX, snappedY)) { showToast(t('alerts.cannotPlaceHere')); return; }
    if (!spendMoney(pokemonToPlace.cost || 0)) { showToast(t('alerts.notEnoughMoneyWithCost', { cost: pokemonToPlace.cost })); setPokemonToPlace(null); return; }

    const poke = pokemonToPlace;
    addTower({
      id: `tower-${Date.now()}`, pokemonId: poke.id, basePokemonId: poke.id, name: poke.name, displayName: poke.displayName,
      level: 1, experience: 0, currentHp: poke.stats.hp, maxHp: poke.stats.hp,
      baseAttack: poke.stats.attack, attack: poke.stats.attack, defense: poke.stats.defense,
      specialAttack: poke.stats.specialAttack, specialDefense: poke.stats.specialDefense, speed: poke.stats.speed,
      types: poke.types, position: { x: snappedX, y: snappedY }, equippedMoves: poke.equippedMoves,
      rejectedMoves: poke.rejectedMoves || [], isFainted: false, sprite: poke.sprite, range: 3,
      sellValue: Math.floor((poke.originalCost || 100) * 0.5), kills: 0, damageDealt: 0,
      gender: poke.gender, ability: poke.ability, targetEnemyId: null,
    });
    setPokemonToPlace(null);
  };

  const handleRightClick = (e: any) => {
    e.evt.preventDefault();
    if (pokemonToPlace?.originalCost) useGameStore.getState().addMoney(pokemonToPlace.originalCost);
    setPokemonToPlace(null);
    setSelectedTowerForReposition(null);
  };

  const staticTiles = React.useMemo(() => {
    const tiles: React.ReactNode[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++)
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isPath = pathTileSet.has(`${x}-${y}`);
        tiles.push(<Rect key={`${x}-${y}`} x={x*TILE_SIZE} y={y*TILE_SIZE} width={TILE_SIZE} height={TILE_SIZE}
          fill={isPath ? theme.pathFill : (x+y)%2===0 ? theme.tileA : theme.tileB}
          stroke={isPath ? theme.pathStroke : theme.stroke} strokeWidth={isPath ? 1 : 0.8} />);
      }
    return tiles;
  }, [pathTileSet, theme]);

  // 원래의 둥근 곡선 + 그림자(입체) 도로 디자인. 단, 여러 경로가 교차로에서 겹쳐도
  // 반투명 알파가 누적돼 진해지지 않도록 불투명 색 + Group 불투명도로 한 번만 합성한다.
  const pathOverlayLines = React.useMemo(() => {
    if (!map) return null;
    const bgType = (map.backgroundType ?? 'grass') as BackgroundType;
    const PATH_COLORS: Record<BackgroundType, string> = { grass: '#523712', cave: '#16120f', water: '#76551c', desert: '#664010', snow: '#4b6282' };
    const SHADOW_COLORS: Record<BackgroundType, string> = { grass: '#1a0e04', cave: '#050404', water: '#1c1005', desert: '#180c03', snow: '#141e2e' };
    const GROUP_OPACITY: Record<BackgroundType, number> = { grass: 0.62, cave: 0.70, water: 0.65, desert: 0.60, snow: 0.54 };
    const W = TILE_SIZE; // 타일에 꽉 차게 → 가장자리 틈 없음 (곡선·입체는 stroke로 유지)
    return (
      <Group opacity={GROUP_OPACITY[bgType]}>
        {map.paths.map((path, pi) => {
          const pts = path.flatMap(p => [p.x, p.y]);
          return (
            <React.Fragment key={`pathOverlay-${pi}`}>
              <Line points={pts} stroke={PATH_COLORS[bgType]} strokeWidth={W} lineJoin="round" lineCap="round"
                shadowColor={SHADOW_COLORS[bgType]} shadowBlur={10} shadowOffsetX={2} shadowOffsetY={6} shadowOpacity={0.5} />
              <Line points={pts} stroke="rgba(255,255,255,0.18)" strokeWidth={W - 14} lineJoin="round" lineCap="round" />
            </React.Fragment>
          );
        })}
      </Group>
    );
  }, [map, pathTileSet]);

  const placementOverlay = React.useMemo(() => {
    if (!pokemonToPlace && !selectedTowerForReposition) return null;
    const overlays: React.ReactNode[] = [];
    for (const key of buildableTileSet) {
      const [x, y] = key.split('-').map(Number);
      overlays.push(<Rect key={`overlay-${key}`} x={x*TILE_SIZE} y={y*TILE_SIZE} width={TILE_SIZE} height={TILE_SIZE}
        fill={validPlacementSet.has(key) ? 'rgba(46,204,113,0.25)' : 'rgba(231,76,60,0.25)'} />);
    }
    return overlays;
  }, [pokemonToPlace, selectedTowerForReposition, buildableTileSet, validPlacementSet]);

  // ─── 테라스탈 타일 (크리스털) ──────────────────────────────────────────────
  const teraTileNodes = React.useMemo(() => {
    const tiles = activeTera;
    if (tiles.length === 0) return null;
    // 은은하게: 얇은 점선 테두리 + 작은 모서리 결정만.
    return tiles.map((tile, i) => {
      const c = typeColor(tile.type);
      const x0 = tile.x * TILE_SIZE, y0 = tile.y * TILE_SIZE;
      const gx = x0 + 11, gy = y0 + 11; // 좌상단 모서리 결정
      return (
        <Group key={`tera-${i}`}>
          <Rect x={x0} y={y0} width={TILE_SIZE} height={TILE_SIZE} fill={c} opacity={0.1} cornerRadius={8} />
          <Rect x={x0 + 1.5} y={y0 + 1.5} width={TILE_SIZE - 3} height={TILE_SIZE - 3}
            stroke={c} strokeWidth={1.5} cornerRadius={8} opacity={0.6} dash={[4, 4]} />
          <Line points={[gx, gy - 6, gx + 5, gy, gx, gy + 6, gx - 5, gy]} closed
            fill={c} stroke="#ffffff" strokeWidth={0.8} opacity={0.9} shadowColor={c} shadowBlur={5} />
        </Group>
      );
    });
  }, [activeTera]);

  // ─── 프렌들리숍 타일 ───────────────────────────────────────────────────────
  const shopTileNodes = React.useMemo(() => {
    const tiles = facility.shopTiles;
    if (tiles.length === 0) return null;
    const SHOP = '#e0a030';
    // 은은하게: 얇은 점선 테두리 + 작은 모서리 🏪. 점유 시에만 상태 라벨.
    return tiles.map((tile, i) => {
      const x0 = tile.x * TILE_SIZE, y0 = tile.y * TILE_SIZE;
      const clerk = towers.find(t => Math.floor(t.position.x / TILE_SIZE) === tile.x && Math.floor(t.position.y / TILE_SIZE) === tile.y);
      const waves = clerk?.shopWavesHeld ?? 0;
      const tier = shopTier(waves);
      const label = !clerk ? '' : tier === 0 ? t('facility.tileWorking', { n: wavesToNextTier(waves) }) : t('facility.tileOpen', { n: tier });
      return (
        <Group key={`shop-${i}`}>
          <Rect x={x0} y={y0} width={TILE_SIZE} height={TILE_SIZE} fill={SHOP} opacity={0.1} cornerRadius={8} />
          <Rect x={x0 + 1.5} y={y0 + 1.5} width={TILE_SIZE - 3} height={TILE_SIZE - 3}
            stroke={SHOP} strokeWidth={1.5} cornerRadius={8} opacity={0.6} dash={[4, 4]} />
          <Text text="🏪" fontSize={14} x={x0 + TILE_SIZE - 19} y={y0 + 3} shadowColor="#000" shadowBlur={3} />
          {label && (
            <Text text={label} fontSize={10} x={x0 - 8} y={y0 + TILE_SIZE - 13} width={TILE_SIZE + 16} align="center"
              fill={tier === 0 ? '#ffb0b0' : '#ffe9b0'} fontStyle="bold" shadowColor="#000" shadowBlur={3} />
          )}
        </Group>
      );
    });
  }, [map, towers]);

  // ─── 콘테스트 홀 타일 ──────────────────────────────────────────────────────
  const contestTileNodes = React.useMemo(() => {
    const tiles = facility.contestTiles;
    if (tiles.length === 0) return null;
    const CON = '#e070b0';
    return tiles.map((tile, i) => {
      const x0 = tile.x * TILE_SIZE, y0 = tile.y * TILE_SIZE;
      const scout = towers.find(t => Math.floor(t.position.x / TILE_SIZE) === tile.x && Math.floor(t.position.y / TILE_SIZE) === tile.y);
      const waves = scout?.shopWavesHeld ?? 0;
      const tier = shopTier(waves);
      const label = !scout ? '' : tier === 0 ? t('facility.tileContestPrep', { n: wavesToNextTier(waves) }) : t('facility.tileContest', { n: tier });
      return (
        <Group key={`contest-${i}`}>
          <Rect x={x0} y={y0} width={TILE_SIZE} height={TILE_SIZE} fill={CON} opacity={0.1} cornerRadius={8} />
          <Rect x={x0 + 1.5} y={y0 + 1.5} width={TILE_SIZE - 3} height={TILE_SIZE - 3}
            stroke={CON} strokeWidth={1.5} cornerRadius={8} opacity={0.6} dash={[4, 4]} />
          <Text text="🎀" fontSize={14} x={x0 + TILE_SIZE - 19} y={y0 + 3} shadowColor="#000" shadowBlur={3} />
          {label && (
            <Text text={label} fontSize={10} x={x0 - 8} y={y0 + TILE_SIZE - 13} width={TILE_SIZE + 16} align="center"
              fill={tier === 0 ? '#ffc0e0' : '#ffd6ec'} fontStyle="bold" shadowColor="#000" shadowBlur={3} />
          )}
        </Group>
      );
    });
  }, [map, towers]);

  return (
    <CanvasContainer ref={containerRef}>
      {evolutionToast && (
        <EvolutionToast>
          <span><Emoji glyph="✨" size={14} /> {t('game.evoToast', { fromName: evolutionToast.fromName, toName: evolutionToast.toName })}</span>
          <EvolutionToastButton onClick={() => useGameStore.setState({ evolutionToast: null })}><Emoji glyph="❌" size={13} /></EvolutionToastButton>
        </EvolutionToast>
      )}



      {hoveredTower && !pokemonToPlace && !selectedTowerForReposition && (
        <Tooltip style={{ left: `${mousePos.x * canvasScale + 80}px`, top: `${mousePos.y * canvasScale - 20}px` }}>
          <TooltipTitle>{hoveredTower.displayName} (Lv.{hoveredTower.level})</TooltipTitle>
          <TooltipTypes>
            {hoveredTower.types.map(type => <TooltipTypeIcon key={type} src={`${TYPE_ICON_API_BASE}${type}.gif`} alt={type} />)}
          </TooltipTypes>
          <TooltipStats>
            <TooltipStatRow>HP: {Math.floor(hoveredTower.currentHp)}/{hoveredTower.maxHp}</TooltipStatRow>
            <TooltipStatRow>{t('picker.attack')}: {hoveredTower.attack} | {t('picker.defense')}: {hoveredTower.defense}</TooltipStatRow>
            <TooltipStatRow>{t('picker.spAttack')}: {hoveredTower.specialAttack} | {t('picker.spDefense')}: {hoveredTower.specialDefense}</TooltipStatRow>
            <TooltipStatRow>{t('picker.speed')}: {hoveredTower.speed}</TooltipStatRow>
            {hoveredTower.equippedMoves[0] && <TooltipMove><Emoji glyph="⚔️" size={12} /> {hoveredTower.equippedMoves[0].displayName} ({hoveredTower.equippedMoves[0].power})</TooltipMove>}
            {hoveredTower.teraType && (
              <TooltipMove style={{ color: typeColor(hoveredTower.teraType) }}>
                <Emoji glyph="💎" size={12} /> {t('facility.teraInline', { type: typeLabel(hoveredTower.teraType) })}
                {hoveredTower.equippedMoves.some(m => m.type === hoveredTower.teraType)
                  ? ` ${t('facility.teraStabOn')}`
                  : ` ${t('facility.teraDefConv')}`}
              </TooltipMove>
            )}
            {hoveredTower.heldItem && getHeldItem(hoveredTower.heldItem) && (
              <TooltipMove style={{ color: '#f0b840' }}>
                <Emoji glyph={getHeldItem(hoveredTower.heldItem)!.icon} size={12} /> {heldName(hoveredTower.heldItem)}
              </TooltipMove>
            )}
          </TooltipStats>
        </Tooltip>
      )}

      {/* 특수 타일 호버 힌트 (테라/숍) — 타워가 없을 때만. 우측 타일은 툴팁을 왼쪽으로 띄워 패널에 안 가리게. */}
      {hoveredTile && !hoveredTower && !pokemonToPlace && !selectedTowerForReposition && (
        <Tooltip style={mousePos.x > MAP_WIDTH * TILE_SIZE * 0.6
          ? { right: `${(MAP_WIDTH * TILE_SIZE - mousePos.x) * canvasScale + 80}px`, top: `${mousePos.y * canvasScale - 20}px` }
          : { left: `${mousePos.x * canvasScale + 80}px`, top: `${mousePos.y * canvasScale - 20}px` }}>
          {hoveredTile.kind === 'tera' ? (
            <>
              <TooltipTitle style={{ color: typeColor(hoveredTile.type) }}><Emoji glyph="💎" size={13} /> {t('facility.teraTileTitle')}</TooltipTitle>
              <TooltipStats>
                <TooltipStatRow>{t('facility.teraTileL1', { type: typeLabel(hoveredTile.type) })}</TooltipStatRow>
                <TooltipStatRow>{t('facility.teraTileL2')}</TooltipStatRow>
                <TooltipStatRow style={{ color: '#9fb0c4' }}>{t('facility.teraTileL3')}</TooltipStatRow>
              </TooltipStats>
            </>
          ) : hoveredTile.kind === 'shop' ? (
            <>
              <TooltipTitle style={{ color: '#f0b840' }}><Emoji glyph="🏪" size={13} /> {t('facility.shopTileTitle')}</TooltipTitle>
              <TooltipStats>
                <TooltipStatRow>{t('facility.shopTileL1')}</TooltipStatRow>
                <TooltipStatRow>{t('facility.shopTileL2')}</TooltipStatRow>
                <TooltipStatRow style={{ color: '#9fb0c4' }}>{t('facility.shopTileL3')}</TooltipStatRow>
              </TooltipStats>
            </>
          ) : (
            <>
              <TooltipTitle style={{ color: '#f0a0d0' }}><Emoji glyph="🎀" size={13} /> {t('facility.contestTileTitle')}</TooltipTitle>
              <TooltipStats>
                <TooltipStatRow>{t('facility.contestTileL1')}</TooltipStatRow>
                <TooltipStatRow>{t('facility.contestTileL2')}</TooltipStatRow>
                <TooltipStatRow style={{ color: '#9fb0c4' }}>{t('facility.contestTileL3')}</TooltipStatRow>
              </TooltipStats>
            </>
          )}
        </Tooltip>
      )}

      <StageWrapper style={{ transform: `translate(-50%, 0) scale(${canvasScale})` }}>
        <Stage ref={stageRef} width={MAP_WIDTH * TILE_SIZE} height={MAP_HEIGHT * TILE_SIZE}
          onMouseMove={handleMouseMove} onClick={handleClick} onContextMenu={handleRightClick}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <Layer>
            {mapBgImage ? (
              <>
                <KonvaImage image={mapBgImage} x={0} y={0} width={MAP_WIDTH*TILE_SIZE} height={MAP_HEIGHT*TILE_SIZE} imageSmoothingEnabled={true} />
                <Rect x={0} y={0} width={MAP_WIDTH*TILE_SIZE} height={MAP_HEIGHT*TILE_SIZE} fill="rgba(255,255,255,0.05)" />
                {pathOverlayLines}
              </>
            ) : (
              <>
                {staticTiles}
                {map && map.paths.map((path, i) => (
                  <Line key={`path-${i}`} points={path.flatMap(p => [p.x, p.y])} stroke={theme.pathLineStroke}
                    strokeWidth={TILE_SIZE - 2} lineJoin="round" lineCap="round" opacity={theme.pathLineOpacity} />
                ))}
              </>
            )}

            {/* 테라스탈 타일 */}
            {teraTileNodes}

            {/* 프렌들리숍 타일 */}
            {shopTileNodes}

            {/* 콘테스트 홀 타일 */}
            {contestTileNodes}

            {placementOverlay}

            {/* 입구 마커 */}
            {map && map.spawns.map((spawn, idx) => {
              const cx = Math.max(TILE_SIZE/2, Math.min(MAP_WIDTH*TILE_SIZE-TILE_SIZE/2, spawn.x));
              const cy = Math.max(TILE_SIZE/2, Math.min(MAP_HEIGHT*TILE_SIZE-TILE_SIZE/2, spawn.y));
              const fp = map.paths.find(p => Math.abs(p[0].x-spawn.x) < TILE_SIZE*2 && Math.abs(p[0].y-spawn.y) < TILE_SIZE*2);
              const dir = fp && fp.length > 1 ? { dx: fp[1].x-fp[0].x, dy: fp[1].y-fp[0].y } : { dx: 1, dy: 0 };
              return (
                <React.Fragment key={`spawn-${idx}`}>
                  <Circle x={cx} y={cy} radius={16} fillRadialGradientStartPoint={{x:0,y:0}} fillRadialGradientStartRadius={0}
                    fillRadialGradientEndPoint={{x:0,y:0}} fillRadialGradientEndRadius={16}
                    fillRadialGradientColorStops={[0,'#ff6b6b',1,'#c0392b']} stroke="#fff" strokeWidth={2} shadowColor="#e74c3c" shadowBlur={10} />
                  <Line x={cx} y={cy} points={[-2,-6,4,0,-2,6]} stroke="#fff" strokeWidth={3} lineCap="round" lineJoin="round"
                    rotation={(Math.atan2(dir.dy, dir.dx) * 180) / Math.PI} />
                </React.Fragment>
              );
            })}

            {/* 출구 마커 */}
            {map && map.objectives.map((obj, idx) => {
              const cx = Math.max(TILE_SIZE/2, Math.min(MAP_WIDTH*TILE_SIZE-TILE_SIZE/2, obj.x));
              const cy = Math.max(TILE_SIZE/2, Math.min(MAP_HEIGHT*TILE_SIZE-TILE_SIZE/2, obj.y));
              return (
                <React.Fragment key={`obj-${idx}`}>
                  <Circle x={cx} y={cy} radius={16} fillRadialGradientStartPoint={{x:0,y:0}} fillRadialGradientStartRadius={0}
                    fillRadialGradientEndPoint={{x:0,y:0}} fillRadialGradientEndRadius={16}
                    fillRadialGradientColorStops={[0,'#4facfe',1,'#1b8de8']} stroke="#fff" strokeWidth={2} shadowColor="#00f2fe" shadowBlur={10} />
                  <Rect x={cx} y={cy} width={10} height={10} offsetX={5} offsetY={5} fill="#fff" rotation={45} cornerRadius={2} />
                </React.Fragment>
              );
            })}

            {/* 타워 */}
            {towers.map((tower) => (
              <React.Fragment key={tower.id}>
                {/* 받침판: 배치된 칸 전체를 회색 반투명 판으로 덮음 (라운드·여백 없이 풀타일) */}
                <Rect x={tower.position.x - TILE_SIZE / 2} y={tower.position.y - TILE_SIZE / 2} width={TILE_SIZE} height={TILE_SIZE}
                  fill="rgba(120,124,130,0.42)" />
                {selectedTowerForReposition?.id === tower.id && (
                  <Circle x={tower.position.x} y={tower.position.y} radius={40} stroke="#4cafff" strokeWidth={3} dash={[10,5]} opacity={0.8} />
                )}
                <PokemonImage src={tower.sprite} x={tower.position.x} y={tower.position.y} isFainted={tower.isFainted} />
                <HPBar x={tower.position.x} y={tower.position.y} current={tower.currentHp} max={tower.maxHp} level={tower.level} />
                {/* 지닌 도구 뱃지(좌하단 이모지) */}
                {tower.heldItem && (
                  <Text text={getHeldItem(tower.heldItem)?.icon ?? '🎒'} fontSize={16}
                    x={tower.position.x - TILE_SIZE / 2 + 1} y={tower.position.y + TILE_SIZE / 2 - 17}
                    shadowColor="#000" shadowBlur={3} />
                )}
                {/* 테라스탈 변환 뱃지(왕관형 결정) — 변환 타입을 한눈에 표시 */}
                {tower.teraType && (() => {
                  const c = typeColor(tower.teraType);
                  const bx = tower.position.x + TILE_SIZE / 2 - 9;
                  const by = tower.position.y - TILE_SIZE / 2 + 9;
                  return (
                    <React.Fragment>
                      <Circle x={bx} y={by} radius={9} fill="#1a1a22" stroke={c} strokeWidth={1.5} shadowColor={c} shadowBlur={6} />
                      <Line points={[bx, by - 6, bx + 5, by, bx, by + 6, bx - 5, by]} closed fill={c} stroke="#fff" strokeWidth={0.8} />
                    </React.Fragment>
                  );
                })()}
              </React.Fragment>
            ))}

            {/* 적 */}
            {enemies.map((enemy) => (
              <React.Fragment key={enemy.id}>
                {enemy.sprite ? (
                  <PokemonImage src={enemy.sprite} x={enemy.position.x} y={enemy.position.y} isFainted={false} size={enemy.isBoss ? 96 : 64} />
                ) : (
                  <Circle x={enemy.position.x} y={enemy.position.y} radius={enemy.isBoss ? 32 : 15}
                    fill={enemy.isBoss ? "#e74c3c" : "#95a5a6"} stroke={enemy.isBoss ? "#ff2020" : "#1a242f"}
                    strokeWidth={enemy.isBoss ? 4 : 3} shadowColor={enemy.isBoss ? "#ff1010" : undefined}
                    shadowBlur={enemy.isBoss ? 16 : 0} shadowOpacity={enemy.isBoss ? 0.6 : 0} />
                )}
                <HPBar x={enemy.position.x} y={enemy.position.y} current={enemy.hp} max={enemy.maxHp} width={enemy.isBoss ? 70 : 50} />
              </React.Fragment>
            ))}

            {/* 데미지 숫자 */}
            {damageNumbers.map((dmg) => {
              const eff = dmg.effectiveness ?? 1;
              const fill =
                dmg.isMiss                        ? '#95a5a6' : // MISS: 회색
                dmg.isCrit && eff >= 2            ? '#ff2200' : // 크리티컬 + 약점: 진빨강
                dmg.isCrit                        ? '#f39c12' : // 크리티컬: 골드
                eff >= 4                          ? '#e74c3c' : // 4배 약점: 빨강
                eff >= 2                          ? '#e67e22' : // 2배 약점: 주황
                eff <= 0.15                       ? '#7f8c8d' : // 무효(×0.1): 진한 회색
                eff <= 0.5                        ? '#5dade2' : // 반감(×0.5): 파랑
                                                   '#ffffff';   // 보통: 흰색
              const fontSize =
                dmg.isMiss ? 22 :
                dmg.isCrit ? 26 :
                eff >= 2   ? 24 : 20;
              return (
                <Text key={dmg.id} x={dmg.position.x - 20} y={dmg.position.y - 30}
                  text={dmg.isMiss ? t('game.miss') : dmg.value.toString()}
                  fontSize={fontSize}
                  fill={fill}
                  fontStyle="bold" stroke="#000" strokeWidth={2}
                  shadowColor="#000" shadowBlur={5} shadowOpacity={0.8} />
              );
            })}

            {/* 배치 모드 */}
            {pokemonToPlace && (
              <>
                <Text x={rawMousePos.x+40} y={rawMousePos.y-40} text={pokemonToPlace.originalCost ? `${pokemonToPlace.originalCost}${t('common.money')}` : ''}
                  fill="#f39c12" fontSize={18} fontStyle="bold" stroke="black" strokeWidth={2} />
                <KonvaImage image={placementImage||undefined} x={rawMousePos.x-32} y={rawMousePos.y-32} width={64} height={64} opacity={0.6} imageSmoothingEnabled={false} />
                <Circle x={mousePos.x} y={mousePos.y} radius={3*TILE_SIZE} stroke="#fff" strokeWidth={2} opacity={0.4} dash={[10,5]} />
              </>
            )}

            {selectedTowerForReposition && (
              <KonvaImage image={placementImage||undefined} x={rawMousePos.x-32} y={rawMousePos.y-32} width={64} height={64} opacity={0.6} imageSmoothingEnabled={false} />
            )}
          </Layer>
        </Stage>
        <AchievementToastDisplay />
      </StageWrapper>

      {/* [수정②] 보스 글로우 pulse — 완화된 Canvas 2D 오버레이 */}
      <BossGlowOverlay enemies={enemies} canvasScale={canvasScale} />

      {/* [수정③] 투사체 유리구슬 오버레이 */}
      <ProjectileOverlay projectiles={projectiles} canvasScale={canvasScale} />

      {/* 포켓몬 관리: 프렌들리숍(점원) + 지닌 도구 장착 */}
      {(() => {
        const tower = towers.find(t => t.id === manageTowerId);
        if (!tower) return null;
        const tTx = Math.floor(tower.position.x / TILE_SIZE), tTy = Math.floor(tower.position.y / TILE_SIZE);
        const isClerk = facility.shopTiles.some(s => s.x === tTx && s.y === tTy);
        const isScout = facility.contestTiles.some(s => s.x === tTx && s.y === tTy);
        const waves = tower.shopWavesHeld ?? 0;
        const tier = (isClerk || isScout) ? shopTier(waves) : 0;
        const buyable = isClerk && tier > 0 ? buyableHeldItems(tier) : [];
        const canEquip = !isWaveActive;
        const close = () => setManageTowerId(null);
        const buy = (id: string, cost: number) => {
          if (money < cost) { showToast(t('alerts.notEnoughMoneyWithCost', { cost })); return; }
          if (!spendMoney(cost)) return;
          useGameStore.getState().addHeldItem(id);
        };
        // 보관함을 id별로 그룹화
        const invCounts = heldItemInventory.reduce<Record<string, number>>((m, id) => { m[id] = (m[id] ?? 0) + 1; return m; }, {});
        const equipped = getHeldItem(tower.heldItem);
        return (
          <ShopOverlay onClick={close}>
            <ShopModal onClick={e => e.stopPropagation()}>
              <ShopHeader>
                <h3><Emoji glyph={isClerk ? '🏪' : isScout ? '🎀' : '🎒'} size={16} /> {isClerk ? t('facility.shop') : isScout ? t('facility.contest') : t('facility.heldItemsTitle')}</h3>
                <ShopCloseBtn onClick={close}><Emoji glyph="❌" size={14} /></ShopCloseBtn>
              </ShopHeader>
              <ShopSub>
                <b>{tower.displayName}</b>
                {isClerk && <ShopGradeBadge>{tier > 0 ? t('facility.badgeOpen', { n: tier }) : t('facility.badgeWorking')}</ShopGradeBadge>}
                {isScout && <ShopGradeBadge>{tier > 0 ? t('facility.badgeContest', { n: tier }) : t('facility.badgeContestPrep')}</ShopGradeBadge>}
                <span style={{ marginLeft: 8, color: '#f0b840' }}><Emoji glyph="💰" size={13} /> {money}{t('common.money')}</span>
              </ShopSub>

              {/* 근무 회수 — 최고 등급(15웨이브)부터는 웨이브 사이에 언제든 뺄 수 있다 */}
              {(isClerk || isScout) && (
                waves >= WORK_FREE_WITHDRAW_WAVES
                  ? (
                    <WithdrawRow>
                      <span>{t('work.freeWithdrawNote')}</span>
                      <WithdrawBtn
                        disabled={isWaveActive}
                        onClick={() => {
                          if (isWaveActive) { showToast(t('work.withdrawBetweenWaves')); return; }
                          const res = useGameStore.getState().beginWorkWithdraw(tower.id);
                          if (!res.success && res.message) showToast(t(res.message));
                        }}
                      >
                        <Emoji glyph="🎒" size={13} /> {t('work.btnWithdraw')}
                      </WithdrawBtn>
                    </WithdrawRow>
                  )
                  : <ShopLockNote>{t('work.lockedUntilFree', { n: WORK_FREE_WITHDRAW_WAVES - waves })}</ShopLockNote>
              )}

              {/* 콘테스트 홀 상태 */}
              {isScout && (
                tier === 0
                  ? <ShopLockNote><Emoji glyph="🎀" size={13} /> {t('facility.contestPrepNote', { n: wavesToNextTier(waves) })}</ShopLockNote>
                  : <ShopGradeNote>{t('facility.contestActiveNote', { waves, tier })}</ShopGradeNote>
              )}

              {/* 상점 (점원만) */}
              {isClerk && (
                <>
                  {tier === 0 ? (
                    <ShopLockNote><Emoji glyph="🧹" size={13} /> {t('facility.shopLockNote', { n: wavesToNextTier(waves) })}</ShopLockNote>
                  ) : (
                    <ShopGradeNote>
                      {t('facility.shopGradeNote', { waves })}
                    </ShopGradeNote>
                  )}
                  {buyable.map(item => {
                    const poor = money < item.cost;
                    return (
                      <ShopItemRow key={item.id} $locked={poor}>
                        <span className="icon"><Emoji glyph={item.icon} size={20} /></span>
                        <div className="info">
                          <div className="name">{t(`heldItems.${item.id}.name`)} <span style={{ color: '#7e8da0', fontWeight: 'normal' }}>Lv.{item.grade}{item.consumable ? `·${t('facility.once')}` : ''}</span></div>
                          <div className="desc">{t(`heldItems.${item.id}.desc`)}</div>
                        </div>
                        <ShopBuyBtn $disabled={poor} onClick={() => buy(item.id, item.cost)}>{item.cost}{t('common.money')}</ShopBuyBtn>
                      </ShopItemRow>
                    );
                  })}
                </>
              )}

              {/* 지닌 도구 (장착/교체/회수) */}
              <ShopSectionTitle>{t('facility.equippedTitle')}</ShopSectionTitle>
              <ShopItemRow $owned={!!equipped}>
                <span className="icon">{equipped ? <Emoji glyph={equipped.icon} size={20} /> : '—'}</span>
                <div className="info">
                  <div className="name">{equipped ? heldName(equipped.id) : t('facility.noneEquipped')}</div>
                  <div className="desc">{equipped ? heldDesc(equipped.id) : t('facility.equipHint')}</div>
                </div>
                {equipped && (
                  <ShopGhostBtn disabled={!canEquip} style={{ opacity: canEquip ? 1 : 0.4 }}
                    onClick={() => canEquip && useGameStore.getState().unequipHeldItem(tower.id)}>{t('facility.withdraw')}</ShopGhostBtn>
                )}
              </ShopItemRow>

              <ShopSectionTitle>{t('facility.inventoryTitle')} {canEquip ? '' : t('facility.inventoryWaveOnly')}</ShopSectionTitle>
              {Object.keys(invCounts).length === 0 ? (
                <ShopGradeNote>{t('facility.inventoryEmpty')}</ShopGradeNote>
              ) : (
                Object.entries(invCounts).map(([id, n]) => {
                  const it = getHeldItem(id); if (!it) return null;
                  return (
                    <ShopItemRow key={id}>
                      <span className="icon"><Emoji glyph={it.icon} size={20} /></span>
                      <div className="info">
                        <div className="name">{heldName(it.id)} {n > 1 && <span style={{ color: '#7e8da0' }}>×{n}</span>}</div>
                        <div className="desc">{heldDesc(it.id)}</div>
                      </div>
                      <ShopBuyBtn $disabled={!canEquip} onClick={() => canEquip && useGameStore.getState().equipHeldItem(tower.id, id)}>
                        {tower.heldItem ? t('facility.swap') : t('facility.equip')}
                      </ShopBuyBtn>
                    </ShopItemRow>
                  );
                })
              )}
            </ShopModal>
          </ShopOverlay>
        );
      })()}
    </CanvasContainer>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────

const CanvasContainer = styled.div`
  width: 100%; height: 100%;
  position: relative;
  overflow: hidden;          /* [FIX] 960px Stage가 컨테이너 밖으로 넘치는 것을 방지 */
  touch-action: none;
`;

const EvolutionToast = styled.div`
  position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, rgba(155,89,182,0.95), rgba(142,68,173,0.95));
  padding: 8px 16px; border-radius: 12px; border: 2px solid rgba(155,89,182,0.6);
  box-shadow: 0 8px 24px rgba(155,89,182,0.6); z-index: 1000;
  animation: slideInDown 0.3s ease-out; color: #fff; font-size: 14px; font-weight: bold;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 8px;
  ${lMedia.phoneSm} { font-size: 12px; padding: 6px 12px; }
`;

const EvolutionToastButton = styled.button`
  background: rgba(255,255,255,0.2); border: none; border-radius: 50%;
  width: 20px; height: 20px; color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: bold; padding: 0; transition: background 0.2s;
  @media (hover: hover) { &:hover { background: rgba(255,255,255,0.3); } }
  ${lMedia.phoneSm} { width: 18px; height: 18px; font-size: 10px; }
`;

const Tooltip = styled.div`
  position: absolute;
  background: rgba(22,28,42,0.92);
  border: 1px solid rgba(120,150,190,0.28); border-radius: 10px; padding: 7px 11px;
  color: #e8edf3; font-size: 10px; font-weight: 400;
  box-shadow: 0 6px 16px rgba(0,0,0,0.35); pointer-events: none; z-index: 1001;
  min-width: 160px; max-width: 200px;
  ${lMedia.phoneSm} { font-size: 9px; padding: 5px 9px; min-width: 140px; }
`;

const TooltipTitle = styled.div`
  margin-bottom: 3px; color: #4cafff; font-size: 11px;
  ${lMedia.phoneSm} { font-size: 10px; }
`;
const TooltipTypes = styled.div`
  font-size: 9px; color: #a8b8c8; margin-bottom: 3px; display: flex; gap: 3px; align-items: center;
  ${lMedia.phoneSm} { font-size: 8px; }
`;
const TooltipTypeIcon = styled.img`height: 10px; object-fit: contain; ${lMedia.phoneSm} { height: 9px; }`;
const TooltipStats = styled.div`font-size: 9px; line-height: 1.4; ${lMedia.phoneSm} { font-size: 8px; }`;
const TooltipStatRow = styled.div``;
const TooltipMove = styled.div`margin-top: 3px; color: #f39c12; ${lMedia.phoneSm} { font-size: 8px; }`;

// ─── 프렌들리숍(지닌 도구) 모달 ──────────────────────────────────────────────
const ShopOverlay = styled.div`
  position: absolute; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1200;
`;
const ShopModal = styled.div`
  width: min(440px, 92%); max-height: 86%; overflow-y: auto;
  /* 공유 modal.styles 디자인 토큰에 맞춤 (배경 그라디언트 + 상단 골드 액센트 바) */
  background: linear-gradient(160deg, #0d1117 0%, #080c14 100%);
  border: 1px solid rgba(255,255,255,0.10); border-top: 3px solid #FFD700;
  border-radius: 16px;
  padding: 16px 18px; color: #e8edf3;
  box-shadow: 0 32px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06);

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
`;
const ShopHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
  h3 { margin: 0; font-size: 16px; color: #f0b840; }
`;
const ShopSub = styled.div`font-size: 11px; color: #9fb0c4; margin-bottom: 12px;`;
const ShopGradeBadge = styled.span`
  display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px;
  background: rgba(224,160,48,0.18); color: #f0b840; font-size: 11px; font-weight: bold;
`;
const ShopItemRow = styled.div<{ $owned?: boolean; $locked?: boolean }>`
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 7px;
  border-radius: 10px; background: rgba(255,255,255,0.04);
  border: 1px solid ${p => (p.$owned ? 'rgba(46,204,113,0.6)' : 'rgba(255,255,255,0.07)')};
  opacity: ${p => (p.$locked ? 0.45 : 1)};
  .icon { font-size: 22px; width: 28px; text-align: center; }
  .info { flex: 1; }
  .name { font-size: 13px; font-weight: bold; }
  .desc { font-size: 10px; color: #9fb0c4; line-height: 1.3; }
`;
const ShopBuyBtn = styled.button<{ $disabled?: boolean }>`
  border: none; border-radius: 8px; padding: 7px 12px; font-weight: bold; font-size: 12px;
  cursor: ${p => (p.$disabled ? 'not-allowed' : 'pointer')};
  background: ${p => (p.$disabled ? 'rgba(120,130,140,0.3)' : 'linear-gradient(135deg,#f0b840,#d4941f)')};
  color: ${p => (p.$disabled ? '#8a96a4' : '#1a1206')};
  white-space: nowrap;
`;
const ShopCloseBtn = styled.button`
  /* 공유 ModalCloseBtn과 동일한 룩(hover 시 빨강 틴트) */
  width: 32px; height: 32px; flex-shrink: 0;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10); border-radius: 8px;
  color: rgba(255,255,255,0.45); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  @media (hover: hover) {
    &:hover { background: rgba(220,60,60,0.22); border-color: rgba(220,60,60,0.40); color: #fff; }
  }
`;
const ShopGradeNote = styled.div`
  font-size: 10px; color: #7e8da0; margin: 6px 0 12px; line-height: 1.4;
`;
const ShopSectionTitle = styled.div`
  font-size: 12px; font-weight: bold; color: #cdd7e2; margin: 14px 0 8px;
  border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;
`;
const ShopGhostBtn = styled.button`
  border: 1px solid rgba(255,255,255,0.18); background: transparent; color: #cdd7e2;
  border-radius: 8px; padding: 6px 10px; font-size: 11px; cursor: pointer; white-space: nowrap;
`;
const ShopLockNote = styled.div`
  font-size: 12px; color: #ffb0b0; background: rgba(192,57,43,0.12);
  border: 1px solid rgba(192,57,43,0.4); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px;
`;
// 근무 회수(최고 등급 해금 후) 행
const WithdrawRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-size: 11.5px; color: #cde6c0; line-height: 1.45;
  background: rgba(46,204,113,0.10); border: 1px solid rgba(46,204,113,0.35);
  border-radius: 8px; padding: 8px 10px; margin-bottom: 10px;
`;
const WithdrawBtn = styled.button<{ disabled?: boolean }>`
  flex-shrink: 0;
  border: 1px solid rgba(46,204,113,0.55); background: rgba(46,204,113,0.18); color: #eafff0;
  border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: bold; white-space: nowrap;
  cursor: ${p => p.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${p => p.disabled ? 0.45 : 1};
  display: flex; align-items: center; gap: 5px;
  @media (hover: hover) { &:hover { filter: ${p => p.disabled ? 'none' : 'brightness(1.15)'}; } }
`;

const StageWrapper = styled.div`
  /* [FIX] position:absolute → 레이아웃 흐름에서 제거, 960px 고정 크기가 부모를 밀지 않음 */
  position: absolute;
  top: 16px; left: 50%;
  transform-origin: center top;
  border: 2px solid #1a242f; border-radius: 8px; overflow: hidden;
  box-shadow: 0 8px 16px rgba(0,0,0,0.2); transition: transform 0.3s ease;
  ${lMedia.phoneSm} { border: 1px solid #1a242f; border-radius: 4px; }
`;

// 최초 달성: 2.5s 슬라이드인→유지→페이드아웃 (작고 빠름)
const achSlideIn = keyframes`0%{opacity:0;transform:translateX(40px);}12%{opacity:1;transform:translateX(0);}72%{opacity:1;transform:translateX(0);}100%{opacity:0;transform:translateX(20px);}`;
// 반복 달성: 1.5s 빠른 페이드
const achSlideInRepeat = keyframes`0%{opacity:0;transform:translateX(16px);}12%{opacity:0.6;transform:translateX(0);}72%{opacity:0.6;}100%{opacity:0;}`;

const AchievementToastPill = styled.div<{ $color: string; $first: boolean }>`
  position: absolute; top: 10px; right: 10px; z-index: 1002;
  display: flex; align-items: center; gap: 6px;
  padding: ${p => p.$first ? '7px 14px' : '5px 11px'};
  border-radius: 20px;
  background: rgba(55,55,70,0.92);
  border: 1px solid ${p => p.$color}${p => p.$first ? '99' : '55'};
  font-size: ${p => p.$first ? '12px' : '11px'};
  font-weight: 700;
  color: rgba(255,255,255,${p => p.$first ? '0.92' : '0.65'});
  animation: ${p => p.$first ? achSlideIn : achSlideInRepeat} ${p => p.$first ? '2.5s' : '1.5s'} ease forwards;
  pointer-events: none;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.5);
`;

const AchPillName = styled.span<{ $first: boolean }>`color:rgba(255,255,255,${p => p.$first ? '0.88' : '0.55'});overflow:hidden;text-overflow:ellipsis;`;
const AchPillAP = styled.span<{ $color: string }>`color:${p => p.$color};font-size:10px;font-weight:700;flex-shrink:0;opacity:0.85;`;