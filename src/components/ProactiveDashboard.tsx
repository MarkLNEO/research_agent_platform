import { useEffect, useState } from 'react';
import { AlertCircle, Activity } from 'lucide-react';
import { fetchDashboardGreeting, type DashboardGreeting } from '../services/accountService';

interface ProactiveDashboardProps {
  onSendMessage: (message: string) => void;
}

export function ProactiveDashboard({ onSendMessage }: ProactiveDashboardProps) {
  const [data, setData] = useState<DashboardGreeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
        <div className="h-16 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error || !data) {
    // Show a friendly empty state instead of error when backend not deployed
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            👋 Welcome to Research Agent
          </h2>
          <p className="text-gray-600">
            I can help you research companies, find prospects, analyze competitors, and discover market intelligence.
          </p>
        </div>

        {error?.includes('Function not found') && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-base font-semibold text-blue-900 mb-2">
              🚀 Backend Setup Required
            </h3>
            <p className="text-sm text-blue-800 mb-3">
              The account tracking features require deploying edge functions. Run:
            </p>
            <code className="block bg-blue-100 text-blue-900 p-3 rounded text-sm">
              supabase functions deploy dashboard-greeting<br/>
              supabase functions deploy manage-accounts<br/>
              supabase functions deploy detect-signals
            </code>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Try asking me:</h3>
          <div className="space-y-2">
            <button
              onClick={() => onSendMessage('Research Boeing')}
              className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                "Research Boeing"
              </span>
            </button>
            <button
              onClick={() => onSendMessage('Find the new VP of Security at Raytheon')}
              className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                "Find the new VP of Security at Raytheon"
              </span>
            </button>
            <button
              onClick={() => onSendMessage('What are the latest trends in AI software?')}
              className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                "What are the latest trends in AI software?"
              </span>
            </button>
          </div>
        </div>

        {error && !error.includes('Function not found') && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 text-sm">Failed to load dashboard: {error}</p>
            <button
              onClick={loadDashboard}
              className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  const { greeting, signals, account_stats, suggestions } = data;

  // Determine greeting emoji
  const greetingEmoji = greeting.time_of_day === 'morning' ? '☀️' : 
                       greeting.time_of_day === 'afternoon' ? '👋' : '🌙';

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {greetingEmoji} Good {greeting.time_of_day}, {greeting.user_name}!
        </h2>
      </div>

      {/* Signal Alerts - Most Prominent */}
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
                onClick={() => onSendMessage(`Tell me more about the ${signal.signal_type} at ${signal.company_name}`)}
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
                      onSendMessage(`Research ${signal.company_name} and show updated analysis`);
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
              onClick={() => onSendMessage(`Research ${signals[0].company_name} and provide updated analysis`)}
              className="flex-1 py-2 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Research {signals[0].company_name}
            </button>
            <button
              onClick={() => onSendMessage('Show all accounts with recent signals')}
              className="py-2 px-4 bg-white text-red-600 font-medium border-2 border-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              View All Signals
            </button>
          </div>
        </div>
      )}

      {/* Account Summary */}
      {account_stats.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Your Account Portfolio
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{account_stats.total}</div>
              <div className="text-xs text-gray-600">Tracked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{account_stats.hot}</div>
              <div className="text-xs text-gray-600">🔥 Hot</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{account_stats.with_signals}</div>
              <div className="text-xs text-gray-600">With Signals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{account_stats.stale}</div>
              <div className="text-xs text-gray-600">Need Update</div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Suggestions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {account_stats.total > 0 ? 'Or ask me:' : 'Try asking me:'}
        </h3>
        <div className="space-y-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(suggestion)}
              className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                "{suggestion}"
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* No Accounts CTA */}
      {account_stats.total === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-blue-900 mb-2">
            💡 Track strategic accounts
          </h3>
          <p className="text-sm text-blue-800 mb-3">
            Monitor your key accounts continuously and get alerted when important events happen.
          </p>
          <button
            onClick={() => onSendMessage('How do I add accounts to track?')}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
          >
            Learn how to add accounts →
          </button>
        </div>
      )}
    </div>
  );
}
