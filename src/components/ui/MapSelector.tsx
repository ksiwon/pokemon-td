// src/components/ui/MapSelector.tsx
import { useState } from "react";
import styled from "styled-components";
import { media, lMedia } from "../../utils/responsive.utils";
import { useTranslation } from "../../i18n";
import { MAPS, mapThumbnail } from "../../data/maps";
import { useGameStore } from "../../store/gameStore";
import { Difficulty, MapData } from "../../types/game";
import { useNavigate } from "react-router-dom";
import { Emoji } from "../shared/Emoji";
import { Screen } from "../shared/screen";
import { C, FONT, SP, SCALE } from "../../styles/tokens";
import { btnThin, winThin, hudBar, pixelBold, shadowLg, type WinColor } from "../../styles/pixel";

type DifficultyFilter = "easiest" | "easy" | "medium" | "hard" | "expert";

const DIFF_META: Record<DifficultyFilter, { color: string; win: WinColor; dot: string }> = {
  easiest: { color: C.plain,  win: 'plain',  dot: "⬜" },
  easy:    { color: C.green,  win: 'green',  dot: "🟢" },
  medium:  { color: C.blue,   win: 'blue',   dot: "🔵" },
  hard:    { color: C.gold,   win: 'gold',   dot: "🟠" },
  expert:  { color: C.red,    win: 'red',    dot: "🔴" },
};

export const MapSelector: React.FC<{ onSelect: (mapId: string) => void }> = ({ onSelect }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setMap = useGameStore(s => s.setMap);
  const setDifficulty = useGameStore(s => s.setDifficulty);
  const [filter, setFilter] = useState<DifficultyFilter | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  

  const handleFilter = (d: DifficultyFilter) => {
    setFilter(prev => prev === d ? null : d);
    const gd: Difficulty = d as Difficulty;
    setDifficulty(gd);
  };

  const handleSelect = (map: MapData) => {
    setMap(map.id);
    const gd: Difficulty = map.difficulty as Difficulty;
    setDifficulty(gd);
    onSelect(map.id);
  };

  const shown = filter ? MAPS.filter(m => m.difficulty === filter) : MAPS;

  const mapName = (map: MapData) =>
    t(`mapData.${map.id}.name`) !== `mapData.${map.id}.name`
      ? t(`mapData.${map.id}.name`) : map.name;

  const mapDesc = (map: MapData) =>
    t(`mapData.${map.id}.description`) !== `mapData.${map.id}.description`
      ? t(`mapData.${map.id}.description`) : map.description;

  return (
    <Root>
      {/* ── Header ── */}
      <Header>
        <BackBtn onClick={() => navigate('/')}>←<span className="back-text"> {t('common.back')}</span></BackBtn>
        <HeaderCenter>
          <HeaderTitle>{t('mapSelector.subtitle')}</HeaderTitle>
        </HeaderCenter>
        <HeaderRight />
      </Header>

      {/* ── Filter pills ── */}
      <FilterBar>
        <FilterPill $active={filter === null} $win="plain" $color={C.text} onClick={() => setFilter(null)}>
          {t('mapSelector.filterAll')}
        </FilterPill>
        {(Object.keys(DIFF_META) as DifficultyFilter[]).map(d => (
          <FilterPill
            key={d}
            $active={filter === d}
            $win={DIFF_META[d].win}
            $color={DIFF_META[d].color}
            onClick={() => handleFilter(d)}
          >
            <Emoji glyph={DIFF_META[d].dot} size={11} color={DIFF_META[d].color} />&nbsp;{t(`mapSelector.${d}`)}
          </FilterPill>
        ))}
      </FilterBar>

      {/* ── Grid ── */}
      <GridArea>
        {shown.length === 0 ? (
          <Empty>{t('mapSelector.noMaps')}</Empty>
        ) : (
          <Grid>
            {shown.map(map => {
              const meta = DIFF_META[map.difficulty as DifficultyFilter];
              return (
                <Card
                  key={map.id}
                  $img={mapThumbnail(map)}
                  $color={meta?.color ?? C.plain}
                  onMouseEnter={() => setHovered(map.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleSelect(map)}
                >
                  <CardOverlay />
                  <CardHoverOverlay $active={hovered === map.id} />

                  <CardTop>
                    <DiffBadge $win={meta?.win ?? 'plain'} $color={meta?.color ?? C.plain}>
                      <Emoji glyph={meta?.dot} size={12} color={meta?.color} />
                      {t(`mapSelector.${map.difficulty}`)}
                    </DiffBadge>
                  </CardTop>

                  <CardBottom>
                    <CardTitle>{mapName(map)}</CardTitle>
                    <CardDesc>{mapDesc(map)}</CardDesc>
                    <SelectHint $active={hovered === map.id}>
                      ▶ {t('mapSelector.clickToSelect')}
                    </SelectHint>
                  </CardBottom>
                </Card>
              );
            })}
          </Grid>
        )}
      </GridArea>
    </Root>
  );
};
// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
//
// 걷어낸 것: eyebrow(POKEMON AEGIS, letter-spacing 0.3em), 대문자 영문 난이도
//           배지(EASIEST/HARD), 알약 필터, backdrop-filter, hover 떠오름+글로우,
//           둥근 모서리, 스태거 fadeUp, Tailwind 팔레트.

// ─── Root ─────────────────────────────────────────────────────────────────────

const Root = Screen;

// ─── Header ───────────────────────────────────────────────────────────────────

const Header = styled.header`
  ${hudBar}
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.md};
  padding: 0 ${SP.lg}; height: 60px;
  flex-shrink: 0;
  ${media.mobile}   { padding: 0 ${SP.md}; height: 52px; }
  ${lMedia.phoneSm} { padding: 0 ${SP.sm}; height: 44px; }
`;

const BackBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  white-space: nowrap; flex-shrink: 0;
  &:focus, &:focus-visible { outline: none; }

  .back-text {
    ${media.mobile} { display: none; }
  }
`;

const HeaderCenter = styled.div`
  text-align: center;
  flex: 1;
  min-width: 0;
`;

const HeaderTitle = styled.h1`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold};
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

