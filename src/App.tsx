// src/App.tsx
// ──────────────────────────────────────────────────────────────────
// [V5-FIX-APP-1] handleLeaveGame에서 cleanupGame(immediate=false) 호출
//   - 게임 진행 중 의도적 나가기 시 leaveRoom만 호출하면 다른 플레이어가 남아있을 수 있어
//     방을 즉시 삭제하면 안 됨 → leaveRoom이 알아서 처리
//   - 추가로 방에 본인만 남아 있으면 leaveRoom이 deleteRoom 호출
//
// [V5-FIX-APP-2] 멀티플레이어 게임 종료 시 finalizeGame 트리거
//   - 마지막 생존자가 결정되면 GameLayout이 게임오버 모달을 띄움
//   - 모달 닫힘 시 finalizeGame 호출하면 레이팅 업데이트 + finished 표기
//   - 5분 후 cleanupExpiredRooms가 자동으로 방 삭제

import { useState, useEffect, useCallback, useRef } from "react";
import styled, { keyframes } from "styled-components";
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { authService } from "./services/AuthService";
import { User } from "./types/multiplayer";
import { useGameStore } from "./store/gameStore";
import { multiplayerService } from "./services/MultiplayerService";
import { saveService } from "./services/SaveService";
import { pokeAPI } from './api/pokeapi';
import { getMapById } from './data/maps';
import { useTranslation } from './i18n';

import { Emoji } from "./components/shared/Emoji";
import { LoginScreen } from "./components/auth/LoginScreen";
import { MainMenu } from "./components/menu/MainMenu";
import { MultiplayerLobby } from "./components/multiplayer/MultiplayerLobby";
import { MapSelector } from "./components/ui/MapSelector";
import { GameLayout } from "./components/game/GameLayout";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { StorySelector } from './components/story/StorySelector';
import { CardLabView } from "./components/cards/CardLabView";
import { QuizView } from "./components/quiz/QuizView";
import { FloatingSettings } from "./components/ui/FloatingSettings";

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;

const PreloadingOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at center, rgba(0,0,0,0.85), rgba(0,0,0,0.95));
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  animation: ${fadeIn} 0.3s ease-out;
  gap: 24px;
`;

const LoadingTitle = styled.h1`
  font-size: 24px;
  color: #fff;
  text-shadow: 0 0 15px rgba(255,255,255,0.7);
  margin: 0;
`;

const ProgressBarOuter = styled.div`
  width: 320px;
  height: 12px;
  background: rgba(255,255,255,0.15);
  border-radius: 6px;
  overflow: hidden;
  max-width: 90vw;
`;

const ProgressBarInner = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${p => p.$pct}%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  border-radius: 6px;
  transition: width 0.2s ease;
`;

const ProgressText = styled.p`
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  margin: 0;
`;

