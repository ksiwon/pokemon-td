// src/components/multiplayer/MultiplayerLobby.tsx
// [V5-FIX-LB-1] 나가기 확인 모달 — 게임 진행 중 실수로 나가기 방지
// [V5-FIX-LB-2] AI가 호스트가 되는 경우에 대한 안전 장치

import { useState, useEffect, useRef, Fragment } from 'react';
import styled, { keyframes } from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { media, lMedia } from '../../utils/responsive.utils';
import { multiplayerService, MP_ERROR } from '../../services/MultiplayerService';
import { Room, AIDifficulty } from '../../types/multiplayer';
import { MAPS, mapThumbnailById } from '../../data/maps';
import { authService } from '../../services/AuthService';
import { useTranslation } from '../../i18n';
import { AchievementsPanel } from '../modals/Achievements';
import { HallOfFame } from '../modals/HallOfFame';
import { Rankings } from '../modals/Rankings';
import { showToast } from '../shared/Toast';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onStartGame: (roomId: string, mapId: string) => void;
}

const DIFF_META: Record<string, { label: string; color: string }> = {
  easiest: { label: 'EASIEST', color: '#94a3b8' },
  easy:    { label: 'EASY',    color: '#4ade80' },
  medium:  { label: 'MEDIUM',  color: '#60a5fa' },
  hard:    { label: 'HARD',    color: '#fb923c' },
  expert:  { label: 'EXPERT',  color: '#f87171' },
};

