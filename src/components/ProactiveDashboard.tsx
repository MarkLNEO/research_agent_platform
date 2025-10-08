import { useEffect, useState } from 'react';
import { AlertCircle, Activity } from 'lucide-react';
import { fetchDashboardGreeting, type DashboardGreeting } from '../services/accountService';

interface ProactiveDashboardProps {
  onSendMessage: (message: string) => void;
}

export function ProactiveDashboard({ onSendMessage: _onSendMessage }: ProactiveDashboardProps) {
  const [data, setData] = useState<DashboardGreeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const dashboardData = await fetchDashboardGreeting();
      setData(dashboardData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const prefillAndFocus = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('chat:prefill', {
      detail: { prompt }
    }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-24 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-16 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">👋 Welcome to Research Agent</h2>
          <p className="text-sm text-gray-600">I can research companies, surface buying signals, and prep you for upcoming meetings. Start by entering a company name or pasting a website in the composer below.</p>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Quick start suggestions</h3>
          <div className="flex flex-wrap gap-2">
            {['Research Boeing', 'Show me accounts with fresh signals', 'What changed for Lockheed this week?'].map(example => (
              <button
                key={example}
                onClick={() => prefillAndFocus(example)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900">
          <h4 className="font-semibold mb-1">Having trouble connecting?</h4>
          <p className="leading-relaxed">
            Double-check your local API server and environment variables:
            <code className="block bg-blue-100 text-blue-800 px-2 py-1 mt-2 rounded">
              npm run dev:all • /api/dashboard/greeting • /api/accounts/manage
            </code>
          </p>
          <button
            onClick={loadDashboard}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            Retry loading dashboard
          </button>
        </div>
      </div>
    );
  }

  const { greeting, signals, account_stats, suggestions } = data;
  const greetingEmoji = greeting.time_of_day === 'morning' ? '☀️' : greeting.time_of_day === 'afternoon' ? '👋' : '🌙';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {greetingEmoji} Good {greeting.time_of_day}, {greeting.user_name}!
        </h2>
        <p className="text-sm text-gray-600">Let’s prep your next meetings and keep your priority accounts on radar.</p>
      </div>

      <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Start with a company</h3>
            <p className="text-sm text-gray-600 mt-1">Type a company name or paste a website. I’ll stream firmographics, intent signals, decision makers, and next actions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => prefillAndFocus('Research Boeing')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
            >
              Research a company
            </button>
            <button
              onClick={() => prefillAndFocus('Show me accounts with new signals this week')}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100"
            >
              Review signal spikes
            </button>
          </div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 bg-red-500 rounded-full">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-900">
                🔥 {signals.length} hot signal{signals.length > 1 ? 's' : ''} detected
              </h3>
              <p className="text-sm text-red-700">Recent activity on your tracked accounts</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {signals.slice(0, 3).map(signal => (
              <div
                key={signal.id}
                className="bg-white border border-red-200 rounded-xl p-4 hover:border-red-400 transition-colors cursor-pointer"
                onClick={() => prefillAndFocus(`Tell me more about the ${signal.signal_type} at ${signal.company_name}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                        signal.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        signal.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                        signal.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {signal.severity.toUpperCase()}
                      </span>
                      <span className="font-semibold text-gray-900">{signal.company_name}</span>
                    </div>
                    <p className="text-sm text-gray-700">{signal.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{signal.days_ago}d ago</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      prefillAndFocus(`Research ${signal.company_name} and show updated analysis`);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Research
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => prefillAndFocus(`Research ${signals[0].company_name} and provide updated analysis`)}
              className="flex-1 py-2 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Research {signals[0].company_name}
            </button>
            <button
              onClick={() => prefillAndFocus('Show all accounts with recent signals')}
              className="py-2 px-4 bg-white text-red-600 font-medium border-2 border-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              View all signals
            </button>
          </div>
        </div>
      )}

      {account_stats.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Portfolio health
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Tracked" value={account_stats.total} />
            <Stat label="Hot" value={account_stats.hot} highlight="red" />
            <Stat label="With signals" value={account_stats.with_signals} highlight="orange" />
            <Stat label="Needs update" value={account_stats.stale} />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick prompts</h3>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => prefillAndFocus(suggestion)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'orange' }) {
  const color = highlight === 'red'
    ? 'text-red-600'
    : highlight === 'orange'
    ? 'text-orange-600'
    : 'text-gray-900';

  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}
