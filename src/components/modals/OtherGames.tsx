// src/components/modals/OtherGames.tsx
//
// "이런 게임은 어떠세요?" — 같은 사람이 만든 나머지 두 게임으로 가는 창.
// 메인 메뉴 맨 아래 버튼으로 열린다.
//
// 목록은 src/data/otherGames.ts 가 들고 있고 자기 자신(SELF)은 빠져 있다.
// 문구는 언어를 타므로 i18n(otherGames.*)에 있다 — ko/en 둘 다 채워야 한다
// (I18nProvider에 언어 폴백이 없어 en이 비면 키 문자열이 그대로 보인다).
//
// ⚠️ 소개는 한 줄이다. 한때 갈래 딱지와 두 줄짜리 설명이 더 붙어 있었는데,
//    「PokeRhythm · 리듬게임 · 롬에서 뽑은 악보를 그대로 치기 · 4·5세대 브금 557곡을…」
//    처럼 같은 말을 세 번 하는 카드가 됐다. 여기서 할 일은 '무슨 게임인가' 하나다 —
//    나머지는 건너가면 그쪽 첫 화면이 말한다.
//
// ⚠️ 새 탭으로 연다. 메인 메뉴에서만 열리니 게임 중은 아니지만, 이 탭에는 로그인
//    세션과 방금 받아온 랭킹·도감이 올라와 있다. 구경하러 갔다가 돌아올 자리를
//    없앨 이유가 없다. rel="noopener"는 열린 탭이 이 창을 되잡지 못하게 한다.
//
// ⚠️ 버튼이 아니라 링크다. 겉모습은 모드 버튼(ModeBtn)과 같게 두되 <a>로 만든다 —
//    그래야 가운데 클릭·오른쪽 클릭·주소 복사가 다 된다. onClick만 단 <button>은
//    그 셋을 전부 죽인다.

import React from 'react';
import styled from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn, ModalScrollBody,
  MODAL_ACCENT,
} from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { useTranslation } from '../../i18n';
import { OTHER_GAMES } from '../../data/otherGames';
import { C, FONT, SP } from '../../styles/tokens';
import { btn, BtnColor, pixelText, pixelBold, shadowLg, cursorMark, cursorOn, CURSOR_GUTTER } from '../../styles/pixel';

/** 창틀 색 이름 → 글자에 쓸 액센트. 이름과 창틀이 같은 색이어야 셋이 갈린다. */
const ACCENT_INK: Record<string, string> = {
  gold: C.gold, green: C.green, purple: C.purple,
  blue: C.blue, cyan: C.cyan, teal: C.teal, red: C.red, plain: C.plain, navy: C.blue,
};

interface OtherGamesProps { onClose: () => void; }

export const OtherGames: React.FC<OtherGamesProps> = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="md" $accent={MODAL_ACCENT.gold} $animate="slideUp" onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle><Emoji glyph="🎮" size={18} /> {t('otherGames.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </ModalHeader>

        <ModalScrollBody>
          <Intro>{t('otherGames.intro')}</Intro>

          <List>
            {OTHER_GAMES.map(game => (
              <Card
                key={game.key}
                $c={game.accent}
                href={game.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GameName $ink={ACCENT_INK[game.accent] ?? C.text}>{game.name}</GameName>
                <Line>{t(`otherGames.games.${game.key}.line`)}</Line>
                {/* 어디로 가는지 미리 보인다 — 새 탭이 열리는 건 되돌리는 데 손이 하나 더 든다 */}
                <Go>{t('otherGames.open')} · {game.url.replace('https://', '')}</Go>
              </Card>
            ))}
          </List>

          <Footnote>{t('otherGames.footnote')}</Footnote>
        </ModalScrollBody>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ───────────────────────────────────────────────────────

const Intro = styled.p`
  ${pixelText}
  margin: 0 0 ${SP.md};
  font-size: ${FONT.sm}; color: ${C.textSub}; line-height: 1.7;
`;

const List = styled.div`
  display: flex; flex-direction: column; gap: ${SP.md};
`;

/** 모드 버튼과 같은 문법 — 창틀 + ▶ 커서. 여기만 다른 카드 모양을 들이지 않는다. */
const Card = styled.a<{ $c: BtnColor }>`
  ${p => btn(p.$c)}
  ${cursorMark}
  padding: ${SP.md} ${SP.md} ${SP.md} ${CURSOR_GUTTER}px;
  display: flex; flex-direction: column; gap: ${SP.xs};
  text-align: left; text-decoration: none;

  /* 떠오르지 않는다. 커서를 드러내는 것으로만 알린다 (DESIGN.md) */
  &:hover      { ${cursorOn} }
  &:focus-visible { outline: none; ${cursorOn} }
`;

const GameName = styled.span<{ $ink: string }>`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.md}; color: ${p => p.$ink}; line-height: 1.2;
`;

const Line = styled.span`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textSub}; line-height: 1.5;
  word-break: keep-all;
`;

const Go = styled.span`
  ${pixelText}
  margin-top: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textDim};
`;

const Footnote = styled.p`
  ${pixelText}
  margin: ${SP.md} 0 0;
  font-size: ${FONT.sm}; color: ${C.textDim}; line-height: 1.7;
`;
