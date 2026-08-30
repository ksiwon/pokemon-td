// src/components/modals/Achievements.tsx
import React, { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Emoji } from '../shared/Emoji';
import { lMedia, media } from '../../utils/responsive.utils';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  AchievementCategory,
  AchievementWithCategory,
  TIER_META,
  resolveAchievementText,
} from '../../data/achievements';
import { databaseService } from '../../services/DatabaseService';
import { saveService } from '../../services/SaveService';
import { authService } from '../../services/AuthService';
import { Achievement, AchievementTier, TIER_POINTS } from '../../types/game';
import { useTranslation } from '../../i18n';

import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { winThin, btnThin, sunken, pixelBold, FRAME_W } from '../../styles/pixel';
import {
  ModalOverlay, ModalBox, MODAL_ACCENT, modalPadX, ModalTitle, ModalCloseBtn,
  ModalTabBtn, ModalScrollRowPad,
} from '../shared/modal.styles';

// 문구는 achievements.ts의 정의를 통해서만 해석한다 — 세이브에는 한국어 이름이 굳어 있다.

type TabKey = 'all' | AchievementCategory;

const TIER_ORDER: AchievementTier[] = ['legendary', 'diamond', 'gold', 'silver', 'bronze'];

// ─── 메인 패널 ───────────────────────────────────────────────────────────────
export const AchievementsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [progressData, setProgressData] = useState<Map<string, Achievement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [myAP, setMyAP] = useState(0);

  // 업적 데이터 로드 (localStorage 우선, DB 보조 병합 + 강제 정규화)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const localData = saveService.load();
        const localMap = new Map<string, Achievement>(localData.achievements.map(a => [a.id, a]));

        // [OFFLINE-FIX] 오프라인 모드에선 Firestore 읽기 자체를 생략(permission-denied 낭비 요청 방지).
        if (!authService.isOfflineMode()) {
          try {
            const dbAchs = await databaseService.getUserAchievements();
            for (const dbAch of dbAchs) {
              const local = localMap.get(dbAch.id);
              const dbComp = dbAch.completions ?? 0;
              const localComp = local?.completions ?? 0;
              if (!local || dbComp > localComp) {
                localMap.set(dbAch.id, { ...(local ?? dbAch), ...dbAch });
              }
            }
          } catch { /* DB 실패 시 로컬만 사용 */ }
        }

        // UI에 노출하기 전 1회 달성 기준으로 강제 정규화 진행
        let recalculatedAP = 0;
        const normalizedMap = new Map<string, Achievement>();

        for (const [id, a] of localMap.entries()) {
          const tierPoints: Record<string, number> = { bronze: 3, silver: 10, gold: 25, diamond: 50, legendary: 100 };
          const ptsPer = a.tier ? tierPoints[a.tier] ?? 3 : 3;
          const unlocked = a.unlocked || (a.completions ?? 0) > 0 || a.progress >= a.target;

          const normalized: Achievement = {
            ...a,
            unlocked,
            completions: unlocked ? 1 : 0,
            totalPoints: unlocked ? ptsPer : 0,
            pointsPerCompletion: ptsPer,
          };

          normalizedMap.set(id, normalized);
          recalculatedAP += normalized.totalPoints;
        }

        setProgressData(normalizedMap);
        setMyAP(recalculatedAP);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 통계 계산
  const totalCount = ACHIEVEMENTS.length;
  const unlockedCount = ACHIEVEMENTS.filter(a => (progressData.get(a.id)?.completions ?? 0) > 0).length;
  const totalCompletions = Array.from(progressData.values()).reduce((s, a) => s + (a.completions ?? 0), 0);
  const pct = Math.floor((unlockedCount / totalCount) * 100);

  const categoryStats = (cat: AchievementCategory) => {
    const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
    const done = catAchs.filter(a => (progressData.get(a.id)?.completions ?? 0) > 0).length;
    return { done, total: catAchs.length };
  };

  const filteredAchs: AchievementWithCategory[] = ACHIEVEMENTS.filter(ach => {
    if (ach.hidden && !showHidden) {
      if (!((progressData.get(ach.id)?.completions ?? 0) > 0)) return false;
    }
    if (activeTab !== 'all' && ach.category !== activeTab) return false;
    return true;
  });

  const groupedByTier = TIER_ORDER.map(tier => ({
    tier,
    achs: filteredAchs.filter(a => a.tier === tier),
  })).filter(g => g.achs.length > 0);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="lg" $accent={MODAL_ACCENT.gold} onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <ModalHeader>
          <HeaderTop>
            <TitleArea>
              <ModalTitle>{t('achievementsPanel.title')}</ModalTitle>
              <APBadge>{t('achievementsPanel.apBadge', { ap: myAP.toLocaleString() })}</APBadge>
            </TitleArea>
            <HeaderActions>
              <HiddenToggle onClick={() => setShowHidden(v => !v)}>
                {showHidden ? t('achievementsPanel.hideHidden') : t('achievementsPanel.showHidden')}
              </HiddenToggle>
              <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
            </HeaderActions>
          </HeaderTop>

          {/* 전체 진행 바 */}
          <ProgressArea>
            <ProgressStats>
              <span>{t('achievementsPanel.progressStats', { unlocked: unlockedCount, total: totalCount })}</span>
              <span>{t('achievementsPanel.progressTotalCompletions', { count: totalCompletions })}</span>
              <span>{pct}%</span>
            </ProgressStats>
            <ProgressBarOuter>
              <ProgressBarInner $pct={pct} />
            </ProgressBarOuter>
          </ProgressArea>
        </ModalHeader>

        {/* ── 업적 탭 ── */}
        <>
            <ModalScrollRowPad>
              <CategoryTabRow>
              <CatTab $active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
                {t('achievementsPanel.catAll')} <TabBadge>{unlockedCount}/{totalCount}</TabBadge>
              </CatTab>
              {(Object.keys(ACHIEVEMENT_CATEGORIES) as AchievementCategory[]).map(cat => {
                const { done, total } = categoryStats(cat);
                const { label, icon } = ACHIEVEMENT_CATEGORIES[cat];
                const catKey = `achData.category.${cat}`;
                const catLabel = t(catKey) !== catKey ? t(catKey) : label;
                return (
                  <CatTab key={cat} $active={activeTab === cat} onClick={() => setActiveTab(cat)}>
                    {icon} {catLabel} <TabBadge>{done}/{total}</TabBadge>
                  </CatTab>
                );
              })}
              </CategoryTabRow>
            </ModalScrollRowPad>

            <AchievementScroll>
              {loading ? (
                <LoadingMsg>{t('achievementsPanel.loading')}</LoadingMsg>
              ) : groupedByTier.length === 0 ? (
                <EmptyMsg>{t('achievementsPanel.empty')}</EmptyMsg>
              ) : (
                groupedByTier.map(({ tier, achs }) => {
                  const meta = TIER_META[tier];
                  return (
                    <TierSection key={tier}>
                      <TierHeader $color={meta.color}>
                        <TierLabel>{meta.label}</TierLabel>
                        <TierPts>
                          {t('achievementsPanel.apPerCompletion', { pts: TIER_POINTS[tier as AchievementTier] })}
                        </TierPts>
                      </TierHeader>
                      <TierGrid>
                        {achs.map(ach => {
                          const saved = progressData.get(ach.id);
                          const completions = saved?.completions ?? 0;
                          const progress = saved?.progress ?? 0;
                          const totalPoints = saved?.totalPoints ?? 0;
                          const isUnlocked = completions > 0;
                          const progressPct = Math.min(100, Math.floor((progress / ach.target) * 100));

                          return (
                            <AchCard
                              key={ach.id}
                              $unlocked={isUnlocked}
                              $tier={tier}
                              $borderColor={meta.border}
                              $bgColor={meta.bg}
                            >
                              <CardIcon $unlocked={isUnlocked} $tier={tier} $color={meta.color}>
                                <Emoji glyph={ach.icon} size={22} />
                              </CardIcon>
                              <CardBody>
                                <CardNameRow>
                                  <CardName $unlocked={isUnlocked} $color={meta.color}>
                                    {ach.hidden && !isUnlocked ? '???' : resolveAchievementText(ach, t, 'name')}
                                  </CardName>
                                  {isUnlocked && completions > 1 && (
                                    <CompletionBadge $color={meta.color}>×{completions}</CompletionBadge>
                                  )}
                                  {isUnlocked && <UnlockedMark $color={meta.color}>✓</UnlockedMark>}
                                </CardNameRow>
                                <CardDesc>
                                  {ach.hidden && !isUnlocked
                                    ? t('achievementsPanel.hiddenDesc')
                                    : resolveAchievementText(ach, t, 'desc')}
                                </CardDesc>
                                <CardBottom>
                                  {!isUnlocked ? (
                                    <>
                                      <MiniBar>
                                        <MiniFill $pct={progressPct} $color={meta.color} />
                                      </MiniBar>
                                      <ProgressTxt>
                                        {progress.toLocaleString()} / {ach.target.toLocaleString()}
                                      </ProgressTxt>
                                    </>
                                  ) : (
                                    <APEarned $color={meta.color}>
                                      {t('achievementsPanel.apEarned', { pts: totalPoints.toLocaleString() })}
                                    </APEarned>
                                  )}
                                </CardBottom>
                              </CardBody>
                            </AchCard>
                          );
                        })}
                      </TierGrid>
                    </TierSection>
                  );
                })
              )}
            </AchievementScroll>
          </>
      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, 알약 배지, 원형 닫기, hover 떠오름+그림자, shimmer 광택,
