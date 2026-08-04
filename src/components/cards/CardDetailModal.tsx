// src/components/cards/CardDetailModal.tsx
// 진짜 포켓몬 도감 느낌의 카드 상세 — 아트/이름/번호/분류/타입/설명/종족값/전투스탯/신체.

import { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { X } from 'lucide-react';
import { pokeAPI, PokemonData } from '../../api/pokeapi';
import { buildBattleCard } from '../../services/CardBattleService';
import { Rarity, RARITY_COLORS } from '../../data/evolution';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { useTranslation } from '../../i18n';
import { MAX_STARS, MERGE_COPIES } from '../../services/CardService';
import { CardView } from './CardView';

interface Props {
  pokemonId: number;
  stars: number;
  /** 다음 별까지 모아둔 잉여 중복 수. 없으면 진행도 줄을 숨긴다. */
  copies?: number;
  rarity?: Rarity;
  onClose: () => void;
}

const STAT_ROWS: Array<{ key: keyof PokemonData['stats']; label: string }> = [
  { key: 'hp', label: 'picker.hp' },
  { key: 'attack', label: 'picker.attack' },
  { key: 'defense', label: 'picker.defense' },
  { key: 'specialAttack', label: 'picker.spAttack' },
  { key: 'specialDefense', label: 'picker.spDefense' },
  { key: 'speed', label: 'picker.speed' },
];

// 종족값 → 막대 색(낮음 빨강 → 높음 초록)
const statBarColor = (v: number): string =>
  v >= 120 ? '#22c55e' : v >= 90 ? '#84cc16' : v >= 60 ? '#eab308' : v >= 40 ? '#f97316' : '#ef4444';

export const CardDetailModal = ({ pokemonId, stars, copies = 0, rarity, onClose }: Props) => {
  const { t } = useTranslation();
  const [data, setData] = useState<PokemonData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null); setFailed(false);
    pokeAPI.getPokemon(pokemonId)
      .then(p => { if (alive) setData(p); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [pokemonId]);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const battle = useMemo(
    () => (data ? buildBattleCard(data, { stars, row: 'front', slot: 0, side: 'player' }) : null),
    [data, stars],
  );

  const statTotal = data
    ? Object.values(data.stats).reduce((s, v) => s + v, 0)
    : 0;
  const rColor = rarity ? RARITY_COLORS[rarity] : '#8aa';

  return (
    <Overlay onClick={onClose}>
      <Box onClick={e => e.stopPropagation()}>
        <TopStripe $c={rColor} />
        <CloseBtn onClick={onClose} aria-label={t('common.close')}><X size={18} /></CloseBtn>

        {!data && !failed && <Loading>{t('cards.detail.loading')}</Loading>}
        {failed && <Loading>{t('cards.detail.failed')}</Loading>}

        {data && (
          <Body>
            {/* 좌: 카드 아트 */}
            <Left>
              <CardView pokemonId={pokemonId} stars={stars} rarity={rarity} size={190} />
              {rarity && <RarityTag $c={rColor}>{t(`cards.rarity.${rarity}`)}</RarityTag>}

              {/* 합성 진행도 — 중복을 몇 장 더 모아야 별이 오르는지.
                  이게 없으면 중복이 쌓여도 화면상 아무 변화가 없어 합성이 안 되는 줄 안다. */}
              {stars >= MAX_STARS ? (
                <MergeNote>{t('cards.detail.mergeMax')}</MergeNote>
              ) : (
                <MergeBox>
                  <MergeLbl>{t('cards.detail.mergeNext', { n: copies, of: MERGE_COPIES })}</MergeLbl>
                  <MergePips>
                    {Array.from({ length: MERGE_COPIES }, (_, i) => <Pip key={i} $on={i < copies} />)}
                  </MergePips>
                </MergeBox>
              )}
            </Left>

            {/* 우: 상세 */}
            <Right>
              <DexNo>#{String(pokemonId).padStart(3, '0')}</DexNo>
              <Name>{data.displayName}</Name>
              {data.genus && <Genus>{data.genus}</Genus>}

              <TypeRow>
                {data.types.map(ty => (
                  <TypeBadge key={ty} $c={getTypeColor(ty)}>{t(`types.${ty}`)}</TypeBadge>
                ))}
              </TypeRow>

              {data.flavorText && <Flavor>{data.flavorText}</Flavor>}

              <Physical>
                <PhysItem><PhysLbl>{t('cards.detail.height')}</PhysLbl><PhysVal>{data.heightM.toFixed(1)} m</PhysVal></PhysItem>
                <PhysItem><PhysLbl>{t('cards.detail.weight')}</PhysLbl><PhysVal>{data.weightKg.toFixed(1)} kg</PhysVal></PhysItem>
              </Physical>

              {/* 종족값 */}
              <SectionLbl>{t('cards.detail.baseStats')}</SectionLbl>
              <Stats>
                {STAT_ROWS.map(({ key, label }) => {
                  const v = data.stats[key];
                  return (
                    <StatRow key={key}>
                      <StatName>{t(label)}</StatName>
                      <StatNum>{v}</StatNum>
                      <BarTrack><BarFill $w={Math.min(100, (v / 180) * 100)} $c={statBarColor(v)} /></BarTrack>
                    </StatRow>
                  );
                })}
                <StatRow>
                  <StatName $bold>{t('cards.detail.statTotal')}</StatName>
                  <StatNum $bold>{statTotal}</StatNum>
                  <BarTrack><BarFill $w={Math.min(100, (statTotal / 720) * 100)} $c="#60b0ff" /></BarTrack>
                </StatRow>
              </Stats>

              {/* 전투 스탯(별 반영) */}
              {battle && (
                <>
                  <SectionLbl>
                    {t('cards.detail.battleStats')}
                    {/* 덱 시너지 배율(최대 1.5배)은 편성 후에 붙으므로 여기 수치엔 미반영 */}
                    <SubLbl>★{stars} · Lv.{battle.level} · {t('cards.detail.beforeSynergy')}</SubLbl>
                  </SectionLbl>
                  <BattleGrid>
                    <BStat><BLbl>{t('picker.hp')}</BLbl><BVal>{battle.maxHp}</BVal></BStat>
                    <BStat><BLbl>{t('picker.attack')}</BLbl><BVal>{battle.attack}</BVal></BStat>
                    <BStat><BLbl>{t('picker.defense')}</BLbl><BVal>{battle.defense}</BVal></BStat>
                    <BStat><BLbl>{t('picker.spAttack')}</BLbl><BVal>{battle.specialAttack}</BVal></BStat>
                    <BStat><BLbl>{t('picker.spDefense')}</BLbl><BVal>{battle.specialDefense}</BVal></BStat>
                    <BStat><BLbl>{t('picker.speed')}</BLbl><BVal>{battle.speed}</BVal></BStat>
                  </BattleGrid>
                </>
              )}
            </Right>
          </Body>
        )}
      </Box>
    </Overlay>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
const fadeIn = keyframes`from{opacity:0}to{opacity:1}`;
const slideUp = keyframes`from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}`;

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center;
  background: rgba(4,6,12,0.72); backdrop-filter: blur(4px); padding: 20px;
  animation: ${fadeIn} 0.18s ease;
`;
const Box = styled.div`
  position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
  background: radial-gradient(circle at top, #161d33, #0b0f1a);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6); animation: ${slideUp} 0.24s ease;
`;
const TopStripe = styled.div<{ $c: string }>`
  height: 5px; border-radius: 18px 18px 0 0;
  background: linear-gradient(90deg, transparent, ${p => p.$c}, transparent);
`;
const CloseBtn = styled.button`
  position: absolute; top: 12px; right: 12px; z-index: 2;
  display: flex; background: rgba(255,255,255,0.08); border: none; border-radius: 8px;
  color: rgba(255,255,255,0.6); padding: 6px; cursor: pointer;
  &:hover { background: rgba(255,255,255,0.16); color: #fff; }
`;
const Loading = styled.div`padding: 60px; text-align: center; color: rgba(255,255,255,0.5); font-size: 14px;`;

const Body = styled.div`
  display: flex; gap: 22px; padding: 22px;
  @media (max-width: 560px) { flex-direction: column; align-items: center; gap: 16px; }
`;
const Left = styled.div`
  flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 10px;
`;
const RarityTag = styled.div<{ $c: string }>`
  font-size: 12px; font-weight: 800; letter-spacing: 0.05em; color: ${p => p.$c};
  border: 1px solid ${p => p.$c}66; background: ${p => p.$c}18; padding: 3px 12px; border-radius: 20px;
`;
const MergeBox = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 5px; margin-top: 2px;
`;
const MergeLbl = styled.div`font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); letter-spacing: 0.02em;`;
const MergePips = styled.div`display: flex; gap: 4px;`;
const Pip = styled.span<{ $on: boolean }>`
  width: 18px; height: 5px; border-radius: 3px;
  background: ${p => (p.$on ? '#c084fc' : 'rgba(255,255,255,0.12)')};
  box-shadow: ${p => (p.$on ? '0 0 6px #c084fc88' : 'none')};
`;
const MergeNote = styled.div`font-size: 11px; font-weight: 700; color: #fbbf24; letter-spacing: 0.02em; margin-top: 2px;`;
const Right = styled.div`flex: 1; min-width: 0; width: 100%;`;
const DexNo = styled.div`font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.4); letter-spacing: 0.08em;`;
const Name = styled.h2`font-size: 24px; font-weight: 900; color: #f8fafc; margin: 2px 0 3px; letter-spacing: -0.02em;`;
const Genus = styled.div`font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 10px;`;

const TypeRow = styled.div`display: flex; gap: 8px; margin-bottom: 12px;`;
const TypeBadge = styled.span<{ $c: string }>`
  font-size: 12px; font-weight: 800; color: #fff; padding: 4px 14px; border-radius: 20px;
  background: ${p => p.$c}; box-shadow: 0 2px 6px ${p => p.$c}55;
`;

const Flavor = styled.p`
  font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.68);
  margin: 0 0 12px; padding: 10px 12px; border-radius: 10px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
`;
const Physical = styled.div`display: flex; gap: 10px; margin-bottom: 14px;`;
const PhysItem = styled.div`
  flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 8px 12px;
  border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
`;
const PhysLbl = styled.span`font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em;`;
const PhysVal = styled.span`font-size: 15px; font-weight: 700; color: #e8edf5;`;

const SectionLbl = styled.div`
  display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700;
  color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 8px;
`;
const SubLbl = styled.span`font-size: 11px; font-weight: 700; color: #fbbf24; letter-spacing: 0; text-transform: none;`;

const Stats = styled.div`display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;`;
const StatRow = styled.div`display: grid; grid-template-columns: 52px 34px 1fr; align-items: center; gap: 8px;`;
const StatName = styled.span<{ $bold?: boolean }>`
  font-size: 11px; color: ${p => (p.$bold ? '#cdd6e4' : 'rgba(255,255,255,0.55)')}; font-weight: ${p => (p.$bold ? 800 : 600)};
`;
const StatNum = styled.span<{ $bold?: boolean }>`
  font-size: 12px; font-weight: ${p => (p.$bold ? 800 : 700)}; color: #e8edf5; text-align: right;
`;
const BarTrack = styled.div`height: 7px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden;`;
const BarFill = styled.div<{ $w: number; $c: string }>`
  height: 100%; width: ${p => p.$w}%; background: ${p => p.$c}; border-radius: 4px; transition: width 0.4s ease;
`;

const BattleGrid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
`;
const BStat = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px;
  border-radius: 10px; background: rgba(96,176,255,0.06); border: 1px solid rgba(96,176,255,0.16);
`;
const BLbl = styled.span`font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.04em;`;
const BVal = styled.span`font-size: 16px; font-weight: 800; color: #cfe4ff;`;
