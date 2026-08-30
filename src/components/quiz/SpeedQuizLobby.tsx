// src/components/quiz/SpeedQuizLobby.tsx
// 퀴즈 속도전 로비 — 대기 중인 공개 방 목록 + 방 만들기.
// [FREE-TIER] 방 목록은 실시간 구독하지 않는다. 로비를 연 순간 1회 읽고, 이후엔
//   사용자가 새로고침을 누를 때만 다시 읽는다(모든 유저가 상시 구독하면 RTDB 전송량이 샌다).

import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { ArrowLeft, RefreshCw, Plus, Users, Timer, ListOrdered, Languages, Shapes, Lock } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody, ScreenTitle as Title, ScreenTopBar as TopBar, SectionLabel } from '../shared/screen';
import { useTranslation, translateIn } from '../../i18n';
import { C, FONT, SP } from '../../styles/tokens';
import { win, winThin, btn, btnThin, sunken, pixelText, pixelBold } from '../../styles/pixel';
import { quizRoomService, QUIZ_ROOM_ERROR, QUIZ_RTDB_TIMEOUT_MS } from '../../services/QuizRoomService';
import { QUIZ_MAX_PLAYERS_PER_ROOM, QUIZ_MAX_ACTIVE_ROOMS } from '../../config/rtdbBudget';
import { QuizRoomSummary, QuizRoomLang } from '../../types/quizRoom';
import { SpeedQuizKind, speedKindsForLang } from '../../types/quiz';
import { authService } from '../../services/AuthService';

const ROUND_OPTIONS = [10, 20, 30];
const SECOND_OPTIONS = [10, 15, 20, 30];

/**
 * 연결이 거절되면 RTDB 쓰기는 **거부되는 대신 로컬 큐에 쌓인다** — 프로미스가 settle되지 않아
 * catch가 돌지 않고, busy가 true로 남아 버튼이 비활성인 채 굳는다(안내도 타임아웃도 없음).
 * 그래서 실패를 만들어 준다. 잃는 것은 없다: 느려서 타임아웃이 났다면 방은 서버에 생겼을 수
 * 있지만, 목록을 새로고침하면 그 방이 보이고 그대로 들어가면 된다.
 */
function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(QUIZ_ROOM_ERROR.TIMEOUT)), QUIZ_RTDB_TIMEOUT_MS);
    work.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

interface Props {
  onEnterRoom: (roomId: string) => void;
  onExit: () => void;
}