//           둥근 모서리, 10~11px 글자.

// ── 헤더
/**
 * 제목 띠 — 창틀 안쪽 끝까지 사방으로 붙인다.
 * 창틀에서 떨어뜨리면 띠가 붕 떠 보인다. 밖으로 나간 만큼 좌우 패딩으로 되돌려,
 * 안쪽 줄들이 공용 여백(modalPadX)만 쓰면 본문과 좌변이 맞게 한다.
 */
const ModalHeader = styled.div`
  margin: -${FRAME_W}px -${FRAME_W}px ${SP.md};
  padding: 0 ${FRAME_W}px ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  flex-shrink: 0;
`;

const HeaderTop = styled.div`
  ${modalPadX}
  display: flex; justify-content: space-between; align-items: center;
  gap: ${SP.sm};
  padding-top: ${SP.lg};
  margin-bottom: ${SP.sm};

  ${media.mobile}   { padding-top: ${SP.md}; }
  ${lMedia.phoneSm} { padding-top: ${SP.md}; }
`;

const TitleArea = styled.div`display: flex; align-items: center; gap: ${SP.sm}; min-width: 0;`;

const APBadge = styled.div`
  ${winThin('gold')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  color: ${C.gold}; font-size: ${FONT.sm};
  white-space: nowrap;
`;

