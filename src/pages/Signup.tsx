import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Search } from 'lucide-react';

export function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try domain allowlisted signup via serverless first (auto-confirm for approved domains)
      try {
        const resp = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        if (!resp.ok) {
          // Fall back to default Supabase signup if serverless path not available/denied
          await signUp(email, password, name);
        }
      } catch {
        await signUp(email, password, name);
      }
      
      // Send approval notification via internal API route
      try {
        await fetch(`/api/approvals/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: { email, user_metadata: { name } } }),
        });
      } catch (emailError) {
        console.warn('Failed to send signup notification:', emailError);
        // Don't block signup if email fails
      }
      
      // Try to sign in immediately (will succeed if email is auto-confirmed or confirmations are disabled)
      try {
        await signIn(email, password);
      } catch {}

      // If authenticated, check approval status and route accordingly
      try {
        const { data: { user: authed } } = await supabase.auth.getUser();
        if (authed?.id) {
          const { data } = await supabase
            .from('users')
            .select('approval_status')
            .eq('id', authed.id)
            .maybeSingle();
          if (data?.approval_status === 'approved') {
            navigate('/');
            return;
          }
          navigate('/pending-approval');
          return;
        }
      } catch {}

      // If not authenticated (email confirm flow), send to login
      navigate('/login');
    } catch (err: any) {
      const raw = err?.message ? String(err.message) : '';
      // Map common auth errors to friendlier messages
      if (/invalid.*email/i.test(raw) || /email.*invalid/i.test(raw)) {
        setError('That email address looks invalid. Please use a standard format like name@gmail.com.');
      } else if (/password/i.test(raw) && /short|length/i.test(raw)) {
        setError('Your password is too short. Please use at least 6 characters.');
      } else if (/rate|too many/i.test(raw)) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError(raw || 'Failed to create account');
      }
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
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Create Account</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="John Smith"
                required
                autoFocus
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
                minLength={6}
              />
              <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
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
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:text-blue-700">
              Sign in
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              By creating an account, you get 100 free credits to try our research platform.
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">© {new Date().getFullYear()} RebarHQ. All rights reserved.</p>
      </div>
    </div>
  );
}
