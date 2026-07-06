// src/components/quiz/QuizPlay.tsx
// 퀴즈 한 라운드(10문제) 진행 — 문제 렌더·즉시 피드백·다음문제 프리페치·결과 정산.

import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ArrowLeft, Check, X, Flame, RotateCcw } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { QuizKind, QuizQuestion } from '../../types/quiz';
import { generateQuestion } from '../../services/QuizEngine';
import { quizService } from '../../services/QuizService';

const ROUND = 10;

interface QuizPlayProps {
  kind: QuizKind;
  onExit: () => void;
}

type Phase = 'loading' | 'question' | 'revealed' | 'result' | 'error';

export const QuizPlay = ({ kind, onExit }: QuizPlayProps) => {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextRef = useRef<Promise<QuizQuestion> | null>(null);
  const aliveRef = useRef(true);

  const gen = () => generateQuestion(kind, { t });

  // 첫 문제 로드 + 다음 문제 프리페치
  useEffect(() => {
    aliveRef.current = true;
    reset();
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const reset = async () => {
    setIdx(0); setScore(0); setStreak(0); setMaxStreak(0);
    setSelected(null); setNewBest(false); setQ(null); setPhase('loading');
    try {
      const first = await gen();
      if (!aliveRef.current) return;
      setQ(first);
      setPhase('question');
      nextRef.current = gen();
    } catch {
      if (aliveRef.current) setPhase('error');
    }
  };

  const onSelect = (i: number) => {
    if (phase !== 'question' || !q) return;
    setSelected(i);
    if (i === q.correctIndex) {
      setScore(s => s + 1);
      const ns = streak + 1;
      setStreak(ns);
      setMaxStreak(m => Math.max(m, ns));
    } else {
      setStreak(0);
    }
    setPhase('revealed');
  };

  const onNext = async () => {
    if (idx + 1 >= ROUND) {
      const isBest = quizService.recordRound(kind, score, maxStreak);
      setNewBest(isBest);
      setPhase('result');
      return;
    }
    setSelected(null);
    setPhase('loading');
    try {
      const nq = nextRef.current ? await nextRef.current : await gen();
      if (!aliveRef.current) return;
      setQ(nq);
      setIdx(i => i + 1);
      setPhase('question');
      nextRef.current = gen();
    } catch {
      if (aliveRef.current) setPhase('error');
    }
  };

  const retryLoad = async () => {
    setPhase('loading');
    try {
      const nq = await gen();
      if (!aliveRef.current) return;
      setQ(nq);
      setPhase('question');
      nextRef.current = gen();
    } catch {
      if (aliveRef.current) setPhase('error');
    }
  };

  // ─── 결과 화면 ───────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return (
      <Root>
        <TopBar>
          <BackBtn onClick={onExit}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn>
          <TopTitle>{t('quiz.result.title')}</TopTitle>
          <span style={{ width: 40 }} />
        </TopBar>
        <ResultWrap>
          <ResultScore>{t('quiz.result.score', { score, total: ROUND })}</ResultScore>
          {newBest && <NewBest><Flame size={15} /> {t('quiz.result.newBest')}</NewBest>}
          <ResultStat>{t('quiz.result.best', { n: quizService.getBest(kind) })}</ResultStat>
          <ResultStat>{t('quiz.result.maxStreak', { n: maxStreak })}</ResultStat>
          <ResultBtns>
            <PrimaryBtn onClick={reset}><RotateCcw size={16} /> {t('quiz.result.retry')}</PrimaryBtn>
            <GhostBtn onClick={onExit}>{t('quiz.result.exit')}</GhostBtn>
          </ResultBtns>
        </ResultWrap>
      </Root>
    );
  }

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onExit}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn>
        <Progress>{t('quiz.play.progress', { cur: Math.min(idx + 1, ROUND), total: ROUND })}</Progress>
        <ScorePills>
          {streak >= 2 && <StreakPill><Flame size={12} /> {streak}</StreakPill>}
          <ScorePill>{score}</ScorePill>
        </ScorePills>
      </TopBar>

      <ProgressBar><ProgressFill $pct={(idx / ROUND) * 100} /></ProgressBar>

      {phase === 'error' ? (
        <CenterMsg>
          <ErrText>{t('quiz.play.loadError')}</ErrText>
          <PrimaryBtn onClick={retryLoad}>{t('quiz.play.retryLoad')}</PrimaryBtn>
        </CenterMsg>
      ) : phase === 'loading' || !q ? (
        <CenterMsg>
          <Spinner />
          <DimText>{t('quiz.play.loading')}</DimText>
        </CenterMsg>
      ) : (
        <Body>
          <Prompt>{q.prompt}</Prompt>

          {q.media && (
            <MediaWrap>
              <MediaImg
                src={q.media.imageUrl}
                alt=""
                $silhouette={!!q.media.silhouette && phase === 'question'}
                draggable={false}
              />
            </MediaWrap>
          )}

          <Options $img={q.options.some(o => !!o.imageUrl)}>
            {q.options.map((opt, i) => {
              const revealed = phase === 'revealed';
              const state = !revealed ? 'idle'
                : i === q.correctIndex ? 'correct'
                : i === selected ? 'wrong' : 'dim';
              return (
                <OptBtn key={i} $state={state} $img={!!opt.imageUrl} disabled={revealed} onClick={() => onSelect(i)}>
                  {opt.imageUrl && <OptImg src={opt.imageUrl} alt="" draggable={false} />}
                  {opt.label && <OptLabel>{opt.label}</OptLabel>}
                  {revealed && i === q.correctIndex && <Mark $ok><Check size={16} /></Mark>}
                  {revealed && i === selected && i !== q.correctIndex && <Mark><X size={16} /></Mark>}
                </OptBtn>
              );
            })}
          </Options>

          {phase === 'revealed' && (
            <RevealCard $correct={selected === q.correctIndex}>
              <RevealVerdict $correct={selected === q.correctIndex}>
                {selected === q.correctIndex ? <><Check size={16} /> {t('quiz.play.correct')}</> : <><X size={16} /> {t('quiz.play.wrong')}</>}
              </RevealVerdict>
              <RevealBody>
                {q.reveal.imageUrl && <RevealImg src={q.reveal.imageUrl} alt="" draggable={false} />}
                <div>
                  <RevealTitle>{q.reveal.title}</RevealTitle>
                  {q.reveal.subtitle && <RevealSub>{q.reveal.subtitle}</RevealSub>}
                </div>
              </RevealBody>
              <NextBtn onClick={onNext}>
                {idx + 1 >= ROUND ? t('quiz.play.seeResult') : t('quiz.play.next')} →
              </NextBtn>
            </RevealCard>
          )}
        </Body>
      )}
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
const spin = keyframes`to { transform: rotate(360deg); }`;
const pop = keyframes`0%{transform:scale(0.96);opacity:0}100%{transform:scale(1);opacity:1}`;

