// src/components/multiplayer/MultiplayerView.tsx
// 멀티플레이어 현황 뷰 - 플레이어 체력 순 정렬
import React from 'react';
// ──────────────────────────────────────────────────────────────────
// [V5-FIX-MV-1] 본인 데이터도 Firebase 구독 기준으로 일관성 확보
//   - 기존: 내 것만 로컬 towers 사용 → 서버와 순간 불일치 가능
//   - 수정: Firebase 구독 데이터 우선, 로컬 towers는 fallback
//
// [V5-FIX-MV-2] 플레이어 데이터 정렬 정규화
//   - normalizeTowerDetails와 동일한 sort 키 사용

import { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { multiplayerService } from '../../services/MultiplayerService';
import { PlayerGameState, TowerDetail } from '../../types/multiplayer';
import { authService } from '../../services/AuthService';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, btnThin, pixelBold } from '../../styles/pixel';
import { lMedia } from '../../utils/responsive.utils';
import { ModalOverlay, ModalBox, ModalCloseBtn, MODAL_ACCENT } from '../shared/modal.styles';

// ─── 반응형 헬퍼 → lMedia 사용 ───────────────────────────────────────────────
const LSm   = lMedia.phoneSm;  // landscape + max-height ≤520px

interface MultiplayerViewProps {
  roomId: string;
  onClose: () => void;
}

export const MultiplayerView = ({ roomId, onClose }: MultiplayerViewProps) => {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerGameState[]>([]);
  const [allTowerDetails, setAllTowerDetails] = useState<Map<string, TowerDetail[]>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const user = authService.getCurrentUser();

  // ─── 수동 fetch ────────────────────────────────────────
  const fetchTowerDetails = useCallback(async () => {
    if (!roomId) return;
    try {
      setIsRefreshing(true);
      const allTowers = await multiplayerService.getAllTowerDetailsOnce(roomId);
      setAllTowerDetails(prev => {
        const merged = new Map(prev);
        allTowers.forEach((towersList, userId) => {
          if (towersList.length > 0) merged.set(userId, towersList);
        });
        return merged;
      });
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[MultiplayerView] fetchTowerDetails error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [roomId]);

  // ─── Firebase 게임 상태 구독 ──────────────────────────────
  useEffect(() => {
    try {
      const unsubscribe = multiplayerService.onGameStateUpdate(roomId, (updatedPlayers) => {
        setPlayers(updatedPlayers);
      });
      return unsubscribe;
    } catch (error) {
      console.error('Failed to subscribe to game state:', error);
    }
  }, [roomId]);

  // ─── 타워 상세 실시간 구독 ─────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = multiplayerService.onAllTowerDetailsUpdate(roomId, (allTowers) => {
      setAllTowerDetails(new Map(allTowers));
      setLastRefreshed(new Date());
    });
    return () => unsub();
  }, [roomId]);

  // ─── 마운트 시 1회 강제 fetch ─────────────────────────────
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchTowerDetails();
  }, [fetchTowerDetails]);

  // [FIX] 내 타워 업로드는 GameLayout이 단독으로 담당한다.
  //   예전엔 이 뷰도 같은 경로(towerDetails/{room}/{uid})에 썼는데, 여기서 만든
  //   페이로드에는 equippedMoves/lifesteal/aoeBonus가 없어 normalizeTowerDetails가
  //   기술 목록을 빈 배열로 덮어썼다(배틀에 기술 없는 팀이 올라감). 게다가 스로틀 맵을
  //   공유해 두 경로가 서로의 예약 업로드를 취소했다. 읽기 전용 뷰로 되돌린다.

  // ─── [V5-FIX-MV-1] 정렬: Firebase 기준 ────────────────────
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.isAlive !== b.isAlive) return b.isAlive ? 1 : -1;
    return b.lives - a.lives;
  });

  const refreshedTimeStr = lastRefreshed.toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <ModalOverlay onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalBox $size="md" $accent={MODAL_ACCENT.gold} $scroll>
        <Header>
          <Title><Emoji glyph="🏆" size={16} /> {t('multiView.playerRank')}</Title>
          <HeaderRight>
            <RefreshInfo $refreshing={isRefreshing}>
              {isRefreshing ? <><Emoji glyph="🔄" size={12} /> {t('multiView.refreshing')}</> : <><Emoji glyph="⏱" size={12} /> {refreshedTimeStr}</>}
            </RefreshInfo>
            <ManualRefreshBtn onClick={fetchTowerDetails} disabled={isRefreshing} title={t('multiView.manualRefresh')}><Emoji glyph="🔃" size={14} /></ManualRefreshBtn>
            <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
          </HeaderRight>
        </Header>

        <PlayerList>
          {sortedPlayers.map((player, index) => {
            // [V5-FIX-MV-1] 본인 포함 모두 Firebase 구독 데이터 우선
            const playerTowers: (TowerDetail & { name: string })[] =
              (allTowerDetails.get(player.userId) || []).map(t => ({ ...t }));

            const alivePokemon = playerTowers.filter(t => !t.isFainted).length;
            const totalPokemon = playerTowers.length;

            return (
              <PlayerRow key={player.userId} $isMe={player.userId === user?.uid} $isDead={!player.isAlive}>
                <RankBadge $rank={index + 1}>{index + 1}</RankBadge>
                <PlayerInfo>
                  <PlayerNameRow>
                    {player.userName}
                    {player.userId === user?.uid && <MeTag>{t('multiView.me')}</MeTag>}
                  </PlayerNameRow>
                  <PlayerStats>
                    <StatIcon><Emoji glyph="❤️" size={12} /> {player.lives}</StatIcon>
                    <StatIcon><Emoji glyph="💰" size={12} /> {player.money}</StatIcon>
                    <StatIcon><Emoji glyph="🌊" size={12} /> {player.wave}</StatIcon>
                  </PlayerStats>
                </PlayerInfo>

                <PokemonSection>
                  <PokemonCount>
                    <Emoji glyph="⚔️" size={12} /> {alivePokemon}/{totalPokemon}
                    {totalPokemon === 0 && player.userId !== user?.uid && <LoadingDot>···</LoadingDot>}
                  </PokemonCount>
                  <PokemonIcons>
                    {playerTowers.length === 0 && player.userId !== user?.uid ? (
                      Array.from({ length: 3 }).map((_, i) => <PokemonPlaceholder key={i} />)
                    ) : (
                      playerTowers.slice(0, 6).map((tower, idx) => (
                        <PokemonIconWrapper key={idx}>
                          <PokemonIcon
                            src={tower.sprite}
                            alt={tower.name}
                            $isFainted={tower.isFainted}
                            title={`${tower.name} Lv.${tower.level}${tower.isFainted ? t('multiView.faintedSuffix') : ''}`}
                          />
                          <MiniHpBar>
                            <MiniHpFill
                              $pct={Math.max(0, (tower.currentHp / Math.max(tower.maxHp, 1)) * 100)}
                              $fainted={tower.isFainted}
                            />
                          </MiniHpBar>
                          <LvBadge>Lv{tower.level}</LvBadge>
                        </PokemonIconWrapper>
                      ))
                    )}
                  </PokemonIcons>
                </PokemonSection>

                {!player.isAlive && <DeadBadge><Emoji glyph="💀" size={12} /> {t('multiView.eliminated')}</DeadBadge>}
              </PlayerRow>
            );
          })}
        </PlayerList>

        <Footer><FooterNote><Emoji glyph="📡" size={12} /> {t('multiView.liveSync')}</FooterNote></Footer>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── 애니메이션 ───────────────────────────────────────────────────────────────
