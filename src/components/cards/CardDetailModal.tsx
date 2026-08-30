// src/components/cards/CardDetailModal.tsx
// 진짜 포켓몬 도감 느낌의 카드 상세 — 아트/이름/번호/분류/타입/설명/종족값/전투스탯/신체.

import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { pokeAPI, PokemonData } from '../../api/pokeapi';
import { buildBattleCard } from '../../services/CardBattleService';
import { Rarity, RARITY_COLORS } from '../../data/evolution';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { useTranslation } from '../../i18n';
import { MAX_STARS, MERGE_COPIES } from '../../services/CardService';
import { CardView } from './CardView';
import { C, FONT, SP, SCALE, STAT_RAMP } from '../../styles/tokens';
import { win, sunken, pixelText, pixelBold, shadowLg } from '../../styles/pixel';

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
  v >= 120 ? STAT_RAMP.best : v >= 90 ? STAT_RAMP.high
  : v >= 60 ? STAT_RAMP.mid : v >= 40 ? STAT_RAMP.low : STAT_RAMP.worst;

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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, 알약 배지, uppercase eyebrow, backdrop-filter, 둥근 모서리,
//           번지는 그림자, 10~11px 글자.

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 4000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 16, 26, 0.82);
  padding: ${SP.lg};
`;
const Box = styled.div`
  ${win('purple')}
  ${pixelText}
  position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
  color: ${C.text};

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;
/** 레어도 띠 — 창 맨 위에 한 줄. 그라디언트가 아니라 단색 면. */
const TopStripe = styled.div<{ $c: string }>`
  height: ${SCALE * 2}px;
  background: ${p => p.$c};
`;
const CloseBtn = styled.button`
  position: absolute; top: ${SP.sm}; right: ${SP.sm}; z-index: 2;
  display: flex; background: none; border: none; padding: ${SP.xs}; cursor: pointer;
  color: ${C.textDim};
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  &:focus, &:focus-visible { outline: none; }
`;
const Loading = styled.div`
  padding: ${SP.xxl}; text-align: center; color: ${C.textDim}; font-size: ${FONT.sm};
`;

const Body = styled.div`
  display: flex; gap: ${SP.xl}; padding: ${SP.lg};
  @media (max-width: 560px) { flex-direction: column; align-items: center; gap: ${SP.md}; }
`;
const Left = styled.div`
  flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: ${SP.sm};
`;
const RarityTag = styled.div<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$c};
  background: ${C.panelSunk};
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$c};
  padding: ${SP.xs} ${SP.sm};
`;
const MergeBox = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: ${SP.xs}; margin-top: 2px;
`;
const MergeLbl = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;
const MergePips = styled.div`display: flex; gap: ${SP.xs};`;
const Pip = styled.span<{ $on: boolean }>`
  width: 18px; height: 6px;
  background: ${p => (p.$on ? C.purple : C.panelSunk)};
  border: 2px solid ${C.ink};
`;
const MergeNote = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold}; margin-top: 2px;
`;
const Right = styled.div`flex: 1; min-width: 0; width: 100%;`;
const DexNo = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;
const Name = styled.h2`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.text}; margin: 2px 0 ${SP.xs};
`;
const Genus = styled.div`font-size: ${FONT.sm}; color: ${C.textSub}; margin-bottom: ${SP.sm};`;

const TypeRow = styled.div`display: flex; gap: ${SP.sm}; margin-bottom: ${SP.md};`;
/** 타입 배지 — 타입 색은 정체성이라 면으로 칠하고 검은 외곽선을 두른다. */
const TypeBadge = styled.span<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  padding: ${SP.xs} ${SP.md};
  background: ${p => p.$c};
  border: ${SCALE}px solid ${C.ink};
`;

const Flavor = styled.p`
  ${sunken()}
  font-size: ${FONT.sm}; color: ${C.textSub};
  margin: 0 0 ${SP.md}; padding: ${SP.sm};
  word-break: keep-all;
`;
const Physical = styled.div`display: flex; gap: ${SP.sm}; margin-bottom: ${SP.md};`;
const PhysItem = styled.div`
  ${sunken()}
  flex: 1; display: flex; flex-direction: column; padding: ${SP.xs} ${SP.sm};
`;
/** uppercase eyebrow를 걷어낸 자리 — 그냥 작은 회색 라벨. */
const PhysLbl = styled.span`font-size: ${FONT.sm}; color: ${C.textDim};`;
const PhysVal = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
`;

/** 목록 머리글 — 골드 라벨 + 가로선. MainMenu·미니포켓 허브와 같은 문법. */
const SectionLbl = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.gold};
  margin: ${SP.xs} 0 ${SP.sm};

  &::after { content: ''; flex: 1; height: ${SCALE}px; background: ${C.divider}; }
`;
const SubLbl = styled.span`
  ${pixelBold}
  order: 99;
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

const Stats = styled.div`display: flex; flex-direction: column; gap: ${SP.xs}; margin-bottom: ${SP.md};`;
const StatRow = styled.div`display: grid; grid-template-columns: 64px 40px 1fr; align-items: center; gap: ${SP.sm};`;
const StatName = styled.span<{ $bold?: boolean }>`
  font-size: ${FONT.sm};
  color: ${p => (p.$bold ? C.text : C.textSub)};
  font-weight: ${p => (p.$bold ? 700 : 400)};
`;
const StatNum = styled.span<{ $bold?: boolean }>`
  font-size: ${FONT.sm}; font-weight: 700; color: ${C.text}; text-align: right;
  text-shadow: 1px 1px 0 ${C.textShadow};
`;
/** 게이지 — 한 단 파인 트랙에 각진 막대. */
const BarTrack = styled.div`
  ${sunken()}
  height: 12px; overflow: hidden;
`;
const BarFill = styled.div<{ $w: number; $c: string }>`
  height: 100%; width: ${p => p.$w}%; background: ${p => p.$c};
`;

const BattleGrid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.sm};
`;
const BStat = styled.div`
  ${sunken()}
  display: flex; flex-direction: column; align-items: center;
  padding: ${SP.xs};
`;
const BLbl = styled.span`font-size: ${FONT.sm}; color: ${C.textDim};`;
const BVal = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.blue};
`;
