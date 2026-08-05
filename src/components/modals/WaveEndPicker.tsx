// src/components/modals/WaveEndPicker.tsx
// ✅ 거다이맥스 버그 수정: evolutionItem = 'max-mushroom' → evolutionItem = item.id

import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { ModalOverlay, ModalBox, MODAL_ACCENT } from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';
import { media, lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { Item } from '../../types/game';
import { multiplayerService } from '../../services/MultiplayerService';
import { showToast } from '../shared/Toast';

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
        <ModalBox $size="xl" $accent={MODAL_ACCENT.green} $animate="slideUp" $scroll>
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
        </ModalBox>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay>
      <ModalBox $size="xl" $accent={MODAL_ACCENT.green} $animate="slideUp" $scroll>
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
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────

// ── 반응형 헬퍼 (landscape 전용) ─────────────────────────────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;



const Header = styled.div`
  padding: 32px;
  ${L1024} { padding: 16px 20px; }
  ${L768}  { padding: 10px 14px; }
  ${media.mobile} { padding: 16px; }
  border-bottom: 1px solid rgba(255,255,255,0.07);
  text-align: center;
`;

const Title = styled.h2`
  font-size: 36px; font-weight: 900; margin: 0;
  ${L1024} { font-size: 26px; }
  ${L768}  { font-size: 20px; }
  ${media.mobile} { font-size: 24px; }
  background: linear-gradient(135deg,#2ecc71,#a8ffb8);
  background-clip: text; -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  font-size: 18px; margin: 24px 32px;
  ${L1024} { font-size: 14px; margin: 10px 16px; }
  ${L768}  { font-size: 12px; margin: 6px 12px; }
  ${media.mobile} { font-size: 14px; margin: 12px 16px; }
  text-align: center; color: #a8b8c8; font-weight: 600;
`;

const Grid = styled.div`
  display: flex; gap: 20px; padding: 0 32px 32px;
  justify-content: center; flex-wrap: wrap;
  ${L1024} { padding: 0 16px 16px; gap: 12px; }
  ${L768}  { padding: 0 10px 10px; gap: 8px; }
  ${media.mobile} { padding: 0 12px 16px; gap: 10px; }
`;

const Card = styled.div<{ $isSpecial: boolean }>`
  flex: 1 1 200px; min-width: 180px; max-width: 220px;
  background: linear-gradient(145deg,rgba(30,40,60,0.9),rgba(15,20,35,0.95));
  border: 2px solid ${p => p.$isSpecial ? '#e040fb' : 'rgba(46,204,113,0.4)'};
  border-radius: 20px; padding: 28px 20px; cursor: pointer;
  transition: transform 0.3s; text-align: center; position: relative; overflow: hidden;
  box-shadow: ${p => p.$isSpecial ? '0 0 30px rgba(224,64,251,0.8)' : '0 8px 32px rgba(0,0,0,0.4)'};
  @media (hover: hover) { &:hover { transform: translateY(-4px); } }
  ${L1024} { flex: 1 1 150px; min-width: 140px; padding: 18px 12px; border-radius: 14px; }
  ${L768}  { flex: 1 1 120px; min-width: 110px; padding: 12px 8px;  border-radius: 10px; }
  ${media.mobile} {
    flex: 1 1 140px; min-width: 130px; max-width: 180px;
    padding: 16px 10px; border-radius: 14px;
  }
`;

const CardGlow = styled.div`
  position: absolute; top:-50%; left:-50%; width:200%; height:200%;
  background: radial-gradient(circle,rgba(46,204,113,0.1) 0%,transparent 70%);
  pointer-events: none;
`;

const ItemName = styled.h3<{ $isSpecial: boolean }>`
  font-size: 22px; font-weight: 700; margin-bottom: 12px; position: relative; z-index:1;
  color: ${p => p.$isSpecial ? '#e040fb' : '#2ecc71'};
  text-shadow: ${p => p.$isSpecial ? '0 0 20px rgba(224,64,251,0.8)' : '0 0 15px rgba(46,204,113,0.6)'};
  ${L1024} { font-size: 16px; margin-bottom: 8px; }
  ${L768}  { font-size: 13px; margin-bottom: 5px; }
  ${media.mobile} { font-size: 16px; margin-bottom: 8px; }
`;

const ItemEffect = styled.p`
  font-size: 14px; color: #a8b8c8; line-height: 1.6; position: relative; z-index:1;
  ${L768}  { font-size: 11px; line-height: 1.3; }
  ${media.mobile} { font-size: 12px; line-height: 1.4; }
`;

const TowerGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill,minmax(160px,1fr));
  gap: 20px; padding: 24px 32px;
  ${L1024} { gap: 12px; padding: 14px 16px; grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); }
  ${L768}  { gap: 8px;  padding: 10px 12px; grid-template-columns: repeat(auto-fill,minmax(100px,1fr)); }
`;

const TowerCard = styled.div<{ $isSelectable: boolean }>`
  background: linear-gradient(145deg,rgba(30,40,60,0.9),rgba(15,20,35,0.95));
  border: 2px solid rgba(52,152,219,0.4); border-radius: 16px; padding: 20px;
  text-align: center; transition: all 0.3s;
  opacity: ${p => p.$isSelectable ? 1 : 0.3};
  cursor: ${p => p.$isSelectable ? 'pointer' : 'not-allowed'};
  ${p => p.$isSelectable && css`&:hover { transform:translateY(-2px); border-color:#4cafff; }`}
  ${L1024} { padding: 12px; border-radius: 10px; }
  ${L768}  { padding: 8px;  border-radius: 8px; }
`;

const TowerImg = styled.img`
  width:80px; height:80px; image-rendering:pixelated;
  margin-bottom:12px; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.6));
  ${L1024} { width: 56px; height: 56px; margin-bottom: 6px; }
  ${L768}  { width: 44px; height: 44px; margin-bottom: 4px; }
`;
const TowerName = styled.h4`
  font-size:16px;font-weight:700;margin:8px 0;color:#4cafff;
  ${L768} { font-size: 12px; margin: 4px 0; }
`;
const TowerInfo = styled.p`
  font-size:14px;margin:4px 0;color:#a8b8c8;
  ${L768} { font-size: 11px; margin: 2px 0; }
`;
const FaintedLabel = styled.p`
  color:#e74c3c;font-weight:bold;font-size:14px;margin-top:8px;
  ${L768} { font-size: 11px; margin-top: 4px; }
`;

const CancelBtn = styled.button`
  width:calc(100% - 64px); margin:24px 32px 32px;
  padding:16px; font-size:18px; font-weight:bold;
  background:linear-gradient(135deg,#95a5a6,#7f8c8d);
  color:#fff; border:2px solid rgba(149,165,166,0.4);
  border-radius:14px; cursor:pointer;
  ${L1024} { width: calc(100% - 32px); margin: 12px 16px 16px; padding: 12px; font-size: 15px; }
  ${L768}  { width: calc(100% - 20px); margin: 8px 10px 10px;  padding: 9px;  font-size: 13px; border-radius: 10px; }
  &:hover { background:linear-gradient(135deg,#7f8c8d,#6d7b7c); }
`;