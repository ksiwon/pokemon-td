// src/components/quiz/QuizPlay.tsx
// 퀴즈 한 라운드 진행 — 개별 종목 또는 수능 모의고사(전 종목 혼합). 문항 수는 10/30/50.
// 문제 렌더(이미지/실루엣/확대/울음소리) · 즉시 피드백 · 다음문제 프리페치 · 결과 정산.

import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ArrowLeft, Check, X, Flame, RotateCcw, Volume2, ChevronUp, ChevronDown } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody, ScreenTitle as TopTitle, ScreenTopBar as TopBar } from '../shared/screen';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { win, winThin, btn, sunken, pixelBold, shadowLg, focusRing } from '../../styles/pixel';
import { QuizKind, QuizMode, QuizQuestion, KO_ONLY_QUIZ_KINDS, RANKED_ROUND_SIZE } from '../../types/quiz';
import { createQuizSession, createExamSession, normalizeAnswer } from '../../services/QuizEngine';
import { quizService, ExamMilestoneReward } from '../../services/QuizService';
import { databaseService } from '../../services/DatabaseService';

interface QuizPlayProps {
  mode: QuizMode;
  /** 문항 수(10/30/50). 50문항만 랭킹에 반영된다 — RANKED_ROUND_SIZE. */
  roundSize?: number;
  onExit: () => void;
}

type Phase = 'loading' | 'question' | 'revealed' | 'result' | 'error';

/** 정답률 → 수능식 1~9등급. */
const examGrade = (c: number, total: number): number => {
  const p = c / total;
  return p >= 0.95 ? 1 : p >= 0.85 ? 2 : p >= 0.72 ? 3 : p >= 0.58 ? 4
    : p >= 0.42 ? 5 : p >= 0.28 ? 6 : p >= 0.16 ? 7 : p >= 0.07 ? 8 : 9;
};

