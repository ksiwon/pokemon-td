// src/components/story/StoryEnding.tsx
// 스토리 챕터 클리어 후 엔딩 대사 화면
// 다 보면 onComplete() 콜백 → 챕터 해금 + /story 이동

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { btnThin, pixelText, pixelBold, shadowLg, focusRing } from '../../styles/pixel';
import { StoryChapter, DialogueLine } from '../../data/storyChapters';
import { useTranslation } from '../../i18n';

interface StoryEndingProps {
  chapter: StoryChapter;
  onComplete: () => void; // 전부 본 후 호출
}

const CHAR_SPEED = 28;

const SPEAKER_SPRITES: Record<string, string> = {
  루카리오:  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png`,
  스라크:    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/123.png`,
  라티아스:  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/380.png`,
  라티오스:  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/381.png`,
  레지락:    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/377.png`,
  레지아이스:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/378.png`,
  프리져:    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/144.png`,
  엘레이드:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/475.png`,
  군주:      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/487.png`,
  '???':     `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/381.png`,
};

const BG_IMAGES: Record<string, string> = {
  easiest_straight:       '/images/maps/easiest_straight.webp',
  easy_loop:              '/images/maps/easy_loop.webp',
  extreme_aggro_shortcut: '/images/maps/extreme_aggro_shortcut.webp',
  medium_multi_s:         '/images/maps/medium_multi_s.webp',
  medium_merge:           '/images/maps/medium_merge.webp',
  hard_straight_wide:     '/images/maps/hard_straight_wide.webp',
  hard_dual_path:         '/images/maps/hard_dual_path.webp',
  extreme_central:        '/images/maps/extreme_central.webp',
};

export const StoryEnding: React.FC<StoryEndingProps> = ({ chapter, onComplete }) => {
  const lines = chapter.endingDialogue;
  const { t, language } = useTranslation();
  const [lineIdx, setLineIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(false);
  const [visible, setVisible] = useState(false);
  // [FIX-2] canProceedRef — 타이핑 완료 후에만 다음 줄 진행 허용
  const canProceedRef = useRef(false);

  const currentLine: DialogueLine | undefined = lines[lineIdx];
  // 언어(ko/en)에 따라 대사·화자 선택. textEn/speakerEn 없으면 한글로 폴백.
  const lineText = currentLine
    ? (language === 'en' && currentLine.textEn ? currentLine.textEn : currentLine.text)
    : '';
  const speakerName = currentLine
    ? (language === 'en' ? currentLine.speakerEn : currentLine.speaker)
    : '';

  const bgSrc = BG_IMAGES[chapter.mapId] ?? '';
  const spriteUrl = currentLine
    ? SPEAKER_SPRITES[currentLine.speaker]
      ?? (currentLine.pokemonId
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${currentLine.pokemonId}.png`
        : null)
    : null;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // 타이프라이터 + canProceedRef
  useEffect(() => {
    if (!currentLine) return;
    setDisplayed('');
    setTyping(true);
    canProceedRef.current = false; // [FIX-2] 새 줄 시작 → 진행 잠금
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(lineText.slice(0, i));
      if (i >= lineText.length) {
        clearInterval(id);
        setTyping(false);
        canProceedRef.current = true; // [FIX-2] 타이핑 완료 → 진행 허용
      }
    }, CHAR_SPEED);
    return () => clearInterval(id);
  }, [lineIdx, currentLine, lineText]);

  const advance = useCallback(() => {
    if (typing) {
      // 타이핑 스킵
      setDisplayed(lineText);
      setTyping(false);
      canProceedRef.current = true; // [FIX-2] 스킵 후 즉시 진행 허용
      return;
    }
    // [FIX-2] 진행 잠금 확인
    if (!canProceedRef.current) return;
    canProceedRef.current = false;

    if (lineIdx < lines.length - 1) {
      setLineIdx(p => p + 1);
    } else {
      onComplete();
    }
  }, [typing, lineIdx, lines.length, currentLine, lineText, onComplete]);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') advance();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  const isLastLine = lineIdx === lines.length - 1;

  return (
    <Root $visible={visible}>
      {/* 배경 */}
      <BgImg src={bgSrc} />
      <BgDim />
      <BgVignette />

      {/* 클리어 배너 */}
      <ClearBanner>
        <ClearEyebrow>CHAPTER {String(chapter.chapterNumber).padStart(2,'0')} CLEAR</ClearEyebrow>
        <ClearTitle $accent={chapter.theme.primary}>{language === 'en' && chapter.titleEn ? chapter.titleEn : chapter.title}</ClearTitle>
      </ClearBanner>

      {/* 스킵 버튼 */}
      <SkipBtn onClick={e => { e.stopPropagation(); onComplete(); }}>
        SKIP ▶
      </SkipBtn>

      {/* 캐릭터 스프라이트 */}
      <CharacterArea>
        {spriteUrl && (
          <CharSprite
            key={`end-${lineIdx}`}
            src={spriteUrl}
            alt={currentLine?.speaker ?? ''}
          />
        )}
      </CharacterArea>

      {/* 텍스트 박스 */}
      {currentLine && (
        <TextBox onClick={e => { e.stopPropagation(); advance(); }}>
          <TextBoxInner>
            <SpeakerLabel $isEnemy={false}>
              {speakerName}
            </SpeakerLabel>
            <DialogueText>
              {displayed}
              {typing && <Cursor />}
            </DialogueText>
          </TextBoxInner>
          <ProgressRow>
            {lines.map((_, i) => (
              <ProgDot key={i} $active={i === lineIdx} $past={i < lineIdx} />
            ))}
            <AdvanceCue $visible={!typing}>
              {isLastLine
                ? (chapter.chapterNumber < 8 ? t('storyUI.unlockNext') : t('storyUI.finale'))
                : t('storyUI.next')}
            </AdvanceCue>
          </ProgressRow>
        </TextBox>
      )}
    </Root>
  );
};

