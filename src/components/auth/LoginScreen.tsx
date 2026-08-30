import { useState } from 'react';
import styled from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { Screen } from '../shared/screen';
import { authService } from '../../services/AuthService';
import { Settings } from '../modals/Settings';
import { useTranslation } from '../../i18n';
import { Emoji } from '../shared/Emoji';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { win, winThin, btn, btnThin, sunken, backdrop, pixelText, pixelBold, shadowLg } from '../../styles/pixel';

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
    // 기본 닉네임은 UI 언어를 따른다 — AuthService는 언어를 모르므로 여기서 넘긴다.
    authService.enterOfflineMode(name || t('login.defaultOfflineName'));
    // App의 onAuthStateChange 리스너가 '/'로 이동시킴
  };

  return (
    <>
      <Root>
        <SettingsBtn onClick={() => setShowSettings(true)}>
          <Emoji glyph="⚙" size={14} /> {t('nav.settings')}
        </SettingsBtn>

        <Layout>
          <BrandPanel>
            <BrandContent>
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

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
//
// 걷어낸 것: 별똥별 배경(장식용 파티클), eyebrow(letter-spacing 0.4em),
//           유리 카드 + backdrop-filter, 스태거 fadeUp, hover 떠오름+글로우,
//           둥근 모서리, Tailwind 팔레트(#2563eb #10b981 #f59e0b …).
// 배경은 실제 게임 맵을 어둡게 깐다 — backdrop().

const Root = styled(Screen)`
  ${backdrop('easy_loop')}
  position: relative; z-index: 10;
`;

const SettingsBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  position: fixed; top: ${SP.lg}; right: ${SP.lg}; z-index: 100;
  display: flex; align-items: center; gap: ${SP.xs};
  color: ${C.text}; padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
  ${media.mobile}   { top: ${SP.md}; right: ${SP.md}; }
  ${lMedia.phoneSm} { top: ${SP.sm}; right: ${SP.sm}; }
`;

const Layout = styled.div`
  flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh;
  ${media.tablet} { grid-template-columns: 1fr; }
`;

const BrandPanel = styled.div`
  display: flex; flex-direction: column; justify-content: space-between;
  padding: ${SP.xxl} ${SP.xxl};
  border-right: ${SCALE}px solid ${C.ink};
  position: relative; overflow: hidden;
  ${media.tablet} { display: none; }
`;

const BrandContent = styled.div``;

const BrandTitle = styled.h1`
  ${pixelBold}
  font-size: clamp(48px, 6vw, 84px);
  color: ${C.gold};
  margin: 0 0 ${SP.sm};
  line-height: 1;
  text-shadow: ${SCALE * 2}px ${SCALE * 2}px 0 ${C.ink};
`;

const BrandTagline = styled.div`
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

const BrandDivider = styled.div`
  width: 96px; height: ${SCALE}px;
  background: ${C.gold};
  margin: ${SP.xl} 0;
`;

const BrandFeatures = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;

const Feature = styled.div`
  display: flex; align-items: center; gap: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

/** 목록 점 — 원이 아니라 네모. */
const FeatureDot = styled.div`
  width: 6px; height: 6px; background: ${C.gold}; flex-shrink: 0;
`;

const BrandLogoWrap = styled.div`display: flex; align-items: flex-end; justify-content: flex-end;`;

const BrandLogo = styled.img`
  height: 200px; object-fit: contain;
`;

const FormPanel = styled.div`
  display: flex; align-items: center; justify-content: center;
  padding: ${SP.xxl} ${SP.lg};
  ${media.tablet}   { padding: ${SP.xxl} ${SP.lg}; }
  ${lMedia.phoneSm} { padding: ${SP.xl} ${SP.md}; }
`;

/** 로그인 창 — 창틀 안에 담는다. */
const FormCard = styled.div`
  ${win('gold')}
  width: 100%; max-width: 400px;
  padding: ${SP.xl};
  ${lMedia.phoneSm} { padding: ${SP.md}; }
`;

const MobileLogo = styled.img`
  display: none; height: 72px; object-fit: contain;
  margin: 0 auto ${SP.lg};
  ${media.tablet}   { display: block; }
  ${lMedia.phoneSm} { height: 52px; margin-bottom: ${SP.md}; }
`;

const FormHeading = styled.h2`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.text};
  margin: 0 0 ${SP.xs};