export const SpeedQuizLobby = ({ onEnterRoom, onExit }: Props) => {
  const { t, language } = useTranslation();
  const [rooms, setRooms] = useState<QuizRoomSummary[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState(20);
  const [seconds, setSeconds] = useState(15);
  const [pass, setPass] = useState('');
  /** 입장하려는 비밀번호 방 — 값이 있으면 비밀번호 입력 팝오버가 뜬다. */
  const [passPrompt, setPassPrompt] = useState<QuizRoomSummary | null>(null);
  const [joinPass, setJoinPass] = useState('');

  /** 내 UI 언어. 방 언어의 **기본값**일 뿐, 호스트가 바꿀 수 있다. */
  const myLang: QuizRoomLang = language === 'en' ? 'en' : 'ko';
  /**
   * 방 언어는 만들기 1단계에서 **직접 고른다**. 고르기 전(null)에는 나머지 설정을 보여 주지
   * 않는다 — 종목 목록이 언어에 따라 달라지므로(초성은 한국어 전용) 언어가 먼저 정해져야 한다.
   */
  const [roomLang, setRoomLang] = useState<QuizRoomLang | null>(null);
  const kindOptions = speedKindsForLang(roomLang ?? myLang);
  const [kinds, setKinds] = useState<SpeedQuizKind[]>(() => speedKindsForLang(myLang));

  /** 언어를 바꾸면 종목도 그 언어에서 가능한 것만 남긴다(영어로 바꾸면 초성이 빠진다). */
  const pickLang = (l: QuizRoomLang) => {
    setRoomLang(l);
    setKinds(speedKindsForLang(l));
    setError(null);
  };

  /** 종목 토글. 마지막 하나는 끌 수 없다 — 전부 끄면 출제할 게 없어 게임이 시작되지 않는다. */
  const toggleKind = (k: SpeedQuizKind) => {
    setKinds(prev => (prev.includes(k)
      ? (prev.length > 1 ? prev.filter(x => x !== k) : prev)
      : [...prev, k]));
  };

  const offline = authService.isOfflineMode() || !authService.getCurrentUser();
  /** 활성 방이 상한이면 새 방을 만들 수 없다 — 버튼을 눌러 보고 실패하는 대신 미리 알린다. */
  const roomsFull = activeCount >= QUIZ_MAX_ACTIVE_ROOMS;

  // keepError: 방 만들기·입장이 실패한 직후에도 목록은 새로 받아야 하는데, 그때 에러를 지우면
  //   방금 띄운 "비밀번호가 맞지 않아요" 같은 안내가 곧바로 사라져 사용자는 아무것도 못 본다.
  const refresh = useCallback(async (keepError = false) => {
    if (offline) { setLoading(false); return; }
    setLoading(true);
    try {
      // [FREE-TIER] 조회하는 그 순간만 연결하고 반납한다. 로비에 머무는 내내 연결을 물고
      //   있으면, 정작 방이 다 찼을 때 남는 사람들이 로비에 쌓이면서 동시 연결 한도를
      //   밀어 올린다 — 100개는 실제로 게임 중인 사람에게 남겨야 한다.
      const result = await quizRoomService.withConnection(() => quizRoomService.listWaitingRooms());
      setRooms(result.rooms);
      setActiveCount(result.activeCount);
      if (!keepError) setError(null);
    } catch {
      setError('loadFail');
    } finally {
      setLoading(false);
    }
  }, [offline]);

  useEffect(() => {
    if (offline) return;
    // 만료 방 정리도 진입 시 1회만(주기 타이머 없음).
    // 정리와 첫 조회를 **한 번의 연결**로 묶는다 — 따로 잡으면 그 사이에 소켓을 끊었다
    // 다시 붙느라(goOffline → goOnline) 핸드셰이크가 한 번 더 든다.
    setLoading(true);
    quizRoomService.withConnection(async () => {
      await quizRoomService.cleanupExpiredRooms();
      return quizRoomService.listWaitingRooms();
    })
      .then(result => { setRooms(result.rooms); setActiveCount(result.activeCount); setError(null); })
      .catch(() => setError('loadFail'))
      .finally(() => setLoading(false));
  }, [offline]);

  /** 서비스가 던진 오류 코드를 문구로. 코드가 없으면 일반 실패 문구. */
  const errText = (key: string | null) => {
    if (!key) return '';
    const map: Record<string, string> = {
      [QUIZ_ROOM_ERROR.ROOM_LIMIT]: 'speed.errRoomLimit',
      [QUIZ_ROOM_ERROR.ROOM_FULL]: 'speed.errRoomFull',
      [QUIZ_ROOM_ERROR.ROOM_GONE]: 'speed.errRoomGone',
      [QUIZ_ROOM_ERROR.ALREADY_STARTED]: 'speed.errStarted',
      [QUIZ_ROOM_ERROR.WRONG_PASS]: 'speed.errWrongPass',
      // 방 화면의 "첫 스냅샷이 안 옴"과 같은 원인(연결 거절)이라 같은 문구를 쓴다.
      [QUIZ_ROOM_ERROR.TIMEOUT]: 'speed.serverBusy',
      loadFail: 'speed.errLoad',
    };
    return t(`quiz.${map[key] ?? 'speed.errLoad'}`);
  };

  // 방 만들기·입장도 **연결을 잡은 채** 해야 한다. 로비는 조회가 끝나면 소켓을 끊어 두므로
  // (withConnection), 그대로 set/update를 던지면 RTDB가 쓰기를 로컬 큐에 쌓아 두고
  // 프로미스를 영영 resolve하지 않는다 — 버튼만 눌리고 아무 일도 안 일어난다.
  // 성공하면 서비스가 반환 전에 currentRoomId를 세팅하므로 busy 프로브가 반납을 막아,
  // 방 화면이 마운트될 때까지 연결이 유지된다.
  const create = async () => {
    if (busy || !roomLang) return;
    setBusy(true); setError(null);
    try {
      const id = await withTimeout(quizRoomService.withConnection(
        () => quizRoomService.createRoom(rounds, seconds, roomLang, kinds, pass.trim() || undefined)));
      onEnterRoom(id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      refresh(true);
    }
  };

  /** 비밀번호 방은 바로 들어가지 않고 입력을 먼저 받는다. */
  const tryJoin = (room: QuizRoomSummary) => {
    if (busy) return;
    if (room.hasPass) { setPassPrompt(room); setJoinPass(''); setError(null); return; }
    join(room.id);
  };

  const join = async (roomId: string, roomPass?: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await withTimeout(quizRoomService.withConnection(() => quizRoomService.joinRoom(roomId, roomPass)));
      onEnterRoom(roomId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setPassPrompt(null);
      refresh(true);
    }
  };

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onExit}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn>
        <Title>{t('quiz.speed.title')}</Title>
        <IconBtn onClick={() => refresh()} disabled={loading || offline} title={t('quiz.speed.refresh')}>
          <RefreshCw size={16} />
        </IconBtn>
      </TopBar>

      <Body>
        {offline ? (
          <Notice>{t('quiz.speed.loginRequired')}</Notice>
        ) : (
          <>
            <Card>
              <CardTitle><Plus size={16} /> {t('quiz.speed.createTitle')}</CardTitle>

              {/* 1단계 — 방 언어. 종목 목록이 언어에 따라 달라지므로(초성은 한국어 전용)
                  언어를 정하기 전에는 나머지를 보여 주지 않는다. */}
              <StepBlock>
                <StepLabel><StepNo>1</StepNo><Languages size={13} /> {t('quiz.speed.langLabel')}</StepLabel>
                <KindGrid>
                  {(['ko', 'en'] as QuizRoomLang[]).map(l => (
                    <LangBtn key={l} $active={roomLang === l} onClick={() => pickLang(l)}>
                      {t(`quiz.speed.lang.${l}`)}
                    </LangBtn>
                  ))}
                </KindGrid>
                <LangNote>{roomLang ? t('quiz.speed.langNotice') : t('quiz.speed.langPick')}</LangNote>
              </StepBlock>

              {roomLang && (
                <>
                  {/* 2단계 — 종목. 라벨·미리보기는 **방 언어로** 보여 준다.
                      참가자가 실제로 볼 문구를 호스트가 그대로 확인할 수 있어야 한다. */}
                  <StepBlock>
                    <StepLabel><StepNo>2</StepNo><Shapes size={13} /> {translateIn(roomLang, 'quiz.speed.kindsLabel')}</StepLabel>
                    <KindGrid>
                      {kindOptions.map(k => (
                        <KindChip key={k} $active={kinds.includes(k)} onClick={() => toggleKind(k)}>
                          {translateIn(roomLang, `quiz.types.${k}.name`)}
                        </KindChip>
                      ))}
                    </KindGrid>
                  </StepBlock>

                  <OptRow>
                    <OptLabel><ListOrdered size={13} /> {t('quiz.hub.roundSize')}</OptLabel>
                    <Segmented>
                      {ROUND_OPTIONS.map(n => (
                        <SegBtn key={n} $active={rounds === n} onClick={() => setRounds(n)}>
                          {t('quiz.hub.qCount', { n })}
                        </SegBtn>
                      ))}
                    </Segmented>
                  </OptRow>
                  <OptRow>
                    <OptLabel><Timer size={13} /> {t('quiz.speed.secondsLabel')}</OptLabel>
                    <Segmented>
                      {SECOND_OPTIONS.map(n => (
                        <SegBtn key={n} $active={seconds === n} onClick={() => setSeconds(n)}>
                          {t('quiz.speed.secondsValue', { n })}
                        </SegBtn>
                      ))}
                    </Segmented>
                  </OptRow>

                  {/* 비밀번호는 선택 사항. 비우면 누구나 들어올 수 있는 공개 방. */}
                  <StepBlock>
                    <StepLabel><Lock size={13} /> {t('quiz.speed.passLabel')}</StepLabel>
                    <TextField
                      value={pass}
                      onChange={e => setPass(e.target.value.slice(0, 20))}
                      placeholder={t('quiz.speed.passPlaceholder')}
                      autoComplete="off"
                    />
                  </StepBlock>

                  <PrimaryBtn onClick={create} disabled={busy || roomsFull}>
                    {roomsFull ? t('quiz.speed.roomsBusyBtn') : t('quiz.speed.createBtn')}
                  </PrimaryBtn>
                  {roomsFull && <BusyBox>{t('quiz.speed.roomsBusy', { n: QUIZ_MAX_ACTIVE_ROOMS })}</BusyBox>}
                </>
              )}
              <Hint>{t('quiz.speed.scoreHint')}</Hint>
            </Card>

            {passPrompt && (
              <PassBox>
                <PassTitle><Lock size={14} /> {t('quiz.speed.passPrompt', { name: passPrompt.hostName })}</PassTitle>
                <PassRow>
                  <TextField
                    value={joinPass}
                    onChange={e => setJoinPass(e.target.value.slice(0, 20))}
                    onKeyDown={e => { if (e.key === 'Enter') join(passPrompt.id, joinPass); }}
                    placeholder={t('quiz.speed.passJoinPlaceholder')}
                    autoComplete="off"
                    autoFocus
                  />
                  <PassBtn onClick={() => join(passPrompt.id, joinPass)} disabled={busy}>
                    {t('quiz.speed.passEnter')}
                  </PassBtn>
                  <GhostBtn onClick={() => setPassPrompt(null)}>{t('common.cancel')}</GhostBtn>
                </PassRow>
              </PassBox>
            )}

            {error && <ErrBox>{errText(error)}</ErrBox>}

            <SectionLabel>{t('quiz.speed.roomList')}</SectionLabel>
            {loading ? (
              <Dim>{t('quiz.play.loading')}</Dim>
            ) : rooms.length === 0 ? (
              <Dim>{t('quiz.speed.noRooms')}</Dim>
            ) : (
              rooms.map(r => (
                <RoomRow key={r.id} onClick={() => tryJoin(r)} disabled={busy || r.full} $full={r.full}>
                  <RoomMain>
                    <RoomHost>
                      {/* 내 언어와 다른 방은 지문을 못 읽을 수 있다 — 들어가기 전에 보이게 한다. */}
                      <LangTag $other={r.lang !== myLang}>{t(`quiz.speed.lang.${r.lang}`)}</LangTag>
                      {r.hasPass && <LockTag title={t('quiz.speed.lockedRoom')}><Lock size={11} /></LockTag>}
                      <RoomHostName>{t('quiz.speed.hostRoom', { name: r.hostName })}</RoomHostName>
                    </RoomHost>
                    <RoomMeta>
                      {t('quiz.hub.qCount', { n: r.rounds })} · {t('quiz.speed.secondsValue', { n: r.seconds })}
                    </RoomMeta>
                    <RoomKinds>
                      {/* '전 종목'은 그 방 언어 기준이다 — 영어 방은 초성 2종이 빠져 7종목이 전부다. */}
                      {r.kinds.length === speedKindsForLang(r.lang).length
                        ? t('quiz.speed.kindsAll')
                        : r.kinds.map(k => t(`quiz.types.${k}.name`)).join(' · ')}
                    </RoomKinds>
                  </RoomMain>
                  {r.full && <FullTag>{t('quiz.speed.full')}</FullTag>}
                  <RoomCount $full={r.full}><Users size={13} /> {r.playerCount} / {QUIZ_MAX_PLAYERS_PER_ROOM}</RoomCount>
                </RoomRow>
              ))
            )}
          </>
        )}
      </Body>
    </Root>
  );
};


