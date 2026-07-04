// src/components/modals/TutorialModal.tsx
//
// mode: 'tower' = 싱글플레이 버튼 클릭 시
//       'multi' = 멀티플레이 버튼 클릭 시 (멀티 게임 방식 + TFT 배틀 통합 안내)
//
// Props:
//   onClose   : X버튼 / 오버레이 클릭 / 도움말로 열었을 때 그냥 닫기
//   onProceed : 마지막 "시작하기" 버튼 — 실제 화면 전환이 필요할 때 사용
//              (미전달 시 onClose 호출)

import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { ModalOverlay, ModalBox, modalSlideUp, modalFadeIn } from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { lMedia, media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';

// ─── localStorage 헬퍼 ───────────────────────────────────────────────────────
const KEYS = {
  tower: 'pokemon-td-tutorial-tower-v1',
  multi: 'pokemon-td-tutorial-multi-v1',
  story: 'pokemon-td-tutorial-story-v1',
  cards: 'pokemon-td-tutorial-cards-v1',
} as const;

export const hasTowerTutorialSeen  = () => localStorage.getItem(KEYS.tower) === 'true';
export const hasMultiTutorialSeen  = () => localStorage.getItem(KEYS.multi) === 'true';
export const hasStoryTutorialSeen  = () => localStorage.getItem(KEYS.story) === 'true';
export const hasCardsTutorialSeen  = () => localStorage.getItem(KEYS.cards) === 'true';
export const markTowerTutorialSeen = () => localStorage.setItem(KEYS.tower, 'true');
export const markMultiTutorialSeen = () => localStorage.setItem(KEYS.multi, 'true');
export const markStoryTutorialSeen = () => localStorage.setItem(KEYS.story, 'true');
export const markCardsTutorialSeen = () => localStorage.setItem(KEYS.cards, 'true');

// ─── 슬라이드 타입 ───────────────────────────────────────────────────────────
type TFunc = (key: string, params?: Record<string, string | number>) => string;

type Slide = {
  icon: string;
  title: string;
  desc: string;
  details: { icon: string; text: string }[];
};

// 슬라이드 데이터를 t() 함수로 동적 생성 → i18n 완전 적용
// (컴포넌트 외부 상수 대신 함수로 분리해 언어 변경 시 자동 반영)
const buildTowerSlides = (t: TFunc): Slide[] => [
  {
    icon: '🏰',
    title: t('tutorial.tower.slide0.title'),
    desc:  t('tutorial.tower.slide0.desc'),
    details: [
      { icon: '❤️', text: t('tutorial.tower.slide0.d0') },
      { icon: '💰', text: t('tutorial.tower.slide0.d1') },
      { icon: '🎯', text: t('tutorial.tower.slide0.d2') },
    ],
  },
  {
    icon: '🛒',
    title: t('tutorial.tower.slide1.title'),
    desc:  t('tutorial.tower.slide1.desc'),
    details: [
      { icon: '🔵', text: t('tutorial.tower.slide1.d0') },
      { icon: '🚫', text: t('tutorial.tower.slide1.d1') },
      { icon: '🔄', text: t('tutorial.tower.slide1.d2') },
    ],
  },
  {
    icon: '⚡',
    title: t('tutorial.tower.slide2.title'),
    desc:  t('tutorial.tower.slide2.desc'),
    details: [
      { icon: '🔥', text: t('tutorial.tower.slide2.d0') },
      { icon: '💎', text: t('tutorial.tower.slide2.d1') },
      { icon: '🧬', text: t('tutorial.tower.slide2.d2') },
    ],
  },
  {
    icon: '🎁',
    title: t('tutorial.tower.slide3.title'),
    desc:  t('tutorial.tower.slide3.desc'),
    details: [
      { icon: '🍬', text: t('tutorial.tower.slide3.d0') },
      { icon: '💊', text: t('tutorial.tower.slide3.d1') },
      { icon: '✨', text: t('tutorial.tower.slide3.d2') },
    ],
  },
];

const buildMultiSlides = (t: TFunc): Slide[] => [
  {
    icon: '👥',
    title: t('tutorial.multi.slide0.title'),
    desc:  t('tutorial.multi.slide0.desc'),
    details: [
      { icon: '🏠', text: t('tutorial.multi.slide0.d0') },
      { icon: '🤖', text: t('tutorial.multi.slide0.d1') },
      { icon: '🚀', text: t('tutorial.multi.slide0.d2') },
    ],
  },
  {
    icon: '🔄',
    title: t('tutorial.multi.slide1.title'),
    desc:  t('tutorial.multi.slide1.desc'),
    details: [
      { icon: '🛒', text: t('tutorial.multi.slide1.d0') },
      { icon: '🌊', text: t('tutorial.multi.slide1.d1') },
      { icon: '⚔️', text: t('tutorial.multi.slide1.d2') },
    ],
  },
  {
    icon: '⚔️',
    title: t('tutorial.multi.slide2.title'),
    desc:  t('tutorial.multi.slide2.desc'),
    details: [
      { icon: '🎲', text: t('tutorial.multi.slide2.d0') },
      { icon: '💀', text: t('tutorial.multi.slide2.d1') },
      { icon: '🏆', text: t('tutorial.multi.slide2.d2') },
    ],
  },
  {
    icon: '🎮',
    title: t('tutorial.multi.slide3.title'),
    desc:  t('tutorial.multi.slide3.desc'),
    details: [
      { icon: '🗺️', text: t('tutorial.multi.slide3.d0') },
      { icon: '⏳', text: t('tutorial.multi.slide3.d1') },
      { icon: '⭐', text: t('tutorial.multi.slide3.d2') },
    ],
  },
];

const buildStorySlides = (t: TFunc): Slide[] => [
  {
    icon: '📖',
    title: t('tutorial.story.slide0.title'),
    desc:  t('tutorial.story.slide0.desc'),
    details: [
      { icon: '🗺️', text: t('tutorial.story.slide0.d0') },
      { icon: '🌊', text: t('tutorial.story.slide0.d1') },
      { icon: '👑', text: t('tutorial.story.slide0.d2') },
    ],
  },
  {
    icon: '🎭',
    title: t('tutorial.story.slide1.title'),
    desc:  t('tutorial.story.slide1.desc'),
    details: [
      { icon: '🐾', text: t('tutorial.story.slide1.d0') },
      { icon: '💬', text: t('tutorial.story.slide1.d1') },
      { icon: '🚫', text: t('tutorial.story.slide1.d2') },
    ],
  },
  {
    icon: '🧭',
    title: t('tutorial.story.slide2.title'),
    desc:  t('tutorial.story.slide2.desc'),
    details: [
      { icon: '⚔️', text: t('tutorial.story.slide2.d0') },
      { icon: '🎯', text: t('tutorial.story.slide2.d1') },
      { icon: '🛡️', text: t('tutorial.story.slide2.d2') },
    ],
  },
  {
    icon: '🏆',
    title: t('tutorial.story.slide3.title'),
    desc:  t('tutorial.story.slide3.desc'),
    details: [
      { icon: '🔓', text: t('tutorial.story.slide3.d0') },
      { icon: '🧱', text: t('tutorial.story.slide3.d1') },
      { icon: '🧬', text: t('tutorial.story.slide3.d2') },
    ],
  },
];

const buildCardsSlides = (t: TFunc): Slide[] => [
  {
    icon: '🃏',
    title: t('tutorial.cards.slide0.title'),
    desc:  t('tutorial.cards.slide0.desc'),
    details: [
      { icon: '🎴', text: t('tutorial.cards.slide0.d0') },
      { icon: '📶', text: t('tutorial.cards.slide0.d1') },
      { icon: '⚙️', text: t('tutorial.cards.slide0.d2') },
    ],
  },
  {
    icon: '📦',
    title: t('tutorial.cards.slide1.title'),
    desc:  t('tutorial.cards.slide1.desc'),
    details: [
      { icon: '🎁', text: t('tutorial.cards.slide1.d0') },
      { icon: '⭐', text: t('tutorial.cards.slide1.d1') },
      { icon: '📖', text: t('tutorial.cards.slide1.d2') },
    ],
  },
  {
    icon: '🛡️',
    title: t('tutorial.cards.slide2.title'),
    desc:  t('tutorial.cards.slide2.desc'),
    details: [
      { icon: '⚔️', text: t('tutorial.cards.slide2.d0') },
      { icon: '🔗', text: t('tutorial.cards.slide2.d1') },
      { icon: '🎯', text: t('tutorial.cards.slide2.d2') },
    ],
  },
  {
    icon: '🗼',
    title: t('tutorial.cards.slide3.title'),
    desc:  t('tutorial.cards.slide3.desc'),
    details: [
      { icon: '🎲', text: t('tutorial.cards.slide3.d0') },
      { icon: '🪙', text: t('tutorial.cards.slide3.d1') },
      { icon: '🔁', text: t('tutorial.cards.slide3.d2') },
    ],
  },
];

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
interface TutorialModalProps {
  mode: 'tower' | 'multi' | 'story' | 'cards';
  onClose: () => void;
  onProceed?: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ mode, onClose, onProceed }) => {
  const { t } = useTranslation();

  // t를 받아 슬라이드 생성 — 언어 변경 시 자동 반영
  const slides = mode === 'tower' ? buildTowerSlides(t)
               : mode === 'multi' ? buildMultiSlides(t)
               : mode === 'cards' ? buildCardsSlides(t)
               : buildStorySlides(t);

  const [page, setPage]         = useState(0);
  const [dir, setDir]           = useState<'fwd' | 'bck'>('fwd');
  const [dontShow, setDontShow] = useState(false);
  const [exiting, setExiting]   = useState(false);

  // 모드별 테마색 (tower=청록 / multi=보라 / story=주황 / cards=자홍)
  const accent = mode === 'tower' ? '#4fc3f7'
               : mode === 'multi' ? '#a78bfa'
               : mode === 'cards' ? '#e879f9'
               : '#f59e0b';
  const grad   = mode === 'tower'
    ? 'linear-gradient(135deg,#0284c7,#0369a1)'
    : mode === 'multi'
    ? 'linear-gradient(135deg,#7c3aed,#6d28d9)'
    : mode === 'cards'
    ? 'linear-gradient(135deg,#c026d3,#a21caf)'
    : 'linear-gradient(135deg,#d97706,#b45309)';
  const shadow = mode === 'tower' ? 'rgba(3,105,161,0.55)'
               : mode === 'multi' ? 'rgba(109,40,217,0.55)'
               : mode === 'cards' ? 'rgba(162,28,175,0.55)'
               : 'rgba(180,83,9,0.55)';

  const isLast = page === slides.length - 1;

  const close = (proceed = false) => {
    setExiting(true);
    setTimeout(() => {
      if (dontShow) {
        if (mode === 'tower')      markTowerTutorialSeen();
        else if (mode === 'multi') markMultiTutorialSeen();
        else if (mode === 'cards') markCardsTutorialSeen();
        else                       markStoryTutorialSeen();
      }
      if (proceed && onProceed) onProceed();
      else onClose();
    }, 260);
  };

  const go = (next: number) => {
    setDir(next > page ? 'fwd' : 'bck');
    setPage(next);
  };

  const slide = slides[page];

  // 모드 태그 라벨 — 번역값 앞뒤 공백 제거 후 아이콘 결합
  const modeLabel = mode === 'tower'
    ? <><Emoji glyph="🏰" size={13} /> {t('tutorial.tower.label').trim()}</>
    : mode === 'multi'
    ? <><Emoji glyph="👥" size={13} /> {t('tutorial.multi.label').trim()}</>
    : mode === 'cards'
    ? <><Emoji glyph="🃏" size={13} /> {t('tutorial.cards.label').trim()}</>
    : <><Emoji glyph="📖" size={13} /> {t('tutorial.story.label').trim()}</>;

  return (
    <AnimatedOverlay $exiting={exiting} onClick={() => close()}>
      <AnimatedModalBox $exiting={exiting} $size="sm" $accent={accent} onClick={e => e.stopPropagation()}>
        <TopBar $accent={accent} />

        <Header>
          <ModeTag
            $bg={mode === 'tower' ? 'rgba(3,105,161,0.18)' : mode === 'multi' ? 'rgba(124,58,237,0.18)' : mode === 'cards' ? 'rgba(192,38,211,0.18)' : 'rgba(180,83,9,0.18)'}
            $border={mode === 'tower' ? 'rgba(3,105,161,0.45)' : mode === 'multi' ? 'rgba(124,58,237,0.45)' : mode === 'cards' ? 'rgba(192,38,211,0.45)' : 'rgba(180,83,9,0.45)'}
            $color={accent}
          >
            {modeLabel}
          </ModeTag>
          <PageInfo $color={accent}>{page + 1} / {slides.length}</PageInfo>
          <CloseX onClick={() => close()}><Emoji glyph="❌" size={14} /></CloseX>
        </Header>

        <SlideArea $dir={dir} key={page}>
          <SlideIcon><Emoji glyph={slide.icon} size={40} /></SlideIcon>
          <SlideTitle>{slide.title}</SlideTitle>
          <SlideDesc>{slide.desc}</SlideDesc>
          <DetailList>
            {slide.details.map((d, i) => (
              <DetailRow key={i} $delay={i}>
                <DetailIcon><Emoji glyph={d.icon} size={16} /></DetailIcon>
                <DetailText>{d.text}</DetailText>
              </DetailRow>
            ))}
          </DetailList>
        </SlideArea>

        <Dots>
          {slides.map((_, i) => (
            <Dot key={i} $active={i === page} $accent={accent} onClick={() => go(i)} />
          ))}
        </Dots>

        <Footer>
          <DontShowRow>
            <Checkbox
              type="checkbox"
              id="dontShow"
              checked={dontShow}
              onChange={e => setDontShow(e.target.checked)}
            />
            <label htmlFor="dontShow">{t('tutorial.dontShowAgain')}</label>
          </DontShowRow>

          <NavButtons>
            {page > 0 && (
              <PrevBtn onClick={() => go(page - 1)}>{t('tutorial.prev')}</PrevBtn>
            )}
            <NextBtn
              $grad={grad}
              $shadow={shadow}
              $isLast={isLast}
              onClick={() => isLast ? close(true) : go(page + 1)}
            >
              {isLast
                ? (onProceed ? <>{t('tutorial.start')} <Emoji glyph="🚀" size={14} /></> : t('tutorial.next'))
                : t('tutorial.next')}
            </NextBtn>
          </NavButtons>
        </Footer>
      </AnimatedModalBox>
    </AnimatedOverlay>
  );
};

