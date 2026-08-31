// src/components/shared/modal.styles.ts
// ──────────────────────────────────────────────────────────────────────────────
// 공통 모달 껍데기 — 18개 컴포넌트가 이 파일 하나를 공유한다.
//
// 색·간격·창틀은 전부 src/styles/tokens.ts, src/styles/pixel.ts 에서 온다.
// 이 파일에 색 리터럴을 직접 쓰지 말 것. 토큰을 고치면 모달 전체가 따라온다.
//
// 이전 버전에서 걷어낸 것들:
//   · backdrop-filter: blur(8px) 오버레이 — 글래스모피즘은 웹 문법이다.
//   · border-radius 20px + 1px rgba(255,255,255,0.10) 테두리 — 웹 카드.
//   · border-top: 3px solid <액센트> — 액센트를 '색 막대'로 표현하던 방식.
//     이제 액센트는 창틀 색 자체가 된다.
//   · 0 32px 80px 그림자 — 번지는 그림자는 도트 UI에 없다.
//
// Exports (기존 API 유지):
//   ① 애니메이션  — modalFadeIn, modalSlideUp
//   ② 토큰       — MODAL_ACCENT, modalBoxCss
//   ③ 껍데기     — ModalOverlay, ModalBox
//   ④ 헤더       — ModalHeader, ModalTitle, ModalCloseBtn
//   ⑤ 레이아웃   — ModalBody, ModalScrollBody, ModalFooter, ModalDivider,
//                  ModalSectionPad
// ──────────────────────────────────────────────────────────────────────────────

import styled, { keyframes, css } from 'styled-components';
import { lMedia, media } from '../../utils/responsive.utils';
import { C, FONT, SCALE, SP } from '../../styles/tokens';
import { win, btn, btnThin, pixelText, pixelBold, WinColor, BtnColor, FRAME_W, shadowLg, focusRing } from '../../styles/pixel';

// ═══════════════════════════════════════════════════════════════════════════════
// ① 애니메이션 — DS UI의 움직임은 짧고 딱 끊긴다
// ═══════════════════════════════════════════════════════════════════════════════

export const modalFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const modalSlideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0);    }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ② 토큰
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 모달별 창틀 색.
 *
 * 값이 색 코드가 아니라 창틀 이름(WinColor)이다. 예전에는 상단 3px 색 막대에
 * 쓸 hex였는데, 이제 액센트가 창틀 전체의 색이 되므로 이름으로 고른다.
 * 호출부는 그대로 `$accent={MODAL_ACCENT.gold}` 로 쓰면 된다.
 */
export const MODAL_ACCENT = {
  gold:    'gold',    // 업적·전당·진화·웨이브클리어
  cyan:    'cyan',    // 랭킹·설정·패치노트·버그리포트
  green:   'green',   // 웨이브보상
  purple:  'purple',  // 스킬픽커
  blue:    'blue',    // 포켓몬관리·멀티플레이어
  red:     'red',     // 게임오버
  neutral: 'plain',
} as const satisfies Record<string, WinColor>;

/**
 * 모달 안쪽 좌우 여백 — **머리띠와 본문이 같은 좌변에 선다.**
 *
 * 예전에는 머리띠·탭 줄·본문·표가 저마다 값을 정했다. 업적은 머리띠 16px에 탭 줄
 * 12px이라 탭이 제목보다 튀어나왔고, 자료실은 본문에 좌우 여백이 아예 없어 표가
 * 창틀에 붙었다. 값이 아니라 **출처가 하나여야** 안 갈린다.
 *
 * 머리띠는 창틀 두께만큼 밖으로 나가 있으므로 패딩에 FRAME_W 를 더해 되돌린다.
 * 본문은 창틀 안에 있으므로 그대로 쓰면 된다.
 */
export const MODAL_PAD_X   = SP.lg;  // 16px
export const MODAL_PAD_X_M = SP.md;  // 12px — 좁은 화면

/** 본문 쪽에서 쓰는 좌우 여백. 세로 여백은 각자 정한다. */
export const modalPadX = css`
  padding-left: ${MODAL_PAD_X}; padding-right: ${MODAL_PAD_X};
  ${media.mobile}   { padding-left: ${MODAL_PAD_X_M}; padding-right: ${MODAL_PAD_X_M}; }
  ${lMedia.phoneSm} { padding-left: ${MODAL_PAD_X_M}; padding-right: ${MODAL_PAD_X_M}; }
`;

/**
 * CSS 믹스인 — 포지셔닝이 필요한 패널(SkillPicker 등)에서 ModalBox 시각
 * 스타일만 인라인으로 적용할 때 쓴다.
 */
