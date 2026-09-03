// src/components/modals/EvolutionConfirmModal.tsx

import React from 'react';
import styled from 'styled-components';
import { lMedia } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import { useTranslation } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { btn, pixelBold, shadowLg, focusRing } from '../../styles/pixel';
import { useGameStore } from '../../store/gameStore';
import { ModalOverlay, MODAL_ACCENT, ModalPlainBox, ModalPlainHeader } from '../shared/modal.styles';

// ─── 반응형 헬퍼 ──────────────────────────────────────────────────────────────
const LSm   = lMedia.phoneSm;  // landscape + max-height ≤520px

export const EvolutionConfirmModal: React.FC = () => {
  const { t } = useTranslation();
  const evolutionConfirmQueue = useGameStore(state => state.evolutionConfirmQueue || []);
  const towers = useGameStore(state => state.towers);
  const evolvePokemon = useGameStore(state => state.evolvePokemon);

  if (evolutionConfirmQueue.length === 0) return null;

  const current = evolutionConfirmQueue[0];
  const tower = towers.find(t => t.id === current.towerId);

  if (!tower) return null;

  const handleEvolve = async (targetId: number) => {
    await evolvePokemon(current.towerId, undefined, targetId);
  };

  const handleCancel = () => {
    useGameStore.setState(state => ({
      evolutionConfirmQueue: state.evolutionConfirmQueue.slice(1)
    }));
  };

  return (
    <ModalOverlay>
      <ModalPlainBox $size="sm" $accent={MODAL_ACCENT.gold} $animate="slideUp" $scroll>
        <Title><Emoji glyph="✨" size={16} /> {t('evoConfirm.title')}</Title>
        <Sprite src={tower.sprite} alt={tower.displayName} />
        <Message>
          <strong>{tower.displayName}</strong>{t('evoConfirm.messageSuffix')}
        </Message>

        <Options>
          {current.evolutionOptions.map((option) => (
            <EvolveBtn
              key={option.targetId}
              onClick={() => handleEvolve(option.targetId)}
            >
              <EvolveBtnContent>
                <EvolveBtnTitle><Emoji glyph="✨" size={13} /> {t('evoConfirm.evolveTo', { name: option.targetName })}</EvolveBtnTitle>
                <EvolveBtnMethod>{option.method}</EvolveBtnMethod>
              </EvolveBtnContent>
            </EvolveBtn>
          ))}
        </Options>

        <CancelBtn onClick={handleCancel}>
          <Emoji glyph="❌" size={13} /> {t('evoConfirm.cancel')}
        </CancelBtn>
      </ModalPlainBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

/** 이 창은 Header가 따로 없어 제목이 그대로 띠가 된다. */
const Title = styled(ModalPlainHeader).attrs({ as: 'h2' })`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl};
  text-align: center;
  color: ${C.gold};

  ${lMedia.phone} { font-size: ${FONT.sm}; }
  ${LSm}  { font-size: ${FONT.sm}; }
`;

const Sprite = styled.img`
  width: 120px;
  height: 120px;
  display: block;
  margin: 0 auto ${SP.md};
  image-rendering: pixelated;

  ${lMedia.tablet} { width: 96px; height: 96px; }
  ${lMedia.phone}  { width: 80px; height: 80px; }
  ${LSm}   { width: 64px; height: 64px; }
`;

const Message = styled.p`
  font-size: ${FONT.sm};
  text-align: center;
  margin: 0 0 ${SP.lg};
  color: ${C.textSub};

  strong { color: ${C.text}; font-weight: 700; }

  ${lMedia.phone} { margin: 0 0 ${SP.md}; }
  ${LSm}  { margin: 0 0 ${SP.sm}; }
`;

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.sm};
  margin-bottom: ${SP.lg};

  ${lMedia.phone} { margin-bottom: ${SP.md}; }
  ${LSm}  { margin-bottom: ${SP.sm}; }
`;

const EvolveBtn = styled.button`
  ${btn('gold')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
  ${focusRing}
`;

const EvolveBtnContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.xs};
`;

const EvolveBtnTitle = styled.span`
  font-size: ${FONT.sm};
`;

const EvolveBtnMethod = styled.span`
  font-size: ${FONT.sm};
  color: ${C.textSub};
  font-weight: 400;
`;

const CancelBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
  ${focusRing}
`;