export const MultiplayerLobby = ({ onBack, onStartGame }: MultiplayerLobbyProps) => {
  const { t } = useTranslation();
  const [view, setView] = useState<'list' | 'create' | 'room'>('list');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedMap, setSelectedMap] = useState(MAPS[0].id);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isCheckingRejoin, setIsCheckingRejoin] = useState(true);
  const [rejoinableRoom, setRejoinableRoom] = useState<Room | null>(null);
  /** 방 목록 단발 조회 트리거(새로고침 버튼·입장 실패 시 증가). */
  const [roomsRefreshTick, setRoomsRefreshTick] = useState(0);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [kickConfirm, setKickConfirm] = useState<{ open: boolean; player: import('../../types/multiplayer').RoomPlayer | null }>({ open: false, player: null });
  const startingRef = useRef(false);
  const user = authService.getCurrentUser();

  const [showAchievements, setShowAchievements] = useState(false);
  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [showRankings, setShowRankings] = useState(false);

  // [FREE-TIER] 오프라인 모드 직접 접근 방어 — RTDB 연결 시도 전에 즉시 복귀
  useEffect(() => {
    if (authService.isOfflineMode()) {
      showToast(t('mainMenu.offlineMultiBlocked'));
      onBack();
    }
    // 최초 1회만 검사
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // [FREE-TIER] 오프라인 모드면 RTDB 연결/구독을 시작하지 않음
    if (authService.isOfflineMode()) { setIsCheckingRejoin(false); return; }

    // [FREE-TIER] 재접속 확인은 '그 순간만' 연결하면 된다 → withRtdb로 잡았다 반납.
    //   방 목록만 구경하는 사람이 동시 연결 슬롯을 물고 있지 않게 하는 게 핵심.
    const checkRejoin = async () => {
      const savedRoomId = multiplayerService.getCurrentRoomId();
      if (savedRoomId) {
        try {
          const { room, canRejoin } = await multiplayerService.withRtdb(
            () => multiplayerService.rejoinRoom(savedRoomId)
          );
          if (canRejoin && room) setRejoinableRoom(room);
          else multiplayerService.clearCurrentRoom();
        } catch { multiplayerService.clearCurrentRoom(); }
      }
      setIsCheckingRejoin(false);
    };
    checkRejoin();
  }, []);

  // [FREE-TIER] 방 목록은 실시간 구독이 아니라 **단발 조회**다(새로고침 버튼으로 갱신).
  //   예전엔 onValue 구독이라 목록만 보는 사람도 연결을 계속 물고 있었다.
  useEffect(() => {
    if (authService.isOfflineMode() || isCheckingRejoin || rejoinableRoom || view !== 'list') return;
    let alive = true;
    setRoomsLoading(true);
    multiplayerService.withRtdb(() => multiplayerService.fetchWaitingRooms())
      .then(r => { if (alive) setRooms(r); })
      .catch(() => { if (alive) setRooms([]); })
      .finally(() => { if (alive) setRoomsLoading(false); });
    return () => { alive = false; };
  }, [isCheckingRejoin, rejoinableRoom, view, roomsRefreshTick]);

  // 방 안에 있는 동안에만 연결을 유지한다 — 여기가 '실제 플레이어'다.
  useEffect(() => {
    if (authService.isOfflineMode() || view !== 'room') return;
    multiplayerService.initForMultiplayer();
    return () => { multiplayerService.teardownMultiplayer(); };
  }, [view]);

  useEffect(() => {
    const roomId = multiplayerService.getCurrentRoomId();
    if (roomId && view === 'room' && !startingRef.current) {
      const unsubscribe = multiplayerService.onRoomUpdate(roomId, (room) => {
        if (!room) { setView('list'); setCurrentRoom(null); return; }

        // 강퇴 감지: 방이 존재하는데 내 userId가 players에 없으면 강퇴됨
        const stillInRoom = room.players.some(p => p.userId === user?.uid);
        if (!stillInRoom && room.status === 'waiting') {
          const wasKicked = room.kickedUserIds?.includes(user?.uid ?? '');
          multiplayerService.clearCurrentRoom();
          setView('list');
          setCurrentRoom(null);
          if (wasKicked) {
            showToast(t('lobby.kicked'));
          }
          return;
        }

        setCurrentRoom(room);
        if ((room.status === 'starting' || room.status === 'playing') && !startingRef.current) {
          startingRef.current = true;
          onStartGame(room.id, room.mapId);
        }
      });
      return unsubscribe;
    }
  }, [view, onStartGame]);

  // 방을 만들거나 들어가는 순간엔 연결이 필요하다. withRtdb로 잡되, 성공하면 currentRoomId가
  // 세팅돼 있어 반납이 무시되므로(=방에 들어간 사람) 연결이 그대로 방 화면으로 이어진다.
  const handleCreateRoom = async () => {
    try {
      const selectedMapData = MAPS.find(m => m.id === selectedMap);
      if (!selectedMapData) throw new Error('Invalid map');
      const room = await multiplayerService.withRtdb(async () => {
        const roomId = await multiplayerService.createRoom(selectedMap, selectedMapData.name);
        return multiplayerService.rejoinRoom(roomId);
      });
      setCurrentRoom(room.room); setView('room');
    } catch (err: any) { showToast(errText(err)); setRoomsRefreshTick(n => n + 1); }
  };

  const handleJoinRoom = async (roomId: string) => {
    try {
      const room = await multiplayerService.withRtdb(async () => {
        await multiplayerService.joinRoom(roomId);
        return multiplayerService.rejoinRoom(roomId);
      });
      setCurrentRoom(room.room); setView('room');
    } catch (err: any) { showToast(errText(err)); setRoomsRefreshTick(n => n + 1); }
  };

  const handleLeaveRoomConfirmed = async () => {
    setLeaveConfirmOpen(false);
    if (currentRoom) {
      await multiplayerService.leaveRoom(currentRoom.id);
      setView('list'); setCurrentRoom(null);
    }
  };

  const handleAddAI = async (difficulty: AIDifficulty) => {
    if (currentRoom) {
      try { await multiplayerService.addAI(currentRoom.id, difficulty); }
      catch (err: any) { showToast(errText(err)); }
    }
  };

  const handleToggleReady = async () => {
    if (currentRoom) await multiplayerService.toggleReady(currentRoom.id);
  };

  const handleStartGame = async () => {
    if (currentRoom) {
      try { await multiplayerService.startGame(currentRoom.id); }
      catch (err: any) { showToast(errText(err)); }
    }
  };

  const handleKickPlayer = async () => {
    if (!currentRoom || !kickConfirm.player) return;
    setKickConfirm({ open: false, player: null });
    try {
      await multiplayerService.kickPlayer(currentRoom.id, kickConfirm.player.userId);
    } catch (err: any) {
      showToast(errText(err));
    }
  };

  const handleRejoin = () => {
    if (!rejoinableRoom) return;
    if (rejoinableRoom.status === 'playing' || rejoinableRoom.status === 'starting') {
      onStartGame(rejoinableRoom.id, rejoinableRoom.mapId);
    } else {
      setCurrentRoom(rejoinableRoom); setView('room');
    }
    setRejoinableRoom(null);
  };

  const handleAbandon = async () => {
    if (!rejoinableRoom) return;
    try { await multiplayerService.withRtdb(() => multiplayerService.leaveRoom(rejoinableRoom.id)); }
    catch { multiplayerService.clearCurrentRoom(); }
    setRejoinableRoom(null); setView('list');
  };

  const mapLabel = (map: { id: string; name: string }) =>
    t(`mapData.${map.id}.name`) !== `mapData.${map.id}.name`
      ? t(`mapData.${map.id}.name`) : map.name;

  // 방 이름은 RTDB에 "○○의 방"으로 저장돼 있다(구버전 클라이언트가 만든 방 포함).
  // 저장값을 그대로 쓰지 않고 hostName으로 매번 다시 만들어 현재 언어로 보여준다.
  const roomLabel = (room: { name: string; hostName?: string }) =>
    room.hostName ? t('lobby.roomOf', { name: room.hostName }) : room.name;

  // 서비스가 던진 오류 코드를 문구로 바꾼다. 모르는 코드면 원본 메시지를 그대로 보여준다.
  const errText = (err: any): string => {
    const code = String(err?.message ?? '');
    if (code === MP_ERROR.ROOM_LIMIT) return t('lobby.errRoomLimit');
    return code;
  };

  if (isCheckingRejoin) {
    return <Root><LoadingScreen>{t('lobby.checkingRejoin')}</LoadingScreen></Root>;
  }

  if (rejoinableRoom) {
    return <RejoinPrompt roomName={roomLabel(rejoinableRoom)} onRejoin={handleRejoin} onAbandon={handleAbandon} />;
  }

  // ── Room list view ──────────────────────────────────────────────────────────
  if (view === 'list') return (
    <>
      <Root>
        <PageHeader>
          <BackBtn onClick={onBack}>←<span className="back-text"> {t('lobby.back')}</span></BackBtn>
          <PageTitle>{t('lobby.title')}</PageTitle>
          <HeaderActions>
            <ActionBtn onClick={() => setShowAchievements(true)}><Emoji glyph="🏅" size={16} /></ActionBtn>
            <ActionBtn onClick={() => setShowHallOfFame(true)}><Emoji glyph="🏆" size={16} /></ActionBtn>
            <ActionBtn onClick={() => setShowRankings(true)}><Emoji glyph="📊" size={16} /></ActionBtn>
            {/* 목록이 단발 조회로 바뀌어(연결 절약) 새로고침 버튼이 갱신 수단이다.
                ActionBtn은 모바일에서 숨겨지므로 전용 버튼을 쓴다 — 갱신 수단이 사라지면 안 된다. */}
            <RefreshBtn
              onClick={() => setRoomsRefreshTick(n => n + 1)}
              disabled={roomsLoading}
              title={t('lobby.refresh')}
            >
              <Emoji glyph="🔄" size={16} />
            </RefreshBtn>
            <CreateRoomBtn onClick={() => setView('create')}>+ {t('lobby.createRoom')}</CreateRoomBtn>
          </HeaderActions>
        </PageHeader>

        <Content>
          {rooms.length === 0 ? (
            <EmptyState>
              <EmptyIcon><Emoji glyph="🎮" size={28} /></EmptyIcon>
              <EmptyTitle>{t('lobby.emptyList')}</EmptyTitle>
              <EmptyHint>{t('lobby.emptyHintCreate')}</EmptyHint>
              <EmptyCreateBtn onClick={() => setView('create')}>+ {t('lobby.createRoom')}</EmptyCreateBtn>
            </EmptyState>
          ) : (
            <RoomTable>
              <RoomTableHead>
                <RTH style={{flex:2}}>{t('lobby.map')}</RTH>
                <RTH>{t('lobby.host')}</RTH>
                <RTH style={{textAlign:'center'}}>{t('lobby.players')}</RTH>
                <RTH style={{width:100}} />
              </RoomTableHead>
              {rooms.map(room => (
                <RoomRow key={room.id}>
                  <RoomMapCell>
                    <RoomMapThumb src={mapThumbnailById(room.mapId)} alt="" />
                    <RoomMapInfo>
                      <RoomName>{roomLabel(room)}</RoomName>
                      <RoomMapName>{mapLabel(room)}</RoomMapName>
                    </RoomMapInfo>
                  </RoomMapCell>
                  <RoomCell>{room.hostName}</RoomCell>
                  <RoomCell style={{textAlign:'center'}}>
                    <PlayerCount $full={room.players.length >= room.maxPlayers}>
                      {room.players.length}/{room.maxPlayers}
                    </PlayerCount>
                  </RoomCell>
                  <RoomCell style={{width:100}}>
                    <JoinBtn
                      onClick={() => handleJoinRoom(room.id)}
                      disabled={room.players.length >= room.maxPlayers}
                    >
                      {t('lobby.join')}
                    </JoinBtn>
                  </RoomCell>
                </RoomRow>
              ))}
            </RoomTable>
          )}
        </Content>
      </Root>
      {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
      {showHallOfFame && <HallOfFame onClose={() => setShowHallOfFame(false)} />}
      {showRankings && <Rankings onClose={() => setShowRankings(false)} />}
    </>
  );

  // ── Create room view ────────────────────────────────────────────────────────
  if (view === 'create') return (
    <>
      <Root>
        <PageHeader>
          <BackBtn onClick={() => setView('list')}>←<span className="back-text"> {t('lobby.back')}</span></BackBtn>
          <PageTitle>{t('lobby.createTitle')}</PageTitle>
          <HeaderActions>
            <ActionBtn onClick={() => setShowAchievements(true)}><Emoji glyph="🏅" size={16} /></ActionBtn>
            <ActionBtn onClick={() => setShowHallOfFame(true)}><Emoji glyph="🏆" size={16} /></ActionBtn>
            <ActionBtn onClick={() => setShowRankings(true)}><Emoji glyph="📊" size={16} /></ActionBtn>
          </HeaderActions>
        </PageHeader>
        <Content>
          <CreateSection>
            <SectionLabel>{t('lobby.selectMap')}</SectionLabel>
            <MapPickGrid>
              {MAPS.map(map => {
                const meta = DIFF_META[map.difficulty] ?? { label: map.difficulty, color: '#fff' };
                const isSelected = selectedMap === map.id;
                return (
                  <MapPickCard
                    key={map.id}
                    $selected={isSelected}
                    $color={meta.color}
                    $img={map.backgroundImage ?? ""}
                    onClick={() => setSelectedMap(map.id)}
                  >
                    <MapPickOverlay $selected={isSelected} $color={meta.color} />
                    <MapPickBadge $color={meta.color}>{meta.label}</MapPickBadge>
                    <MapPickName>{mapLabel(map)}</MapPickName>
                    {isSelected && <MapPickCheck>✓</MapPickCheck>}
                  </MapPickCard>
                );
              })}
            </MapPickGrid>
            <ConfirmCreateBtn onClick={handleCreateRoom}>{t('lobby.createRoomAction')}</ConfirmCreateBtn>
          </CreateSection>
        </Content>
      </Root>
      {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
      {showHallOfFame && <HallOfFame onClose={() => setShowHallOfFame(false)} />}
      {showRankings && <Rankings onClose={() => setShowRankings(false)} />}
    </>
  );

  // ── Room view ───────────────────────────────────────────────────────────────
  if (view === 'room' && currentRoom) {
    const isHost = currentRoom.hostId === user?.uid;
    const currentPlayer = currentRoom.players.find(p => p.userId === user?.uid);
    const allReady = currentRoom.players.every(p => p.isReady);
    const mapInfo = MAPS.find(m => m.id === currentRoom.mapId);
    const mapMeta = DIFF_META[mapInfo?.difficulty ?? ''] ?? { label: '', color: '#fff' };

    return (
      <>
        <Root>
          <PageHeader>
            <BackBtn onClick={() => setLeaveConfirmOpen(true)}>←<span className="back-text"> {t('lobby.leave')}</span></BackBtn>
            <PageTitle>{currentRoom.name}</PageTitle>
            <HeaderActions>
              <ActionBtn onClick={() => setShowAchievements(true)}><Emoji glyph="🏅" size={16} /></ActionBtn>
              <ActionBtn onClick={() => setShowHallOfFame(true)}><Emoji glyph="🏆" size={16} /></ActionBtn>
              <ActionBtn onClick={() => setShowRankings(true)}><Emoji glyph="📊" size={16} /></ActionBtn>
            </HeaderActions>
          </PageHeader>

          <Content>
            <RoomLayout>
              {/* Map info */}
              <RoomMapPanel>
                <RoomMapBig src={mapThumbnailById(currentRoom.mapId)} alt="" />
                <RoomMapDetails>
                  <RoomMapBadge $color={mapMeta.color}>{mapMeta.label}</RoomMapBadge>
                  <RoomMapTitle>
                    {t(`mapData.${currentRoom.mapId}.name`) !== `mapData.${currentRoom.mapId}.name`
                      ? t(`mapData.${currentRoom.mapId}.name`) : currentRoom.mapName}
                  </RoomMapTitle>
                  <PlayerCountBig>
                    {t('lobby.playersCount', { cur: currentRoom.players.length, max: currentRoom.maxPlayers })}
                  </PlayerCountBig>
                </RoomMapDetails>
              </RoomMapPanel>

              {/* Players */}
              <RoomPlayersArea>
                <SectionLabel>
                  {t('lobby.players')} ({currentRoom.players.length}/{currentRoom.maxPlayers})
                </SectionLabel>
                <PlayerGrid>
                  {currentRoom.players.map(p => (
                    <PlayerCard key={p.userId} $ready={p.isReady}>
                      <PlayerAvatar>{(p.userName||'?').charAt(0).toUpperCase()}</PlayerAvatar>
                      <PlayerInfo>
                        <PlayerNameRow>
                          {p.userName}
                          {p.userId === currentRoom.hostId && <HostBadge><Emoji glyph="👑" size={11} /> HOST</HostBadge>}
                          {p.isAI && <AIBadge><Emoji glyph="🤖" size={11} /> AI</AIBadge>}
                        </PlayerNameRow>
                        <PlayerRatingRow>Rating {p.rating}</PlayerRatingRow>
                      </PlayerInfo>
                      <ReadyIndicator $ready={p.isReady}>
                        {p.isReady ? '✓ READY' : '...'}
                      </ReadyIndicator>
                      {/* 강퇴 버튼: 호스트만, 자기 자신 제외, 게임 시작 전만 */}
                      {isHost && p.userId !== user?.uid && (
                        <KickBtn
                          title={t('lobby.kickBtn')}
                          onClick={() => setKickConfirm({ open: true, player: p })}
                        >
                          ✕
                        </KickBtn>
                      )}
                    </PlayerCard>
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: currentRoom.maxPlayers - currentRoom.players.length }).map((_, i) => (
                    <EmptySlot key={`empty-${i}`}>{t('lobby.emptySlot')}</EmptySlot>
                  ))}
                </PlayerGrid>

                {/* AI buttons */}
                {isHost && currentRoom.players.length < currentRoom.maxPlayers && (
                  <AISection>
                    <SectionLabel>{t('lobby.addAI')}</SectionLabel>
                    <AIBtnRow>
                      {(['easy','medium','hard'] as AIDifficulty[]).map(d => (
                        <AIAddBtn key={d} onClick={() => handleAddAI(d)}>
                          + {d.charAt(0).toUpperCase() + d.slice(1)} AI
                        </AIAddBtn>
                      ))}
                    </AIBtnRow>
                  </AISection>
                )}

                {/* Action buttons */}
                <ActionRow>
                  {!isHost && (
                    <ToggleReadyBtn
                      $ready={currentPlayer?.isReady || false}
                      onClick={handleToggleReady}
                    >
                      {currentPlayer?.isReady ? t('lobby.btnReadyCancel') : t('lobby.btnReady')}
                    </ToggleReadyBtn>
                  )}
                  {isHost && (
                    <StartGameBtn
                      onClick={handleStartGame}
                      disabled={!allReady || currentRoom.players.length < 2}
                    >
                      {t('lobby.btnStart')}
                    </StartGameBtn>
                  )}
                </ActionRow>
              </RoomPlayersArea>
            </RoomLayout>
          </Content>
        </Root>

        {/* Leave confirm */}
        {leaveConfirmOpen && (
          <ModalOverlay onClick={() => setLeaveConfirmOpen(false)}>
            <ConfirmModal onClick={e => e.stopPropagation()}>
              <ConfirmIcon><Emoji glyph="⚠" size={24} /></ConfirmIcon>
              <ConfirmTitle>{t('lobby.confirmLeaveTitle')}</ConfirmTitle>
              <ConfirmText>
                {t('lobby.confirmLeaveMsg')}
                {isHost && <><br />{t('lobby.confirmLeaveHostMsg')}</>}
              </ConfirmText>
              <ConfirmBtns>
                <CancelModalBtn onClick={() => setLeaveConfirmOpen(false)}>{t('lobby.btnCancel')}</CancelModalBtn>
                <LeaveModalBtn onClick={handleLeaveRoomConfirmed}>{t('lobby.btnLeave')}</LeaveModalBtn>
              </ConfirmBtns>
            </ConfirmModal>
          </ModalOverlay>
        )}

        {/* Kick confirm */}
        {kickConfirm.open && kickConfirm.player && (
          <ModalOverlay onClick={() => setKickConfirm({ open: false, player: null })}>
            <ConfirmModal onClick={e => e.stopPropagation()}>
              <ConfirmIcon style={{ color: '#f87171' }}><Emoji glyph="🚫" size={24} /></ConfirmIcon>
              <ConfirmTitle style={{ color: '#f87171' }}>{t('lobby.kickConfirmTitle')}</ConfirmTitle>
              <ConfirmText>
                {t('lobby.kickConfirmMsg', { name: kickConfirm.player.userName })}
              </ConfirmText>
              <ConfirmBtns>
                <CancelModalBtn onClick={() => setKickConfirm({ open: false, player: null })}>
                  {t('lobby.kickConfirmNo')}
                </CancelModalBtn>
                <LeaveModalBtn
                  style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
                  onClick={handleKickPlayer}
                >
                  {t('lobby.kickConfirmYes')}
                </LeaveModalBtn>
              </ConfirmBtns>
            </ConfirmModal>
          </ModalOverlay>
        )}

        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showHallOfFame && <HallOfFame onClose={() => setShowHallOfFame(false)} />}
        {showRankings && <Rankings onClose={() => setShowRankings(false)} />}
      </>
    );
  }

  return null;
};

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp = keyframes`from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}`;