export const modalBoxCss = (accent: WinColor = MODAL_ACCENT.neutral) => css`
  ${win(accent)}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ③ 껍데기
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ModalOverlay — 전체화면 딤.
 * $zIndex : 기본 1000
 *
 * 반응형: 좁은 화면(모바일 세로/폰 가로)은 상단 정렬 + 스크롤, 그 외는 가운데.
 */
export const ModalOverlay = styled.div<{ $zIndex?: number }>`
  position: fixed; inset: 0;
  /* blur 없는 단순 딤 — 유리 효과는 쓰지 않는다 */
  background: rgba(20, 16, 26, 0.78);
  display: flex; align-items: center; justify-content: center;
  z-index: ${p => p.$zIndex ?? 1000};
  padding: ${SP.lg};
  animation: ${modalFadeIn} 0.12s steps(3, end);

  ${media.tablet}  { padding: ${SP.md}; }
  ${media.mobile}  { align-items: flex-start; padding: ${SP.sm}; overflow-y: auto; }
  ${lMedia.tablet} { align-items: center;     padding: ${SP.sm}; }
  ${lMedia.phone}  { align-items: flex-start; padding: ${SP.sm}; overflow-y: auto; }
  ${lMedia.phoneSm}{ align-items: flex-start; padding: ${SP.xs}; overflow-y: auto; }
`;

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MAX_W: Record<ModalSize, string> = {
  sm: '520px',   // Settings, Wave50Clear, EvolutionConfirm, TutorialModal
  md: '720px',   // Rankings, MultiplayerView, PatchNotes
  lg: '960px',   // Achievements, HallOfFame, PokemonManager, MultiplayerGameOver
  xl: '1040px',  // WaveEndPicker, PokemonPicker
};

/**
 * ModalBox — 모달 컨테이너.
 * $size    : 'sm' | 'md' | 'lg' | 'xl' (기본 'md')
 * $accent  : 창틀 색 (기본 plain)
 * $scroll  : true → 단순 스크롤, false → flex 레이아웃(헤더/본문/푸터 분리)
 * $animate : 'fadeIn' | 'slideUp' (기본 'fadeIn')
 *
 * 창틀(border-image)이 이미 사방 FRAME_W 만큼 안쪽 여백을 만든다. 내용에
 * padding을 더 주면 창이 헐거워지므로, 각 섹션이 좌우 여백만 책임진다.
 */
export const ModalBox = styled.div<{
  $size?:    ModalSize;
  $accent?:  WinColor;
  $scroll?:  boolean;
  $animate?: 'fadeIn' | 'slideUp';
}>`
  ${p => win(p.$accent ?? MODAL_ACCENT.neutral)}
  ${pixelText}
  width: 100%;
  max-width: ${p => MAX_W[p.$size ?? 'md']};
  max-height: 90vh;
  color: ${C.text};
  overflow: ${p => (p.$scroll ? 'auto' : 'hidden')};
  display: ${p => (p.$scroll ? 'block' : 'flex')};
  flex-direction: column;
  animation: ${p => (p.$animate === 'slideUp'
    ? css`${modalSlideUp} 0.14s steps(4, end)`
    : css`${modalFadeIn} 0.12s steps(3, end)`)};

  ${media.mobile}  { max-height: 96vh; }
  ${lMedia.phone}  { max-height: 94vh; }
  ${lMedia.phoneSm}{ max-height: 97vh; }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ④ 헤더
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ModalHeader — 제목 줄.
 *
 * 4세대 창은 제목이 짙은 머리띠 위에 얹힌다. 창틀 안쪽 끝까지 닿아야 하므로
 * 창틀 두께만큼 음수 마진으로 밀어낸다.
 */
export const ModalHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.md};
  /* 창틀 안쪽 끝까지 사방으로 늘린다. 위를 당기지 않으면 창틀과 머리띠 사이에
     FRAME_W(12px)만큼 창 바탕이 띠처럼 남아, 머리띠가 붕 떠 보인다.
     예전에 위를 당겼다가 되돌린 적이 있는데, 그때 문제는 당긴 것 자체가 아니라
     패딩이 12px 그대로여서 제목이 모서리에 박힌 것이었다. 그래서 여기서는
     당기는 만큼 위아래 패딩을 키워 제목을 머리띠 한가운데에 놓는다. */
  margin: -${FRAME_W}px -${FRAME_W}px ${SP.md};
  /* 좌우로 FRAME_W 만큼 나가 있으므로 그만큼 더해야 본문과 좌변이 맞는다.
     예전에는 본문과 같은 값(16px)을 줘서 제목이 창틀에 붙어 보였다. */
  padding: ${SP.lg} calc(${FRAME_W}px + ${MODAL_PAD_X});
  background: ${C.panelSunk};
  border-bottom: 3px solid ${C.ink};
  flex-shrink: 0;

  ${media.mobile}  { padding: ${SP.md} calc(${FRAME_W}px + ${MODAL_PAD_X_M}); margin-bottom: ${SP.sm}; }
  ${lMedia.phoneSm}{ padding: ${SP.md} calc(${FRAME_W}px + ${MODAL_PAD_X_M}); margin-bottom: ${SP.sm}; }
