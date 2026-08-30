// src/components/story/StoryOpening.tsx
// 버그 수정:
//  [FIX-1] TextBox → Root 이벤트 버블링으로 advance()가 2회 호출 → 줄 2개씩 건너뜀
//          해결: Root onClick은 title phase에서만, TextBox는 stopPropagation
//  [FIX-2] 타이핑 완료 직후 연타 시 바로 다음 줄로 이동
//          해결: canProceedRef — 타이핑 완료 or 스킵 확인 후에만 advance 허용

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { btnThin, sunken, pixelText, pixelBold, shadowLg } from '../../styles/pixel';
import { StoryChapter, DialogueLine } from '../../data/storyChapters';
import { useTranslation } from '../../i18n';

interface StoryOpeningProps {
  chapter: StoryChapter;
  onComplete: () => void;
  onSkip: () => void;
}

const CHAR_SPEED = 30;

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
};

function collectImages(chapter: StoryChapter): string[] {
  const urls = new Set<string>();
  const bg = BG_IMAGES[chapter.mapId];
  if (bg) urls.add(bg);
  const allLines = [...chapter.openingDialogue, ...chapter.endingDialogue];
  for (const line of allLines) {
    const bySpeaker = SPEAKER_SPRITES[line.speaker];
    if (bySpeaker) urls.add(bySpeaker);
    if (line.pokemonId) {
      urls.add(
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${line.pokemonId}.png`
      );
    }
  }
  return Array.from(urls);
}

export const StoryOpening: React.FC<StoryOpeningProps> = ({
  chapter, onComplete, onSkip,
}) => {
  const lines = chapter.openingDialogue;
  const { t, language } = useTranslation();
  const [loading, setLoading]         = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [phase, setPhase]             = useState<'title' | 'dialogue' | 'done'>('title');
  const [lineIdx, setLineIdx]         = useState(0);
  const [displayed, setDisplayed]     = useState('');
  const [typing, setTyping]           = useState(false);
  const [fadeIn, setFadeIn]           = useState(false);

  const titleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [FIX-2] 타이핑 완료 확인 ref — true일 때만 "다음 줄" 진행 허용
  const canProceedRef  = useRef(false);

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

  // ── 이미지 프리로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const urls = collectImages(chapter);
    let loaded = 0;
    const promises = urls.map(url =>
      new Promise<void>(resolve => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          setLoadProgress(Math.round((loaded / urls.length) * 100));
          resolve();
        };
        img.src = url;
      })
    );
    Promise.all(promises).then(() => {
      setLoading(false);
      setFadeIn(true);
      titleTimerRef.current = setTimeout(() => setPhase('dialogue'), 2800);
    });
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, [chapter]);

  // ── 타이프라이터 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'dialogue' || !currentLine) return;
    setDisplayed('');
    setTyping(true);
    canProceedRef.current = false;  // [FIX-2] 새 줄 시작 → 진행 잠금

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
  }, [phase, lineIdx, currentLine, lineText]);

  // ── advance ──────────────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (loading) return;

    if (phase === 'title') {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      setPhase('dialogue');
      return;
    }

    if (phase === 'dialogue') {
      if (typing) {
        // 타이핑 스킵 → 전체 텍스트 즉시 표시
        setDisplayed(lineText);
        setTyping(false);
        canProceedRef.current = true; // [FIX-2] 스킵 후에는 즉시 진행 허용
        return;
      }

      // [FIX-2] 타이핑 완료 확인 — 방지하지 않으면 연타 시 바로 넘어감
      if (!canProceedRef.current) return;
      canProceedRef.current = false; // 사용 후 잠금

      if (lineIdx < lines.length - 1) {
        setLineIdx(p => p + 1);
      } else {
        setPhase('done');
        onComplete();
      }
    }
  }, [loading, phase, typing, lineIdx, lines.length, currentLine, lineText, onComplete]);

  // ── 키보드 단축키 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') advance();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  // ── 로딩 화면 ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <LoadingRoot>
        <LoadingBg src={bgSrc} />
        <LoadingDim />
        <LoadingContent>
          <LoadingChapter>CHAPTER {String(chapter.chapterNumber).padStart(2, '0')}</LoadingChapter>
          <LoadingTitle $accent={chapter.theme.primary}>{chapter.title}</LoadingTitle>
          <LoadingBarWrap>
            <LoadingBarFill $pct={loadProgress} $accent={chapter.theme.primary} />
          </LoadingBarWrap>
          <LoadingText>{t('storyUI.loadingImages', { progress: loadProgress })}</LoadingText>
        </LoadingContent>
      </LoadingRoot>
    );
  }

  return (
    // [FIX-1] Root onClick은 title phase에서만 — dialogue phase에선 TextBox가 처리
    <Root onClick={phase === 'title' ? advance : undefined} $fade={fadeIn}>
      <BgImg src={bgSrc} />
      <BgDim />
      <BgVignette />

      <TopInfo $visible={phase === 'dialogue'}>
        <ChapterBadge>CHAPTER {String(chapter.chapterNumber).padStart(2, '0')}</ChapterBadge>
        <LocationText>{language === 'en' && chapter.locationEn ? chapter.locationEn : chapter.location}</LocationText>
      </TopInfo>

      <SkipBtn onClick={e => { e.stopPropagation(); onSkip(); }}>
        SKIP ▶
      </SkipBtn>

      {/* ── 타이틀 페이즈 ── */}
      {phase === 'title' && (
        <TitleScreen>
          <TitleChNum>CHAPTER {String(chapter.chapterNumber).padStart(2, '0')}</TitleChNum>
          <TitleName $accent={chapter.theme.primary}>{language === 'en' && chapter.titleEn ? chapter.titleEn : chapter.title}</TitleName>
          <TitleSub>{language === 'en' && chapter.subtitleEn ? chapter.subtitleEn : chapter.subtitle}</TitleSub>
          <TitleCue>{t('storyUI.clickToContinue')}</TitleCue>
        </TitleScreen>
      )}

      {/* ── 대화 페이즈 ── */}
      {phase === 'dialogue' && currentLine && (
        <>
          <CharacterArea>
            {spriteUrl && (
              <CharSprite
                key={`${currentLine.speaker}-${lineIdx}`}
                src={spriteUrl}
                alt={currentLine.speaker}
              />
            )}
          </CharacterArea>

          {/* [FIX-1] stopPropagation — Root까지 버블링 차단 */}
          <TextBox onClick={e => { e.stopPropagation(); advance(); }}>
            <TextBoxInner>
              <SpeakerLabel $isDark={chapter.chapterNumber === 8 && currentLine.speaker === '칠색조'}>
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
              {/* [FIX-2] 타이핑 중일 때는 ▶ 힌트 숨김 — 클릭 유도 없이 완료 후 표시 */}
              <AdvanceCue $visible={!typing}>
                {lineIdx < lines.length - 1 ? t('storyUI.next') : t('storyUI.begin')}
              </AdvanceCue>
            </ProgressRow>
          </TextBox>
        </>
      )}
    </Root>
  );
};

// ─── Animations ───────────────────────────────────────────────────────────────

const slideUp   = keyframes`from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}`;
const titleReveal = keyframes`0%{opacity:0;transform:scale(0.96) translateY(12px)}100%{opacity:1;transform:scale(1) translateY(0)}`;
const blink     = keyframes`0%,100%{opacity:1}50%{opacity:0}`;
const charSlideIn = keyframes`from{opacity:0;transform:translateX(-24px) scale(0.9)}to{opacity:1;transform:translateX(0) scale(1)}`;
const panBg     = keyframes`from{transform:scale(1.08)}to{transform:scale(1.0)}`;
const loadingPulse = keyframes`0%,100%{opacity:0.6}50%{opacity:1}`;
const progressAnim = keyframes`from{opacity:0}to{opacity:1}`;

// ─── Loading ──────────────────────────────────────────────────────────────────

const LoadingRoot = styled.div`
  position:fixed;inset:0;z-index:3000;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
`;

const LoadingBg = styled.img`
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;opacity:0.3;filter:blur(4px);transform:scale(1.05);
`;

const LoadingDim = styled.div`position:absolute;inset:0;background:rgba(0,0,0,0.75);`;

const LoadingContent = styled.div`
  position:relative;z-index:1;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:16px;
  animation:${progressAnim} 0.4s ease;
`;

const LoadingChapter = styled.div`
  ${pixelBold}
  font-size:${FONT.sm};color:${C.gold};
  text-shadow:1px 1px 0 ${C.textShadow};
`;

const LoadingTitle = styled.h1<{$accent:string}>`
  ${pixelBold}
  font-size:clamp(28px,5vw,48px);color:${C.text};margin:0;
  text-shadow:${SCALE}px ${SCALE}px 0 ${C.textShadow};
  animation:${loadingPulse} 1.5s ease-in-out infinite;
`;

/** 진행 게이지 — 파인 트랙 + 각진 단색 막대. */
const LoadingBarWrap = styled.div`
  ${sunken()}
  width:280px;height:12px;padding:0;overflow:hidden;
`;

const LoadingBarFill = styled.div<{$pct:number;$accent:string}>`
  height:100%;width:${p=>p.$pct}%;
  background:${p=>p.$accent};
`;

const LoadingText = styled.div`font-size:${FONT.sm};color:${C.textDim};`;

// ─── Main ─────────────────────────────────────────────────────────────────────

const Root = styled.div<{$fade:boolean}>`
  position:fixed;inset:0;z-index:3000;
  /* 불투명 베이스 — 가로형 BgImg(opacity:0.55)가 세로 화면을 못 덮을 때
     뒤의 셀렉터가 비쳐 보이던 문제 방지 */
  background:#05060a;
  cursor:default;user-select:none;overflow:hidden;
  opacity:${p=>p.$fade?1:0};transition:opacity 0.6s ease;
`;

const BgImg = styled.img`
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;opacity:0.55;
  animation:${panBg} 20s ease-out both;pointer-events:none;
`;

const BgDim = styled.div`position:absolute;inset:0;background:rgba(0,0,0,0.6);pointer-events:none;`;

const BgVignette = styled.div`
  position:absolute;inset:0;
  background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.85) 100%);
  pointer-events:none;
`;

const TopInfo = styled.div<{$visible:boolean}>`
  position:absolute;top:28px;left:36px;
  opacity:${p=>p.$visible?1:0};
  transform:${p=>p.$visible?'translateY(0)':'translateY(-8px)'};
  transition:all 0.5s ease 0.3s;pointer-events:none;
`;

const ChapterBadge = styled.div`
  ${pixelBold}
  font-size:${FONT.sm};color:${C.gold};
  text-shadow:1px 1px 0 ${C.ink};
`;

const LocationText = styled.div`
  font-size:${FONT.sm};color:${C.textSub};
  text-shadow:1px 1px 0 ${C.ink};
`;

const SkipBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  position:absolute;top:24px;right:32px;z-index:10;
  color:${C.textSub};
  padding:${SP.xs} ${SP.sm};font-size:${FONT.sm};
  text-shadow:1px 1px 0 ${C.textShadow};
  &:focus, &:focus-visible { outline: none; }
`;

const TitleScreen = styled.div`
  position:absolute;inset:0;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  animation:${titleReveal} 1.2s ease both;
`;

const TitleChNum = styled.div`
  font-size:12px;font-weight:800;letter-spacing:0.4em;
  color:rgba(245,158,11,0.65);margin-bottom:20px;
  animation:${slideUp} 0.8s ease both;
`;

const TitleName = styled.h1<{$accent:string}>`
  font-size:clamp(36px,7vw,72px);font-weight:900;
  letter-spacing:-0.02em;color:#fff;margin:0 0 12px;
  text-shadow:0 0 60px ${p=>p.$accent}55,0 4px 20px rgba(0,0,0,0.7);
  animation:${slideUp} 1s ease 0.2s both;text-align:center;
`;

const TitleSub = styled.div`
  font-size:clamp(14px,2vw,18px);color:rgba(255,255,255,0.45);
  letter-spacing:0.08em;margin-bottom:48px;
  animation:${slideUp} 1s ease 0.4s both;text-align:center;
`;

const TitleCue = styled.div`
  font-size:13px;color:rgba(255,255,255,0.2);
  letter-spacing:0.1em;animation:${blink} 2s ease-in-out infinite;
`;

const CharacterArea = styled.div`
  position:absolute;bottom:200px;left:50%;transform:translateX(-50%);
  display:flex;align-items:flex-end;justify-content:center;pointer-events:none;
  @media(max-height:600px){bottom:180px;}
`;

const CharSprite = styled.img`
  height:clamp(200px,32vh,340px);object-fit:contain;
  filter:drop-shadow(0 8px 32px rgba(0,0,0,0.8));
  animation:${charSlideIn} 0.45s cubic-bezier(0.16,1,0.3,1) both;
  pointer-events:none;
`;

const TextBox = styled.div`
  position:absolute;bottom:0;left:0;right:0;
  background:linear-gradient(180deg,rgba(5,8,16,0.0) 0%,rgba(5,8,16,0.97) 12%);
  padding:20px 0 0;cursor:pointer;
`;

const TextBoxInner = styled.div`
  max-width:900px;margin:0 auto;
  padding:24px 48px 20px;
  border-top:1px solid rgba(255,255,255,0.07);
  @media(max-width:600px){padding:18px 24px 16px;}
`;

/** uppercase + letter-spacing 을 걷어냈다 — 번역된 이름 그대로. */
const SpeakerLabel = styled.div<{$isDark:boolean}>`
  ${pixelBold}
  font-size:${FONT.sm};
  color:${p=>p.$isDark?C.red:C.gold};
  text-shadow:1px 1px 0 ${C.textShadow};
  margin-bottom:${SP.sm};
`;

const DialogueText = styled.p`
  ${pixelText}
  ${shadowLg}
  font-size:${FONT.xl};
  color:${C.text};margin:0;
  min-height:3.5em;
  word-break:keep-all;
`;

/** 타이핑 커서 — 각진 블록. */
const Cursor = styled.span`
  display:inline-block;width:8px;height:1em;
  background:${C.gold};
  vertical-align:text-bottom;margin-left:${SP.xs};
  animation:${blink} 0.55s step-end infinite;
`;

const ProgressRow = styled.div`
  display:flex;align-items:center;gap:6px;
  max-width:900px;margin:0 auto;
  padding:12px 48px 20px;
  @media(max-width:600px){padding:10px 24px 16px;}
`;

/** 진행 표시 — 원이 아니라 네모. */
const ProgDot = styled.div<{$active:boolean;$past:boolean}>`
  width:8px;height:8px;
  border:1px solid ${C.ink};
  background:${p=>p.$active?C.gold:p.$past?C.divider:C.panelSunk};
`;

// [FIX-2] 타이핑 완료 후에만 ▶ 힌트 표시
const AdvanceCue = styled.div<{$visible:boolean}>`
  ${pixelBold}
  margin-left:auto;font-size:${FONT.sm};
  color:${C.textSub};
  text-shadow:1px 1px 0 ${C.ink};
  opacity:${p=>p.$visible?1:0};transition:opacity 0.3s;
`;