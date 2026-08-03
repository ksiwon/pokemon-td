import { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { authService } from '../../services/AuthService';
import { ShootingStarsBackground } from '../ui/ShootingStarsBackground';
import { Settings } from '../modals/Settings';
import { useTranslation } from '../../i18n';
import { Emoji } from '../shared/Emoji';

export const LoginScreen = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guestMode, setGuestMode] = useState(false);
  const [nickname, setNickname] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  // [FREE-TIER] 무료 서버 한계로 로그인 실패 시 오프라인 안내/CTA 노출
  const [serverLimited, setServerLimited] = useState(false);

  const getErrorMessage = (err: any) => {
    const code = err?.code;
    if (code === 'auth/popup-closed-by-user') return t('login.errPopupClosed');
    if (code === 'auth/network-request-failed') return t('login.errNetwork');
    return err?.message || t('login.errDefault');
  };

  // 유저가 직접 팝업을 닫은 경우는 서버 한계가 아님 → 오프라인 안내 띄우지 않음
  const isUserCancellation = (code?: string) =>
    code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';

  const handleGoogleLogin = async () => {
    setLoading(true); setError('');
    try { await authService.signInWithGoogle(); }
    catch (err: any) {
      setError(getErrorMessage(err));
      if (!isUserCancellation(err?.code)) setServerLimited(true);
    }
    finally { setLoading(false); }
  };

  const handleGuestLogin = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) { setError(t('login.errEmpty')); return; }
    if (trimmed.length < 2 || trimmed.length > 12) { setError(t('login.errLength')); return; }
    setLoading(true); setError('');
    try { await authService.signInAsGuest(trimmed); }
    catch (err: any) {
      setError(getErrorMessage(err));
      if (!isUserCancellation(err?.code)) setServerLimited(true);
    }
    finally { setLoading(false); }
  };

  // [FREE-TIER] 오프라인(로컬 전용) 진입 — Firebase 호출 없음
  const handleOfflinePlay = () => {
    const name = guestMode ? nickname.trim() : '';
    authService.enterOfflineMode(name || undefined);
    // App의 onAuthStateChange 리스너가 '/'로 이동시킴
  };

  return (
    <>
      <ShootingStarsBackground />
      <Root>
        <SettingsBtn onClick={() => setShowSettings(true)}>
          <Emoji glyph="⚙" size={14} /> {t('nav.settings')}
        </SettingsBtn>

        <Layout>
          <BrandPanel>
            <BrandContent>
              <BrandEyebrow>POKEMON</BrandEyebrow>
              <BrandTitle>AEGIS</BrandTitle>
              <BrandTagline>{t('login.brandTagline')}</BrandTagline>
              <BrandDivider />
              <BrandFeatures>
                <Feature><FeatureDot />{t('login.feat1')}</Feature>
                <Feature><FeatureDot />{t('login.feat2')}</Feature>
                <Feature><FeatureDot />{t('login.feat3')}</Feature>
                <Feature><FeatureDot />{t('login.feat4')}</Feature>
              </BrandFeatures>
            </BrandContent>
            <BrandLogoWrap>
              <BrandLogo src="/images/pokemon-aegis.webp" alt="Pokemon Aegis" />
            </BrandLogoWrap>
          </BrandPanel>

          <FormPanel>
            <FormCard>
              <MobileLogo src="/images/pokemon-aegis.webp" alt="Pokemon Aegis" />
              <FormHeading>{t('login.signInHeading')}</FormHeading>
              <FormSubheading>{t('login.title')}</FormSubheading>

              {!guestMode ? (
                <>
                  <GoogleBtn onClick={handleGoogleLogin} disabled={loading}>
                    <GoogleLetter>G</GoogleLetter>
                    <span>{loading ? t('login.loggingIn') : t('login.google')}</span>
                  </GoogleBtn>
                  <OrRow><OrLine /><OrText>{t('login.or')}</OrText><OrLine /></OrRow>
                  <GhostBtn onClick={() => { setGuestMode(true); setError(''); }} disabled={loading}>
                    <GhostIcon><Emoji glyph="👤" size={16} /></GhostIcon>
                    <span>{t('login.guestBtn')}</span>
                  </GhostBtn>
                </>
              ) : (
                <GuestForm>
                  <GuestInput
                    type="text"
                    placeholder={t('login.guestPlaceholder')}
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGuestLogin()}
                    maxLength={12}
                    autoFocus
                  />
                  <GuestChars>{nickname.length}/12</GuestChars>
                  <ConfirmBtn onClick={handleGuestLogin} disabled={loading}>
                    {loading ? t('login.guestEntering') : t('login.guestEnter')}
                  </ConfirmBtn>
                  <CancelLink onClick={() => { setGuestMode(false); setError(''); setNickname(''); }}>
                    ← {t('login.cancel')}
                  </CancelLink>
                </GuestForm>
              )}

              {error && <ErrorBox>{error}</ErrorBox>}

              {/* [FREE-TIER] 무료 서버 한계 안내 + 오프라인 진입 */}
              {serverLimited && (
                <LimitBox>
                  <LimitTitle>{t('login.serverLimitedTitle')}</LimitTitle>
                  <LimitDesc>{t('login.serverLimitedDesc')}</LimitDesc>
                </LimitBox>
              )}

              <OfflineBtn onClick={handleOfflinePlay} disabled={loading} $highlight={serverLimited}>
                ▶ {t('login.offlinePlay')}
              </OfflineBtn>

              <Notice>{serverLimited ? t('login.offlineHint') : guestMode ? t('login.noticeGuest') : t('login.noticeDefault')}</Notice>
            </FormCard>
          </FormPanel>
        </Layout>
      </Root>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
};

