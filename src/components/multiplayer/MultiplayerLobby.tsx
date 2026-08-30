// src/components/multiplayer/MultiplayerLobby.tsx
// [V5-FIX-LB-1] 나가기 확인 모달 — 게임 진행 중 실수로 나가기 방지
// [V5-FIX-LB-2] AI가 호스트가 되는 경우에 대한 안전 장치

import { useState, useEffect, useRef, Fragment } from 'react';
import styled, { css } from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody, SectionLabel } from '../shared/screen';
import { media, lMedia } from '../../utils/responsive.utils';
import { multiplayerService, MP_ERROR } from '../../services/MultiplayerService';
import { Room, AIDifficulty } from '../../types/multiplayer';
import { MAPS, mapThumbnailById } from '../../data/maps';
import { authService } from '../../services/AuthService';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { win, winThin, btn, btnThin, sunken, hudBar, pixelText, pixelBold } from '../../styles/pixel';
import { AchievementsPanel } from '../modals/Achievements';
import { HallOfFame } from '../modals/HallOfFame';
import { Rankings } from '../modals/Rankings';
import { showToast } from '../shared/Toast';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onStartGame: (roomId: string, mapId: string) => void;
}

const DIFF_META: Record<string, { label: string; color: string }> = {
  easiest: { label: 'EASIEST', color: C.plain },
  easy:    { label: 'EASY',    color: C.green },
  medium:  { label: 'MEDIUM',  color: C.blue },
  hard:    { label: 'HARD',    color: C.orange },
  expert:  { label: 'EXPERT',  color: C.red },
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

  // 방 목록의 맵 이름은 **방 id가 아니라 방이 쓰는 맵 id**로 찾아야 한다.
  //   mapLabel(room)을 그대로 부르면 `mapData.<방id>.name`을 조회해 늘 빗나가고,
  //   폴백이 room.name이라 맵 칸에 방 이름이 한 번 더 찍혔다(어느 맵인지 알 수 없었음).
  const roomMapLabel = (room: Room) => {
    const map = MAPS.find(m => m.id === room.mapId);
    return map ? mapLabel(map) : room.mapId;
  };

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
                      <RoomMapName>{roomMapLabel(room)}</RoomMapName>
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
              <ConfirmIcon style={{ color: C.red }}><Emoji glyph="🚫" size={24} /></ConfirmIcon>
              <ConfirmTitle style={{ color: C.red }}>{t('lobby.kickConfirmTitle')}</ConfirmTitle>
              <ConfirmText>
                {t('lobby.kickConfirmMsg', { name: kickConfirm.player.userName })}
              </ConfirmText>
              <ConfirmBtns>
                <CancelModalBtn onClick={() => setKickConfirm({ open: false, player: null })}>
                  {t('lobby.kickConfirmNo')}
                </CancelModalBtn>
                <LeaveModalBtn
                  style={{ background: `${C.red}26`, borderColor: `${C.red}66`, color: C.red }}
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

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, 알약 배지, 원형 아바타/체크, uppercase eyebrow,
//           점선 슬롯, backdrop-filter, hover 떠오름+글로우, 그라디언트 버튼,
//           스태거 fadeUp, Tailwind 팔레트.


const LoadingScreen = styled.div`
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.textSub};
  min-height: 100vh;
`;

const PageHeader = styled.header`
  ${hudBar}
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.md};
  padding: 0 ${SP.lg}; height: 60px;
  flex-shrink: 0;
  ${media.mobile}   { padding: 0 ${SP.md}; height: 52px; }
  ${lMedia.phoneSm} { height: 44px; padding: 0 ${SP.sm}; }
`;


const PageTitle = styled.h1`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold}; margin: 0;
`;

const HeaderActions = styled.div`display: flex; align-items: center; gap: ${SP.sm};`;

const ActionBtn = styled.button`
  ${btnThin('plain')}
  width: 36px; height: 36px; padding: 0;
  color: ${C.textSub};
  display: flex; align-items: center; justify-content: center;
  &:focus, &:focus-visible { outline: none; }
  ${media.mobile} { display: none; }
`;

/* 방 목록 새로고침 — ActionBtn과 달리 모바일에서도 보여야 한다(실시간 구독을 없앤 대가).
   손가락으로 확실히 눌려야 하므로 모바일에서 오히려 키운다(권장 터치 영역 40px 이상). */
const RefreshBtn = styled.button`
  ${btnThin('plain')}
  width: 36px; height: 36px; padding: 0;
  color: ${C.textSub};
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
  &:focus, &:focus-visible { outline: none; }
  ${media.mobile} { width: 40px; height: 40px; }
`;

const CreateRoomBtn = styled.button`
  ${btnThin('blue')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.md};
  color: ${C.blue}; font-size: ${FONT.sm};
  white-space: nowrap;
  &:focus, &:focus-visible { outline: none; }
`;

const Content = styled(ScreenBody)`
  overflow-y: auto;
  ${media.mobile}   { padding: ${SP.md} ${SP.sm}; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;


// ─── Room list ────────────────────────────────────────────────────────────────

const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: ${SP.xxl} ${SP.lg}; gap: ${SP.md};
`;

const EmptyIcon = styled.div`font-size: 48px; line-height: 1;`;
const EmptyTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
`;
const EmptyHint = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;

const EmptyCreateBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  margin-top: ${SP.md}; padding: ${SP.sm} ${SP.lg};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const RoomTable = styled.div`display: flex; flex-direction: column;`;

const RoomTableHead = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.md};
  padding: ${SP.xs} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.gold};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  ${media.mobile} { display: none; }
`;

const RTH = styled.div`flex: 1;`;

const RoomRow = styled.div`
  display: flex; align-items: center; gap: ${SP.md}; padding: ${SP.sm} ${SP.md};
  border-bottom: 2px solid ${C.ink};
  ${media.mobile} { flex-wrap: wrap; gap: ${SP.sm}; }
`;

const RoomCell = styled.div`
  flex: 1; font-size: ${FONT.sm}; color: ${C.textSub};
`;

const RoomMapCell = styled.div`
  flex: 2; display: flex; align-items: center; gap: ${SP.md};
  min-width: 0;
`;

const RoomMapThumb = styled.img`
  width: 60px; height: 40px;
  object-fit: cover; border: 2px solid ${C.ink}; flex-shrink: 0;
  image-rendering: pixelated;
  ${media.mobile} { width: 48px; height: 32px; }
`;

const RoomMapInfo = styled.div`min-width: 0;`;

const RoomName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

const RoomMapName = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;

const PlayerCount = styled.div<{ $full: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$full ? C.red : C.green)};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  padding: 0 ${SP.xs};
  display: inline-block;
