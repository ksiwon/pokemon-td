// src/components/cards/DeckBuilder.tsx
// 6칸 덱 편성(전열3/후열3) + 보유 카드 배치 + 실시간 타입 시너지 표시.

import { useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import { media } from '../../utils/responsive.utils';
import { Screen, ScreenBackBtn as BackBtn, ScreenTopBar as TopBar } from '../shared/screen';
import { ArrowLeft, Shield, Crosshair, Save, Info } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { cardService } from '../../services/CardService';
import { useCardState } from '../../hooks/useCardState';
import { useCardMeta } from '../../hooks/useCardMeta';
import { computeSynergies } from '../../services/CardBattleService';
import { Deck, DeckRow } from '../../types/cards';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { CardFilterState, DEFAULT_CARD_FILTER, applyCardFilter } from '../../utils/cardCatalog';
import { CardView } from './CardView';
import { CardControls } from './CardControls';
import { CardDetailModal } from './CardDetailModal';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { btnThin, sunken, pixelBold, focusRing } from '../../styles/pixel';

type SlotState = { pokemonId: number; stars: number } | null;
const EMPTY: SlotState[] = [null, null, null, null, null, null]; // [front0,1,2, back0,1,2]

const idxOf = (row: DeckRow, slot: number) => (row === 'front' ? 0 : 3) + slot;

export const DeckBuilder = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
  const state = useCardState();
  const [slots, setSlots] = useState<SlotState[]>(EMPTY);
  const [sel, setSel] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<CardFilterState>(DEFAULT_CARD_FILTER);
  const [detailId, setDetailId] = useState<number | null>(null);

  const owned = useMemo(
    () => Object.values(state.collection),
    [state.collection],
  );

  // 보유 카드 이름·타입·레어도 (검색/필터/정렬 + 시너지 + CardView용)
  const { meta, rarity } = useCardMeta(owned.map(c => c.pokemonId));

  // 필터+정렬 적용된 풀
  const shownOwned = useMemo(
    () => applyCardFilter(owned, filter, meta, rarity),
    [owned, filter, meta, rarity],
  );

  const detailEntry = detailId != null ? state.collection[detailId] : null;

  // 저장된 덱 로드
  useEffect(() => {
    const deck = cardService.getDeck();
    const next = [...EMPTY];
    deck.forEach(s => {
      const entry = state.collection[s.pokemonId];
      if (entry) next[idxOf(s.row, s.slot)] = { pokemonId: s.pokemonId, stars: entry.stars };
    });
    setSlots(next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const placedIds = useMemo(() => new Set(slots.filter(Boolean).map(s => s!.pokemonId)), [slots]);

  // 현재 덱 시너지(타입 알려진 카드만)
  const synergies = useMemo(() => {
    const team = slots.filter(Boolean).map((s, i) => ({
      uid: `s${i}`, types: meta[s!.pokemonId]?.types ?? [],
    }));
    return computeSynergies(team as any);
  }, [slots, meta]);

  const flyingPen = synergies.find(s => s.type === 'flying');
  const ghostPen = synergies.find(s => s.type === 'ghost');

  const placeCard = (c: { pokemonId: number; stars: number }) => {
    setSaved(false);
    setSlots(prev => {
      const next = [...prev];
      // 이미 배치된 카드면 제거(토글)
      const existing = next.findIndex(s => s?.pokemonId === c.pokemonId);
      if (existing >= 0) { next[existing] = null; return next; }
      // 선택 슬롯 있으면 거기, 없으면 첫 빈칸
      let target = sel !== null && next[sel] === null ? sel : next.findIndex(s => s === null);
      if (target < 0) return next; // 가득 참
      next[target] = { pokemonId: c.pokemonId, stars: c.stars };
      return next;
    });
    setSel(null);
  };

  const clearSlot = (i: number) => {
    setSaved(false);
    setSlots(prev => { const n = [...prev]; n[i] = null; return n; });
  };

  const save = () => {
    const deck: Deck = [];
    slots.forEach((s, i) => {
      if (!s) return;
      const row: DeckRow = i < 3 ? 'front' : 'back';
      deck.push({ pokemonId: s.pokemonId, row, slot: i % 3 });
    });
    cardService.setDeck(deck);
    setSaved(true);
  };

  const count = slots.filter(Boolean).length;

  const renderRow = (row: DeckRow) => {
    const offset = row === 'front' ? 0 : 3;
    return (
      <RowWrap>
        <RowLabel>
          {row === 'front' ? <><Shield size={13} /> {t('cards.deck.front')}</> : <><Crosshair size={13} /> {t('cards.deck.back')}</>}
        </RowLabel>
        <RowSlots>
          {[0, 1, 2].map(slot => {
            const i = offset + slot;
            const s = slots[i];
            return (
              <Slot key={i} $selected={sel === i} $filled={!!s}
                    onClick={() => (s ? clearSlot(i) : setSel(sel === i ? null : i))}>
                {s ? (
                  <CardView pokemonId={s.pokemonId} stars={s.stars} size={80} interactive={false} />
                ) : (
                  <SlotEmpty>{sel === i ? t('cards.deck.placeHere') : '+'}</SlotEmpty>
                )}
              </Slot>
            );
          })}
        </RowSlots>
      </RowWrap>
    );
  };

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onBack}><ArrowLeft size={16} /> {t('cards.common.back')}</BackBtn>
        <Title>{t('cards.deck.title')} <Count>{count}/6</Count></Title>
        {/* 0장 저장도 허용 → 모든 카드 회수(덱 비우기) 가능 */}
        <SaveBtn $on onClick={save}>
          <Save size={15} /> {saved ? t('cards.deck.saved') : t('cards.deck.save')}
        </SaveBtn>
      </TopBar>

      <Field>
        {renderRow('front')}
        {renderRow('back')}

        {/* 시너지 패널 */}
        <SynergyPanel>
          <SynTitle>{t('cards.deck.synergyTitle')}</SynTitle>
          {synergies.length === 0 ? (
            <SynEmpty>{t('cards.deck.synergyEmpty')}</SynEmpty>
          ) : (
            <SynList>
              {synergies.sort((a, b) => b.count - a.count).map(s => (
                <SynChip key={s.type} $c={getTypeColor(s.type)}>
                  <SynDot $c={getTypeColor(s.type)} />
                  {s.type} {s.count} <SynTier>·{s.tier >= 3 ? '1.5x' : s.tier === 2 ? '1.3x' : '1.1x'}</SynTier>
                </SynChip>
              ))}
            </SynList>
          )}
          {(flyingPen || ghostPen) && (
            <PenNote>
              <Crosshair size={12} /> {t('cards.deck.penetrate', {
                types: [flyingPen && t('types.flying'), ghostPen && t('types.ghost')].filter(Boolean).join('·'),
              })}
            </PenNote>
          )}
          <EffectLegend>{t('cards.deck.effectLegend')}</EffectLegend>
        </SynergyPanel>
      </Field>

      {/* 보유 카드 */}
      <PoolLabel>{t('cards.deck.owned', { n: owned.length })}</PoolLabel>
      {owned.length > 0 && (
        <PoolControls>
          <CardControls
            value={filter}
            onChange={setFilter}
            resultCount={shownOwned.length}
            totalCount={owned.length}
          />
        </PoolControls>
      )}
      <Pool>
        {owned.length === 0 && <PoolEmpty>{t('cards.deck.poolEmpty')}</PoolEmpty>}
        {owned.length > 0 && shownOwned.length === 0 && <PoolEmpty>{t('cards.lab.noResults')}</PoolEmpty>}
        {shownOwned.map(c => (
          <PoolCard key={c.pokemonId} $placed={placedIds.has(c.pokemonId)} onClick={() => placeCard(c)}>
            <CardView pokemonId={c.pokemonId} stars={c.stars} rarity={rarity[c.pokemonId]} size={84} interactive={false} />
            {placedIds.has(c.pokemonId) && <PlacedMark>{t('cards.deck.placed')}</PlacedMark>}
            <InfoBtn
              aria-label={t('cards.detail.baseStats')}
              onClick={e => { e.stopPropagation(); setDetailId(c.pokemonId); }}
            >
              <Info size={13} />
            </InfoBtn>
          </PoolCard>
        ))}
      </Pool>

      {detailEntry && detailId != null && (
        <CardDetailModal
          pokemonId={detailId}
          stars={detailEntry.stars}
          rarity={rarity[detailId]}
          onClose={() => setDetailId(null)}
        />
      )}
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 패널, 점선 슬롯, 알약 시너지 칩, backdrop-filter,
//           hover 떠오름, letter-spacing eyebrow, Tailwind 팔레트.

/** 하단 고정 바에 내용이 가리지 않게 아래만 더 비운다. */
const Root = styled(Screen)`
  padding-bottom: ${SP.xxl};
`;
const Title = styled.h1`
  ${pixelBold}
  font-size: ${FONT.md}; margin: 0; color: ${C.gold};
  display: flex; align-items: center; gap: ${SP.sm};
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const Count = styled.span`
  font-size: ${FONT.sm}; color: ${C.textSub}; font-weight: 400;
  ${media.mobile} { display: none; }
`;
const SaveBtn = styled.button<{ $on: boolean }>`
  ${p => btnThin(p.$on ? 'green' : 'plain')}
  ${pixelBold}
  flex: 0 0 auto;
  display: flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.xs} ${SP.md};
  color: ${p => (p.$on ? C.green : C.textDim)};
  font-size: ${FONT.sm};
  cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')};
  white-space: nowrap;
  ${focusRing}
`;

const Field = styled.div`
  max-width: 720px; margin: 0 auto; padding: ${SP.xl} ${SP.md} ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.md};
  ${media.mobile} { padding: ${SP.md} ${SP.sm} ${SP.sm}; gap: ${SP.sm}; }
`;
const RowWrap = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const RowLabel = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
`;
const RowSlots = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.md};
  ${media.mobile} { gap: ${SP.sm}; }
