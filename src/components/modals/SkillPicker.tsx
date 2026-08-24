// src/components/modals/SkillPicker.tsx

import React from 'react';
import styled from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { modalBoxCss, MODAL_ACCENT } from '../shared/modal.styles';

const TYPE_ICON_API_BASE = 'https://www.serebii.net/pokedex-bw/type/';

export const SkillPicker: React.FC = () => {
  const { t } = useTranslation();
  const { skillChoiceQueue, removeCurrentSkillChoice, updateTower } = useGameStore(state => ({
    skillChoiceQueue: state.skillChoiceQueue,
    removeCurrentSkillChoice: state.removeCurrentSkillChoice,
    updateTower: state.updateTower,
  }));

  if (!skillChoiceQueue || skillChoiceQueue.length === 0) return null;
  
  const currentChoice = skillChoiceQueue[0];
  const { towerId, newMoves } = currentChoice;
  const tower = useGameStore.getState().towers.find(t => t.id === towerId);

  if (!tower || newMoves.length === 0) {
    removeCurrentSkillChoice();
    return null;
  }

  const newMove = newMoves[0];
  const currentMove = tower.equippedMoves[0];

  // [CRASH-FIX] 장착 기술이 없으면(빈 equippedMoves) 새 기술을 자동 학습 후 종료.
  //   이전: currentMove undefined → currentMove.displayName 접근 시 TypeError(흰 화면).
  if (!currentMove) {
    updateTower(towerId, { equippedMoves: [newMove] });
    removeCurrentSkillChoice();
    return null;
  }

  // [DUP-MOVE-FIX] 최후 방어선 — 이미 장착 중인 기술이 '새 기술'로 올라오면
  //   현재/신규 칸에 같은 기술이 보이는 무의미한 선택창이 된다. 조용히 넘긴다.
  //   (근본 원인은 pokeapi.getLearnableMoves / gameStore에서 차단했다.)
  if (newMove.name === currentMove.name) {
    removeCurrentSkillChoice();
    return null;
  }

  const handleLearnNewMove = () => {
    updateTower(towerId, { equippedMoves: [newMove] });
    removeCurrentSkillChoice();
  };

  const handleKeepCurrentMove = () => {
    const tower = useGameStore.getState().towers.find(t => t.id === towerId);
    if (tower) {
      const rejectedMoves = [...(tower.rejectedMoves || []), newMove.name];
      updateTower(towerId, { rejectedMoves });
    }
    removeCurrentSkillChoice();
  };

  const getDamageClass = (dc: string) => {
    return dc === 'physical' ? t('common.physical') : t('common.special');
  };

  return (
    <Container>
      <Header>
        <Title><Emoji glyph="⭐" size={16} /> {t('skillPicker.levelUpName', { name: tower.displayName })}</Title>
        <PokemonName>{t('skillPicker.pokemonLevel', { level: tower.level })}</PokemonName>
      </Header>
      
      <Subtitle><Emoji glyph="🔄" size={14} /> {t('skillPicker.selectSkill')}</Subtitle>
      
      <SkillSection>
        <SectionLabel>{t('skillPicker.current')}</SectionLabel>
        <SkillCard $isNew={false}>
          <SkillName>
            {currentMove.displayName} | {getDamageClass(currentMove.damageClass)}
            <TypeIcon 
              src={`${TYPE_ICON_API_BASE}${currentMove.type}.gif`} 
              alt={currentMove.type} 
            />
          </SkillName>
          <SkillStats>
            <StatRow>
              <span><Emoji glyph="⚔️" size={13} /></span>
              <span>{currentMove.power}</span>
            </StatRow>
            <StatRow>
              <span><Emoji glyph="🎯" size={13} /></span>
              <span>{currentMove.accuracy}%</span>
            </StatRow>
          </SkillStats>
          {currentMove.effect.statusInflict && currentMove.effect.statusChance != null && currentMove.effect.statusChance > 0 && (
            <EffectBadge $type="status">
              <Emoji glyph="💫" size={12} /> {t('skillPicker.statusEffect', { status: t(`status.${currentMove.effect.statusInflict}`), chance: currentMove.effect.statusChance })}
            </EffectBadge>
          )}
          {currentMove.effect.drainPercent && (
            <EffectBadge $type="drain">
              <Emoji glyph="🩸" size={12} /> {t('skillPicker.drain', { percent: currentMove.effect.drainPercent * 100 })}
            </EffectBadge>
          )}
          {currentMove.isAOE && <EffectBadge $type="aoe"><Emoji glyph="🌀" size={12} /> {t('skillPicker.aoe')}</EffectBadge>}
        </SkillCard>
        <KeepBtn onClick={handleKeepCurrentMove}>
          <Emoji glyph="✅" size={13} /> {t('skillPicker.keep')}
        </KeepBtn>
      </SkillSection>

      <Arrow>⇅</Arrow>

      <SkillSection>
        <SectionLabel>{t('skillPicker.new')}</SectionLabel>
        <SkillCard $isNew={true}>
          <SkillName>
            {newMove.displayName} | {getDamageClass(newMove.damageClass)}
            <TypeIcon 
              src={`${TYPE_ICON_API_BASE}${newMove.type}.gif`} 
              alt={newMove.type} 
            />
          </SkillName>
          <SkillStats>
            <StatRow>
              <span><Emoji glyph="⚔️" size={13} /></span>
              <span>{newMove.power}</span>
            </StatRow>
            <StatRow>
              <span><Emoji glyph="🎯" size={13} /></span>
              <span>{newMove.accuracy}%</span>
            </StatRow>
          </SkillStats>
          {newMove.effect.statusInflict && newMove.effect.statusChance != null && newMove.effect.statusChance > 0 && (
            <EffectBadge $type="status">
              <Emoji glyph="💫" size={12} /> {t('skillPicker.statusEffect', { status: t(`status.${newMove.effect.statusInflict}`), chance: newMove.effect.statusChance })}
            </EffectBadge>
          )}
          {newMove.effect.drainPercent && (
            <EffectBadge $type="drain">
              <Emoji glyph="🩸" size={12} /> {t('skillPicker.drain', { percent: newMove.effect.drainPercent * 100 })}
            </EffectBadge>
          )}
          {newMove.isAOE && <EffectBadge $type="aoe"><Emoji glyph="🌀" size={12} /> {t('skillPicker.aoe')}</EffectBadge>}
        </SkillCard>
        <LearnBtn onClick={handleLearnNewMove}>
          <Emoji glyph="⭐" size={13} /> {t('skillPicker.learn')}
        </LearnBtn>
      </SkillSection>

      {skillChoiceQueue.length > 1 && (
        <QueueInfo>
          {t('skillPicker.queue', { count: skillChoiceQueue.length - 1 })}
        </QueueInfo>
      )}
    </Container>
  );
};