const HeaderActions = styled.div`display: flex; gap: ${SP.sm}; align-items: center;`;

const HiddenToggle = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.textSub};
  white-space: nowrap;
  &:focus, &:focus-visible { outline: none; }
`;

// ── 진행 바
const ProgressArea = styled.div`
  ${modalPadX}
`;
const ProgressStats = styled.div`
  display: flex; justify-content: space-between;
  font-size: ${FONT.sm}; color: ${C.textDim}; margin-bottom: ${SP.xs};
`;
/** 게이지 — 파인 트랙 + 각진 골드 막대. */
const ProgressBarOuter = styled.div`
  ${sunken()}
  height: 12px; overflow: hidden;
`;
const ProgressBarInner = styled.div<{ $pct: number }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${C.gold};
`;

// ── 카테고리 탭
/* 여백은 바깥(ModalScrollRowPad)이 잡는다. 여기 주면 스크롤과 함께 밀려 사라진다. */
const CategoryTabRow = styled.div`
  display: flex; gap: ${SP.xs}; overflow-x: auto;
  padding-top: ${SP.sm}; padding-bottom: ${SP.xs};
  &::-webkit-scrollbar { height: 8px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: 2px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: 2px solid ${C.ink}; }

  ${media.mobile}   { padding-top: ${SP.xs}; }
  ${lMedia.phoneSm} { padding-top: ${SP.xs}; }
`;
/** 카테고리 탭 — 화면을 갈아끼우는 주 탭이라 공용 큰 버튼을 쓴다. */
const CatTab = styled(ModalTabBtn).attrs<{ $active?: boolean }>(p => ({
  $on: p.$active, $c: 'gold' as const,
}))``;
const TabBadge = styled.span`
  font-size: ${FONT.sm}; color: ${C.textDim}; font-weight: 400;
`;

