import React from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { winThin, btn, pixelBold } from '../../styles/pixel';
import { useGameStore } from '../../store/gameStore';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle,
  ModalScrollBody, ModalFooter, MODAL_ACCENT,
} from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';
import { media } from '../../utils/responsive.utils';
import { shopTier, wavesToNextTier } from '../../data/heldItems';
import { WORK_FREE_WITHDRAW_WAVES } from '../../utils/facility.utils';

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

  const waves = currentPrompt.waves;
  const tier = shopTier(waves);
  // 15웨이브(최고 등급)부터는 잠금이 풀려 웨이브 사이에 언제든 뺄 수 있다 → 마지막 안내
  const isFinal = waves >= WORK_FREE_WITHDRAW_WAVES;

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
              waves,
              tier,
            })}
          </Desc>
          <Desc>
            {isFinal
              ? t('work.milestoneFinal')
              : t('work.milestoneNext', { n: wavesToNextTier(waves), nextTier: tier + 1 })}
          </Desc>
          <WarnBox>{t('work.milestoneResetWarn', { waves })}</WarnBox>
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

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

const WarnBox = styled.div`
  ${winThin('gold')}
  margin-top: ${SP.sm};
  padding: ${SP.sm};
  color: ${C.gold};
  font-size: ${FONT.sm};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

const Desc = styled.p`
  margin: 0;
  font-size: ${FONT.sm};
  color: ${C.textSub};
  white-space: pre-line;
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  ${p => btn(p.$primary ? 'gold' : 'plain')}
  ${pixelBold}
  color: ${C.text};
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${SP.xs};
  &:focus, &:focus-visible { outline: none; }

  ${media.mobile} { flex: 1; }
`;