// ─── Animation keyframes ──────────────────────────────────────────────────────
const modalOut = keyframes`from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(20px) scale(.97)}`;
const slideFwd = keyframes`from{opacity:0;transform:translateX(22px)}to{opacity:1;transform:translateX(0)}`;
const slideBck = keyframes`from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:translateX(0)}`;
const iconFloat = keyframes`0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-9px) scale(1.07)}70%{transform:translateY(-3px) scale(1.02)}`;
const rowPop   = keyframes`from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}`;

// ─── Styled Components ────────────────────────────────────────────────────────

const TopBar = styled.div<{ $accent: string }>`
  height: 3px;
  background: linear-gradient(90deg, transparent, ${p => p.$accent}, transparent);
  background-size: 200% 100%;
  animation: sweep 2.4s linear infinite;
  @keyframes sweep { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
`;

const Header = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 14px 18px 0;

  ${media.mobile}   { padding: 11px 14px 0; }
  ${lMedia.phoneSm} { padding: 10px 12px 0; }
`;

const ModeTag = styled.span<{ $bg: string; $border: string; $color: string }>`
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: ${p => p.$color}; background: ${p => p.$bg}; border: 1px solid ${p => p.$border};
  padding: 3px 10px; border-radius: 20px; white-space: nowrap;

  ${media.mobile} { font-size: 10px; padding: 2px 8px; }
