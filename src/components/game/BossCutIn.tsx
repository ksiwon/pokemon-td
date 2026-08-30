// src/components/game/BossCutIn.tsx
// 보스 등장 연출 (전 모드). gameStore의 enemies를 구독해 보스(isBoss) 등장을 감지.
//  - grand: 스토리 최종 보스(wave30 고정 에이스) → 웅장한 슬라이드 컷인 + 도발 대사
//  - light: 그 외 모든 보스(스토리 중간 보스 3·6·…·27 / 싱글·멀티) → 상단 작은 알림 배너
// 게임 루프를 막지 않는 비차단(pointer-events:none) 오버레이.
import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, pixelBold } from '../../styles/pixel';
import { Emoji } from '../shared/Emoji';
import { useGameStore } from '../../store/gameStore';
import { useTranslation } from '../../i18n';

interface BossCutInProps {
  chapterNumber: number | null;
  bossName?: string;
}

const officialArt = (pokemonId: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemonId}.png`;

export const BossCutIn: React.FC<BossCutInProps> = ({ chapterNumber, bossName }) => {
  const { t } = useTranslation();
  const enemies = useGameStore(s => s.enemies);
  const wave = useGameStore(s => s.wave);

  // grand: 스토리 최종 보스(wave30 고정 에이스) 웅장 컷인 / light: 그 외 모든 보스(중간 보스·싱글·멀티)
  const [tier, setTier]   = useState<'grand' | 'light' | null>(null);
  const [sprite, setSprite] = useState<string>('');
  const shownWavesRef       = useRef<Set<number>>(new Set());
  const hideTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 현재 웨이브에서 아직 안 띄웠고, 보스가 등장했으면 트리거
    if (shownWavesRef.current.has(wave)) return;
    const boss = enemies.find(e => e.isBoss);
    if (!boss) return;
    shownWavesRef.current.add(wave);

    // 최종 보스(스토리 wave30 + 고정 에이스 bossName) = grand, 그 외 모든 보스 = light
    const isGrand = chapterNumber !== null && !!bossName && wave === 30;
    setSprite(boss.pokemonId ? officialArt(boss.pokemonId) : boss.sprite);
    setTier(isGrand ? 'grand' : 'light');

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setTier(null), isGrand ? 3400 : 1900);
  }, [enemies, wave, chapterNumber, bossName]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!tier) return null;

  // ── 라이트 배너: 중간 보스 / 싱글·멀티 모든 보스 (상단 작은 알림) ──
  if (tier === 'light') {
    const label = t('boss.incoming');
    return (
      <LightRoot>
        <LightBanner>
          {sprite && <LightArt src={sprite} alt="boss" />}
          <LightText><Emoji glyph="⚠" size={14} /> {label}</LightText>
        </LightBanner>
      </LightRoot>
    );
  }

  // ── 웅장 컷인: 스토리 최종 보스 ──
  const taunt = chapterNumber && chapterNumber >= 1 && chapterNumber <= 8
    ? t(`boss.taunt.${chapterNumber}`)
    : '';
  const warnLabel = t('boss.approaching');

  return (
    <Root>
      <Band>
        <Slashes />
        <ArtWrap>
          {sprite && <Art src={sprite} alt={bossName} />}
        </ArtWrap>
        <TextCol>
          <Warn><Emoji glyph="⚠" size={16} /> {warnLabel}</Warn>
          <BossName>{bossName}</BossName>
          {taunt && <Taunt>“{taunt}”</Taunt>}
        </TextCol>
      </Band>
    </Root>
  );
};

// ── animations ──────────────────────────────────────────────────────
const bandIn = keyframes`
  0%   { transform: translateX(60%) skewX(-8deg); opacity: 0; }
  12%  { transform: translateX(0)   skewX(-8deg); opacity: 1; }
  82%  { transform: translateX(0)   skewX(-8deg); opacity: 1; }
  100% { transform: translateX(60%) skewX(-8deg); opacity: 0; }
`;
const artPop = keyframes`
  0%   { transform: scale(0.6) translateX(40px); opacity: 0; }
  18%  { transform: scale(1.08) translateX(0);   opacity: 1; }
  30%  { transform: scale(1) translateX(0); }
  100% { transform: scale(1) translateX(0); opacity: 1; }
`;
const slashSweep = keyframes`
  0%   { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(220%)  skewX(-20deg); }
`;
const textRise = keyframes`
  0%  { transform: translateY(14px); opacity: 0; }
  100%{ transform: translateY(0);    opacity: 1; }
`;

const Root = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none;
  z-index: 1400;
  overflow: hidden;
`;

const Band = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 44px 18px 28px;
  min-width: 460px;
  max-width: 88vw;
  background: linear-gradient(100deg, rgba(120,8,8,0) 0%, rgba(120,8,8,0.92) 14%, rgba(20,4,4,0.96) 100%);
  border-top: ${SCALE}px solid ${C.gold};
  border-bottom: ${SCALE}px solid ${C.gold};
  box-shadow: 0 0 40px rgba(245,158,11,0.35), inset 0 0 60px rgba(0,0,0,0.5);
  animation: ${bandIn} 3.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  overflow: hidden;
`;

const Slashes = styled.div`
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 80px;
  background: linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.55), rgba(255,255,255,0.0));
  filter: blur(2px);
  animation: ${slashSweep} 1.1s ease-out 0.15s both;
`;

const ArtWrap = styled.div`
  flex: 0 0 auto;
  width: 110px;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Art = styled.img`
  width: 110px;
  height: 110px;
  object-fit: contain;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 16px rgba(245,158,11,0.4));
  animation: ${artPop} 3.4s cubic-bezier(0.16, 1, 0.3, 1) both;
`;

const TextCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const Warn = styled.div`
  font-size: ${FONT.sm};
  font-weight: 800;
  letter-spacing: 3px;
  color: #fca5a5;
  text-shadow: 0 0 8px rgba(239,68,68,0.7);
  animation: ${textRise} 0.4s ease-out 0.25s both;
`;

const BossName = styled.div`
  font-size: ${FONT.xl};
  font-weight: 900;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.8), 0 0 14px rgba(245,158,11,0.5);
  animation: ${textRise} 0.4s ease-out 0.38s both;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Taunt = styled.div`
  font-size: ${FONT.sm};
  font-style: italic;
  color: #fcd34d;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  animation: ${textRise} 0.4s ease-out 0.52s both;
`;

// ── 라이트 배너 (중간 보스 / 싱글·멀티 모든 보스) — 상단 중앙 작은 알림 ──
// grand 컷인처럼 "딱" 들어왔다 "딱" 사라지게: 빠른 in(0~9%)·홀드·빠른 out(88~100%).
const lightIn = keyframes`
  0%   { transform: translateY(-26px) scale(0.9); opacity: 0; }
  9%   { transform: translateY(0)     scale(1);   opacity: 1; }
  88%  { transform: translateY(0)     scale(1);   opacity: 1; }
  100% { transform: translateY(-14px) scale(0.95); opacity: 0; }
`;

const LightRoot = styled.div`
  position: fixed;
  top: 14px; left: 0; right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 1390;
`;

const LightBanner = styled.div`
  ${winThin('gold')}
  display: flex;
  align-items: center;
  gap: ${SP.sm};
  animation: ${lightIn} 1.9s cubic-bezier(0.16, 1, 0.3, 1) both;
`;

const LightArt = styled.img`
  width: 34px; height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));
`;

const LightText = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  text-shadow: 1px 1px 0 ${C.ink};
  white-space: nowrap;
`;
