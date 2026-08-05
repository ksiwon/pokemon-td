// src/components/ui/SynergyDetails.tsx
import React from 'react';
import styled from 'styled-components';
import { lMedia } from '../../utils/responsive.utils';
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

const Container = styled.div`
  position: fixed;
  left: 224px;
  top: 10px;
  width: 200px;
  max-height: 40vh;
  overflow-y: auto;
  background: linear-gradient(160deg, #0d1117 0%, #080c14 100%);
  border: 1px solid rgba(255,255,255,0.12);
  border-top: 2px solid rgba(79,195,247,0.6);
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.7);
  backdrop-filter: blur(10px);
  z-index: 2999;
  animation: fadeIn 0.15s ease-out;

  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

  ${lMedia.tablet} {
    left: 186px;
    width: 180px;
    padding: 8px 10px;
    border-radius: 12px;
  }

  ${lMedia.phone} {
    left: 142px;
    width: calc(100vw - 148px);
    max-width: 170px;
    max-height: 38vh;
    padding: 7px 9px;
    border-radius: 10px;
  }

  ${lMedia.phoneSm} {
    left: 136px;
    top: 4px;
    width: calc(100vw - 142px);
    max-width: 160px;
    max-height: 36vh;
    padding: 6px 8px;
    border-radius: 8px;
  }
`;

const Title = styled.h4`
  font-size: 13px;
  font-weight: 700;
  color: #4fc3f7;
  text-align: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(79,195,247,0.2);

  ${lMedia.tablet} { font-size: 12px; margin-bottom: 6px; padding-bottom: 4px; }
  ${lMedia.phone}  { font-size: 12px; margin-bottom: 5px; padding-bottom: 4px; }
  ${lMedia.phoneSm}{ font-size: 11px; margin-bottom: 4px; padding-bottom: 3px; }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;

  ${lMedia.phone}  { gap: 4px; }
  ${lMedia.phoneSm}{ gap: 3px; }
`;

const PokemonItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.04);
  padding: 3px 6px;
  border-radius: 6px;

  ${lMedia.phone}  { padding: 2px 5px; gap: 5px; }
  ${lMedia.phoneSm}{ padding: 2px 4px; gap: 4px; }
`;

const Sprite = styled.img`
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  flex-shrink: 0;

  ${lMedia.tablet} { width: 28px; height: 28px; }
  ${lMedia.phone}  { width: 24px; height: 24px; }
  ${lMedia.phoneSm}{ width: 22px; height: 22px; }
`;

const Name = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: #e8edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${lMedia.tablet} { font-size: 11px; }
  ${lMedia.phone}  { font-size: 10px; }
  ${lMedia.phoneSm}{ font-size: 10px; }
`;

const Empty = styled.p`
  font-size: 13px;
  color: #a8b8c8;
  text-align: center;
  padding: 10px 0;

  ${lMedia.phone}  { font-size: 11px; padding: 6px 0; }
  ${lMedia.phoneSm}{ font-size: 10px; padding: 4px 0; }
`;