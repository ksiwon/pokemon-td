// src/components/modals/BugReport.tsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { btn, sunken, pixelText, pixelBold, focusRing } from '../../styles/pixel';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  ModalScrollBody, MODAL_ACCENT,
} from '../shared/modal.styles';

// 포케리듬·레디언트와 같은 EmailJS 서비스·서식을 쓴다 — 받는 함이 하나라
// 제목 머리의 [게임 이름]으로 어느 게임 제보인지 가른다. 서식을 바꾸면 셋을 같이 바꿀 것.
// `@emailjs/browser`는 이 fetch 한 번을 감싼 것뿐이라 라이브러리 없이 REST로 부른다(포케리듬과 같음).
// 열쇠는 EmailJS가 공개용으로 준 public key다 — 받는 주소는 EmailJS 쪽 템플릿에 잠겨 있다.
const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_SERVICE = 'service_ymdrp77';
const EMAILJS_TEMPLATE = 'template_0gc815a';
const EMAILJS_PUBLIC_KEY = 'gjdzeRNJdHhXF2hZu';
const TO = 'getosukuri@gmail.com';

const MAX_TITLE = 60;
const MAX_BODY = 2000;

/** 사람이 안 적어 주는 것들. 개인을 가릴 것은 담지 않는다 — 판·언어·창 크기·브라우저까지 */
function machine(language: string): string {
  return [
    `판 ${__APP_VERSION__}`,
    `언어 ${language}`,
    `창 ${window.innerWidth}×${window.innerHeight}`,
    navigator.userAgent,
  ].join('\n');
}

interface BugReportProps {
  onClose: () => void;
}

export const BugReport: React.FC<BugReportProps> = ({ onClose }) => {
  const { t, language } = useTranslation();
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
    const subject = formData.subject.trim();
    const message = formData.message.trim();
    if (isSending || !subject || !message) return;
    setIsSending(true);

    try {
      const res = await fetch(EMAILJS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE,
          template_id: EMAILJS_TEMPLATE,
          user_id: EMAILJS_PUBLIC_KEY,
          template_params: {
            name: '아이기스 플레이어',
            title: `[아이기스] ${subject.slice(0, MAX_TITLE)}`,
            message: `${message.slice(0, MAX_BODY)}\n\n────────\n${machine(language)}`,
            to_email: TO,
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

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
                maxLength={MAX_TITLE}
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
                maxLength={MAX_BODY}
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
  ${focusRing}
  box-sizing: border-box;

  ${focusRing}
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
  ${focusRing}
  resize: vertical;
  box-sizing: border-box;

  ${focusRing}
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
  ${focusRing}
`;
