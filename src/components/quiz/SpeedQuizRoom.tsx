// src/components/quiz/SpeedQuizRoom.tsx
// 퀴즈 속도전 방 — 대기실 · 문제 진행 · 정답 공개 · 최종 결과.
//
// 진행 주체는 **호스트 한 명**이다. 호스트만 문제를 만들고(QuizEngine) 정답을 들고 있으며,
// 채점 결과만 방에 방송한다. 참가자 화면은 방 데이터를 그대로 렌더링하는 얇은 뷰다.
//
// 언어는 **방 단위**로 하나다(config.lang, 만들 때 호스트가 고름). 호스트는 자기 UI 언어가
// 아니라 방 언어로 문제를 만든다 — 도감설명·힌트·초성열은 원문이라 번역할 수 없고,
// 방마다 언어가 정해져 있어야 참가자가 목록에서 무엇을 보게 될지 알 수 있다.
// 지문은 문장이 아니라 `payload.kind`(+타입 슬러그 같은 키 재료)만 보내 각자 화면에서
// 자기 언어로 조립한다 — speedPrompt()/speedPlaceholder() 참조.

import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ArrowLeft, Check, X, Crown, Users, Volume2, Play } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation, translateIn } from '../../i18n';
import { createSpeedSession, normalizeAnswer } from '../../services/QuizEngine';
import { quizRoomService, speedPoints, normalizeKinds, QUIZ_RTDB_TIMEOUT_MS } from '../../services/QuizRoomService';
import { quizService } from '../../services/QuizService';
import { databaseService } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { serverNow } from '../../config/firebase';
import { QUIZ_MAX_PLAYERS_PER_ROOM } from '../../config/rtdbBudget';
import { QuizRoom, QuizRoundResult, QuizAnswer, QuizRoomLang } from '../../types/quizRoom';
import { SpeedRevealPayload, SpeedRoundPayload, speedKindsForLang } from '../../types/quiz';

/** 정답 공개를 보여 주는 시간(ms). 너무 짧으면 누가 몇 점 받았는지 못 읽는다. */
const REVEAL_MS = 3500;

/**
 * 문제 지문 — 호스트가 보낸 건 `kind`(+슬러그)뿐이고 문장은 **각자 자기 언어로** 만든다.
 * 대부분은 솔로 종목의 지문 키를 그대로 쓰고, 매개변수가 필요한 셋만 갈라 낸다.
 */
function speedPrompt(
  p: SpeedRoundPayload, t: (k: string, params?: Record<string, string | number>) => string,
): string {
  if (p.kind === 'chosungEasy') {
    return t('quiz.play.chosungEasyPrompt', { cat: t(`quiz.chosung.cat.${p.chosungCat ?? 'pokemon'}`) });
  }
  if (p.kind === 'typeHard') {
    return t('quiz.play.typeHardPrompt', { types: (p.typeSlugs ?? []).map(s => t(`types.${s}`)).join(' / ') });
  }
  // 솔로 타입(쉬움) 지문은 포켓몬 이름을 끼워 넣는데, 속도전은 이름을 못 보낸다
  // (언어가 섞인 방에서 남의 말로 보이고, 이름 자체가 힌트가 된다) → 전용 지문을 쓴다.
  if (p.kind === 'type') return t('quiz.speed.typePrompt');
  return t(`quiz.play.${p.kind}Prompt`);
}

/**
 * 입력창 안내 문구. 모든 종목의 정답이 포켓몬 이름인 건 아니다 —
 * 타입(쉬움)은 타입 조합이고, 초성은 기술·특성·도구도 나온다.
 */
