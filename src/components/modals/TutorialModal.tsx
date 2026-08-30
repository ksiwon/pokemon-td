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
import {
  ModalOverlay, ModalPlainBox, ModalPlainHeader, modalSlideUp, modalFadeIn,
} from '../shared/modal.styles';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { WinColor, btn, sunken, pixelBold, shadowLg } from '../../styles/pixel';
import { Emoji } from '../shared/Emoji';
import { lMedia, media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import type { DocsTab } from './GameDocs';

// ─── localStorage 헬퍼 ───────────────────────────────────────────────────────
const KEYS = {
  tower: 'pokemon-td-tutorial-tower-v1',
  multi: 'pokemon-td-tutorial-multi-v1',
  story: 'pokemon-td-tutorial-story-v1',
  cards: 'pokemon-td-tutorial-cards-v1',
} as const;

type TutorialMode = keyof typeof KEYS;

const isSeen = (mode: TutorialMode): boolean => {
  try { return localStorage.getItem(KEYS[mode]) === 'true'; } catch { return false; }
};

/**
 * [FIX] "다시 보지 않기"를 **체크하는 순간** 기록한다.
 * 예전엔 닫기 애니메이션(260ms) 뒤 setTimeout 안에서만 기록해서, 그 사이에 모달이
 * 언마운트되거나(부모가 라우팅) 탭이 닫히면 체크가 통째로 날아갔다. 체크박스는 즉시
 * 저장되는 설정으로 다루고, 해제하면 다시 보이도록 지운다.
 */
const setSeen = (mode: TutorialMode, seen: boolean): void => {
  try {
    if (seen) localStorage.setItem(KEYS[mode], 'true');
    else localStorage.removeItem(KEYS[mode]);
  } catch { /* 사파리 프라이빗 등 — 저장 실패는 무시(그냥 다시 보인다) */ }
};

export const hasTowerTutorialSeen  = () => isSeen('tower');
export const hasMultiTutorialSeen  = () => isSeen('multi');
export const hasStoryTutorialSeen  = () => isSeen('story');
export const hasCardsTutorialSeen  = () => isSeen('cards');

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
  // [이관] 재화 수급표(구 slide4)와 전투 계산식(구 slide5)은 자료실(GameDocs)로 옮겼다.
  //   슬라이드는 아이콘+한 줄 3개짜리 그릇이라 표를 담기에 나쁘고, 처음 들어온
  //   사람에게 계산식부터 들이미는 순서도 아니었다. 각 화면의 '자료실' 버튼으로 간다.
];

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
interface TutorialModalProps {
  mode: TutorialMode;
  onClose: () => void;
  onProceed?: () => void;
  /** 자료실 열기. 이 모드에 해당하는 탭 이름을 넘겨준다. */
  onOpenDocs?: (tab: DocsTab) => void;
}

/** 가이드 모드 → 자료실 탭. 스토리는 싱글과 같은 엔진이라 같은 탭을 본다. */
const DOCS_TAB: Record<TutorialMode, DocsTab> = {
  tower: 'single', story: 'single', multi: 'multi', cards: 'cards',
};