// ─── Animations ───────────────────────────────────────────────────────────────

const blink = keyframes`0%,100%{opacity:1}50%{opacity:0}`;
const charSlideIn = keyframes`from{opacity:0;transform:translateX(-20px) scale(0.92)}to{opacity:1;transform:translateX(0) scale(1)}`;
const panBg = keyframes`from{transform:scale(1.06)}to{transform:scale(1.0)}`;
const bannerReveal = keyframes`from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}`;

// ─── Styled Components ────────────────────────────────────────────────────────

const Root = styled.div<{ $visible: boolean }>`
  position:fixed; inset:0; z-index:3000;
  /* 불투명 베이스 — 가로형 BgImg가 세로 화면을 못 덮을 때 뒤 화면 비침 방지 */
  background:#05060a;
  cursor:pointer; user-select:none; overflow:hidden;
  opacity:${p => p.$visible ? 1 : 0};
  transition:opacity 0.7s ease;
`;

const BgImg = styled.img`
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; opacity:0.45;
  animation:${panBg} 25s ease-out both;
  pointer-events:none;
`;

const BgDim = styled.div`
  position:absolute; inset:0; background:rgba(0,0,0,0.65); pointer-events:none;
`;

const BgVignette = styled.div`
  position:absolute; inset:0;
  background:radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,0.9) 100%);
  pointer-events:none;
`;

const ClearBanner = styled.div`
  position:absolute; top:32px; left:0; right:0;
  text-align:center; pointer-events:none;
  animation:${bannerReveal} 0.8s ease 0.3s both;
`;

const ClearEyebrow = styled.div`
  font-size:11px; font-weight:800; letter-spacing:0.4em;
  color:rgba(245,158,11,0.7); margin-bottom:8px;
`;

const ClearTitle = styled.h1<{ $accent: string }>`
  ${pixelBold}
  font-size:clamp(24px,4vw,${FONT.display});
  color:${C.gold}; margin:0;
  text-shadow:${SCALE}px ${SCALE}px 0 ${C.ink};
`;

const SkipBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  position:absolute; top:24px; right:32px; z-index:10;
  color:${C.textSub};
  padding:${SP.xs} ${SP.sm}; font-size:${FONT.sm};
  text-shadow:1px 1px 0 ${C.textShadow};
  ${focusRing}
`;

const CharacterArea = styled.div`
  position:absolute; bottom:200px; left:50%; transform:translateX(-50%);
  display:flex; align-items:flex-end; justify-content:center; pointer-events:none;
  @media(max-height:600px){bottom:180px;}
`;

const CharSprite = styled.img`
  height:clamp(180px,28vh,300px); object-fit:contain;
  filter:drop-shadow(0 8px 28px rgba(0,0,0,0.8));
  animation:${charSlideIn} 0.45s cubic-bezier(0.16,1,0.3,1) both;
  pointer-events:none;
`;

const TextBox = styled.div`
  position:absolute; bottom:0; left:0; right:0;
  background:linear-gradient(180deg,rgba(5,8,16,0.0) 0%,rgba(5,8,16,0.97) 12%);
  padding:20px 0 0; pointer-events:all;
`;

const TextBoxInner = styled.div`
  max-width:900px; margin:0 auto; padding:24px 48px 20px;
  border-top:1px solid rgba(255,255,255,0.07);
  @media(max-width:600px){padding:18px 24px 16px;}
`;

/** uppercase + letter-spacing 을 걷어냈다 — 번역된 이름 그대로. */
const SpeakerLabel = styled.div<{ $isEnemy: boolean }>`
  ${pixelBold}
  font-size:${FONT.sm};
  color:${p => p.$isEnemy ? C.red : C.gold};
  text-shadow:1px 1px 0 ${C.textShadow};
  margin-bottom:${SP.sm};
`;

const DialogueText = styled.p`
  ${pixelText}
  ${shadowLg}
  font-size:${FONT.xl};
  color:${C.text}; margin:0;
  min-height:3.5em;
  word-break:keep-all;
`;

/** 타이핑 커서 — 각진 블록. */
const Cursor = styled.span`
  display:inline-block; width:8px; height:1em;
  background:${C.gold};
  vertical-align:text-bottom; margin-left:${SP.xs};
  animation:${blink} 0.55s step-end infinite;
`;

const ProgressRow = styled.div`
  display:flex; align-items:center; gap:6px;
  max-width:900px; margin:0 auto;
  padding:12px 48px 20px;
  @media(max-width:600px){padding:10px 24px 16px;}
`;

/** 진행 표시 — 원이 아니라 네모. */
const ProgDot = styled.div<{ $active: boolean; $past: boolean }>`
  width:8px; height:8px;
  border:1px solid ${C.ink};
  background:${p => p.$active ? C.gold : p.$past ? C.divider : C.panelSunk};
`;

const AdvanceCue = styled.div<{$visible?:boolean}>`
  ${pixelBold}
  opacity:${p=>p.$visible===false?0:1};transition:opacity 0.3s;
  margin-left:auto; font-size:${FONT.sm};
  color:${C.textSub};
  text-shadow:1px 1px 0 ${C.ink};
`;