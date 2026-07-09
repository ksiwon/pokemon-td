// src/components/modals/Rankings.tsx
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { lMedia, media } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import { databaseService, APRankingEntry, CardRankingEntry, QuizRankingEntry, PvpSeasonRankingEntry } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { saveService } from '../../services/SaveService';
import { cardService } from '../../services/CardService';
import { quizService } from '../../services/QuizService';
import { daysUntilSeasonReset } from '../../utils/season';
import { useTranslation } from '../../i18n';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  ModalBody, MODAL_ACCENT,
} from '../shared/modal.styles';

type RankTab = 'ap' | 'pvp' | 'tower' | 'cardpvp' | 'collection' | 'quiz';

interface RankingsProps {
  onClose: () => void;
  initialTab?: RankTab;
}

export const Rankings = ({ onClose, initialTab = 'ap' }: RankingsProps) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<RankTab>(initialTab);
  const [apRankings, setApRankings] = useState<APRankingEntry[]>([]);
  const [myApRank, setMyApRank] = useState<number | null>(null);
  const [pvpRankings, setPvpRankings] = useState<any[]>([]);
  const [myPvpRank, setMyPvpRank] = useState<number | null>(null);
  const [cardRankings, setCardRankings] = useState<CardRankingEntry[]>([]);
  const [myCardRank, setMyCardRank] = useState<number | null>(null);
  const [quizRankings, setQuizRankings] = useState<QuizRankingEntry[]>([]);
  const [myQuizRank, setMyQuizRank] = useState<number | null>(null);
  const [cardPvpRankings, setCardPvpRankings] = useState<PvpSeasonRankingEntry[]>([]);
  const [myCardPvpRank, setMyCardPvpRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 10;

  const loadRankings = async () => {
    setLoading(true);
    try {
      if (activeTab === 'ap') {
        const [data, rank] = await Promise.all([
          databaseService.getAPRanking(100),
          databaseService.getMyAPRank(),
        ]);
        setApRankings(data);
        setMyApRank(rank);
      } else if (activeTab === 'pvp') {
        const [data, rank] = await Promise.all([
          databaseService.getPVPRanking(100),
          databaseService.getMyPVPRank(),
        ]);
        setPvpRankings(data);
        setMyPvpRank(rank);
      } else if (activeTab === 'tower') {
        const [data, rank] = await Promise.all([
          databaseService.getTowerRanking(100),
          databaseService.getMyTowerRank(),
        ]);
        setCardRankings(data);
        setMyCardRank(rank);
      } else if (activeTab === 'cardpvp') {
        const [data, rank] = await Promise.all([
          databaseService.getCardPvpRanking(100),
          databaseService.getMyCardPvpRank(),
        ]);
        setCardPvpRankings(data);
        setMyCardPvpRank(rank);
      } else if (activeTab === 'quiz') {
        const [data, rank] = await Promise.all([
          databaseService.getQuizRanking(100),
          databaseService.getMyQuizRank(),
        ]);
        setQuizRankings(data);
        setMyQuizRank(rank);
      } else {
        const [data, rank] = await Promise.all([
          databaseService.getCollectionRanking(100),
          databaseService.getMyCollectionRank(),
        ]);
        setCardRankings(data);
        setMyCardRank(rank);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(0);
    loadRankings();
  }, [activeTab]);

  const currentRankings =
    activeTab === 'ap' ? apRankings :
    activeTab === 'pvp' ? pvpRankings :
    activeTab === 'cardpvp' ? cardPvpRankings :
    activeTab === 'quiz' ? quizRankings :
    cardRankings;
  const totalPages = Math.ceil(currentRankings.length / PAGE_SIZE);
  const displayedRankings = currentRankings.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="md" $accent={MODAL_ACCENT.cyan} onClick={(e) => e.stopPropagation()}>

        <ModalHeader>
          <ModalTitle><Emoji glyph="🏆" size={16} /> {t('rankings.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}><Emoji glyph="❌" size={14} /></ModalCloseBtn>
        </ModalHeader>

        {/* ── 탭 ── */}
        <TabRow>
          <Tab $active={activeTab === 'ap'} onClick={() => setActiveTab('ap')}>
            {t('rankings.tabAP')}
          </Tab>
          <Tab $active={activeTab === 'pvp'} onClick={() => setActiveTab('pvp')}>
            {t('rankings.tabRating')}
          </Tab>
          <Tab $active={activeTab === 'tower'} onClick={() => setActiveTab('tower')}>
            {t('rankings.tabTower')}
          </Tab>
          <Tab $active={activeTab === 'cardpvp'} onClick={() => setActiveTab('cardpvp')}>
            {t('rankings.tabCardPvp')}
          </Tab>
          <Tab $active={activeTab === 'collection'} onClick={() => setActiveTab('collection')}>
            {t('rankings.tabCollection')}
          </Tab>
          <Tab $active={activeTab === 'quiz'} onClick={() => setActiveTab('quiz')}>
            {t('rankings.tabQuiz')}
          </Tab>
        </TabRow>

        {activeTab === 'ap' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myApRank !== null ? myApRank : '-' })} ({saveService.load().totalAP} AP)</MyRankBadge>
          </MyRankBadgeWrapper>
        )}

        {activeTab === 'pvp' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myPvpRank !== null ? myPvpRank : '-' })} ({authService.getCurrentUser()?.rating ?? 1000} Rating)</MyRankBadge>
          </MyRankBadgeWrapper>
        )}

        {activeTab === 'tower' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myCardRank !== null ? myCardRank : '-' })} ({t('rankings.floorSuffix', { n: cardService.getWeeklyBestFloor() })})</MyRankBadge>
            <SeasonNote>{t('rankings.seasonNote', { n: daysUntilSeasonReset() })}</SeasonNote>
          </MyRankBadgeWrapper>
        )}

        {activeTab === 'cardpvp' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myCardPvpRank !== null ? myCardPvpRank : '-' })} ({t('rankings.winsSuffix', { n: cardService.getWeeklyPvpWins() })})</MyRankBadge>
            <SeasonNote>{t('rankings.seasonNote', { n: daysUntilSeasonReset() })}</SeasonNote>
          </MyRankBadgeWrapper>
        )}

        {activeTab === 'collection' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myCardRank !== null ? myCardRank : '-' })} ({t('rankings.dexSuffix', { n: cardService.getOwnedCount() })})</MyRankBadge>
          </MyRankBadgeWrapper>
        )}

        {activeTab === 'quiz' && (
          <MyRankBadgeWrapper>
            <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myQuizRank !== null ? myQuizRank : '-' })} ({t('rankings.scoreSuffix', { n: quizService.getExamBest() })})</MyRankBadge>
          </MyRankBadgeWrapper>
        )}
        
        <ModalBody>
          {loading ? (
            <StatusMsg>{t('rankings.loading')}</StatusMsg>
          ) : currentRankings.length === 0 ? (
            <StatusMsg $dimmed>{t('rankings.empty')}</StatusMsg>
          ) : (
            <>
              {activeTab === 'ap' ? (
                <RankingTable>
                  <TableHead $isAp={true}>
                    <ColRank>{t('rankings.colRank')}</ColRank>
                    <ColPlayer>{t('rankings.colPlayer')}</ColPlayer>
                    <ColRating>{t('rankings.colAchCount') ?? '달성 수'}</ColRating>
                    <ColScore>{t('rankings.colAP') ?? 'AP'}</ColScore>
                  </TableHead>
                  {displayedRankings.map((entry, index) => {
                    const rank = currentPage * PAGE_SIZE + index;
                    return (
                      <TableRow key={entry.userId} $top={rank < 3} $isAp={true}>
                        <ColRank $idx={rank}>
                          {rank < 3
                            ? <Emoji glyph={rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'} size={16} />
                            : t('rankings.rankSuffix', { rank: rank + 1 })}
                        </ColRank>
                        <ColPlayer>{entry.userName ?? '???'}</ColPlayer>
                        <ColRating><Emoji glyph="🏅" size={13} /> {entry.achievementCount}</ColRating>
                        <ColScore $accent>{entry.totalAP.toLocaleString()} AP</ColScore>
                      </TableRow>
                    );
                  })}
                </RankingTable>
              ) : activeTab === 'pvp' ? (
                <RankingTable>
                  <TableHead $isAp={false}>
                    <ColRank>{t('rankings.colRank')}</ColRank>
                    <ColPlayer>{t('rankings.colPlayer')}</ColPlayer>
                    <ColScore>{t('rankings.colRating')}</ColScore>
                  </TableHead>
                  {displayedRankings.map((entry, index) => {
                    const rank = currentPage * PAGE_SIZE + index;
                    return (
                      <TableRow key={entry.userId} $top={rank < 3} $isAp={false}>
                        <ColRank $idx={rank}>
                          {rank < 3
                            ? <Emoji glyph={rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'} size={16} />
                            : t('rankings.rankSuffix', { rank: rank + 1 })}
                        </ColRank>
                        <ColPlayer>{entry.userName ?? '???'}</ColPlayer>
                        <ColScore $accent><Emoji glyph="⭐" size={13} /> {(entry.rating ?? 1000).toLocaleString()}</ColScore>
                      </TableRow>
                    );
                  })}
                </RankingTable>
              ) : activeTab === 'cardpvp' ? (
                <RankingTable>
                  <TableHead $isAp={false}>
                    <ColRank>{t('rankings.colRank')}</ColRank>
                    <ColPlayer>{t('rankings.colPlayer')}</ColPlayer>
                    <ColScore>{t('rankings.colWins')}</ColScore>
                  </TableHead>
                  {displayedRankings.map((entry, index) => {
                    const rank = currentPage * PAGE_SIZE + index;
                    return (
                      <TableRow key={entry.userId} $top={rank < 3} $isAp={false}>
                        <ColRank $idx={rank}>
                          {rank < 3
                            ? <Emoji glyph={rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'} size={16} />
                            : t('rankings.rankSuffix', { rank: rank + 1 })}
                        </ColRank>
                        <ColPlayer>{entry.userName ?? '???'}</ColPlayer>
                        <ColScore $accent><Emoji glyph="⚔️" size={13} /> {t('rankings.winsSuffix', { n: entry.wins ?? 0 })}</ColScore>
                      </TableRow>
                    );
                  })}
                </RankingTable>
              ) : activeTab === 'quiz' ? (
                <RankingTable>
                  <TableHead $isAp={false}>
                    <ColRank>{t('rankings.colRank')}</ColRank>
                    <ColPlayer>{t('rankings.colPlayer')}</ColPlayer>
                    <ColScore>{t('rankings.colScore')}</ColScore>
                  </TableHead>
                  {displayedRankings.map((entry, index) => {
                    const rank = currentPage * PAGE_SIZE + index;
                    return (
                      <TableRow key={entry.userId} $top={rank < 3} $isAp={false}>
                        <ColRank $idx={rank}>
                          {rank < 3
                            ? <Emoji glyph={rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'} size={16} />
                            : t('rankings.rankSuffix', { rank: rank + 1 })}
                        </ColRank>
                        <ColPlayer>{entry.userName ?? '???'}</ColPlayer>
                        <ColScore $accent><Emoji glyph="🎓" size={13} /> {t('rankings.scoreSuffix', { n: entry.examBest ?? 0 })}</ColScore>
                      </TableRow>
                    );
                  })}
                </RankingTable>
              ) : (
                <RankingTable>
                  <TableHead $isAp={false}>
                    <ColRank>{t('rankings.colRank')}</ColRank>
                    <ColPlayer>{t('rankings.colPlayer')}</ColPlayer>
                    <ColScore>{activeTab === 'tower' ? t('rankings.colFloor') : t('rankings.colDex')}</ColScore>
                  </TableHead>
                  {displayedRankings.map((entry, index) => {
                    const rank = currentPage * PAGE_SIZE + index;
                    return (
                      <TableRow key={entry.userId} $top={rank < 3} $isAp={false}>
                        <ColRank $idx={rank}>
                          {rank < 3
                            ? <Emoji glyph={rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'} size={16} />
                            : t('rankings.rankSuffix', { rank: rank + 1 })}
                        </ColRank>
                        <ColPlayer>{entry.userName ?? '???'}</ColPlayer>
                        <ColScore $accent>
                          {activeTab === 'tower'
                            ? <><Emoji glyph="🗼" size={13} /> {t('rankings.floorSuffix', { n: entry.towerFloor ?? 0 })}</>
                            : <><Emoji glyph="📖" size={13} /> {t('rankings.dexSuffix', { n: entry.collectionCount ?? 0 })}</>}
                        </ColScore>
                      </TableRow>
                    );
                  })}
                </RankingTable>
              )}

              {totalPages > 1 && (
                <PaginationRow>
                  <PageBtn onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0}>
                    ◀
                  </PageBtn>
                  <PageInfo>{currentPage + 1} / {totalPages}</PageInfo>
                  <PageBtn onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))} disabled={currentPage === totalPages - 1}>
                    ▶
                  </PageBtn>
                </PaginationRow>
              )}
            </>
          )}
        </ModalBody>

      </ModalBox>
    </ModalOverlay>
  );
};