function speedPlaceholder(
  p: SpeedRoundPayload, t: (k: string, params?: Record<string, string | number>) => string,
): string {
  if (p.kind === 'type') return t('quiz.speed.typeInputPlaceholder');
  if (p.kind === 'chosungEasy') {
    return t('quiz.play.chosungEasyPlaceholder', { cat: t(`quiz.chosung.cat.${p.chosungCat ?? 'pokemon'}`) });
  }
  if (p.kind === 'chosungHard') return t('quiz.play.chosungHardPlaceholder');
  return t('quiz.play.inputPlaceholder');
}

interface Props {
  roomId: string;
  onExit: () => void;
}

export const SpeedQuizRoom = ({ roomId, onExit }: Props) => {
  const { t } = useTranslation();
  const [room, setRoom] = useState<QuizRoom | null>(null);
  /** 호스트만 구독하는 답안 본문(채점용). 참가자에겐 룰이 읽기를 막는다. */
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [gone, setGone] = useState(false);
  /** 첫 스냅샷이 오래 오지 않음 = 연결 거절(서버 붐빔) 가능성. */
  const [stalled, setStalled] = useState(false);
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => serverNow());

  const myUid = authService.getCurrentUser()?.uid ?? '';
  const isHost = !!room && room.hostId === myUid;
  const players = room ? Object.values(room.players ?? {}) : [];
  const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const iAnswered = !!room?.players?.[myUid]?.answered;
  const answeredCount = players.filter(p => p.answered).length;

  // 호스트만 들고 있는 현재 문제의 정답/공개 정보. 방에는 공개 시점까지 올리지 않는다.
  const sessionRef = useRef(createSpeedSession());
  const acceptRef = useRef<string[]>([]);
  const revealRef = useRef<SpeedRevealPayload | null>(null);
  // 같은 라운드를 두 번 시작/공개하지 않도록 하는 진행 마커(구독 콜백이 여러 번 뜨므로 필수).
  const startedRef = useRef(-1);
  const revealedRef = useRef(-1);
  const settledRef = useRef(false); // 최종 정산 1회 보장

  // ─── 구독 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    quizRoomService.acquire();
    const off = quizRoomService.subscribeRoom(roomId, r => {
      if (!r) { setGone(true); return; }
      setRoom(r);
    });
    // 동시 연결 한도(무료 100개)를 넘으면 서버가 연결을 거절하고, 구독 콜백이 **한 번도**
    // 오지 않는다 → 예전엔 "문제 준비 중..."에서 영원히 멈췄다. 원인을 알려 주고 빠져나갈 길을 준다.
    const timeout = setTimeout(() => setStalled(true), QUIZ_RTDB_TIMEOUT_MS);
    return () => { clearTimeout(timeout); off(); quizRoomService.release(); };
  }, [roomId]);

  // 답안 본문은 호스트만 읽는다. 참가자가 구독하면 권한 오류가 나므로 호스트일 때만 건다.
  useEffect(() => {
    if (!isHost) return;
    return quizRoomService.subscribeAnswers(roomId, setAnswers);
  }, [isHost, roomId]);

  // 남은 시간 표시용 틱. 진행 중일 때만 돌린다.
  useEffect(() => {
    if (room?.phase !== 'question') return;
    const id = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(id);
  }, [room?.phase, room?.round?.index]);

  const leave = useCallback(async () => {
    await quizRoomService.leaveRoom(roomId);
    onExit();
  }, [roomId, onExit]);

  /**
   * 방이 사라졌거나 아예 연결하지 못한 상태에서의 탈출.
   * leaveRoom을 쓰면 응답이 오지 않는 remove를 기다리며 버튼이 먹통이 되므로 로컬만 정리한다.
   * forgetRoom()이 없으면 busy 프로브가 계속 "방에 있음"을 돌려줘 연결이 반납되지 않는다.
   */
  const abandon = useCallback(() => {
    quizRoomService.forgetRoom();
    onExit();
  }, [onExit]);

  // ─── 호스트: 다음 문제 ──────────────────────────────────────────────────────
  const startRound = useCallback(async (index: number, seconds: number) => {
    if (startedRef.current >= index) return;
    startedRef.current = index;
    try {
      // ⚠️ UI 언어(t/language)가 아니라 **방 언어**로 만든다. 한국어 UI 호스트가 영어 방을
      //    열 수 있으므로, 여기서 t를 그대로 쓰면 참가자에게 남의 언어 지문이 나간다.
      const rl = roomLangRef.current;
      const r = await sessionRef.current.next(
        { t: (k, v) => translateIn(rl, k, v), lang: rl }, kindsRef.current);
      acceptRef.current = r.accept;
      revealRef.current = r.reveal;
      await quizRoomService.pushRound(roomId, index, r.payload, seconds, playerIdsRef.current);
    } catch {
      // 문제 생성 실패(PokeAPI 일시 오류 등) → 마커를 되돌리고 잠시 뒤 재시도.
      //   방 상태가 안 바뀌면 구독 콜백이 다시 오지 않으므로, 여기서 직접 재시도하지 않으면
      //   게임이 그대로 멈춘다.
      startedRef.current = index - 1;
      setTimeout(() => startRoundRef.current?.(index, seconds), 1500);
    }
  }, [roomId]);

  // 재시도에서 최신 startRound를 부르기 위한 참조(자기 자신을 deps에 넣을 수 없어서).
  const startRoundRef = useRef(startRound);
  startRoundRef.current = startRound;
  // 제출 플래그를 비울 대상. startRound가 매 라운드 새로 만들어지지 않도록 ref로 전달한다.
  const playerIdsRef = useRef<string[]>([]);
  playerIdsRef.current = room ? Object.keys(room.players ?? {}) : [];
  // 방 언어·출제 종목. startRound 생성 시점엔 방 데이터가 아직 없으므로 ref로 넘긴다.
  const roomLang: QuizRoomLang = room?.config?.lang === 'en' ? 'en' : 'ko';
  const roomKinds = normalizeKinds(room?.config?.kinds, roomLang);
  const kindsRef = useRef(roomKinds);
  kindsRef.current = roomKinds;
  const roomLangRef = useRef(roomLang);
  roomLangRef.current = roomLang;

  const beginGame = useCallback(async () => {
    if (!room) return;
    await quizRoomService.startGame(roomId);
    await startRound(0, room.config.seconds);
  }, [room, roomId, startRound]);

  // ─── 호스트: 채점 & 정답 공개 ───────────────────────────────────────────────
  const doReveal = useCallback(async () => {
    const r = room;
    if (!r?.round || !revealRef.current) return;
    const idx = r.round.index;
    if (revealedRef.current >= idx) return;
    revealedRef.current = idx;

    const limitMs = r.config.seconds * 1000;
    const accepted = acceptRef.current.map(normalizeAnswer);
    // 정답자만 제출 시각 순으로 줄 세운다(서버 시각이라 조작 불가).
    const correct = Object.entries(answers)
      .filter(([, a]) => accepted.includes(normalizeAnswer(a.text)))
      .sort((a, b) => a[1].at - b[1].at);

    const results: Record<string, QuizRoundResult> = {};
    correct.forEach(([uid, a], i) => {
      const ms = Math.max(0, a.at - r.round!.startedAt);
      results[uid] = { ok: true, ms, points: speedPoints(ms, limitMs, i + 1), order: i + 1 };
    });
    const next: Record<string, { score: number; correct: number }> = {};
    for (const [uid, p] of Object.entries(r.players ?? {})) {
      if (!results[uid]) results[uid] = { ok: false, points: 0, order: 0 };
      next[uid] = {
        score: (p.score ?? 0) + results[uid].points,
        correct: (p.correct ?? 0) + (results[uid].ok ? 1 : 0),
      };
    }
    try {
      await quizRoomService.pushReveal(roomId, revealRef.current, results, next);
    } catch {
      // 공개 전송 실패 → 마커를 되돌려 다음 스냅샷/타이머에 다시 시도(게임 정지 방지).
      revealedRef.current = idx - 1;
    }
  }, [room, roomId, answers]);

  // 전원이 답을 냈으면 즉시 공개, 아니면 마감 시각에 공개.
  useEffect(() => {
    if (!isHost || !room || room.phase !== 'question' || !room.round) return;
    if (revealedRef.current >= room.round.index) return;
    const total = Object.keys(room.players ?? {}).length;
    if (total > 0 && answeredCount >= total) { doReveal(); return; }
    // +250ms — 마감 직전에 도착한 답이 반영될 여유.
    const wait = Math.max(0, room.round.endsAt - serverNow()) + 250;
    const timer = setTimeout(doReveal, wait);
    return () => clearTimeout(timer);
  }, [isHost, room, doReveal, answeredCount]);

  // 공개가 끝나면 다음 문제, 마지막이면 종료.
  useEffect(() => {
    if (!isHost || !room || room.phase !== 'reveal' || !room.round) return;
    const nextIndex = room.round.index + 1;
    const timer = setTimeout(() => {
      if (nextIndex >= room.config.rounds) quizRoomService.finishGame(roomId);
      else startRound(nextIndex, room.config.seconds);
    }, REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isHost, room, roomId, startRound]);

  // 호스트가 사라졌으면(브라우저 종료 등) 남은 사람이 게임을 끝낸다 —
  // 문제 생성·채점을 이어받을 수 없으므로 그 시점 점수로 결과를 낸다.
  useEffect(() => {
    if (!room || room.status === 'finished' || isHost) return;
    if (room.players?.[room.hostId]) return;
    quizRoomService.forceFinishHostGone(roomId);
  }, [room, isHost, roomId]);

  // ─── 최종 정산(각자 자기 기록만, 1회) ───────────────────────────────────────
  useEffect(() => {
    if (!room || room.status !== 'finished' || settledRef.current) return;
    settledRef.current = true;
    const me = room.players?.[myUid];
    if (!me) return;
    const top = Math.max(0, ...Object.values(room.players ?? {}).map(p => p.score ?? 0));
    const won = (me.score ?? 0) >= top && top > 0;
    const stats = quizService.recordSpeedGame(me.score ?? 0, won);
    databaseService.updateQuizSpeedRanking(stats).catch(() => {});
    // 주간 'speed' 보드는 한 판 최고 점수 기준. 경신했을 때만 1 write.
    if (quizService.recordWeekly('speed', me.score ?? 0)) {
      databaseService.updateQuizWeekly('speed', me.score ?? 0).catch(() => {});
    }
  }, [room, myUid]);

  const submit = async () => {
    if (!text.trim() || iAnswered || room?.phase !== 'question') return;
    await quizRoomService.submitAnswer(roomId, text.trim());
    setText('');
  };

  // ─── 렌더 ──────────────────────────────────────────────────────────────────
  if (gone) {
    return (
      <Root>
        <TopBar><BackBtn onClick={abandon}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn><Title>{t('quiz.speed.title')}</Title><Spacer /></TopBar>
        <Center><Dim>{t('quiz.speed.roomClosed')}</Dim><PrimaryBtn onClick={abandon}>{t('quiz.result.exit')}</PrimaryBtn></Center>
      </Root>
    );
  }
  if (!room) {
    return (
      <Root>
        <TopBar><BackBtn onClick={abandon}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn><Title>{t('quiz.speed.title')}</Title><Spacer /></TopBar>
        <Center>
          <Dim>{stalled ? t('quiz.speed.serverBusy') : t('quiz.play.loading')}</Dim>
          {stalled && <PrimaryBtn onClick={abandon}>{t('quiz.result.exit')}</PrimaryBtn>}
        </Center>
      </Root>
    );
  }

  const finished = room.status === 'finished';
  const round = room.round;
  const remainMs = round ? Math.max(0, round.endsAt - now) : 0;
  const remainPct = round ? (remainMs / (room.config.seconds * 1000)) * 100 : 0;
  const myResult = round?.results?.[myUid];

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={leave}><ArrowLeft size={16} /> {t('quiz.speed.leave')}</BackBtn>
        <Title>
          {finished ? t('quiz.result.title')
            : room.status === 'waiting' ? t('quiz.speed.waitingRoom')
            : t('quiz.play.progress', { cur: (round?.index ?? 0) + 1, total: room.config.rounds })}
        </Title>
        <Count><Users size={13} /> {players.length}/{QUIZ_MAX_PLAYERS_PER_ROOM}</Count>
      </TopBar>

      {room.phase === 'question' && <TimerBar><TimerFill $pct={remainPct} $low={remainPct < 30} /></TimerBar>}

      <Body>
        {/* ── 대기실 ── */}
        {room.status === 'waiting' && (
          <Panel>
            <PanelTitle>{t('quiz.speed.waitingTitle')}</PanelTitle>
            <PanelDesc>
              {t('quiz.hub.qCount', { n: room.config.rounds })} · {t('quiz.speed.secondsValue', { n: room.config.seconds })}
            </PanelDesc>
            <PanelTags>
              <Tag>{t(`quiz.speed.lang.${roomLang}`)}</Tag>
              {roomKinds.length === speedKindsForLang(roomLang).length
                ? <Tag>{t('quiz.speed.kindsAll')}</Tag>
                : roomKinds.map(k => <Tag key={k}>{t(`quiz.types.${k}.name`)}</Tag>)}
            </PanelTags>
            <Hint>{t('quiz.speed.scoreHint')}</Hint>
            {isHost ? (
              <PrimaryBtn onClick={beginGame} disabled={players.length < 2}>
                <Play size={15} /> {players.length < 2 ? t('quiz.speed.needPlayers') : t('quiz.speed.startBtn')}
              </PrimaryBtn>
            ) : (
              <Dim>{t('quiz.speed.waitHost', { name: room.hostName })}</Dim>
            )}
          </Panel>
        )}

        {/* ── 문제 / 정답 공개 ── */}
        {!finished && room.status === 'playing' && round && (
          <>
            <Prompt>{speedPrompt(round.payload, t)}</Prompt>

            {round.payload.bigText && <BigText>{round.payload.bigText}</BigText>}

            {round.payload.text && <FlavorText>“{round.payload.text}”</FlavorText>}

            {round.payload.hintLines && (
              <HintList>
                {round.payload.hintLines.map((line, i) => (
                  <HintRow key={i}><HintNo>{i + 1}</HintNo><HintText>{line}</HintText></HintRow>
                ))}
              </HintList>
            )}

            {round.payload.audioUrl && <CryPlayer url={round.payload.audioUrl} label={t('quiz.play.playCry')} />}

            {round.payload.imageUrl && (
              <MediaWrap $zoom={!!round.payload.zoom}>
                <MediaImg
                  src={round.payload.imageUrl}
                  alt=""
                  $silhouette={!!round.payload.silhouette && room.phase === 'question'}
                  $zoom={round.payload.zoom && room.phase === 'question' ? round.payload.zoom : undefined}
                  draggable={false}
                />
              </MediaWrap>
            )}

            {room.phase === 'question' ? (
              <AnswerRow>
                <TextInput
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder={iAnswered ? t('quiz.speed.answered') : speedPlaceholder(round.payload, t)}
                  disabled={iAnswered}
                  autoFocus
                />
                <SubmitBtn onClick={submit} disabled={iAnswered || !text.trim()}>{t('quiz.play.submit')}</SubmitBtn>
              </AnswerRow>
            ) : (
              <RevealCard $correct={!!myResult?.ok}>
                <RevealVerdict $correct={!!myResult?.ok}>
                  {myResult?.ok
                    ? <><Check size={16} /> {t('quiz.speed.gotIt', { n: myResult.points, order: myResult.order })}</>
                    : <><X size={16} /> {t('quiz.play.wrong')}</>}
                </RevealVerdict>
                <RevealBody>
                  {round.reveal?.imageUrl && <RevealImg src={round.reveal.imageUrl} alt="" draggable={false} />}
                  <div>
                    <RevealTitle>{round.reveal?.title}</RevealTitle>
                    {round.reveal?.subtitle && <RevealSub>{round.reveal.subtitle}</RevealSub>}
                  </div>
                </RevealBody>
              </RevealCard>
            )}
          </>
        )}

        {/* ── 최종 결과 ── */}
        {finished && (
          <Panel>
            <PanelTitle>{t('quiz.speed.finalTitle')}</PanelTitle>
            {ranked[0] && <Winner><Crown size={16} /> {t('quiz.speed.winner', { name: ranked[0].name })}</Winner>}
            <ResultBtns>
              <PrimaryBtn onClick={leave}>{t('quiz.result.exit')}</PrimaryBtn>
            </ResultBtns>
          </Panel>
        )}

        {/* ── 점수판(항상) ── */}
        <Board>
          {ranked.map((p, i) => {
            const res = round?.results?.[p.userId];
            return (
              <BoardRow key={p.userId} $me={p.userId === myUid}>
                <BoardRank $top={i === 0 && (p.score ?? 0) > 0}>{i + 1}</BoardRank>
                <BoardName>
                  {p.name}
                  {p.userId === room.hostId && <HostTag>{t('quiz.speed.hostTag')}</HostTag>}
                </BoardName>
                {room.phase === 'question' && p.answered && <Submitted><Check size={12} /></Submitted>}
                {room.phase === 'reveal' && res?.ok && <Gain>+{res.points}</Gain>}
                <BoardScore>{p.score ?? 0}</BoardScore>
              </BoardRow>
            );
          })}
        </Board>
      </Body>
    </Root>
  );
};

