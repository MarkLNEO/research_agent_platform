import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ResearchChat } from '../pages/ResearchChat';
import { useUserProfile } from '../hooks/useUserProfile';
import { LoadingGate, type LoadingStep } from './LoadingGate';

export function HomeGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, isProfileIncomplete } = useUserProfile();

  const profileIncomplete = user ? isProfileIncomplete() : false;
  const shouldRedirect = Boolean(user) && !loading && profileIncomplete;
  const [bypassGate, setBypassGate] = useState(false);
  const handoffLock = useRef(false);

  useEffect(() => {
    if (shouldRedirect && !handoffLock.current) {
      handoffLock.current = true;
      navigate('/onboarding', { replace: true });
    }
  }, [shouldRedirect, navigate]);

  if (!user) {
    return null;
  }

  const canSkip = (() => {
    try { return typeof window !== 'undefined' && window.localStorage?.getItem('skipHomeGate') === '1'; } catch { return false; }
  })();

  if (loading && !bypassGate && !canSkip) {
    const steps: LoadingStep[] = useMemo(() => ([
      { key: 'auth', title: 'Authenticating & restoring profile', status: 'in_progress' },
      { key: 'accounts', title: 'Syncing tracked accounts', status: 'pending' },
      { key: 'signals', title: 'Fetching signal summary', status: 'pending' },
      { key: 'chat', title: 'Warming research chat', status: 'pending' },
    ]), []);

    return (
      <LoadingGate
        steps={steps}
        onContinueNow={() => {
          try { window.localStorage?.setItem('skipHomeGate', '1'); } catch {}
          setBypassGate(true);
        }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (shouldRedirect) {
    return null;
  }

  // Align with Just-In-Time Configuration: allow research immediately.
  // Show the chat by default; users can visit /onboarding to personalize.
  return <ResearchChat />;
}