// ─── Shared ───────────────────────────────────────────────────────────────────

const Root = styled.div`
  min-height:100vh;
  background:radial-gradient(ellipse at top,#111827 0%,#070b14 60%,#000 100%);
  display:flex; flex-direction:column; color:#f8fafc;
`;

const LoadingScreen = styled.div`
  flex:1; display:flex; align-items:center; justify-content:center;
  font-size:20px; color:rgba(255,255,255,0.4);
  min-height:100vh;
`;

const PageHeader = styled.header`
  display:flex; align-items:center; justify-content:space-between;
  padding:0 32px; height:64px;
  background:rgba(255,255,255,0.025);
  border-bottom:1px solid rgba(255,255,255,0.07);
  backdrop-filter:blur(12px); flex-shrink:0;
  ${media.mobile} { padding:0 16px; height:52px; }
  ${lMedia.phoneSm} { height:44px; padding:0 12px; }
`;

const BackBtn = styled.button`
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
  border-radius:8px; color:rgba(255,255,255,0.55); padding:8px 14px;
  font-size:13px; cursor:pointer; transition:all 0.2s; white-space:nowrap;
  &:hover { background:rgba(255,255,255,0.1); color:#fff; }

  .back-text {
    ${media.mobile} { display: none; }
  }

  ${media.mobile} { padding:6px 10px; font-size:12px; }
`;

