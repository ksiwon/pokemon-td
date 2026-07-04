// src/components/menu/MainMenu.tsx
import { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { authService } from '../../services/AuthService';
import { useNavigate } from 'react-router-dom';
import { ShootingStarsBackground } from '../ui/ShootingStarsBackground';
import { useTranslation } from '../../i18n';
import { Emoji } from '../shared/Emoji';
import { AchievementsPanel } from '../modals/Achievements';
import { HallOfFame } from '../modals/HallOfFame';
import { Rankings } from '../modals/Rankings';
import { TutorialModal, hasTowerTutorialSeen, hasMultiTutorialSeen, hasStoryTutorialSeen } from '../modals/TutorialModal';

export const MainMenu = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();
  const isOffline = authService.isOfflineMode();
  const { t } = useTranslation();
  const [showAchievements, setShowAchievements] = useState(false);
  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  const [tutorial, setTutorial] = useState<'tower' | 'multi' | 'story' | null>(null);
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
    if (isOffline) { alert(t('mainMenu.offlineMultiBlocked')); return; }
    if (!hasMultiTutorialSeen()) { setPendingNav('/lobby'); setTutorial('multi'); }
    else navigate('/lobby');
  };

  // 카드 연구소 — 오프라인에서도 동작(로컬 수집/팩깡)
  const handleCards = () => navigate('/cards');

  // [FREE-TIER] 오프라인 모드: 서버 의존 기능(랭킹/전당) 차단
  const handleRankings = () => {
    if (isOffline) { alert(t('mainMenu.offlineRankingBlocked')); return; }
    setShowRankings(true);
  };
  const handleHallOfFame = () => {
    if (isOffline) { alert(t('mainMenu.offlineRankingBlocked')); return; }
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
      <ShootingStarsBackground />
      <Root>
        {/* ── Top bar ── */}
        <TopBar>
          <LogoMark>
            <LogoImg src="/images/pokemon-aegis.png" alt="" />
            <LogoText>
              <LogoMain>POKEMON AEGIS</LogoMain>
            </LogoText>
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
              <RatingChip>★ {user?.rating ?? 0}</RatingChip>
            </UserChip>
            <SignOutBtn onClick={handleSignOut}>{t('mainMenu.signOut')}</SignOutBtn>
          </TopBarRight>
        </TopBar>

        {/* ── Main content ── */}
        <Main>
          <HeroSection>
            <HeroEyebrow>{t('mainMenu.selectGameMode')}</HeroEyebrow>
            <HeroTitle>{t('mainMenu.gameTitle')}</HeroTitle>
          </HeroSection>

          {/* [FREE-TIER] 오프라인 모드 안내 배너 */}
          {isOffline && (
            <OfflineBanner>
              <OfflineBadge><Emoji glyph="🔌" size={14} /> {t('mainMenu.offlineBadge')}</OfflineBadge>
              <OfflineDesc>{t('mainMenu.offlineBannerDesc')}</OfflineDesc>
            </OfflineBanner>
          )}

          {/* Primary game mode cards */}
          <ModeGrid>
            <ModeCard $accent="#3b82f6" onClick={handleSinglePlay}>
              <ModeCardBg $color="rgba(59,130,246,0.06)" />
              <ModeCardBorder $color="#3b82f6" />
              <ModeIconWrap $bg="rgba(59,130,246,0.1)">
                <ModeEmoji><Emoji glyph="👤" size={26} /></ModeEmoji>
              </ModeIconWrap>
              <ModeInfo>
                <ModeName>{t('mainMenu.singlePlay')}</ModeName>
                <ModeDesc>{t('mainMenu.singlePlayDesc')}</ModeDesc>
              </ModeInfo>
              <ModeArrow>→</ModeArrow>
            </ModeCard>

            <ModeCard $accent="#f59e0b" onClick={handleStoryPlay}>
              <ModeCardBg $color="rgba(245,158,11,0.06)" />
              <ModeCardBorder $color="#f59e0b" />
              <ModeIconWrap $bg="rgba(245,158,11,0.1)">
                <ModeEmoji><Emoji glyph="⚔️" size={26} /></ModeEmoji>
              </ModeIconWrap>
              <ModeInfo>
                <ModeName>{t('mainMenu.storyPlay')}</ModeName>
                <ModeDesc>{t('mainMenu.storyPlayDesc')}</ModeDesc>
              </ModeInfo>
              <ModeArrow>→</ModeArrow>
            </ModeCard>

            <ModeCard $accent="#10b981" onClick={handleMultiPlay} $disabled={isOffline}>
              <ModeCardBg $color="rgba(16,185,129,0.06)" />
              <ModeCardBorder $color="#10b981" />
              <ModeIconWrap $bg="rgba(16,185,129,0.1)">
                <ModeEmoji><Emoji glyph="👥" size={26} /></ModeEmoji>
              </ModeIconWrap>
              <ModeInfo>
                <ModeName>{t('mainMenu.multiPlay')}</ModeName>
                <ModeDesc>{isOffline ? <><Emoji glyph="🔒" size={12} /> {t('mainMenu.offlineBadge')}</> : t('mainMenu.multiPlayDesc')}</ModeDesc>
              </ModeInfo>
              <ModeArrow>→</ModeArrow>
            </ModeCard>

            <ModeCard $accent="#c084fc" onClick={handleCards}>
              <ModeCardBg $color="rgba(192,132,252,0.06)" />
              <ModeCardBorder $color="#c084fc" />
              <ModeIconWrap $bg="rgba(192,132,252,0.1)">
                <ModeEmoji><Emoji glyph="🃏" size={26} /></ModeEmoji>
              </ModeIconWrap>
              <ModeInfo>
                <ModeName>{t('cards.menu.title')}</ModeName>
                <ModeDesc>{t('cards.menu.desc')}</ModeDesc>
              </ModeInfo>
              <ModeArrow>→</ModeArrow>
            </ModeCard>
          </ModeGrid>

          {/* Utility row */}
          <UtilSection>
            <UtilLabel>{t('mainMenu.myInfo')}</UtilLabel>
            <UtilRow>
              <UtilBtn onClick={() => setShowAchievements(true)}>
                <UtilIcon><Emoji glyph="🏅" size={16} /></UtilIcon>{t('mainMenu.achievements')}
              </UtilBtn>
              <UtilBtn onClick={handleHallOfFame} $dim={isOffline}>
                <UtilIcon><Emoji glyph="🏆" size={16} /></UtilIcon>{t('mainMenu.hallOfFame')}
              </UtilBtn>
              <UtilBtn onClick={handleRankings} $dim={isOffline}>
                <UtilIcon><Emoji glyph="📊" size={16} /></UtilIcon>{t('mainMenu.rankings')}
              </UtilBtn>
            </UtilRow>
          </UtilSection>

          {/* Help row */}
          <HelpRow>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('tower'); }}>
              ? {t('mainMenu.helpSingle')}
            </HelpBtn>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('story'); }}>
              ? {t('mainMenu.helpStory')}
            </HelpBtn>
            <HelpBtn onClick={() => { setPendingNav(null); setTutorial('multi'); }}>
              ? {t('mainMenu.helpMulti')}
            </HelpBtn>
          </HelpRow>
        </Main>
      </Root>

      {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
      {showHallOfFame   && <HallOfFame        onClose={() => setShowHallOfFame(false)} />}
      {showRankings     && <Rankings          onClose={() => setShowRankings(false)} />}
      {tutorial && (
        <TutorialModal mode={tutorial} onClose={handleClose}
          onProceed={pendingNav ? handleProceed : undefined} />
      )}
    </>
  );
};

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp = keyframes`from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}`;