// ─── styled ──────────────────────────────────────────────────────────────────
// 화면 껍데기(Root·TopBar·Title·BackBtn·SectionLabel)는 shared/screen 에서 온다.

/** 새로고침처럼 글자 없이 아이콘만 들어가는 정사각 버튼. */
const IconBtn = styled.button`
  ${btnThin('plain')}
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; padding: 0;
  color: ${C.textSub};
  ${media.mobile} { width: 40px; height: 40px; }
  &:focus, &:focus-visible { outline: none; }
`;

/** 읽는 화면이라 좁은 폭. 여백은 공용 껍데기가 정한다. */
const Body = styled(ScreenBody).attrs({ $narrow: true })``;

const Card = styled.div`
  ${win('plain')}
  display: flex; flex-direction: column; gap: ${SP.md};
`;

const CardTitle = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm};
`;

const OptRow = styled.div`display: flex; align-items: center; justify-content: space-between; gap: ${SP.sm}; flex-wrap: wrap;`;

const OptLabel = styled.div`
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

const Segmented = styled.div`display: inline-flex; gap: ${SP.xs};`;

const SegBtn = styled.button<{ $active: boolean }>`
  ${p => btnThin(p.$active ? 'cyan' : 'plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  color: ${p => (p.$active ? C.cyan : C.textSub)};
  &:focus, &:focus-visible { outline: none; }
`;