const PageTitle = styled.h1`
  font-size:18px; font-weight:800; color:#f8fafc; margin:0; letter-spacing:-0.01em;
  ${media.mobile} { font-size:16px; }
  ${lMedia.phoneSm} { font-size:14px; }
`;

const HeaderActions = styled.div`display:flex; align-items:center; gap:8px;`;

const ActionBtn = styled.button`
  width:36px; height:36px; background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.08); border-radius:8px;
  font-size:16px; cursor:pointer; transition:all 0.2s;
  display:flex; align-items:center; justify-content:center;
  &:hover { background:rgba(255,255,255,0.1); }
  ${media.mobile} { display:none; }
`;

// 방 목록 새로고침 — ActionBtn과 달리 모바일에서도 보여야 한다(실시간 구독을 없앤 대가).
const RefreshBtn = styled.button`
  width:36px; height:36px; background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.08); border-radius:8px;
  font-size:16px; cursor:pointer; transition:all 0.2s;
  display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  &:hover:not(:disabled) { background:rgba(255,255,255,0.1); }
  &:disabled { opacity:0.4; cursor:default; }
  /* 실시간 구독을 걷어낸 뒤로 방 목록을 갱신하는 유일한 수단이라 손가락으로 확실히
     눌려야 한다 — 모바일에서 줄이지 않고 오히려 키운다(권장 터치 영역 40px 이상). */
  ${media.mobile} { width:40px; height:40px; }
`;

