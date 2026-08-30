// src/components/story/StorySelector.tsx
// Pokemon Aegis — Story Mode Selection Screen
// Design: Dark epic fantasy · Amber/cyan accent · Animated chapter cards

import React, { useState, useEffect, useCallback } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AEGIS_STORY_CHAPTERS, StoryChapter } from '../../data/storyChapters';
import { Screen, ScreenBackBtn, SectionLabel } from '../shared/screen';
import {
  storyProgressService,
  ChapterProgress,
} from '../../services/StoryProgressService';
import { MAPS, mapThumbnailById } from '../../data/maps';
import { Emoji } from '../shared/Emoji';
import { media, lMedia } from '../../utils/responsive.utils';
import { StoryOpening } from './StoryOpening';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE, TYPE_COLOR, ICON } from '../../styles/tokens';
import { winThin, btn, sunken, hudBar, backdrop, pixelBold, shadowLg } from '../../styles/pixel';

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
      <Header $visible={!showIntro}>
        <BackBtn onClick={() => navigate('/')}>←<span className="back-text"> {t('common.back')}</span></BackBtn>
        <HeaderCenter>
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
                  {cp.cleared && <ClearedBadge>{t('storyUI.badgeClear')}</ClearedBadge>}
                  {isSuggested && !cp.cleared && (
                    <SuggestedBadge $accent={ch.theme.primary}>
                      {t('storyUI.badgeNext')}
                    </SuggestedBadge>
                  )}
                </CardThumb>

                {/* Card body */}
                <CardBody>
                  <CardMeta>
                    <ChapterNum $accent={ch.theme.primary}>
                      {t('storyUI.chapterShort', { n: ch.chapterNumber })}
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
          <IntroTitle>{t('storyUI.worldTitle')}</IntroTitle>
          <IntroSub>{t('storyUI.worldSubShort')}</IntroSub>
        </IntroOverlay>
      )}
    </Root>
  );
};

// ─── Animations ───────────────────────────────────────────────────────────────
//
// 걷어낸 것: 떠다니는 입자(particleFloat), 진행바 무지개 흐름(shimmer),
//           선택 카드 글로우(glowPulse), 스태거 fadeUp.
// 남긴 것: 인트로 타이틀 카드. 화면 전환 연출은 게임에서도 쓰는 문법이다.

const introPulse = keyframes`
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
`;

/** 카드 위에 얹는 배지(클리어·추천) 공통 바탕. */
/** 좁은 화면에서는 글자를 접고 화살표만 남긴다. */
const BackBtn = styled(ScreenBackBtn)`
  .back-text {
    ${media.mobile} { display: none; }
  }
`;

const badgeBase = css`
  ${pixelBold}
  position: absolute;
  top: ${SP.xs};
  left: ${SP.xs};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm};
  line-height: 1.3;
  padding: ${SP.xs} ${SP.sm};
  z-index: 2;
  text-shadow: none;
`;

/** 도트 스크롤바 — 기본 스크롤바는 이 화면에서 유일한 '웹' 요소가 된다. */
const scrollArea = css`
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;

const suggestPulse = keyframes`
  0%,  49%  { opacity: 1;    }
  50%, 100% { opacity: 0.45; }
`;

const Root = styled(Screen)`
  ${backdrop('medium_multi_s')}
  overflow: hidden;
  position: relative;
`;

const Header = styled.header<{ $visible: boolean }>`
  ${hudBar}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${SP.md};
  padding: ${SP.sm} ${SP.lg};
  position: relative;
  z-index: 10;
  opacity: ${p => (p.$visible ? 1 : 0)};

  ${media.mobile}   { padding: ${SP.xs} ${SP.sm}; gap: ${SP.sm}; }
  ${lMedia.tablet}  { padding: ${SP.xs} ${SP.md}; }
  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm}; gap: ${SP.xs}; }
`;

const HeaderCenter = styled.div`
  text-align: center;
  flex: 1;
  min-width: 0;
`;

const PageTitle = styled.h1`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

const PageSubtitle = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  ${media.mobile} { display: none; }
`;

const ProgressSummary = styled.div`
  display: flex;
  gap: ${SP.md};
  text-align: right;
  flex-shrink: 0;
`;

/** 숫자와 라벨을 세로로 묶기만 하는 칸. */
const ProgressStat = styled.div``;

const ProgressNum = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  line-height: 1.3;
`;

const ProgressLabel = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