`;

const PageInfo = styled.span<{ $color: string }>`
  font-size: 12px; font-weight: 600; color: ${p => p.$color};
  opacity: .7; margin-left: auto;
`;

const CloseX = styled.button`
  background: none; border: none; color: rgba(255,255,255,.3); font-size: 15px;
  cursor: pointer; line-height: 1; padding: 4px 7px; border-radius: 7px;
  transition: color .18s, background .18s;
  &:hover { color: rgba(255,255,255,.75); background: rgba(255,255,255,.08) }
`;

const SlideArea = styled.div<{ $dir: 'fwd' | 'bck' }>`
  padding: 18px 26px 6px;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  overflow-y: auto;
  animation: ${p => p.$dir === 'fwd'
    ? css`${slideFwd} .22s ease`
    : css`${slideBck} .22s ease`};

  ${media.tablet}   { padding: 16px 22px 6px; }
  ${media.mobile}   { padding: 14px 16px 4px; }
  ${lMedia.phoneSm} { padding: 12px 14px 4px; }
`;

const SlideIcon = styled.div`
  font-size: 50px; line-height: 1; margin-bottom: 13px;
  animation: ${iconFloat} 3s ease-in-out infinite;

  ${media.tablet}   { font-size: 44px; margin-bottom: 10px; }
  ${media.mobile}   { font-size: 38px; margin-bottom: 8px; }
  ${lMedia.phoneSm} { font-size: 30px; margin-bottom: 6px; }