const HeaderRight = styled.div`
  width: 88px;
  ${media.mobile} { width: 32px; }
`;

// ─── Filter bar ───────────────────────────────────────────────────────────────

const FilterBar = styled.div`
  display: flex; align-items: center; gap: ${SP.sm}; flex-wrap: wrap;
  padding: ${SP.md} ${SP.lg};
  border-bottom: ${SCALE}px solid ${C.ink};
  ${media.mobile}   { padding: ${SP.sm} ${SP.md}; gap: ${SP.xs}; }
  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm}; gap: ${SP.xs}; }
`;

/** 알약이 아니라 얇은 창틀 버튼. 선택된 쪽만 난이도 색 창틀을 쓴다. */
const FilterPill = styled.button<{ $active: boolean; $win: WinColor; $color: string }>`
  ${p => btnThin(p.$active ? p.$win : 'plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${p => (p.$active ? p.$color : C.textSub)};
  white-space: nowrap;
  display: inline-flex; align-items: center; gap: ${SP.xs};
  &:focus, &:focus-visible { outline: none; }
`;

// ─── Grid area ────────────────────────────────────────────────────────────────

const GridArea = styled.div`
  flex: 1; padding: ${SP.xl} ${SP.lg} ${SP.xxl}; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center;
  ${media.mobile}   { padding: ${SP.lg} ${SP.md} ${SP.xl}; }
  ${lMedia.phoneSm} { padding: ${SP.md} ${SP.md} ${SP.lg}; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 280px));
  gap: ${SP.lg};
  width: 100%;
  max-width: 1200px;
  justify-content: center;
  ${media.tablet}   { grid-template-columns: repeat(2,1fr); gap: ${SP.md}; max-width: 640px; }
  ${media.mobile}   { grid-template-columns: 1fr; gap: ${SP.sm}; max-width: 400px; }
  ${lMedia.tablet}  { grid-template-columns: repeat(4, minmax(0,220px)); gap: ${SP.md}; }
  ${lMedia.phoneSm} { grid-template-columns: repeat(2,1fr); gap: ${SP.sm}; max-width: 600px; }
`;

/**
 * 맵 카드 — 창틀 PNG를 쓸 수 없다. border-image의 fill이 가운데까지 덮어
 * 썸네일이 가려지기 때문이다. 대신 같은 문법(검은 외곽선 + 액센트 띠)을
 * 두 겹의 하드 테두리로 직접 그린다. 블러 없는 inset이라 창틀과 붙여 놔도
 * 이질감이 없다.
 */
const Card = styled.div<{ $img: string; $color: string }>`
  position: relative; overflow: hidden;
  height: 220px; cursor: pointer;
  background-image: url(${p => p.$img});
  background-size: cover; background-position: center;
  background-color: ${C.ink};
  image-rendering: pixelated;
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$color};
  display: flex; flex-direction: column; justify-content: space-between;

  ${media.mobile}   { height: 180px; }
  ${lMedia.phoneSm} { height: 150px; }
`;

/** 썸네일 위 스크림 — 글자가 어떤 맵 위에서도 읽히게. */
const CardOverlay = styled.div`
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(22,27,40,0.25) 0%, rgba(22,27,40,0.86) 100%);
  pointer-events: none;
`;

const CardHoverOverlay = styled.div<{ $active: boolean }>`
  position: absolute; inset: 0;
  background: rgba(255,255,255,0.06);
  opacity: ${p => (p.$active ? 1 : 0)};
  pointer-events: none;
`;

const CardTop = styled.div`
  position: relative; z-index: 2; padding: ${SP.md};
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;

/** 난이도 배지 — 대문자 영문(EASIEST)이 아니라 번역된 난이도 이름. */
const DiffBadge = styled.div<{ $win: WinColor; $color: string }>`
  ${p => winThin(p.$win)}
  ${pixelBold}
  display: inline-flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${p => p.$color};
`;

const CardBottom = styled.div`
  position: relative; z-index: 2; padding: ${SP.md};
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;

const CardTitle = styled.h3`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.text};
  margin: 0 0 ${SP.xs};
  ${media.mobile}   { font-size: ${FONT.sm}; }
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const CardDesc = styled.p`
  font-size: ${FONT.sm}; color: ${C.textSub};
  margin: 0 0 ${SP.sm};
  word-break: keep-all;
  ${lMedia.phoneSm} { display: none; }
`;

/** hover 안내 — 글로우 대신 ▶ 커서. */
const SelectHint = styled.div<{ $active: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold};
  opacity: ${p => (p.$active ? 1 : 0)};
  ${lMedia.phoneSm} { display: none; }
`;

const Empty = styled.div`
  ${pixelBold}
  text-align: center; padding: ${SP.xxl} ${SP.lg};
  font-size: ${FONT.sm}; color: ${C.textDim};
`;
