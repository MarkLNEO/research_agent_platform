import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ResearchChat } from '../pages/ResearchChat';
import { useUserProfile } from '../hooks/useUserProfile';

export function HomeGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, isProfileIncomplete } = useUserProfile();

  const profileIncomplete = user ? isProfileIncomplete() : false;
  const shouldRedirect = Boolean(user) && !loading && profileIncomplete;

  useEffect(() => {
    if (shouldRedirect) {
      navigate('/onboarding', { replace: true });
    }
  }, [shouldRedirect, navigate]);

  if (!user) {
    return null;
  }

  if (loading) {
    try {
      // Allow bypass when explicitly requested (e.g., E2E safety valve)
      if (typeof window !== 'undefined' && window.localStorage?.getItem('skipHomeGate') === '1') {
        return <ResearchChat />;
      }
    } catch {}
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl px-8 py-6 max-w-md text-left">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" aria-hidden></span>
            Preparing your workspace
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We’re spinning up your research environment, syncing your profile data, and checking for account updates. This usually takes under a minute.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden></span>
              <span>1. Authenticate with Supabase and restore your profile preferences.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden></span>
              <span>2. Warm research agents and cache your tracked accounts.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden></span>
              <span>3. Pre-load today’s signals and meeting prep.</span>
            </li>
          </ol>
          <div className="mt-5 flex items-center justify-between text-xs text-gray-500">
            <span>If this takes longer than expected, you can retry or jump to the dashboard.</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100"
            >
              Retry setup
            </button>
            <button
              type="button"
              onClick={() => {
                try { window.localStorage?.setItem('skipHomeGate', '1'); } catch {}
                (window.location.href = '/');
              }}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              Open last dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (shouldRedirect) {
    return null;
  }

  // Align with Just-In-Time Configuration: allow research immediately.
  // Show the chat by default; users can visit /onboarding to personalize.
  return <ResearchChat />;
}
