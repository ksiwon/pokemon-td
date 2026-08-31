// src/components/shared/screen.tsx
//
// 전체 화면(모달이 아닌 라우트 화면)의 공통 껍데기.
//
// 왜 필요했나 — 같은 역할의 조각이 화면마다 따로 선언돼 있었다.
//   `Root` 17곳 · `Title` 16곳 · `TopBar` 10곳 · `BackBtn` 11곳 · `Body` 9곳.
// 값은 토큰에서 가져오니 색은 안 갈렸는데, **여백 조합이 갈렸다.** 실측한 본문 여백:
//
//   xl lg xxl (미니 포켓 허브·퀴즈 허브)   xl md xxl (퀴즈 진행·속도전 로비)
//   lg md xxl (속도전 방)                  xl lg     (멀티 로비)
//   lg lg xl  (메인 메뉴)
//
// 좌우가 lg(16)인 화면과 md(12)인 화면이 섞여 있어서, 화면을 오갈 때 내용 좌변이
// 미세하게 흔들렸다. 상단 바도 어떤 화면은 태블릿 브레이크포인트가 있고 어떤 화면은
// 없어서 iPad에서 헤더 높이가 화면마다 달랐다.
//
// 그래서 **여백을 컴포넌트가 소유한다.** 화면은 여백을 정하지 않고 이 껍데기를 쓴다.
// 예외가 필요하면 `styled(ScreenBody)` 로 덧쓰되, 그건 예외라는 뜻이다.

import styled from 'styled-components';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { hudBar, btnThin, pixelText, pixelBold, focusRing } from '../../styles/pixel';
import { media } from '../../utils/responsive.utils';

/** 화면 바깥 틀. 배경·글꼴·세로 배치만 책임진다. */
export const Screen = styled.div`
  ${pixelText}
  min-height: 100vh;
  background: ${C.bg};
  color: ${C.text};
  display: flex;
  flex-direction: column;
`;

/**
 * 상단 바 — [뒤로] · [제목] · [우측 슬롯] 3분할.
 * 세 단계 반응형을 여기 한 곳에만 둔다(화면마다 있고 없고가 갈리던 자리).
 */
export const ScreenTopBar = styled.header`
  ${hudBar}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.lg};
  position: sticky;
  top: 0;
  z-index: 20;

  ${media.tablet} { padding: ${SP.sm} ${SP.md}; gap: ${SP.sm}; }
  ${media.mobile} { padding: ${SP.xs} ${SP.sm}; gap: ${SP.xs}; }
`;

/**
 * 화면 제목.
 * 예전엔 본문과 같은 12px이라 제목으로 읽히지 않았다 — 16px(FONT.md)로 한 칸 올린다.
 * 좁은 화면에서는 뒤로가기·우측 슬롯에 자리를 내주려고 12px로 내려간다.
 */
export const ScreenTitle = styled.h1`
  ${pixelBold}
  margin: 0;
  font-size: ${FONT.md};
  color: ${C.gold};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${media.mobile} { font-size: ${FONT.sm}; }
`;

/** 뒤로가기. 아이콘을 넣을 수 있게 flex 로 둔다. */
export const ScreenBackBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: ${SP.xs};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  white-space: nowrap;
  ${focusRing}
`;

/**
 * 상단 바 우측을 비워 제목을 가운데로 맞추는 빈 칸.
 * 화면마다 `<span style={{ width: 40 }} />` 를 손으로 쓰던 자리.
 */
export const ScreenSpacer = styled.span`
  flex: 0 0 auto;
  width: 40px;
`;

/**
 * 본문. **화면 여백의 단일 출처.**
 * 폭 상한 960px은 도트 UI에서 한 줄이 너무 길어지지 않게 하는 값이고,
 * 아래 여백이 위보다 큰 건 스크롤 끝에서 마지막 항목이 화면 밑변에 붙지 않게 하려는 것.
 */
export const ScreenBody = styled.main<{ $narrow?: boolean }>`
  flex: 1;
  width: 100%;
  /* 읽는 화면(퀴즈 문제·속도전)은 한 줄이 길면 눈이 되돌아오기 힘들어 좁게 쓴다. */
  max-width: ${p => (p.$narrow ? '620px' : '960px')};
  margin: 0 auto;
  padding: ${SP.xl} ${SP.lg} ${SP.xxl};
  display: flex;
  flex-direction: column;
  gap: ${SP.lg};

  ${media.tablet} { padding: ${SP.lg} ${SP.md} ${SP.xl}; gap: ${SP.md}; }
  ${media.mobile} { padding: ${SP.md} ${SP.sm} ${SP.xl}; gap: ${SP.md}; }
`;

/** 본문 안의 구획 제목. 오른쪽으로 선이 이어져 구획을 연다. */
export const SectionLabel = styled.div`
  ${pixelBold}
  display: flex;
  align-items: center;
  gap: ${SP.sm};
  margin-top: ${SP.xs};
  font-size: ${FONT.sm};
  color: ${C.gold};

  &::after {
    content: '';
    flex: 1;
    height: ${SCALE}px;
    background: ${C.divider};
  }
`;

/** 목록이 비었을 때. 문구만 넘기면 된다. */
export const EmptyState = styled.div`
  ${pixelText}
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${SP.sm};
  padding: ${SP.xxl} ${SP.lg};
  font-size: ${FONT.sm};
  color: ${C.textDim};
  text-align: center;
  word-break: keep-all;
`;