// ─── Local Styled Components ──────────────────────────────────────────────────

const PaginationRow = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 16px;
  margin-top: 16px; margin-bottom: 8px;
`;

const PageBtn = styled.button`
  padding: 6px 14px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  color: #fff; cursor: pointer; font-size: 13px; font-weight: bold;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &:not(:disabled):hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }
  ${media.mobile} { padding: 5px 12px; font-size: 12px; }
`;

const PageInfo = styled.span`
  font-size: 13px; color: rgba(255,255,255,0.55); font-weight: 700;
  font-variant-numeric: tabular-nums;
  ${media.mobile} { font-size: 12px; }
`;

const MyRankBadgeWrapper = styled.div`
  padding: 0 24px;
  margin-bottom: 12px;

  ${media.tablet} { padding: 0 18px; }
  ${media.mobile} { padding: 0 14px; margin-bottom: 10px; }
  ${lMedia.phoneSm} { padding: 0 12px; }
`;

const MyRankBadge = styled.div`
  display: flex; align-items: center; gap: 8px;
  margin-top: 0; padding: 9px 14px;
  background: rgba(79,195,247,0.08); border: 1px solid rgba(79,195,247,0.22);
  border-radius: 8px; color: #4fc3f7; font-size: 14px; font-weight: 700;
  ${media.mobile} { font-size: 13px; padding: 7px 12px; margin-top: 0; }
