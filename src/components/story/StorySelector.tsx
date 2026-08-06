// src/components/story/StorySelector.tsx
// Pokemon Aegis — Story Mode Selection Screen
// Design: Dark epic fantasy · Amber/cyan accent · Animated chapter cards

import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AEGIS_STORY_CHAPTERS, StoryChapter } from '../../data/storyChapters';
import {
  storyProgressService,
  ChapterProgress,
} from '../../services/StoryProgressService';
import { MAPS, mapThumbnailById } from '../../data/maps';
import { Emoji } from '../shared/Emoji';
import { media, lMedia } from '../../utils/responsive.utils';
import { StoryOpening } from './StoryOpening';
import { useTranslation } from '../../i18n';

export interface StoryStartData {
  mapId: string;
  chapterId: string;
  chapterNumber: number;
  totalWaves: number;
  heroPool: number[];
  enemyTypes: string[];
  bossWave: number;
  bossName?: string;
}

interface StorySelectorProps {
  onStart: (data: StoryStartData) => void;
}

// ─── Star rating component ────────────────────────────────────────────────────

const StarRating: React.FC<{ stars: number; max?: number }> = ({
  stars,
  max = 3,
}) => (
  <StarRow>
    {Array.from({ length: max }).map((_, i) => (
      <Star key={i} $filled={i < stars}>
        ★
      </Star>
    ))}
  </StarRow>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const StorySelector: React.FC<StorySelectorProps> = ({ onStart }) => {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  // 언어별 챕터 텍스트 헬퍼 (En 없으면 Ko 폴백)
  const chTitle = (c: StoryChapter) => (language === 'en' && c.titleEn ? c.titleEn : c.title);
  const chSub = (c: StoryChapter) => (language === 'en' && c.subtitleEn ? c.subtitleEn : c.subtitle);
  const chLoc = (c: StoryChapter) => (language === 'en' && c.locationEn ? c.locationEn : c.location);
  const chBoss = (c: StoryChapter) => (language === 'en' && c.bossNameEn ? c.bossNameEn : c.bossName);
  const [progress] = useState(() => storyProgressService.getProgress());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showOpening, setShowOpening] = useState(false);
  const [pendingChapter, setPendingChapter] = useState<StoryChapter | null>(null);

  const [showIntro, setShowIntro] = useState(true);
  // 스택(단일 열) 레이아웃 여부 — 이때 상세패널을 누른 카드 바로 밑에 인라인 삽입
  const [isStacked, setIsStacked] = useState(false);

  // Find first unlocked-but-uncleared chapter for highlight
  const suggestedIdx = AEGIS_STORY_CHAPTERS.findIndex((ch) => {
    const unlocked = storyProgressService.isChapterUnlocked(ch.chapterNumber);
    const cleared = progress.chapterProgress[ch.id]?.cleared;
    return unlocked && !cleared;
  });

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  // 단일 열(스택) 레이아웃 감지: 좁은 폭 또는 낮은 가로화면(폰 가로)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(
      '(max-width: 900px), (orientation: landscape) and (max-height: 520px)'
    );
    const update = () => setIsStacked(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const handleSelect = useCallback(
    (idx: number) => {
      const ch = AEGIS_STORY_CHAPTERS[idx];
      const unlocked = storyProgressService.isChapterUnlocked(ch.chapterNumber);
      if (!unlocked) return;
      setSelectedIdx(idx);
    },
    []
  );

  const handleStart = useCallback(() => {
    if (selectedIdx === null) return;
    const ch = AEGIS_STORY_CHAPTERS[selectedIdx];
    const map = MAPS.find((m) => m.id === ch.mapId);
    if (!map) return;
    storyProgressService.updateLastPlayed(ch.id);
    // 오프닝 대화 화면으로 전환
    setPendingChapter(ch);
    setShowOpening(true);
  }, [selectedIdx]);

  // 오프닝 대화 완료 → 게임 시작
  const handleOpeningComplete = useCallback(() => {
    if (!pendingChapter) return;
    const map = MAPS.find(m => m.id === pendingChapter.mapId);
    if (!map) return;
    setShowOpening(false);
    onStart({
      mapId: map.id,
      chapterId: pendingChapter.id,
      chapterNumber: pendingChapter.chapterNumber,
      totalWaves: pendingChapter.totalWaves,
      heroPool: pendingChapter.heroPool,
      enemyTypes: pendingChapter.enemyTypes,
      bossWave: pendingChapter.bossWave,
      // 게임 화면(BossCutIn)은 언어를 다시 판별하지 않으므로 여기서 현지화해 넘긴다.
      bossName: chBoss(pendingChapter),
    });
  }, [pendingChapter, onStart]);

  // 오프닝 스킵 → 바로 게임 시작
  const handleOpeningSkip = useCallback(() => {
    handleOpeningComplete();
  }, [handleOpeningComplete]);

  const totalStars = progress.totalStars;
  const maxStars = AEGIS_STORY_CHAPTERS.length * 3;
  const clearedCount = AEGIS_STORY_CHAPTERS.filter(
    (ch) => progress.chapterProgress[ch.id]?.cleared
  ).length;

  const selected =
    selectedIdx !== null ? AEGIS_STORY_CHAPTERS[selectedIdx] : null;
  const selectedProgress =
    selected ? storyProgressService.getChapterProgress(selected.id) : null;

  // 상세패널 내용 — 사이드(와이드) / 인라인(스택) 양쪽에서 재사용
  const renderDetail = () =>
    selected ? (
      <>
        <DetailHeader $bg={selected.theme.bg}>
          <DetailChNum $accent={selected.theme.primary}>
            CHAPTER {String(selected.chapterNumber).padStart(2, '0')}
          </DetailChNum>
          <DetailTitle>{chTitle(selected)}</DetailTitle>
          <DetailSubtitle>{chSub(selected)}</DetailSubtitle>
          <DetailLocation><Emoji glyph="📍" size={13} /> {chLoc(selected)}</DetailLocation>
        </DetailHeader>

        <DetailBody>
          {selectedProgress?.cleared && (
            <RecordBox>
              <RecordRow>
                <RecordLabel>{t('storyUI.clearGrade')}</RecordLabel>
                <StarRating stars={selectedProgress.stars} />
              </RecordRow>
              {selectedProgress.bestWave > 0 && (
                <RecordRow>
                  <RecordLabel>{t('storyUI.highestWave')}</RecordLabel>
                  <RecordVal>Wave {selectedProgress.bestWave}</RecordVal>
                </RecordRow>
              )}
            </RecordBox>
          )}

          <Section>
            <SectionLabel>{t('storyUI.appearPokemon')}</SectionLabel>
            <SpriteRow>
              {selected.heroPool.slice(0, 6).map((id) => (
                <HeroSprite
                  key={id}
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`}
                  alt={`#${id}`}
                  title={`#${id}`}
                />
              ))}
            </SpriteRow>
          </Section>

          <Section>
            <SectionLabel>{t('storyUI.gymType')}</SectionLabel>
            <TypeBadgeRow>
              {selected.enemyTypes.map((t) => (
                <TypeBadge key={t} $type={t}>
                  {t}
                </TypeBadge>
              ))}
            </TypeBadgeRow>
          </Section>

          {selected.bossName && (
            <Section>
              <SectionLabel>
                {t('storyUI.bossAppears', { wave: selected.bossWave })}
              </SectionLabel>
              <BossName>{chBoss(selected)}</BossName>
            </Section>
          )}

          <Section>
            <SectionLabel>{t('storyUI.openingPreview')}</SectionLabel>
            <PreviewDialogue>
              <PreviewSpeaker>
                {language === 'en' && selected.openingDialogue[0].speakerEn
                  ? selected.openingDialogue[0].speakerEn
                  : selected.openingDialogue[0].speaker}
              </PreviewSpeaker>
              <PreviewText>
                "{language === 'en' && selected.openingDialogue[0].textEn
                  ? selected.openingDialogue[0].textEn
                  : selected.openingDialogue[0].text}"
              </PreviewText>
            </PreviewDialogue>
          </Section>
        </DetailBody>

        <DetailFooter>
          <StartBtn onClick={handleStart} $accent={selected.theme.primary}>
            {selectedProgress?.cleared ? t('storyUI.replay') : t('storyUI.start')}
          </StartBtn>
        </DetailFooter>
      </>
    ) : (
      <EmptyDetail>
        <EmptyIcon><Emoji glyph="⚔" size={28} /></EmptyIcon>
        <EmptyText>{t('storyUI.selectChapter')}</EmptyText>
        <EmptyHint>{t('storyUI.tagline')}</EmptyHint>
      </EmptyDetail>
    );

  return (
    <Root>
      {/* Animated background particles */}
      <ParticleLayer aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <Particle key={i} $i={i} />
        ))}
      </ParticleLayer>

      <Header $visible={!showIntro}>
        <BackBtn onClick={() => navigate('/')}>←<span className="back-text"> {t('common.back')}</span></BackBtn>
        <HeaderCenter>
          <AegisLabel>POKEMON AEGIS</AegisLabel>
          <PageTitle>{t('storyUI.worldTitle')}</PageTitle>
          <PageSubtitle>{t('storyUI.worldSub')}</PageSubtitle>
        </HeaderCenter>
        <ProgressSummary>
          <ProgressStat>
            <ProgressNum>{clearedCount}</ProgressNum>
            <ProgressLabel>{t('storyUI.clearedCount', { total: AEGIS_STORY_CHAPTERS.length })}</ProgressLabel>
          </ProgressStat>
          <ProgressStat>
            <ProgressNum>{totalStars}</ProgressNum>
            <ProgressLabel>/ {maxStars} ★</ProgressLabel>
          </ProgressStat>
        </ProgressSummary>
      </Header>

      {/* Global progress bar */}
      <GlobalProgressBar $visible={!showIntro}>
        <GlobalProgressFill
          $pct={maxStars > 0 ? (totalStars / maxStars) * 100 : 0}
        />
      </GlobalProgressBar>

      <MainLayout $visible={!showIntro}>
        {/* Chapter list */}
        <ChapterList>
          {AEGIS_STORY_CHAPTERS.map((ch, idx) => {
            const unlocked = storyProgressService.isChapterUnlocked(ch.chapterNumber);
            const cp: ChapterProgress = storyProgressService.getChapterProgress(ch.id);
            const isSelected = selectedIdx === idx;
            const isSuggested = idx === suggestedIdx;
            

            return (
              <React.Fragment key={ch.id}>
              <ChapterCard
                $unlocked={unlocked}
                $cleared={cp.cleared}
                $selected={isSelected}
                $suggested={isSuggested && !cp.cleared}
                $accent={ch.theme.primary}
                $delay={idx * 60}
                onClick={() => handleSelect(idx)}
                
                
                tabIndex={unlocked ? 0 : -1}
                onKeyDown={(e) => e.key === 'Enter' && handleSelect(idx)}
                role="button"
                aria-label={t('storyUI.chapterAria', { n: ch.chapterNumber, title: ch.title })}
                aria-disabled={!unlocked}
              >
                {/* Map thumbnail */}
                <CardThumb
                  style={{
                    backgroundImage: unlocked
                      ? `url(${mapThumbnailById(ch.mapId)})`
                      : 'none',
                  }}
                  $unlocked={unlocked}
                >
                  {!unlocked && <LockIcon><Emoji glyph="🔒" size={16} /></LockIcon>}
                  {cp.cleared && <ClearedBadge>CLEAR</ClearedBadge>}
                  {isSuggested && !cp.cleared && (
                    <SuggestedBadge $accent={ch.theme.primary}>
                      NEXT
                    </SuggestedBadge>
                  )}
                </CardThumb>

                {/* Card body */}
                <CardBody>
                  <CardMeta>
                    <ChapterNum $accent={ch.theme.primary}>
                      CH.{String(ch.chapterNumber).padStart(2, '0')}
                    </ChapterNum>
                    <LocationTag>{chLoc(ch).split('·')[0].trim()}</LocationTag>
                  </CardMeta>
                  <CardTitle $unlocked={unlocked}>{chTitle(ch)}</CardTitle>
                  <CardSubtitle $unlocked={unlocked}>{chSub(ch)}</CardSubtitle>
                  {cp.cleared ? (
                    <StarRating stars={cp.stars} />
                  ) : unlocked ? (
                    <StarRating stars={0} />
                  ) : (
                    // unlockCondition은 한국어 원문이라 표시에 쓰지 않는다 — 챕터 번호로 문구를 만든다.
                    <LockedText>
                      {ch.chapterNumber <= 1
                        ? t('storyUI.unlockFirst')
                        : t('storyUI.unlockAfter', { n: ch.chapterNumber - 1 })}
                    </LockedText>
                  )}
                </CardBody>

                {/* Selection glow */}
                {isSelected && <SelectGlow $accent={ch.theme.primary} />}
              </ChapterCard>
              {/* 스택 모드: 누른 카드 바로 밑에 상세패널 인라인 삽입 */}
              {isStacked && isSelected && (
                <InlineDetail $accent={ch.theme.primary}>{renderDetail()}</InlineDetail>
              )}
              </React.Fragment>
            );
          })}
        </ChapterList>

        {/* Detail panel — 와이드: 사이드 고정 패널. 스택: 카드 밑 인라인(InlineDetail)으로 대체 */}
        {!isStacked && (
          <DetailPanel $visible={selected !== null}>
            {renderDetail()}
          </DetailPanel>
        )}
      </MainLayout>

      {/* Story opening overlay */}
      {showOpening && pendingChapter && (
        <StoryOpening
          chapter={pendingChapter}
          onComplete={handleOpeningComplete}
          onSkip={handleOpeningSkip}
        />
      )}

      {/* Intro overlay */}
      {showIntro && (
        <IntroOverlay>
          <IntroAegis>POKEMON AEGIS</IntroAegis>
          <IntroTitle>{t('storyUI.worldTitle')}</IntroTitle>
          <IntroSub>{t('storyUI.worldSubShort')}</IntroSub>
        </IntroOverlay>
      )}
    </Root>
  );
};

