// src/components/cards/DeckBuilder.tsx
// 6칸 덱 편성(전열3/후열3) + 보유 카드 배치 + 실시간 타입 시너지 표시.

import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
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
const Root = styled.div`min-height: 100vh; background: radial-gradient(circle at top, #11162a, #070910); color: #e8edf5; padding-bottom: 40px;`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.07); position: sticky; top: 0;
  background: rgba(10,12,22,0.85); backdrop-filter: blur(10px); z-index: 20;
`;
const BackBtn = styled.button`
  display: flex; align-items: center; gap: 5px; background: transparent;
  border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
  padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 14px;
  &:hover { background: rgba(255,255,255,0.07); }
`;
const Title = styled.h1`font-size: 17px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px;`;
const Count = styled.span`font-size: 13px; color: rgba(255,255,255,0.45); font-weight: 600;`;
const SaveBtn = styled.button<{ $on: boolean }>`
  display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: none;
  background: ${p => (p.$on ? '#34d399' : 'rgba(255,255,255,0.08)')}; color: ${p => (p.$on ? '#07090f' : 'rgba(255,255,255,0.4)')};
  font-weight: 800; font-size: 14px; cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')};
`;

const Field = styled.div`max-width: 720px; margin: 0 auto; padding: 24px 16px 8px; display: flex; flex-direction: column; gap: 16px;`;
const RowWrap = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const RowLabel = styled.div`display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); letter-spacing: 0.08em;`;
const RowSlots = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;`;
const Slot = styled.div<{ $selected: boolean; $filled: boolean }>`
  aspect-ratio: 1 / 1.3; border-radius: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border: 2px ${p => (p.$filled ? 'solid' : 'dashed')} ${p => (p.$selected ? '#fbbf24' : 'rgba(255,255,255,0.15)')};
  background: ${p => (p.$selected ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)')};
  transition: all 0.15s;
  &:hover { border-color: rgba(255,255,255,0.35); }
`;
const SlotEmpty = styled.div`font-size: 24px; color: rgba(255,255,255,0.25); font-weight: 300;`;

const SynergyPanel = styled.div`
  margin-top: 8px; padding: 14px 16px; border-radius: 12px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
`;
const SynTitle = styled.div`font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); margin-bottom: 8px; letter-spacing: 0.08em;`;
const SynEmpty = styled.div`font-size: 13px; color: rgba(255,255,255,0.35);`;
const SynList = styled.div`display: flex; flex-wrap: wrap; gap: 8px;`;
const SynChip = styled.div<{ $c: string }>`
  display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700;
  padding: 4px 10px; border-radius: 20px; color: #fff;
  background: ${p => p.$c}22; border: 1px solid ${p => p.$c}66; text-transform: capitalize;
`;
const SynDot = styled.span<{ $c: string }>`width: 8px; height: 8px; border-radius: 50%; background: ${p => p.$c};`;
const SynTier = styled.span`color: rgba(255,255,255,0.6); font-weight: 600;`;
const PenNote = styled.div`
  display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #fca5a5; font-weight: 600;
`;

const PoolLabel = styled.div`max-width: 720px; margin: 16px auto 8px; padding: 0 16px; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.4); letter-spacing: 0.08em;`;
const PoolControls = styled.div`max-width: 720px; margin: 0 auto 12px; padding: 0 16px;`;
const Pool = styled.div`
  max-width: 720px; margin: 0 auto; padding: 0 16px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 12px;
`;
const PoolEmpty = styled.div`grid-column: 1/-1; padding: 30px; text-align: center; color: rgba(255,255,255,0.35); font-size: 13px;`;
const PoolCard = styled.div<{ $placed: boolean }>`
  position: relative; cursor: pointer; border-radius: 12px;
  opacity: ${p => (p.$placed ? 0.45 : 1)}; transition: transform 0.12s;
  &:hover { transform: translateY(-3px); }
`;
const PlacedMark = styled.div`
  position: absolute; top: 4px; right: 4px; background: #34d399; color: #07090f;
  font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 6px;
`;
const InfoBtn = styled.button`
  position: absolute; top: 4px; left: 4px; display: flex; z-index: 2;
  background: rgba(8,12,20,0.72); border: 1px solid rgba(255,255,255,0.18);
  border-radius: 50%; color: rgba(255,255,255,0.75); padding: 3px; cursor: pointer;
  transition: background 0.12s, color 0.12s;
  &:hover { background: rgba(96,176,255,0.35); color: #fff; }
`;