export const QuizPlay = ({ mode, roundSize = 30, onExit }: QuizPlayProps) => {
  const { t, language } = useTranslation();
  const isExam = mode === 'exam';
  const ROUND = roundSize; // 전 모드 공통 문항 수(10/30/50)

  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selected, setSelected] = useState<number | null>(null);
  const [textValue, setTextValue] = useState('');
  const [lastCorrect, setLastCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [milestones, setMilestones] = useState<ExamMilestoneReward[]>([]);

  const nextRef = useRef<Promise<QuizQuestion> | null>(null);
  const aliveRef = useRef(true);
  const navBusyRef = useRef(false); // onNext 재진입 방지(버튼 연타·Enter 중복)
  const sessionRef = useRef<ReturnType<typeof createExamSession> | ReturnType<typeof createQuizSession> | null>(null);

  const gen = () => {
    if (!sessionRef.current) {
      sessionRef.current = isExam ? createExamSession() : createQuizSession(mode as QuizKind);
    }
    return sessionRef.current.next({ t, lang: language });
  };

  // 라운드 도중 언어를 바꾸면 한국어 전용 종목(초성)은 더 이상 성립하지 않는다
  // (영문 이름은 초성으로 변환되지 않아 정답이 그대로 노출된다) → 허브로 되돌린다.
  useEffect(() => {
    if (!isExam && language !== 'ko' && KO_ONLY_QUIZ_KINDS.includes(mode as QuizKind)) {
      onExit();
    }
  }, [language, isExam, mode, onExit]);

  /** 정답/오답 확정 — 점수·연속·페이즈 갱신(주관식·객관식 공용). */
  const commitAnswer = (correct: boolean) => {
    setLastCorrect(correct);
    if (correct) {
      setScore(s => s + 1);
      const ns = streak + 1;
      setStreak(ns);
      setMaxStreak(m => Math.max(m, ns));
    } else {
      setWrong(w => w + 1);
      setStreak(0);
    }
    setPhase('revealed');
  };

  const isAnswerCorrect = (): boolean => {
    if (!q) return false;
    const norm = normalizeAnswer(textValue);
    if (norm.length === 0) return false;
    if (q.validateText) return q.validateText(norm); // 타입(어려움): 입력 포켓몬이 해당 타입을 갖는지 동적 채점
    if (!q.accept) return false;
    return q.accept.some(a => normalizeAnswer(a) === norm);
  };

  useEffect(() => {
    aliveRef.current = true;
    reset();
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const reset = async () => {
    navBusyRef.current = false;
    setIdx(0); setScore(0); setWrong(0); setStreak(0); setMaxStreak(0);
    setSelected(null); setTextValue(''); setNewBest(false); setMilestones([]); setQ(null); setPhase('loading');
    sessionRef.current = isExam ? createExamSession() : createQuizSession(mode as QuizKind);
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
    commitAnswer(i === q.correctIndex);
  };

  const onSubmitText = () => {
    if (phase !== 'question' || !q) return;
    if (!textValue.trim()) return; // 빈 입력 제출/Enter 무시
    commitAnswer(isAnswerCorrect());
  };

  const onGiveUp = () => {
    if (phase !== 'question' || !q) return;
    commitAnswer(false);
  };

  const onNext = async () => {
    if (phase !== 'revealed' || navBusyRef.current) return; // 공개 상태에서만·1회만
    navBusyRef.current = true;
    if (idx + 1 >= ROUND) {
      if (isExam) {
        const isBest = quizService.recordExam(score, maxStreak);
        setNewBest(isBest);
        // 최고점 갱신으로 새로 도달한 마일스톤 보상(미니 포켓 재화) 1회성 지급
        setMilestones(quizService.claimExamMilestones());
        // 통산 보드는 50문항 완주만 집계 — 경신했을 때만 1 write.
        const ranked = quizService.recordRankedExam(score, ROUND);
        if (ranked !== null) databaseService.updateQuizRanking(ranked).catch(() => {});
      } else {
        setNewBest(quizService.recordRound(mode, score, maxStreak));
        // 종목도 모의고사와 같은 방식으로 재화를 준다(액수는 1/5, 구간마다 1회).
        setMilestones(quizService.claimKindMilestones(mode as QuizKind));
      }
      // 주간 랭킹 — [FREE-TIER] 이번 주 최고를 경신했을 때만 1 write.
      const boardKey = isExam ? 'exam' : (mode as QuizKind);
      if (quizService.recordWeekly(boardKey, score, ROUND)) {
        databaseService.updateQuizWeekly(boardKey, score).catch(() => {});
      }
      setPhase('result');
      return; // 결과 화면 — 재생(reset) 시 navBusyRef 해제
    }
    setSelected(null);
    setTextValue('');
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
    } finally {
      navBusyRef.current = false;
    }
  };

  // 정답 공개(revealed) 상태에서 Enter로 다음 문제(마지막이면 결과)로 진행.
  //   단, '제출에 쓴 Enter'가 곧바로 다음으로 넘기지 않도록 keyup으로 재무장(arm).
  //   → 텍스트 제출: Enter로 제출(결과 표시) → 뗐다 다시 Enter로 다음. 객관식(클릭 답변): 첫 Enter로 바로 다음.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const enterArmedRef = useRef(true);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      // 제출에 쓴 Enter는 입력창 onKeyDown에서 이미 무장 해제됨 → 여기서 다음으로 안 넘어감.
      if (phaseRef.current === 'revealed' && enterArmedRef.current && !e.repeat) {
        e.preventDefault();
        enterArmedRef.current = false; // 소비 — 다음 진행은 Enter를 뗐다(keyup) 다시 눌러야
        onNextRef.current();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Enter') enterArmedRef.current = true; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

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
    const grade = examGrade(score, ROUND);
    return (
      <Root>
        <TopBar>
          <BackBtn onClick={onExit}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn>
          <TopTitle>{t('quiz.result.title')}</TopTitle>
          <span style={{ width: 40 }} />
        </TopBar>
        <ResultWrap>
          {isExam && <GradeBadge $g={grade}>{t('quiz.result.grade', { n: grade })}</GradeBadge>}
          <ResultScore>{t('quiz.result.score', { score, total: ROUND })}</ResultScore>
          {newBest && <NewBest><Flame size={15} /> {t('quiz.result.newBest')}</NewBest>}
          {milestones.length > 0 && (
            <MilestoneBox>
              <MilestoneTitle>{t('quiz.result.milestoneTitle')}</MilestoneTitle>
              {milestones.map(m => (
                <MilestoneRow key={m.threshold}>
                  <span>{t('quiz.result.milestoneAt', { n: m.threshold })}</span>
                  <MilestoneRw $c={C.gold}>{t('quiz.result.rewardCoins', { n: m.coins })}</MilestoneRw>
                  {m.starShards > 0 && <MilestoneRw $c={C.purple}>{t('quiz.result.rewardShards', { n: m.starShards })}</MilestoneRw>}
                </MilestoneRow>
              ))}
            </MilestoneBox>
          )}
          <ResultStat>{isExam
            ? t('quiz.result.examBest', { n: quizService.getExamBest() })
            : t('quiz.result.best', { n: quizService.getBest(mode) })}</ResultStat>
          <ResultStat>{t('quiz.result.maxStreak', { n: maxStreak })}</ResultStat>
          {ROUND !== RANKED_ROUND_SIZE && (
            <RankNote>{t('quiz.result.notRanked', { n: RANKED_ROUND_SIZE })}</RankNote>
          )}
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
          <CorrectPill title={t('quiz.play.correct')}><Check size={13} /> {score}</CorrectPill>
          <WrongPill title={t('quiz.play.wrong')}><X size={13} /> {wrong}</WrongPill>
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

          {q.bigText && <BigText>{q.bigText}</BigText>}

          {q.hintLines && q.hintLines.length > 0 && (
            <HintList>
              {q.hintLines.map((line, i) => (
                <HintRow key={i}><HintNo>{i + 1}</HintNo><HintText>{line}</HintText></HintRow>
              ))}
            </HintList>
          )}

          {q.duel ? (
            <DuelView duel={q.duel} phase={phase} onSelect={onSelect} t={t} />
          ) : (
          <>
          {q.media?.audioUrl && <AudioPlayer url={q.media.audioUrl} label={t('quiz.play.playCry')} />}

          {q.media?.imageUrl && (
            <MediaWrap $zoom={!!q.media.zoom}>
              <MediaImg
                src={q.media.imageUrl}
                alt=""
                $silhouette={!!q.media.silhouette && phase === 'question'}
                $zoom={q.media.zoom && phase === 'question' ? q.media.zoom : undefined}
                draggable={false}
              />
            </MediaWrap>
          )}

          {q.answerType === 'text' ? (
            <TextAnswer>
              <TextInput
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { enterArmedRef.current = false; onSubmitText(); } }}
                placeholder={q.inputPlaceholder ?? t('quiz.play.inputPlaceholder')}
                disabled={phase === 'revealed'}
                $state={phase === 'revealed' ? (lastCorrect ? 'correct' : 'wrong') : 'idle'}
                autoFocus
              />
              {phase === 'question' && (
                <TextBtns>
                  <GiveUpBtn onClick={onGiveUp}>{t('quiz.play.giveUp')}</GiveUpBtn>
                  <SubmitBtn onClick={onSubmitText} disabled={!textValue.trim()}>{t('quiz.play.submit')}</SubmitBtn>
                </TextBtns>
              )}
            </TextAnswer>
          ) : (
            <Options>
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
          )}
          </>
          )}

          {phase === 'revealed' && (
            <RevealCard $correct={lastCorrect}>
              <RevealVerdict $correct={lastCorrect}>
                {lastCorrect ? <><Check size={16} /> {t('quiz.play.correct')}</> : <><X size={16} /> {t('quiz.play.wrong')}</>}
              </RevealVerdict>
              <RevealBody>
                {q.reveal.imageUrl && <RevealImg src={q.reveal.imageUrl} alt="" draggable={false} />}
                <div>
                  <RevealTitle>{q.reveal.title}</RevealTitle>
                  {q.reveal.subtitle && <RevealSub>{q.reveal.subtitle}</RevealSub>}
                </div>
              </RevealBody>
              <NextBtn onClick={onNext}>
                {idx + 1 >= ROUND ? t('quiz.play.seeResult') : t('quiz.play.next')}
              </NextBtn>
            </RevealCard>
          )}
        </Body>
      )}
    </Root>
  );
};