`;

const JoinBtn = styled.button`
  ${btnThin('blue')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.md};
  color: ${C.blue}; font-size: ${FONT.sm};
  white-space: nowrap;
  &:focus, &:focus-visible { outline: none; }
`;

// ─── Create room ──────────────────────────────────────────────────────────────

const CreateSection = styled.div`max-width: 860px; margin: 0 auto;`;

const MapPickGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${SP.sm}; margin: 0 auto ${SP.lg}; justify-content: center;
  ${media.tablet}   { grid-template-columns: repeat(2,1fr); }
  ${media.mobile}   { grid-template-columns: repeat(2,1fr); }
  ${lMedia.phoneSm} { grid-template-columns: repeat(3,1fr); gap: ${SP.xs}; }
`;

/** 맵 카드 — 썸네일 위라 창틀 PNG를 못 쓴다. 맵 선택 화면과 같은 하드 2겹 테두리. */
const MapPickCard = styled.div<{ $selected: boolean; $color: string; $img: string }>`
  position: relative; overflow: hidden;
  height: 120px; cursor: pointer;
  background-image: url(${p => p.$img}); background-size: cover; background-position: center;
  background-color: ${C.ink};
  image-rendering: pixelated;
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px ${p => (p.$selected ? p.$color : C.divider)};
  @media (hover: hover) { &:hover { box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$color}; } }
  ${media.mobile}   { height: 90px; }
  ${lMedia.phoneSm} { height: 80px; }
`;