// ─── Type color map ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  grass: '#78C850',
  electric: '#F8D030',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
};

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px) }
  to   { opacity: 1; transform: translateY(0) }
`;

const shimmer = keyframes`
  0%   { background-position: -200% center }
  100% { background-position: 200% center }
`;

const particleFloat = keyframes`
  0%   { transform: translateY(0);    opacity: 0.3; }
  50%  { transform: translateY(-40px); opacity: 0.7; }
  100% { transform: translateY(-80px); opacity: 0; }
`;

const introPulse = keyframes`
  0%   { opacity: 0; transform: scale(0.9) }
  40%  { opacity: 1; transform: scale(1) }
  80%  { opacity: 1; transform: scale(1) }
  100% { opacity: 0; transform: scale(1.02) }
`;

const glowPulse = keyframes`
  0%, 100% { opacity: 0.6 }
  50%       { opacity: 1 }
`;

// ─── Styled Components ────────────────────────────────────────────────────────

const Root = styled.div`
  min-height: 100vh;
  background: #050810;
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  font-family: 'Segoe UI', system-ui, sans-serif;
`;

const ParticleLayer = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
`;

const Particle = styled.div<{ $i: number }>`
  position: absolute;
  width: ${(p) => 2 + (p.$i % 3)}px;
  height: ${(p) => 2 + (p.$i % 3)}px;
  border-radius: 50%;
  background: ${(p) =>
    p.$i % 3 === 0
      ? 'rgba(200,160,32,0.5)'
      : p.$i % 3 === 1
      ? 'rgba(76,201,240,0.4)'
      : 'rgba(255,255,255,0.25)'};
  left: ${(p) => (p.$i * 4.17) % 100}%;
  top: ${(p) => 20 + ((p.$i * 7.3) % 70)}%;
  animation: ${particleFloat} ${(p) => 4 + (p.$i % 5)}s
    ${(p) => (p.$i * 0.4) % 3}s ease-in-out infinite alternate;
`;