`;

const SeasonNote = styled.div`
  margin-top: 6px; font-size: 12px; font-weight: 600; color: rgba(251,191,36,0.85);
  ${media.mobile} { font-size: 11px; }
`;

const StatusMsg = styled.div<{ $dimmed?: boolean }>`
  display: flex; align-items: center; justify-content: center;
  color: ${p => p.$dimmed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)'};
  font-size: 15px; padding: 48px;
  ${media.mobile} { padding: 32px; font-size: 13px; }
`;

const COLS_D_AP = '72px 1fr 130px 150px';
const COLS_T_AP = '56px 1fr 100px 110px';
const COLS_M_AP = '40px 1fr 90px';

const COLS_D_PVP = '72px 1fr 150px';
const COLS_T_PVP = '56px 1fr 110px';
const COLS_M_PVP = '40px 1fr 90px';

const TabRow = styled.div`
  display: flex; gap: 4px; margin-bottom: 6px;
  padding: 0 24px;
  /* 탭 4개 — 좁은 화면에서 가로 넘침 방지(가로 스크롤 폴백). */
  overflow-x: auto; flex-wrap: nowrap;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  & > * { flex: 0 0 auto; }

  ${media.tablet} { padding: 0 18px; }
  ${media.mobile} { margin-bottom: 4px; padding: 0 14px; }
  ${lMedia.phoneSm} { padding: 0 12px; }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 8px 18px; font-size: 14px; font-weight: bold;
  border: none; border-radius: 10px 10px 0 0; cursor: pointer;
  transition: background 0.2s, color 0.2s;
  background: ${p => p.$active ? 'rgba(79,195,247,0.18)' : 'rgba(255,255,255,0.06)'};
  color: ${p => p.$active ? '#4fc3f7' : 'rgba(255,255,255,0.5)'};
  border-bottom: ${p => p.$active ? '2px solid #4fc3f7' : '2px solid transparent'};
  @media (hover: hover) { &:hover { background: rgba(79,195,247,0.12); color: #4fc3f7; } }

  ${media.tablet} { padding: 7px 14px; font-size: 13px; }
  ${media.mobile} { padding: 6px 10px; font-size: 11.5px; border-radius: 8px 8px 0 0; }
  ${lMedia.phoneSm} { padding: 5px 10px; font-size: 11px; }
`;

const RankingTable = styled.div`
  margin: 0 24px 20px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; overflow: hidden;
  ${media.mobile} { margin: 0 14px 16px; border-radius: 10px; }
`;

const TableHead = styled.div<{ $isAp?: boolean }>`
  display: grid; grid-template-columns: ${p => p.$isAp ? COLS_D_AP : COLS_D_PVP};
  gap: 12px; padding: 10px 16px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.35);
  text-transform: uppercase; letter-spacing: 0.08em;
  ${media.tablet} { grid-template-columns: ${p => p.$isAp ? COLS_T_AP : COLS_T_PVP}; gap: 8px; }
  ${media.mobile} { grid-template-columns: ${p => p.$isAp ? COLS_M_AP : COLS_M_PVP}; gap: 6px; padding: 8px 12px; font-size: 10px; }
  ${lMedia.phone} { grid-template-columns: ${p => p.$isAp ? COLS_T_AP : COLS_T_PVP}; gap: 8px; }
  ${lMedia.phoneSm} { grid-template-columns: ${p => p.$isAp ? COLS_M_AP : COLS_M_PVP}; gap: 6px; font-size: 10px; }
`;

const TableRow = styled.div<{ $top?: boolean; $isAp?: boolean }>`
  display: grid; grid-template-columns: ${p => p.$isAp ? COLS_D_AP : COLS_D_PVP};
  gap: 12px; padding: 10px 16px; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: ${p => p.$top ? 'rgba(255,215,0,0.025)' : 'transparent'};
  transition: background 0.15s;
  @media (hover:hover) { &:hover { background: rgba(255,255,255,0.04); } }
  &:last-child { border-bottom: none; }
  ${media.tablet} { grid-template-columns: ${p => p.$isAp ? COLS_T_AP : COLS_T_PVP}; gap: 8px; }
  ${media.mobile} { grid-template-columns: ${p => p.$isAp ? COLS_M_AP : COLS_M_PVP}; gap: 6px; padding: 8px 12px; }
  ${lMedia.phone} { grid-template-columns: ${p => p.$isAp ? COLS_T_AP : COLS_T_PVP}; gap: 8px; }
  ${lMedia.phoneSm} { grid-template-columns: ${p => p.$isAp ? COLS_M_AP : COLS_M_PVP}; gap: 6px; padding: 7px 10px; }
`;

const ColRank = styled.div<{ $idx?: number }>`
  font-size: ${p => (p.$idx !== undefined && p.$idx < 3) ? '18px' : '13px'};
  font-weight: 700;
  color: ${p => (p.$idx !== undefined && p.$idx < 3) ? '#FFD700' : 'rgba(255,255,255,0.4)'};
  ${media.mobile} { font-size: 13px; }
`;

const ColPlayer = styled.div`
  font-size: 14px; font-weight: 600; color: #e8edf3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${media.mobile} { font-size: 13px; }
`;

const ColRating = styled.div`
  font-size: 13px; color: #f1c40f; font-weight: 600;
  ${media.mobile} { display: none; }
  ${lMedia.phoneSm} { display: none; }
`;

const ColScore = styled.div<{ $accent?: boolean }>`
  font-size: 14px; font-weight: 800; text-align: right;
  color: ${p => p.$accent ? '#4fc3f7' : 'rgba(255,255,255,0.7)'};
  font-variant-numeric: tabular-nums;
  ${media.mobile} { font-size: 13px; }
`;