`;

/** ModalTitle — 머리띠 위 제목. 아이콘 + 텍스트를 나란히 둔다. */
export const ModalTitle = styled.h2`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.text}; margin: 0;
  display: flex; align-items: center; gap: ${SP.sm};
  flex: 1; min-width: 0;
`;

/**
 * ModalCloseBtn — 머리띠 오른쪽 끝 닫기 버튼.
 * 창틀을 씌우지 않는다. 닫기는 글리프 하나로 충분하고, 테두리를 두르면 작은
 * 컨트롤이 부풀어 올라 제목보다 눈에 먼저 들어온다.
 */
export const ModalCloseBtn = styled.button`
  ${pixelBold}
  background: none;
  border: none;
  cursor: pointer;
  width: 32px; height: 32px; flex-shrink: 0;
  padding: 0;
  font-size: ${FONT.sm};
  color: ${C.textDim};
  display: flex; align-items: center; justify-content: center;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  &:active { color: ${C.text}; }
  ${focusRing}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ⑤ 내용이 창에 직접 놓이는 창 (확인 대화상자·픽커·결과창)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 글의 좌변 — 창틀 안쪽에서 이만큼 들어온다.
 *
 * 큰 창은 `창 자신(12px) + 안쪽 스크롤 상자(modalPadX)` 두 겹으로 이 값을 만든다.
 * 그런데 확인 대화상자·픽커·결과창은 안쪽 상자가 없어 내용이 창에 직접 놓인다.
 * 그대로 두면 창의 기본 여백(12px)만 남아 큰 창보다 좁은 좌변이 되므로, 이런
 * 창에서는 창 자신이 같은 값을 만든다.
 */
const GUTTER   = parseInt(SP.md, 10) + parseInt(MODAL_PAD_X, 10);    // 28
const GUTTER_M = parseInt(SP.md, 10) + parseInt(MODAL_PAD_X_M, 10);  // 24

/** 위 설명대로 좌변을 스스로 만드는 창. 나머지는 ModalBox 그대로. */
export const ModalPlainBox = styled(ModalBox)`
  padding-left: ${GUTTER}px; padding-right: ${GUTTER}px;
  ${media.mobile}   { padding-left: ${GUTTER_M}px; padding-right: ${GUTTER_M}px; }
  ${lMedia.phoneSm} { padding-left: ${GUTTER_M}px; padding-right: ${GUTTER_M}px; }
`;

/**
 * 그런 창의 제목 띠. 좌우로는 좌변만큼, 위로는 창의 세로 여백만큼 나갔다가
 * 패딩으로 되돌린다 — 띠는 창틀에 붙고 제목은 본문과 같은 좌변에 선다.
 * 가운데 정렬 제목(축하·결과 창)은 호출부에서 `text-align: center` 만 얹으면 된다.
 */
export const ModalPlainHeader = styled.div`
  margin: -${SP.md} -${GUTTER}px ${SP.md};
  padding: ${SP.lg} ${GUTTER}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  flex-shrink: 0;

  ${media.mobile}   { margin: -${SP.md} -${GUTTER_M}px ${SP.sm}; padding: ${SP.md} ${GUTTER_M}px; }
  ${lMedia.phoneSm} { margin: -${SP.md} -${GUTTER_M}px ${SP.sm}; padding: ${SP.md} ${GUTTER_M}px; }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ⑥ 탭과 필터 — 층위를 크기로 구분한다
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 주 탭 — "무엇을 볼까". 두꺼운 창틀에 한 단계 큰 글자.
 *
 * 전당은 [최단 클리어 | 최고 웨이브 | 내 기록] 아래에 [전체 맵 | 초보자의 좁은 길 …]
 * 이 붙는데, 둘이 같은 얇은 칩이라 **두 줄이 한 덩어리로 읽혔다.** 위는 화면을
 * 갈아끼우는 탭이고 아래는 그 안을 걸러내는 필터라 층위가 다르다. 색만으로는
 * 구분되지 않는다 — 둘 다 '선택된 것만 금색'이라 규칙까지 같아 보인다.
 */
export const ModalTabBtn = styled.button<{ $c?: BtnColor; $on?: boolean; $grow?: boolean }>`
  ${p => btn(p.$on ? (p.$c ?? 'gold') : 'plain')}
  ${pixelBold}
  flex: ${p => (p.$grow ? '1 1 auto' : '0 0 auto')};
  display: flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.md};
  color: ${p => (p.$on ? C.text : C.textSub)};
  white-space: nowrap;
  ${focusRing}

  ${media.mobile}  { font-size: ${FONT.sm}; }
  ${lMedia.phoneSm}{ font-size: ${FONT.sm}; }