// ─── Root ────────────────────────────────────────────────────────────────────

const Root = styled.div`
  position:relative; z-index:10; min-height:100vh;
  display:flex; flex-direction:column;
  background:rgba(7,9,15,0.5); backdrop-filter:blur(2px);
`;

// ─── Top Bar ─────────────────────────────────────────────────────────────────

const TopBar = styled.header`
  display:flex; align-items:center; justify-content:space-between;
  padding:0 32px; height:64px;
  background:rgba(255,255,255,0.025);
  border-bottom:1px solid rgba(255,255,255,0.07);
  backdrop-filter:blur(12px);
  position:sticky; top:0; z-index:50;

  ${media.mobile} { padding:0 16px; height:56px; }
  ${lMedia.phoneSm} { height:48px; padding:0 12px; }
`;

const LogoMark = styled.div`display:flex; align-items:center; gap:10px;`;

const LogoImg = styled.img`
  height:32px; object-fit:contain;
  filter:drop-shadow(0 0 8px rgba(245,158,11,0.4));
  ${media.mobile} { height:26px; }
`;

const LogoText = styled.div``;

const LogoMain = styled.div`
  font-size:13px; font-weight:800; letter-spacing:0.12em;
  color:rgba(255,255,255,0.85); white-space:nowrap;
  /* 모바일: 상단바 우측(유저/로그아웃) 공간 확보 위해 브랜드 텍스트 숨김(로고 이미지 유지) */
  ${media.mobile} { display:none; }
`;