// ── 반응형 헬퍼 (landscape 전용) ─────────────────────────────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;

// Styled Components
const Container = styled.div`
  position: fixed;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  max-height: 80vh;
  overflow-y: auto;
  ${modalBoxCss(MODAL_ACCENT.purple)}
  border-radius: 20px;
  padding: 16px;
  backdrop-filter: blur(10px);
  z-index: 1000;
  animation: slideInLeft 0.3s ease-out;

  /* [FIX] 태블릿/폰 가로 화면: left:16px이 맵 패널과 겹침 → 중앙 정렬 */
  ${L1024} {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, 85vw);
    max-height: 82vh;
    padding: 14px;
    border-left-width: 2px;
    border-right-width: 2px;
    border-bottom-width: 2px;
    border-radius: 16px;
  }
  /* [FIX] 폰 가로 화면(작은): 더 컴팩트하게 */
  ${L768} {
    width: min(300px, 88vw);
    max-height: 78vh;
    padding: 10px;
    border-radius: 12px;
  }
  /* 세로 모바일 */
  ${media.mobile} {
    width: 88vw;
    max-width: 320px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 12px;
    max-height: 85vh;
    border-left-width: 2px;
    border-right-width: 2px;
    border-bottom-width: 2px;
  }
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h3`
  font-size: 20px;
  ${media.mobile} { font-size: 16px; }
  font-weight: bold;
  margin: 0 0 4px 0;
  color: #4fc3f7;
  text-shadow: 0 0 10px rgba(79, 195, 247, 0.5);
