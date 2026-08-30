// src/components/modals/Rankings.tsx
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { lMedia, media } from '../../utils/responsive.utils';
import { Emoji } from '../shared/Emoji';
import {
  databaseService, APRankingEntry, CardRankingEntry, QuizRankingEntry,
  PvpSeasonRankingEntry, QuizSpeedRankingEntry, QuizWeeklyEntry,
} from '../../services/DatabaseService';
import { QuizBoardKey, availableBoardKeys } from '../../types/quiz';
import { authService } from '../../services/AuthService';
import { quotaGuard } from '../../services/QuotaGuard';
import { saveService } from '../../services/SaveService';
import { cardService } from '../../services/CardService';
import { quizService } from '../../services/QuizService';
import { daysUntilSeasonReset } from '../../utils/season';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, btnThin, sunken, pixelBold } from '../../styles/pixel';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  modalPadX, MODAL_PAD_X, MODAL_PAD_X_M, ModalTabBtn, ModalChipBtn,
  ModalBody, MODAL_ACCENT,
} from '../shared/modal.styles';

type RankTab = 'ap' | 'pvp' | 'tower' | 'cardpvp' | 'collection' | 'quiz';
/** 퀴즈 탭 하위 보드 — 싱글(모의고사 통산) · 멀티(속도전 통산) · 주간(종목별). */
type QuizSubTab = 'single' | 'multi' | 'weekly';

interface RankingsProps {
  onClose: () => void;
  initialTab?: RankTab;
}

