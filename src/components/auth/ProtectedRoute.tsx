// src/components/auth/ProtectedRoute.tsx
import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/AuthService';
import { User } from '../../types/multiplayer';
import { useTranslation } from '../../i18n';
import styled from 'styled-components';
import { C, FONT } from '../../styles/tokens';
import { pixelBold, shadowLg } from '../../styles/pixel';

/** 인증 확인 동안 잠깐 덮는 화면. 앱에서 제일 먼저 보이는 면이라 색이 어긋나면 티가 난다. */
const LoadingOverlay = styled.div`
  ${pixelBold}
  ${shadowLg}
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: ${C.bg};
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: ${FONT.xl};
  color: ${C.text};
  z-index: 99999;
`;

export const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(authService.getCurrentUser());
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((authedUser) => {
      console.log('ProtectedRoute(onAuthStateChange):', authedUser?.displayName || 'null');
      setUser(authedUser);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  if (isLoading) {
    console.log('ProtectedRoute: 로딩 중...');
    return <LoadingOverlay>{t('login.checkingUser')}</LoadingOverlay>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};