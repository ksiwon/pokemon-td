// src/components/quiz/QuizView.tsx
// 포켓몬 퀴즈 허브 — 수능 모의고사 + 종목 선택 + 문항 수(10/30/50) + 최고점수/랭킹.

import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Ghost, Volume2, Search, Shapes, Swords, Hash, ScrollText, GraduationCap, Flame, Trophy, ChevronRight, Type, Languages, Combine } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { QuizKind, QuizMode, availableQuizKinds } from '../../types/quiz';
import { quizService } from '../../services/QuizService';
import { databaseService } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { QuizPlay } from './QuizPlay';

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
};

const ROUND_SIZES = [10, 30, 50];

export const QuizView = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [play, setPlay] = useState<QuizMode | null>(null);
  const [roundSize, setRoundSize] = useState(30);
  const [rev, setRev] = useState(0);
  const [examRank, setExamRank] = useState<number | null>(null);

  const state = useMemo(() => quizService.getState(), [rev]);
  const kinds = useMemo(() => availableQuizKinds(language), [language]);

  useEffect(() => {
    let alive = true;
    if (authService.isOfflineMode() || !authService.getCurrentUser()) { setExamRank(null); return; }
    databaseService.getMyQuizRank().then(r => { if (alive) setExamRank(r); }).catch(() => {});
    return () => { alive = false; };
  }, [rev]);

  if (play) {
    return <QuizPlay mode={play} roundSize={roundSize} onExit={() => { setPlay(null); setRev(r => r + 1); }} />;
  }

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={() => navigate('/')}>{t('quiz.hub.backToMenu')}</BackBtn>
        <Title>{t('quiz.menu.title')}</Title>
        <StreakChip><Flame size={13} /> {state.bestStreak}</StreakChip>
      </TopBar>

      {/* 문항 수 — 전 모드 공통, 최상단에 독립 배치 */}
      <RoundBar>
        <RoundLabel>{t('quiz.hub.roundSize')}</RoundLabel>
        <Segmented>
          {ROUND_SIZES.map(n => (
            <SegBtn key={n} $active={roundSize === n} onClick={() => setRoundSize(n)}>
              {t('quiz.hub.qCount', { n })}
            </SegBtn>
          ))}
        </Segmented>
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
const ACCENT = '#22d3ee';
const GOLD = '#f5c451';
const SURFACE = 'rgba(255,255,255,0.035)';
const SURFACE_HI = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.09)';

const Root = styled.div`
  min-height: 100vh; background: #0b0f14; color: #e7edf3;
  display: flex; flex-direction: column;
`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 22px; border-bottom: 1px solid ${BORDER};
  position: sticky; top: 0; z-index: 20; background: rgba(11,15,20,0.85); backdrop-filter: blur(10px);
  ${media.mobile} { padding: 11px 14px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto; background: transparent; border: 1px solid ${BORDER}; color: rgba(255,255,255,0.65);
  padding: 7px 13px; border-radius: 9px; cursor: pointer; font-size: 13.5px; white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  &:hover { background: ${SURFACE_HI}; color: #fff; }
  ${media.mobile} { padding: 6px 10px; font-size: 12px; }
`;
const Title = styled.h1`
  font-size: 17px; font-weight: 800; margin: 0; letter-spacing: -0.01em;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${media.mobile} { font-size: 15px; }
`;
const StreakChip = styled.div`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700;
  color: #fb923c; background: rgba(251,146,60,0.1); border: 1px solid rgba(251,146,60,0.22);
  padding: 5px 11px; border-radius: 8px;
`;

const Body = styled.main`
  flex: 1; width: 100%; max-width: 960px; margin: 0 auto; padding: 24px 20px 56px;
  display: flex; flex-direction: column; gap: 16px;
  ${media.mobile} { padding: 18px 14px 44px; gap: 14px; }
`;

const ExamCard = styled.button`
  display: flex; align-items: center; gap: 15px; text-align: left; cursor: pointer; color: #fff;
  padding: 18px; border-radius: 14px;
  background: ${SURFACE}; border: 1px solid rgba(245,196,81,0.28);
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${SURFACE_HI}; border-color: rgba(245,196,81,0.5); }
  ${media.mobile} { padding: 15px; gap: 12px; }
`;
const ExamIcon = styled.div`
  flex: 0 0 auto; width: 50px; height: 50px; border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(245,196,81,0.12); color: ${GOLD};
  ${media.mobile} { width: 44px; height: 44px; }
`;
const ExamInfo = styled.div`flex: 1; min-width: 0;`;
const ExamName = styled.div`font-size: 18px; font-weight: 800; margin-bottom: 3px; ${media.mobile} { font-size: 16px; }`;
const ExamDesc = styled.div`font-size: 12.5px; color: rgba(255,255,255,0.5); line-height: 1.4;`;
const ExamMeta = styled.div`display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: 0 0 auto; ${media.mobile} { display: none; }`;
const MetaChip = styled.div<{ $gold?: boolean }>`
  display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; white-space: nowrap;
  color: ${p => p.$gold ? GOLD : 'rgba(255,255,255,0.6)'};
`;
const Chevron = styled.div`flex: 0 0 auto; color: rgba(255,255,255,0.3);`;

const RoundBar = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 14px;
  padding: 12px 20px; border-bottom: 1px solid ${BORDER};
  background: rgba(255,255,255,0.02);
  ${media.mobile} { padding: 10px 14px; gap: 10px; }
`;
const RoundLabel = styled.div`font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.55);`;
const Segmented = styled.div`
  display: inline-flex; background: ${SURFACE}; border: 1px solid ${BORDER};
  border-radius: 10px; padding: 3px; gap: 2px;
`;
const SegBtn = styled.button<{ $active: boolean }>`
  padding: 7px 15px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; transition: background 0.15s, color 0.15s;
  background: ${p => p.$active ? ACCENT : 'transparent'};
  color: ${p => p.$active ? '#062430' : 'rgba(255,255,255,0.55)'};
  &:hover { color: ${p => p.$active ? '#062430' : '#fff'}; }
  ${media.mobile} { padding: 6px 12px; font-size: 12px; }
`;

const SectionLabel = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); margin-top: 6px;
`;
const Grid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  ${media.tablet} { grid-template-columns: repeat(2, 1fr); }
  ${media.mobile} { grid-template-columns: 1fr; }
`;
const QuizCard = styled.button`
  display: flex; align-items: center; gap: 13px; text-align: left; cursor: pointer; color: #fff;
  padding: 14px; border-radius: 12px; background: ${SURFACE}; border: 1px solid ${BORDER};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${SURFACE_HI}; border-color: rgba(34,211,238,0.35); }
`;
const IconTile = styled.div`
  flex: 0 0 auto; width: 42px; height: 42px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(34,211,238,0.1); color: ${ACCENT};
`;
const CardInfo = styled.div`flex: 1; min-width: 0;`;
const CardName = styled.div`font-size: 15px; font-weight: 800; margin-bottom: 2px;`;
const CardDesc = styled.div`font-size: 11.5px; color: rgba(255,255,255,0.42); line-height: 1.35;`;
const BestNum = styled.div`
  flex: 0 0 auto; font-size: 15px; font-weight: 800; color: ${GOLD};
  font-variant-numeric: tabular-nums; min-width: 22px; text-align: right;
`;
const Note = styled.div`
  font-size: 11.5px; color: rgba(255,255,255,0.3); text-align: center; margin-top: 6px;
`;