const CreateRoomBtn = styled.button`
  padding:8px 16px; background:#3b82f6; border:none; border-radius:8px;
  color:#fff; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.2s;
  white-space:nowrap;
  &:hover { background:#2563eb; transform:translateY(-1px); box-shadow:0 6px 16px rgba(59,130,246,0.3); }
  ${media.mobile} { padding:7px 12px; font-size:13px; }
`;

const Content = styled.main`
  flex:1; padding:28px 32px; overflow-y:auto;
  animation:${fadeUp} 0.4s ease both;
  ${media.mobile} { padding:20px 16px; }
  ${lMedia.phoneSm} { padding:12px; }
`;

const SectionLabel = styled.div`
  font-size:11px; font-weight:700; letter-spacing:0.2em;
  color:rgba(255,255,255,0.3); text-transform:uppercase; margin-bottom:12px;
`;

// ─── Room list ────────────────────────────────────────────────────────────────

const EmptyState = styled.div`
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:80px 20px; gap:12px;
`;

const EmptyIcon = styled.div`font-size:48px; opacity:0.3;`;
const EmptyTitle = styled.div`font-size:18px; font-weight:600; color:rgba(255,255,255,0.35);`;
const EmptyHint = styled.div`font-size:14px; color:rgba(255,255,255,0.2);`;