const fadeUp = keyframes`from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}`;
const pulse = keyframes`0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}`;

const Root = styled.div`
  position: relative; z-index: 10;
  min-height: 100vh; display: flex; flex-direction: column;
`;

const SettingsBtn = styled.button`
  position: fixed; top: 20px; right: 20px; z-index: 100;
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; color: rgba(255,255,255,0.55); padding: 8px 14px;
  font-size: 13px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(8px);
  &:hover { background: rgba(255,255,255,0.1); color:#fff; border-color:rgba(255,255,255,0.2); }
  ${media.mobile} { padding:7px 11px;font-size:12px;top:12px;right:12px; }
  ${lMedia.phoneSm} { top:8px;right:8px; }
`;

const Layout = styled.div`
  flex:1; display:grid; grid-template-columns:1fr 1fr; min-height:100vh;
  ${media.tablet} { grid-template-columns:1fr; }
`;

const BrandPanel = styled.div`
  display:flex; flex-direction:column; justify-content:space-between;
  padding:60px 52px;
  background: linear-gradient(160deg,rgba(15,20,40,0.75) 0%,rgba(5,8,16,0.92) 100%);
  border-right: 1px solid rgba(245,158,11,0.1);
  position:relative; overflow:hidden;
  &::before {
    content:''; position:absolute; inset:0;
    background: repeating-linear-gradient(-55deg,transparent,transparent 24px,rgba(245,158,11,0.018) 24px,rgba(245,158,11,0.018) 25px);
    pointer-events:none;
  }
  ${media.tablet} { display:none; }
`;

const BrandContent = styled.div`animation:${fadeUp} 0.8s ease both;`;

const BrandEyebrow = styled.div`
  font-size:11px; font-weight:800; letter-spacing:0.4em;
  color:rgba(245,158,11,0.55); margin-bottom:8px;
`;

const BrandTitle = styled.h1`
  font-size:clamp(56px,6vw,88px); font-weight:900; letter-spacing:-0.02em;
  color:#f8fafc; margin:0 0 10px; line-height:1;
  text-shadow:0 0 60px rgba(245,158,11,0.2);
`;

const BrandTagline = styled.div`
  font-size:17px; color:rgba(255,255,255,0.38); font-weight:400; letter-spacing:0.05em;
`;

const BrandDivider = styled.div`
  width:48px; height:2px;
  background:linear-gradient(90deg,#f59e0b,transparent);
  margin:32px 0;
`;

const BrandFeatures = styled.div`display:flex; flex-direction:column; gap:12px;`;

const Feature = styled.div`
  display:flex; align-items:center; gap:10px;
  font-size:14px; color:rgba(255,255,255,0.45);
  animation:${fadeUp} 0.8s ease both;
  &:nth-child(1){animation-delay:.1s} &:nth-child(2){animation-delay:.2s}
  &:nth-child(3){animation-delay:.3s} &:nth-child(4){animation-delay:.4s}
`;

const FeatureDot = styled.div`
  width:5px; height:5px; border-radius:50%; background:#f59e0b; flex-shrink:0;
`;

const BrandLogoWrap = styled.div`display:flex; align-items:flex-end; justify-content:flex-end;`;

const BrandLogo = styled.img`
  height:200px; object-fit:contain;
  filter:drop-shadow(0 0 48px rgba(245,158,11,0.28));
  animation:${pulse} 4.5s ease-in-out infinite; opacity:0.8;
`;

const FormPanel = styled.div`
  display:flex; align-items:center; justify-content:center;
  padding:40px 24px;
  background:rgba(7,9,15,0.55); backdrop-filter:blur(20px);
  ${media.tablet} { padding:60px 24px; }
  ${lMedia.phoneSm} { padding:32px 16px; }
`;

const FormCard = styled.div`
  width:100%; max-width:400px;
  animation:${fadeUp} 0.6s ease both; animation-delay:0.2s;
`;

const MobileLogo = styled.img`
  display:none; height:72px; object-fit:contain;
  margin:0 auto 28px; filter:drop-shadow(0 0 24px rgba(245,158,11,0.35));
  ${media.tablet} { display:block; }
  ${lMedia.phoneSm} { height:52px; margin-bottom:18px; }
`;

const FormHeading = styled.h2`
  font-size:28px; font-weight:800; color:#f8fafc;
  margin:0 0 6px; letter-spacing:-0.01em;
  ${media.mobile} { font-size:24px; }
`;

