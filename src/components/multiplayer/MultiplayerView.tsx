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
import { lMedia } from '../../utils/responsive.utils';
import { ModalOverlay, ModalBox, ModalCloseBtn, MODAL_ACCENT } from '../shared/modal.styles';

// ─── 반응형 헬퍼 → lMedia 사용 ───────────────────────────────────────────────
const L1024 = lMedia.tablet;   // ≤1024px landscape
const L768  = lMedia.phone;    // ≤768px  landscape
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
            <ModalCloseBtn onClick={onClose}><Emoji glyph="❌" size={14} /></ModalCloseBtn>
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
const shimmer = keyframes`
  0%{background-position:-200% 0}
  100%{background-position:200% 0}
`;
const blink = keyframes`0%,100%{opacity:0.3}50%{opacity:1}`;

// ─── Styled Components ────────────────────────────────────────────────────────



const Header = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  gap: 8px;

  ${L1024} { padding: 14px 18px 12px; }
  ${L768}  { padding: 12px 16px 10px; flex-wrap: wrap; }
  ${LSm}   { padding: 10px 14px 8px; flex-wrap: wrap; }
`;

const Title = styled.h2`
  color: #ffd700; margin: 0; font-size: 20px; font-weight: 800;
  text-shadow: 0 0 20px rgba(255,215,0,0.35);

  ${L1024} { font-size: 18px; }
  ${L768}  { font-size: 16px; }
  ${LSm}   { font-size: 14px; }
`;

const HeaderRight = styled.div`display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  ${L768} { gap: 6px; }
`;

const RefreshInfo = styled.span<{ $refreshing: boolean }>`
  font-size: 11px;
  color: ${p => p.$refreshing ? '#4fc3f7' : 'rgba(255,255,255,0.4)'};
  white-space: nowrap;

  ${L768} { font-size: 10px; }
  ${LSm}  { display: none; }
`;

const ManualRefreshBtn = styled.button`
  background: rgba(255,255,255,0.1); border: none;
  color: #fff; width: 32px; height: 32px; border-radius: 50%;
  cursor: pointer; font-size: 14px; transition: background 0.2s;
  @media(hover:hover){&:hover:not(:disabled){background:rgba(79,195,247,0.3);}}
  &:disabled{opacity: 0.4; cursor: not-allowed;}

  ${L768} { width: 28px; height: 28px; font-size: 12px; }
  ${LSm}  { width: 26px; height: 26px; font-size: 11px; }
`;


const PlayerList = styled.div`
  display: flex; flex-direction: column; gap: 12px;

  ${L768} { gap: 8px; }
  ${LSm}  { gap: 6px; }
`;

const PlayerRow = styled.div<{ $isMe: boolean; $isDead: boolean }>`
  display: flex; align-items: center; gap: 1rem; padding: 16px;
  background: ${p => p.$isMe
    ? 'linear-gradient(135deg,rgba(52,152,219,0.2),rgba(52,152,219,0.1))'
    : 'rgba(255,255,255,0.05)'};
  border-radius: 12px;
  border: 2px solid ${p => p.$isMe ? 'rgba(52,152,219,0.4)' : 'transparent'};
  opacity: ${p => p.$isDead ? 0.5 : 1};
  position: relative;

  /* 태블릿 가로 */
  ${L1024} { padding: 0.8rem; gap: 0.8rem; border-radius: 10px; }
  /* 폰 가로 */
  ${L768}  { padding: 0.65rem; gap: 0.65rem; flex-wrap: wrap; border-radius: 8px; }
  /* 소형 폰 가로 */
  ${LSm}   { padding: 0.5rem; gap: 8px; }
`;

const RankBadge = styled.div<{ $rank: number }>`
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 1rem; flex-shrink: 0;
  background: ${p => {
    if (p.$rank === 1) return 'linear-gradient(135deg,#ffd700,#ff8c00)';
    if (p.$rank === 2) return 'linear-gradient(135deg,#c0c0c0,#a0a0a0)';
    if (p.$rank === 3) return 'linear-gradient(135deg,#cd7f32,#a0522d)';
    return 'rgba(255,255,255,0.1)';
  }};
  color: ${p => p.$rank <= 3 ? '#000' : '#fff'};

  ${L768} { width: 26px; height: 26px; font-size: 0.85rem; }
  ${LSm}  { width: 22px; height: 22px; font-size: 0.75rem; }
