// src/components/quiz/QuizView.tsx
// 포켓몬 퀴즈 허브 — 수능 모의고사 + 종목 선택 + 문항 수(10/30/50) + 최고점수/랭킹.

import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Ghost, Volume2, Search, Shapes, Swords, Hash, ScrollText, GraduationCap, Flame, Trophy, ChevronRight, Type, Languages, Combine, Lightbulb, Shuffle, Sparkles, SpellCheck, Zap, ArrowLeft } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody as Body, ScreenTitle as Title, ScreenTopBar as TopBar, SectionLabel } from '../shared/screen';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { winThin, btn, btnThin, pixelText, pixelBold, focusRing } from '../../styles/pixel';
import { QuizKind, QuizMode, availableQuizKinds, ROUND_SIZES, RANKED_ROUND_SIZE } from '../../types/quiz';
import { quizService } from '../../services/QuizService';
import { databaseService } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { QuizPlay } from './QuizPlay';
import { SpeedQuizLobby } from './SpeedQuizLobby';
import { SpeedQuizRoom } from './SpeedQuizRoom';

const ICONS: Record<QuizKind, JSX.Element> = {
  silhouette: <Ghost size={20} />,
  cry: <Volume2 size={20} />,
  zoom: <Search size={20} />,
  type: <Shapes size={20} />,
  typeHard: <Combine size={20} />,
  bstDuel: <Swords size={20} />,
  dexNumber: <Hash size={20} />,
  flavor: <ScrollText size={20} />,
  chosungEasy: <Type size={20} />,
  chosungHard: <Languages size={20} />,
  hint: <Lightbulb size={20} />,
  typeOdd: <Shuffle size={20} />,
  special: <Sparkles size={20} />,
  similarName: <SpellCheck size={20} />,
  signature: <Zap size={20} />,
};


export const QuizView = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [play, setPlay] = useState<QuizMode | null>(null);
  const [roundSize, setRoundSize] = useState(30);
  const [rev, setRev] = useState(0);
  const [examRank, setExamRank] = useState<number | null>(null);
  /** 속도전 화면 전환 — null=허브, 'lobby'=방 목록, 그 외=입장한 방 id. */
  const [speedView, setSpeedView] = useState<string | null>(null);
  const [speedRank, setSpeedRank] = useState<number | null>(null);

  const state = useMemo(() => quizService.getState(), [rev]);
  const speedStats = useMemo(() => quizService.getSpeedStats(), [rev]);
  const kinds = useMemo(() => availableQuizKinds(language), [language]);

  // [FREE-TIER] 허브에서 읽는 순위는 모의고사·속도전 2건뿐(각 최대 2 read, 10분 캐시).
  //   종목별 주간 순위는 15종목 × 2 read라 여기서 미리 읽지 않고 랭킹 모달에서만 조회한다.
  useEffect(() => {
    let alive = true;
    if (authService.isOfflineMode() || !authService.getCurrentUser()) {
      setExamRank(null); setSpeedRank(null); return;
    }
    databaseService.getMyQuizRank().then(r => { if (alive) setExamRank(r); }).catch(() => {});
    databaseService.getMyQuizSpeedRank().then(r => { if (alive) setSpeedRank(r); }).catch(() => {});
    return () => { alive = false; };
  }, [rev]);

  if (play) {
    return <QuizPlay mode={play} roundSize={roundSize} onExit={() => { setPlay(null); setRev(r => r + 1); }} />;
  }
  if (speedView === 'lobby') {
    return <SpeedQuizLobby onEnterRoom={id => setSpeedView(id)} onExit={() => setSpeedView(null)} />;
  }
  if (speedView) {
    return <SpeedQuizRoom roomId={speedView} onExit={() => { setSpeedView(null); setRev(r => r + 1); }} />;
  }

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={() => navigate('/')}><ArrowLeft size={ICON.md} /> {t('quiz.hub.backToMenu')}</BackBtn>
        <Title>{t('quiz.menu.title')}</Title>
        <StreakChip><Flame size={13} /> {state.bestStreak}</StreakChip>
      </TopBar>

      {/* 문항 수 — 전 모드 공통, 최상단에 독립 배치.
          랭킹은 50문항만 집계하므로 그 사실을 고르는 자리에서 바로 알린다. */}
      <RoundBar>
        <RoundLabel>{t('quiz.hub.roundSize')}</RoundLabel>
        <Segmented>
          {ROUND_SIZES.map(n => (
            <SegBtn key={n} $active={roundSize === n} onClick={() => setRoundSize(n)}>
              {t('quiz.hub.qCount', { n })}
            </SegBtn>
          ))}
        </Segmented>
        <RankRule>{t('quiz.hub.rankedRule', { n: RANKED_ROUND_SIZE })}</RankRule>
      </RoundBar>

      <Body>
        {/* 수능 모의고사 */}
        <ExamCard onClick={() => setPlay('exam')}>
          <ExamIcon><GraduationCap size={26} /></ExamIcon>
          <ExamInfo>
            <ExamName>{t('quiz.exam.name')}</ExamName>
            <ExamDesc>{t('quiz.exam.desc')}</ExamDesc>
          </ExamInfo>
          <ExamMeta>
            <MetaChip $gold><Trophy size={12} /> {t('quiz.hub.examBest', { n: state.examBest })}</MetaChip>
            {examRank !== null && <MetaChip>{t('quiz.hub.myRank', { rank: examRank })}</MetaChip>}
          </ExamMeta>
          <Chevron><ChevronRight size={18} /></Chevron>
        </ExamCard>

        {/* 속도전(실시간 멀티) */}
        <SpeedCard onClick={() => setSpeedView('lobby')}>
          <SpeedIcon><Zap size={26} /></SpeedIcon>
          <ExamInfo>
            <ExamName>{t('quiz.speed.name')}</ExamName>
            <ExamDesc>{t('quiz.speed.desc')}</ExamDesc>
          </ExamInfo>
          <ExamMeta>
            <MetaChip><Trophy size={12} /> {t('quiz.speed.winCount', { n: speedStats.wins })}</MetaChip>
            {speedRank !== null && <MetaChip>{t('quiz.hub.myRank', { rank: speedRank })}</MetaChip>}
          </ExamMeta>
          <Chevron><ChevronRight size={18} /></Chevron>
        </SpeedCard>

        <SectionLabel>{t('quiz.hub.pickQuiz')}</SectionLabel>
        <Grid>
          {kinds.map(kind => (
            <QuizCard key={kind} onClick={() => setPlay(kind)}>
              <IconTile>{ICONS[kind]}</IconTile>
              <CardInfo>
                <CardName>{t(`quiz.types.${kind}.name`)}</CardName>
                <CardDesc>{t(`quiz.types.${kind}.desc`)}</CardDesc>
              </CardInfo>
              <BestNum>{state.best[kind] ?? 0}</BestNum>
            </QuizCard>
          ))}
        </Grid>

        <Note>{t('quiz.hub.onlineNote')}</Note>
      </Body>
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드(SURFACE/SURFACE_HI/BORDER 3종), uppercase eyebrow,
//           둥근 아이콘 칩, 세그먼티드 컨트롤, backdrop-filter, → 셰브런,
//           Tailwind 팔레트(#22d3ee #f5c451 …).