const MapPickOverlay = styled.div<{ $selected: boolean; $color: string }>`
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(22,27,40,0.15) 0%, rgba(22,27,40,0.8) 100%);
`;

const MapPickBadge = styled.div<{ $color: string }>`
  ${pixelBold}
  position: absolute; top: ${SP.xs}; left: ${SP.xs};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${p => p.$color}; font-size: ${FONT.sm}; line-height: 1.3;
  padding: 0 ${SP.xs};
`;

const MapPickName = styled.div`
  ${pixelBold}
  position: absolute; bottom: ${SP.xs}; left: ${SP.sm}; right: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.text};
  text-shadow: 1px 1px 0 ${C.ink};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

/** 선택 표시 — 원이 아니라 네모. */
const MapPickCheck = styled.div`
  ${pixelBold}
  position: absolute; top: ${SP.xs}; right: ${SP.xs};
  width: 20px; height: 20px;
  background: ${C.green};
  border: 2px solid ${C.ink};
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.ink};
  text-shadow: none;
`;

const ConfirmCreateBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  width: 100%; padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

// ─── Room view ────────────────────────────────────────────────────────────────

const RoomLayout = styled.div`
  display: grid; grid-template-columns: 280px 1fr; gap: ${SP.lg};
  ${media.tablet}   { grid-template-columns: 1fr; }
  ${lMedia.phoneSm} { grid-template-columns: 1fr; gap: ${SP.md}; }
`;

const RoomMapPanel = styled.div`
  ${winThin('plain')}
  overflow: hidden;
  padding: 0;
  ${media.tablet} { display: flex; align-items: center; gap: ${SP.md}; }
`;

const RoomMapBig = styled.img`
  width: 100%; height: 160px; object-fit: cover; display: block;
  image-rendering: pixelated;
  ${media.tablet} { width: 120px; height: 80px; flex-shrink: 0; }
  ${media.mobile} { width: 90px; height: 60px; }
`;

const RoomMapDetails = styled.div`padding: ${SP.md}; ${media.tablet}{ flex: 1; padding: ${SP.sm}; }`;

const RoomMapBadge = styled.div<{ $color: string }>`
  ${pixelBold}
  display: inline-block; padding: 0 ${SP.xs};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${p => p.$color}; font-size: ${FONT.sm}; line-height: 1.4;
  margin-bottom: ${SP.sm};
`;

const RoomMapTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text}; margin-bottom: ${SP.xs};
`;

const PlayerCountBig = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;

const RoomPlayersArea = styled.div``;

const PlayerGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${SP.sm}; margin-bottom: ${SP.lg};
  ${media.mobile}   { grid-template-columns: 1fr; }
  ${lMedia.phoneSm} { grid-template-columns: repeat(2,1fr); }
`;

const PlayerCard = styled.div<{ $ready: boolean }>`
  ${p => winThin(p.$ready ? 'green' : 'plain')}
  display: flex; align-items: center; gap: ${SP.sm}; padding: ${SP.sm} ${SP.md};
`;

/** 아바타 — 원이 아니라 네모. */
const PlayerAvatar = styled.div`
  ${pixelBold}
  width: 32px; height: 32px;
  background: ${C.blue};
  border: 2px solid ${C.ink};
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.ink}; flex-shrink: 0;
  text-shadow: none;
`;

const PlayerInfo = styled.div`flex: 1; min-width: 0;`;

const PlayerNameRow = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs}; flex-wrap: wrap;
  font-size: ${FONT.sm}; color: ${C.text};
`;

const roleBadge = css`
  ${pixelBold}
  font-size: ${FONT.sm}; line-height: 1.3;
  padding: 0 ${SP.xs};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

const HostBadge = styled.span`
  ${roleBadge}
  color: ${C.gold};