const EmptyCreateBtn = styled.button`
  margin-top:12px; padding:12px 24px; background:#3b82f6; border:none;
  border-radius:10px; color:#fff; font-size:15px; font-weight:700;
  cursor:pointer; transition:all 0.2s;
  &:hover { background:#2563eb; transform:translateY(-1px); }
`;

const RoomTable = styled.div`display:flex; flex-direction:column; gap:0;`;

const RoomTableHead = styled.div`
  display:flex; align-items:center; gap:16px;
  padding:8px 16px;
  font-size:11px; font-weight:700; letter-spacing:0.12em;
  color:rgba(255,255,255,0.28); text-transform:uppercase;
  border-bottom:1px solid rgba(255,255,255,0.06);
  ${media.mobile} { display:none; }
`;

const RTH = styled.div`flex:1;`;

const RoomRow = styled.div`
  display:flex; align-items:center; gap:16px; padding:12px 16px;
  border-bottom:1px solid rgba(255,255,255,0.05);
  transition:background 0.15s;
  &:hover { background:rgba(255,255,255,0.03); }
  ${media.mobile} { flex-wrap:wrap; gap:10px; padding:12px; }
`;

const RoomCell = styled.div`
  flex:1; font-size:14px; color:rgba(255,255,255,0.65);
  ${media.mobile} { font-size:13px; }
`;

const RoomMapCell = styled.div`
  flex:2; display:flex; align-items:center; gap:12px;
  min-width:0;
`;

const RoomMapThumb = styled.img`
  width:60px; height:40px; border-radius:6px;
  object-fit:cover; border:1px solid rgba(255,255,255,0.08); flex-shrink:0;
  ${media.mobile} { width:48px; height:32px; }
`;

const RoomMapInfo = styled.div`min-width:0;`;

const RoomName = styled.div`
  font-size:15px; font-weight:700; color:#f8fafc;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  ${media.mobile} { font-size:14px; }
`;

const RoomMapName = styled.div`font-size:12px; color:rgba(255,255,255,0.4);`;

const PlayerCount = styled.div<{$full:boolean}>`
  font-size:15px; font-weight:700;
  color:${p=>p.$full?'#f87171':'#4ade80'};
  display:inline-block;
  background:${p=>p.$full?'rgba(248,113,113,0.1)':'rgba(74,222,128,0.1)'};
  padding:3px 10px; border-radius:100px;
`;

const JoinBtn = styled.button`
  padding:7px 16px; background:#3b82f6; border:none;
  border-radius:8px; color:#fff; font-size:13px; font-weight:600;
  cursor:pointer; transition:all 0.2s; white-space:nowrap;
  &:hover:not(:disabled) { background:#2563eb; }
  &:disabled { background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.2); cursor:not-allowed; }
`;

// ─── Create room ──────────────────────────────────────────────────────────────

const CreateSection = styled.div`max-width:860px; margin: 0 auto;`;

const MapPickGrid = styled.div`
  display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
  gap:10px; margin: 0 auto 24px auto; justify-content: center;
  ${media.tablet} { grid-template-columns:repeat(2,1fr); }
  ${media.mobile} { grid-template-columns:repeat(2,1fr); gap:8px; }
  ${lMedia.phoneSm} { grid-template-columns:repeat(3,1fr); gap:6px; }
`;

const MapPickCard = styled.div<{ $selected:boolean; $color:string; $img:string }>`
  position:relative; border-radius:10px; overflow:hidden;
  height:120px; cursor:pointer;
  background-image:url(${p=>p.$img}); background-size:cover; background-position:center;
  background-color:#1f2937;
  border:2px solid ${p=>p.$selected ? p.$color : 'rgba(255,255,255,0.08)'};
  transition:all 0.2s;
  &:hover { border-color:${p=>p.$color}88; transform:translateY(-2px); }
  ${media.mobile} { height:90px; }
  ${lMedia.phoneSm} { height:80px; }
`;

