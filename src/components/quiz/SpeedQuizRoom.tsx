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
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody, ScreenSpacer as Spacer, ScreenTitle as Title, ScreenTopBar as TopBar } from '../shared/screen';
import { useTranslation, translateIn } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { win, winThin, btn, sunken, pixelBold, shadowLg, focusRing } from '../../styles/pixel';
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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드 3종, 알약 배지, 원형 번호, backdrop-filter, 둥근 모서리,
//           Tailwind 팔레트, 10~12px 미만 글자.

const pop = keyframes`0%{opacity:0}100%{opacity:1}`;

/** 제한시간 게이지 — 파인 트랙 + 각진 막대. */
const TimerBar = styled.div`
  height: ${SCALE * 2}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
`;
const TimerFill = styled.div<{ $pct: number; $low: boolean }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => (p.$low ? C.red : C.cyan)};
  transition: width 0.1s linear;
`;
/** 읽는 화면이라 좁은 폭. 여백은 공용 껍데기가 정한다. */
const Body = styled(ScreenBody).attrs({ $narrow: true })``;
const Panel = styled.div`
  ${win('plain')}
  display: flex; flex-direction: column; align-items: center; gap: ${SP.sm};
  padding: ${SP.lg} ${SP.md};
`;
const PanelTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm};
`;
const PanelDesc = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
const PanelTags = styled.div`display: flex; flex-wrap: wrap; justify-content: center; gap: ${SP.xs};`;
const Tag = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; padding: 0 ${SP.xs};
  color: ${C.cyan};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
`;
const Hint = styled.div`font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; word-break: keep-all;`;
const Prompt = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl}; text-align: center; margin: 0; word-break: keep-all;
  ${shadowLg}
  ${media.mobile} { font-size: ${FONT.sm}; }
`;
const BigText = styled.div`
  ${sunken()}
  ${pixelBold}
  font-size: ${FONT.display}; text-align: center;
  color: ${C.cyan}; padding: ${SP.md};
  word-break: break-all;
  ${shadowLg}
  ${media.mobile} { font-size: ${FONT.xl}; }
`;
const FlavorText = styled.div`
  ${sunken()}
  font-size: ${FONT.sm}; text-align: center; word-break: keep-all;
  padding: ${SP.md};
`;
const HintList = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const HintRow = styled.div`
  ${sunken()}
  display: flex; align-items: flex-start; gap: ${SP.sm}; padding: ${SP.sm} ${SP.md};
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
const HintText = styled.div`flex: 1; min-width: 0; font-size: ${FONT.sm}; word-break: keep-all;`;
const MediaWrap = styled.div<{ $zoom?: boolean }>`
  ${sunken()}
  display: flex; align-items: center; justify-content: center;
  padding: ${SP.sm}; overflow: hidden;
  ${p => (p.$zoom ? 'width: fit-content; margin: 0 auto;' : '')}
`;
const MediaImg = styled.img<{ $silhouette: boolean; $zoom?: { x: number; y: number } }>`
  width: 190px; height: 190px; object-fit: contain;
  filter: ${p => (p.$silhouette ? 'brightness(0)' : 'none')};
  transform: ${p => (p.$zoom ? 'scale(15)' : 'scale(1)')};
  transform-origin: ${p => (p.$zoom ? `${p.$zoom.x}% ${p.$zoom.y}%` : 'center')};
  ${media.mobile} { width: 150px; height: 150px; }
`;
const AudioWrap = styled.div`display: flex; align-items: center; justify-content: center; padding: ${SP.md} 0;`;
const SpeakerBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  display: flex; flex-direction: column; align-items: center; gap: ${SP.sm};
  padding: ${SP.lg} ${SP.xl};
  color: ${C.cyan}; font-size: ${FONT.sm};
  ${focusRing}
`;
const AnswerRow = styled.div`display: flex; gap: ${SP.sm};`;
const TextInput = styled.input`
  ${sunken()}
  ${pixelBold}
  flex: 1; min-width: 0; padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm}; text-align: center; color: ${C.text}; outline: none;
  ${focusRing}
  box-sizing: border-box;
  box-shadow: inset 0 0 0 ${SCALE}px ${C.cyan};
  &::placeholder { color: ${C.textDim}; font-weight: 400; }
  ${focusRing}
  &:disabled { opacity: 0.55; }
`;
const SubmitBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  flex: 0 0 auto; padding: ${SP.sm} ${SP.md};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const PrimaryBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  display: flex; align-items: center; justify-content: center; gap: ${SP.xs};
  padding: ${SP.sm} ${SP.lg};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const RevealCard = styled.div<{ $correct: boolean }>`
  ${p => win(p.$correct ? 'green' : 'red')}
  animation: ${pop} 0.18s steps(2, end) both;
  display: flex; flex-direction: column; gap: ${SP.sm}; padding: ${SP.md};
`;
const RevealVerdict = styled.div<{ $correct: boolean }>`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm};
  color: ${p => (p.$correct ? C.green : C.red)};
`;
const RevealBody = styled.div`display: flex; align-items: center; gap: ${SP.md};`;
const RevealImg = styled.img`width: 70px; height: 70px; object-fit: contain; flex: 0 0 auto;`;
const RevealTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
`;
const RevealSub = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
const Winner = styled.div`
  ${winThin('gold')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
`;
const ResultBtns = styled.div`display: flex; gap: ${SP.sm}; margin-top: ${SP.xs};`;
/** 방 인원 표시. 숫자가 흔들리지 않게 tabular-nums. */
const Count = styled.div`
  ${pixelBold}
  flex: 0 0 auto; display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.cyan};
  font-variant-numeric: tabular-nums;
`;

const Board = styled.div`display: flex; flex-direction: column; gap: ${SP.xs};`;
const BoardRow = styled.div<{ $me: boolean }>`
  ${sunken()}
  display: flex; align-items: center; gap: ${SP.sm}; padding: ${SP.sm} ${SP.md};
  ${p => p.$me && `box-shadow: inset 0 0 0 ${SCALE}px ${C.cyan};`}
`;
const BoardRank = styled.div<{ $top: boolean }>`
  ${pixelBold}
  flex: 0 0 auto; width: 20px; text-align: center; font-size: ${FONT.sm};
  color: ${p => (p.$top ? C.gold : C.textDim)};
`;
const BoardName = styled.div`
  ${pixelBold}
  flex: 1; min-width: 0; display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const HostTag = styled.span`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm}; color: ${C.gold};
  background: ${C.panel};
  border: 2px solid ${C.ink};
  padding: 0 ${SP.xs};
`;
const Submitted = styled.span`flex: 0 0 auto; display: flex; color: ${C.green};`;
const Gain = styled.span`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm}; color: ${C.green};
`;
const BoardScore = styled.div`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm}; color: ${C.cyan};
  font-variant-numeric: tabular-nums; min-width: 34px; text-align: right;
`;
const Center = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${SP.md}; padding: ${SP.xxl};
`;
const Dim = styled.div`font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; word-break: keep-all;`;