const ACCENT = '#22d3ee';

const Root = styled.div`
  min-height: 100vh; background: radial-gradient(circle at top, #0d1b26, #060a10);
  color: #e8edf5; display: flex; flex-direction: column;
`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02); position: sticky; top: 0; z-index: 20; backdrop-filter: blur(10px);
  ${media.mobile} { padding: 10px 12px; gap: 6px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
  padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; white-space: nowrap;
  &:hover { background: rgba(255,255,255,0.07); }
  ${media.mobile} { padding: 6px 9px; font-size: 12px; }
`;
const TopTitle = styled.h1`font-size: 16px; font-weight: 800; margin: 0;`;
const Progress = styled.div`
  font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums;
  ${media.mobile} { font-size: 13px; }
`;
const ScorePills = styled.div`display: flex; align-items: center; gap: 6px; flex: 0 0 auto;`;
const ScorePill = styled.div`
  min-width: 34px; text-align: center; font-size: 14px; font-weight: 800; color: ${ACCENT};
  background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.28);
  padding: 5px 10px; border-radius: 100px; font-variant-numeric: tabular-nums;
`;
const StreakPill = styled.div`
  display: flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 800; color: #fb923c;
  background: rgba(251,146,60,0.12); border: 1px solid rgba(251,146,60,0.28);
  padding: 5px 9px; border-radius: 100px;
`;
const ProgressBar = styled.div`height: 3px; background: rgba(255,255,255,0.06);`;
const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%; width: ${p => p.$pct}%; background: ${ACCENT}; transition: width 0.3s ease;
`;

