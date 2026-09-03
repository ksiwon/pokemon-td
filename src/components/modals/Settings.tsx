// src/components/modals/Settings.tsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { lMedia, media } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  ModalScrollBody, MODAL_ACCENT,
} from '../shared/modal.styles';
import { useTranslation } from '../../i18n';
import { saveService } from '../../services/SaveService';
import { soundService } from '../../services/SoundService';
import { BugReport } from './BugReport';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { winThin, btnThin, sunken, pixelText, pixelBold, focusRing } from '../../styles/pixel';

export const Settings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, language, setLanguage } = useTranslation();

  const saved = saveService.load().settings;
  const [musicVolume, setMusicVolume] = useState(saved.musicVolume);
  const [showDamage, setShowDamage]   = useState(saved.showDamageNumbers);
  const [showGrid, setShowGrid]       = useState(saved.showGrid);
  const [showBugReport, setShowBugReport] = useState(false);

  const handleMusicVolume = (v: number) => {
    setMusicVolume(v);
    soundService.setMusicVolume(v);
    saveService.save({ settings: { ...saveService.load().settings, musicVolume: v } });
  };

  const handleShowDamage = (v: boolean) => {
    setShowDamage(v);
    saveService.save({ settings: { ...saveService.load().settings, showDamageNumbers: v } });
  };

  const handleShowGrid = (v: boolean) => {
    setShowGrid(v);
    saveService.save({ settings: { ...saveService.load().settings, showGrid: v } });
  };

  return (
    <>
      <ModalOverlay onClick={onClose}>
      <ModalBox $size="sm" $accent={MODAL_ACCENT.cyan} onClick={(e) => e.stopPropagation()}>

        <ModalHeader>
          <ModalTitle><Emoji glyph="⚙️" size={16} /> {t('settings.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </ModalHeader>


        <ModalScrollBody>
          <SettingsList>
          <SettingItem>
            <SettingLabel>
              <LabelIcon><Emoji glyph="🎵" size={15} /></LabelIcon>
              <LabelText>{t('settings.musicVolume')}</LabelText>
            </SettingLabel>
            <SliderWrapper>
              <SliderTrack>
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={musicVolume}
                  onChange={(e) => handleMusicVolume(parseFloat(e.target.value))}
                />
              </SliderTrack>
              <SliderVal>{Math.round(musicVolume * 100)}%</SliderVal>
            </SliderWrapper>
          </SettingItem>


          <SettingItem>
            <SettingLabel>
              <LabelIcon><Emoji glyph="🎯" size={15} /></LabelIcon>
              <LabelText>{t('settings.showDamage')}</LabelText>
            </SettingLabel>
            <ToggleWrapper>
              <ToggleSwitch $on={showDamage} onClick={() => handleShowDamage(!showDamage)}>
                <ToggleKnob $on={showDamage} />
              </ToggleSwitch>
              <ToggleLabel $on={showDamage}>{showDamage ? t('common.on') : t('common.off')}</ToggleLabel>
            </ToggleWrapper>
          </SettingItem>

          <SettingItem>
            <SettingLabel>
              <LabelIcon><Emoji glyph="🗺️" size={15} /></LabelIcon>
              <LabelText>{t('settings.showGrid')}</LabelText>
            </SettingLabel>
            <ToggleWrapper>
              <ToggleSwitch $on={showGrid} onClick={() => handleShowGrid(!showGrid)}>
                <ToggleKnob $on={showGrid} />
              </ToggleSwitch>
              <ToggleLabel $on={showGrid}>{showGrid ? t('common.on') : t('common.off')}</ToggleLabel>
            </ToggleWrapper>
          </SettingItem>

          <SettingItem>
            <SettingLabel>
              <LabelIcon><Emoji glyph="🌐" size={15} /></LabelIcon>
              <LabelText>{t('settings.language')}</LabelText>
            </SettingLabel>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ko')}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </Select>
          </SettingItem>
        </SettingsList>

        <BugReportButton onClick={() => setShowBugReport(true)}>
          <Emoji glyph="🐛" size={14} /> {t('settings.bugReport')}
        </BugReportButton>

        <DangerZone>
          <DangerLabel><Emoji glyph="⚠️" size={13} /> {t('settings.dangerZone')}</DangerLabel>
          <DangerButton onClick={() => {
            if (confirm(t('alerts.confirmReset'))) {
              saveService.clearSave();
              window.location.reload();
            }
          }}>{t('settings.resetData')}</DangerButton>
        </DangerZone>

          <CloseButton onClick={onClose}>{t('common.close')}</CloseButton>
        </ModalScrollBody>
      </ModalBox>
    </ModalOverlay>
    {showBugReport && <BugReport onClose={() => setShowBugReport(false)} />}
    </>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────

const SettingsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.sm};
  margin-bottom: ${SP.lg};

  ${media.mobile}   { gap: ${SP.xs}; margin-bottom: ${SP.md}; }
  ${lMedia.phoneSm} { gap: ${SP.xs}; margin-bottom: ${SP.md}; }
`;

/** 설정 한 줄 — 유리 카드가 아니라 한 단 파인 면. */
const SettingItem = styled.div`
  ${sunken()}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.md};

  ${media.mobile}   { padding: ${SP.sm}; flex-wrap: wrap; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm}; flex-wrap: wrap; gap: ${SP.sm}; }
