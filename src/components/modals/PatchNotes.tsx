// src/components/modals/PatchNotes.tsx
//
// 인게임 패치노트 — 메인 메뉴 '내 정보' 줄의 [패치노트] 버튼으로 열린다.
//
// ★ 원본은 docs/CHANGELOG.md 다. 이 파일은 그중 **유저에게 의미 있는 항목만**
//   추려 최근 버전을 보여주는 뷰일 뿐이다. 새 버전을 낼 때:
//     1) docs/CHANGELOG.md 에 전체 내역을 적는다 (내부 리팩터 포함).
//     2) 유저에게 보일 항목이 있으면 아래 PATCH_NOTES 맨 앞에 한 항목 추가.
//     3) 문구는 ko.json / en.json 의 patchNotes.* 에 넣는다. **두 언어 모두.**
//        i18n에 언어 폴백이 없다(I18nProvider: 키 없으면 키 문자열을 그대로 반환).
//        en.json을 비워두면 영어 모드에서 'patchNotes.v2_24.dupMove'가 그대로 보인다.
//        영어 번역을 안 할 거라면 최소한 한국어 문구를 en.json에도 복사해 둘 것.
//   내부 작업만 있는 버전은 여기 넣지 않는다 (유저에게 빈 항목으로 보인다).
//
// 마지막으로 확인한 버전을 localStorage에 기록해, 새 버전이 있으면
// 메뉴 버튼에 점(dot)을 띄운다. hasUnreadPatchNotes()가 그 판정을 한다.

import React from 'react';
import styled from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn, ModalScrollBody,
  MODAL_ACCENT,
} from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, pixelBold } from '../../styles/pixel';

// ─── 데이터 ──────────────────────────────────────────────────────────────────
// 최신 버전이 배열 맨 앞. date는 ISO(YYYY-MM-DD) — 표시 형식은 로케일에 맡긴다.
// items의 각 원소는 { kind, key }:
//   kind = 'added' | 'changed' | 'fixed'  (내부 작업 'internal'은 인게임 미표시)
//   key  = ko.json / en.json 의 patchNotes.<version>.<key> 하위 문구
type PatchKind = 'added' | 'changed' | 'fixed';

type PatchNote = {
  /** i18n 키에 쓰이는 식별자. 점(.)이 키 경로와 충돌하므로 밑줄로 쓴다. */
  id: string;
  /** 화면에 보이는 버전 라벨 */
  version: string;
  date: string;
  items: { kind: PatchKind; key: string }[];
};

export const PATCH_NOTES: PatchNote[] = [
  {
    id: 'v2_25', version: 'v2.25', date: '2026-08-30',
    items: [
      { kind: 'changed', key: 'uiOverhaul' },
      { kind: 'added',   key: 'gameDocs' },
      { kind: 'added',   key: 'quizKindReward' },
      { kind: 'changed', key: 'quizRanked' },
      { kind: 'fixed',   key: 'mapTooltip' },
      { kind: 'fixed',   key: 'typeColor' },
      { kind: 'fixed',   key: 'modalSpacing' },
    ],
  },
  {
    id: 'v2_24', version: 'v2.24', date: '2026-08-24',
    items: [
      { kind: 'fixed', key: 'dupMove' },
      { kind: 'fixed', key: 'waveRecord' },
    ],
  },
  {
    id: 'v2_23', version: 'v2.23', date: '2026-08-17',
    items: [
      { kind: 'changed', key: 'cardsGuide' },
      { kind: 'changed', key: 'guestNotice' },
    ],
  },
  {
    id: 'v2_22', version: 'v2.22', date: '2026-08-08',
    items: [
      { kind: 'added', key: 'quizSpeed' },
      { kind: 'added', key: 'quizRoomOptions' },
      { kind: 'fixed', key: 'roomJoin' },
    ],
  },
  {
    id: 'v2_21', version: 'v2.21', date: '2026-08-05',
    items: [
      { kind: 'fixed', key: 'englishLeak' },
    ],
  },
  {
    id: 'v2_20', version: 'v2.20', date: '2026-08-04',
    items: [
      { kind: 'added', key: 'mergeProgress' },
      { kind: 'fixed', key: 'chunkReload' },
    ],
  },
];