const blink = keyframes`0%,100%{opacity:0.3}50%{opacity:1}`;

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 행, 원형 순위 배지, 알약 태그, 그라디언트, shimmer 스켈레톤,
//           둥근 모서리, rem 단위·6~11px 글자.

const Header = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: ${SP.md} ${SP.lg};
  border-bottom: ${SCALE}px solid ${C.ink};
  gap: ${SP.sm};

  ${lMedia.phone} { padding: ${SP.sm} ${SP.md}; flex-wrap: wrap; }
  ${LSm}  { padding: ${SP.sm} ${SP.md}; flex-wrap: wrap; }
`;

const Title = styled.h2`
  ${pixelBold}
  color: ${C.gold}; margin: 0; font-size: ${FONT.sm};
`;

const HeaderRight = styled.div`
  display: flex; align-items: center; gap: ${SP.sm}; flex-shrink: 0;
`;

const RefreshInfo = styled.span<{ $refreshing: boolean }>`
  font-size: ${FONT.sm};
  color: ${p => (p.$refreshing ? C.blue : C.textDim)};
  white-space: nowrap;
  ${LSm} { display: none; }
`;

const ManualRefreshBtn = styled.button`
  ${btnThin('plain')}
  color: ${C.text}; width: 32px; height: 32px; padding: 0;
  font-size: ${FONT.sm};
  display: flex; align-items: center; justify-content: center;
  &:focus, &:focus-visible { outline: none; }
`;

const PlayerList = styled.div`
  display: flex; flex-direction: column; gap: ${SP.sm};
