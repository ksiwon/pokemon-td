// src/components/modals/Wave50ClearModal.tsx

import React from 'react';
import styled from 'styled-components';
import { ModalOverlay, MODAL_ACCENT, ModalPlainBox, ModalPlainHeader } from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { btn, pixelBold, shadowLg } from '../../styles/pixel';

// ─── 반응형 헬퍼 ──────────────────────────────────────────────────────────────
const LSm   = lMedia.phoneSm;  // landscape + max-height ≤520px

interface Wave50ClearModalProps {
  onContinue: () => void;
  onRestart: () => void;
}

export const Wave50ClearModal: React.FC<Wave50ClearModalProps> = ({ onContinue, onRestart }) => {
  const { t } = useTranslation();

  return (
    <ModalOverlay $zIndex={1002}>
      <ModalPlainBox $size="sm" $accent={MODAL_ACCENT.gold} $animate="slideUp" $scroll>
        <Header>
          <Title><Emoji glyph="🎉" size={18} /> {t('waveClear.title')}! <Emoji glyph="🎉" size={18} /></Title>
        </Header>
        <Content>
          <CongratsText>
            {t('waveClear.subtitle')}
          </CongratsText>
          <Subtitle>
            {t('waveClear.prompt')}
          </Subtitle>
          <ButtonContainer>
            <ContinueBtn onClick={onContinue}>
              <Emoji glyph="🎮" size={14} /> {t('waveClear.continue')}
            </ContinueBtn>
            <RestartBtn onClick={onRestart}>
              <Emoji glyph="🔄" size={14} /> {t('waveClear.restart')}
            </RestartBtn>
          </ButtonContainer>
        </Content>
      </ModalPlainBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 그라디언트 텍스트 클리핑, 그라디언트 버튼, 글로우 그림자,
//           hover 떠오름, 둥근 모서리, letter-spacing.

const Header = styled(ModalPlainHeader)`
  text-align: center;
`;

const Title = styled.h2`
  ${pixelBold}
  font-size: ${FONT.display};
  margin: 0;
  color: ${C.gold};
  ${shadowLg}

  ${lMedia.phone} { font-size: ${FONT.xl}; }
  ${LSm}  { font-size: ${FONT.xl}; }
`;

/* 좌우 여백은 창이 갖는다 — 여기서 또 주면 본문이 제목보다 안쪽으로 들어간다. */
const Content = styled.div`
  padding: ${SP.lg} 0;
  text-align: center;

  ${lMedia.phone} { padding: ${SP.md} 0; }
  ${LSm}  { padding: ${SP.sm}; }
`;

const CongratsText = styled.p`
  ${pixelBold}
  font-size: ${FONT.xl};
  margin: 0 0 ${SP.md};
  color: ${C.gold};
  ${shadowLg}

  ${lMedia.phone} { font-size: ${FONT.sm}; margin: 0 0 ${SP.sm}; }
  ${LSm}  { font-size: ${FONT.sm}; margin: 0 0 ${SP.sm}; }
`;

const Subtitle = styled.p`
  font-size: ${FONT.sm};
  margin: 0 0 ${SP.xl};
  color: ${C.textSub};

  ${lMedia.phone} { margin: 0 0 ${SP.md}; }
  ${LSm}  { margin: 0 0 ${SP.sm}; }
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.md};
  align-items: center;

  ${lMedia.phone} { gap: ${SP.sm}; }
  ${LSm}  { gap: ${SP.sm}; }
`;

const BaseButton = styled.button`
  ${pixelBold}
  width: 100%;
  max-width: 400px;
  padding: ${SP.md} ${SP.lg};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }

  ${lMedia.phone} { max-width: 320px; padding: ${SP.sm} ${SP.md}; }
  ${LSm}  { max-width: 300px; padding: ${SP.sm}; }
`;

const ContinueBtn = styled(BaseButton)`
  ${btn('green')}
`;

const RestartBtn = styled(BaseButton)`
  ${btn('red')}
`;