`;

const AIBadge = styled.span`
  ${roleBadge}
  color: ${C.purple};
`;

const PlayerRatingRow = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;

const KickBtn = styled.button`
  ${btnThin('red')}
  ${pixelBold}
  flex-shrink: 0;
  width: 24px; height: 24px; padding: 0;
  color: ${C.red};
  font-size: ${FONT.sm};
  display: flex; align-items: center; justify-content: center;
  &:focus, &:focus-visible { outline: none; }
`;

const ReadyIndicator = styled.div<{ $ready: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$ready ? C.green : C.textDim)};
  flex-shrink: 0;
`;

/** 빈 자리 — 점선을 걷어내고 한 단 파인 면으로. */
const EmptySlot = styled.div`
  ${sunken()}
  display: flex; align-items: center; justify-content: center;
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm}; color: ${C.textDim};
`;

const AISection = styled.div`margin-bottom: ${SP.lg};`;

const AIBtnRow = styled.div`display: flex; gap: ${SP.sm}; flex-wrap: wrap;`;

const AIAddBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  flex: 1; padding: ${SP.xs} ${SP.md};
  color: ${C.textSub};
  font-size: ${FONT.sm};
  min-width: 90px;
  &:focus, &:focus-visible { outline: none; }
`;

const ActionRow = styled.div`display: flex; gap: ${SP.sm};`;

const ToggleReadyBtn = styled.button<{ $ready: boolean }>`
  ${p => btn(p.$ready ? 'gold' : 'green')}
  ${pixelBold}
  flex: 1; padding: ${SP.sm};
  color: ${p => (p.$ready ? C.gold : C.green)};
  font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const StartGameBtn = styled.button`
  ${btn('green')}
  ${pixelBold}
  flex: 1; padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

// ─── Confirm modal ────────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(20, 16, 26, 0.86);
  display: flex; align-items: center; justify-content: center; z-index: 3000;
  padding: ${SP.md};
`;

const ConfirmModal = styled.div`
  ${win('red')}
  ${pixelText}
  padding: ${SP.xl}; max-width: 420px; width: 100%;
  text-align: center; color: ${C.text};
`;

const ConfirmIcon = styled.div`font-size: 32px; line-height: 1; margin-bottom: ${SP.md}; color: ${C.red};`;
const ConfirmTitle = styled.h3`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.red}; margin: 0 0 ${SP.sm};
`;
const ConfirmText = styled.p`
  font-size: ${FONT.sm}; color: ${C.textSub}; margin: 0 0 ${SP.lg};
  word-break: keep-all;
`;

const ConfirmBtns = styled.div`display: flex; gap: ${SP.sm};`;

const CancelModalBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  flex: 1; padding: ${SP.sm};
  color: ${C.textSub}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const LeaveModalBtn = styled.button`
  ${btn('red')}
  ${pixelBold}
  flex: 1; padding: ${SP.sm};
  color: ${C.red}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

// ─── Rejoin Prompt ────────────────────────────────────────────────────────────

interface RejoinPromptProps { roomName: string; onRejoin: () => void; onAbandon: () => void; }

function RejoinPrompt({ roomName, onRejoin, onAbandon }: RejoinPromptProps) {
  const { t } = useTranslation();
  return (
    <Root>
      <ModalOverlay>
        <ConfirmModal>
          <ConfirmIcon style={{color:C.blue}}><Emoji glyph="🎮" size={24} /></ConfirmIcon>
          <ConfirmTitle style={{color:C.blue}}>{t('lobby.rejoinTitle')}</ConfirmTitle>
          <ConfirmText>
            {t('lobby.rejoinMsg', { name: roomName }).split('\n').map((line, i) => (
              <Fragment key={i}>{line}{i === 0 && <br />}</Fragment>
            ))}
          </ConfirmText>
          <ConfirmBtns>
            <CancelModalBtn onClick={onAbandon}>{t('lobby.rejoinNo')}</CancelModalBtn>
            <LeaveModalBtn
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