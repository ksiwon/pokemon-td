// src/components/modals/Achievements.tsx
import React, { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
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
import { ModalOverlay, ModalBox, MODAL_ACCENT } from '../shared/modal.styles';

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
              <CloseBtn onClick={onClose}>✕</CloseBtn>
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

// ── 헤더
const ModalHeader = styled.div`
  padding: 18px 22px 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;

  ${media.tablet} { padding: 14px 16px 0; }
  ${media.mobile} { padding: 12px 12px 0; }
  ${lMedia.phoneSm} { padding: 10px 12px 0; }
`;

const HeaderTop = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;

  ${media.mobile} { margin-bottom: 8px; }
  ${lMedia.phoneSm} { margin-bottom: 6px; }
`;

const TitleArea = styled.div`display:flex;align-items:center;gap:12px;`;

const ModalTitle = styled.h2`
  font-size: 1.4rem; font-weight: 800; color: #FFD700;
  text-shadow: 0 0 20px rgba(255,215,0,0.4);

  ${media.tablet} { font-size: 1.25rem; }
  ${media.mobile} { font-size: 1.1rem; }
  ${lMedia.phoneSm} { font-size: 1.05rem; }
`;

const APBadge = styled.div`
  padding: 4px 12px; border-radius: 20px;
  background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.35);
  color: #FFD700; font-size: 13px; font-weight: 700;
  text-shadow: 0 0 8px rgba(255,215,0,0.4);

  ${media.mobile} { font-size: 11px; padding: 3px 9px; }
  ${lMedia.phoneSm} { font-size: 11px; padding: 3px 8px; }