`;

const SlideTitle = styled.h2`
  font-size: 19px; font-weight: 800; color: #f1f5f9;
  margin: 0 0 9px; letter-spacing: -.025em;

  ${media.tablet}   { font-size: 17px; }
  ${media.mobile}   { font-size: 16px; margin: 0 0 7px; }
  ${lMedia.phoneSm} { font-size: 14px; margin: 0 0 5px; }
`;

const SlideDesc = styled.p`
  font-size: 13px; color: rgba(255,255,255,.55);
  line-height: 1.7; margin: 0 0 16px; white-space: pre-line;

  ${media.tablet}   { font-size: 12.5px; }
  ${media.mobile}   { font-size: 12px; margin: 0 0 12px; line-height: 1.6; }
  ${lMedia.phoneSm} { font-size: 11px; margin: 0 0 8px; line-height: 1.5; }
`;

const DetailList = styled.div`
  width: 100%; display: flex; flex-direction: column; gap: 7px;

  ${media.mobile}   { gap: 5px; }
  ${lMedia.phoneSm} { gap: 4px; }
`;

const DetailRow = styled.div<{ $delay: number }>`
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px; padding: 9px 13px; text-align: left;
  animation: ${rowPop} .28s ease both;
  animation-delay: ${p => p.$delay * .06}s;

  ${media.mobile}   { padding: 7px 10px; gap: 8px; border-radius: 8px; }
  ${lMedia.phoneSm} { padding: 6px 9px; gap: 7px; }