export const TutorialModal: React.FC<TutorialModalProps> = ({ mode, onClose, onProceed, onOpenDocs }) => {
  const { t } = useTranslation();

  // t를 받아 슬라이드 생성 — 언어 변경 시 자동 반영
  const slides = mode === 'tower' ? buildTowerSlides(t)
               : mode === 'multi' ? buildMultiSlides(t)
               : mode === 'cards' ? buildCardsSlides(t)
               : buildStorySlides(t);

  const [page, setPage]         = useState(0);
  const [dir, setDir]           = useState<'fwd' | 'bck'>('fwd');
  const [dontShow, setDontShow] = useState(() => isSeen(mode)); // 도움말로 다시 열었을 때 현재 설정 반영
  const [exiting, setExiting]   = useState(false);

  const toggleDontShow = (v: boolean) => { setDontShow(v); setSeen(mode, v); };

  // 모드별 테마색 (tower=청록 / multi=보라 / story=주황 / cards=자홍)
  // 창틀 색(디자인 시스템의 이름)과 장식용 색(점·막대)을 나눠 쓴다.
  const accentWin: WinColor = mode === 'tower' ? 'cyan'
                            : mode === 'multi' ? 'purple'
                            : mode === 'cards' ? 'purple'
                            : 'gold';
  const accent = mode === 'tower' ? C.cyan
               : mode === 'multi' ? C.purple
               : mode === 'cards' ? C.purple
               : C.gold;
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

  /**
   * [FIX] 어떤 경로로 닫든 목적지는 같다 — onProceed가 있으면(=모드 진입 직전에 뜬 튜토리얼)
   * ✕나 배경 클릭도 그 모드로 들어간다. 예전엔 ✕가 onClose로 빠져 메인 메뉴로 튕겨서,
   * "설명은 됐고 바로 시작하자"는 자연스러운 동작이 뒤로가기가 됐다.
   * 도움말로 연 경우(onProceed 없음)는 그대로 닫힌다.
   */
  const close = () => {
    setExiting(true);
    setTimeout(() => {
      if (onProceed) onProceed();
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
      <AnimatedModalBox $exiting={exiting} $size="sm" $accent={accentWin} onClick={e => e.stopPropagation()}>
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
          <CloseX onClick={() => close()}>✕</CloseX>
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
          {onOpenDocs && (
            <DocsLink onClick={() => onOpenDocs(DOCS_TAB[mode])}>
              {t('tutorial.openDocs')}
            </DocsLink>
          )}

          <DontShowRow>
            <Checkbox
              type="checkbox"
              id={`dontShow-${mode}`}
              checked={dontShow}
              onChange={e => toggleDontShow(e.target.checked)}
            />
            <label htmlFor={`dontShow-${mode}`}>{t('tutorial.dontShowAgain')}</label>
          </DontShowRow>

          <NavButtons>
            {page > 0 && (
              <PrevBtn onClick={() => go(page - 1)}>{t('tutorial.prev')}</PrevBtn>
            )}
            <NextBtn
              $grad={grad}
              $shadow={shadow}
              $isLast={isLast}
              onClick={() => isLast ? close() : go(page + 1)}
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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 흐르는 상단 그라디언트 띠, uppercase 알약 태그, 유리 행,
//           그라디언트 CTA + 글로우, hover 떠오름, 둥근 모서리, 11~13px 미만 글자.

/** 상단 액센트 띠 — 흐르는 그라디언트 대신 단색 한 줄. */
const TopBar = styled.div<{ $accent: string }>`
  height: ${SCALE * 2}px;
  background: ${p => p.$accent};
`;

const Header = styled(ModalPlainHeader)`
  display: flex; align-items: center; justify-content: space-between; gap: ${SP.sm};
`;

/** 모드 태그 — 알약 + uppercase 를 걷어내고 각진 배지로. */
const ModeTag = styled.span<{ $bg: string; $border: string; $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => p.$color};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  box-shadow: inset 0 0 0 1px ${p => p.$border};
  padding: 0 ${SP.xs}; white-space: nowrap;
`;

const PageInfo = styled.span<{ $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$color};
  margin-left: auto;
`;

/** 닫기 — 창틀도 배경도 없이 글리프만. */
const CloseX = styled.button`
  ${pixelBold}
  background: none; border: none; cursor: pointer;
  width: 32px; height: 32px; padding: 0;
  font-size: ${FONT.sm}; color: ${C.textDim};
  display: flex; align-items: center; justify-content: center;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  &:focus, &:focus-visible { outline: none; }
`;

const SlideArea = styled.div<{ $dir: 'fwd' | 'bck' }>`
  padding: ${SP.md} 0 ${SP.xs};
  display: flex; flex-direction: column; align-items: center; text-align: center;
  overflow-y: auto;
  animation: ${p => p.$dir === 'fwd'
    ? css`${slideFwd} .22s ease`
    : css`${slideBck} .22s ease`};

  ${media.mobile}   { padding: ${SP.md} 0 ${SP.xs}; }
  ${lMedia.phoneSm} { padding: ${SP.sm} 0 ${SP.xs}; }
`;

const SlideIcon = styled.div`
  font-size: 48px; line-height: 1; margin-bottom: ${SP.md};
  animation: ${iconFloat} 3s ease-in-out infinite;

  ${media.mobile}   { font-size: 36px; margin-bottom: ${SP.sm}; }
  ${lMedia.phoneSm} { font-size: 28px; margin-bottom: ${SP.xs}; }
`;

const SlideTitle = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl}; color: ${C.text};
  margin: 0 0 ${SP.sm};
  ${shadowLg}

  ${media.mobile}   { font-size: ${FONT.sm}; }
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const SlideDesc = styled.p`
  font-size: ${FONT.sm}; color: ${C.textSub};
  margin: 0 0 ${SP.md}; white-space: pre-line;
  word-break: keep-all;

  ${lMedia.phoneSm} { margin: 0 0 ${SP.sm}; }
`;

const DetailList = styled.div`
  width: 100%; display: flex; flex-direction: column; gap: ${SP.xs};
`;

const DetailRow = styled.div<{ $delay: number }>`
  ${sunken()}
  display: flex; align-items: flex-start; gap: ${SP.sm};
  padding: ${SP.sm} ${SP.md}; text-align: left;
  animation: ${rowPop} .28s ease both;
  animation-delay: ${p => p.$delay * .06}s;

  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm}; gap: ${SP.xs}; }
`;

const DetailIcon = styled.span`
  font-size: ${ICON.md}px; flex-shrink: 0; line-height: 1.5;
  ${lMedia.phoneSm} { font-size: ${ICON.sm}px; }
`;

const DetailText = styled.span`
  font-size: ${FONT.sm}; color: ${C.text};
  word-break: keep-all;
`;

const Dots = styled.div`
  display: flex; justify-content: center; gap: ${SP.xs};
  padding: ${SP.md} 0 ${SP.xs};
  ${lMedia.phoneSm} { padding: ${SP.sm} 0 0; }
`;

/** 페이지 표시 — 둥근 알약이 아니라 각진 칸. */
const Dot = styled.button<{ $active: boolean; $accent: string }>`
  width: ${p => (p.$active ? '18px' : '8px')}; height: 8px;
  border: 2px solid ${C.ink}; cursor: pointer; padding: 0;
  background: ${p => (p.$active ? p.$accent : C.divider)};
  transition: none;
  &:focus, &:focus-visible { outline: none; }
`;

const Footer = styled.div`
  padding: ${SP.sm} 0 ${SP.lg};
  display: flex; flex-direction: column; gap: ${SP.sm};

  ${lMedia.phoneSm} { padding: ${SP.sm} 0 ${SP.md}; gap: ${SP.xs}; }
`;

const DontShowRow = styled.div`
  display: flex; align-items: center; gap: ${SP.xs};
  label { font-size: ${FONT.sm}; color: ${C.textDim}; cursor: pointer; user-select: none; }
`;

/**
 * 자료실로 가는 줄. 창틀을 두르지 않는다 — 아래 '시작하기'와 같은 무게로 보이면
 * 어느 쪽이 진행 버튼인지 헷갈린다. 밑줄 없는 글자 링크로 둔다.
 */
const DocsLink = styled.button`
  ${pixelBold}
  background: none; border: none; padding: 0;
  align-self: flex-start;
  font-size: ${FONT.sm}; color: ${C.gold};
  cursor: pointer;
  &:focus, &:focus-visible { outline: none; }
`;

const Checkbox = styled.input`
  width: 14px; height: 14px; accent-color: ${C.blue};
  cursor: pointer; flex-shrink: 0;
`;

const NavButtons = styled.div`
  display: flex; gap: ${SP.sm};
`;

const PrevBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  flex: 0 0 auto;
  padding: ${SP.sm} ${SP.md};
  color: ${C.textSub};
  font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

/** 마지막 장에서만 강조 — 그라디언트+글로우 대신 골드 창틀. */
const NextBtn = styled.button<{ $grad: string; $shadow: string; $isLast: boolean }>`
  ${p => btn(p.$isLast ? 'gold' : 'plain')}
  ${pixelBold}
  flex: 1;
  padding: ${SP.sm} ${SP.md};
  color: ${p => (p.$isLast ? C.text : C.textSub)};
  font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const AnimatedModalBox = styled(ModalPlainBox)<{ $exiting: boolean }>`
  animation: ${p => p.$exiting
    ? css`${modalOut} .26s ease forwards`
    : css`${modalSlideUp} .28s ease forwards`};
`;

const AnimatedOverlay = styled(ModalOverlay)<{ $exiting: boolean }>`
  animation: ${p => p.$exiting
    ? css`${modalOut} .26s ease forwards`
    : css`${modalFadeIn} .22s ease forwards`};
`;