const Header = styled.header<{ $visible: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  z-index: 10;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 0.6s ease 0.4s;

  ${media.mobile} { padding: 12px 16px; gap: 8px; }
  ${lMedia.tablet} { padding: 10px 20px 8px; }
  ${lMedia.phoneSm} { padding: 8px 12px; gap: 6px; }
`;

const BackBtn = styled.button`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .back-text {
    ${media.mobile} { display: none; }
  }

  ${media.mobile} { font-size: 12px; padding: 6px 10px; }
  ${lMedia.phoneSm} { font-size: 11px; padding: 5px 8px; }
`;

const HeaderCenter = styled.div`
  text-align: center;
  flex: 1;
  min-width: 0;
`;

const AegisLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: #c8a020;
  margin-bottom: 4px;
  ${media.mobile} { font-size: 9px; letter-spacing: 0.2em; margin-bottom: 2px; }
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  background: linear-gradient(135deg, #fff 30%, #c8a020 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${media.tablet} { font-size: 22px; }
  ${media.mobile} { font-size: 16px; }
  ${lMedia.tablet} { font-size: 20px; }
  ${lMedia.phoneSm} { font-size: 14px; }
`;

const PageSubtitle = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.12em;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${media.mobile} { font-size: 10px; letter-spacing: 0.04em; }
`;

const ProgressSummary = styled.div`
  display: flex;
  gap: 20px;
  text-align: right;
  flex-shrink: 0;

  ${media.mobile} { gap: 10px; }
`;

const ProgressStat = styled.div``;

const ProgressNum = styled.div`
  font-size: 22px;
  font-weight: 700;
  color: #c8a020;
  line-height: 1;

  ${media.mobile} { font-size: 16px; }
  ${lMedia.phoneSm} { font-size: 14px; }
`;

const ProgressLabel = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
  ${media.mobile} { font-size: 9px; }
`;

const GlobalProgressBar = styled.div<{ $visible: boolean }>`
  height: 2px;
  background: rgba(255, 255, 255, 0.06);
  position: relative;
  z-index: 10;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 0.6s ease 0.5s;
`;

const GlobalProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  background: linear-gradient(90deg, #c8a020, #f59e0b, #4cc9f0);
  background-size: 200%;
  animation: ${shimmer} 3s linear infinite;
  transition: width 1s ease;
`;

const MainLayout = styled.div<{ $visible: boolean }>`
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 0;
  overflow: hidden;
  position: relative;
  z-index: 5;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 0.6s ease 0.6s;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  /* 태블릿 가로(landscape): 오른쪽 패널을 좀 더 좁게 */
  ${lMedia.tablet} {
    grid-template-columns: 1fr 300px;
    overflow: hidden;
  }
  /* 폰 가로(landscape): 단일 열로 전환하되 스크롤 허용 */
  ${lMedia.phoneSm} {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
`;

const ChapterList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  padding: 20px 24px;

  /* Custom scrollbar */
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: rgba(200, 160, 32, 0.3);
    border-radius: 2px;
  }

  @media (max-width: 900px) {
    padding: 16px;
    overflow-y: visible;
  }

  ${lMedia.tablet} {
    padding: 12px 16px;
    overflow-y: auto;
  }
  ${lMedia.phoneSm} {
    padding: 10px 12px;
    overflow-y: visible;
  }
`;

const ChapterCard = styled.div<{
  $unlocked: boolean;
  $cleared: boolean;
  $selected: boolean;
  $suggested: boolean;
  $accent: string;
  $delay: number;
}>`
  display: flex;
  align-items: stretch;
  gap: 0;
  border-radius: 12px;
  margin-bottom: 10px;
  overflow: hidden;
  cursor: ${(p) => (p.$unlocked ? 'pointer' : 'not-allowed')};
  opacity: ${(p) => (p.$unlocked ? 1 : 0.45)};
  position: relative;
  border: 1.5px solid
    ${(p) =>
      p.$selected
        ? p.$accent
        : p.$suggested
        ? `${p.$accent}66`
        : 'rgba(255,255,255,0.07)'};
  background: ${(p) =>
    p.$selected
      ? `rgba(255,255,255,0.05)`
      : 'rgba(255,255,255,0.025)'};
  transition: border-color 0.25s, background 0.25s, transform 0.2s, opacity 0.25s;
  animation: ${fadeUp} 0.5s ease both;
  animation-delay: ${(p) => p.$delay}ms;

  &:hover {
    transform: ${(p) => (p.$unlocked ? 'translateX(4px)' : 'none')};
    border-color: ${(p) =>
      p.$unlocked ? `${p.$accent}aa` : 'rgba(255,255,255,0.07)'};
    background: ${(p) =>
      p.$unlocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'};
  }

  ${media.mobile} { margin-bottom: 8px; }
  ${lMedia.phoneSm} { margin-bottom: 6px; }
`;

const CardThumb = styled.div<{ $unlocked: boolean }>`
  width: 120px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;

  /* dim overlay on thumbnail */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: ${(p) =>
      p.$unlocked
        ? 'linear-gradient(90deg, transparent 50%, rgba(5,8,16,0.9) 100%)'
        : 'rgba(5,8,16,0.7)'};
  }

  ${media.mobile} { width: 90px; }
  ${lMedia.tablet} { width: 100px; }
  ${lMedia.phoneSm} { width: 72px; }
`;

const LockIcon = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  z-index: 1;
`;

const ClearedBadge = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(74, 222, 128, 0.9);
  color: #052e16;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 6px;
  border-radius: 4px;
  z-index: 2;
`;

const SuggestedBadge = styled.div<{ $accent: string }>`
  position: absolute;
  top: 8px;
  left: 8px;
  background: ${(p) => p.$accent};
  color: #000;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 6px;
  border-radius: 4px;
  z-index: 2;
  animation: ${glowPulse} 1.5s ease-in-out infinite;
`;

const CardBody = styled.div`
  flex: 1;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;

  ${media.mobile} { padding: 10px 12px; }
  ${lMedia.phoneSm} { padding: 8px 10px; }
`;

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
`;

const ChapterNum = styled.div<{ $accent: string }>`
  font-size: 11px;
  font-weight: 800;
  color: ${(p) => p.$accent};
  letter-spacing: 0.1em;
`;

const LocationTag = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
`;

const CardTitle = styled.div<{ $unlocked: boolean }>`
  font-size: 16px;
  font-weight: 700;
  color: ${(p) => (p.$unlocked ? '#fff' : 'rgba(255,255,255,0.4)')};
  line-height: 1.2;

  ${media.mobile} { font-size: 14px; }
  ${lMedia.phoneSm} { font-size: 13px; }
`;

const CardSubtitle = styled.div<{ $unlocked: boolean }>`
  font-size: 12px;
  color: ${(p) =>
    p.$unlocked ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)'};
  margin-bottom: 4px;
`;

const LockedText = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
`;

const SelectGlow = styled.div<{ $accent: string }>`
  position: absolute;
  inset: -1px;
  border-radius: 12px;
  border: 1.5px solid ${(p) => p.$accent};
  pointer-events: none;
  box-shadow: 0 0 12px ${(p) => p.$accent}44, inset 0 0 12px ${(p) => p.$accent}11;
  animation: ${glowPulse} 1.8s ease-in-out infinite;
`;

const StarRow = styled.div`
  display: flex;
  gap: 2px;
`;

const Star = styled.span<{ $filled: boolean }>`
  font-size: 14px;
  color: ${(p) => (p.$filled ? '#f59e0b' : 'rgba(255,255,255,0.15)')};
  line-height: 1;
`;

// ─── Detail panel ─────────────────────────────────────────────────────────────

// 스택(단일 열) 레이아웃에서 선택한 카드 바로 밑에 끼워넣는 인라인 상세패널
const InlineDetail = styled.div<{ $accent: string }>`
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  margin: -2px 0 12px;
  border: 1.5px solid ${(p) => p.$accent}66;
  background: rgba(255, 255, 255, 0.02);
  animation: ${fadeUp} 0.35s ease both;
`;

const DetailPanel = styled.div<{ $visible: boolean }>`
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: ${(p) => (p.$visible ? 'translateX(0)' : 'translateX(20px)')};
  opacity: ${(p) => (p.$visible ? 1 : 0.6)};
  transition: transform 0.3s ease, opacity 0.3s ease;

  @media (max-width: 900px) {
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    display: ${(p) => (p.$visible ? 'flex' : 'none')};
  }

  /* 태블릿 가로: 사이드 패널로 표시 */
  ${lMedia.tablet} {
    display: flex;
    border-left: 1px solid rgba(255, 255, 255, 0.07);
    border-top: none;
    overflow: hidden;
  }
  /* 폰 가로: 세로 쌓기 (900px 이하와 동일) */
  ${lMedia.phoneSm} {
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    display: ${(p) => (p.$visible ? 'flex' : 'none')};
  }
`;

const DetailHeader = styled.div<{ $bg: string }>`
  background: ${(p) => p.$bg};
  padding: 24px 24px 20px;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(5, 8, 16, 0.6) 100%
    );
    pointer-events: none;
  }

  ${lMedia.tablet} { padding: 16px 18px 14px; }
  ${lMedia.phoneSm} { padding: 12px 14px 10px; }
`;

const DetailChNum = styled.div<{ $accent: string }>`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: ${(p) => p.$accent};
  margin-bottom: 6px;
`;

const DetailTitle = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px;
  position: relative;
  z-index: 1;

  ${lMedia.tablet} { font-size: 20px; }
  ${lMedia.phoneSm} { font-size: 17px; }
`;

const DetailSubtitle = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
`;

const DetailLocation = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  position: relative;
  z-index: 1;
`;

const DetailBody = styled.div`
  /* flex:1 이면 본문이 패널 높이만큼 늘어나 시작 버튼이 맨 아래로 밀림.
     0 1 auto + min-height:0 → 본문은 내용 높이만, 길면 스크롤. 버튼이 내용 바로 밑에 붙음. */
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;

  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  ${lMedia.tablet} { padding: 14px 16px; gap: 12px; }
  ${lMedia.phoneSm} { padding: 10px 12px; gap: 10px; }
`;

const RecordBox = styled.div`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RecordRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const RecordLabel = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
`;

const RecordVal = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #fff;
`;

const Section = styled.div``;

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const SpriteRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const HeroSprite = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
  image-rendering: pixelated;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: transform 0.2s;

  &:hover { transform: scale(1.15); }
`;

const TypeBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const TypeBadge = styled.div<{ $type: string }>`
  background: ${(p) => TYPE_COLORS[p.$type] ?? '#888'}33;
  border: 1px solid ${(p) => TYPE_COLORS[p.$type] ?? '#888'}66;
  color: ${(p) => TYPE_COLORS[p.$type] ?? '#aaa'};
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
`;

const BossName = styled.div`
  font-size: 13px;
  color: #f87171;
  font-weight: 600;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
`;

const PreviewDialogue = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-left: 2px solid rgba(99, 179, 237, 0.4);
  border-radius: 0 8px 8px 0;
  padding: 10px 14px;
`;

const PreviewSpeaker = styled.div`
  font-size: 11px;
  color: #63b3ed;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 4px;
`;

const PreviewText = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.5;
  font-style: italic;
`;

const DetailFooter = styled.div`
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);

  ${lMedia.tablet} { padding: 12px 16px 14px; }
  ${lMedia.phoneSm} { padding: 10px 12px 12px; }
`;

const StartBtn = styled.button<{ $accent: string }>`
  width: 100%;
  padding: 14px;
  background: ${(p) => p.$accent}22;
  border: 1.5px solid ${(p) => p.$accent}88;
  color: ${(p) => p.$accent};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${(p) => p.$accent}33;
    border-color: ${(p) => p.$accent};
    transform: translateY(-1px);
    box-shadow: 0 8px 24px ${(p) => p.$accent}33;
  }

  &:active { transform: translateY(0); }
`;

const EmptyDetail = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
`;

const EmptyIcon = styled.div`
  font-size: 48px;
  opacity: 0.2;
`;

const EmptyText = styled.div`
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
  font-weight: 600;
`;

const EmptyHint = styled.div`
  font-size: 12px;
  color: rgba(200, 160, 32, 0.4);
  letter-spacing: 0.08em;
`;

// ─── Intro overlay ────────────────────────────────────────────────────────────

const IntroOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: #050810;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: ${introPulse} 1.8s ease forwards;
  pointer-events: none;
`;

const IntroAegis = styled.div`
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.4em;
  color: #c8a020;
  margin-bottom: 16px;
`;

const IntroTitle = styled.div`
  font-size: 48px;
  font-weight: 700;
  color: #fff;
  text-align: center;
  line-height: 1.1;
`;

const IntroSub = styled.div`
  font-size: 16px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.15em;
  margin-top: 12px;
`;