function preloadMapBackground(mapId: string): Promise<void> {
  return new Promise((resolve) => {
    const map = getMapById(mapId);
    if (!map?.backgroundImage) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => {
      console.warn(`Map background image failed to load: ${map.backgroundImage}`);
      resolve();
    };
    img.src = map.backgroundImage;
  });
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isGamePreloading, setIsGamePreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 1025 });
  const [loadingStage, setLoadingStage] = useState<'pokemon' | 'map' | 'done'>('pokemon');

  const navigate = useNavigate();
  const location = useLocation();
  const resetGame = useGameStore((state) => state.reset);
  const { t } = useTranslation();

  // [QUOTA-FIX] 예전엔 deps에 location.pathname이 있어 '라우트 이동마다' 재구독 → 즉시 콜백이
  //   syncAchievementsFromDB(Firestore 전체 읽기 + 무조건 bulk 쓰기)를 매번 실행, 무료 쿼터를 빠르게 소모했음.
  //   구독은 1회만 하고, 실제 uid가 바뀔 때만 동기화한다. 로그인 리다이렉트는 window.location으로 현재값 조회.
  const lastSyncedUidRef = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((authedUser) => {
      setUser(authedUser);
      setIsAuthLoading(false);
      if (authedUser) {
        // [FREE-TIER] 오프라인 모드는 Firestore 동기화 시도하지 않음. 같은 uid 반복 동기화도 생략.
        if (!authService.isOfflineMode() && lastSyncedUidRef.current !== authedUser.uid) {
          lastSyncedUidRef.current = authedUser.uid;
          saveService.syncAchievementsFromDB().catch(err =>
            console.warn('[App] Failed to sync achievements:', err)
          );
        }
        if (window.location.pathname === '/login') {
          navigate('/');
        }
      } else {
        lastSyncedUidRef.current = null;
      }
    });
    return unsubscribe;
  }, [navigate]);

  const handlePreloadAndNavigate = useCallback(
    async (mapId: string, gameMode: 'single' | 'multi', storyData?: object) => {
      resetGame();
      useGameStore.getState().setMap(mapId);

      if (gameMode === 'single') {
        multiplayerService.clearCurrentRoom();
      }

      setIsGamePreloading(true);
      setPreloadProgress({ loaded: 0, total: 1025 });
      setLoadingStage('pokemon');

      try {
        await pokeAPI.preloadRarities((loaded, total) => {
          setPreloadProgress({ loaded, total });
        });

        setLoadingStage('map');
        await preloadMapBackground(mapId);

        setLoadingStage('done');
        navigate('/game', { state: storyData ? { ...storyData, mode: 'story' } : undefined });
        setIsGamePreloading(false);
      } catch (err) {
        console.error('Failed to preload game data', err);
        setIsGamePreloading(false);
        // 네트워크 일시 장애 대응: 새로고침 없이 즉시 재시도 가능하게
        if (window.confirm(t('loading.retryConfirm'))) {
          return handlePreloadAndNavigate(mapId, gameMode, storyData);
        }
      }
    },
    [resetGame, navigate, t]
  );

  /**
   * [V5-FIX-APP-1] 게임에서 나갈 때 — 멀티는 leaveRoom 호출
   *   leaveRoom이 자동으로:
   *     - 본인을 players에서 제거
   *     - 방장이 떠나면 비AI 우선 호스트 이전
   *     - 본인이 마지막이면 방 삭제 (모든 관련 데이터 정리)
   *   따라서 별도 cleanupGame 호출 불필요. 단, 게임이 finished 상태일 때만
   *   서비스가 알아서 cleanupGame을 트리거.
   */
  const handleLeaveGame = useCallback(async () => {
    const multiRoomId = multiplayerService.getCurrentRoomId();
    resetGame();
    if (multiRoomId) {
      try {
        await multiplayerService.leaveRoom(multiRoomId);
      } catch (err) {
        console.warn('[App] leaveRoom failed:', err);
      }
      multiplayerService.clearCurrentRoom();
      navigate('/lobby');
    } else {
      multiplayerService.clearCurrentRoom();
      navigate('/map-select');
    }
  }, [resetGame, navigate]);


  if (isAuthLoading) {
    return (
      <PreloadingOverlay>
        <LoadingTitle>{t('loading.checkingUser')}</LoadingTitle>
      </PreloadingOverlay>
    );
  }

  if (isGamePreloading) {
    const pct = preloadProgress.total > 0
      ? Math.floor((preloadProgress.loaded / preloadProgress.total) * 100)
      : 0;

    const almostDone = loadingStage !== 'map' && pct >= 100;
    const stageText = loadingStage === 'map'
      ? t('loading.map')
      : almostDone
        ? t('loading.almostDone')
        : t('loading.pokemon');

    return (
      <PreloadingOverlay>
        <LoadingTitle>{stageText}{almostDone && <> <Emoji glyph="✨" size={18} /></>}</LoadingTitle>
        <ProgressBarOuter>
          <ProgressBarInner $pct={loadingStage === 'map' ? 100 : pct} />
        </ProgressBarOuter>
        <ProgressText>
          {loadingStage === 'map'
            ? t('loading.mapDetail')
            : `${preloadProgress.loaded} / ${preloadProgress.total} (${pct}%)`}
        </ProgressText>
      </PreloadingOverlay>
    );
  }

  return (
    <>
    <Routes>
      <Route path="/login" element={<LoginScreen />} />

      <Route path="/" element={
        <ProtectedRoute>
          <MainMenu />
        </ProtectedRoute>
      } />

      <Route path="/lobby" element={
        <ProtectedRoute>
          <MultiplayerLobby
            onBack={() => navigate('/')}
            onStartGame={(_roomId, mapId) => {
              handlePreloadAndNavigate(mapId, 'multi');
            }}
          />
        </ProtectedRoute>
      } />

      <Route path="/map-select" element={
        <ProtectedRoute>
          <MapSelector
            onSelect={(mapId) => {
              handlePreloadAndNavigate(mapId, 'single');
            }}
          />
        </ProtectedRoute>
      } />

      <Route path="/story" element={
        <ProtectedRoute>
          <StorySelector
            onStart={(data) => {
              handlePreloadAndNavigate(data.mapId, 'single', data);
            }}
          />
        </ProtectedRoute>
      } />

      <Route path="/cards" element={
        <ProtectedRoute>
          <CardLabView />
        </ProtectedRoute>
      } />

      <Route path="/quiz" element={
        <ProtectedRoute>
          <QuizView />
        </ProtectedRoute>
      } />

      <Route path="/game" element={
        <ProtectedRoute>
          <GameLayout onLeaveGame={handleLeaveGame} />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
    {location.pathname !== '/game' && <FloatingSettings />}
    </>
  );
}

export default App;