`;

/** 플레이어 행 — 내 행만 파랑 창틀. 그라디언트 대신 창틀 색이 구분을 진다. */
const PlayerRow = styled.div<{ $isMe: boolean; $isDead: boolean }>`
  ${p => winThin(p.$isMe ? 'blue' : 'plain')}
  display: flex; align-items: center; gap: ${SP.md}; padding: ${SP.sm} ${SP.md};
  opacity: ${p => (p.$isDead ? 0.5 : 1)};
  position: relative;

  ${lMedia.phone} { padding: ${SP.sm}; gap: ${SP.sm}; flex-wrap: wrap; }
  ${LSm}  { padding: ${SP.sm}; gap: ${SP.sm}; }
`;

/** 순위 표시 — 원이 아니라 네모. 1~3위만 메달 색. */
const RankBadge = styled.div<{ $rank: number }>`
  ${pixelBold}
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; flex-shrink: 0;
  border: 2px solid ${C.ink};
  background: ${p =>
    p.$rank === 1 ? C.gold :
    p.$rank === 2 ? '#c5cbd8' :
    p.$rank === 3 ? '#c08a4a' : C.panelSunk};
  color: ${p => (p.$rank <= 3 ? C.ink : C.text)};
  text-shadow: none;
`;

const PlayerInfo = styled.div`flex: 1; min-width: 0;`;

const PlayerNameRow = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  display: flex; align-items: center; gap: ${SP.sm};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

const MeTag = styled.span`
  font-size: ${FONT.sm}; color: ${C.blue}; font-weight: 400; flex-shrink: 0;
`;

const PlayerStats = styled.div`
  display: flex; gap: ${SP.md}; margin-top: ${SP.xs}; flex-wrap: wrap;
  ${lMedia.phone} { gap: ${SP.sm}; }
`;

const StatIcon = styled.span`
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

const PokemonSection = styled.div`
  display: flex; flex-direction: column; align-items: flex-end; gap: ${SP.xs};
`;

const PokemonCount = styled.div`
  font-size: ${FONT.sm}; color: ${C.textSub};
  display: flex; align-items: center; gap: ${SP.xs};
`;

const LoadingDot = styled.span`
  font-size: ${FONT.sm}; color: ${C.blue};
  animation: ${blink} 1.2s steps(1, end) infinite;
`;

const PokemonIcons = styled.div`
  display: flex; gap: ${SP.xs}; flex-wrap: wrap; justify-content: flex-end;
`;

const PokemonIconWrapper = styled.div`
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px;
`;

const PokemonIcon = styled.img<{ $isFainted: boolean }>`
  width: 36px; height: 36px;
  background: ${C.panelSunk}; object-fit: contain;
  filter: ${p => (p.$isFainted ? 'grayscale(100%) opacity(0.35)' : 'none')};
  image-rendering: pixelated;
  border: 2px solid ${C.ink};

  ${lMedia.phone} { width: 28px; height: 28px; }
  ${LSm}  { width: 24px; height: 24px; }
`;

/** 미니 HP 게이지 — 각진 트랙 + 각진 막대. */
const MiniHpBar = styled.div`
  width: 36px; height: 4px;
  background: ${C.panelSunk};
  border: 1px solid ${C.ink};
  overflow: hidden;

  ${lMedia.phone} { width: 28px; }
  ${LSm}  { width: 24px; }
`;

const MiniHpFill = styled.div<{ $pct: number; $fainted: boolean }>`
  height: 100%;
  width: ${p => p.$pct}%;
  background: ${p =>
    p.$fainted ? C.divider : p.$pct > 50 ? C.green : p.$pct > 25 ? C.gold : C.red};
`;

const LvBadge = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim}; line-height: 1;
  ${lMedia.phone} { display: none; }
  ${LSm}  { display: none; }
`;

/** 로딩 자리 — 흐르는 광택 대신 그냥 빈 파인 칸. */
const PokemonPlaceholder = styled.div`
  width: 36px; height: 36px;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};

  ${lMedia.phone} { width: 28px; height: 28px; }
  ${LSm}  { width: 24px; height: 24px; }
`;

const DeadBadge = styled.div`
  ${pixelBold}
  position: absolute; top: ${SP.xs}; right: ${SP.xs};
  font-size: ${FONT.sm}; line-height: 1.3; color: ${C.red};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  padding: 0 ${SP.xs};
`;

const Footer = styled.div`
  margin-top: ${SP.md}; padding-top: ${SP.sm};
  border-top: ${SCALE}px solid ${C.ink};
  text-align: center;
`;

const FooterNote = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim};
`;
