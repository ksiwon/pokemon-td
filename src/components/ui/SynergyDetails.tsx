// src/components/ui/SynergyDetails.tsx
import React from 'react';
import styled from 'styled-components';
import { lMedia } from '../../utils/responsive.utils';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { win, sunken, pixelText, pixelBold } from '../../styles/pixel';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { getGenerationById, SPECIAL_SYNERGY_DEFS, getSpecialSynergyName } from '../../utils/synergyManager';
import { Emoji } from '../shared/Emoji';
import { GamePokemon } from '../../types/game';

export const SynergyDetails: React.FC = () => {
  const { t } = useTranslation();
  const { hoveredSynergy, towers } = useGameStore(state => ({
    hoveredSynergy: state.hoveredSynergy,
    towers: state.towers,
  }));

  if (!hoveredSynergy) return null;

  const [type, value] = hoveredSynergy.id.split(':');

  let synergyName: React.ReactNode = '';
  const activeTowers = towers.filter(t => !t.isFainted);
  let matchingPokemon: GamePokemon[] = [];

  if (type === 'type') {
    synergyName = t(`types.${value}`);
    matchingPokemon = activeTowers.filter(t => t.types.includes(value));
  } else if (type === 'gen') {
    synergyName = t('synergy.genName', { gen: value });
    matchingPokemon = activeTowers.filter(t => getGenerationById(t.pokemonId) === Number(value));
  } else if (type === 'special') {
    const def = SPECIAL_SYNERGY_DEFS.find(d => d.id === hoveredSynergy.id);
    synergyName = def
      ? <><Emoji glyph={def.icon} size={14} /> {getSpecialSynergyName(def.id, t, def.name)}</>
      : hoveredSynergy.name;
    const idSet = new Set(def?.pokemonIds ?? []);
    matchingPokemon = activeTowers.filter(t => idSet.has(t.pokemonId));
  }

  return (
    <Container>
      <Title>{synergyName} ({hoveredSynergy.count})</Title>
      <List>
        {matchingPokemon.length > 0 ? (
          matchingPokemon.map(pokemon => (
            <PokemonItem key={pokemon.id}>
              <Sprite src={pokemon.sprite} alt={pokemon.displayName} />
              <Name>{pokemon.displayName} ({t('common.levelShort')}.{pokemon.level})</Name>
            </PokemonItem>
          ))
        ) : (
          <Empty>{t('synergy.empty')}</Empty>
        )}
      </List>
    </Container>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────

// GameLayout LeftPanel 패널 너비와 동기화:
//   Desktop  (>1024px landscape) : LeftPanel = 210px  →  left: 224px (210 + 14)
//   L1024    (≤1024px landscape) : LeftPanel = 172px  →  left: 186px (172 + 14)
//   L768     (≤768px  landscape) : LeftPanel = 128px  →  left: 142px (128 + 14)
//   phoneSm  (landscape h≤520px) : LeftPanel = 128px  →  left: 136px (축소 패딩)

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, backdrop-filter, 둥근 모서리, 번지는 그림자, 10~11px 글자.
//
// 좌측 패널(216/180/152px) 바로 옆에 떠야 하므로 left 값은 패널 폭을 따라간다.

const Container = styled.div`
  ${win('blue')}
  ${pixelText}
  position: fixed;
  left: 224px;
  top: 10px;
  width: 220px;
  max-height: 40vh;
  overflow-y: auto;
  color: ${C.text};
  z-index: 2999;

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  ${lMedia.tablet}  { left: 188px; width: 200px; }
  ${lMedia.phone}   { left: 160px; width: calc(100vw - 168px); max-width: 190px; max-height: 38vh; }
  ${lMedia.phoneSm} { left: 160px; top: 4px; width: calc(100vw - 168px); max-width: 180px; max-height: 36vh; }
`;

const Title = styled.h4`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.blue};
  text-align: center;
  margin: 0 0 ${SP.sm};
  padding-bottom: ${SP.xs};
  border-bottom: ${SCALE}px solid ${C.ink};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.xs};
`;

const PokemonItem = styled.div`
  ${sunken()}
  display: flex;
  align-items: center;
  gap: ${SP.xs};
`;

const Sprite = styled.img`
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  flex-shrink: 0;

  ${lMedia.phone}   { width: 24px; height: 24px; }
  ${lMedia.phoneSm} { width: 24px; height: 24px; }
`;

const Name = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Empty = styled.p`
  font-size: ${FONT.sm};
  color: ${C.textSub};
  text-align: center;
  padding: ${SP.sm} 0;
  margin: 0;
`;