const StreakChip = styled.div`
  ${winThin('gold')}
  ${pixelBold}
  flex: 0 0 auto; display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
  white-space: nowrap;
`;

const ExamCard = styled.button`
  ${btn('gold')}
  ${pixelText}
  display: flex; align-items: center; gap: ${SP.md};
  text-align: left; color: ${C.text};
  padding: ${SP.md};
  ${focusRing}
`;

const ExamIcon = styled.div`
  flex: 0 0 auto; width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${C.gold};
`;

/** 속도전 카드 — 모의고사 카드와 같은 골격, 창틀 색만 다르다. */
const SpeedCard = styled(ExamCard)`
  ${btn('cyan')}
`;

const SpeedIcon = styled(ExamIcon)`
  color: ${C.cyan};
`;

const ExamInfo = styled.div`flex: 1; min-width: 0;`;

const ExamName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
`;

const ExamDesc = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;

const ExamMeta = styled.div`
  display: flex; flex-direction: column; align-items: flex-end; gap: ${SP.xs}; flex: 0 0 auto;
  ${media.mobile} { display: none; }
`;

const MetaChip = styled.div<{ $gold?: boolean }>`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; white-space: nowrap;
  color: ${p => (p.$gold ? C.gold : C.textSub)};
`;

/** → 셰브런은 걷어냈다(웹 관용구). 자리만 남겨 둔다. */
const Chevron = styled.div`
  display: none;
`;

/** 문항 수 바 — 랭킹 규칙이 같이 붙으므로 좁으면 다음 줄로 넘긴다. */
const RoundBar = styled.div`
  display: flex; align-items: center; justify-content: center; gap: ${SP.md};
  flex-wrap: wrap;
  padding: ${SP.sm} ${SP.lg};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  ${media.mobile} { padding: ${SP.sm}; }
`;

const RankRule = styled.div`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textDim};
  word-break: keep-all;
`;

const RoundLabel = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

const Segmented = styled.div`
  display: inline-flex; gap: ${SP.xs};
`;

const SegBtn = styled.button<{ $active: boolean }>`
  ${p => btnThin(p.$active ? 'cyan' : 'plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.md};
  font-size: ${FONT.sm};
  color: ${p => (p.$active ? C.cyan : C.textSub)};
  ${focusRing}
`;


const Grid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.sm};
  ${media.tablet} { grid-template-columns: repeat(2, 1fr); }
  ${media.mobile} { grid-template-columns: 1fr; }
`;
const QuizCard = styled.button`
  ${btn('plain')}
  ${pixelText}
  display: flex; align-items: center; gap: ${SP.sm};
  text-align: left; color: ${C.text};
  padding: ${SP.sm};
  ${focusRing}
`;
const IconTile = styled.div`
  flex: 0 0 auto; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${C.cyan};
`;
const CardInfo = styled.div`flex: 1; min-width: 0;`;
const CardName = styled.div`
  ${pixelBold}
  font-size: ${FONT.md};
`;
const CardDesc = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
const BestNum = styled.div`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm}; color: ${C.gold};
  font-variant-numeric: tabular-nums; min-width: 22px; text-align: right;
`;
const Note = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; margin-top: ${SP.xs};
`;
