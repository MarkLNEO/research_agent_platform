import { useEffect, useRef, useState } from 'react';
import { Building2, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { listTrackedAccounts, type TrackedAccount } from '../services/accountService';
import { useToast } from '../components/ToastProvider';

interface AccountListWidgetProps {
  onAccountClick: (account: TrackedAccount) => void;
  onAddAccount: () => void;
}

export function AccountListWidget({ onAccountClick, onAddAccount }: AccountListWidgetProps) {
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm' | 'stale'>('all');
  const [stats, setStats] = useState({
    total: 0,
    hot: 0,
    warm: 0,
    stale: 0,
    with_signals: 0,
  });
  const { addToast } = useToast();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadAccounts();
  }, [filter]);

  // Listen for accounts-updated event from chat
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('[AccountListWidget] Accounts updated event received, reloading...');
      loadAccounts();
    };
    
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const result = await listTrackedAccounts(filter);
      setAccounts(result.accounts);
      setStats(result.stats);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
      setError(err.message);
      // Don't set accounts to empty - keep showing what we had
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'hot': return 'text-red-600 bg-red-50 border-red-200';
      case 'warm': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'hot': return '🔥';
      case 'warm': return '⚡';
      default: return '📄';
    }
  };

  const getSignalCount = (account: TrackedAccount): number => {
    // @ts-ignore - recent_signals added by join
    return account.recent_signals?.filter((s: any) => !s.viewed).length || 0;
  };

  // Notify on newly detected critical signals (once per signal id)
  useEffect(() => {
    try {
      for (const account of accounts || []) {
        // @ts-ignore - recent_signals added by join
        const list = (account.recent_signals || []) as Array<any>;
        for (const s of list) {
          if (s && s.severity === 'critical' && s.viewed === false) {
            const id: string = String(s.id);
            if (!notifiedRef.current.has(id)) {
              notifiedRef.current.add(id);
              addToast({
                title: 'Critical signal detected',
                description: `${account.company_name}: ${s.description}`,
                type: 'error',
                actionText: 'Open',
                onAction: () => onAccountClick(account),
              });
            }
          }
        }
      }
    } catch {
      // no-op for robustness
    }
  }, [accounts, addToast, onAccountClick]);

  if (error && accounts.length === 0) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500 mb-2">Account tracking unavailable</div>
        <button
          onClick={loadAccounts}
          className="text-xs text-blue-600 hover:text-blue-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Tracked Accounts
          </h3>
          <button
            onClick={onAddAccount}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Add account"
          >
            <Plus className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('hot')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'hot'
                ? 'bg-red-100 text-red-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            🔥 {stats.hot}
          </button>
          <button
            onClick={() => setFilter('stale')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'stale'
                ? 'bg-gray-200 text-gray-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Stale {stats.stale}
          </button>
        </div>
      </div>

      {/* Account List */}
      <div className="flex-1 overflow-y-auto">
        {loading && accounts.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-14 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-center">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-2">No accounts tracked yet</p>
            <button
              onClick={onAddAccount}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Add your first account
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {accounts.map(account => {
              const signalCount = getSignalCount(account);
              const isStale = account.last_researched_at
                ? Math.floor((Date.now() - new Date(account.last_researched_at).getTime()) / (1000 * 60 * 60 * 24)) > 14
                : true;

              return (
                <button
                  key={account.id}
                  onClick={() => onAccountClick(account)}
                  className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${
                    getPriorityColor(account.priority)
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getPriorityIcon(account.priority)}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {account.company_name}
                        </span>
                      </div>
                      
                      {account.industry && (
                        <p className="text-xs text-gray-600 truncate">{account.industry}</p>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        {signalCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded">
                            <AlertCircle className="w-3 h-3" />
                            {signalCount}
                          </span>
                        )}
                        
                        {account.signal_score > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            <TrendingUp className="w-3 h-3" />
                            {account.signal_score}
                          </span>
                        )}

                        {isStale && (
                          <span className="text-xs text-gray-500">
                            📅 Update needed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {accounts.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>{stats.total} total</span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {stats.with_signals} with signals
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
