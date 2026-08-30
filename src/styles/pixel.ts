// src/styles/pixel.ts
// ─────────────────────────────────────────────────────────────────────────────
// 포켓몬 게임 UI 문법을 styled-components 믹스인으로 옮긴 것.
//
// 창틀은 CSS가 아니라 PNG다. border-radius로 흉내내면 모서리가 안티에일리어싱된
// 곡선이 되어 즉시 "웹 카드"로 읽힌다. 창틀의 정체성은 모서리가 픽셀 계단이라는
// 점이다. 원본은 scripts/genUiFrames.mjs 가 생성한다.
// ─────────────────────────────────────────────────────────────────────────────

import { css } from 'styled-components';
import { C, SCALE, SP, FONT_STACK } from './tokens';

/** 창틀 PNG의 나인슬라이스 모서리 크기(art px). 생성기의 NORMAL/THIN과 맞춘다. */
const SLICE = 4;
const SLICE_THIN = 2;
/** 테두리가 화면에서 차지하는 CSS px */
export const FRAME_W = SLICE * SCALE;           // 12px
export const FRAME_W_THIN = SLICE_THIN * SCALE; //  6px

export type WinColor =
  | 'plain' | 'red' | 'teal' | 'gold' | 'blue' | 'purple' | 'green' | 'cyan' | 'navy';
export type BtnColor = WinColor;

/**
 * 창·패널 — 검은 외곽선 + 액센트 띠 2겹 + 안쪽 그림자 + 보라회색 채움.
 *
 * slice에 fill 키워드를 붙여 가운데까지 PNG로 그린다. 채움을 CSS 배경으로 두면
 * PNG에서 깎아낸 둥근 모서리 바깥으로 네모난 색이 삐져나온다.
 */
/**
 * 여백 하한.
 *
 * 12px 글자에 행간 1.5(=18px)가 붙으므로, 가로와 같은 값을 세로에 주면 글자가
 * 칸을 꽉 채워 답답해 보인다. 창틀·버튼 믹스인이 세로 여백의 바닥을 깔아 두고,
 * 필요하면 호출부가 padding을 다시 줘서 덮어쓴다.
 */
const PAD_WIN  = css`padding: ${SP.md};`;              // 12px
const PAD_BTN  = css`padding: ${SP.sm} ${SP.md};`;     //  8 / 12
const PAD_THIN = css`padding: ${SP.xs} ${SP.sm};`;     //  4 /  8

export const win = (color: WinColor = 'plain') => css`
  border: ${FRAME_W}px solid transparent;
  border-image-source: url('/images/ui/win-${color}.png');
  border-image-slice: ${SLICE} fill;
  border-image-repeat: stretch;
  background: none;
  ${PAD_WIN}
`;

/**
 * 버튼 — 창과 같은 띠에 한 톤 밝은 채움.
 *
 * 게임 버튼은 눌리지, 떠오르지 않는다. 기존 전역 규칙(index.css)은 모든 버튼을
 * translateY(-3px) + 파란 글로우로 띄우고 있었고, 그게 이 UI가 웹앱으로 읽히는
 * 큰 이유였다. 여기서는 누르면 그림자가 사라지며 내려앉고 띠 명암이 뒤집힌다.
 */
export const btn = (color: BtnColor = 'plain') => css`
  border: ${FRAME_W}px solid transparent;
  border-image-source: url('/images/ui/btn-${color}.png');
  border-image-slice: ${SLICE} fill;
  border-image-repeat: stretch;
  background: none;
  cursor: pointer;
  transition: none;
  ${PAD_BTN}

  /* 눌림은 테두리 명암이 뒤집히는 것으로만 알린다.
     예전에는 아래에 box-shadow로 검은 줄을 깔아 입체를 냈는데, 도트 테두리
     아래에 생짜 검은 선이 하나 더 그어져 그림자가 아니라 오류처럼 보였다.
     띠 자체가 이미 윗면/아랫면 명암을 갖고 있어 그림자가 필요 없다. */
  &:active:not(:disabled) {
    border-image-source: url('/images/ui/btn-${color}-in.png');
  }

  &:disabled {
    cursor: not-allowed;
    filter: grayscale(0.75) brightness(0.7);
  }
`;

/**
 * 얇은 버튼 — X 닫기, 로그아웃처럼 작은 컨트롤용.
 *
 * btn()의 창틀은 사방 12px을 먹는다. 44×36 짜리 버튼에 씌우면 가로 44 중 24가
 * 테두리라, 납작한 컨트롤이 아니라 부풀어 오른 덩어리로 보인다. 이쪽은 띠가
 * 2겹(6px)뿐이고 하드 그림자도 빼서 평평하게 앉는다.
 */
export const btnThin = (color: BtnColor = 'plain') => css`
  border: ${FRAME_W_THIN}px solid transparent;
  border-image-source: url('/images/ui/btn-${color}-thin.png');
  border-image-slice: ${SLICE_THIN} fill;
  border-image-repeat: stretch;
  background: none;
  cursor: pointer;
  transition: none;
  ${PAD_THIN}

  &:active:not(:disabled) {
    border-image-source: url('/images/ui/btn-${color}-thin-in.png');
  }

  &:disabled {
    cursor: not-allowed;
    filter: grayscale(0.75) brightness(0.7);
  }
`;

