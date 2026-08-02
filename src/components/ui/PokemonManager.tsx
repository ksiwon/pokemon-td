// src/components/ui/PokemonManager.tsx

import React, { useState } from 'react';
import styled from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalCloseBtn, MODAL_ACCENT,
} from '../shared/modal.styles';
import { lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { getMapById, getFacilityTiles } from '../../data/maps';
import { Gender } from '../../types/game';
import { FUSION_DATA } from '../../data/evolution';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';

// ─── 반응형 헬퍼 → lMedia 사용 ───────────────────────────────────────────────
const L1024 = lMedia.tablet;   // ≤1024px landscape (iPad 등)
const L768  = lMedia.phone;    // ≤768px  landscape
const LSm   = lMedia.phoneSm;  // landscape + max-height ≤520px

const getGenderIcon = (gender: Gender) => {
  if (gender === 'male') return '♂';
  if (gender === 'female') return '♀';
  return '⚪';
};

const getGenderColor = (gender: Gender) => {
  if (gender === 'male') return '#4A90E2';
  if (gender === 'female') return '#E91E63';
  return '#999';
};

export const PokemonManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const { towers, sellTower, fusePokemon, money, isWaveActive, setManageTowerId, currentMap } = useGameStore(state => ({
    towers: state.towers,
    sellTower: state.sellTower,
    fusePokemon: state.fusePokemon,
    money: state.money,
    isWaveActive: state.isWaveActive,
    setManageTowerId: state.setManageTowerId,
    currentMap: state.currentMap,
  }));
  const [fusionMode, setFusionMode] = useState(false);
  const [selectedBase, setSelectedBase] = useState<string | null>(null);

  const checkIsOnWork = (tower: any) => {
    const fac = getFacilityTiles(getMapById(currentMap));
    const workTiles = [...fac.shopTiles, ...fac.contestTiles];
    const tx = Math.floor(tower.position.x / 64);
    const ty = Math.floor(tower.position.y / 64);
    return workTiles.some(s => s.x === tx && s.y === ty);
  };

  const handleSell = (towerId: string, towerDisplayName: string, level: number) => {
    if (isWaveActive) { showToast(t('facility.alertSellDuringWave')); return; }
    const tower = towers.find(t => t.id === towerId);
    if (tower && checkIsOnWork(tower)) {
      showToast(t('facility.alertCannotSell'));
      return;
    }
    const sellPrice = level * 20;
    const confirmed = window.confirm(
      t('alerts.confirmSell', { name: towerDisplayName, level: level, price: sellPrice })
    );
    if (confirmed) {
      sellTower(towerId);
    }
  };

  const handleFusionClick = () => {
    setFusionMode(!fusionMode);
    setSelectedBase(null);
  };

  const handlePokemonClick = (towerId: string) => {
    if (!fusionMode) return;

    const tower = towers.find(t => t.id === towerId);
    if (!tower) return;

    if (checkIsOnWork(tower)) {
      showToast(t('facility.alertCannotFuse'));
      return;
    }

    if (!selectedBase) {
      const canBeBase = FUSION_DATA.some(f => f.base === tower.pokemonId);
      if (!canBeBase) {
        showToast(t('alerts.cannotFuseBase'));
        return;
      }
      setSelectedBase(towerId);
    } else {
      if (selectedBase === towerId) {
        showToast(t('alerts.cannotSelectSamePokemon'));
        return;
      }

      const baseTower = towers.find(t => t.id === selectedBase);
      const materialTower = tower;

      if (!baseTower) {
        setSelectedBase(null);
        return;
      }

      const fusion = FUSION_DATA.find(f =>
        f.base === baseTower.pokemonId &&
        f.material === materialTower.pokemonId &&
        f.item === 'dna-splicers'
      );

      if (!fusion) {
        showToast(t('alerts.cannotFusePokemon'));
        setSelectedBase(null);
        return;
      }

      const fusionCost = 500;

      const confirmed = window.confirm(
        t('alerts.confirmFusion', { base: baseTower.displayName, material: materialTower.displayName, cost: fusionCost })
      );

      if (confirmed) {
        // [FIX-2] spendMoney는 gameStore.fusePokemon 내부에서 처리 — 이중 차감 방지
        fusePokemon(selectedBase, towerId, 'dna-splicers').then(success => {
          if (success) {
            showToast(t('alerts.fusionSuccess'), 'success');
          } else {
            showToast(t('alerts.fusionFailed'));
          }
          setFusionMode(false);
          setSelectedBase(null);
        });
      } else {
        setSelectedBase(null);
      }
    }
  };

  const getFusionHint = (towerId: string) => {
    const tower = towers.find(t => t.id === towerId);
    if (!tower) return null;

    const asBase = FUSION_DATA.filter(f => f.base === tower.pokemonId);
    if (asBase.length > 0) {
      const materialIds = asBase.map(f => f.material);
      const availableMaterials = towers.filter(t => materialIds.includes(t.pokemonId));
      if (availableMaterials.length > 0) return '🧬';
    }

    const asMaterial = FUSION_DATA.filter(f => f.material === tower.pokemonId);
    if (asMaterial.length > 0) {
      const baseIds = asMaterial.map(f => f.base);
      const availableBases = towers.filter(t => baseIds.includes(t.pokemonId));
      if (availableBases.length > 0) return '🧬';
    }

    return null;
  };

  return (
    <ModalOverlay>
      <ModalBox $size="lg" $accent={MODAL_ACCENT.blue} $scroll>
        <InnerPad>
        <Header>
          <div>
            <Title>{t('manager.title', { towers: towers.length })}</Title>
            <MoneyDisplay><Emoji glyph="💰" size={14} /> {money}{t('common.money')}</MoneyDisplay>
          </div>
          <HeaderButtons>
            <FusionBtn
              onClick={handleFusionClick}
              $fusionMode={fusionMode}
            >
              {fusionMode
                ? <><Emoji glyph="❌" size={13} /> {t('common.cancel')}</>
                : <><Emoji glyph="🧬" size={13} /> {t('manager.fusion')}</>}
            </FusionBtn>
            <ModalCloseBtn onClick={onClose}><Emoji glyph="❌" size={14} /></ModalCloseBtn>
          </HeaderButtons>
        </Header>

        {fusionMode && (
          <FusionInfo>
            {!selectedBase ? (
              <p>{t('manager.fusionInfoBase', { cost: 500 })}</p>
            ) : (
              <p>{t('manager.fusionInfoMaterial', { cost: 500 })}</p>
            )}
          </FusionInfo>
        )}

        {towers.length === 0 ? (
          <EmptyMessage>{t('manager.empty')}</EmptyMessage>
        ) : (
          <Grid>
            {towers.map(tower => {
              const sellPrice = tower.level * 20;
              const hpPercent = Math.round((tower.currentHp / tower.maxHp) * 100);
              const fusionHint = getFusionHint(tower.id);
              const isSelected = selectedBase === tower.id;

              return (
                <Card
                  key={tower.id}
                  $isSelected={isSelected}
                  $fusionMode={fusionMode}
                  onClick={() => handlePokemonClick(tower.id)}
                >
                  <CardHeader>
                    <Sprite src={tower.sprite} alt={tower.displayName} />
                    {tower.isFainted && (
                      <FaintedBadge>{t('manager.fainted')}</FaintedBadge>
                    )}
                    {checkIsOnWork(tower) && (
                      <WorkBadge><Emoji glyph="🏪" size={11} /> {t('facility.working')}</WorkBadge>
                    )}
                    {fusionHint && fusionMode && (
                      <FusionBadge><Emoji glyph={fusionHint} size={14} /></FusionBadge>
                    )}
                  </CardHeader>

                  <CardBody>
                    <NameRow>
                      <PokeName>{tower.displayName}</PokeName>
                      <GenderIcon $gender={tower.gender || 'genderless'}>
                        <Emoji glyph={getGenderIcon(tower.gender || 'genderless')} size={13} />
                      </GenderIcon>
                    </NameRow>
                    <InfoRow>
                      <span>{t('common.level')}</span>
                      <InfoValue>{tower.level}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <span>{t('picker.hp')}</span>
                      <InfoValue>
                        {Math.floor(tower.currentHp)}/{tower.maxHp} ({hpPercent}%)
                      </InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <span>{t('manager.kills')}</span>
                      <InfoValue>{tower.kills}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <span>{t('picker.move')}</span>
                      <InfoValue>{tower.equippedMoves[0]?.displayName || 'N/A'}</InfoValue>
                    </InfoRow>
                  </CardBody>

                  {!fusionMode && (
                    <ActionButtons>
                      <ManageItemsBtn
                        disabled={isWaveActive || checkIsOnWork(tower)}
                        title={isWaveActive ? t('facility.mItemsDisabledWave') : checkIsOnWork(tower) ? t('facility.mItemsDisabledWork') : undefined}
                        onClick={() => { if (!checkIsOnWork(tower)) { setManageTowerId(tower.id); onClose(); } }}
                        style={checkIsOnWork(tower) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <Emoji glyph="🎒" size={13} /> {t('facility.manageItems')}
                      </ManageItemsBtn>
                      <SellBtn
                        disabled={checkIsOnWork(tower)}
                        onClick={() => !checkIsOnWork(tower) && handleSell(tower.id, tower.displayName, tower.level)}
                        style={checkIsOnWork(tower) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <Emoji glyph="💰" size={13} /> {t('manager.sell', { price: sellPrice })}
                      </SellBtn>
                    </ActionButtons>
                  )}
                </Card>
              );
            })}
          </Grid>
        )}
        </InnerPad>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────



const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  ${L1024} { margin-bottom: 14px; }
  ${L768}  { flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  ${LSm}   { flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
`;

const Title = styled.h2`
  font-size: 28px;
  font-weight: bold;
  color: #e8edf3;
  margin-bottom: 5px;

  ${L1024} { font-size: 22px; }
  ${L768}  { font-size: 18px; margin-bottom: 3px; }
  ${LSm}   { font-size: 16px; }
`;

const MoneyDisplay = styled.div`
  font-size: 16px;
  color: #FFD700;
  font-weight: bold;

  ${L1024} { font-size: 14px; }
  ${L768}  { font-size: 13px; }
  ${LSm}   { font-size: 12px; }
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: 10px;

  ${L1024} { gap: 8px; }
  ${LSm}   { gap: 6px; }
`;

const FusionBtn = styled.button<{ $fusionMode: boolean }>`
  font-size: 16px;
  font-weight: bold;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: filter 0.2s;
  background: ${props => props.$fusionMode ? '#c0392b' : 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)'};

  @media (hover: hover) { &:hover { filter: brightness(1.2); } }

  ${L1024} { font-size: 14px; padding: 7px 13px; }
  ${L768}  { font-size: 13px; padding: 6px 10px; }
  ${LSm}   { font-size: 12px; padding: 5px 9px; }
`;


const FusionInfo = styled.div`
  background: rgba(102, 126, 234, 0.2);
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 20px;
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  color: #fff;

  ${L1024} { padding: 10px; margin-bottom: 14px; font-size: 14px; }
  ${L768}  { padding: 8px;  margin-bottom: 10px; font-size: 13px; border-radius: 8px; }
  ${LSm}   { padding: 7px;  margin-bottom: 8px;  font-size: 12px; }
`;

const EmptyMessage = styled.p`
  font-size: 18px;
  color: #999;
  text-align: center;
  padding: 40px;

  ${L1024} { font-size: 16px; padding: 28px; }
  ${L768}  { font-size: 14px; padding: 20px; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;

  /* 태블릿 가로 — 카드 약간 좁게 */
  ${L1024} {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  /* 폰 가로 — 2열 고정 */
  ${L768} {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  /* 소형 폰 가로 — 1열 */
  ${LSm} {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const Card = styled.div<{ $isSelected: boolean, $fusionMode: boolean }>`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  padding: 15px;
  border: 2px solid ${props => props.$isSelected ? '#667eea' : 'rgba(255, 255, 255, 0.1)'};
  transition: border-color 0.2s ease, transform 0.2s ease;
  cursor: ${props => props.$fusionMode ? 'pointer' : 'default'};
  transform: ${props => props.$isSelected ? 'scale(1.02)' : 'scale(1)'};

  ${L1024} { padding: 12px; border-radius: 12px; }
  ${L768}  { padding: 10px; border-radius: 10px; }
  ${LSm}   { padding: 8px;  border-radius: 8px; }
`;

const CardHeader = styled.div`
  position: relative;
  text-align: center;
  margin-bottom: 15px;

  ${L1024} { margin-bottom: 10px; }
  ${L768}  { margin-bottom: 8px; }
  ${LSm}   { margin-bottom: 6px; }
`;

const Sprite = styled.img`
  width: 100px;
  height: 100px;
  image-rendering: pixelated;

  ${L1024} { width: 80px;  height: 80px; }
  ${L768}  { width: 64px;  height: 64px; }
  ${LSm}   { width: 56px;  height: 56px; }
`;

const FaintedBadge = styled.div`
  position: absolute;
  top: 5px; right: 5px;
  background: #e74c3c;
  color: white;
  font-size: 12px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 8px;

  ${L768} { font-size: 10px; padding: 3px 6px; }
  ${LSm}  { font-size: 9px;  padding: 2px 5px; }
`;

const WorkBadge = styled.div`
  position: absolute;
  top: 5px; left: 5px;
  background: #f39c12;
  color: white;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 8px;

  ${L768} { font-size: 9px; padding: 3px 6px; }
  ${LSm}  { font-size: 8px;  padding: 2px 5px; }
`;

const FusionBadge = styled.div`
  position: absolute;
  top: 5px; left: 5px;
  font-size: 24px;

  ${L768} { font-size: 18px; }
  ${LSm}  { font-size: 16px; }
`;

const CardBody = styled.div`
  margin-bottom: 15px;

  ${L768} { margin-bottom: 10px; }
  ${LSm}  { margin-bottom: 8px; }
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;

  ${L1024} { margin-bottom: 8px; }
  ${L768}  { gap: 6px; margin-bottom: 6px; }
`;

const PokeName = styled.h3`
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  color: #fff;

  ${L1024} { font-size: 17px; }
  ${L768}  { font-size: 15px; }
  ${LSm}   { font-size: 14px; }
`;

const GenderIcon = styled.span<{ $gender: Gender }>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => getGenderColor(props.$gender)};

  ${L768} { font-size: 15px; }
  ${LSm}  { font-size: 13px; }
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  color: #ddd;

  ${L1024} { font-size: 13px; padding: 6px 0; }
  ${L768}  { font-size: 12px; padding: 5px 0; }
  ${LSm}   { font-size: 11px; padding: 4px 0; }
`;

const InfoValue = styled.span`
  font-weight: bold;
  color: #FFD700;
`;

const ActionButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  width: 100%;
`;

const ManageItemsBtn = styled.button`
  width: 100%;
  padding: 12px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) { background: linear-gradient(135deg, #2980b9, #2471a3); }
  }

  &:disabled { opacity: 0.4; cursor: not-allowed; }

  ${L1024} { padding: 10px; font-size: 14px; border-radius: 10px; }
  ${L768}  { padding: 8px;  font-size: 13px; border-radius: 8px; }
  ${LSm}   { padding: 7px;  font-size: 12px; }
`;

const SellBtn = styled.button`
  width: 100%;
  padding: 12px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease;

  @media (hover: hover) {
    &:hover { background: linear-gradient(135deg, #c0392b, #a93226); }
  }

  ${L1024} { padding: 10px; font-size: 14px; border-radius: 10px; }
  ${L768}  { padding: 8px;  font-size: 13px; border-radius: 8px; }
  ${LSm}   { padding: 7px;  font-size: 12px; }
`;

const InnerPad = styled.div`
  padding: 24px;
  ${L1024} { padding: 18px; }
  ${L768}  { padding: 14px; }
  ${LSm}   { padding: 12px; }
`;