`;

const FormSubheading = styled.p`
  font-size: ${FONT.sm}; color: ${C.textSub};
  margin: 0 0 ${SP.xl};
  ${lMedia.phoneSm} { margin-bottom: ${SP.md}; }
`;

const GoogleBtn = styled.button`
  ${btn('blue')}
  ${pixelBold}
  width: 100%; display: flex; align-items: center; gap: ${SP.md};
  padding: ${SP.sm} ${SP.md};
  color: ${C.text}; font-size: ${FONT.sm};
  margin-bottom: ${SP.md};
  &:focus, &:focus-visible { outline: none; }
`;

const GoogleLetter = styled.div`
  width: 24px; height: 24px;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  display: flex; align-items: center; justify-content: center;
  font-size: ${FONT.sm}; flex-shrink: 0;
  text-shadow: none;
`;

const OrRow = styled.div`display: flex; align-items: center; gap: ${SP.md}; margin: ${SP.md} 0;`;
const OrLine = styled.div`flex: 1; height: ${SCALE}px; background: ${C.divider};`;
/** uppercase 를 걷어낸 자리 — 번역된 '또는' 그대로. */
const OrText = styled.span`font-size: ${FONT.sm}; color: ${C.textDim};`;

const GhostBtn = styled(GoogleBtn)`
  ${btn('plain')}
  margin-bottom: 0;
`;

const GhostIcon = styled.div`font-size: ${ICON.lg}px; width: 24px; text-align: center; flex-shrink: 0; line-height: 1;`;

const GuestForm = styled.div`display: flex; flex-direction: column; gap: ${SP.xs};`;

const GuestInput = styled.input`
  ${sunken()}
  ${pixelText}
  width: 100%; padding: ${SP.sm} ${SP.md};
  color: ${C.text}; font-size: ${FONT.sm}; outline: none; box-sizing: border-box;
  &:focus { outline: none; }
  &::placeholder { color: ${C.textDim}; }
`;

const GuestChars = styled.div`
  text-align: right; font-size: ${FONT.sm}; color: ${C.textDim};
`;

const ConfirmBtn = styled.button`
  ${btn('green')}
  ${pixelBold}
  width: 100%; padding: ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const CancelLink = styled.span`
  display: block; text-align: center; margin-top: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.textDim}; cursor: pointer;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
`;

const ErrorBox = styled.div`
  ${winThin('red')}
  margin-top: ${SP.md}; padding: ${SP.sm};
  color: ${C.red}; font-size: ${FONT.sm};
  text-shadow: 1px 1px 0 ${C.textShadow};
`;

/* [FREE-TIER] 무료 서버 한계 안내 박스 */
const LimitBox = styled.div`
  ${winThin('gold')}
  margin-top: ${SP.md}; padding: ${SP.sm};
`;

const LimitTitle = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold}; margin-bottom: ${SP.xs};
`;

const LimitDesc = styled.div`
  font-size: ${FONT.sm}; color: ${C.textSub};
`;

/* [FREE-TIER] 오프라인 플레이 버튼 ($highlight: 서버 한계 시 강조) */
const OfflineBtn = styled.button<{ $highlight?: boolean }>`
  ${p => btn(p.$highlight ? 'gold' : 'plain')}
  ${pixelBold}
  width: 100%; margin-top: ${SP.md}; padding: ${SP.sm} ${SP.md};
  font-size: ${FONT.sm};
  color: ${p => (p.$highlight ? C.gold : C.text)};
  &:focus, &:focus-visible { outline: none; }
`;

const Notice = styled.div`
  margin-top: ${SP.xl}; font-size: ${FONT.sm}; color: ${C.textDim};
  text-align: center;
  ${lMedia.phoneSm} { margin-top: ${SP.md}; }
`;
