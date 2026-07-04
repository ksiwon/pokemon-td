// src/components/cards/CardControls.tsx
// 도감/덱편성 공용 컨트롤 바 — 검색 · 정렬 · 타입 필터 · 레어도 필터.

import styled from 'styled-components';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { Rarity } from '../../data/evolution';
import { CardFilterState, CARD_SORT_KEYS, isFilterActive } from '../../utils/cardCatalog';

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
const Bar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
`;
const SearchBox = styled.div`
  display: flex; align-items: center; gap: 6px; flex: 1 1 180px; min-width: 150px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 0 10px; color: rgba(255,255,255,0.5);
  &:focus-within { border-color: rgba(96,176,255,0.5); }
`;
const SearchInput = styled.input`
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: #e8edf5; font-size: 13px; padding: 8px 0;
  &::placeholder { color: rgba(255,255,255,0.35); }
`;
const ClearInline = styled.button`
  display: flex; background: none; border: none; color: rgba(255,255,255,0.4);
  cursor: pointer; padding: 2px; &:hover { color: #fff; }
`;
const Sel = styled.select`
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; color: #e8edf5; font-size: 13px; padding: 8px 10px; cursor: pointer;
  &:focus { outline: none; border-color: rgba(96,176,255,0.5); }
  option { background: #12182a; color: #e8edf5; }
`;
const Count = styled.span`font-size: 12px; color: rgba(255,255,255,0.45); white-space: nowrap;`;
const ResetBtn = styled.button`
  display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: rgba(255,255,255,0.6);
  font-size: 12px; padding: 7px 10px; cursor: pointer;
  &:hover { background: rgba(255,255,255,0.1); color: #fff; }
`;
