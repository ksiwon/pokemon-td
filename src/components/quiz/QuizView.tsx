// src/components/quiz/QuizView.tsx
// 포켓몬 퀴즈 허브 — 종목 선택 그리드 + 최고점수. 종목 클릭 시 QuizPlay 라운드 진입.

import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Ghost, Swords, Shapes, Hash, Flame, Trophy } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { QuizKind, QUIZ_KINDS } from '../../types/quiz';
import { quizService } from '../../services/QuizService';
import { QuizPlay } from './QuizPlay';

const ICONS: Record<QuizKind, JSX.Element> = {
  silhouette: <Ghost size={22} />,
  bstDuel: <Swords size={22} />,
  type: <Shapes size={22} />,
  dexNumber: <Hash size={22} />,
};

export const QuizView = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [play, setPlay] = useState<QuizKind | null>(null);
  // 라운드 종료 후 최고점수 새로고침용 카운터
  const [rev, setRev] = useState(0);

  const state = useMemo(() => quizService.getState(), [rev]);

  if (play) {
    return <QuizPlay kind={play} onExit={() => { setPlay(null); setRev(r => r + 1); }} />;
  }

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={() => navigate('/')}>{t('quiz.hub.backToMenu')}</BackBtn>
        <Title>{t('quiz.menu.title')}</Title>
        <BestStreak><Flame size={14} color="#fb923c" /> {t('quiz.hub.bestStreak', { n: state.bestStreak })}</BestStreak>
      </TopBar>

      <Body>
        <Intro>
          <IntroTitle>{t('quiz.hub.headline')}</IntroTitle>
          <IntroDesc>{t('quiz.hub.roundInfo')}</IntroDesc>
        </Intro>

        <Grid>
          {QUIZ_KINDS.map(kind => (
            <QuizCard key={kind} onClick={() => setPlay(kind)}>
              <IconWrap>{ICONS[kind]}</IconWrap>
              <CardInfo>
                <CardName>{t(`quiz.types.${kind}.name`)}</CardName>
                <CardDesc>{t(`quiz.types.${kind}.desc`)}</CardDesc>
              </CardInfo>
              <BestChip>
                <Trophy size={12} /> {t('quiz.hub.best', { n: state.best[kind] ?? 0 })}
              </BestChip>
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

const Root = styled.div`
  min-height: 100vh; background: radial-gradient(circle at top, #0d1b26, #060a10);
  color: #e8edf5; display: flex; flex-direction: column;
`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02); position: sticky; top: 0; z-index: 20; backdrop-filter: blur(10px);
  ${media.tablet} { padding: 12px 16px; gap: 8px; }
  ${media.mobile} { padding: 10px 12px; gap: 6px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
  padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; white-space: nowrap;
  &:hover { background: rgba(255,255,255,0.07); }
  ${media.mobile} { padding: 6px 10px; font-size: 12px; }
`;
const Title = styled.h1`
  font-size: 18px; font-weight: 800; margin: 0;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${media.mobile} { font-size: 15px; }
`;
const BestStreak = styled.div`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700;
  color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  padding: 6px 11px; border-radius: 100px; white-space: nowrap;
  ${media.mobile} { font-size: 12px; padding: 5px 9px; }
`;

const Body = styled.main`
  flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 28px 20px 56px;
  display: flex; flex-direction: column; gap: 22px;
  ${media.mobile} { padding: 20px 14px 44px; gap: 16px; }
`;
const Intro = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const IntroTitle = styled.h2`
  font-size: 22px; font-weight: 900; margin: 0; letter-spacing: -0.01em;
  ${media.mobile} { font-size: 18px; }
`;
const IntroDesc = styled.div`font-size: 13px; color: rgba(255,255,255,0.45);`;

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
  ${media.mobile} { grid-template-columns: 1fr; gap: 10px; }
`;
const QuizCard = styled.button`
  position: relative; display: flex; align-items: center; gap: 14px; text-align: left;
  padding: 18px 16px; border-radius: 14px; cursor: pointer; color: #fff;
  background: linear-gradient(160deg, rgba(34,211,238,0.06), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.09); transition: all 0.18s;
  &:hover { transform: translateY(-3px); border-color: ${ACCENT}66; box-shadow: 0 12px 28px rgba(34,211,238,0.12); }
`;
const IconWrap = styled.div`
  flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(34,211,238,0.12); color: ${ACCENT};
`;
const CardInfo = styled.div`flex: 1; min-width: 0;`;
const CardName = styled.div`font-size: 16px; font-weight: 800; margin-bottom: 3px;`;
const CardDesc = styled.div`font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.4;`;
const BestChip = styled.div`
  flex: 0 0 auto; display: flex; align-items: center; gap: 4px; align-self: flex-start;
  font-size: 11px; font-weight: 800; color: #fbbf24;
  background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.22);
  padding: 4px 8px; border-radius: 100px; white-space: nowrap;
`;
const Note = styled.div`
  font-size: 12px; color: rgba(255,255,255,0.35); text-align: center; line-height: 1.6;
`;