const StepBlock = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;

const StepLabel = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

/** 단계 번호 — 시안 바탕에 잉크 글자라 그림자를 끈다. */
const StepNo = styled.span`
  ${pixelBold}
  flex: 0 0 auto; width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; color: ${C.ink}; background: ${C.cyan};
  border: 2px solid ${C.ink};
  text-shadow: none;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  ${p => btnThin(p.$active ? 'cyan' : 'plain')}
  ${pixelBold}
  flex: 1 1 120px; padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${p => (p.$active ? C.cyan : C.textSub)};
  &:focus, &:focus-visible { outline: none; }
`;

const TextField = styled.input`
  ${sunken()}
  ${pixelText}
  flex: 1; min-width: 0; padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm}; color: ${C.text}; outline: none; box-sizing: border-box;
  &::placeholder { color: ${C.textDim}; }
  &:focus { outline: none; }
`;

const LockTag = styled.span`
  flex: 0 0 auto; display: flex; align-items: center;
  color: ${C.gold};
`;

const PassBox = styled.div`
  ${winThin('cyan')}
  display: flex; flex-direction: column; gap: ${SP.sm}; padding: ${SP.sm} ${SP.md};
`;

const PassTitle = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm};
`;

const PassRow = styled.div`display: flex; flex-wrap: wrap; gap: ${SP.xs};`;

const PassBtn = styled.button`
  ${btnThin('cyan')}
  ${pixelBold}
  flex: 0 0 auto; padding: ${SP.xs} ${SP.md};
  color: ${C.cyan}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const GhostBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  flex: 0 0 auto; padding: ${SP.xs} ${SP.md};
  color: ${C.textSub}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const KindGrid = styled.div`display: flex; flex-wrap: wrap; gap: ${SP.xs};`;

