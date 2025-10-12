import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Search } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await signIn(email, password);
      // small delay to let auth state propagate
      await new Promise(r => setTimeout(r, 300));
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      const raw = String(err?.message || err || '');
      let msg = 'Failed to sign in. Please try again.';
      if (/Invalid login credentials/i.test(raw)) msg = 'Invalid email or password. Please try again.';
      else if (/Email not confirmed/i.test(raw)) msg = 'Please confirm your email address before signing in.';
      else if (/Too many requests/i.test(raw)) msg = 'Too many attempts. Please wait a few minutes and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Search className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">RebarHQ Research Agent</h1>
          <p className="text-gray-600 mt-2">AI-powered sales intelligence platform</p>
          <div className="mt-4 flex flex-col items-center justify-center gap-1 text-sm text-gray-600">
            <span className="uppercase tracking-wide text-xs text-gray-500">Powered by</span>
            <img src="/logo_black.png" alt="RebarHQ" className="h-8 w-auto drop-shadow-sm" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sign In</h2>

          {(error || info) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error || info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="you@company.com"
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:text-blue-700"
                  onClick={async () => {
                    setError('');
                    setInfo('');
                    try {
                      if (!email) { setError('Enter your email above, then click Forgot password.'); return; }
                      const redirectTo = `${window.location.origin}/login`;
                      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                      if (err) throw err;
                      setInfo('If the email exists, we sent a reset link. Check your inbox.');
                    } catch (e: any) {
                      setError(e?.message || 'Failed to send reset link.');
                    }
                  }}
                  aria-label="Forgot password"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-600 font-medium hover:text-blue-700">
              Sign up
            </Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">© {new Date().getFullYear()} RebarHQ. All rights reserved.</p>
      </div>
    </div>
  );
}