const FormSubheading = styled.p`
  font-size:14px; color:rgba(255,255,255,0.38);
  margin:0 0 36px; line-height:1.5;
  ${media.mobile} { margin-bottom:28px; font-size:13px; }
  ${lMedia.phoneSm} { margin-bottom:20px; }
`;

const GoogleBtn = styled.button`
  width:100%; display:flex; align-items:center; gap:14px;
  padding:15px 20px; background:#2563eb;
  border:1px solid rgba(37,99,235,0.3); border-radius:10px;
  color:#fff; font-size:15px; font-weight:600;
  cursor:pointer; transition:all 0.2s; margin-bottom:16px;
  &:hover:not(:disabled) { background:#1d4ed8; transform:translateY(-1px); box-shadow:0 8px 24px rgba(37,99,235,0.35); }
  &:disabled { opacity:.5; cursor:not-allowed; }
  ${media.mobile} { padding:13px 18px; font-size:14px; }
  ${lMedia.phoneSm} { padding:11px 16px; }
`;

const GoogleLetter = styled.div`
  width:26px; height:26px; background:rgba(255,255,255,0.15);
  border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-weight:900; font-size:15px; flex-shrink:0;
`;

const OrRow = styled.div`display:flex; align-items:center; gap:12px; margin:20px 0;`;
const OrLine = styled.div`flex:1; height:1px; background:rgba(255,255,255,0.08);`;
const OrText = styled.span`font-size:12px; color:rgba(255,255,255,0.28); letter-spacing:.06em; text-transform:uppercase;`;

const GhostBtn = styled(GoogleBtn)`
  background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.1); margin-bottom:0;
  &:hover:not(:disabled) { background:rgba(255,255,255,0.08); transform:translateY(-1px); box-shadow:0 8px 24px rgba(0,0,0,0.3); }
`;

const GhostIcon = styled.div`font-size:18px; width:26px; text-align:center; flex-shrink:0;`;

const GuestForm = styled.div`display:flex; flex-direction:column; gap:0;`;

const GuestInput = styled.input`
  width:100%; padding:14px 16px;
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
  border-bottom:none; border-radius:10px 10px 0 0;
  color:#f8fafc; font-size:15px; outline:none; transition:border-color 0.2s; box-sizing:border-box;
  &:focus { border-color:rgba(245,158,11,0.5); }
  &::placeholder { color:rgba(255,255,255,0.2); }
  ${media.mobile} { padding:12px 14px; font-size:14px; }
`;

const GuestChars = styled.div`
  text-align:right; font-size:11px; color:rgba(255,255,255,0.2); padding:5px 14px;
  background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.12); border-top:none; border-bottom:none;
`;

const ConfirmBtn = styled.button`
  width:100%; padding:14px; background:#10b981; border:none;
  border-radius:0 0 10px 10px; color:#fff; font-size:15px; font-weight:700;
  cursor:pointer; transition:all 0.2s;
  &:hover:not(:disabled) { background:#059669; }
  &:disabled { opacity:.5; cursor:not-allowed; }
  ${media.mobile} { padding:12px; font-size:14px; }
`;

const CancelLink = styled.span`
  display:block; text-align:center; margin-top:14px; font-size:13px;
  color:rgba(255,255,255,0.28); cursor:pointer; transition:color 0.2s;
  &:hover { color:rgba(255,255,255,0.6); }
`;

const ErrorBox = styled.div`
  margin-top:16px; padding:12px 16px;
  background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);
  border-radius:8px; color:#fca5a5; font-size:13px; line-height:1.5;
`;

// [FREE-TIER] 무료 서버 한계 안내 박스
const LimitBox = styled.div`
  margin-top:16px; padding:14px 16px;
  background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3);
  border-radius:10px;
`;

const LimitTitle = styled.div`
  font-size:14px; font-weight:700; color:#fbbf24; margin-bottom:6px;
`;

const LimitDesc = styled.div`
  font-size:12.5px; color:rgba(255,255,255,0.62); line-height:1.6;
`;

// [FREE-TIER] 오프라인 플레이 버튼 ($highlight: 서버 한계 시 강조)
const OfflineBtn = styled.button<{ $highlight?: boolean }>`
  width:100%; margin-top:16px; padding:14px 18px;
  border-radius:10px; cursor:pointer; font-size:14px; font-weight:600;
  transition:all 0.2s;
  background:${p => p.$highlight ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.04)'};
  border:1px solid ${p => p.$highlight ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'};
  color:${p => p.$highlight ? '#fcd34d' : 'rgba(255,255,255,0.55)'};
  &:hover:not(:disabled) {
    background:${p => p.$highlight ? 'rgba(245,158,11,0.24)' : 'rgba(255,255,255,0.08)'};
    color:#fff;
  }
  &:disabled { opacity:.5; cursor:not-allowed; }
  ${media.mobile} { padding:12px 16px; font-size:13px; }
`;

const Notice = styled.div`
  margin-top:28px; font-size:12px; color:rgba(255,255,255,0.2);
  line-height:1.6; text-align:center;
  ${media.mobile} { margin-top:20px; }
  ${lMedia.phoneSm} { margin-top:14px; }
`;