const MapPickOverlay = styled.div<{$selected:boolean; $color:string}>`
  position:absolute; inset:0;
  background:${p=>p.$selected
    ? `linear-gradient(180deg,${p.$color}22 0%,rgba(0,0,0,0.7) 100%)`
    : 'linear-gradient(180deg,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.65) 100%)'};
`;

const MapPickBadge = styled.div<{$color:string}>`
  position:absolute; top:8px; left:8px;
  background:rgba(0,0,0,0.6); backdrop-filter:blur(4px);
  border:1px solid ${p=>p.$color}44;
  color:${p=>p.$color}; font-size:10px; font-weight:800;
  padding:2px 7px; border-radius:100px; letter-spacing:0.08em;
`;

const MapPickName = styled.div`
  position:absolute; bottom:8px; left:10px; right:10px;
  font-size:13px; font-weight:700; color:#fff;
  text-shadow:0 1px 3px rgba(0,0,0,0.7);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  ${lMedia.phoneSm} { font-size:11px; }
`;

const MapPickCheck = styled.div`
  position:absolute; top:8px; right:8px;
  width:22px; height:22px; border-radius:50%;
  background:#10b981; display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:900; color:#fff;
`;

const ConfirmCreateBtn = styled.button`
  width:100%; padding:14px;
  background:linear-gradient(135deg,#3b82f6,#2563eb); border:none;
  border-radius:10px; color:#fff; font-size:16px; font-weight:700;
  cursor:pointer; transition:all 0.2s;
  &:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(59,130,246,0.35); }
`;

// ─── Room view ────────────────────────────────────────────────────────────────

const RoomLayout = styled.div`
  display:grid; grid-template-columns:280px 1fr; gap:24px;
  ${media.tablet} { grid-template-columns:1fr; }
  ${lMedia.phoneSm} { grid-template-columns:1fr; gap:16px; }
`;

const RoomMapPanel = styled.div`
  border-radius:12px; overflow:hidden;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(255,255,255,0.03);
  ${media.tablet} { display:flex; align-items:center; gap:16px; }
`;

const RoomMapBig = styled.img`
  width:100%; height:160px; object-fit:cover; display:block;
  ${media.tablet} { width:120px; height:80px; border-radius:8px; flex-shrink:0; }
  ${media.mobile} { width:90px; height:60px; }
`;

const RoomMapDetails = styled.div`padding:16px; ${media.tablet}{flex:1; padding:12px;}`;

const RoomMapBadge = styled.div<{$color:string}>`
  display:inline-block; padding:3px 10px; border-radius:100px;
  background:${p=>p.$color}18; border:1px solid ${p=>p.$color}44;
  color:${p=>p.$color}; font-size:11px; font-weight:800; letter-spacing:0.1em;
  margin-bottom:8px;
`;

const RoomMapTitle = styled.div`font-size:16px; font-weight:700; color:#f8fafc; margin-bottom:6px;`;

const PlayerCountBig = styled.div`font-size:13px; color:rgba(255,255,255,0.45);`;

const RoomPlayersArea = styled.div``;

const PlayerGrid = styled.div`
  display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:10px; margin-bottom:20px;
  ${media.mobile} { grid-template-columns:1fr; gap:8px; }
  ${lMedia.phoneSm} { grid-template-columns:repeat(2,1fr); gap:6px; }
`;

const PlayerCard = styled.div<{$ready:boolean}>`
  display:flex; align-items:center; gap:12px; padding:12px 16px;
  background:${p=>p.$ready?'rgba(16,185,129,0.06)':'rgba(255,255,255,0.04)'};
  border:1px solid ${p=>p.$ready?'rgba(16,185,129,0.2)':'rgba(255,255,255,0.07)'};
  border-radius:10px; transition:all 0.2s;
  ${lMedia.phoneSm} { padding:10px 12px; gap:8px; }
`;

const PlayerAvatar = styled.div`
  width:36px; height:36px; border-radius:50%;
  background:linear-gradient(135deg,#3b82f6,#1d4ed8);
  display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:700; color:#fff; flex-shrink:0;
  ${lMedia.phoneSm} { width:30px; height:30px; font-size:13px; }
`;

const PlayerInfo = styled.div`flex:1; min-width:0;`;

const PlayerNameRow = styled.div`
  display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  font-size:14px; font-weight:700; color:#f8fafc; margin-bottom:2px;
  ${lMedia.phoneSm} { font-size:12px; }
`;

const HostBadge = styled.span`
  font-size:10px; font-weight:800; color:#f59e0b;
  background:rgba(245,158,11,0.1); padding:1px 6px; border-radius:4px;
`;

const AIBadge = styled.span`
  font-size:10px; font-weight:800; color:#a78bfa;
  background:rgba(167,139,250,0.1); padding:1px 6px; border-radius:4px;
`;

const PlayerRatingRow = styled.div`font-size:12px; color:rgba(255,255,255,0.35);`;

const KickBtn = styled.button`
  flex-shrink: 0;
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(239,68,68,0.35);
  background: rgba(239,68,68,0.08);
  color: rgba(239,68,68,0.7);
  font-size: 12px; font-weight: 700;
  cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  @media (hover: hover) {
    &:hover {
      background: rgba(239,68,68,0.22);
      border-color: rgba(239,68,68,0.6);
      color: #f87171;
    }
  }
  ${lMedia.phoneSm} { width: 22px; height: 22px; font-size: 11px; }
`;

