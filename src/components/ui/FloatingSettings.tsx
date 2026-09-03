import React, { useState } from 'react';
import styled from 'styled-components';
import { lMedia} from '../../utils/responsive.utils';
import { Settings } from '../modals/Settings';
import { Emoji } from '../shared/Emoji';
import { useTranslation } from '../../i18n';
import { C, ICON } from '../../styles/tokens';
import { btnThin, focusRing } from '../../styles/pixel';

/**
 * 화면 오른쪽 아래에 늘 떠 있는 설정 버튼.
 * 원형 + blur 였던 걸 얇은 창틀로 바꿨다 — docs/DESIGN.md.
 */
const FloatingBtn = styled.button`
  ${btnThin('plain')}
  position: fixed;
  bottom: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  padding: 0;
  color: ${C.text};
  font-size: ${ICON.lg}px;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  touch-action: manipulation;
  ${focusRing}

  ${lMedia.phoneSm} {
    width: 32px;
    height: 32px;
    font-size: ${ICON.md}px;
    bottom: 8px;
    right: 8px;
  }
`;

export const FloatingSettings: React.FC = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <>
      <FloatingBtn onClick={() => setShow(true)} title={t('settings.title')}>
        <Emoji glyph="⚙️" size={18} />
      </FloatingBtn>
      {show && <Settings onClose={() => setShow(false)} />}
    </>
  );
};