export const Rankings = ({ onClose, initialTab = 'ap' }: RankingsProps) => {
  const { t, language } = useTranslation();

  const [activeTab, setActiveTab] = useState<RankTab>(initialTab);
  const [apRankings, setApRankings] = useState<APRankingEntry[]>([]);
  const [myApRank, setMyApRank] = useState<number | null>(null);
  const [pvpRankings, setPvpRankings] = useState<any[]>([]);
  const [myPvpRank, setMyPvpRank] = useState<number | null>(null);
  const [cardRankings, setCardRankings] = useState<CardRankingEntry[]>([]);
  const [myCardRank, setMyCardRank] = useState<number | null>(null);
  const [quizRankings, setQuizRankings] = useState<QuizRankingEntry[]>([]);
  const [myQuizRank, setMyQuizRank] = useState<number | null>(null);
  const [quizSub, setQuizSub] = useState<QuizSubTab>('single');
  /** 주간 보드에서 보고 있는 종목. 종목이 17개라 한 번에 하나씩만 읽는다([FREE-TIER]). */
  const [weeklyBoard, setWeeklyBoard] = useState<QuizBoardKey>('exam');
  const [quizSpeedRankings, setQuizSpeedRankings] = useState<QuizSpeedRankingEntry[]>([]);
  const [myQuizSpeedRank, setMyQuizSpeedRank] = useState<number | null>(null);
  const [quizWeeklyRankings, setQuizWeeklyRankings] = useState<QuizWeeklyEntry[]>([]);
  const [myQuizWeeklyRank, setMyQuizWeeklyRank] = useState<number | null>(null);
  const [cardPvpRankings, setCardPvpRankings] = useState<PvpSeasonRankingEntry[]>([]);
  const [myCardPvpRank, setMyCardPvpRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  // [FREE-TIER] 무료 쿼터 소진 상태 — 빈 랭킹과 구분해 안내한다.
  const [quotaBlocked, setQuotaBlocked] = useState(() => quotaGuard.isTripped());
  const PAGE_SIZE = 10;

  useEffect(() => quotaGuard.onChange(setQuotaBlocked), []);

  const loadRankings = async () => {
    setLoading(true);
    try {
      if (activeTab === 'ap') {
        const [data, rank] = await Promise.all([
          databaseService.getAPRanking(),
          databaseService.getMyAPRank(),
        ]);
        setApRankings(data);
        setMyApRank(rank);
      } else if (activeTab === 'pvp') {
        const [data, rank] = await Promise.all([
          databaseService.getPVPRanking(),
          databaseService.getMyPVPRank(),
        ]);
        setPvpRankings(data);
        setMyPvpRank(rank);
      } else if (activeTab === 'tower') {
        const [data, rank] = await Promise.all([
          databaseService.getTowerRanking(),
          databaseService.getMyTowerRank(),
        ]);
        setCardRankings(data);
        setMyCardRank(rank);
      } else if (activeTab === 'cardpvp') {
        const [data, rank] = await Promise.all([
          databaseService.getCardPvpRanking(),
          databaseService.getMyCardPvpRank(),
        ]);
        setCardPvpRankings(data);
        setMyCardPvpRank(rank);
      } else if (activeTab === 'quiz') {
        // 하위 보드 중 지금 보고 있는 것만 읽는다 — 세 보드를 한꺼번에 읽으면 read가 3배.
        if (quizSub === 'single') {
          const [data, rank] = await Promise.all([
            databaseService.getQuizRanking(),
            databaseService.getMyQuizRank(),
          ]);
          setQuizRankings(data);
          setMyQuizRank(rank);
        } else if (quizSub === 'multi') {
          const [data, rank] = await Promise.all([
            databaseService.getQuizSpeedRanking(),
            databaseService.getMyQuizSpeedRank(),
          ]);
          setQuizSpeedRankings(data);
          setMyQuizSpeedRank(rank);
        } else {
          const [data, rank] = await Promise.all([
            databaseService.getQuizWeeklyRanking(weeklyBoard),
            databaseService.getMyQuizWeeklyRank(weeklyBoard),
          ]);
          setQuizWeeklyRankings(data);
          setMyQuizWeeklyRank(rank);
        }
      } else {
        const [data, rank] = await Promise.all([
          databaseService.getCollectionRanking(),
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
  }, [activeTab, quizSub, weeklyBoard]);

  /** 주간 보드에서 선택 가능한 종목(영어권에서는 초성 제외). */
  const boardKeys = availableBoardKeys(language);
  /** 보드키 → 표시 이름. exam/speed는 각자 이름을, 나머지는 종목 이름을 쓴다. */
  const boardLabel = (k: QuizBoardKey) =>
    k === 'exam' ? t('quiz.exam.name') : k === 'speed' ? t('quiz.speed.name') : t(`quiz.types.${k}.name`);

  const currentRankings =
    activeTab === 'ap' ? apRankings :
    activeTab === 'pvp' ? pvpRankings :
    activeTab === 'cardpvp' ? cardPvpRankings :
    activeTab === 'quiz'
      ? (quizSub === 'single' ? quizRankings : quizSub === 'multi' ? quizSpeedRankings : quizWeeklyRankings)
      : cardRankings;
  const totalPages = Math.ceil(currentRankings.length / PAGE_SIZE);
  const displayedRankings = currentRankings.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="md" $accent={MODAL_ACCENT.cyan} onClick={(e) => e.stopPropagation()}>

        <ModalHeader>
          <ModalTitle><Emoji glyph="🏆" size={16} /> {t('rankings.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
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

        {quotaBlocked && (
          <QuotaNotice>
            <Emoji glyph="⚠️" size={13} /> {t('rankings.quotaNotice')}
          </QuotaNotice>
        )}

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
          <>
            <SubTabRow>
              <SubTab $active={quizSub === 'single'} onClick={() => setQuizSub('single')}>{t('rankings.quizSingle')}</SubTab>
              <SubTab $active={quizSub === 'multi'} onClick={() => setQuizSub('multi')}>{t('rankings.quizMulti')}</SubTab>
              <SubTab $active={quizSub === 'weekly'} onClick={() => setQuizSub('weekly')}>{t('rankings.quizWeekly')}</SubTab>
            </SubTabRow>

            {quizSub === 'weekly' && (
              <BoardPickRow>
                <BoardSelect value={weeklyBoard} onChange={e => setWeeklyBoard(e.target.value as QuizBoardKey)}>
                  {boardKeys.map(k => <option key={k} value={k}>{boardLabel(k)}</option>)}
                </BoardSelect>
              </BoardPickRow>
            )}

            <MyRankBadgeWrapper>
              {quizSub === 'single' && (
                <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myQuizRank !== null ? myQuizRank : '-' })} ({t('rankings.scoreSuffix', { n: quizService.getExamBest() })})</MyRankBadge>
              )}
              {quizSub === 'multi' && (
                <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myQuizSpeedRank !== null ? myQuizSpeedRank : '-' })} ({t('rankings.winsSuffix', { n: quizService.getSpeedStats().wins })})</MyRankBadge>
              )}
              {quizSub === 'weekly' && (
                <>
                  <MyRankBadge><Emoji glyph="🎯" size={13} /> {t('rankings.myRank', { rank: myQuizWeeklyRank !== null ? myQuizWeeklyRank : '-' })} ({t('rankings.scoreSuffix', { n: quizService.getWeeklyBest(weeklyBoard) })})</MyRankBadge>
                  <SeasonNote>{t('rankings.seasonNote', { n: daysUntilSeasonReset() })}</SeasonNote>
                </>
              )}
            </MyRankBadgeWrapper>
          </>
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
                    <ColRating>{t('rankings.colAchCount')}</ColRating>
                    <ColScore>{t('rankings.colAP')}</ColScore>
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
                    <ColScore>{quizSub === 'multi' ? t('rankings.colWins') : t('rankings.colScore')}</ColScore>
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
                          {quizSub === 'single' && <><Emoji glyph="🎓" size={13} /> {t('rankings.scoreSuffix', { n: entry.examBest ?? 0 })}</>}
                          {quizSub === 'multi' && <><Emoji glyph="⚡" size={13} /> {t('rankings.winsSuffix', { n: entry.wins ?? 0 })}</>}
                          {quizSub === 'weekly' && <><Emoji glyph="📅" size={13} /> {t('rankings.scoreSuffix', { n: entry.scores?.[weeklyBoard] ?? 0 })}</>}
                        </ColScore>
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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드/버튼, 알약 탭, uppercase eyebrow 헤더, hover 배경 전환,
//           둥근 모서리, 10~12px 미만 글자.

const PaginationRow = styled.div`
  display: flex; align-items: center; justify-content: center; gap: ${SP.md};
  margin-top: ${SP.md}; margin-bottom: ${SP.sm};
`;

const PageBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  display: flex; align-items: center; justify-content: center;
  &:focus, &:focus-visible { outline: none; }
`;

const PageInfo = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
  font-variant-numeric: tabular-nums;
`;

const MyRankBadgeWrapper = styled.div`
  ${modalPadX}
  margin-bottom: ${SP.md};
`;

const MyRankBadge = styled.div`
  ${winThin('blue')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm};
  padding: ${SP.sm} ${SP.md};
  color: ${C.blue}; font-size: ${FONT.sm};
`;

const SeasonNote = styled.div`
  margin-top: ${SP.xs}; font-size: ${FONT.sm}; color: ${C.gold};
`;

// ─── 퀴즈 탭 하위 보드(싱글/멀티/주간) ────────────────────────────────────────
// 이 두 줄(하위탭·보드선택)은 ModalBody 바깥, 즉 **스크롤되지 않는 고정 헤더**다.
// 폰 가로(높이 ~390px)에서는 90vh 안에서 목록이 보일 자리를 그만큼 잡아먹으므로
// phoneSm에서 여백을 줄인다 — 안 그러면 주간 탭에서 순위가 3줄밖에 안 보인다.
const SubTabRow = styled.div`
  ${modalPadX}
  display: flex; gap: ${SP.xs}; margin-bottom: ${SP.sm};
  ${lMedia.phoneSm} { margin-bottom: ${SP.xs}; }
`;

/** 하위 탭 — 고른 순위표 안을 나눈다(싱글/멀티/주간). 주 탭보다 한 단계 작다. */
const SubTab = styled(ModalChipBtn).attrs<{ $active?: boolean }>(p => ({
  $on: p.$active, $c: 'blue' as const,
}))`
  flex: 1; justify-content: center;
`;

const BoardPickRow = styled.div`
  ${modalPadX}
  margin-bottom: ${SP.sm};
  ${lMedia.phoneSm} { margin-bottom: ${SP.xs}; }
`;

const BoardSelect = styled.select`
  ${sunken()}
  ${pixelBold}
  width: 100%; padding: ${SP.sm} ${SP.md}; cursor: pointer;
  font-size: ${FONT.sm}; color: ${C.text}; outline: none;
  &:focus { outline: none; }
  /* 네이티브 드롭다운은 OS 배경을 쓰므로 옵션 색을 명시하지 않으면 흰 배경에 흰 글씨가 된다. */
  & option { background: ${C.panelSunk}; color: ${C.text}; }
`;

/* [FREE-TIER] 무료 쿼터 소진으로 최신 데이터를 못 받는 상태를 '빈 목록'과 구분해 알린다. */
const QuotaNotice = styled.div`
  ${winThin('gold')}
  display: flex; align-items: flex-start; gap: ${SP.xs};
  margin: 0 0 ${SP.sm}; padding: ${SP.sm} ${SP.md};
  color: ${C.gold}; font-size: ${FONT.sm};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

const StatusMsg = styled.div<{ $dimmed?: boolean }>`
  display: flex; align-items: center; justify-content: center;
  color: ${p => (p.$dimmed ? C.textDim : C.textSub)};
  font-size: ${FONT.sm}; padding: ${SP.xxl};
`;

const COLS_D_AP = '72px 1fr 130px 150px';
const COLS_T_AP = '56px 1fr 100px 110px';
const COLS_M_AP = '40px 1fr 90px';

const COLS_D_PVP = '72px 1fr 150px';
const COLS_T_PVP = '56px 1fr 110px';
const COLS_M_PVP = '40px 1fr 90px';

const TabRow = styled.div`
  ${modalPadX}
  display: flex; gap: ${SP.xs}; margin-bottom: ${SP.xs};
  /* 탭 4개 — 좁은 화면에서 가로 넘침 방지(가로 스크롤 폴백). */
  overflow-x: auto; flex-wrap: nowrap;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  & > * { flex: 0 0 auto; }
`;

/** 주 탭 — 어떤 순위표를 볼까. */
const Tab = styled(ModalTabBtn).attrs<{ $active?: boolean }>(p => ({
  $on: p.$active, $c: 'blue' as const,
}))``;

/* 표는 좌우로 여백만큼 들어와 선다 — 본문 글과 좌변이 맞아야 한다. */
const RankingTable = styled.div`
  margin: 0 ${MODAL_PAD_X} ${SP.lg};
  border: ${SCALE}px solid ${C.ink};
  overflow: hidden;
  ${media.mobile}   { margin: 0 ${MODAL_PAD_X_M} ${SP.md}; }
  ${lMedia.phoneSm} { margin: 0 ${MODAL_PAD_X_M} ${SP.md}; }
`;

/** uppercase eyebrow를 걷어낸 자리 — 파인 띠에 골드 라벨. */
const TableHead = styled.div<{ $isAp?: boolean }>`
  ${pixelBold}
  display: grid; grid-template-columns: ${p => (p.$isAp ? COLS_D_AP : COLS_D_PVP)};
  gap: ${SP.md}; padding: ${SP.sm} ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  font-size: ${FONT.sm}; color: ${C.gold};
  ${media.tablet}   { grid-template-columns: ${p => (p.$isAp ? COLS_T_AP : COLS_T_PVP)}; gap: ${SP.sm}; }
  ${media.mobile}   { grid-template-columns: ${p => (p.$isAp ? COLS_M_AP : COLS_M_PVP)}; gap: ${SP.xs}; padding: ${SP.xs} ${SP.sm}; }
  ${lMedia.phone}   { grid-template-columns: ${p => (p.$isAp ? COLS_T_AP : COLS_T_PVP)}; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { grid-template-columns: ${p => (p.$isAp ? COLS_M_AP : COLS_M_PVP)}; gap: ${SP.xs}; }
`;

const TableRow = styled.div<{ $top?: boolean; $isAp?: boolean }>`
  display: grid; grid-template-columns: ${p => (p.$isAp ? COLS_D_AP : COLS_D_PVP)};
  gap: ${SP.md}; padding: ${SP.sm} ${SP.md}; align-items: center;
  border-bottom: 2px solid ${C.ink};
  background: ${p => (p.$top ? C.panelSunk : 'transparent')};
  &:last-child { border-bottom: none; }
  ${media.tablet}   { grid-template-columns: ${p => (p.$isAp ? COLS_T_AP : COLS_T_PVP)}; gap: ${SP.sm}; }
  ${media.mobile}   { grid-template-columns: ${p => (p.$isAp ? COLS_M_AP : COLS_M_PVP)}; gap: ${SP.xs}; padding: ${SP.xs} ${SP.sm}; }
  ${lMedia.phone}   { grid-template-columns: ${p => (p.$isAp ? COLS_T_AP : COLS_T_PVP)}; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { grid-template-columns: ${p => (p.$isAp ? COLS_M_AP : COLS_M_PVP)}; gap: ${SP.xs}; padding: ${SP.xs} ${SP.sm}; }
`;

const ColRank = styled.div<{ $idx?: number }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$idx !== undefined && p.$idx < 3 ? C.gold : C.textDim)};
`;

const ColPlayer = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

const ColRating = styled.div`
  font-size: ${FONT.sm}; color: ${C.gold};
  ${media.mobile}   { display: none; }
  ${lMedia.phoneSm} { display: none; }
`;

const ColScore = styled.div<{ $accent?: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm}; text-align: right;
  color: ${p => (p.$accent ? C.blue : C.textSub)};
  font-variant-numeric: tabular-nums;
`;