const ReadyIndicator = styled.div<{$ready:boolean}>`
  font-size:12px; font-weight:700;
  color:${p=>p.$ready?'#4ade80':'rgba(255,255,255,0.3)'};
  flex-shrink:0;
`;

const EmptySlot = styled.div`
  display:flex; align-items:center; justify-content:center;
  padding:12px 16px; border-radius:10px;
  border:1px dashed rgba(255,255,255,0.1);
  font-size:13px; color:rgba(255,255,255,0.2);
  font-style:italic;
`;

const AISection = styled.div`margin-bottom:20px;`;

const AIBtnRow = styled.div`display:flex; gap:8px; flex-wrap:wrap;`;

const AIAddBtn = styled.button`
  flex:1; padding:9px 16px;
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
  border-radius:8px; color:rgba(255,255,255,0.6);
  font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s;
  min-width:90px;
  &:hover { background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.2); }
`;

const ActionRow = styled.div`display:flex; gap:10px;`;

const ToggleReadyBtn = styled.button<{$ready:boolean}>`
  flex:1; padding:13px;
  background:${p=>p.$ready?'rgba(245,158,11,0.15)':'rgba(16,185,129,0.15)'};
  border:1px solid ${p=>p.$ready?'rgba(245,158,11,0.3)':'rgba(16,185,129,0.3)'};
  border-radius:10px; color:${p=>p.$ready?'#fbbf24':'#34d399'};
  font-size:15px; font-weight:700; cursor:pointer; transition:all 0.2s;
  &:hover { filter:brightness(1.1); transform:translateY(-1px); }
`;

const StartGameBtn = styled.button`
  flex:1; padding:13px;
  background:linear-gradient(135deg,#10b981,#059669); border:none;
  border-radius:10px; color:#fff; font-size:15px; font-weight:700;
  cursor:pointer; transition:all 0.2s;
  &:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 8px 24px rgba(16,185,129,0.3); }
  &:disabled { background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.25); cursor:not-allowed; transform:none; }
`;

// ─── Confirm modal ────────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position:fixed; inset:0; background:rgba(0,0,0,0.85);
  display:flex; align-items:center; justify-content:center; z-index:3000;
  backdrop-filter:blur(4px); padding:16px;
`;

const ConfirmModal = styled.div`
  background:#0f1419; border:1px solid rgba(239,68,68,0.25);
  border-radius:16px; padding:32px; max-width:420px; width:100%;
  text-align:center; box-shadow:0 32px 64px rgba(0,0,0,0.6);
`;

const ConfirmIcon = styled.div`font-size:32px; margin-bottom:16px; color:#f87171;`;
const ConfirmTitle = styled.h3`font-size:20px; font-weight:800; color:#f87171; margin:0 0 12px;`;
const ConfirmText = styled.p`font-size:14px; color:rgba(255,255,255,0.55); line-height:1.6; margin:0 0 24px;`;

const ConfirmBtns = styled.div`display:flex; gap:10px;`;

const CancelModalBtn = styled.button`
  flex:1; padding:12px; background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.1); border-radius:10px;
  color:rgba(255,255,255,0.7); font-size:14px; font-weight:600;
  cursor:pointer; transition:all 0.2s;
  &:hover { background:rgba(255,255,255,0.1); color:#fff; }
`;

const LeaveModalBtn = styled.button`
  flex:1; padding:12px; background:rgba(239,68,68,0.15);
  border:1px solid rgba(239,68,68,0.3); border-radius:10px;
  color:#f87171; font-size:14px; font-weight:700;
  cursor:pointer; transition:all 0.2s;
  &:hover { background:rgba(239,68,68,0.25); }
`;

// ─── Rejoin Prompt ────────────────────────────────────────────────────────────

interface RejoinPromptProps { roomName: string; onRejoin: () => void; onAbandon: () => void; }

function RejoinPrompt({ roomName, onRejoin, onAbandon }: RejoinPromptProps) {
  const { t } = useTranslation();
  return (
    <Root>
      <ModalOverlay>
        <ConfirmModal style={{borderColor:'rgba(59,130,246,0.25)'}}>
          <ConfirmIcon style={{color:'#60a5fa'}}><Emoji glyph="🎮" size={24} /></ConfirmIcon>
          <ConfirmTitle style={{color:'#60a5fa'}}>{t('lobby.rejoinTitle')}</ConfirmTitle>
          <ConfirmText>
            {t('lobby.rejoinMsg', { name: roomName }).split('\n').map((line, i) => (
              <Fragment key={i}>{line}{i === 0 && <br />}</Fragment>
            ))}
          </ConfirmText>
          <ConfirmBtns>
            <CancelModalBtn onClick={onAbandon}>{t('lobby.rejoinNo')}</CancelModalBtn>
            <LeaveModalBtn
              style={{background:'rgba(59,130,246,0.15)',borderColor:'rgba(59,130,246,0.3)',color:'#60a5fa'}}
              onClick={onRejoin}
            >
              {t('lobby.rejoinYes')}
            </LeaveModalBtn>
          </ConfirmBtns>
        </ConfirmModal>
      </ModalOverlay>
    </Root>
  );
}