const TopBarRight = styled.div`display:flex; align-items:center; gap:12px;`;

const UserChip = styled.div`
  display:flex; align-items:center; gap:8px;
  background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:100px; padding:5px 12px 5px 6px;
  position:relative; min-width:0;
`;

const Avatar = styled.img`
  width:28px; height:28px; border-radius:50%;
  object-fit:cover; flex-shrink:0;
  border:1px solid rgba(255,255,255,0.15);
`;

const AvatarFallback = styled.div`
  width:28px; height:28px; border-radius:50%;
  background:linear-gradient(135deg,#3b82f6,#1d4ed8);
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:#fff; flex-shrink:0;
  border:1px solid rgba(255,255,255,0.15);
  pointer-events:none;
`;

const UserName = styled.span`
  font-size:13px; font-weight:600; color:#f8fafc;
  max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  ${media.mobile} { max-width:110px; font-size:12px; }
  ${lMedia.phoneSm} { display:none; }
`;

const RatingChip = styled.span`
  font-size:12px; font-weight:700; color:#f59e0b;
  flex-shrink:0; white-space:nowrap;
  ${media.mobile} { font-size:11px; }
`;

const SignOutBtn = styled.button`
  padding:7px 14px; background:transparent;
  border:1px solid rgba(255,255,255,0.1); border-radius:8px;
  color:rgba(255,255,255,0.45); font-size:13px;
  cursor:pointer; transition:all 0.2s;
  white-space:nowrap; flex-shrink:0;
  &:hover { background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); color:#fca5a5; }
  ${media.mobile} { padding:6px 10px; font-size:12px; }
  ${lMedia.phoneSm} { display:none; }
`;

// ─── Main Content ─────────────────────────────────────────────────────────────

const Main = styled.main`
  flex:1; display:flex; flex-direction:column;
  max-width:900px; width:100%;
  margin:0 auto; padding:48px 32px 40px;
  animation:${fadeUp} 0.5s ease both; animation-delay:0.1s;

  ${media.tablet} { padding:36px 24px 32px; }
  ${media.mobile} { padding:24px 16px 24px; }
  ${lMedia.phoneSm} { padding:16px 16px 16px; }
`;

const HeroSection = styled.div`margin-bottom:36px; ${media.mobile}{margin-bottom:24px;} ${lMedia.phoneSm}{margin-bottom:16px;}`;

const HeroEyebrow = styled.div`
  font-size:11px; font-weight:700; letter-spacing:0.25em;
  color:rgba(245,158,11,0.6); text-transform:uppercase; margin-bottom:8px;
`;

const HeroTitle = styled.h1`
  font-size:clamp(24px,4vw,36px); font-weight:900;
  color:#f8fafc; margin:0; letter-spacing:-0.02em;
  line-height:1.1;
`;

// ─── Mode Cards ───────────────────────────────────────────────────────────────

const ModeGrid = styled.div`
  display:grid; grid-template-columns:repeat(3,1fr); gap:14px;
  margin-bottom:32px;
  ${media.tablet} { grid-template-columns:1fr; gap:10px; }
  ${lMedia.phoneSm} { grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
`;

const ModeCard = styled.button<{ $accent: string; $disabled?: boolean }>`
  display:flex; align-items:center; gap:14px;
  padding:20px 18px;
  background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:14px; cursor:pointer; text-align:left;
  position:relative; overflow:hidden;
  transition:all 0.22s ease; color:#fff;
  ${p => p.$disabled && css`opacity:0.5; filter:grayscale(0.6);`}

  &:hover {
    border-color: ${p => p.$accent}55;
    background: ${p => p.$accent}0a;
    transform:translateY(-2px);
    box-shadow:0 12px 32px ${p => p.$accent}18;
  }
  &:active { transform:translateY(0); }

  ${media.tablet} { padding:18px 20px; gap:16px; }
  ${media.mobile} { padding:14px 16px; }
  ${lMedia.phoneSm} { padding:10px 10px; gap:8px; flex-direction:column; align-items:flex-start; }
`;

const ModeCardBg = styled.div<{ $color: string }>`
  position:absolute; inset:0; background:${p=>p.$color};
  opacity:0; transition:opacity 0.22s;
  ${ModeCard}:hover & { opacity:1; }
`;