const GlobalProgressBar = styled.div<{ $visible: boolean }>`
  height: ${SCALE * 2}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  position: relative;
  z-index: 10;
  opacity: ${p => (p.$visible ? 1 : 0)};
`;

const GlobalProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${p => p.$pct}%;
  background: ${C.gold};
`;

const MainLayout = styled.div<{ $visible: boolean }>`
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 360px;
  overflow: hidden;
  position: relative;
  z-index: 5;
  opacity: ${p => (p.$visible ? 1 : 0)};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  ${lMedia.tablet}  { grid-template-columns: 1fr 300px; overflow: hidden; }
  ${lMedia.phoneSm} { grid-template-columns: 1fr; overflow-y: auto; }
`;

const ChapterList = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: ${SP.lg};
  ${scrollArea}

  @media (max-width: 900px) { padding: ${SP.md}; overflow-y: visible; }
  ${lMedia.tablet}  { padding: ${SP.md}; overflow-y: auto; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; overflow-y: visible; }
`;

const ChapterCard = styled.div<{
  $unlocked: boolean; $cleared: boolean; $selected: boolean; $suggested: boolean; $accent: string;
}>`
  display: flex;
  align-items: stretch;
  margin-bottom: ${SP.sm};
  overflow: hidden;
  cursor: ${p => (p.$unlocked ? 'pointer' : 'not-allowed')};
  opacity: ${p => (p.$unlocked ? 1 : 0.45)};
  position: relative;
  background: ${C.panel};
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px
    ${p => (p.$selected || p.$suggested ? p.$accent : C.divider)};

  @media (hover: hover) {
    &:hover { box-shadow: inset 0 0 0 ${SCALE}px ${p => (p.$unlocked ? p.$accent : C.divider)}; }
  }

  &:focus-visible { outline: none; box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$accent}; }
`;

const CardThumb = styled.div<{ $unlocked: boolean }>`
  width: 120px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: ${C.ink};
  image-rendering: pixelated;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: ${p => (p.$unlocked
      ? 'linear-gradient(90deg, transparent 50%, rgba(22,27,40,0.9) 100%)'
      : 'rgba(22,27,40,0.75)')};
  }

  ${media.mobile}   { width: 90px; }
  ${lMedia.tablet}  { width: 100px; }
  ${lMedia.phoneSm} { width: 72px; }
`;

const LockIcon = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${ICON.lg}px;
  z-index: 1;
`;

const ClearedBadge = styled.div`
  ${badgeBase}
  background: ${C.green};
  color: ${C.ink};
`;

const SuggestedBadge = styled.div<{ $accent: string }>`
  ${badgeBase}
  background: ${p => p.$accent};
  color: ${C.ink};
  animation: ${suggestPulse} 1s steps(1, end) infinite;
`;

const CardBody = styled.div`
  flex: 1;
  min-width: 0;
  padding: ${SP.sm} ${SP.md};
  display: flex;
  flex-direction: column;

  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm}; }
`;

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${SP.sm};
`;

const ChapterNum = styled.div<{ $accent: string }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => p.$accent};
`;

const LocationTag = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

const CardTitle = styled.div<{ $unlocked: boolean }>`
  ${pixelBold}
  font-size: ${FONT.md};
  color: ${p => (p.$unlocked ? C.text : C.textDim)};
`;

const CardSubtitle = styled.div<{ $unlocked: boolean }>`
  font-size: ${FONT.sm};
  color: ${p => (p.$unlocked ? C.textSub : C.textDim)};
`;

const LockedText = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

const StarRow = styled.div`
  display: flex;
  gap: 2px;
`;

const Star = styled.span<{ $filled: boolean }>`
  font-size: ${ICON.md}px;
  color: ${p => (p.$filled ? C.gold : C.divider)};
  line-height: 1.3;
`;

/** 좁은 화면에서 카드 아래에 접혀 들어가는 상세. */
const InlineDetail = styled.div<{ $accent: string }>`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 0 ${SP.md};
  background: ${C.panel};
  border: ${SCALE}px solid ${C.ink};
  box-shadow: inset 0 0 0 ${SCALE}px ${p => p.$accent};
