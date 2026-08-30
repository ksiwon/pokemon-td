// src/components/modals/BugReport.tsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { btn, sunken, pixelText, pixelBold } from '../../styles/pixel';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  ModalScrollBody, MODAL_ACCENT,
} from '../shared/modal.styles';
import emailjs from '@emailjs/browser';

interface BugReportProps {
  onClose: () => void;
}

export const BugReport: React.FC<BugReportProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
  });
  const [isSending, setIsSending] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);

    try {
      await emailjs.send(
        'service_ymdrp77',
        'template_0gc815a',
        {
          name: 'Anonymous Player',
          title: formData.subject,
          message: formData.message,
          // 수신 메일(템플릿 To Email = getosukuri@gmail.com 또는 {{to_email}})
          to_email: 'getosukuri@gmail.com',
        },
        'gjdzeRNJdHhXF2hZu'
      );
      
      showToast(t('settings.bugReportSuccess'), 'success');
      onClose();
    } catch (error) {
      console.error('Email sending failed:', error);
      showToast(t('settings.bugReportFail'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="sm" $accent={MODAL_ACCENT.cyan} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle><Emoji glyph="🐛" size={16} /> {t('settings.bugReportTitle')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </ModalHeader>

        <ModalScrollBody>
          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <Label htmlFor="bug-subject">{t('settings.bugSubject')} *</Label>
              <Input
                type="text"
                id="bug-subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                placeholder={t('settings.bugSubjectPlaceholder')}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="bug-message">{t('settings.bugMessage')} *</Label>
              <TextArea
                id="bug-message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                placeholder={t('settings.bugMessagePlaceholder')}
              />
            </FormGroup>

            <SubmitButton type="submit" disabled={isSending}>
              {isSending ? t('settings.bugSending') : t('settings.bugSend')}
            </SubmitButton>
          </Form>
        </ModalScrollBody>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.xs};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.xs};
`;

const Label = styled.label`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
`;

/** 입력칸 — 한 단 파인 면. 유리 인풋을 걷어냈다. */
const Input = styled.input`
  ${sunken()}
  ${pixelText}
  width: 100%;
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
  outline: none;
  box-sizing: border-box;

  &:focus { outline: none; }
  &::placeholder { color: ${C.textDim}; }
`;

const TextArea = styled.textarea`
  ${sunken()}
  ${pixelText}
  width: 100%;
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
  outline: none;
  resize: vertical;
  box-sizing: border-box;

  &:focus { outline: none; }
  &::placeholder { color: ${C.textDim}; }
`;

const SubmitButton = styled.button`
  ${btn('blue')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  color: ${C.text};
  font-size: ${FONT.sm};
  margin-top: ${SP.sm};
  &:focus, &:focus-visible { outline: none; }
`;
