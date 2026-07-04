// src/components/modals/BugReport.tsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { Emoji } from '../shared/Emoji';
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
      
      alert(t('settings.bugReportSuccess'));
      onClose();
    } catch (error) {
      console.error('Email sending failed:', error);
      alert(t('settings.bugReportFail'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="sm" $accent={MODAL_ACCENT.cyan} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle><Emoji glyph="🐛" size={16} /> {t('settings.bugReportTitle')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}><Emoji glyph="❌" size={14} /></ModalCloseBtn>
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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 4px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-size: 0.9rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  outline: none;
  transition: border-color 0.2s, background 0.2s;

  &:focus {
    border-color: rgba(79, 195, 247, 0.5);
    background: rgba(79, 195, 247, 0.08);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  font-size: 0.9rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  outline: none;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s, background 0.2s;

  &:focus {
    border-color: rgba(79, 195, 247, 0.5);
    background: rgba(79, 195, 247, 0.08);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 12px;
  background: #4fc3f7;
  color: #121824;
  font-weight: 700;
  font-size: 14px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  margin-top: 8px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    opacity: 0.9;
  }

  &:not(:disabled):active {
    transform: scale(0.98);
  }
`;
