// src/components/modals/SkillPicker.tsx

import React from 'react';
import styled from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import { useTranslation } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { modalBoxCss, MODAL_ACCENT } from '../shared/modal.styles';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, btn, sunken, pixelText, pixelBold } from '../../styles/pixel';

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

// Styled Components
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: backdrop-filter, 그라디언트 버튼, 글로우 그림자, 둥근 모서리,
//           uppercase eyebrow, 11px 글자.

const Container = styled.div`
  ${modalBoxCss(MODAL_ACCENT.purple)}
  ${pixelText}
  position: fixed;
  left: ${SP.md};
  top: 50%;
  transform: translateY(-50%);
  width: 300px;
  max-height: 80vh;
  overflow-y: auto;
  color: ${C.text};
  z-index: 1000;

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  /* [FIX] 태블릿/폰 가로 화면: left:16px이 맵 패널과 겹침 → 중앙 정렬 */
  ${lMedia.tablet} {
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, 85vw);
    max-height: 82vh;
  }
  ${lMedia.phone} {
    width: min(300px, 88vw);
    max-height: 78vh;
  }
  ${media.mobile} {
    width: 88vw; max-width: 320px;
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    max-height: 85vh;
  }
`;

/**
 * 제목 띠 — 창틀 안쪽 끝까지 붙인다. 다른 창과 같은 규칙이되, 300px 고정 패널이라
 * 좌변은 큰 창의 28px이 아니라 이 창 자신의 여백(12px)을 따른다. 28px을 주면
 * 기술 이름·설명이 들어갈 폭이 244px까지 눌린다.
 */
const Header = styled.div`
  margin: -${SP.md} -${SP.md} ${SP.md};
  padding: ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  text-align: center;
`;

const Title = styled.h3`
  ${pixelBold}
  font-size: ${FONT.md};
  margin: 0 0 ${SP.xs};
  color: ${C.purple};
`;

const PokemonName = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const Subtitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  text-align: center;
  color: ${C.blue};
  margin-bottom: ${SP.md};
`;

const SkillSection = styled.div`
  margin-bottom: ${SP.md};
`;

/** uppercase eyebrow를 걷어낸 자리 — 파랑 라벨. */
const SectionLabel = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.blue};
  margin-bottom: ${SP.sm};
`;

/** 새로 배우는 기술만 보라 창틀. 글로우 대신 창틀 색이 구분을 진다. */
const SkillCard = styled.div<{ $isNew: boolean }>`
  ${p => winThin(p.$isNew ? 'purple' : 'blue')}
  padding: ${SP.sm};
  margin-bottom: ${SP.sm};
`;

const SkillName = styled.div`
  ${pixelBold}
  display: flex; align-items: center;
  font-size: ${FONT.sm};
  color: ${C.text};
  margin-bottom: ${SP.sm};
`;

const TypeIcon = styled.img`
  height: 14px;
  object-fit: contain;
  margin-left: ${SP.sm};
`;

const SkillStats = styled.div`
  display: flex;
  gap: ${SP.md};
  margin-bottom: ${SP.sm};
`;

const StatRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.xs};
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const EffectBadge = styled.div<{ $type: 'status' | 'drain' | 'aoe' }>`
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  margin-top: ${SP.xs};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${p =>
    p.$type === 'status' ? C.purple :
    p.$type === 'drain'  ? C.green  : C.gold};
`;

const KeepBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }
`;

const LearnBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.text};
  &:focus, &:focus-visible { outline: none; }
`;

/** 기존→신규 방향 표시. 웹 화살표(→) 대신 포켓몬 메뉴의 ▼. */
const Arrow = styled.div`
  ${pixelBold}
  text-align: center;
  font-size: ${FONT.sm};
  color: ${C.blue};
  margin: ${SP.sm} 0;
`;

const QueueInfo = styled.div`
  ${sunken()}
  text-align: center;
  font-size: ${FONT.sm};
  color: ${C.textSub};
  margin-top: ${SP.md};
  padding: ${SP.xs} ${SP.sm};
`;