const ModeCardBorder = styled.div<{ $color: string }>`
  position:absolute; left:0; top:20%; bottom:20%; width:3px;
  background:${p=>p.$color}; border-radius:0 2px 2px 0;
  opacity:0; transition:opacity 0.22s;
  ${ModeCard}:hover & { opacity:1; }
`;

const ModeIconWrap = styled.div<{ $bg: string }>`
  width:46px; height:46px; border-radius:12px;
  background:${p=>p.$bg}; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  ${media.mobile} { width:40px; height:40px; border-radius:10px; }
  ${lMedia.phoneSm} { width:32px; height:32px; border-radius:8px; }
`;

const ModeEmoji = styled.span`
  font-size:22px;
  ${media.mobile} { font-size:20px; }
  ${lMedia.phoneSm} { font-size:16px; }
`;

const ModeInfo = styled.div`flex:1; position:relative; z-index:1; min-width:0;`;

const ModeName = styled.div`
  font-size:16px; font-weight:700; color:#f8fafc;
  margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  ${media.mobile} { font-size:15px; }
  ${lMedia.phoneSm} { font-size:12px; margin-bottom:2px; white-space:normal; }
`;

const ModeDesc = styled.div`
  font-size:12px; color:rgba(255,255,255,0.38); line-height:1.4;
  ${lMedia.phoneSm} { display:none; }
`;

const ModeArrow = styled.div`
  font-size:18px; color:rgba(255,255,255,0.2); transition:all 0.2s; flex-shrink:0;
  ${ModeCard}:hover & { color:rgba(255,255,255,0.7); transform:translateX(4px); }
  ${lMedia.phoneSm} { display:none; }
`;

// ─── Utility ──────────────────────────────────────────────────────────────────

const UtilSection = styled.div`margin-bottom:16px;`;

const UtilLabel = styled.div`
  font-size:11px; font-weight:700; letter-spacing:0.2em;
  color:rgba(255,255,255,0.28); text-transform:uppercase; margin-bottom:10px;
`;

const UtilRow = styled.div`
  display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
  ${media.mobile} { gap:8px; }
  ${lMedia.phoneSm} { gap:6px; }
`;

const UtilBtn = styled.button<{ $dim?: boolean }>`
  display:flex; align-items:center; justify-content:center; gap:7px;
  padding:12px 10px;
  background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:10px; cursor:pointer;
  font-size:14px; font-weight:500; color:rgba(255,255,255,0.6);
  transition:all 0.2s;
  ${p => p.$dim && css`opacity:0.5;`}
  &:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.14); color:#fff; }
  ${media.mobile} { font-size:13px; padding:10px 8px; }
  ${lMedia.phoneSm} { font-size:11px; padding:8px 6px; gap:5px; }
`;

// [FREE-TIER] 오프라인 모드 배너
const OfflineBanner = styled.div`
  margin:-12px 0 28px; padding:14px 18px;
  background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.28);
  border-radius:12px; display:flex; flex-direction:column; gap:6px;
  ${media.mobile} { margin:-8px 0 18px; padding:12px 14px; }
`;

const OfflineBadge = styled.div`
  font-size:13px; font-weight:700; color:#fbbf24;
  ${media.mobile} { font-size:12px; }
`;

const OfflineDesc = styled.div`
  font-size:12.5px; color:rgba(255,255,255,0.6); line-height:1.6;
  ${media.mobile} { font-size:11.5px; }
`;

const UtilIcon = styled.span`font-size:16px; ${lMedia.phoneSm}{font-size:14px;}`;

const HelpRow = styled.div`
  display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
  ${media.mobile} { gap:6px; }
  ${lMedia.phoneSm} { gap:6px; }
`;

const HelpBtn = styled.button`
  padding:9px 12px;
  background:transparent;
  border:1px solid rgba(255,255,255,0.06);
  border-radius:8px; cursor:pointer;
  font-size:12px; color:rgba(255,255,255,0.28);
  transition:all 0.2s;
  /* 3열이라 모바일에서 긴 한글 라벨이 단어 단위로 깔끔히 줄바꿈되도록 */
  text-align:center; line-height:1.3; word-break:keep-all;
  &:hover { background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.55); border-color:rgba(255,255,255,0.1); }
  ${media.mobile} { font-size:10.5px; padding:8px 6px; }
  ${lMedia.phoneSm} { font-size:9.5px; padding:6px 5px; }
`;