// src/components/menu/MainMenu.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 포켓몬 게임 UI 문법(포케로그 참고)으로 재작성한 메인 메뉴.
// 로직·i18n 키·라우팅은 이전과 동일하고 껍데기만 바꿨다.
//
// 걷어낸 것들 (리뷰의 "AI가 디자인한 것 같다"의 직접적 원인):
//   · eyebrow — 11px/700/letter-spacing 0.25em/uppercase 소제목.
//     랜딩페이지 관용구이고, 한글에 자간 0.25em을 주면 "게 임 모 드 선 택"으로
//     벌어져 더 어색해진다.
//   · 기능 카드 — [둥근사각 아이콘칩]+[제목]+[회색 부제]+[→] 조합.
//   · 유리 카드 — rgba(255,255,255,0.03) 배경 + 1px 반투명 테두리 + blur.
//   · Tailwind 기본 팔레트(#3b82f6/#10b981/#f59e0b/#c084fc/#22d3ee).
//   · 별똥별 파티클 배경 — 장식용 웹 이펙트. 실제 게임 맵으로 대체했다.
//
// 대신 쓰는 것:
//   · 나인슬라이스 창틀(도트 PNG) — 모서리가 픽셀 계단이다.
//   · 글자 하드 그림자 — 포켓몬 UI의 필수 요소.
//   · ▶ 커서 — hover 글로우 대신 선택 포인터.
//   · 눌리는 버튼 — 떠오르지 않고 그림자가 사라지며 내려앉는다.
//   · 그리드 — 세로로 길게 늘어놓던 목록을 2열로 접어 가로 공간을 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import styled from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { Screen, ScreenBody, ScreenTopBar as TopBar, SectionLabel } from '../shared/screen';
import { authService } from '../../services/AuthService';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { AchievementsPanel } from '../modals/Achievements';
import { HallOfFame } from '../modals/HallOfFame';
import { Rankings } from '../modals/Rankings';
import { TutorialModal, hasTowerTutorialSeen, hasMultiTutorialSeen, hasStoryTutorialSeen, hasCardsTutorialSeen } from '../modals/TutorialModal';
import { PatchNotes, hasUnreadPatchNotes } from '../modals/PatchNotes';
import { GameDocs, DocsTab } from '../modals/GameDocs';
import { OtherGames } from '../modals/OtherGames';
import { showToast } from '../shared/Toast';
import { C, FONT, SP } from '../../styles/tokens';
import { win, btn, btnThin, backdrop, pixelBold, cursorMark, cursorOn, CURSOR_GUTTER, BtnColor, pixelText, shadowLg, focusRing } from '../../styles/pixel';

