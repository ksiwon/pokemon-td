// src/components/multiplayer/MultiplayerGameOverModal.tsx
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { lMedia} from '../../utils/responsive.utils';
import { PlayerGameState } from '../../types/multiplayer';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, btn, sunken, pixelBold, shadowLg } from '../../styles/pixel';
import { ModalOverlay, MODAL_ACCENT, ModalPlainBox, ModalPlainHeader } from '../shared/modal.styles';
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
      <ModalPlainBox $size="lg" $accent={MODAL_ACCENT.blue} $animate="slideUp" $scroll>
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
      </ModalPlainBox>
    </ModalOverlay>
  );
};


// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 행, 그라디언트 버튼·행, 글로우 그림자, 둥근 모서리,
//           hover 떠오름, rem 단위 글자.

/** 순위 색 — 1~3위 메달, 그 외 파랑. */
const rankColor = (placement: number) =>
  placement === 1 ? C.gold :
  placement === 2 ? '#c5cbd8' :
  placement === 3 ? '#c08a4a' : C.blue;

const Header = styled(ModalPlainHeader)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${SP.md};
  ${lMedia.phoneSm} {
    flex-direction: column;
    align-items: flex-start;
    gap: ${SP.sm};
  }
`;

const Title = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl};
  color: ${C.text};
  margin: 0;
  ${shadowLg}
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const MyPlacement = styled.div<{ placement: number }>`
  ${pixelBold}
  font-size: ${FONT.xl};
  color: ${props => rankColor(props.placement)};
  ${shadowLg}
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const ResultsTable = styled.div`
  margin-bottom: ${SP.xl};
  border: ${SCALE}px solid ${C.ink};
`;

const TableHeader = styled.div`
  ${pixelBold}
  display: grid;
  grid-template-columns: 1fr 2fr 1.5fr 1.5fr 1.5fr;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  ${lMedia.phone} {
    grid-template-columns: 0.8fr 2fr 1.2fr 1.2fr 1.2fr;
    gap: ${SP.sm};
  }
  ${lMedia.phoneSm} {
    grid-template-columns: 0.6fr 2fr 1fr;
    gap: ${SP.xs};
  }
`;

const HeaderCell = styled.div`
  font-size: ${FONT.sm};
  color: ${C.gold};
  text-shadow: 1px 1px 0 ${C.textShadow};
  text-align: center;
`;

const PlayerRow = styled.div<{ isMe: boolean }>`
  display: grid;
  grid-template-columns: 1fr 2fr 1.5fr 1.5fr 1.5fr;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.md};
  background: ${props => (props.isMe ? C.panelSunk : 'transparent')};
  border-bottom: 2px solid ${C.ink};
  &:last-child { border-bottom: none; }
  ${lMedia.phone} {
    grid-template-columns: 0.8fr 2fr 1.2fr 1.2fr 1.2fr;
    gap: ${SP.sm};
  }
  ${lMedia.phoneSm} {
    grid-template-columns: 0.6fr 2fr 1fr;
    gap: ${SP.xs};
  }
`;

const Cell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Rank = styled.div<{ placement: number }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${props => (props.placement <= 3 ? rankColor(props.placement) : C.text)};
`;

const PlayerName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
`;

const Wave = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const Rating = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  ${lMedia.phoneSm} { display: none; }
`;

const RatingChange = styled.div<{ positive: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${props => (props.positive ? C.green : C.red)};
  ${lMedia.phoneSm} { display: none; }
`;

const Summary = styled.div`
  ${winThin('blue')}
  padding: ${SP.md};
  margin-bottom: ${SP.xl};
`;

const SummaryTitle = styled.h3`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
  margin: 0 0 ${SP.md};
`;

const SummaryStats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${SP.md};
  ${lMedia.phone}   { grid-template-columns: repeat(2, 1fr); }
  ${lMedia.phoneSm} { grid-template-columns: repeat(2, 1fr); gap: ${SP.sm}; }
`;

const SummaryStat = styled.div`
  ${sunken()}
  text-align: center;
  padding: ${SP.md};
`;

const StatLabel = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
  margin-bottom: ${SP.xs};
`;

const StatValue = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: center;
  gap: ${SP.md};
`;

const BackButton = styled.button`
  ${btn('green')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.xxl};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }
`;
