// src/components/multiplayer/MultiplayerGameOverModal.tsx
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { lMedia} from '../../utils/responsive.utils';
import { PlayerGameState } from '../../types/multiplayer';
import { useTranslation } from '../../i18n';
import { ModalOverlay, ModalBox, MODAL_ACCENT } from '../shared/modal.styles';
import { cardService } from '../../services/CardService';

interface MultiplayerGameOverModalProps {
  players: PlayerGameState[];
  myUserId: string;
  onClose: () => void;
}

export const MultiplayerGameOverModal = ({
  players,
  myUserId,
  onClose
}: MultiplayerGameOverModalProps) => {
  const { t } = useTranslation();

  /**
   * [V8-FIX-13-2] 순위 결정 (Placement) 로직:
   * 1. 생존자(isAlive: true)가 탈락자보다 높은 순위.
   * 2. 탈락자들끼리는 탈락한 순서(placement 필드)대로 정렬.
   *    (placement는 탈락 시점의 생존자 수로 기록됨)
   * 3. 동일 조건일 경우 도달 웨이브(wave)가 높은 쪽이 우선.
   */
  const sortedPlayers = [...players].sort((a, b) => {
    // 생존자가 먼저
    if (a.isAlive && !b.isAlive) return -1;
    if (!a.isAlive && b.isAlive) return 1;
    // 둘 다 탈락했으면 placement로 정렬
    if (!a.isAlive && !b.isAlive) {
      return (a.placement || 999) - (b.placement || 999);
    }
    // 둘 다 생존이면 웨이브로 정렬
    return b.wave - a.wave;
  });

  const myPlayer = sortedPlayers.find(p => p.userId === myUserId);
  const myPlacement = sortedPlayers.findIndex(p => p.userId === myUserId) + 1;

  // [카드모드] 멀티 결과 보상 — 1회만. 순위 비례, 최하위도 위로금(0 방지).
  const rewardGiven = useRef(false);
  useEffect(() => {
    if (rewardGiven.current || myPlacement < 1) return;
    rewardGiven.current = true;
    // [경제] 멀티는 미니 포켓 재화의 최대 수급처 — 순위 비례 큰 보상(오토배틀 전 멀티 유도), 최하위도 위로금.
    const coins = Math.max(80, 300 - (myPlacement - 1) * 45);
    const starShards = myPlacement === 1 ? 40 : myPlacement <= 3 ? 20 : 8;
    cardService.grantRewards({ coins, starShards });
  }, [myPlacement]);

  return (
    <ModalOverlay>
      <ModalBox $size="lg" $accent={MODAL_ACCENT.blue} $animate="slideUp" $scroll>
        <Header>
          <Title>{t('multiGameOver.title')}</Title>
          <MyPlacement placement={myPlacement}>
            <Emoji glyph={myPlacement === 1 ? '🏆' : myPlacement === 2 ? '🥈' : myPlacement === 3 ? '🥉' : '📊'} size={18} />{' '}
            {t('multiGameOver.placement', { rank: myPlacement })}
          </MyPlacement>
        </Header>

        <ResultsTable>
          <TableHeader>
            <HeaderCell>{t('multiGameOver.colRank')}</HeaderCell>
            <HeaderCell>{t('multiGameOver.colPlayer')}</HeaderCell>
            <HeaderCell>{t('multiGameOver.colWave')}</HeaderCell>
            <HeaderCell>{t('multiGameOver.colRating')}</HeaderCell>
            <HeaderCell>{t('multiGameOver.colChange')}</HeaderCell>
          </TableHeader>

          {sortedPlayers.map((player, index) => {
            const isMe = player.userId === myUserId;
            const placement = index + 1;
            const ratingChange = player.ratingChange || 0;

            return (
              <PlayerRow key={player.userId} isMe={isMe}>
                <Cell>
                  <Rank placement={placement}>
                  {placement <= 3
                    ? <Emoji glyph={placement === 1 ? '🏆' : placement === 2 ? '🥈' : '🥉'} size={16} />
                    : t('multiGameOver.rankSuffix', { rank: placement })}
                  </Rank>
                </Cell>
                <Cell>
                  <PlayerName>{player.userName}</PlayerName>
                </Cell>
                <Cell>
                  <Wave>{t('multiGameOver.waveLabel', { wave: player.wave })}</Wave>
                </Cell>
                <Cell>
                  <Rating>{player.rating}</Rating>
                </Cell>
                <Cell>
                  <RatingChange positive={ratingChange >= 0}>
                    {ratingChange >= 0 ? '+' : ''}{ratingChange}
                  </RatingChange>
                </Cell>
              </PlayerRow>
            );
          })}
        </ResultsTable>

        {myPlayer && (
          <Summary>
            <SummaryTitle>{t('multiGameOver.myStats')}</SummaryTitle>
            <SummaryStats>
              <SummaryStat>
                <StatLabel>{t('multiGameOver.finalWave')}</StatLabel>
                <StatValue>{myPlayer.wave}</StatValue>
              </SummaryStat>
              <SummaryStat>
                <StatLabel>{t('multiGameOver.livesLeft')}</StatLabel>
                <StatValue>{myPlayer.lives}</StatValue>
              </SummaryStat>
              <SummaryStat>
                <StatLabel>{t('multiGameOver.towersPlaced')}</StatLabel>
                <StatValue>{myPlayer.towers}</StatValue>
              </SummaryStat>
              <SummaryStat>
                <StatLabel>{t('multiGameOver.goldLeft')}</StatLabel>
                <StatValue>{myPlayer.money}</StatValue>
              </SummaryStat>
            </SummaryStats>
          </Summary>
        )}

        <ButtonRow>
          <BackButton onClick={onClose}>
            {t('multiGameOver.backToMenu')}
          </BackButton>
        </ButtonRow>
      </ModalBox>
    </ModalOverlay>
  );
};