const KindChip = styled.button<{ $active: boolean }>`
  ${p => btnThin(p.$active ? 'cyan' : 'plain')}
  ${pixelBold}
  flex: 0 1 auto; padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm}; white-space: nowrap;
  color: ${p => (p.$active ? C.cyan : C.textSub)};
  &:focus, &:focus-visible { outline: none; }
`;

const PrimaryBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const Hint = styled.div`font-size: ${FONT.sm}; color: ${C.textDim}; word-break: keep-all;`;


const RoomRow = styled.button<{ $full?: boolean }>`
  ${btn('plain')}
  ${pixelText}
  display: flex; align-items: center; gap: ${SP.md};
  text-align: left; color: ${C.text};
  padding: ${SP.sm} ${SP.md};
  /* 정원이 찬 방은 흐리게 두되 있다는 건 보인다 — 빈 목록으로 숨기면 왜 못 들어가는지 모른다. */
  &:disabled { opacity: ${p => (p.$full ? 0.55 : 0.5)}; cursor: default; }
  &:focus, &:focus-visible { outline: none; }
`;
const FullTag = styled.span`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm}; color: ${C.gold};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  padding: 0 ${SP.xs}; white-space: nowrap;
`;
const BusyBox = styled.div`
  ${winThin('gold')}
  font-size: ${FONT.sm}; word-break: keep-all;
  color: ${C.gold}; padding: ${SP.sm} ${SP.md};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;
const RoomMain = styled.div`flex: 1; min-width: 0;`;
const RoomHost = styled.div`display: flex; align-items: center; gap: ${SP.xs}; min-width: 0;`;
const RoomHostName = styled.span`
  ${pixelBold}
  flex: 1; min-width: 0; font-size: ${FONT.sm};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const LangTag = styled.span<{ $other: boolean }>`
  ${pixelBold}
  flex: 0 0 auto; font-size: ${FONT.sm};
  padding: 0 ${SP.xs}; white-space: nowrap;
  border: 2px solid ${C.ink};
  background: ${C.panelSunk};
  /* 내 언어와 다르면 눈에 띄게 — 들어가서야 한글/영문 지문을 마주하지 않도록. */
  color: ${p => (p.$other ? C.gold : C.textSub)};
`;
const RoomMeta = styled.div`font-size: ${FONT.sm}; color: ${C.textDim};`;
const RoomKinds = styled.div`
  font-size: ${FONT.sm}; color: ${C.cyan};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const LangNote = styled.div`
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textDim}; word-break: keep-all;
`;
const RoomCount = styled.div<{ $full?: boolean }>`
  ${pixelBold}
  flex: 0 0 auto; display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; font-variant-numeric: tabular-nums;
  color: ${p => (p.$full ? C.gold : C.cyan)};
`;
const Dim = styled.div`font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; padding: ${SP.lg} 0;`;
const Notice = styled.div`
  ${winThin('plain')}
  font-size: ${FONT.sm}; color: ${C.textSub}; text-align: center;
  padding: ${SP.lg} ${SP.md};
  word-break: keep-all;
`;
const ErrBox = styled.div`
  ${winThin('red')}
  font-size: ${FONT.sm}; color: ${C.red}; padding: ${SP.sm} ${SP.md};
  text-shadow: 1px 1px 0 ${C.textShadow};
  word-break: keep-all;
`;