`;

const DetailPanel = styled.div<{ $visible: boolean }>`
  background: ${C.panel};
  border-left: ${SCALE}px solid ${C.ink};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: ${p => (p.$visible ? 1 : 0.6)};

  @media (max-width: 900px) {
    border-left: none;
    border-top: ${SCALE}px solid ${C.ink};
    display: ${p => (p.$visible ? 'flex' : 'none')};
  }
  ${lMedia.tablet} {
    display: flex;
    border-left: ${SCALE}px solid ${C.ink};
    border-top: none;
    overflow: hidden;
  }
  ${lMedia.phoneSm} {
    border-left: none;
    border-top: ${SCALE}px solid ${C.ink};
    display: ${p => (p.$visible ? 'flex' : 'none')};
  }
`;

const DetailHeader = styled.div<{ $bg: string }>`
  background: ${p => p.$bg};
  border-bottom: ${SCALE}px solid ${C.ink};
  padding: ${SP.lg};
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 0%, rgba(22,27,40,0.7) 100%);
    pointer-events: none;
  }

  ${lMedia.tablet}  { padding: ${SP.md}; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;

const DetailChNum = styled.div<{ $accent: string }>`
  ${pixelBold}
  position: relative; z-index: 1;
  font-size: ${FONT.sm};
  color: ${p => p.$accent};
  text-shadow: 1px 1px 0 ${C.ink};
`;

const DetailTitle = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl};
  color: ${C.text};
  margin: 0;
  position: relative;
  z-index: 1;
  text-shadow: ${SCALE}px ${SCALE}px 0 ${C.ink};
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const DetailSubtitle = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
  position: relative;
  z-index: 1;
  text-shadow: 1px 1px 0 ${C.ink};
`;

const DetailLocation = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
  position: relative;
  z-index: 1;
  text-shadow: 1px 1px 0 ${C.ink};
`;

const DetailBody = styled.div`
  /* flex:1 이면 본문이 패널 높이만큼 늘어나 시작 버튼이 맨 아래로 밀림.
     0 1 auto + min-height:0 → 본문은 내용 높이만, 길면 스크롤. */
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: ${SP.md} ${SP.lg};
  display: flex;
  flex-direction: column;
  gap: ${SP.md};
  ${scrollArea}

  ${lMedia.tablet}  { padding: ${SP.sm} ${SP.md}; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; gap: ${SP.sm}; }
`;

const RecordBox = styled.div`
  ${sunken()}
  padding: ${SP.sm} ${SP.md};
  display: flex;
  flex-direction: column;
  gap: ${SP.xs};
`;

const RecordRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${SP.sm};
`;

const RecordLabel = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

const RecordVal = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.text};
`;

/** 상세 본문 안의 묶음. 간격은 부모(DetailBody)의 gap 이 준다. */
const Section = styled.div``;


const SpriteRow = styled.div`
  display: flex;
  gap: ${SP.xs};
  flex-wrap: wrap;
`;

const HeroSprite = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
  image-rendering: pixelated;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
`;

const TypeBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${SP.xs};
`;

/** 타입 배지 — 타입 색은 정체성이라 면으로 칠한다. 색은 TYPE_COLOR 단일 출처. */
const TypeBadge = styled.div<{ $type: string }>`
  ${pixelBold}
  background: ${(p) => TYPE_COLOR[p.$type] ?? C.plain};
  border: 2px solid ${C.ink};
  color: ${C.text};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  line-height: 1.5;
`;

const BossName = styled.div`
  ${winThin('red')}
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.red};
  padding: ${SP.xs} ${SP.sm};
`;

const PreviewDialogue = styled.div`
  ${sunken()}
  padding: ${SP.sm};
`;

const PreviewSpeaker = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.blue};
`;

const PreviewText = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const DetailFooter = styled.div`
  padding: ${SP.md} ${SP.lg};
  border-top: ${SCALE}px solid ${C.ink};
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;

const StartBtn = styled.button<{ $accent: string }>`
  ${btn('gold')}
  ${pixelBold}
  width: 100%;
  padding: ${SP.sm};
  color: ${C.text};
  font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const EmptyDetail = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${SP.sm};
  padding: ${SP.xxl};
`;

const EmptyIcon = styled.div`
  font-size: 48px; line-height: 1;
`;

const EmptyText = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.textSub};
`;

const EmptyHint = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textDim};
`;

// ─── Intro overlay ────────────────────────────────────────────────────────────

const IntroOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${C.ink};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: ${introPulse} 1.8s steps(6, end) forwards;
  pointer-events: none;
`;

const IntroTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.display};
  color: ${C.gold};
  text-align: center;
  ${shadowLg}
`;

const IntroSub = styled.div`
  font-size: ${FONT.sm};
  color: ${C.textSub};
  margin-top: ${SP.md};
`;