export const MainMenu = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();
  const isOffline = authService.isOfflineMode();
  const { t } = useTranslation();
  const [showAchievements, setShowAchievements] = useState(false);
  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);
  /** “이런 게임은 어떠세요?” — 같은 사람이 만든 나머지 둘 (modals/OtherGames.tsx) */
  const [showOtherGames, setShowOtherGames] = useState(false);
  // 안 본 최신 패치가 있으면 버튼에 점 표시. 모달을 열면 읽음 처리되므로 여기서 내린다.
  const [patchUnread, setPatchUnread] = useState(hasUnreadPatchNotes);
  const [tutorial, setTutorial] = useState<'tower' | 'multi' | 'story' | 'cards' | null>(null);
  /** 자료실(수치 문서). 가이드에서 넘어오면 그 모드 탭으로 연다. */
  const [docsTab, setDocsTab] = useState<DocsTab | null>(null);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (confirm(t('mainMenu.signOutConfirm'))) await authService.signOut();
  };

  const handleSinglePlay = () => {
    if (!hasTowerTutorialSeen()) { setPendingNav('/map-select'); setTutorial('tower'); }
    else navigate('/map-select');
  };

  const handleStoryPlay = () => {
    if (!hasStoryTutorialSeen()) { setPendingNav('/story'); setTutorial('story'); }
    else navigate('/story');
  };

  const handleMultiPlay = () => {
    // [FREE-TIER] 오프라인 모드: 멀티플레이 차단
    if (isOffline) { showToast(t('mainMenu.offlineMultiBlocked')); return; }
    if (!hasMultiTutorialSeen()) { setPendingNav('/lobby'); setTutorial('multi'); }
    else navigate('/lobby');
  };

  // 미니 포켓 — 오프라인에서도 동작(로컬 수집/팩깡)
  const handleCards = () => {
    if (!hasCardsTutorialSeen()) { setPendingNav('/cards'); setTutorial('cards'); }
    else navigate('/cards');
  };

  // 포켓몬 퀴즈 — PokeAPI만 사용(Firebase 무관). 인터넷 없으면 플레이 화면서 안내.
  const handleQuiz = () => navigate('/quiz');

  // [FREE-TIER] 오프라인 모드: 서버 의존 기능(랭킹/전당) 차단
  const handleRankings = () => {
    if (isOffline) { showToast(t('mainMenu.offlineRankingBlocked')); return; }
    setShowRankings(true);
  };
  const handleHallOfFame = () => {
    if (isOffline) { showToast(t('mainMenu.offlineRankingBlocked')); return; }
    setShowHallOfFame(true);
  };

  const handleProceed = () => {
    const dest = pendingNav; setTutorial(null); setPendingNav(null);
    if (dest) navigate(dest);
  };

  const handleClose = () => { setTutorial(null); setPendingNav(null); };

  const avatarInitial = (user?.displayName || '?').charAt(0).toUpperCase();
  const [avatarError, setAvatarError] = useState(false);

  return (
    <>
      <Root>
        {/* ── 상단 바 ── */}
        <TopBar>
          <LogoMark>
            <LogoImg src="/images/pokemon-aegis.webp" alt="" />
            <LogoText>POKEMON AEGIS</LogoText>
          </LogoMark>
          <TopBarRight>
            <UserChip>
              {!avatarError && user?.photoURL ? (
                <Avatar
                  src={user.photoURL}
                  alt={user.displayName || ''}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <AvatarFallback>{avatarInitial}</AvatarFallback>
              )}
              <UserName>{user?.displayName}</UserName>
              <RatingChip>★{user?.rating ?? 0}</RatingChip>
            </UserChip>
            <SignOutBtn onClick={handleSignOut}>{t('mainMenu.signOut')}</SignOutBtn>
          </TopBarRight>
        </TopBar>

        {/* ── 본문 ── */}
        <Main>
          {/* 타이틀 창은 뺐다 — 상단 바에 이미 로고와 게임명이 있다. */}

          {/* [FREE-TIER] 오프라인 모드 안내 */}
          {isOffline && (
            <OfflineWindow>
              <OfflineBadge>{t('mainMenu.offlineBadge')}</OfflineBadge>
              <OfflineDesc>{t('mainMenu.offlineBannerDesc')}</OfflineDesc>
            </OfflineWindow>
          )}

          {/* 주력 2종 — 싱글·멀티. 선택은 ▶ 커서로 표시한다 */}
          <PrimaryGrid>
            <ModeBtn $c="blue" onClick={handleSinglePlay}>
              <ModeName>{t('mainMenu.singlePlay')}</ModeName>
              <ModeDesc>{t('mainMenu.singlePlayDesc')}</ModeDesc>
            </ModeBtn>

            <ModeBtn $c="teal" onClick={handleMultiPlay} disabled={isOffline}>
              <ModeName>{t('mainMenu.multiPlay')}</ModeName>
              <ModeDesc>{isOffline ? t('mainMenu.offlineBadge') : t('mainMenu.multiPlayDesc')}</ModeDesc>
            </ModeBtn>
          </PrimaryGrid>

          {/* 부가 3종 — 스토리·미니 포켓·퀴즈 */}
          <SecondaryGrid>
            <ModeBtn $c="gold" onClick={handleStoryPlay}>
              <ModeName>{t('mainMenu.storyPlay')}</ModeName>
              <ModeDesc>{t('mainMenu.storyPlayDesc')}</ModeDesc>
            </ModeBtn>

            <ModeBtn $c="purple" onClick={handleCards}>
              <ModeName>{t('cards.menu.title')}</ModeName>
              <ModeDesc>{t('cards.menu.desc')}</ModeDesc>
            </ModeBtn>

            <ModeBtn $c="cyan" onClick={handleQuiz}>
              <ModeName>{t('quiz.menu.title')}</ModeName>
              <ModeDesc>{t('quiz.menu.desc')}</ModeDesc>
            </ModeBtn>
          </SecondaryGrid>

          {/* 내 정보 — 업적·전당·랭킹·패치노트·자료실.
              다섯 다 '펼쳐 놓고 들여다보는 것'이라 한 줄에 선다. 자료실은 한동안
              도움말 줄 오른쪽 끝에 있었는데, 그 줄의 나머지 넷은 '어떻게 노느냐'를
              알려주는 튜토리얼이고 자료실은 수치표라 결이 달랐다. */}
          <SectionLabel>{t('mainMenu.myInfo')}</SectionLabel>
          <UtilRow>
            <UtilBtn onClick={() => setShowAchievements(true)}>{t('mainMenu.achievements')}</UtilBtn>
            <UtilBtn onClick={handleHallOfFame} disabled={isOffline}>{t('mainMenu.hallOfFame')}</UtilBtn>
            <UtilBtn onClick={handleRankings} disabled={isOffline}>{t('mainMenu.rankings')}</UtilBtn>
            {/* 패치노트는 서버를 쓰지 않는다 → 오프라인에서도 열린다 */}
            <UtilBtn onClick={() => { setShowPatchNotes(true); setPatchUnread(false); }}>
              {t('mainMenu.patchNotes')}
              {patchUnread && <UnreadDot />}
            </UtilBtn>
            {/* 자료실도 서버를 안 쓴다 — 오프라인에서도 열린다.
                넷과 성격이 갈리는 것(내 기록이 아니라 게임의 수치표)은 창틀 색으로 알린다. */}
            <DocsBtn onClick={() => setDocsTab('single')}>{t('mainMenu.helpDocs')}</DocsBtn>
          </UtilRow>

          {/* 도움말 — 가이드 4종은 '어떻게 노느냐'. 오른쪽 끝은 이 게임 밖으로
              나가는 길이라, 넷과 성격이 달라 창틀 색으로 구분한다(자료실이 있던 자리). */}
          <HelpRow>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('tower'); }}>{t('mainMenu.helpSingle')}</HelpBtn>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('story'); }}>{t('mainMenu.helpStory')}</HelpBtn>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('multi'); }}>{t('mainMenu.helpMulti')}</HelpBtn>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('cards'); }}>{t('mainMenu.helpCards')}</HelpBtn>
            <OtherGamesBtn onClick={() => setShowOtherGames(true)}>{t('mainMenu.otherGames')}</OtherGamesBtn>
          </HelpRow>
        </Main>
      </Root>

      {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
      {showHallOfFame   && <HallOfFame        onClose={() => setShowHallOfFame(false)} />}
      {showRankings     && <Rankings          onClose={() => setShowRankings(false)} />}
      {showPatchNotes   && <PatchNotes        onClose={() => setShowPatchNotes(false)} />}
      {tutorial && (
        <TutorialModal mode={tutorial} onClose={handleClose}
          onProceed={pendingNav ? handleProceed : undefined}
          onOpenDocs={tab => { setTutorial(null); setPendingNav(null); setDocsTab(tab); }} />
      )}
      {docsTab && <GameDocs initialTab={docsTab} onClose={() => setDocsTab(null)} />}
      {showOtherGames && <OtherGames onClose={() => setShowOtherGames(false)} />}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 뼈대
// ═══════════════════════════════════════════════════════════════════════════════

const Root = styled(Screen)`
  ${backdrop()}
  position: relative;
`;

// ── 상단 바 ───────────────────────────────────────────────────────────────────
// 반투명 유리 내비바(backdrop-filter)를 걷어내고, 창과 같은 면에 위아래만
// 액센트/외곽선으로 마감한 게임 HUD 바로 바꿨다.


const LogoMark = styled.div`display: flex; align-items: center; gap: ${SP.sm}; min-width: 0;`;

const LogoImg = styled.img`
  height: 36px; object-fit: contain; flex-shrink: 0;
  ${media.mobile} { height: 28px; }
`;

const LogoText = styled.div`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.gold};
  white-space: nowrap;
  ${media.mobile} { display: none; }
`;

const TopBarRight = styled.div`display: flex; align-items: center; gap: ${SP.sm}; min-width: 0;`;

// 플레이어 정보 — 테두리 없이 그냥 얹는다.
// 누를 수도 없고 열 수도 없는 표시용이라 칸을 두를 이유가 없다. 창틀을 두르면
// 옆의 로그아웃 버튼과 같은 무게로 보여 눌러야 할 것처럼 읽힌다.
const UserChip = styled.div`
  display: flex; align-items: center; gap: ${SP.sm};
  min-width: 0;
`;

const Avatar = styled.img`
  width: 30px; height: 30px; flex-shrink: 0;
  object-fit: cover;
  border: 3px solid ${C.ink};
`;

const AvatarFallback = styled.div`
  ${pixelBold}
  width: 30px; height: 30px; flex-shrink: 0;
  background: ${C.panelBtn}; color: ${C.text};
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm};
  border: 3px solid ${C.ink};
  pointer-events: none;
`;

const UserName = styled.span`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.text};
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${lMedia.phoneSm} { display: none; }
`;

const RatingChip = styled.span`
  ${pixelText}
  font-weight: 700;
  font-size: ${FONT.sm}; color: ${C.gold};
  flex-shrink: 0; white-space: nowrap;
`;

/** 로그아웃 — 창틀 없이 글자만. 헤더의 보조 동작이라 테두리를 두르면
    플레이어 이름보다 먼저 눈에 들어온다. */
const SignOutBtn = styled.button`
  ${pixelText}
  background: none; border: none; cursor: pointer;
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.textDim};
  white-space: nowrap; flex-shrink: 0;
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  ${focusRing}
  ${lMedia.phoneSm} { display: none; }
`;

// ── 본문 ─────────────────────────────────────────────────────────────────────

/**
 * 메뉴는 내용이 짧아 세로 가운데에 놓는다 — 여백 자체는 공용 껍데기 그대로.
 * 좁은 화면에서는 내용이 화면보다 길어질 수 있다. 그때 가운데 정렬을 유지하면
 * 넘친 부분이 위아래로 잘리고 스크롤로도 닿지 못하므로 위 정렬로 되돌린다.
 */
const Main = styled(ScreenBody)`
  justify-content: center;
  ${media.mobile}   { justify-content: flex-start; }
  ${lMedia.phoneSm} { justify-content: flex-start; }
`;

// [FREE-TIER] 오프라인 안내
const OfflineWindow = styled.div`
  ${win('red')}
  padding: ${SP.sm} ${SP.md};
  margin-bottom: ${SP.md};
  display: flex; flex-direction: column; gap: ${SP.xs};
`;

const OfflineBadge = styled.div`
  ${pixelText}
  font-weight: 700;
  font-size: ${FONT.sm}; color: ${C.red};
`;

const OfflineDesc = styled.div`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textSub}; line-height: 1.7;
`;

// ── 모드 선택 (그리드) ───────────────────────────────────────────────────────
// 세로로 5개를 늘어놓으면 화면을 넘기고 가로가 비어 낭비된다.
// 주력 2종(싱글·멀티)을 위에 2열, 부가 3종(스토리·미니 포켓·퀴즈)을 아래 3열로
// 나눠 무게 차이를 칸 너비로 드러낸다.

const PrimaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${SP.md};
  margin-bottom: ${SP.md};

  ${media.tablet}   { grid-template-columns: 1fr; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { grid-template-columns: repeat(2, 1fr); gap: ${SP.sm}; }
`;

const SecondaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${SP.md};
  margin-bottom: ${SP.lg};

  ${media.tablet}   { grid-template-columns: 1fr; gap: ${SP.sm}; }
  ${lMedia.phoneSm} { grid-template-columns: repeat(3, 1fr); gap: ${SP.sm}; }
`;

const ModeBtn = styled.button<{ $c: BtnColor }>`
  ${p => btn(p.$c)}
  ${cursorMark}
  padding: ${SP.sm} ${SP.md} ${SP.sm} ${CURSOR_GUTTER}px;
  text-align: left;
  display: flex; flex-direction: column; gap: 2px;

  /* hover에서 떠오르지 않는다. 커서를 드러내는 것으로만 알린다. */
  &:hover:not(:disabled)  { ${cursorOn} }
  &:focus-visible         { outline: none; ${cursorOn} }

  ${lMedia.phoneSm} { padding: ${SP.xs} ${SP.sm} ${SP.xs} ${CURSOR_GUTTER}px; }
`;

const ModeName = styled.span`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.text}; line-height: 1.2;
  ${lMedia.phoneSm} { font-size: ${FONT.sm}; }
`;

const ModeDesc = styled.span`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textSub}; line-height: 1.5;
  ${lMedia.phoneSm} { display: none; }
`;

// ── 구역 라벨 ────────────────────────────────────────────────────────────────
// uppercase + letter-spacing 0.2em 조합(eyebrow)을 걷어내고, 라벨 옆으로 선이
// 뻗는 게임 목록 머리글로 바꿨다.


/* 업적·전당·랭킹·패치노트 + 자료실 = 한 줄 5칸. 좁아지면 2열로 접고,
   자료실만 한 줄을 다 쓴다 (5개를 2열에 넣으면 마지막 칸이 혼자 왼쪽에 남아
   빠뜨린 것처럼 보인다). */
const UtilRow = styled.div`
  display: grid; grid-template-columns: repeat(5, 1fr); gap: ${SP.sm};
  margin-bottom: ${SP.md};
  ${media.mobile} { grid-template-columns: repeat(2, 1fr); }
`;

const UtilBtn = styled.button`
  ${btn('blue')}
  ${pixelText}
  position: relative;
  padding: ${SP.sm} ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.text};
  text-align: center;
  /* 5열이라 좁은 화면에서 긴 한글 라벨이 단어 단위로 줄바꿈되게 */
  word-break: keep-all; line-height: 1.4;
`;

/** 자료실 — 넷과 성격이 다르니 창틀 색으로 구분한다(같은 줄, 오른쪽 끝). */
const DocsBtn = styled(UtilBtn)`
  ${btn('gold')}
  padding: ${SP.sm} ${SP.xs};
  color: ${C.gold};
  ${media.mobile} { grid-column: 1 / -1; }
`;

// 패치노트 미확인 표시 — 텍스트 배치를 건드리지 않도록 절대 위치로 띄운다.
// 글로우 없이 각진 점 + 깜빡임으로.
const UnreadDot = styled.span`
  position: absolute; top: 2px; right: 2px;
  width: 9px; height: 9px;
  background: ${C.red};
  border: 3px solid ${C.ink};
  animation: blink 1s steps(1, end) infinite;
`;

/* 가이드 4종 + 다른 게임 = 한 줄 5칸. 좁아지면 2열로 접고, 마지막 칸만 한 줄을
   다 쓴다 (5개를 2열에 넣으면 마지막 칸이 혼자 왼쪽에 남아 빠뜨린 것처럼 보인다). */
const HelpRow = styled.div`
  display: grid; grid-template-columns: repeat(5, 1fr); gap: ${SP.sm};
  ${media.mobile} { grid-template-columns: repeat(2, 1fr); }
`;

const HelpBtn = styled.button`
  ${btnThin('plain')}
  ${pixelText}
  /* 얇은 창틀은 테두리가 6px뿐이라 세로 여백을 직접 줘야 한다.
     0으로 두면 글자가 위아래 테두리에 붙는다. */
  padding: ${SP.sm} ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textSub};
  text-align: center; word-break: keep-all; line-height: 1.4;
`;

/**
 * 교차 홍보 — 만든 사람의 다른 게임 (modals/OtherGames.tsx).
 *
 * 가이드 넷과 같은 줄이되 창틀 색이 다르다. 저 넷은 이 게임 안으로 들어가는
 * 길이고 이것만 밖으로 나가는 길이라, 같은 회색으로 두면 잘못 누른다.
 */
const OtherGamesBtn = styled(HelpBtn)`
  ${btnThin('gold')}
  padding: ${SP.sm} ${SP.xs};
  color: ${C.gold};
  ${media.mobile} { grid-column: 1 / -1; }
`;