const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  ${lMedia.phone} {
    padding: 20px 22px 14px;
  }
  ${lMedia.phoneSm} {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 16px 18px 12px;
  }
`;

const Title = styled.h2`
  font-size: 28px;
  color: white;
  font-weight: 800;
  text-shadow: 0 0 20px rgba(76, 175, 255, 0.5);
  ${lMedia.phone} {
    font-size: 22px;
  }
  ${lMedia.phoneSm} {
    font-size: 18px;
  }
`;

const MyPlacement = styled.div<{ placement: number }>`
  font-size: 32px;
  font-weight: bold;
  color: ${props => {
    if (props.placement === 1) return '#FFD700';
    if (props.placement === 2) return '#C0C0C0';
    if (props.placement === 3) return '#CD7F32';
    return '#4cafff';
  }};
  text-shadow: 0 0 15px ${props => {
    if (props.placement === 1) return 'rgba(255, 215, 0, 0.6)';
    if (props.placement === 2) return 'rgba(192, 192, 192, 0.6)';
    if (props.placement === 3) return 'rgba(205, 127, 50, 0.6)';
    return 'rgba(76, 175, 255, 0.6)';
  }};
  ${lMedia.phoneSm} {
    font-size: 1.4rem;
  }
`;

const ResultsTable = styled.div`
  margin-bottom: 32px;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr 1.5fr 1.5fr 1.5fr;
  gap: 16px;
  padding: 16px;
  background: rgba(76, 175, 255, 0.1);
  border-radius: 10px 10px 0 0;
  border: 2px solid rgba(76, 175, 255, 0.3);
  border-bottom: none;
  ${lMedia.phone} {
    grid-template-columns: 0.8fr 2fr 1.2fr 1.2fr 1.2fr;
    gap: 8px;
    padding: 13px;
  }
  ${lMedia.phoneSm} {
    grid-template-columns: 0.6fr 2fr 1fr;
    gap: 6px;
    padding: 10px 13px;
  }