`;

const DetailIcon = styled.span`
  font-size: 16px; flex-shrink: 0; line-height: 1.5;

  ${media.mobile}   { font-size: 14px; }
  ${lMedia.phoneSm} { font-size: 13px; }
`;

const DetailText = styled.span`
  font-size: 12.5px; color: rgba(255,255,255,.72); line-height: 1.55;

  ${media.mobile}   { font-size: 11.5px; }
  ${lMedia.phoneSm} { font-size: 11px; line-height: 1.4; }
`;

const Dots = styled.div`
  display: flex; justify-content: center; gap: 6px;
  padding: 14px 0 2px;

  ${media.mobile}   { padding: 10px 0 2px; }
  ${lMedia.phoneSm} { padding: 7px 0 1px; }
`;

const Dot = styled.button<{ $active: boolean; $accent: string }>`
  width: ${p => p.$active ? '18px' : '6px'}; height: 6px;
  border-radius: 3px; border: none; cursor: pointer; padding: 0;
  background: ${p => p.$active ? p.$accent : 'rgba(255,255,255,.16)'};
  transition: width .22s ease, background .22s ease;

  ${media.mobile} {
    width: ${p => p.$active ? '14px' : '5px'};
    height: 5px;
  }
`;

const Footer = styled.div`
  padding: 12px 22px 20px;
  display: flex; flex-direction: column; gap: 10px;

  ${media.tablet}   { padding: 10px 18px 16px; }
  ${media.mobile}   { padding: 8px 14px 14px; gap: 8px; }
  ${lMedia.phoneSm} { padding: 6px 12px 12px; gap: 6px; }