`;

const PokemonName = styled.div`
  font-size: 14px;
  color: #a8b8c8;
  font-weight: 600;
`;

const Subtitle = styled.div`
  font-size: 14px;
  text-align: center;
  color: #4cafff;
  margin-bottom: 12px;
  font-weight: 600;
`;

const SkillSection = styled.div`
  margin-bottom: 12px;
`;

const SectionLabel = styled.div`
  font-size: 12px;
  font-weight: bold;
  color: #4cafff;
  margin-bottom: 8px;
  text-transform: uppercase;
`;

const SkillCard = styled.div<{ $isNew: boolean }>`
  background: linear-gradient(145deg, rgba(30, 40, 60, 0.9), rgba(15, 20, 35, 0.95));
  border: 2px solid ${props => props.$isNew ? 'rgba(155, 89, 182, 0.5)' : 'rgba(52, 152, 219, 0.4)'};
  box-shadow: ${props => props.$isNew ? '0 0 15px rgba(155, 89, 182, 0.3)' : 'none'};
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
`;

const SkillName = styled.div`
  align-items: center;
  font-size: 15px;
  font-weight: bold;
  color: #4cafff;
  margin-bottom: 8px;
  text-transform: capitalize;
`;

const TypeIcon = styled.img`
  height: 14px;
  object-fit: contain;
  margin-left: 8px;
  margin-bottom: -2px;
`;

const SkillStats = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
`;

const StatRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #e8edf3;
  font-weight: 600;
`;

const EffectBadge = styled.div<{ $type: 'status' | 'drain' | 'aoe' }>`
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  margin-top: 4px;
  font-weight: 600;

  ${props => props.$type === 'status' && `
    background: rgba(155, 89, 182, 0.2);
    border: 1px solid rgba(155, 89, 182, 0.3);
  `}
  
  ${props => props.$type === 'drain' && `
    background: rgba(46, 204, 113, 0.2);
    border: 1px solid rgba(46, 204, 113, 0.3);
  `}
  
  ${props => props.$type === 'aoe' && `
    background: rgba(243, 156, 18, 0.2);
    border: 1px solid rgba(243, 156, 18, 0.3);
  `}
`;

const KeepBtn = styled.button`
  width: 100%;
  padding: 10px;
  font-size: 14px;
  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
  color: #fff;
  border: 2px solid rgba(52, 152, 219, 0.4);
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
  transition: all 0.2s ease;

  &:hover {
    background: linear-gradient(135deg, #2980b9 0%, #2471a3 100%);
  }
`;

const LearnBtn = styled.button`
  width: 100%;
  padding: 10px;
  font-size: 14px;
  background: linear-gradient(135deg, #2471a3 0%, #1a5276 100%);
  color: #fff;
  border: 2px solid rgba(79, 195, 247, 0.4);
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(79, 195, 247, 0.25);
  transition: all 0.2s ease;

  &:hover {
    background: linear-gradient(135deg, #2980b9 0%, #2471a3 100%);
  }
`;

const Arrow = styled.div`
  text-align: center;
  font-size: 24px;
  color: #4fc3f7;
  margin: 8px 0;
  text-shadow: 0 0 10px rgba(79, 195, 247, 0.5);
`;

const QueueInfo = styled.div`
  text-align: center;
  font-size: 11px;
  color: #a8b8c8;
  margin-top: 12px;
  padding: 6px;
  background: rgba(155, 89, 182, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(155, 89, 182, 0.2);
`;