`;
/** 빈 슬롯 — 점선 대신 한 단 파인 면. 선택된 슬롯만 골드 테두리. */
const Slot = styled.div<{ $selected: boolean; $filled: boolean }>`
  ${sunken()}
  aspect-ratio: 1 / 1.3; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  ${p => p.$selected && css`box-shadow: inset 0 0 0 ${SCALE}px ${C.gold};`}
`;
const SlotEmpty = styled.div`
  ${pixelBold}
  font-size: ${FONT.xl}; color: ${C.textDim}; text-shadow: none;
`;

const SynergyPanel = styled.div`
  ${sunken()}
  margin-top: ${SP.sm}; padding: ${SP.md};
`;
const SynTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.md}; color: ${C.gold}; margin-bottom: ${SP.sm};
`;
const SynEmpty = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;
const SynList = styled.div`display: flex; flex-wrap: wrap; gap: ${SP.sm};`;
/** 시너지 칩 — 알약이 아니라 타입 색 면 + 검은 외곽선. */
const SynChip = styled.div<{ $c: string }>`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.text};
  padding: ${SP.xs} ${SP.sm};
  background: ${C.panelSunk};
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$c};
`;
const SynDot = styled.span<{ $c: string }>`width: 8px; height: 8px; background: ${p => p.$c}; border: 2px solid ${C.ink};`;
const SynTier = styled.span`color: ${C.textSub}; font-weight: 400;`;
const PenNote = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs}; margin-top: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.red};
`;

const EffectLegend = styled.div`
  margin-top: ${SP.sm}; font-size: ${FONT.sm}; color: ${C.textDim};
