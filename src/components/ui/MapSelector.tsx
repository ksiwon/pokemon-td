// src/components/ui/MapSelector.tsx
import { useState } from "react";
import styled, { keyframes } from "styled-components";
import { media, lMedia } from "../../utils/responsive.utils";
import { useTranslation } from "../../i18n";
import { MAPS, mapThumbnail } from "../../data/maps";
import { useGameStore } from "../../store/gameStore";
import { Difficulty, MapData } from "../../types/game";
import { useNavigate } from "react-router-dom";
import { Emoji } from "../shared/Emoji";

type DifficultyFilter = "easiest" | "easy" | "medium" | "hard" | "expert";

const DIFF_META: Record<DifficultyFilter, { label: string; color: string; dot: string }> = {
  easiest: { label: "EASIEST", color: "#94a3b8", dot: "⬜" },
  easy:    { label: "EASY",    color: "#4ade80", dot: "🟢" },
  medium:  { label: "MEDIUM",  color: "#60a5fa", dot: "🔵" },
  hard:    { label: "HARD",    color: "#fb923c", dot: "🟠" },
  expert:  { label: "EXPERT",  color: "#f87171", dot: "🔴" },
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
          <HeaderEyebrow>POKEMON AEGIS</HeaderEyebrow>
          <HeaderTitle>{t('mapSelector.subtitle')}</HeaderTitle>
        </HeaderCenter>
        <HeaderRight />
      </Header>

      {/* ── Filter pills ── */}
      <FilterBar>
        <FilterPill $active={filter === null} $color="#f8fafc" onClick={() => setFilter(null)}>
          {t('mapSelector.filterAll')}
        </FilterPill>
        {(Object.keys(DIFF_META) as DifficultyFilter[]).map(d => (
          <FilterPill
            key={d}
            $active={filter === d}
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
            {shown.map((map, i) => {
              const meta = DIFF_META[map.difficulty as DifficultyFilter];
              return (
                <Card
                  key={map.id}
                  $img={mapThumbnail(map)}
                  $color={meta?.color ?? '#fff'}
                  $delay={i * 40}
                  onMouseEnter={() => setHovered(map.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleSelect(map)}
                >
                  <CardOverlay />
                  <CardHoverOverlay $active={hovered === map.id} />

                  <CardTop>
                    <DiffBadge $color={meta?.color ?? '#fff'}>
                      <Emoji glyph={meta?.dot} size={11} color={meta?.color} /> {meta?.label ?? map.difficulty.toUpperCase()}
                    </DiffBadge>
                  </CardTop>

                  <CardBottom>
                    <CardTitle>{mapName(map)}</CardTitle>
                    <CardDesc>{mapDesc(map)}</CardDesc>
                    <SelectHint $active={hovered === map.id}>
                      {t('mapSelector.clickToSelect')}
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

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp = keyframes`from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}`;

// ─── Root ─────────────────────────────────────────────────────────────────────

const Root = styled.div`
  min-height:100vh;
  background:radial-gradient(ellipse at top,#111827 0%,#070b14 60%,#000 100%);
  display:flex; flex-direction:column;
  color:#f8fafc;
`;

// ─── Header ───────────────────────────────────────────────────────────────────

const Header = styled.header`
  display:flex; align-items:center; justify-content:space-between;
  padding:0 32px; height:64px;
  background:rgba(255,255,255,0.025);
  border-bottom:1px solid rgba(255,255,255,0.07);
  backdrop-filter:blur(12px);
  flex-shrink:0;
  ${media.mobile} { padding:0 16px; height:52px; }
  ${lMedia.phoneSm} { height:44px; padding:0 12px; }
`;

const BackBtn = styled.button`
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
  border-radius:8px; color:rgba(255,255,255,0.55); padding:8px 14px;
  font-size:13px; cursor:pointer; transition:all 0.2s; white-space:nowrap;
  &:hover { background:rgba(255,255,255,0.1); color:#fff; }

  .back-text {
    ${media.mobile} { display: none; }
  }

  ${media.mobile} { padding:6px 10px; font-size:12px; }
`;

const HeaderCenter = styled.div`
  text-align:center;
  flex:1;
  min-width:0;
`;

const HeaderEyebrow = styled.div`
  font-size:10px; font-weight:700; letter-spacing:0.3em;
  color:rgba(245,158,11,0.55);
  ${media.mobile} { display:none; }
`;

const HeaderTitle = styled.h1`
  font-size:18px; font-weight:800; color:#f8fafc;
  margin:0; letter-spacing:-0.01em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  
  ${media.mobile} { font-size:14px; }
  ${lMedia.phoneSm} { font-size:12px; }
`;

const HeaderRight = styled.div`
  width:100px;
  ${media.mobile} { width:32px; }
`;

// ─── Filter bar ───────────────────────────────────────────────────────────────

const FilterBar = styled.div`
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:16px 32px;
  border-bottom:1px solid rgba(255,255,255,0.06);
  ${media.mobile} { padding:12px 16px; gap:6px; }
  ${lMedia.phoneSm} { padding:8px 12px; gap:5px; }
`;

const FilterPill = styled.button<{ $active: boolean; $color: string }>`
  padding:7px 14px; border-radius:100px; font-size:13px; font-weight:600;
  cursor:pointer; transition:all 0.2s; white-space:nowrap;
  background:${p => p.$active ? `${p.$color}18` : 'rgba(255,255,255,0.04)'};
  border:1px solid ${p => p.$active ? `${p.$color}55` : 'rgba(255,255,255,0.08)'};
  color:${p => p.$active ? p.$color : 'rgba(255,255,255,0.45)'};
  &:hover { background:${p => `${p.$color}12`}; border-color:${p=>`${p.$color}44`}; color:${p=>p.$color}; }
  ${media.mobile} { padding:5px 10px; font-size:12px; }
  ${lMedia.phoneSm} { padding:4px 8px; font-size:11px; }
`;

// ─── Grid area ────────────────────────────────────────────────────────────────

const GridArea = styled.div`
  flex:1; padding:28px 32px 40px; overflow-y:auto;
  display: flex; flex-direction: column; align-items: center;
  ${media.mobile} { padding:20px 16px 32px; }
  ${lMedia.phoneSm} { padding:12px 12px 24px; }
`;

const Grid = styled.div`
  display:grid;
  grid-template-columns:repeat(4, minmax(0, 280px));
  gap:16px;
  width: 100%;
  max-width: 1200px;
  justify-content: center;
  ${media.tablet} { grid-template-columns:repeat(2,1fr); gap:12px; max-width: 640px; }
  ${media.mobile} { grid-template-columns:1fr; gap:10px; max-width: 400px; }
  ${lMedia.tablet} { grid-template-columns:repeat(4, minmax(0,220px)); gap:12px; }
  ${lMedia.phoneSm} { grid-template-columns:repeat(2,1fr); gap:8px; max-width: 600px; }
`;

const Card = styled.div<{ $img: string; $color: string; $delay: number }>`
  position:relative; border-radius:16px; overflow:hidden;
  height:220px; cursor:pointer;
  background-image:url(${p=>p.$img});
  background-size:cover; background-position:center;
  background-color:#111827;
  border:1px solid rgba(255,255,255,0.08);
  display:flex; flex-direction:column; justify-content:space-between;
  transition:transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  animation:${fadeUp} 0.45s ease both;
  animation-delay:${p=>p.$delay}ms;

  &:hover {
    transform:translateY(-4px) scale(1.01);
    border-color:${p=>p.$color}55;
    box-shadow:0 20px 48px rgba(0,0,0,0.6), 0 0 0 1px ${p=>p.$color}22;
  }
  &:active { transform:scale(0.99); }

  ${media.mobile} { height:180px; border-radius:12px; }
  ${lMedia.phoneSm} { height:150px; border-radius:10px; }
`;

const CardOverlay = styled.div`
  position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%);
  pointer-events:none;
`;

const CardHoverOverlay = styled.div<{$active:boolean}>`
  position:absolute; inset:0;
  background:rgba(255,255,255,0.03);
  opacity:${p=>p.$active?1:0}; transition:opacity 0.2s;
  pointer-events:none;
`;

const CardTop = styled.div`
  position:relative; z-index:2; padding:14px 16px;
  ${lMedia.phoneSm} { padding:10px 12px; }
`;

const DiffBadge = styled.div<{$color:string}>`
  display:inline-flex; align-items:center; gap:5px;
  padding:4px 10px; border-radius:100px;
  background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);
  border:1px solid ${p=>p.$color}44;
  font-size:11px; font-weight:800; letter-spacing:0.1em;
  color:${p=>p.$color};
  ${lMedia.phoneSm} { font-size:10px; padding:3px 8px; }
`;

const CardBottom = styled.div`
  position:relative; z-index:2; padding:14px 16px;
  ${lMedia.phoneSm} { padding:10px 12px; }
`;

const CardTitle = styled.h3`
  font-size:20px; font-weight:800; color:#fff;
  margin:0 0 6px; text-shadow:0 2px 4px rgba(0,0,0,0.5);
  ${media.mobile} { font-size:17px; }
  ${lMedia.phoneSm} { font-size:14px; margin-bottom:3px; }
`;

const CardDesc = styled.p`
  font-size:13px; color:rgba(255,255,255,0.6);
  line-height:1.4; margin:0 0 10px;
  ${media.mobile} { font-size:12px; }
  ${lMedia.phoneSm} { font-size:11px; display:none; }
`;

const SelectHint = styled.div<{$active:boolean}>`
  font-size:12px; font-weight:700; color:#f59e0b;
  letter-spacing:0.04em;
  opacity:${p=>p.$active?1:0}; transform:${p=>p.$active?'translateX(0)':'translateX(-8px)'};
  transition:all 0.2s;
  ${lMedia.phoneSm} { display:none; }
`;

const Empty = styled.div`
  text-align:center; padding:80px 20px;
  font-size:18px; color:rgba(255,255,255,0.3); font-weight:600;
`;