// ── 업적 스크롤
const AchievementScroll = styled.div`
  ${modalPadX}
  flex: 1; overflow-y: auto;
  padding-top: ${SP.md}; padding-bottom: ${SP.lg};
  display: flex; flex-direction: column; gap: ${SP.md};
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  ${media.mobile}   { padding-top: ${SP.sm}; padding-bottom: ${SP.md}; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { padding-top: ${SP.sm}; padding-bottom: ${SP.md}; gap: ${SP.sm}; }
`;

// ── 티어 섹션
const TierSection = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const TierHeader = styled.div<{ $color: string }>`
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.sm};
  padding: ${SP.xs} 0 ${SP.xs} ${SP.sm};
  border-left: ${SCALE}px solid ${p => p.$color};
`;
const TierLabel = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
`;
const TierPts = styled.span`font-size: ${FONT.sm}; color: ${C.textDim};`;

/**
 * TierGrid:
 *  데스크탑: auto-fill minmax(320px, 1fr) → 2~3열
 *  태블릿/폰: 열 수를 줄인다
 */
const TierGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: ${SP.sm};

  ${media.tablet}   { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  ${media.mobile}   { grid-template-columns: 1fr; gap: ${SP.xs}; }
  ${lMedia.tablet}  { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  ${lMedia.phoneSm} { grid-template-columns: 1fr; gap: ${SP.xs}; }
`;

/**
 * 업적 카드 — 달성한 것만 티어 색 띠를 두른다.
 * 예전에는 유리 카드에 광택이 흐르고 hover에서 떠올랐다.
 */
const AchCard = styled.div<{
  $unlocked: boolean;
  $tier: string;
  $borderColor: string;
  $bgColor: string;
}>`
  ${sunken()}
  display: flex; gap: ${SP.sm}; padding: ${SP.sm};
  opacity: ${p => (p.$unlocked ? 1 : 0.6)};
  position: relative; overflow: hidden;
  ${p => p.$unlocked && css`box-shadow: inset 0 0 0 ${SCALE}px ${p.$borderColor};`}
`;

const CardIcon = styled.div<{ $unlocked: boolean; $tier: string; $color: string }>`
  flex-shrink: 0;
  width: 44px; height: 44px; font-size: ${ICON.xl}px;
  display: flex; align-items: center; justify-content: center;
  background: ${C.panel};
  border: 2px solid ${C.ink};
  filter: ${p => (p.$unlocked ? 'none' : 'grayscale(70%)')};

  ${media.mobile}   { width: 38px; height: 38px; font-size: ${ICON.lg}px; }
  ${lMedia.phoneSm} { width: 36px; height: 36px; font-size: ${ICON.md}px; }
`;

const CardBody = styled.div`flex: 1; min-width: 0; display: flex; flex-direction: column;`;
const CardNameRow = styled.div`display: flex; align-items: center; gap: ${SP.xs}; flex-wrap: wrap;`;

const CardName = styled.span<{ $unlocked: boolean; $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$unlocked ? p.$color : C.textSub)};
`;

const CompletionBadge = styled.span<{ $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; line-height: 1.3;
  padding: ${SP.xs} ${SP.sm};
  background: ${C.panel};
  border: 2px solid ${C.ink};
  color: ${p => p.$color};
`;

const UnlockedMark = styled.span<{ $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$color};
`;

const CardDesc = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim};
  word-break: keep-all;
`;

const CardBottom = styled.div`display: flex; align-items: center; gap: ${SP.sm}; margin-top: ${SP.xs};`;

const MiniBar = styled.div`
  flex: 1; max-width: 140px; height: 8px;
  background: ${C.panel};
  border: 2px solid ${C.ink};
  overflow: hidden;

  ${media.mobile} { max-width: 100px; }
`;
const MiniFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => p.$color};
`;
const ProgressTxt = styled.span`font-size: ${FONT.sm}; color: ${C.textDim};`;
const APEarned = styled.span<{ $color: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$color};
`;

const LoadingMsg = styled.div`
  text-align: center; padding: ${SP.xxl} ${SP.lg};
  color: ${C.textSub}; font-size: ${FONT.sm};
`;

const EmptyMsg = styled.div`
  text-align: center; padding: ${SP.xxl} ${SP.lg};
  color: ${C.textDim}; font-size: ${FONT.sm};
`;
