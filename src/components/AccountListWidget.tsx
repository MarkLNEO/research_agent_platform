import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, TrendingUp, AlertCircle, Plus, Upload, Flame, Clock, RefreshCw, Maximize2, X } from 'lucide-react';
import { listTrackedAccounts, type TrackedAccount } from '../services/accountService';
import { useToast } from '../components/ToastProvider';
import { BulkAccountUpload } from './BulkAccountUpload';

interface AccountListWidgetProps {
  onAccountClick: (account: TrackedAccount) => void;
  onAddAccount: () => void;
  onResearchAccount?: (account: TrackedAccount) => void;
  onViewSetup?: () => void;
  showFooter?: boolean;
}

export function AccountListWidget({ onAccountClick, onAddAccount, onResearchAccount, onViewSetup, showFooter = true }: AccountListWidgetProps) {
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm' | 'stale'>('all');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    hot: 0,
    warm: 0,
    stale: 0,
    standard: 0,
    with_signals: 0,
  });
  const { addToast } = useToast();
  const notifiedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const debounceTimer = useRef<number | null>(null);
  const loadAccounts = useCallback(async () => {
    try {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(accounts.length === 0); // avoid flicker if we already have data
      const result = await listTrackedAccounts(filter === 'all' ? undefined : filter);
      setAccounts(result.accounts);
      setStats(result.stats);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [filter, accounts.length]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('[AccountListWidget] Accounts updated event received, reloading...');
      // Debounce rapid successive updates to prevent oscillation/flicker
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => { void loadAccounts(); }, 150);
    };

    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, [loadAccounts]);

  useEffect(() => {
    try {
      for (const account of accounts || []) {
        const list = Array.isArray((account as any)?.recent_signals)
          ? ((account as any).recent_signals as Array<any>)
          : [];
        for (const s of list) {
          if (s && s.severity === 'critical' && s.viewed === false) {
            const id = String(s.id);
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
    } catch (err) {
      console.error('Notification error', err);
    }
  }, [accounts, addToast, onAccountClick]);

  const priorityLabel: Record<string, string> = {
    hot: 'Hot',
    warm: 'Warm',
    standard: 'Standard',
  };

  const formatRelativeDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'hot':
        return <Flame className="w-3.5 h-3.5" aria-hidden />;
      case 'warm':
        return <TrendingUp className="w-3.5 h-3.5" aria-hidden />;
      default:
        return <Building2 className="w-3.5 h-3.5" aria-hidden />;
    }
  };

  const formatRelative = (value?: string | null) => value || '—';

  const filterOptions = useMemo(() => ([
    { value: 'all' as const, label: 'All', count: stats.total },
    { value: 'hot' as const, label: 'Hot', count: stats.hot },
    { value: 'warm' as const, label: 'Warm', count: stats.warm },
    { value: 'stale' as const, label: 'Stale', count: stats.stale },
  ]), [stats.total, stats.hot, stats.warm, stats.stale]);

  if (error && accounts.length === 0) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500 mb-2">Account tracking unavailable</div>
        <button
          onClick={() => { void loadAccounts(); }}
          className="text-xs text-blue-600 hover:text-blue-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="account-list-widget">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Tracked Accounts
            </h3>
            {stats.total === 0 ? (
              <>
                <p className="text-xs text-gray-500 mt-1">
                  Monitoring 0 strategic accounts. Track a company to see it here.
                </p>
                <p className="text-xs text-gray-500 mt-2" id="account-priority-helper">
                  Hot accounts triggered recent critical signals, Warm accounts show momentum, and Stale accounts haven’t been refreshed in 14+ days.
                </p>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (typeof onViewSetup === 'function') {
                  onViewSetup();
                } else {
                  try { window.dispatchEvent(new Event('setup-summary:open')); } catch {}
                }
              }}
              className="px-2 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline transition-colors"
            >
              View my setup
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { void loadAccounts(); }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Open tracked accounts"
              >
                <Maximize2 className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setShowBulkUpload(true)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Bulk import accounts from CSV"
              >
                <Upload className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={onAddAccount}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Add account to track"
              >
                <Plus className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Account priority filters"
          aria-describedby={stats.total === 0 ? 'account-priority-helper' : undefined}
        >
          {filterOptions.map(option => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-pressed={filter === option.value}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                filter === option.value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setFilter(option.value)}
            >
              <span>{option.label}</span>
              <span className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/30 border border-white/40">
                {option.count}
              </span>
            </button>
          ))}
        </div>
      </div>

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
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-8 h-8 text-blue-500" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Start Tracking Accounts</h4>
            <p className="text-xs text-gray-600 mb-3 px-2 leading-relaxed">
              Get daily intelligence on key accounts. We'll monitor for buying signals,
              leadership changes, and strategic initiatives automatically.
            </p>
            <button
              onClick={onAddAccount}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Track Your First Account
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {accounts.map(account => {
              const isStale = account.last_researched_at
                ? Math.floor((Date.now() - new Date(account.last_researched_at).getTime()) / (1000 * 60 * 60 * 24)) > 14
                : true;
              const latestResearch = account.research_history?.[0];

              return (
                <button
                  key={account.id}
                  onClick={() => onAccountClick(account)}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-colors"
                  data-testid="account-list-item"
                  data-priority={account.priority}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                          account.priority === 'hot'
                            ? 'bg-red-100 text-red-700'
                            : account.priority === 'warm'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                        >
                          {getPriorityIcon(account.priority)}
                          <span className="uppercase tracking-wide">{priorityLabel[account.priority] ?? account.priority}</span>
                        </span>
                        {(account.unviewed_signal_count || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full animate-pulse">
                            <AlertCircle className="w-3 h-3" />
                            {account.unviewed_signal_count} new
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-semibold text-gray-900 truncate" title={account.company_name}>
                        {account.company_name}
                      </h4>
                      {account.industry && (
                        <p className="text-xs text-gray-600 truncate">{account.industry}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-600">
                        {account.latest_signal_summary && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full border border-red-100">
                            <AlertCircle className="w-3 h-3" />
                            <span>{account.latest_signal_summary}</span>
                            {account.latest_signal_relative && (
                              <span className="text-red-500/80">• {account.latest_signal_relative}</span>
                            )}
                          </span>
                        )}
                        {account.signal_score > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                            <TrendingUp className="w-3 h-3" />
                            Signal score {account.signal_score}
                          </span>
                        )}
                        {isStale && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full border border-gray-200">
                            <Clock className="w-3 h-3" /> Needs refresh
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                        {account.latest_signal_relative && (
                          <div>Latest signal {formatRelative(account.latest_signal_relative)}</div>
                        )}
                        {account.last_researched_relative && (
                          <div>Last research {formatRelative(account.last_researched_relative)}</div>
                        )}
                      </div>

                      {latestResearch && (
                        <div className="mt-3 bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-900">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">Latest research</span>
                            <span className="text-[11px] text-blue-700/80">
                              {formatRelativeDate(latestResearch.created_at)}
                            </span>
                          </div>
                          {latestResearch.executive_summary && (
                            <p className="mt-1 text-blue-900/80 line-clamp-2">
                              {latestResearch.executive_summary}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAccountClick(account);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-full hover:bg-red-100"
                        >
                          Review signals
                        </button>
                        {onResearchAccount && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onResearchAccount(account);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100"
                          >
                            Open research
                          </button>
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

      {showFooter && accounts.length > 0 && (
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

      {showBulkUpload && (
        <BulkAccountUpload
          onClose={() => setShowBulkUpload(false)}
          onSuccess={(count) => {
            setShowBulkUpload(false);
            loadAccounts();
            addToast({
              title: 'Accounts imported',
              description: `Successfully imported ${count} account${count !== 1 ? 's' : ''}`,
              type: 'success',
          });
        }}
      />
      )}

      {showModal && (
        <TrackedAccountsModal
          accounts={accounts}
          stats={stats}
          filter={filter}
          onFilterChange={setFilter}
          onClose={() => setShowModal(false)}
          onAccountClick={onAccountClick}
          onResearchAccount={onResearchAccount}
        />
      )}
    </div>
  );
}

interface TrackedAccountsModalProps {
  accounts: TrackedAccount[];
  stats: { total: number; hot: number; warm: number; stale: number; with_signals: number; standard: number };
  filter: 'all' | 'hot' | 'warm' | 'stale';
  onFilterChange: (value: 'all' | 'hot' | 'warm' | 'stale') => void;
  onClose: () => void;
  onAccountClick: (account: TrackedAccount) => void;
  onResearchAccount?: (account: TrackedAccount) => void;
}

function TrackedAccountsModal({
  accounts,
  stats,
  filter,
  onFilterChange,
  onClose,
  onAccountClick,
  onResearchAccount,
}: TrackedAccountsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-6 py-10">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Tracked accounts</h3>
            <p className="text-xs text-gray-600 mt-1">{stats.total} total • {stats.with_signals} with signals</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-white" aria-label="Close tracked accounts">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Tracked account filters"
          >
            {[
              { value: 'all' as const, label: `All (${stats.total})` },
              { value: 'hot' as const, label: `Hot (${stats.hot})` },
              { value: 'warm' as const, label: `Warm (${stats.warm})` },
              { value: 'stale' as const, label: `Stale (${stats.stale})` },
            ].map(option => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-pressed={filter === option.value}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  filter === option.value
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => onFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {accounts.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-600">No tracked accounts match this filter.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map(account => {
                const isStale = account.last_researched_at
                  ? Math.floor((Date.now() - new Date(account.last_researched_at).getTime()) / (1000 * 60 * 60 * 24)) > 14
                  : true;
                return (
                  <div key={`modal-${account.id}`} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                            account.priority === 'hot'
                              ? 'bg-red-100 text-red-700'
                              : account.priority === 'warm'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {account.priority.toUpperCase()}
                          </span>
                          {(account.unviewed_signal_count || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              {account.unviewed_signal_count} new
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900" title={account.company_name}>{account.company_name}</h4>
                        {account.industry && <p className="text-xs text-gray-600">{account.industry}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          {account.latest_signal_summary && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full border border-red-100">
                              <AlertCircle className="w-3 h-3" />
                              {account.latest_signal_summary}
                            </span>
                          )}
                          {isStale && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full border border-gray-200">
                              <Clock className="w-3 h-3" /> Needs refresh
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                          {account.latest_signal_relative && (
                            <span>Latest signal {account.latest_signal_relative}</span>
                          )}
                          {account.last_researched_relative && (
                            <span>• Last research {account.last_researched_relative}</span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { onAccountClick(account); onClose(); }}
                            className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-full hover:bg-red-100"
                          >
                            Review signals
                          </button>
                          {onResearchAccount && (
                            <button
                              type="button"
                              onClick={() => { onResearchAccount(account); onClose(); }}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100"
                            >
                              Open research
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
