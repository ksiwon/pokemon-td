// src/components/quiz/SpeedQuizLobby.tsx
// 퀴즈 속도전 로비 — 대기 중인 공개 방 목록 + 방 만들기.
// [FREE-TIER] 방 목록은 실시간 구독하지 않는다. 로비를 연 순간 1회 읽고, 이후엔
//   사용자가 새로고침을 누를 때만 다시 읽는다(모든 유저가 상시 구독하면 RTDB 전송량이 샌다).

import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { ArrowLeft, RefreshCw, Plus, Users, Timer, ListOrdered, Languages, Shapes } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { quizRoomService, QUIZ_ROOM_ERROR } from '../../services/QuizRoomService';
import { QUIZ_MAX_PLAYERS_PER_ROOM, QUIZ_MAX_ACTIVE_ROOMS } from '../../config/rtdbBudget';
import { QuizRoomSummary, QuizRoomLang } from '../../types/quizRoom';
import { SpeedQuizKind, SPEED_QUIZ_KINDS } from '../../types/quiz';
import { authService } from '../../services/AuthService';

const ROUND_OPTIONS = [10, 20, 30];
const SECOND_OPTIONS = [10, 15, 20, 30];

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
  const [kinds, setKinds] = useState<SpeedQuizKind[]>([...SPEED_QUIZ_KINDS]);

  /** 방 언어는 고르는 게 아니라 **내 UI 언어가 그대로 기록**된다(지문이 그 언어로 나가므로). */
  const myLang: QuizRoomLang = language === 'en' ? 'en' : 'ko';

  /** 종목 토글. 마지막 하나는 끌 수 없다 — 전부 끄면 출제할 게 없어 게임이 시작되지 않는다. */
  const toggleKind = (k: SpeedQuizKind) => {
    setKinds(prev => (prev.includes(k)
      ? (prev.length > 1 ? prev.filter(x => x !== k) : prev)
      : [...prev, k]));
  };

  const offline = authService.isOfflineMode() || !authService.getCurrentUser();
  /** 활성 방이 상한이면 새 방을 만들 수 없다 — 버튼을 눌러 보고 실패하는 대신 미리 알린다. */
  const roomsFull = activeCount >= QUIZ_MAX_ACTIVE_ROOMS;

  const refresh = useCallback(async () => {
    if (offline) { setLoading(false); return; }
    setLoading(true);
    try {
      // [FREE-TIER] 조회하는 그 순간만 연결하고 반납한다. 로비에 머무는 내내 연결을 물고
      //   있으면, 정작 방이 다 찼을 때 남는 사람들이 로비에 쌓이면서 동시 연결 한도를
      //   밀어 올린다 — 100개는 실제로 게임 중인 사람에게 남겨야 한다.
      const result = await quizRoomService.withConnection(() => quizRoomService.listWaitingRooms());
      setRooms(result.rooms);
      setActiveCount(result.activeCount);
      setError(null);
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
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const id = await quizRoomService.withConnection(
        () => quizRoomService.createRoom(rounds, seconds, myLang, kinds));
      onEnterRoom(id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      refresh();
    }
  };

  const join = async (roomId: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await quizRoomService.withConnection(() => quizRoomService.joinRoom(roomId));
      onEnterRoom(roomId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      refresh();
    }
  };

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onExit}><ArrowLeft size={16} /> {t('quiz.hub.backHub')}</BackBtn>
        <Title>{t('quiz.speed.title')}</Title>
        <IconBtn onClick={refresh} disabled={loading || offline} title={t('quiz.speed.refresh')}>
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
              {/* 종목은 5개고 이름이 길어(“Random Hints” 등) Segmented 한 줄에 절대 안 들어간다
                  — 가장 큰 폰에서도 넘친다. 라벨을 위로 빼고 칩을 줄바꿈시킨다. */}
              <KindBlock>
                <OptLabel><Shapes size={13} /> {t('quiz.speed.kindsLabel')}</OptLabel>
                <KindGrid>
                  {SPEED_QUIZ_KINDS.map(k => (
                    <KindChip key={k} $active={kinds.includes(k)} onClick={() => toggleKind(k)}>
                      {t(`quiz.types.${k}.name`)}
                    </KindChip>
                  ))}
                </KindGrid>
              </KindBlock>
              {/* 지문이 호스트 언어로 나가므로, 어떤 언어 방을 여는지 만들기 전에 알려 준다. */}
              <LangNote>
                <Languages size={13} /> {t('quiz.speed.langNotice', { lang: t(`quiz.speed.lang.${myLang}`) })}
              </LangNote>
              <PrimaryBtn onClick={create} disabled={busy || roomsFull}>
                {roomsFull ? t('quiz.speed.roomsBusyBtn') : t('quiz.speed.createBtn')}
              </PrimaryBtn>
              {roomsFull && (
                <BusyBox>
                  {t('quiz.speed.roomsBusy', { n: QUIZ_MAX_ACTIVE_ROOMS })}
                </BusyBox>
              )}
              <Hint>{t('quiz.speed.scoreHint')}</Hint>
            </Card>

            {error && <ErrBox>{errText(error)}</ErrBox>}

            <SectionLabel>{t('quiz.speed.roomList')}</SectionLabel>
            {loading ? (
              <Dim>{t('quiz.play.loading')}</Dim>
            ) : rooms.length === 0 ? (
              <Dim>{t('quiz.speed.noRooms')}</Dim>
            ) : (
              rooms.map(r => (
                <RoomRow key={r.id} onClick={() => join(r.id)} disabled={busy || r.full} $full={r.full}>
                  <RoomMain>
                    <RoomHost>
                      {/* 내 언어와 다른 방은 지문을 못 읽을 수 있다 — 들어가기 전에 보이게 한다. */}
                      <LangTag $other={r.lang !== myLang}>{t(`quiz.speed.lang.${r.lang}`)}</LangTag>
                      <RoomHostName>{t('quiz.speed.hostRoom', { name: r.hostName })}</RoomHostName>
                    </RoomHost>
                    <RoomMeta>
                      {t('quiz.hub.qCount', { n: r.rounds })} · {t('quiz.speed.secondsValue', { n: r.seconds })}
                    </RoomMeta>
                    <RoomKinds>
                      {r.kinds.length === SPEED_QUIZ_KINDS.length
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
const ACCENT = '#22d3ee';
const SURFACE = 'rgba(255,255,255,0.035)';
const SURFACE_HI = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.09)';

const Root = styled.div`min-height: 100vh; background: #0b0f14; color: #e7edf3; display: flex; flex-direction: column;`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 22px; border-bottom: 1px solid ${BORDER};
  position: sticky; top: 0; z-index: 20; background: rgba(11,15,20,0.85); backdrop-filter: blur(10px);
  ${media.mobile} { padding: 11px 14px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid ${BORDER}; color: rgba(255,255,255,0.65);
  padding: 7px 13px; border-radius: 9px; cursor: pointer; font-size: 13.5px; white-space: nowrap;
  &:hover { background: ${SURFACE_HI}; color: #fff; }
`;
// 실시간 구독을 걷어낸 뒤로 목록을 갱신하는 **유일한** 수단이라 터치로 확실히 눌려야 한다.
// 모바일에서 오히려 키우는 이유: 손가락 기준 권장 40px 이상(데스크톱은 커서라 34px로 충분).
const IconBtn = styled.button`
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 9px; cursor: pointer;
  ${media.mobile} { width: 40px; height: 40px; }
  background: transparent; border: 1px solid ${BORDER}; color: rgba(255,255,255,0.65);
  &:hover:not(:disabled) { background: ${SURFACE_HI}; color: #fff; }
  &:disabled { opacity: 0.4; cursor: default; }
`;
const Title = styled.h1`font-size: 17px; font-weight: 800; margin: 0; ${media.mobile} { font-size: 15px; }`;
const Body = styled.main`
  flex: 1; width: 100%; max-width: 620px; margin: 0 auto; padding: 22px 18px 48px;
  display: flex; flex-direction: column; gap: 12px;
  ${media.mobile} { padding: 16px 14px 40px; }
`;
const Card = styled.div`
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px; border-radius: 14px; background: ${SURFACE}; border: 1px solid ${BORDER};
`;
const CardTitle = styled.div`display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 800;`;
const OptRow = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;`;
const OptLabel = styled.div`display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.55);`;
const Segmented = styled.div`display: inline-flex; background: rgba(0,0,0,0.25); border: 1px solid ${BORDER}; border-radius: 10px; padding: 3px; gap: 2px;`;
const SegBtn = styled.button<{ $active: boolean }>`
  padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; font-size: 12.5px; font-weight: 700;
  background: ${p => p.$active ? ACCENT : 'transparent'};
  color: ${p => p.$active ? '#062430' : 'rgba(255,255,255,0.55)'};
  &:hover { color: ${p => p.$active ? '#062430' : '#fff'}; }
`;
const KindBlock = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const KindGrid = styled.div`display: flex; flex-wrap: wrap; gap: 6px;`;
const KindChip = styled.button<{ $active: boolean }>`
  flex: 0 1 auto; padding: 8px 12px; border-radius: 9px; cursor: pointer;
  font-size: 12.5px; font-weight: 700; white-space: nowrap;
  background: ${p => p.$active ? 'rgba(34,211,238,0.14)' : 'rgba(0,0,0,0.25)'};
  border: 1px solid ${p => p.$active ? 'rgba(34,211,238,0.45)' : BORDER};
  color: ${p => p.$active ? ACCENT : 'rgba(255,255,255,0.45)'};
  &:hover { color: ${p => p.$active ? ACCENT : '#fff'}; }
`;

const PrimaryBtn = styled.button`
  padding: 13px; border-radius: 11px; border: none; cursor: pointer;
  background: ${ACCENT}; color: #04222b; font-size: 15px; font-weight: 800;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:not(:disabled):hover { filter: brightness(1.08); }
`;
const Hint = styled.div`font-size: 11.5px; color: rgba(255,255,255,0.4); line-height: 1.5; word-break: keep-all;`;
const SectionLabel = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); margin-top: 8px;
`;
const RoomRow = styled.button<{ $full?: boolean }>`
  display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; color: #fff;
  padding: 14px; border-radius: 12px; background: ${SURFACE}; border: 1px solid ${BORDER};
  &:hover:not(:disabled) { background: ${SURFACE_HI}; border-color: rgba(34,211,238,0.35); }
  /* 정원이 찬 방은 흐리게 두되 '있다'는 건 보인다 — 빈 목록으로 숨기면 왜 못 들어가는지 모른다. */
  &:disabled { opacity: ${p => p.$full ? 0.55 : 0.5}; cursor: default; }
`;
const FullTag = styled.span`
  flex: 0 0 auto; font-size: 11px; font-weight: 800; color: #fbbf24;
  background: rgba(251,191,36,0.14); border: 1px solid rgba(251,191,36,0.3);
  padding: 3px 8px; border-radius: 6px; white-space: nowrap;
`;
const BusyBox = styled.div`
  font-size: 12px; font-weight: 600; line-height: 1.55; word-break: keep-all;
  color: rgba(251,191,36,0.95); padding: 10px 12px; border-radius: 10px;
  background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.28);
`;
const RoomMain = styled.div`flex: 1; min-width: 0;`;
const RoomHost = styled.div`display: flex; align-items: center; gap: 6px; margin-bottom: 2px; min-width: 0;`;
const RoomHostName = styled.span`
  flex: 1; min-width: 0; font-size: 14.5px; font-weight: 800;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const LangTag = styled.span<{ $other: boolean }>`
  flex: 0 0 auto; font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
  padding: 2px 6px; border-radius: 5px; white-space: nowrap;
  /* 내 언어와 다르면 눈에 띄게 — 들어가서야 한글/영문 지문을 마주하지 않도록. */
  color: ${p => p.$other ? '#fbbf24' : 'rgba(255,255,255,0.55)'};
  background: ${p => p.$other ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.07)'};
  border: 1px solid ${p => p.$other ? 'rgba(251,191,36,0.3)' : 'transparent'};
`;
const RoomMeta = styled.div`font-size: 11.5px; color: rgba(255,255,255,0.42);`;
const RoomKinds = styled.div`
  margin-top: 3px; font-size: 11px; color: rgba(34,211,238,0.75);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const LangNote = styled.div`
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: rgba(255,255,255,0.45); line-height: 1.5; word-break: keep-all;
`;
const RoomCount = styled.div<{ $full?: boolean }>`
  flex: 0 0 auto; display: flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums;
  color: ${p => p.$full ? 'rgba(251,191,36,0.9)' : ACCENT};
`;
const Dim = styled.div`font-size: 13px; color: rgba(255,255,255,0.38); text-align: center; padding: 20px 0;`;
const Notice = styled.div`
  font-size: 13.5px; color: rgba(255,255,255,0.6); line-height: 1.6; text-align: center;
  padding: 28px 18px; border-radius: 12px; background: ${SURFACE}; border: 1px solid ${BORDER};
  word-break: keep-all;
`;
const ErrBox = styled.div`
  font-size: 12.5px; font-weight: 600; color: #fca5a5; padding: 11px 14px; border-radius: 10px;
  background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.28); word-break: keep-all;
`;