// ─── 읽음 표시 ────────────────────────────────────────────────────────────────
const SEEN_KEY = 'pokemon-td-patchnotes-seen';

/** 아직 안 본 최신 버전이 있는가 (메뉴 버튼 dot 표시용) */
export const hasUnreadPatchNotes = (): boolean => {
  const latest = PATCH_NOTES[0]?.id;
  if (!latest) return false;
  try { return localStorage.getItem(SEEN_KEY) !== latest; } catch { return false; }
};

export const markPatchNotesSeen = (): void => {
  const latest = PATCH_NOTES[0]?.id;
  if (!latest) return;
  try { localStorage.setItem(SEEN_KEY, latest); } catch { /* 프라이빗 모드 — 무시 */ }
};

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
interface PatchNotesProps { onClose: () => void; }

const KIND_GLYPH: Record<PatchKind, string> = {
  added:   '✨',
  changed: '🔧',
  fixed:   '🐛',
};

export const PatchNotes: React.FC<PatchNotesProps> = ({ onClose }) => {
  const { t } = useTranslation();

  // 열자마자 읽음 처리 — 스크롤을 끝까지 안 내려도 "봤다"로 취급한다.
  React.useEffect(() => { markPatchNotesSeen(); }, []);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="md" $accent={MODAL_ACCENT.cyan} $animate="slideUp" onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle><Emoji glyph="📜" size={18} /> {t('patchNotes.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </ModalHeader>

        <ModalScrollBody>
          <Intro>{t('patchNotes.intro')}</Intro>

          {PATCH_NOTES.map((note, i) => (
            <Version key={note.id}>
              <VersionHead>
                <VersionLabel $latest={i === 0}>{note.version}</VersionLabel>
                {i === 0 && <LatestBadge>{t('patchNotes.latest')}</LatestBadge>}
                <VersionDate>{note.date}</VersionDate>
              </VersionHead>

              <ItemList>
                {note.items.map(item => (
                  <Item key={item.key}>
                    <ItemKind $kind={item.kind}>
                      <Emoji glyph={KIND_GLYPH[item.kind]} size={12} />
                      {t(`patchNotes.kind.${item.kind}`)}
                    </ItemKind>
                    <ItemText>{t(`patchNotes.${note.id}.${item.key}`)}</ItemText>
                  </Item>
                ))}
              </ItemList>
            </Version>
          ))}

          <Footnote>{t('patchNotes.footnote')}</Footnote>
        </ModalScrollBody>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const KIND_COLOR: Record<PatchKind, string> = {
  added:   C.green,
  changed: C.blue,
  fixed:   C.gold,
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

const Intro = styled.p`
  margin: 0 0 ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const Version = styled.section`
  & + & {
    margin-top: ${SP.lg};
    padding-top: ${SP.md};
    border-top: ${SCALE}px solid ${C.ink};
  }
`;

const VersionHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.sm};
  margin-bottom: ${SP.sm};
`;

const VersionLabel = styled.span<{ $latest: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$latest ? C.blue : C.text)};
`;

const LatestBadge = styled.span`
  ${winThin('blue')}
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.blue};
`;

const VersionDate = styled.span`
  margin-left: auto;
  font-size: ${FONT.sm};
  color: ${C.textDim};
  font-variant-numeric: tabular-nums;
`;

const ItemList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: ${SP.sm};
`;

const Item = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${SP.sm};

  ${media.mobile} {
    flex-direction: column;
    gap: ${SP.xs};
  }
`;

/** 변경 종류 배지 — 알약을 걷어내고 각진 면 + 검은 외곽선. */
const ItemKind = styled.span<{ $kind: PatchKind }>`
  ${pixelBold}
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: ${SP.xs};
  min-width: 62px;
  padding: 0 ${SP.xs};
  font-size: ${FONT.sm};
  line-height: 1.5;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${p => KIND_COLOR[p.$kind]};
`;

const ItemText = styled.span`
  font-size: ${FONT.sm};
  color: ${C.text};
  word-break: keep-all;
`;

const Footnote = styled.p`
  margin: ${SP.lg} 0 0;
  padding-top: ${SP.md};
  border-top: ${SCALE}px solid ${C.ink};
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;
