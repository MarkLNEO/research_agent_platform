import { useEffect, useState } from 'react';
import { X, ExternalLink, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { getAccountSignals, markSignalViewed, dismissSignal, type AccountSignal } from '../services/accountService';

interface AccountSignalsDrawerProps {
  open: boolean;
  accountId: string | null;
  companyName?: string;
  onClose: () => void;
  onResearch?: (company: string) => void;
}

export function AccountSignalsDrawer({ open, accountId, companyName, onClose, onResearch }: AccountSignalsDrawerProps) {
  const [signals, setSignals] = useState<AccountSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    const load = async () => {
      try {
        setLoading(true);
        const list = await getAccountSignals(accountId);
        setSignals(list);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load signals');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, accountId]);

  if (!open) return null;

  const severityBadge = (sev: AccountSignal['severity']) => {
    switch (sev) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString() : '');

  const handleViewed = async (id: string) => {
    await markSignalViewed(id);
    setSignals(prev => prev.map(s => s.id === id ? { ...s, viewed: true, viewed_at: new Date().toISOString() } : s));
  };
  const handleDismiss = async (id: string) => {
    await dismissSignal(id);
    setSignals(prev => prev.map(s => s.id === id ? { ...s, dismissed: true, dismissed_at: new Date().toISOString() } : s));
  };

  return (
    <div className="fixed inset-0 z-40 flex" data-testid="signals-drawer">
      <div className="flex-1" onClick={onClose} aria-label="Close signals drawer" />
      <div className="w-full sm:w-[480px] max-w-[80vw] h-full bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Signals for</div>
            <h3 className="text-base font-semibold text-gray-900">{companyName || 'Account'}</h3>
          </div>
          <button className="p-2 rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          {loading && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          )}
          {!loading && !error && signals.length === 0 && (
            <div className="text-sm text-gray-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> No signals found for this account.</div>
          )}
          <div className="space-y-3">
            {signals.map(sig => (
              <div key={sig.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${severityBadge(sig.severity)}`}>{sig.severity.toUpperCase()}</span>
                      <span className="text-xs text-gray-500">{sig.signal_type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400">{fmt(sig.signal_date)}</span>
                    </div>
                    <div className="text-sm text-gray-900 mt-1">{sig.description}</div>
                    {sig.source_url && (
                      <a href={sig.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1">
                        Open source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {!sig.viewed && (
                      <button className="text-xs text-gray-700 hover:text-gray-900 inline-flex items-center gap-1" onClick={() => void handleViewed(sig.id)} aria-label="Mark as viewed">
                        <Eye className="w-3.5 h-3.5"/> Viewed
                      </button>
                    )}
                    {!sig.dismissed && (
                      <button className="text-xs text-gray-700 hover:text-gray-900 inline-flex items-center gap-1" onClick={() => void handleDismiss(sig.id)} aria-label="Dismiss signal">
                        <EyeOff className="w-3.5 h-3.5"/> Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {companyName && onResearch && (
            <div className="mt-4">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-3 py-2" onClick={() => onResearch(companyName)}>
                Research {companyName}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