`;

const SettingLabel = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.sm};
  flex-shrink: 0;
`;

const LabelIcon = styled.span`
  font-size: ${ICON.md}px; line-height: 1;
`;

const LabelText = styled.label`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
  white-space: nowrap;
  cursor: default;
`;

const SliderWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.sm};
  flex: 1;
  min-width: 0;
  max-width: 240px;

  ${media.mobile}   { max-width: 100%; width: 100%; flex: unset; }
  ${lMedia.phoneSm} { max-width: 100%; width: 100%; flex: unset; }
`;

const SliderTrack = styled.div`
  flex: 1;
  min-width: 0;

  input[type="range"] {
    width: 100%;
    accent-color: ${C.blue};
    cursor: pointer;
  }
`;

const SliderVal = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.blue};
  min-width: 40px;
  text-align: right;
`;

const ToggleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.sm};
`;

/**
 * 토글 — 알약 스위치가 아니라 각진 홈에 각진 손잡이.
 * iOS식 둥근 스위치는 웹앱 문법이라 도트 UI 안에서 혼자 튄다.
 */
const ToggleSwitch = styled.div<{ $on: boolean }>`
  width: 44px; height: 22px;
  background: ${p => (p.$on ? C.blue : C.panelSunk)};
  border: ${SCALE}px solid ${C.ink};
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
`;

const ToggleKnob = styled.div<{ $on: boolean }>`
  position: absolute;
  width: 16px; height: 16px;
  background: ${p => (p.$on ? C.text : C.divider)};
  border: 2px solid ${C.ink};
  top: 0;
  left: ${p => (p.$on ? '20px' : '0')};
`;

const ToggleLabel = styled.div<{ $on: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$on ? C.blue : C.textDim)};
  min-width: 28px;
`;

const Select = styled.select`
  ${sunken()}
  ${pixelText}
  padding: ${SP.xs} ${SP.sm};
  color: ${C.text};
  font-size: ${FONT.sm};
  cursor: pointer;
  outline: none;
  ${focusRing}

  option { background: ${C.panelSunk}; color: ${C.text}; }

  ${focusRing}

  ${media.mobile} { width: 100%; }
`;

const DangerZone = styled.div`
  ${winThin('red')}
  margin-bottom: ${SP.md};
  padding: ${SP.md};

  ${media.mobile}   { padding: ${SP.sm}; margin-bottom: ${SP.sm}; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; margin-bottom: ${SP.sm}; }
`;

/** uppercase eyebrow를 걷어낸 자리 — 그냥 붉은 라벨. */
const DangerLabel = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.red};
  margin-bottom: ${SP.sm};
`;

const DangerButton = styled.button`
  ${btnThin('red')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  color: ${C.red};
  font-size: ${FONT.sm};
  ${focusRing}
`;

const CloseButton = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  color: ${C.text};
  font-size: ${FONT.sm};
  ${focusRing}
`;

const BugReportButton = styled.button`
  ${btnThin('blue')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  color: ${C.blue};
  font-size: ${FONT.sm};
  margin-bottom: ${SP.md};
  ${focusRing}
`;