`;

const HeaderCell = styled.div`
  font-size: 0.9rem;
  color: rgba(255,255,255,0.7);
  font-weight: bold;
  text-align: center;
  ${lMedia.phoneSm} {
    font-size: 12px;
  }
`;

const PlayerRow = styled.div<{ isMe: boolean }>`
  display: grid;
  grid-template-columns: 1fr 2fr 1.5fr 1.5fr 1.5fr;
  gap: 16px;
  padding: 20px 16px;
  background: ${props => props.isMe ? 'linear-gradient(90deg, rgba(76, 175, 255, 0.2), rgba(76, 175, 255, 0.05))' : 'rgba(255,255,255,0.02)'};
  border: 2px solid ${props => props.isMe ? 'rgba(76, 175, 255, 0.4)' : 'rgba(255,255,255,0.1)'};
  border-top: none;
  transition: background 0.2s;

  @media (hover: hover) {
    &:hover {
      background: ${props => props.isMe ? 'linear-gradient(90deg, rgba(76, 175, 255, 0.3), rgba(76, 175, 255, 0.1))' : 'rgba(255,255,255,0.05)'};
    }
  }

  &:last-child {
    border-radius: 0 0 10px 10px;
  }
  ${lMedia.phone} {
    grid-template-columns: 0.8fr 2fr 1.2fr 1.2fr 1.2fr;
    gap: 8px;
    padding: 16px 13px;
  }
  ${lMedia.phoneSm} {
    grid-template-columns: 0.6fr 2fr 1fr;
    gap: 6px;
    padding: 12px 13px;
  }
`;

const Cell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Rank = styled.div<{ placement: number }>`
  font-size: 1.3rem;
  font-weight: bold;
  color: ${props => {
    if (props.placement === 1) return '#FFD700';
    if (props.placement === 2) return '#C0C0C0';
    if (props.placement === 3) return '#CD7F32';
    return 'white';
  }};
`;

const PlayerName = styled.div`
  font-size: 18px;
  color: white;
  font-weight: 600;
`;

const Wave = styled.div`
  font-size: 16px;
  color: rgba(255,255,255,0.9);
`;

const Rating = styled.div`
  font-size: 18px;
  color: #ffd700;
  font-weight: bold;
  ${lMedia.phoneSm} {
    display: none;
  }
`;

const RatingChange = styled.div<{ positive: boolean }>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.positive ? '#4caf50' : '#f44336'};
  ${lMedia.phoneSm} {
    display: none;
  }
`;

const Summary = styled.div`
  background: rgba(76, 175, 255, 0.05);
  border: 2px solid rgba(76, 175, 255, 0.3);
  border-radius: 15px;
  padding: 24px;
  margin-bottom: 32px;
`;

const SummaryTitle = styled.h3`
  font-size: 1.3rem;
  color: white;
  margin-bottom: 16px;
  font-weight: bold;
`;

const SummaryStats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  ${lMedia.phone} {
    grid-template-columns: repeat(2, 1fr);
  }
  ${lMedia.phoneSm} {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
`;

const SummaryStat = styled.div`
  text-align: center;
  padding: 16px;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
`;

const StatLabel = styled.div`
  font-size: 0.85rem;
  color: rgba(255,255,255,0.6);
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 24px;
  color: white;
  font-weight: bold;
  ${lMedia.phoneSm} {
    font-size: 19px;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
`;

const BackButton = styled.button`
  padding: 16px 48px;
  font-size: 19px;
  background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  color: white;
  border: 3px solid rgba(46, 204, 113, 0.4);
  border-radius: 15px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 8px 32px rgba(46, 204, 113, 0.5);
  transition: background 0.2s;

  @media (hover: hover) {
    &:hover {
      background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
      transform: translateY(-2px);
      box-shadow: 0 12px 40px rgba(46, 204, 113, 0.6);
    }
  }
`;