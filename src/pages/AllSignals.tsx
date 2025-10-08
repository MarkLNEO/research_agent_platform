import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { AlertCircle, Flame, Zap, RefreshCw, Settings2 } from 'lucide-react';

interface Row {
  id: string;
  account_id: string;
  signal_type: string;
  severity: 'critical'|'high'|'medium'|'low';
  description: string;
  signal_date: string;
  source_url?: string;
  score: number;
}

export function AllSignals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!);
      const query = supabase
        .from('account_signals')
        .select('*')
        .eq('user_id', user!.id)
        .order('signal_date', { ascending: false })
        .limit(200);
      const { data, error: loadError } = await query;
      if (loadError) throw loadError;
      setRows((data ?? []) as Row[]);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) void load();
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = rows.length;
    const bySeverity = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.severity] = (acc[row.severity] || 0) + 1;
      return acc;
    }, {});
    return {
      total,
      critical: bySeverity['critical'] || 0,
      high: bySeverity['high'] || 0,
      medium: bySeverity['medium'] || 0,
      low: bySeverity['low'] || 0,
    };
  }, [rows]);

  const filtered = rows.filter(r => severity === 'all' ? true : r.severity === severity);
  const goToSignalSettings = () => {
    try {
      navigate('/settings/signals');
    } catch (err) {
      console.error('Failed to navigate to signal settings', err);
    }
  };

  const renderSeverityPill = (label: string, count: number, variant: 'critical' | 'high' | 'medium' | 'low') => {
    const classes: Record<typeof variant, string> = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      low: 'bg-gray-100 text-gray-700 border-gray-200',
    } as const;
    const icon = variant === 'critical' ? <Flame className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${classes[variant]}`}>
        {icon}
        {label}
        <span className="font-semibold">{count}</span>
      </span>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" data-testid="all-signals">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Signals Inbox</h1>
            <p className="text-sm text-gray-600 flex items-center gap-2" role="status" aria-live="polite">
              {lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}` : 'Fetching latest intelligence…'}
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-100"
              >
                ← Home
              </button>
              <button
                type="button"
                onClick={goToSignalSettings}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Signal preferences
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderSeverityPill('Critical', stats.critical, 'critical')}
            {renderSeverityPill('High', stats.high, 'high')}
            {renderSeverityPill('Medium', stats.medium, 'medium')}
            {renderSeverityPill('Low', stats.low, 'low')}
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              aria-label="Filter by severity"
            >
              <option value="all">All severities ({stats.total})</option>
              <option value="critical">Critical only ({stats.critical})</option>
              <option value="high">High ({stats.high})</option>
              <option value="medium">Medium ({stats.medium})</option>
              <option value="low">Low ({stats.low})</option>
            </select>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-red-800">Unable to load signals</h2>
              <p className="text-sm text-red-700 mb-2">{error}</p>
              <button
                onClick={() => void load()}
                className="text-sm text-red-700 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/3 mb-3"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded w-full"></div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-sm text-gray-600">
            <Zap className="w-8 h-8 mx-auto text-gray-400 mb-3" />
            <p>No signals match this filter yet.</p>
            <p className="mt-2">Try broadening the severity filter or set up new signal preferences so I know what to watch for.</p>
            <button
              onClick={goToSignalSettings}
              className="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <Settings2 className="w-4 h-4" /> Configure signals
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3" aria-live="polite">
            {filtered.map(signal => {
              const severityClass = signal.severity === 'critical'
                ? 'bg-red-100 text-red-700 border-red-200'
                : signal.severity === 'high'
                  ? 'bg-orange-100 text-orange-700 border-orange-200'
                  : signal.severity === 'medium'
                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    : 'bg-gray-100 text-gray-700 border-gray-200';
              return (
                <article key={signal.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <time dateTime={signal.signal_date}>
                        {new Date(signal.signal_date).toLocaleString()}
                      </time>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${severityClass}`}>
                        {signal.severity.toUpperCase()}
                      </span>
                    </div>
                    {signal.source_url && (
                      <a
                        href={signal.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        View source →
                      </a>
                    )}
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900 capitalize">
                    {signal.signal_type.replace(/_/g, ' ')}
                  </h2>
                  <p className="text-sm text-gray-700 mt-1">{signal.description}</p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