`;

const DontShowRow = styled.div`
  display: flex; align-items: center; gap: 7px;
  label { font-size: 11.5px; color: rgba(255,255,255,.35); cursor: pointer; user-select: none; }

  ${media.mobile} { label { font-size: 11px; } }
`;

const Checkbox = styled.input`
  width: 14px; height: 14px; accent-color: #4fc3f7;
  cursor: pointer; flex-shrink: 0;
`;

const NavButtons = styled.div`
  display: flex; gap: 8px;

  ${media.mobile} { gap: 6px; }
`;

const PrevBtn = styled.button`
  flex: 0 0 auto;
  padding: 10px 16px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  border-radius: 11px; color: rgba(255,255,255,.55);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .18s, color .18s;
  @media (hover: hover) {
    &:hover { background: rgba(255,255,255,.11); color: #fff; transform: translateY(-1px); }
  }

  ${media.mobile}   { padding: 8px 12px; font-size: 12px; border-radius: 9px; }
  ${lMedia.phoneSm} { padding: 7px 10px; font-size: 11.5px; }
`;

const NextBtn = styled.button<{ $grad: string; $shadow: string; $isLast: boolean }>`
  flex: 1;
  padding: 11px 18px;
  background: ${p => p.$isLast ? p.$grad : 'rgba(255,255,255,.08)'};
  border: 1px solid ${p => p.$isLast ? 'transparent' : 'rgba(255,255,255,.1)'};
  border-radius: 11px;
  color: ${p => p.$isLast ? '#fff' : 'rgba(255,255,255,.75)'};
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  box-shadow: ${p => p.$isLast ? `0 4px 18px ${p.$shadow}` : 'none'};
  transition: box-shadow .18s, filter .18s;
  @media (hover: hover) {
    &:hover {
      transform: translateY(-1px);
      box-shadow: ${p => p.$isLast ? `0 6px 22px ${p.$shadow}` : '0 3px 10px rgba(0,0,0,.25)'};
      filter: brightness(1.08);
    }
  }

  ${media.mobile}   { padding: 9px 14px; font-size: 12.5px; border-radius: 9px; }
  ${lMedia.phoneSm} { padding: 7px 12px; font-size: 12px; }
`;

const AnimatedModalBox = styled(ModalBox)<{ $exiting: boolean }>`
  animation: ${p => p.$exiting
    ? css`${modalOut} .26s ease forwards`
    : css`${modalSlideUp} .28s ease forwards`};
`;

const AnimatedOverlay = styled(ModalOverlay)<{ $exiting: boolean }>`
  animation: ${p => p.$exiting
    ? css`${modalOut} .26s ease forwards`
    : css`${modalFadeIn} .22s ease forwards`};
`;