`;

/** 하위 필터 칩 — "그 안에서 무엇을 걸러낼까". 얇은 창틀에 본문 크기. */
export const ModalChipBtn = styled.button<{ $c?: BtnColor; $on?: boolean }>`
  ${p => btnThin(p.$on ? (p.$c ?? 'gold') : 'plain')}
  ${pixelBold}
  flex: 0 0 auto;
  display: flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${p => (p.$on ? C.text : C.textSub)};
  white-space: nowrap;
  ${focusRing}
`;

/**
 * 가로로 스크롤하는 줄의 **바깥 껍데기**.
 *
 * 스크롤 상자 자신에게 좌우 여백을 주면 안 된다. 그 여백은 내용과 함께 밀려서,
 * 조금이라도 스크롤한 순간 첫 항목이 창틀에 딱 붙어 잘린다(업적 카테고리 탭이
 * 그랬다). 여백은 바깥이 잡고 스크롤은 안쪽이 하면, 잘리는 지점이 항상 여백
 * 안쪽으로 고정된다.
 */
export const ModalScrollRowPad = styled.div`
  ${modalPadX}
  flex-shrink: 0;
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ⑦ 레이아웃 보조
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 스크롤 영역 공통 — 각진 도트 스크롤바.
 *
 * 크롬은 스크롤되는 컨테이너를 키보드로 잡을 수 있게 해 준다(스크롤 영역 포커스).
 * 좋은 동작이지만 그때 그리는 링이 브라우저 기본값이라, 여기도 우리 링을 준다.
 * 이 자리가 빠져 있으면 자료실 본문에서만 둥근 파란 링이 뜬다.
 */
const scrollArea = css`
  flex: 1; overflow-y: auto; min-height: 0;
  ${focusRing}

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: 3px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: 3px solid ${C.ink}; }
`;

/** ModalBody — 패딩 없는 스크롤 영역 (내용이 직접 여백을 잡는다) */
export const ModalBody = styled.div`${scrollArea}`;

/**
 * ModalScrollBody — 여백이 포함된 스크롤 본문. $pad 로 덮어쓸 수 있다.
 *
 * 창틀이 사방 12px을 먹지만 그건 테두리 그림이지 여백이 아니다. 본문 여백을
 * 따로 주지 않으면 글이 테두리에 붙어 답답해진다.
 */
export const ModalScrollBody = styled.div<{ $pad?: string }>`
  ${scrollArea}
  ${p => (p.$pad
    ? css`padding: ${p.$pad};`
    : css`
        ${modalPadX}
        padding-top: ${SP.md}; padding-bottom: ${SP.md};
      `)}
`;

/**
 * ModalFooter — 하단 버튼 줄.
 * 창틀 안쪽 끝까지 닿도록 좌우/아래를 창틀 두께만큼 당긴다.
 */
export const ModalFooter = styled.div`
  margin: ${SP.md} -${FRAME_W}px -${FRAME_W}px;
  padding: ${SP.sm} ${SP.md};
  border-top: 3px solid ${C.ink};
  background: ${C.panelSunk};
  flex-shrink: 0;
  display: flex; gap: ${SP.sm}; align-items: center; justify-content: flex-end;

  ${media.mobile}  { padding: ${SP.sm}; }
  ${lMedia.phoneSm}{ padding: ${SP.xs} ${SP.sm}; }
`;

/** ModalDivider — 섹션 구분선 */
export const ModalDivider = styled.div`
  height: 3px;
  background: ${C.divider};
  flex-shrink: 0;
`;

/** ModalSectionPad — 섹션 표준 여백 래퍼 */
export const ModalSectionPad = styled.div`
  padding: ${SP.sm};
  flex-shrink: 0;
  ${lMedia.phoneSm} { padding: ${SP.xs}; }
`;