// 울음소리 — 문제가 바뀌면 자동 재생(차단되면 버튼으로).
const CryPlayer = ({ url, label }: { url: string; label: string }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { const a = ref.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } }, [url]);
  return (
    <AudioWrap>
      <audio ref={ref} src={url} preload="auto" />
      <SpeakerBtn onClick={() => { const a = ref.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } }}>
        <Volume2 size={28} /> {label}
      </SpeakerBtn>
    </AudioWrap>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
const pop = keyframes`0%{transform:translateY(4px);opacity:0}100%{transform:translateY(0);opacity:1}`;
const ACCENT = '#22d3ee';
const SURFACE = 'rgba(255,255,255,0.035)';
const SURFACE_HI = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.09)';

const Root = styled.div`min-height: 100vh; background: #0b0f14; color: #e7edf3; display: flex; flex-direction: column;`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 13px 20px; border-bottom: 1px solid ${BORDER};
  position: sticky; top: 0; z-index: 20; background: rgba(11,15,20,0.85); backdrop-filter: blur(10px);
  ${media.mobile} { padding: 10px 12px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid ${BORDER}; color: rgba(255,255,255,0.65);
  padding: 7px 12px; border-radius: 9px; cursor: pointer; font-size: 13px; white-space: nowrap;
  &:hover { background: ${SURFACE_HI}; color: #fff; }
`;
const Title = styled.h1`font-size: 15px; font-weight: 800; margin: 0; ${media.mobile} { font-size: 13.5px; }`;
const Spacer = styled.span`width: 40px;`;
const Count = styled.div`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 800;
  color: ${ACCENT}; font-variant-numeric: tabular-nums;
`;
const TimerBar = styled.div`height: 4px; background: rgba(255,255,255,0.06);`;
const TimerFill = styled.div<{ $pct: number; $low: boolean }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => p.$low ? '#f87171' : ACCENT};
  transition: width 0.1s linear, background 0.3s;
`;
const Body = styled.main`
  flex: 1; width: 100%; max-width: 620px; margin: 0 auto; padding: 20px 18px 44px;
  display: flex; flex-direction: column; gap: 14px;
  ${media.mobile} { padding: 16px 14px 36px; gap: 12px; }
`;
const Panel = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 20px 16px; border-radius: 14px; background: ${SURFACE}; border: 1px solid ${BORDER};
`;
const PanelTitle = styled.div`font-size: 17px; font-weight: 800;`;
const PanelDesc = styled.div`font-size: 12.5px; color: rgba(255,255,255,0.5);`;
const PanelTags = styled.div`display: flex; flex-wrap: wrap; justify-content: center; gap: 5px;`;
const Tag = styled.span`
  font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;
  color: rgba(34,211,238,0.85); background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.22);
`;
const Hint = styled.div`font-size: 11.5px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.5; word-break: keep-all;`;
const Prompt = styled.h2`
  font-size: 19px; font-weight: 800; text-align: center; margin: 0; line-height: 1.4; word-break: keep-all;
  ${media.mobile} { font-size: 16px; }
`;
const BigText = styled.div`
  font-size: 40px; font-weight: 900; text-align: center; letter-spacing: 0.12em;
  color: ${ACCENT}; padding: 18px 12px; border-radius: 14px;
  background: ${SURFACE}; border: 1px solid ${BORDER}; word-break: break-all;
  ${media.mobile} { font-size: 30px; padding: 14px 10px; }
`;
const FlavorText = styled.div`
  font-size: 15px; line-height: 1.6; text-align: center; word-break: keep-all;
  padding: 14px; border-radius: 12px; background: ${SURFACE}; border: 1px solid ${BORDER};
`;
const HintList = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const HintRow = styled.div`
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px;
  background: ${SURFACE}; border: 1px solid ${BORDER};
`;
const HintNo = styled.div`
  flex: 0 0 auto; width: 21px; height: 21px; border-radius: 50%; margin-top: 1px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 800; color: #062430; background: ${ACCENT};
`;
const HintText = styled.div`flex: 1; min-width: 0; font-size: 14px; font-weight: 600; line-height: 1.5; word-break: keep-all;`;
const MediaWrap = styled.div<{ $zoom?: boolean }>`
  display: flex; align-items: center; justify-content: center;
  background: ${SURFACE}; border: 1px solid ${BORDER};
  border-radius: 16px; padding: 12px; overflow: hidden;
  ${p => p.$zoom ? 'width: fit-content; margin: 0 auto;' : ''}
`;
const MediaImg = styled.img<{ $silhouette: boolean; $zoom?: { x: number; y: number } }>`
  width: 190px; height: 190px; object-fit: contain;
  filter: ${p => p.$silhouette ? 'brightness(0)' : 'none'};
  transform: ${p => p.$zoom ? 'scale(15)' : 'scale(1)'};
  transform-origin: ${p => p.$zoom ? `${p.$zoom.x}% ${p.$zoom.y}%` : 'center'};
  transition: filter 0.35s ease, transform 0.4s ease;
  ${media.mobile} { width: 150px; height: 150px; }
`;
const AudioWrap = styled.div`display: flex; align-items: center; justify-content: center; padding: 14px 0;`;
const SpeakerBtn = styled.button`
  display: flex; flex-direction: column; align-items: center; gap: 9px;
  padding: 22px 38px; border-radius: 16px; cursor: pointer;
  background: ${SURFACE}; border: 1px solid rgba(34,211,238,0.3); color: ${ACCENT};
  font-size: 13.5px; font-weight: 700;
  &:hover { background: rgba(34,211,238,0.1); }
`;
const AnswerRow = styled.div`display: flex; gap: 9px;`;
const TextInput = styled.input`
  flex: 1; min-width: 0; padding: 14px 16px; border-radius: 12px; font-size: 17px; font-weight: 700;
  text-align: center; color: #f1f5f9; outline: none;
  background: rgba(255,255,255,0.05); border: 1.5px solid rgba(34,211,238,0.4);
  &::placeholder { color: rgba(255,255,255,0.3); font-weight: 500; font-size: 14px; }
  &:focus { border-color: ${ACCENT}; }
  &:disabled { opacity: 0.55; }
  ${media.mobile} { font-size: 16px; padding: 12px 14px; }
`;
const SubmitBtn = styled.button`
  flex: 0 0 auto; padding: 0 22px; border-radius: 12px; border: none; cursor: pointer;
  background: ${ACCENT}; color: #04222b; font-size: 14.5px; font-weight: 800;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:not(:disabled):hover { filter: brightness(1.08); }
`;
const PrimaryBtn = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 12px 24px; border-radius: 11px; border: none; cursor: pointer;
  background: ${ACCENT}; color: #04222b; font-size: 15px; font-weight: 800;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:not(:disabled):hover { filter: brightness(1.08); }
`;
const RevealCard = styled.div<{ $correct: boolean }>`
  animation: ${pop} 0.18s ease both;
  display: flex; flex-direction: column; gap: 11px; padding: 15px; border-radius: 14px;
  border: 1px solid ${p => p.$correct ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.28)'};
  background: ${p => p.$correct ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.06)'};
`;
const RevealVerdict = styled.div<{ $correct: boolean }>`
  display: flex; align-items: center; gap: 6px; font-size: 14.5px; font-weight: 800;
  color: ${p => p.$correct ? '#34d399' : '#f87171'};
`;
const RevealBody = styled.div`display: flex; align-items: center; gap: 13px;`;
const RevealImg = styled.img`width: 70px; height: 70px; object-fit: contain; flex: 0 0 auto;`;
const RevealTitle = styled.div`font-size: 17px; font-weight: 800; color: #f8fafc;`;
const RevealSub = styled.div`font-size: 12.5px; color: rgba(255,255,255,0.6); margin-top: 3px;`;
const Winner = styled.div`
  display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 800; color: #fbbf24;
  background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3);
  padding: 8px 16px; border-radius: 100px;
`;
const ResultBtns = styled.div`display: flex; gap: 10px; margin-top: 6px;`;
const Board = styled.div`display: flex; flex-direction: column; gap: 5px; margin-top: 2px;`;
const BoardRow = styled.div<{ $me: boolean }>`
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px;
  background: ${p => p.$me ? 'rgba(34,211,238,0.09)' : SURFACE};
  border: 1px solid ${p => p.$me ? 'rgba(34,211,238,0.3)' : BORDER};
`;
const BoardRank = styled.div<{ $top: boolean }>`
  flex: 0 0 auto; width: 20px; text-align: center; font-size: 12.5px; font-weight: 800;
  color: ${p => p.$top ? '#fbbf24' : 'rgba(255,255,255,0.4)'};
`;
const BoardName = styled.div`
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
  font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const HostTag = styled.span`
  flex: 0 0 auto; font-size: 10px; font-weight: 800; color: #fbbf24;
  background: rgba(251,191,36,0.14); padding: 2px 6px; border-radius: 5px;
`;
const Submitted = styled.span`flex: 0 0 auto; display: flex; color: #34d399;`;
const Gain = styled.span`flex: 0 0 auto; font-size: 12.5px; font-weight: 800; color: #34d399;`;
const BoardScore = styled.div`
  flex: 0 0 auto; font-size: 14px; font-weight: 800; color: ${ACCENT};
  font-variant-numeric: tabular-nums; min-width: 34px; text-align: right;
`;
const Center = styled.div`flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px;`;
const Dim = styled.div`font-size: 13.5px; color: rgba(255,255,255,0.45); text-align: center; line-height: 1.6; word-break: keep-all;`;