`;

const PlayerInfo = styled.div`flex: 1; min-width: 0;`;

const PlayerNameRow = styled.div`
  font-size: 1rem; font-weight: bold; color: white;
  display: flex; align-items: center; gap: 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;

  ${L1024} { font-size: 0.95rem; }
  ${L768}  { font-size: 0.88rem; }
  ${LSm}   { font-size: 0.82rem; }
`;

const MeTag = styled.span`
  font-size: 0.8rem; color: #4cafff; font-weight: normal; flex-shrink: 0;
  ${LSm} { font-size: 0.72rem; }
`;

const PlayerStats = styled.div`
  display: flex; gap: 12px; margin-top: 0.25rem; flex-wrap: wrap;

  ${L768} { gap: 8px; margin-top: 0.15rem; }
  ${LSm}  { gap: 6px; }
`;

const StatIcon = styled.span`
  font-size: 0.85rem; color: rgba(255,255,255,0.8);

  ${L768} { font-size: 0.78rem; }
  ${LSm}  { font-size: 0.72rem; }
`;

const PokemonSection = styled.div`
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;

  ${L768} { gap: 0.25rem; }
`;

const PokemonCount = styled.div`
  font-size: 0.8rem; color: rgba(255,255,255,0.6);
  display: flex; align-items: center; gap: 4px;

  ${L768} { font-size: 0.72rem; }
  ${LSm}  { font-size: 0.68rem; }
`;

const LoadingDot = styled.span`
  font-size: 0.75rem; color: #4fc3f7;
  animation: ${blink} 1.2s ease infinite;
`;

const PokemonIcons = styled.div`
  display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end;

  ${L768} { gap: 3px; }
  ${LSm}  { gap: 2px; }
`;

const PokemonIconWrapper = styled.div`
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px;
`;

const PokemonIcon = styled.img<{ $isFainted: boolean }>`
  width: 38px; height: 38px; border-radius: 6px;
  background: rgba(0,0,0,0.3); object-fit: contain;
  filter: ${p => p.$isFainted ? 'grayscale(100%) opacity(0.35)' : 'none'};
  image-rendering: pixelated;
  border: 1px solid rgba(255,255,255,0.1);

  ${L1024} { width: 32px; height: 32px; }
  ${L768}  { width: 28px; height: 28px; }
  ${LSm}   { width: 24px; height: 24px; border-radius: 4px; }
`;

const MiniHpBar = styled.div`
  width: 38px; height: 3px;
  background: rgba(0,0,0,0.4); border-radius: 2px; overflow: hidden;

  ${L1024} { width: 32px; }
  ${L768}  { width: 28px; }
  ${LSm}   { width: 24px; height: 2px; }
`;

const MiniHpFill = styled.div<{ $pct: number; $fainted: boolean }>`
  height: 100%; border-radius: 2px;
  width: ${p => p.$pct}%;
  background: ${p => p.$fainted ? '#555' : p.$pct > 50 ? '#2ecc71' : p.$pct > 25 ? '#f39c12' : '#e74c3c'};
  transition: width 0.4s ease;
`;

const LvBadge = styled.div`
  font-size: 8px; color: rgba(255,255,255,0.5); line-height: 1;

  ${L768} { font-size: 7px; }
  ${LSm}  { font-size: 6px; }
`;

const PokemonPlaceholder = styled.div`
  width: 38px; height: 38px; border-radius: 6px;
  background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s infinite;
  border: 1px solid rgba(255,255,255,0.07);

  ${L768} { width: 28px; height: 28px; }
  ${LSm}  { width: 24px; height: 24px; }
`;

const DeadBadge = styled.div`
  position: absolute; top: 0.5rem; right: 0.5rem;
  font-size: 0.75rem; color: #ff6b6b;
  background: rgba(255,107,107,0.1);
  padding: 2px 8px; border-radius: 10px;
  border: 1px solid rgba(255,107,107,0.3);

  ${L768} { font-size: 0.68rem; padding: 2px 6px; }
  ${LSm}  { font-size: 0.62rem; padding: 1px 5px; top: 0.3rem; right: 0.3rem; }
`;

const Footer = styled.div`
  margin-top: 1rem; padding-top: 0.6rem;
  border-top: 1px solid rgba(255,255,255,0.07);
  text-align: center;

  ${L768} { margin-top: 0.6rem; padding-top: 0.4rem; }
  ${LSm}  { margin-top: 0.4rem; padding-top: 0.3rem; }
`;

const FooterNote = styled.div`
  font-size: 11px; color: rgba(255,255,255,0.3);
  ${L768} { font-size: 10px; }
`;