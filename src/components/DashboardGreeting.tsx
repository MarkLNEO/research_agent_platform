import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, Building2, TrendingUp, Clock, ChevronRight, Zap, AlertTriangle, Flame } from 'lucide-react';

interface Signal {
  id: string;
  company_name: string;
  company_id: string;
  signal_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  signal_date: string;
  days_ago: number;
  source_url?: string;
  score: number;
}

interface AccountStats {
  total: number;
  hot: number;
  warm: number;
  stale: number;
  with_signals: number;
}

interface DashboardData {
  greeting: {
    time_of_day: string;
    user_name: string;
  };
  signals: Signal[];
  account_stats: AccountStats;
  suggestions: string[];
  user_context: {
    first_name: string;
    role?: string;
    industry?: string;
    accounts_configured: boolean;
    signals_configured: boolean;
    custom_criteria_configured: boolean;
    profile_health: number;
  };
}

interface DashboardGreetingProps {
  onSuggestionClick: (suggestion: string) => void;
  onSignalClick: (company: string) => void;
  onViewAccounts?: () => void;
}

export function DashboardGreeting({ onSuggestionClick, onSignalClick, onViewAccounts }: DashboardGreetingProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
    // Refresh every 5 minutes if tab is active
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadDashboardData();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return;

      const response = await fetch(`/api/dashboard/greeting`, {
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const dashboardData = await response.json();
      setData(dashboardData);
      setError(null);
    } catch (err) {
      console.error('Failed to load dashboard greeting:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Flame className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getGreeting = () => {
    if (!data) return 'Welcome!';
    const { time_of_day, user_name } = data.greeting;
    return `Good ${time_of_day}, ${user_name}!`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Loading your dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasSignals = data.signals.length > 0;
  const hasAccounts = data.account_stats.total > 0;

  return (
    <div className="space-y-6" data-testid="dashboard-greeting">
      {/* Greeting Header */}
      <div className="text-3xl font-serif text-gray-900">
        {getGreeting()}
      </div>

      {/* Signal Alerts - Most Prominent */}
      {hasSignals ? (
        <div className="bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg" aria-live="polite">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-6 h-6 text-orange-600 animate-pulse" />
            <h2 className="text-xl font-semibold text-gray-900">
              {data.signals.length} hot signal{data.signals.length > 1 ? 's' : ''} detected on your accounts
            </h2>
          </div>

          <div className="space-y-3">
            {data.signals.slice(0, 3).map((signal) => (
              <div
                key={signal.id}
                className="bg-white rounded-lg p-4 border border-gray-200 hover:border-orange-300 transition-colors cursor-pointer"
                onClick={() => onSignalClick(signal.company_name)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityIcon(signal.severity)}
                      <span className="font-semibold text-gray-900">{signal.company_name}</span>
                      <span className="text-sm text-gray-500">• {signal.days_ago === 0 ? 'Today' : `${signal.days_ago} day${signal.days_ago > 1 ? 's' : ''} ago`}</span>
                    </div>
                    <p className="text-sm text-gray-700">{signal.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 mt-1" />
                </div>
              </div>
            ))}
          </div>

          {data.signals.length > 3 && (
            <button
              onClick={() => onSuggestionClick('Show all signals')}
              className="mt-4 text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              View all {data.signals.length} signals →
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <Zap className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All clear — no new signals yet</h2>
              <p className="text-sm text-gray-600 mt-1">
                I’ll alert you the moment leadership changes, funding rounds, or incidents hit your tracked accounts.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => onSuggestionClick('Refresh all tracked accounts')}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100"
                >
                  Refresh tracked accounts
                </button>
                <button
                  onClick={() => onSuggestionClick('Set up new signal preferences')}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200"
                >
                  Configure buying signals
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Summary */}
      {hasAccounts && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200" aria-labelledby="tracked-accounts-summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-500" />
              <div>
                <div className="text-2xl font-semibold text-gray-900">{data.account_stats.total}</div>
                <div className="text-xs text-gray-600">accounts tracked</div>
              </div>
            </div>

            {data.account_stats.with_signals > 0 && (
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-semibold text-orange-600">{data.account_stats.with_signals}</div>
                  <div className="text-xs text-gray-600">with signals</div>
                </div>
              </div>
            )}

            {data.account_stats.hot > 0 && (
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-2xl font-semibold text-red-600">{data.account_stats.hot}</div>
                  <div className="text-xs text-gray-600">hot accounts</div>
                </div>
              </div>
            )}

            {data.account_stats.stale > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-semibold text-yellow-600">{data.account_stats.stale}</div>
                  <div className="text-xs text-gray-600">need updates</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
            <p id="tracked-accounts-summary" className="leading-relaxed">
              Hot = recent critical signals, Warm = promising momentum, Stale = no fresh research in 14+ days.
            </p>
            {onViewAccounts && (
              <button
                type="button"
                onClick={onViewAccounts}
                className="inline-flex items-center gap-2 self-start md:self-auto px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100 transition-colors"
              >
                View tracked accounts
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Smart Suggestions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Quick actions</h3>
          <button
            onClick={() => onSuggestionClick('Research my top priority account')}
            className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700"
          >
            Start a new research →
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(data.suggestions.length ? data.suggestions : [
            'Which accounts had changes this week?',
            'Research my top 5 accounts',
            'Draft a follow-up referencing the latest signal'
          ]).map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onSuggestionClick(suggestion)}
              className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={`Suggestion: ${suggestion}`}
            >
              {`“${suggestion}”`}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Health Hint (if low) */}
      {data.user_context.profile_health < 50 && !hasAccounts && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-900 font-medium">Complete your profile for better results</p>
              <p className="text-sm text-blue-700 mt-1">
                I can provide more targeted insights once I know your industry, role, and what signals matter to you.
              </p>
              <button
                onClick={() => onSuggestionClick('Help me set up my profile')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Quick setup →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