/** 얇은 창 — 배지, 작은 정보 칸용. */
export const winThin = (color: WinColor = 'plain') => css`
  border: ${FRAME_W_THIN}px solid transparent;
  border-image-source: url('/images/ui/win-${color}-thin.png');
  border-image-slice: ${SLICE_THIN} fill;
  border-image-repeat: stretch;
  background: none;
  ${PAD_THIN}
`;

/**
 * 페이지 배경 — 게임 맵을 어둡게 깔고 그 위에 스크림을 덮는다.
 *
 * 장식용 파티클(별똥별) 대신 실제 게임 자산을 쓴다. 포케로그도 메뉴 뒤에 게임
 * 화면을 보여준다. 썸네일(480×320, 10~20KB)을 pixelated로 확대하므로 대역폭
 * 부담이 없고, 확대된 도트가 오히려 의도된 질감으로 읽힌다.
 *
 * 화면 Root에 붙여 쓴다. 내용이 위에 오도록 자식들은 position/z-index를 갖는다.
 */
export const backdrop = (map = 'easy_loop') => css`
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -2;
    background: url('/images/maps/thumbs/${map}.webp') center / cover no-repeat;
    image-rendering: pixelated;
  }
  /* 스크림 — 맵이 UI를 이기지 않게 눌러준다 */
  &::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: ${C.bg};
    opacity: 0.86;
  }
`;

/** 화면 상단 HUD 바 — 창과 같은 면에 위아래만 액센트/외곽선으로 마감한다. */
export const hudBar = css`
  background: ${C.panel};
  border-top: ${SCALE}px solid ${C.divider};
  border-bottom: ${SCALE}px solid ${C.ink};
`;

/** 한 단 파인 영역 — 목록 행 배경, 입력칸, 게이지 트랙. 그림자에 블러가 없다. */
export const sunken = (fill: string = C.panelSunk) => css`
  background: ${fill};
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 ${SCALE}px 0 rgba(0, 0, 0, 0.28);
  ${PAD_THIN}
`;

/**
 * 도트 폰트 렌더링.
 *
 * 두 가지가 핵심이다.
 *  ① -webkit-font-smoothing: none — 안티에일리어싱이 켜져 있으면 글자 가장자리에
 *     회색 반픽셀이 생겨 도트가 흐물흐물해진다. 기존 index.css는 antialiased 였다.
 *  ② text-shadow — 블러 0의 하드 그림자. 포켓몬 UI 글자는 예외 없이 이걸 달고
 *     있고, 없으면 도트 폰트를 써도 웹 텍스트로 읽힌다. 배경이 무엇이든 글자가
 *     떠 보이게 만드는 역할도 한다.
 *
 * 그림자 두께는 **글자 크기에 비례**한다. 기본은 1px — 화면 글자의 대부분이
 * 12px이고, 거기에 3px 그림자를 달면 획 사이가 메워져 글자를 먹는다.
 * FONT.xl(24px) 이상에는 `shadowLg` 를 덧씌운다.
 */
export const pixelText = css`
  font-family: ${FONT_STACK};
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  letter-spacing: 0;
  font-weight: 400;
  /* 행간. 브라우저 기본(normal)은 Galmuri 메트릭에서 글자 위아래가 잘려 보인다.
     받침 있는 한글과 괄호·슬래시가 특히 눈에 띄게 깎인다. */
  line-height: 1.5;
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

/** 강조 — Galmuri11 Bold. 한글 음절을 커버한다(가나·한자는 미포함, 미사용). */
export const pixelBold = css`
  ${pixelText}
  font-weight: 700;
`;

/**
 * 큰 글자(FONT.xl 이상)용 두꺼운 그림자.
 * 기본 1px은 24px 글자 옆에서 거의 안 보인다 — 그림자가 글자 크기를 따라가야
 * 어느 크기에서든 같은 무게로 읽힌다.
 */
export const shadowLg = css`
  text-shadow: ${SCALE}px ${SCALE}px 0 ${C.textShadow};
`;

/** 도트 이미지가 뭉개지지 않게. 스프라이트·맵·창틀에 공통 적용. */
export const crisp = css`
  image-rendering: pixelated;
`;

/**
 * 선택 커서 — 포켓몬 메뉴의 ▶ 포인터. hover 글로우 대신 이걸 쓴다.
 *
 * 커서는 창 '안쪽' 왼편에 놓는다. 바깥에 두면 커서 자리만큼 목록 전체가
 * 오른쪽으로 밀려 위아래 다른 창들과 좌변이 어긋난다. 호출부는 내용에
 * CURSOR_GUTTER 만큼 padding-left 를 줘서 자리를 비운다.
 */
export const CURSOR_GUTTER = 24;

export const cursorMark = css`
  position: relative;
  &::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 50%;
    width: 0;
    height: 0;
    /* 짝수 크기라야 꼭짓점이 픽셀 경계에 맞는다 */
    border-left: 12px solid ${C.gold};
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    transform: translateY(-50%);
    filter: drop-shadow(${SCALE}px ${SCALE}px 0 ${C.textShadow});
    opacity: 0;
  }
`;

/** 위 커서를 드러내는 상태. 부모에서 &:hover, &[data-on] 등으로 조합한다. */
export const cursorOn = css`
  &::before { opacity: 1; }
`;