const Body = styled.main`
  flex: 1; width: 100%; max-width: 620px; margin: 0 auto; padding: 24px 18px 48px;
  display: flex; flex-direction: column; gap: 18px;
  ${media.mobile} { padding: 18px 14px 40px; gap: 14px; }
`;
const Prompt = styled.h2`
  font-size: 20px; font-weight: 800; text-align: center; margin: 0; line-height: 1.35;
  ${media.mobile} { font-size: 17px; }
`;
const MediaWrap = styled.div`
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at center, rgba(255,255,255,0.05), transparent 70%);
  border-radius: 16px; padding: 8px;
`;
const MediaImg = styled.img<{ $silhouette: boolean }>`
  width: 210px; height: 210px; object-fit: contain;
  filter: ${p => p.$silhouette ? 'brightness(0)' : 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))'};
  transition: filter 0.35s ease;
  ${media.mobile} { width: 160px; height: 160px; }
`;
const Options = styled.div<{ $img: boolean }>`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
  ${media.mobile} { gap: 9px; }
`;
const OptBtn = styled.button<{ $state: 'idle' | 'correct' | 'wrong' | 'dim'; $img: boolean }>`
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: ${p => p.$img ? '14px 10px' : '16px 14px'};
  min-height: ${p => p.$img ? '150px' : '56px'};
  border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700;
  border: 1.5px solid ${p =>
    p.$state === 'correct' ? '#34d399'
    : p.$state === 'wrong' ? '#f87171'
    : 'rgba(255,255,255,0.1)'};
  background: ${p =>
    p.$state === 'correct' ? 'rgba(52,211,153,0.14)'
    : p.$state === 'wrong' ? 'rgba(248,113,113,0.12)'
    : p.$state === 'dim' ? 'rgba(255,255,255,0.02)'
    : 'rgba(255,255,255,0.05)'};
  color: #f1f5f9; opacity: ${p => p.$state === 'dim' ? 0.4 : 1};
  transition: transform 0.12s, background 0.15s, border-color 0.15s;
  &:not(:disabled):hover { transform: translateY(-2px); border-color: ${ACCENT}88; background: rgba(34,211,238,0.08); }
  &:disabled { cursor: default; }
  ${media.mobile} { font-size: 14px; min-height: ${p => p.$img ? '124px' : '50px'}; }
`;
const OptImg = styled.img`
  width: 108px; height: 108px; object-fit: contain; pointer-events: none;
  ${media.mobile} { width: 84px; height: 84px; }
`;
const OptLabel = styled.span`text-align: center; line-height: 1.25; word-break: keep-all;`;
const Mark = styled.span<{ $ok?: boolean }>`
  position: absolute; top: 6px; right: 6px;
  display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%;
  background: ${p => p.$ok ? '#34d399' : '#f87171'}; color: #06202a;
`;

const RevealCard = styled.div<{ $correct: boolean }>`
  animation: ${pop} 0.18s ease both;
  display: flex; flex-direction: column; gap: 12px; padding: 16px;
  border-radius: 14px;
  border: 1px solid ${p => p.$correct ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.3)'};
  background: linear-gradient(160deg, ${p => p.$correct ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.1)'}, rgba(12,18,26,0.6));
`;
const RevealVerdict = styled.div<{ $correct: boolean }>`
  display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 800;
  color: ${p => p.$correct ? '#34d399' : '#f87171'};
`;
const RevealBody = styled.div`display: flex; align-items: center; gap: 14px;`;
const RevealImg = styled.img`width: 76px; height: 76px; object-fit: contain; flex: 0 0 auto;`;
const RevealTitle = styled.div`font-size: 18px; font-weight: 800; color: #f8fafc;`;
const RevealSub = styled.div`font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 3px;`;
const NextBtn = styled.button`
  margin-top: 2px; padding: 12px; border-radius: 10px; border: none; cursor: pointer;
  background: ${ACCENT}; color: #04222b; font-size: 15px; font-weight: 800;
  &:hover { filter: brightness(1.08); }
`;

const CenterMsg = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px;
`;
const Spinner = styled.div`
  width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.2); border-top-color: ${ACCENT};
  border-radius: 50%; animation: ${spin} 0.8s linear infinite;
`;
const DimText = styled.div`font-size: 14px; color: rgba(255,255,255,0.45);`;
const ErrText = styled.div`font-size: 14px; color: rgba(255,255,255,0.6); text-align: center; line-height: 1.6;`;

const ResultWrap = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 20px;
`;
const ResultScore = styled.div`
  font-size: 44px; font-weight: 900; color: ${ACCENT};
  ${media.mobile} { font-size: 36px; }
`;
const NewBest = styled.div`
  display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; color: #fbbf24;
  background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); padding: 6px 14px; border-radius: 100px;
`;
const ResultStat = styled.div`font-size: 14px; color: rgba(255,255,255,0.6); font-weight: 600;`;
const ResultBtns = styled.div`display: flex; gap: 10px; margin-top: 16px;`;
const PrimaryBtn = styled.button`
  display: flex; align-items: center; gap: 6px; padding: 12px 22px; border-radius: 10px; border: none; cursor: pointer;
  background: ${ACCENT}; color: #04222b; font-size: 15px; font-weight: 800;
  &:hover { filter: brightness(1.08); }
`;
const GhostBtn = styled.button`
  padding: 12px 22px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.75);
  &:hover { background: rgba(255,255,255,0.1); }
`;
