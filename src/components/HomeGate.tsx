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
  // Hooks must not be conditional; precompute steps and reuse when needed
  const loadingSteps: LoadingStep[] = useMemo(() => ([
    { key: 'auth', title: 'Authenticating & restoring profile', status: 'in_progress' },
    { key: 'accounts', title: 'Syncing tracked accounts', status: 'pending' },
    { key: 'signals', title: 'Fetching signal summary', status: 'pending' },
    { key: 'chat', title: 'Warming research chat', status: 'pending' },
  ]), []);

  useEffect(() => {
    if (shouldRedirect && !handoffLock.current) {
      handoffLock.current = true;
      navigate('/onboarding', { replace: true });
    }
  }, [shouldRedirect, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl px-8 py-6 max-w-md text-center">
          <div className="text-base font-semibold text-gray-900">Sign in required</div>
          <div className="text-xs text-gray-600 mt-1">Your session isn’t active yet. Click below to sign in.</div>
          <div className="mt-3">
            <button className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg" onClick={() => (window.location.href = '/login')}>Go to Sign In</button>
          </div>
        </div>
      </div>
    );
  }

  const canSkip = (() => {
    try { return typeof window !== 'undefined' && window.localStorage?.getItem('skipHomeGate') === '1'; } catch { return false; }
  })();

  if (loading && !bypassGate && !canSkip) {
    return (
      <LoadingGate
        steps={loadingSteps}
        onContinueNow={() => {
          try { window.localStorage?.setItem('skipHomeGate', '1'); } catch {}
          setBypassGate(true);
        }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (shouldRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl px-8 py-6 max-w-md text-center">
          <div className="text-base font-semibold text-gray-900">Redirecting…</div>
          <div className="text-xs text-gray-600 mt-1">Taking you to onboarding to finish setup.</div>
        </div>
      </div>
    );
  }

  // Align with Just-In-Time Configuration: allow research immediately.
  // Show the chat by default; users can visit /onboarding to personalize.
  return <ResearchChat />;
}