`;

const HeaderActions = styled.div`display:flex;gap:8px;align-items:center;`;

const HiddenToggle = styled.button`
  padding: 5px 12px; font-size: 11px; border-radius: 16px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6);
  transition: all 0.2s;
  &:hover { background: rgba(255,255,255,0.10); color: #fff; }

  /* 모바일에서 텍스트 줄이기 */
  ${media.mobile} { padding: 4px 8px; font-size: 10px; }
`;

const CloseBtn = styled.button`
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7);
  cursor: pointer; font-size: 14px; display:flex;align-items:center;justify-content:center;
  transition: all 0.2s;
  &:hover { background: rgba(255,100,100,0.3); color:#fff; }
`;

// ── 진행 바
const ProgressArea = styled.div`
  margin-bottom: 10px;
  ${media.mobile} { margin-bottom: 7px; }
`;
const ProgressStats = styled.div`
  display: flex; justify-content: space-between;
  font-size: 11px; color: rgba(255,255,255,0.45); margin-bottom: 4px;
  ${media.mobile} { font-size: 10px; }
`;
const ProgressBarOuter = styled.div`
  height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;
`;
const ProgressBarInner = styled.div<{ $pct: number }>`
  height: 100%; width: ${p => p.$pct}%;
  background: linear-gradient(90deg, #FFD700, #FF8C00);
  border-radius: 3px; transition: width 0.6s ease;
`;

// ── 서브탭

// ── 카테고리 탭
const CategoryTabRow = styled.div`
  display:flex; gap:2px; overflow-x:auto; padding:10px 16px 0;
  flex-shrink:0;
  &::-webkit-scrollbar { height:3px; }
  &::-webkit-scrollbar-thumb { background:rgba(255,215,0,0.3); border-radius:2px; }

  ${media.tablet} { padding: 8px 12px 0; }
  ${media.mobile} { padding: 7px 10px 0; gap: 1px; }
  ${lMedia.phoneSm} { padding: 6px 10px 0; }
`;
const CatTab = styled.button<{ $active: boolean }>`
  display:flex;align-items:center;gap:4px; white-space:nowrap;
  padding: 6px 12px; font-size: 11px; font-weight: 700;
  border:none; border-radius:8px 8px 0 0; cursor:pointer; transition:all 0.2s;
  background: ${p => p.$active ? 'rgba(255,255,255,0.08)' : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.35)'};
  border-bottom: 2px solid ${p => p.$active ? 'rgba(255,255,255,0.4)' : 'transparent'};
  &:hover { color:#fff; }

  ${media.mobile} { padding: 5px 9px; font-size: 10px; }
  ${lMedia.phoneSm} { padding: 5px 9px; font-size: 10px; }
`;
const TabBadge = styled.span`
  font-size: 9px; padding: 1px 5px; background:rgba(255,255,255,0.10); border-radius:6px;
`;

// ── 업적 스크롤
const AchievementScroll = styled.div`
  flex:1; overflow-y:auto; padding:12px 16px 20px;
  display:flex; flex-direction:column; gap:16px;
  &::-webkit-scrollbar { width:5px; }
  &::-webkit-scrollbar-thumb { background:rgba(255,215,0,0.25); border-radius:3px; }

  ${media.tablet} { padding: 10px 14px 16px; gap: 12px; }
  ${media.mobile} { padding: 8px 10px 16px; gap: 10px; }
  ${lMedia.phoneSm} { padding: 8px 10px 14px; gap: 8px; }
`;


// ── 티어 섹션
const TierSection = styled.div`display:flex;flex-direction:column;gap:8px;
  ${media.mobile} { gap: 6px; }
`;
const TierHeader = styled.div<{ $color: string }>`
  display:flex;align-items:center;justify-content:space-between;
  padding: 4px 8px;
  border-left: 3px solid ${p => p.$color};
  padding-left: 12px;
`;
const TierLabel = styled.span`font-size:13px;font-weight:800;color:rgba(255,255,255,0.85);
  ${media.mobile} { font-size: 12px; }
`;
const TierPts = styled.span`font-size:11px;color:rgba(255,255,255,0.35);
  ${media.mobile} { font-size: 10px; }
`;

/**
 * TierGrid:
 *  데스크탑: auto-fill minmax(320px, 1fr) → 2~3열
 *  태블릿 세로: 2열 (minmax 220px)
 *  모바일 세로: 1열
 *  태블릿 가로: 2열
 *  폰 가로: 1열
 */
const TierGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 8px;

  ${media.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 7px;
  }
  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  ${lMedia.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  ${lMedia.phoneSm} {
    grid-template-columns: 1fr;
    gap: 5px;
  }
`;

// ── 업적 카드
const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

const AchCard = styled.div<{
  $unlocked: boolean;
  $tier: string;
  $borderColor: string;
  $bgColor: string;
}>`
  display:flex; gap:12px; padding:12px 14px;
  border-radius:12px;
  border: 1px solid ${p => p.$unlocked ? p.$borderColor : 'rgba(255,255,255,0.07)'};
  background: ${p => p.$unlocked ? p.$bgColor : 'rgba(255,255,255,0.025)'};
  opacity: ${p => p.$unlocked ? 1 : 0.65};
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  position: relative; overflow: hidden;

  ${p => p.$unlocked && css`
    &::before {
      content: '';
      position: absolute; inset: 0;
      background: linear-gradient(
        105deg,
        transparent 40%,
        rgba(255,255,255,0.04) 50%,
        transparent 60%
      );
      background-size: 200% 100%;
      animation: ${shimmer} 3s linear infinite;
    }
  `}

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    opacity: 1;
  }

  ${media.mobile} { padding: 10px 12px; gap: 10px; border-radius: 10px; }
  ${lMedia.phoneSm} { padding: 9px 11px; gap: 9px; }
`;

const CardIcon = styled.div<{ $unlocked: boolean; $tier: string; $color: string }>`
  flex-shrink:0;
  width:44px; height:44px; font-size:24px;
  display:flex; align-items:center; justify-content:center;
  border-radius:10px;
  background: ${p => p.$unlocked
    ? `rgba(${p.$color.replace('#','').match(/.{2}/g)!.map(h=>parseInt(h,16)).join(',')}, 0.15)`
    : 'rgba(255,255,255,0.05)'};
  filter: ${p => p.$unlocked ? 'none' : 'grayscale(70%)'};

  ${media.mobile} { width: 38px; height: 38px; font-size: 20px; }
  ${lMedia.phoneSm} { width: 36px; height: 36px; font-size: 19px; }
`;

const CardBody = styled.div`flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;`;
const CardNameRow = styled.div`display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;

const CardName = styled.span<{ $unlocked: boolean; $color: string }>`
  font-size:13px; font-weight:700;
  color: ${p => p.$unlocked ? p.$color : 'rgba(255,255,255,0.7)'};
  ${media.mobile} { font-size: 12px; }
`;

const CompletionBadge = styled.span<{ $color: string }>`
  font-size:11px; font-weight:800; padding:1px 7px; border-radius:10px;
  background:rgba(255,255,255,0.08); color: ${p => p.$color};
  border: 1px solid ${p => p.$color}44;
`;

const UnlockedMark = styled.span<{ $color: string }>`
  font-size:11px; font-weight:700;
  color: ${p => p.$color}; opacity:0.8;
`;

const CardDesc = styled.div`
  font-size:11px;color:rgba(255,255,255,0.4);line-height:1.4;
  ${media.mobile} { font-size: 10.5px; }
`;

const CardBottom = styled.div`display:flex;align-items:center;gap:8px;margin-top:4px;`;

const MiniBar = styled.div`
  flex:1; max-width:140px; height:4px;
  background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;

  ${media.mobile} { max-width: 100px; }
`;
const MiniFill = styled.div<{ $pct: number; $color: string }>`
  height:100%; width:${p => p.$pct}%;
  background:${p => p.$color}; border-radius:2px; transition:width 0.4s ease;
`;
const ProgressTxt = styled.span`font-size:10px;color:rgba(255,255,255,0.3);`;
const APEarned = styled.span<{ $color: string }>`
  font-size:11px;font-weight:700;color:${p => p.$color};
  text-shadow:0 0 8px ${p => p.$color}66;
`;

// ── 랭킹

/**
 * 랭킹 헤더/행 컬럼:
 *  데스크탑: 60px 1fr 100px 100px (4열)
 *  태블릿:   44px 1fr 80px 80px   (4열, 축소)
 *  모바일:   44px 1fr 80px        (3열 — Count 숨김)
 */





/**
 * RankStat: 모바일 세로 + 폰 가로에서 숨겨 3열 레이아웃 유지
 */

const LoadingMsg = styled.div`
  text-align: center; padding: 48px 24px;
  color: rgba(255,255,255,0.5); font-size: 15px;
`;

const EmptyMsg = styled.div`
  text-align: center; padding: 48px 24px;
  color: rgba(255,255,255,0.35); font-size: 14px;
`;