`;

const PoolLabel = styled.div`
  ${pixelBold}
  max-width: 720px; margin: ${SP.md} auto ${SP.sm}; padding: 0 ${SP.md};
  font-size: ${FONT.sm}; color: ${C.gold};
`;
const PoolControls = styled.div`max-width: 720px; margin: 0 auto ${SP.md}; padding: 0 ${SP.md};`;
const Pool = styled.div`
  max-width: 720px; margin: 0 auto; padding: 0 ${SP.md};
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: ${SP.md};
`;
const PoolEmpty = styled.div`
  grid-column: 1/-1; padding: ${SP.xxl}; text-align: center;
  color: ${C.textDim}; font-size: ${FONT.sm};
`;
const PoolCard = styled.div<{ $placed: boolean }>`
  position: relative; cursor: pointer;
  opacity: ${p => (p.$placed ? 0.45 : 1)};
`;
const PlacedMark = styled.div`
  ${pixelBold}
  position: absolute; top: 4px; right: 4px;
  background: ${C.green}; color: ${C.ink};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1; padding: ${SP.xs} ${SP.sm};
  text-shadow: none;
`;
const InfoBtn = styled.button`
  position: absolute; top: 4px; left: 4px; display: flex; z-index: 2;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${C.textSub}; padding: 2px; cursor: pointer;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  ${focusRing}
`;