// ─── 울음소리 플레이어 ─────────────────────────────────────────────────────────
const AudioPlayer = ({ url, label }: { url: string; label: string }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {}); // 자동재생 차단 시 버튼으로 재생
  }, [url]);
  const play = () => { const a = ref.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } };
  return (
    <AudioWrap>
      <audio ref={ref} src={url} preload="auto" />
      <SpeakerBtn onClick={play}><Volume2 size={30} /> {label}</SpeakerBtn>
    </AudioWrap>
  );
};

// ─── 종족값 대결(HigherLower) ─────────────────────────────────────────────────
const DuelView = ({ duel, phase, onSelect, t }: {
  duel: NonNullable<QuizQuestion['duel']>;
  phase: Phase;
  onSelect: (i: number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const revealed = phase === 'revealed';
  const rightHigher = duel.right.value > duel.left.value;
  return (
    <DuelWrap>
      <DuelPanel>
        <DuelImg src={duel.left.imageUrl} alt="" draggable={false} />
        <DuelInfo>
          <DuelName>“{duel.left.name}”</DuelName>
          <DuelStatCap>{duel.statLabel}</DuelStatCap>
          <DuelValue>{duel.left.value}</DuelValue>
        </DuelInfo>
      </DuelPanel>

      <VsBadge>VS</VsBadge>

      <DuelPanel>
        <DuelImg src={duel.right.imageUrl} alt="" draggable={false} />
        <DuelInfo>
          <DuelName>“{duel.right.name}”</DuelName>
          {!revealed ? (
            <DuelBtns>
              <DuelBtn $dir="up" onClick={() => onSelect(0)}><ChevronUp size={18} /> {t('quiz.play.duelMore')}</DuelBtn>
              <DuelBtn $dir="down" onClick={() => onSelect(1)}><ChevronDown size={18} /> {t('quiz.play.duelLess')}</DuelBtn>
            </DuelBtns>
          ) : (
            <>
              <DuelStatCap>{duel.statLabel}</DuelStatCap>
              <DuelValue $dir={rightHigher ? 'up' : 'down'}>{duel.right.value}</DuelValue>
            </>
          )}
        </DuelInfo>
      </DuelPanel>
    </DuelWrap>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드(SURFACE/SURFACE_HI/BORDER), 알약 배지, 원형 스피너·마크,
//           backdrop-filter, 둥근 모서리, 번지는 그림자, Tailwind 팔레트.

/** 대기 표시 — 원이 돌지 않고 네모가 깜빡인다. */
const blockBlink = keyframes`
  0%,  49%  { opacity: 1;    }
  50%, 100% { opacity: 0.25; }
`;
const pop = keyframes`0%{opacity:0}100%{opacity:1}`;

const Progress = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
  font-variant-numeric: tabular-nums;
`;
const ScorePills = styled.div`display: flex; align-items: center; gap: ${SP.xs}; flex: 0 0 auto;`;
const CountPill = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  min-width: 34px; justify-content: center;
  font-size: ${FONT.sm};
  padding: ${SP.xs} ${SP.sm};
  border: 2px solid ${C.ink};
  background: ${C.panelSunk};
  font-variant-numeric: tabular-nums;
`;
const CorrectPill = styled(CountPill)`color: ${C.green};`;
const WrongPill   = styled(CountPill)`color: ${C.red};`;
const StreakPill  = styled(CountPill)`color: ${C.gold};`;

/** 진행 게이지 — 파인 트랙 + 각진 막대. */
const ProgressBar = styled.div`
  height: ${SCALE * 2}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
`;
const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%; width: ${p => p.$pct}%; background: ${C.cyan};
`;

/** 읽는 화면이라 좁은 폭. 여백은 공용 껍데기가 정한다. */
const Body = styled(ScreenBody).attrs({ $narrow: true })``;

const Prompt = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl}; text-align: center; margin: 0;
  ${shadowLg}
  word-break: keep-all;
  ${media.mobile} { font-size: ${FONT.sm}; }
`;
/** 초성 등 큰 글자 — 파인 면 위에 시안 단색. 글로우를 걷어냈다. */
const BigText = styled.div`
  ${sunken()}
  ${pixelBold}
  text-align: center; color: ${C.cyan};
  font-size: 48px; line-height: 1.25; word-break: keep-all;
  padding: ${SP.md}; margin: 0 auto;
  ${shadowLg}
  ${media.mobile} { font-size: ${FONT.display}; }
`;

// ─── 랜덤 힌트 목록 ────────────────────────────────────────────────────────────
const HintList = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const HintRow = styled.div`
  ${sunken()}
  display: flex; align-items: flex-start; gap: ${SP.sm};
  padding: ${SP.sm} ${SP.md};
`;
/** 번호 — 원이 아니라 네모. */
const HintNo = styled.div`
  ${pixelBold}
  flex: 0 0 auto; width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.ink}; background: ${C.cyan};
  border: 2px solid ${C.ink};
  text-shadow: none;
`;
const HintText = styled.div`
  flex: 1; min-width: 0; font-size: ${FONT.sm}; color: ${C.text};
  word-break: keep-all;
`;

// ─── 종족값 대결 스타일 ────────────────────────────────────────────────────────
const DuelWrap = styled.div`
  position: relative; display: flex; gap: ${SP.sm}; align-items: stretch;
`;
const DuelPanel = styled.div`
  ${sunken()}
  position: relative; flex: 1; min-width: 0; overflow: hidden;
  min-height: 300px; display: flex; align-items: center; justify-content: center;
  ${media.mobile} { min-height: 240px; }
`;
const DuelImg = styled.img`
  position: absolute; inset: 0; margin: auto; width: 80%; height: 80%; object-fit: contain;
  pointer-events: none;
`;
const DuelInfo = styled.div`
  position: relative; z-index: 1; width: 100%; padding: ${SP.md} ${SP.sm};
  display: flex; flex-direction: column; align-items: center; gap: ${SP.sm};
  background: rgba(22, 27, 40, 0.72);
`;
const DuelName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text}; text-align: center; word-break: keep-all;
  text-shadow: 1px 1px 0 ${C.ink};
`;
const DuelStatCap = styled.div`
  font-size: ${FONT.sm}; color: ${C.textSub};
`;
const DuelValue = styled.div<{ $dir?: 'up' | 'down' }>`
  ${pixelBold}
  font-size: ${FONT.display}; font-variant-numeric: tabular-nums; line-height: 1.2;
  color: ${p => (p.$dir === 'up' ? C.green : p.$dir === 'down' ? C.red : C.cyan)};
  text-shadow: ${SCALE}px ${SCALE}px 0 ${C.ink};
  ${media.mobile} { font-size: ${FONT.xl}; }
`;
const DuelBtns = styled.div`display: flex; flex-direction: column; gap: ${SP.sm}; width: 100%; max-width: 210px;`;
const DuelBtn = styled.button<{ $dir: 'up' | 'down' }>`
  ${p => btn(p.$dir === 'up' ? 'green' : 'red')}
  ${pixelBold}
  display: flex; align-items: center; justify-content: center; gap: ${SP.xs};
  padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm}; color: ${C.text};
  ${focusRing}
`;
const VsBadge = styled.div`
  ${pixelBold}
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3;
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.ink}; background: ${C.gold};
  border: ${SCALE}px solid ${C.ink};
  text-shadow: none;
  ${media.mobile} { width: 32px; height: 32px; }
`;

const MediaWrap = styled.div<{ $zoom?: boolean }>`
  ${sunken()}
  display: flex; align-items: center; justify-content: center;
  padding: ${SP.sm}; overflow: hidden;
  /* 확대 퀴즈는 크롭 창을 이미지와 같은 정사각형으로(가로로 퍼지지 않게). */
  ${p => (p.$zoom ? 'width: fit-content; margin: 0 auto;' : '')}
`;
const MediaImg = styled.img<{ $silhouette: boolean; $zoom?: { x: number; y: number } }>`
  width: 210px; height: 210px; object-fit: contain;
  filter: ${p => (p.$silhouette ? 'brightness(0)' : 'none')};
  transform: ${p => (p.$zoom ? 'scale(15)' : 'scale(1)')};
  transform-origin: ${p => (p.$zoom ? `${p.$zoom.x}% ${p.$zoom.y}%` : 'center')};
  ${media.mobile} { width: 160px; height: 160px; }
`;

const AudioWrap = styled.div`display: flex; align-items: center; justify-content: center; padding: ${SP.lg} 0;`;
const SpeakerBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  display: flex; flex-direction: column; align-items: center; gap: ${SP.sm};
  padding: ${SP.xl} ${SP.xxl};
  color: ${C.cyan}; font-size: ${FONT.sm};
  ${focusRing}
`;

const Options = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: ${SP.sm};
`;
/** 보기 — 정답/오답이 밝혀지면 창틀 색이 바뀐다. */
const OptBtn = styled.button<{ $state: 'idle' | 'correct' | 'wrong' | 'dim'; $img: boolean }>`
  ${p => btn(p.$state === 'correct' ? 'green' : p.$state === 'wrong' ? 'red' : 'plain')}
  ${pixelBold}
  position: relative; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: ${SP.sm};
  padding: ${SP.md} ${SP.sm};
  min-height: ${p => (p.$img ? '150px' : '56px')};
  font-size: ${FONT.sm};
  color: ${C.text};
  opacity: ${p => (p.$state === 'dim' ? 0.45 : 1)};
  &:disabled { cursor: default; }
  ${focusRing}
  ${media.mobile} { min-height: ${p => (p.$img ? '124px' : '50px')}; }
`;
const OptImg = styled.img`
  width: 108px; height: 108px; object-fit: contain; pointer-events: none;
  ${media.mobile} { width: 84px; height: 84px; }
`;
const OptLabel = styled.span`text-align: center; word-break: keep-all;`;
/** 정오 표시 — 원이 아니라 네모. */
const Mark = styled.span<{ $ok?: boolean }>`
  ${pixelBold}
  position: absolute; top: 2px; right: 2px;
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  background: ${p => (p.$ok ? C.green : C.red)};
  border: 2px solid ${C.ink};
  color: ${C.ink};
  text-shadow: none;
`;

// ─── 주관식 입력 ───────────────────────────────────────────────────────────────
const TextAnswer = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const TextInput = styled.input<{ $state: 'idle' | 'correct' | 'wrong' }>`
  ${sunken()}
  ${pixelBold}
  width: 100%; padding: ${SP.md}; font-size: ${FONT.sm};
  text-align: center; color: ${C.text}; outline: none; box-sizing: border-box;
  ${focusRing}
  box-shadow: inset 0 0 0 ${SCALE}px ${p =>
    p.$state === 'correct' ? C.green : p.$state === 'wrong' ? C.red : C.cyan};
  &::placeholder { color: ${C.textDim}; font-weight: 400; }
  ${focusRing}
`;
const TextBtns = styled.div`display: flex; gap: ${SP.sm};`;
const SubmitBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  flex: 1; padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const GiveUpBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  flex: 0 0 auto; padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm}; color: ${C.textSub};
  ${focusRing}
`;

const RevealCard = styled.div<{ $correct: boolean }>`
  ${p => win(p.$correct ? 'green' : 'red')}
  animation: ${pop} 0.18s steps(2, end) both;
  display: flex; flex-direction: column; gap: ${SP.sm};
  padding: ${SP.md};
`;
const RevealVerdict = styled.div<{ $correct: boolean }>`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm};
  color: ${p => (p.$correct ? C.green : C.red)};
`;
const RevealBody = styled.div`display: flex; align-items: center; gap: ${SP.md};`;
const RevealImg = styled.img`width: 76px; height: 76px; object-fit: contain; flex: 0 0 auto;`;
const RevealTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
`;
const RevealSub = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
const NextBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;

const CenterMsg = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${SP.md}; padding: ${SP.xxl};
`;
const Spinner = styled.div`
  width: 16px; height: 16px; background: ${C.cyan};
  animation: ${blockBlink} 0.7s steps(1, end) infinite;
`;
const DimText = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;
const ErrText = styled.div`font-size: ${FONT.sm}; color: ${C.textSub}; text-align: center;`;

const ResultWrap = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${SP.md}; padding: ${SP.xxl} ${SP.lg};
`;
const GradeBadge = styled.div<{ $g: number }>`
  ${pixelBold}
  font-size: ${FONT.sm}; padding: ${SP.xs} ${SP.md};
  background: ${C.panelSunk};
  border: ${SCALE}px solid ${C.ink};
  color: ${p => (p.$g <= 2 ? C.gold : p.$g <= 4 ? C.green : p.$g <= 6 ? C.blue : C.textSub)};
`;
const ResultScore = styled.div`
  ${pixelBold}
  font-size: ${FONT.display}; color: ${C.cyan};
  ${shadowLg}
`;
const NewBest = styled.div`
  ${winThin('gold')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
`;
const ResultStat = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
/** 연습 판(10·30문항)에 붙는 안내 — 기록은 남지만 보드에는 올라가지 않는다. */
const RankNote = styled.div`
  ${winThin('plain')}
  font-size: ${FONT.sm}; color: ${C.textDim};
  max-width: 320px; text-align: center; word-break: keep-all;
`;
const MilestoneBox = styled.div`
  ${winThin('purple')}
  display: flex; flex-direction: column; gap: ${SP.xs}; align-items: center;
  padding: ${SP.sm} ${SP.md}; margin: ${SP.xs} 0;
`;
const MilestoneTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.purple};
`;
const MilestoneRow = styled.div`
  display: flex; align-items: center; gap: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.textSub};
`;
const MilestoneRw = styled.span<{ $c: string }>`
  ${pixelBold}
  color: ${p => p.$c};
`;
const ResultBtns = styled.div`display: flex; gap: ${SP.sm}; margin-top: ${SP.md};`;
const PrimaryBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.sm} ${SP.lg};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const GhostBtn = styled.button`
  ${btn('plain')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.lg};
  font-size: ${FONT.sm}; color: ${C.textSub};
  ${focusRing}
`;
