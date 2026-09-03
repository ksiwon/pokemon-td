// src/components/modals/WaveEndPicker.tsx
// ✅ 거다이맥스 버그 수정: evolutionItem = 'max-mushroom' → evolutionItem = item.id

import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { ModalOverlay, MODAL_ACCENT, ModalPlainBox, ModalPlainHeader } from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { media, lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { Item } from '../../types/game';
import { multiplayerService } from '../../services/MultiplayerService';
import { showToast } from '../shared/Toast';
import { C, FONT, SP } from '../../styles/tokens';
import { win, btn, pixelBold, cursorMark, cursorOn, shadowLg, focusRing } from '../../styles/pixel';

// 싱글플레이에서만 isPaused:false 해제 (멀티플레이는 BattlePhaseUI가 관리)
function resumeSingleOnly() {
  if (!multiplayerService.getCurrentRoomId()) {
    useGameStore.setState({ isPaused: false });
  }
}

export const WaveEndPicker: React.FC = () => {
  const { t } = useTranslation();
  const { waveEndItemPick, setWaveEndItemPick, useRewardItem, towers, wave } = useGameStore(state => ({
    waveEndItemPick: state.waveEndItemPick,
    setWaveEndItemPick: state.setWaveEndItemPick,
    useRewardItem: state.useRewardItem,
    towers: state.towers,
    wave: state.wave,
  }));
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  if (!waveEndItemPick) return null;

  const handleSelect = (item: Item) => {
    if ((item.type === 'mega-stone' || item.type === 'max-mushroom') && item.targetPokemonId) {
      const targetTower = towers.find(t => t.pokemonId === item.targetPokemonId);
      if (!targetTower) {
        // [A4] 대상 포켓몬 없으면 UI 피드백 후 정리
        console.warn(`[WaveEndPicker] targetPokemonId ${item.targetPokemonId} not found in towers`);
        showToast(t('waveEnd.evolveTargetNotFound'));
        setWaveEndItemPick(null);
        resumeSingleOnly();
        return;
      }
      // ✅ 수정: 메가스톤과 거다이맥스 모두 item.id를 그대로 전달
      const evolutionItem = item.id;
      useGameStore.getState().evolvePokemon(targetTower.id, evolutionItem);
      setWaveEndItemPick(null);
      resumeSingleOnly();
      return;
    }

    setSelectedItem(item);
  };


  const handleTargetSelect = (towerId: string) => {
    if (!selectedItem) return;

    if (selectedItem.type === 'candy') {
      useRewardItem('candy', towerId);
    } else if (selectedItem.type === 'heal') {
      const tower = towers.find(t => t.id === towerId);
      if (tower && !tower.isFainted) {
        const newHp = Math.min(tower.maxHp, tower.currentHp + (selectedItem.value || 200));
        useGameStore.getState().updateTower(tower.id, { currentHp: newHp });
      }
    } else if (selectedItem.type === 'revive') {
      useRewardItem('revive', towerId);
    }

    setSelectedItem(null);
    setWaveEndItemPick(null);
    resumeSingleOnly();
  };

  const handleCancelTarget = () => setSelectedItem(null);

  const handleSkip = () => {
    setSelectedItem(null);
    setWaveEndItemPick(null);
    resumeSingleOnly();
  };

  // 모든 보상 아이템의 name/effect는 번역 키다. 메가스톤·다이버섯은 포켓몬 이름을
  // i18nParams로 함께 받는다(예전엔 완성된 한국어 문장을 그대로 들고 있었다).
  const getItemName = (item: Item) => t(item.name, (item as any).i18nParams);
  const getItemEffect = (item: Item) => t(item.effect, (item as any).i18nParams);

  if (selectedItem) {
    return (
      <ModalOverlay>
        <ModalPlainBox $size="xl" $accent={MODAL_ACCENT.green} $animate="slideUp" $scroll>
          <Header>
            <Title><Emoji glyph="🎯" size={16} /> {t('waveEnd.targetTitle', { name: getItemName(selectedItem) })}</Title>
          </Header>
          <Subtitle>
            {selectedItem.type === 'candy'  && t('waveEnd.targetCandy')}
            {selectedItem.type === 'heal'   && t('waveEnd.targetHeal')}
            {selectedItem.type === 'revive' && t('waveEnd.targetRevive')}
          </Subtitle>
          <TowerGrid>
            {towers.map(tower => {
              const isSelectable =
                selectedItem.type === 'revive'
                  ? tower.isFainted
                  : selectedItem.type === 'candy'
                    ? !tower.isFainted && tower.level < 100   // ✅ 레벨 100 미만만 선택 가능
                    : !tower.isFainted;
              return (
                <TowerCard
                  key={tower.id}
                  $isSelectable={isSelectable}
                  onClick={() => isSelectable && handleTargetSelect(tower.id)}
                >
                  <TowerImg src={tower.sprite} alt={tower.displayName} />
                  <TowerName>{tower.displayName}</TowerName>
                  <TowerInfo>Lv.{tower.level}</TowerInfo>
                  <TowerInfo>HP: {Math.floor(tower.currentHp)}/{tower.maxHp}</TowerInfo>
                  {tower.isFainted && <FaintedLabel>{t('manager.fainted')}</FaintedLabel>}
                </TowerCard>
              );
            })}
          </TowerGrid>
          <CancelBtn onClick={handleCancelTarget}>← {t('common.back')}</CancelBtn>
        </ModalPlainBox>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay>
      <ModalPlainBox $size="xl" $accent={MODAL_ACCENT.green} $animate="slideUp" $scroll>
        <Header>
          <Title><Emoji glyph="🎉" size={16} /> {t('waveEnd.clearTitle', { wave })}</Title>
        </Header>
        <Subtitle><Emoji glyph="✨" size={14} /> {t('waveEnd.clearSubtitle')}</Subtitle>
        <Grid>
          {waveEndItemPick.map((item, idx) => {
            const isSpecial = item.type === 'mega-stone' || item.type === 'max-mushroom';
            return (
              <Card key={idx} $isSpecial={isSpecial} onClick={() => handleSelect(item)}>
                <CardGlow />
                <ItemName $isSpecial={isSpecial}>
                  {isSpecial && <><Emoji glyph="✨" size={12} /> </>}{getItemName(item)}
                </ItemName>
                <ItemEffect>{getItemEffect(item)}</ItemEffect>
              </Card>
            );
          })}
        </Grid>
        <CancelBtn onClick={handleSkip}><Emoji glyph="❌" size={13} /> {t('waveEnd.skip')}</CancelBtn>
      </ModalPlainBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 그라디언트 텍스트 클리핑, 유리 카드, 글로우 그림자, hover 떠오름,
//           둥근 모서리, 11~12px 미만 글자.

// ── 반응형 헬퍼 (landscape 전용) ─────────────────────────────────

const Header = styled(ModalPlainHeader)`
  text-align: center;
`;

const Title = styled.h2`
  ${pixelBold}
  font-size: ${FONT.display}; margin: 0;
  color: ${C.green};
  ${shadowLg}
  ${lMedia.tablet} { font-size: ${FONT.xl}; }
  ${lMedia.phone}  { font-size: ${FONT.sm}; }
  ${media.mobile} { font-size: ${FONT.xl}; }
`;

const Subtitle = styled.p`
  font-size: ${FONT.sm}; margin: ${SP.md} 0 0;
  text-align: center; color: ${C.textSub};
  ${lMedia.phone} { margin: ${SP.sm} 0 0; }
`;

/* 좌우 여백은 창이 갖는다 — 여기서 또 주면 본문이 제목보다 안쪽으로 들어간다. */
const Grid = styled.div`
  display: flex; gap: ${SP.md}; padding: ${SP.lg} 0;
  justify-content: center; flex-wrap: wrap;
  ${lMedia.phone} { padding: ${SP.sm} 0; gap: ${SP.sm}; }
`;

/** 보상 카드 — 특별 보상만 보라 창틀. 글로우 대신 창틀 색이 등급을 진다. */
const Card = styled.div<{ $isSpecial: boolean }>`
  ${p => win(p.$isSpecial ? 'purple' : 'green')}
  flex: 1 1 200px; min-width: 180px; max-width: 220px;
  padding: ${SP.lg} ${SP.md}; cursor: pointer;
  text-align: center; position: relative; overflow: hidden;
  ${lMedia.tablet} { flex: 1 1 150px; min-width: 140px; padding: ${SP.md} ${SP.sm}; }
  ${lMedia.phone}  { flex: 1 1 120px; min-width: 110px; padding: ${SP.sm}; }
  ${media.mobile} { flex: 1 1 140px; min-width: 130px; max-width: 180px; padding: ${SP.md} ${SP.sm}; }
`;

/** 예전 방사형 글로우 레이어 — 이제 아무것도 그리지 않는다(호출부 호환용). */
const CardGlow = styled.div`
  display: none;
`;

const ItemName = styled.h3<{ $isSpecial: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm}; margin: 0 0 ${SP.sm}; position: relative; z-index: 1;
  color: ${p => (p.$isSpecial ? C.purple : C.green)};
`;

const ItemEffect = styled.p`
  font-size: ${FONT.sm}; color: ${C.textSub}; position: relative; z-index: 1;
  margin: 0; word-break: keep-all;
`;

const TowerGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${SP.md}; padding: ${SP.lg};
  ${lMedia.tablet} { gap: ${SP.sm}; padding: ${SP.md}; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  ${lMedia.phone}  { gap: ${SP.sm}; padding: ${SP.sm}; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
`;

const TowerCard = styled.div<{ $isSelectable: boolean }>`
  ${win('blue')}
  ${cursorMark}
  padding: ${SP.md};
  text-align: center;
  opacity: ${p => (p.$isSelectable ? 1 : 0.35)};
  cursor: ${p => (p.$isSelectable ? 'pointer' : 'not-allowed')};
  ${p => p.$isSelectable && css`@media (hover: hover) { &:hover { ${cursorOn} } }`}
  ${lMedia.phone} { padding: ${SP.sm}; }
`;

const TowerImg = styled.img`
  width: 80px; height: 80px; image-rendering: pixelated;
  margin-bottom: ${SP.sm};
  ${lMedia.tablet} { width: 56px; height: 56px; margin-bottom: ${SP.xs}; }
  ${lMedia.phone}  { width: 44px; height: 44px; margin-bottom: ${SP.xs}; }
`;
const TowerName = styled.h4`
  ${pixelBold}
  font-size: ${FONT.sm}; margin: ${SP.xs} 0; color: ${C.blue};
`;
const TowerInfo = styled.p`
  font-size: ${FONT.sm}; margin: 2px 0; color: ${C.textSub};
`;
const FaintedLabel = styled.p`
  ${pixelBold}
  color: ${C.red}; font-size: ${FONT.sm}; margin-top: ${SP.xs};
`;

const CancelBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  width: 100%; margin: ${SP.md} 0 ${SP.lg};
  padding: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.text};
  ${lMedia.phone} { width: 100%; margin: ${SP.sm} 0; }
  ${focusRing}
`;
