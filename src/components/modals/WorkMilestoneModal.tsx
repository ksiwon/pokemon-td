import React from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle,
  ModalScrollBody, ModalFooter, MODAL_ACCENT,
} from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';
import { media } from '../../utils/responsive.utils';

export const WorkMilestoneModal: React.FC = () => {
  const { t } = useTranslation();
  const queue = useGameStore(state => state.clerkOrScoutPromptQueue);
  const resolvePrompt = useGameStore(state => state.resolveClerkOrScoutPrompt);

  if (queue.length === 0) return null;

  const currentPrompt = queue[0];

  const handleChoice = (withdraw: boolean) => {
    const res = resolvePrompt(currentPrompt.towerId, withdraw);
    if (!res.success && res.message) {
      showToast(t(res.message));
    }
  };

  const facilityName = currentPrompt.facilityKey === 'shop'
    ? t('work.facilityShop')
    : t('work.facilityContest');

  return (
    <ModalOverlay $zIndex={2000}>
      <ModalBox $size="sm" $accent={MODAL_ACCENT.gold} $animate="slideUp">
        <ModalHeader>
          <ModalTitle>
            <Emoji glyph="🏪" size={20} /> {t('work.milestoneTitle')}
          </ModalTitle>
        </ModalHeader>
        <ModalScrollBody>
          <Desc>
            {t('work.milestoneDesc', {
              name: currentPrompt.pokemonName,
              facility: facilityName,
              waves: currentPrompt.waves,
            })}
          </Desc>
        </ModalScrollBody>
        <ModalFooter>
          <ActionBtn onClick={() => handleChoice(true)} $primary>
            <Emoji glyph="🎒" size={14} /> {t('work.btnWithdraw')}
          </ActionBtn>
          <ActionBtn onClick={() => handleChoice(false)}>
            <Emoji glyph="⏳" size={14} /> {t('work.btnContinue')}
          </ActionBtn>
        </ModalFooter>
      </ModalBox>
    </ModalOverlay>
  );
};

const Desc = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #e2e8f0;
  white-space: pre-line;
  ${media.mobile} {
    font-size: 12px;
  }
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary
    ? 'linear-gradient(135deg, #f39c12 0%, #d35400 100%)'
    : 'linear-gradient(135deg, #34495e 0%, #2c3e50 100%)'};
  border: 1px solid ${p => p.$primary ? '#f39c12' : '#34495e'};
  box-shadow: 0 4px 6px rgba(0,0,0,0.15);
  color: white;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.1s ease, filter 0.15s ease;

  &:hover { filter: brightness(1.1); }
  &:active { transform: scale(0.98); }

  ${media.mobile} {
    flex: 1;
    padding: 12px;
    font-size: 12px;
  }
`;
