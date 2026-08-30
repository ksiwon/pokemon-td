// src/components/cards/CardControls.tsx
// 도감/덱편성 공용 컨트롤 바 — 검색 · 정렬 · 타입 필터 · 레어도 필터.

import styled from 'styled-components';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { Rarity } from '../../data/evolution';
import { CardFilterState, CARD_SORT_KEYS, isFilterActive } from '../../utils/cardCatalog';
import { C, FONT, SP } from '../../styles/tokens';
import { btnThin, sunken, pixelText, pixelBold } from '../../styles/pixel';

const TYPE_SLUGS = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];
const RARITIES: Rarity[] = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Master', 'Legend'];

interface Props {
  value: CardFilterState;
  onChange: (next: CardFilterState) => void;
  resultCount: number;
  totalCount: number;
}

export const CardControls = ({ value, onChange, resultCount, totalCount }: Props) => {
  const { t } = useTranslation();
  const set = (patch: Partial<CardFilterState>) => onChange({ ...value, ...patch });
  const active = isFilterActive(value);

  return (
    <Bar>
      <SearchBox>
        <Search size={14} />
        <SearchInput
          value={value.search}
          placeholder={t('cards.filter.searchPlaceholder')}
          onChange={e => set({ search: e.target.value })}
        />
        {value.search && (
          <ClearInline onClick={() => set({ search: '' })} aria-label={t('cards.filter.clear')}>
            <X size={13} />
          </ClearInline>
        )}
      </SearchBox>

      <Sel value={value.sort} onChange={e => set({ sort: e.target.value as CardFilterState['sort'] })}>
        {CARD_SORT_KEYS.map(k => (
          <option key={k} value={k}>{t('cards.filter.sortPrefix')}: {t(`cards.filter.sort.${k}`)}</option>
        ))}
      </Sel>

      <Sel value={value.type} onChange={e => set({ type: e.target.value })}>
        <option value="">{t('cards.filter.allTypes')}</option>
        {TYPE_SLUGS.map(ty => (
          <option key={ty} value={ty}>{t(`types.${ty}`)}</option>
        ))}
      </Sel>

      <Sel value={value.rarity} onChange={e => set({ rarity: e.target.value as CardFilterState['rarity'] })}>
        <option value="">{t('cards.filter.allRarities')}</option>
        {RARITIES.map(r => (
          <option key={r} value={r}>{t(`cards.rarity.${r}`)}</option>
        ))}
      </Sel>

      {active && (
        <>
          <Count>{t('cards.filter.resultCount', { n: resultCount, total: totalCount })}</Count>
          <ResetBtn onClick={() => set({ search: '', type: '', rarity: '' })}>
            <X size={13} /> {t('cards.filter.clear')}
          </ResetBtn>
        </>
      )}
    </Bar>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
//
// 예전에는 검색 인풋 + 드롭다운 3개가 반투명 둥근 사각으로 나란히 놓여 있어
// 어드민 테이블의 필터바처럼 읽혔다. 입력칸은 '한 단 파인 면'(sunken)으로,
// 버튼은 얇은 창틀로 바꿔 게임 UI 문법에 맞춘다.

const Bar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: ${SP.sm};
`;
const SearchBox = styled.div`
  ${sunken()}
  display: flex; align-items: center; gap: ${SP.xs}; flex: 1 1 180px; min-width: 150px;
  padding: ${SP.xs} ${SP.sm}; color: ${C.textDim};
`;
const SearchInput = styled.input`
  ${pixelText}
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: ${C.text}; font-size: ${FONT.sm}; padding: ${SP.xs} 0;
  &::placeholder { color: ${C.textDim}; }
`;
const ClearInline = styled.button`
  display: flex; background: none; border: none; padding: 2px;
  color: ${C.textDim}; cursor: pointer;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  &:focus, &:focus-visible { outline: none; }
`;
const Sel = styled.select`
  ${sunken()}
  ${pixelText}
  color: ${C.text}; font-size: ${FONT.sm}; padding: ${SP.xs} ${SP.sm}; cursor: pointer;
  &:focus { outline: none; }
  /* 네이티브 드롭다운 목록은 OS가 그리므로 색만 맞춘다 */
  option { background: ${C.panelSunk}; color: ${C.text}; }
`;
const Count = styled.span`
  font-size: ${FONT.sm}; color: ${C.textDim}; white-space: nowrap;
`;
const ResetBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  color: ${C.text}; font-size: ${FONT.sm};
  padding: ${SP.xs} ${SP.sm};
  &:focus, &:focus-visible { outline: none; }
`;
