// src/components/ui/PokemonManager.tsx

import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalCloseBtn, MODAL_ACCENT,
} from '../shared/modal.styles';
import { lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, ICON } from '../../styles/tokens';
import { win, winThin, btn, btnThin, pixelBold, shadowLg } from '../../styles/pixel';
import { useGameStore } from '../../store/gameStore';
import { isWorkLocked } from '../../utils/facility.utils';
import { Gender } from '../../types/game';
import { FUSION_DATA } from '../../data/evolution';
import { Emoji } from '../shared/Emoji';
import { showToast } from '../shared/Toast';

// ─── 반응형 헬퍼 → lMedia 사용 ───────────────────────────────────────────────
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

  // 근무 중 잠금 — 최고 등급(15웨이브)을 채웠으면 판매·합체 모두 풀린다.
  const checkIsOnWork = (tower: any) => isWorkLocked(tower, currentMap);

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
            <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
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



// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, 그라디언트 버튼, 알약 배지, hover 확대, 둥근 모서리.

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${SP.md};
  margin-bottom: ${SP.lg};

  ${lMedia.phone} { flex-wrap: wrap; gap: ${SP.sm}; margin-bottom: ${SP.sm}; }
  ${LSm}  { flex-wrap: wrap; gap: ${SP.sm}; margin-bottom: ${SP.sm}; }
`;

const Title = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl};
  color: ${C.text};
  margin: 0;
  ${shadowLg}

  ${lMedia.phone} { font-size: ${FONT.sm}; }
  ${LSm}  { font-size: ${FONT.sm}; }
`;

const MoneyDisplay = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: ${SP.sm};
`;

const FusionBtn = styled.button<{ $fusionMode: boolean }>`
  ${p => btnThin(p.$fusionMode ? 'red' : 'blue')}
  ${pixelBold}
  font-size: ${FONT.sm};
  padding: ${SP.xs} ${SP.md};
  color: ${p => (p.$fusionMode ? C.red : C.blue)};
  &:focus, &:focus-visible { outline: none; }
`;

const FusionInfo = styled.div`
  ${winThin('purple')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.md};
  margin-bottom: ${SP.md};
  text-align: center;
  font-size: ${FONT.sm};
  color: ${C.purple};
`;

const EmptyMessage = styled.p`
  font-size: ${FONT.sm};
  color: ${C.textDim};
  text-align: center;
  padding: ${SP.xxl};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${SP.md};

  ${lMedia.tablet} { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: ${SP.sm}; }
  ${lMedia.phone}  { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: ${SP.sm}; }
  ${LSm}   { grid-template-columns: 1fr; gap: ${SP.sm}; }
`;

/** 포켓몬 카드 — 합체 모드에서 고른 카드만 보라 창틀. 확대 대신 창틀 색이 진다. */
const Card = styled.div<{ $isSelected: boolean; $fusionMode: boolean }>`
  ${p => win(p.$isSelected ? 'purple' : 'plain')}
  padding: ${SP.md};
  cursor: ${props => (props.$fusionMode ? 'pointer' : 'default')};
  display: flex;
  flex-direction: column;

  ${lMedia.phone} { padding: ${SP.sm}; }
  ${LSm}  { padding: ${SP.sm}; }
`;

const CardHeader = styled.div`
  position: relative;
  text-align: center;
  margin-bottom: ${SP.md};

  ${lMedia.phone} { margin-bottom: ${SP.sm}; }
  ${LSm}  { margin-bottom: ${SP.sm}; }
`;

const Sprite = styled.img`
  width: 100px;
  height: 100px;
  image-rendering: pixelated;

  ${lMedia.tablet} { width: 80px; height: 80px; }
  ${lMedia.phone}  { width: 64px; height: 64px; }
  ${LSm}   { width: 56px; height: 56px; }
`;

const badgeBase = css`
  ${pixelBold}
  position: absolute;
  top: 0;
  border: 2px solid ${C.ink};
  color: ${C.text};
  font-size: ${FONT.sm};
  line-height: 1.3;
  padding: 0 ${SP.xs};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

const FaintedBadge = styled.div`
  ${badgeBase}
  right: 0;
  background: ${C.red};
`;

const WorkBadge = styled.div`
  ${badgeBase}
  left: 0;
  background: ${C.gold};
  color: ${C.ink};
  text-shadow: none;
`;

const FusionBadge = styled.div`
  position: absolute;
  top: 0; left: 0;
  font-size: ${ICON.xl}px;
  line-height: 1;
`;

const CardBody = styled.div`
  margin-bottom: ${SP.md};

  ${lMedia.phone} { margin-bottom: ${SP.sm}; }
  ${LSm}  { margin-bottom: ${SP.sm}; }
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${SP.sm};
  margin-bottom: ${SP.sm};
`;

const PokeName = styled.h3`
  ${pixelBold}
  font-size: ${FONT.sm};
  margin: 0;
  color: ${C.text};
`;

const GenderIcon = styled.span<{ $gender: Gender }>`
  font-size: ${FONT.sm};
  color: ${props => getGenderColor(props.$gender)};
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${SP.sm};
  padding: ${SP.xs} 0;
  border-bottom: 2px solid ${C.ink};
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const InfoValue = styled.span`
  ${pixelBold}
  color: ${C.gold};
`;

const ActionButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.sm};
  margin-top: auto;
  width: 100%;
`;

const ManageItemsBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }
`;

const SellBtn = styled.button`
  ${btn('red')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }
`;

const InnerPad = styled.div`
  padding: ${SP.lg};
  ${lMedia.phone} { padding: ${SP.md}; }
  ${LSm}  { padding: ${SP.sm}; }
`;
