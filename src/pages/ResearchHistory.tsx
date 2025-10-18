import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { Building2, RefreshCw, Clock, Sparkles, Layers } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { ResearchOutput } from '../components/ResearchOutput';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastProvider';
import { listTrackedAccounts, type TrackedAccount, type AccountStats, type ResearchSnapshot } from '../services/accountService';

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

const RELATIVE_DAY_MS = 1000 * 60 * 60 * 24;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'research-report';

const toCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
};

const formatRelativeDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / RELATIVE_DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatFullDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const appendResearchToPdf = (doc: jsPDF, research: ResearchSnapshot) => {
  const margin = 48;
  let cursor = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(research.subject || 'Research Report', margin, cursor);
  cursor += 28;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`Type: ${research.research_type || 'company'}`, margin, cursor);
  cursor += 18;

  if (research.priority_level) {
    doc.text(`Priority: ${research.priority_level}`, margin, cursor);
    cursor += 18;
  }

  if (research.confidence_level) {
    doc.text(`Confidence: ${research.confidence_level}`, margin, cursor);
    cursor += 18;
  }

  const scoreParts: string[] = [];
  if (typeof research.icp_fit_score === 'number') scoreParts.push(`ICP: ${research.icp_fit_score}`);
  if (typeof research.signal_score === 'number') scoreParts.push(`Signal: ${research.signal_score}`);
  if (typeof research.composite_score === 'number') scoreParts.push(`Composite: ${research.composite_score}`);
  if (scoreParts.length) {
    doc.text(scoreParts.join(' • '), margin, cursor);
    cursor += 18;
  }

  if (research.executive_summary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Executive Summary', margin, cursor);
    cursor += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const summaryLines = doc.splitTextToSize(research.executive_summary, 520);
    doc.text(summaryLines, margin, cursor);
    cursor += summaryLines.length * 14 + 20;
  }

  const report = research.markdown_report || '';
  if (report) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Full Report', margin, cursor);
    cursor += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const cleanedReport = report.replace(/[#*_`>-]/g, '');
    const reportLines = doc.splitTextToSize(cleanedReport, 520);
    doc.text(reportLines, margin, cursor);
    cursor += reportLines.length * 14 + 20;
  }

  if (Array.isArray(research.sources) && research.sources.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Sources', margin, cursor);
    cursor += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    research.sources.forEach((source: any) => {
      const label =
        typeof source === 'string'
          ? source
          : `${source.url || ''}${source.query ? ` (${source.query})` : ''}`;
      const lines = doc.splitTextToSize(label, 520);
      doc.text(lines, margin, cursor);
      cursor += lines.length * 12;
    });
  }
};

const flattenResearchForCsv = (research: ResearchSnapshot) => {
  const sources = Array.isArray(research.sources)
    ? research.sources
        .map((source: any) =>
          typeof source === 'string'
            ? source
            : `${source.url || ''}${source.query ? ` (${source.query})` : ''}`
        )
        .join(' | ')
    : '';

  return {
    Subject: research.subject,
    'Research Type': research.research_type,
    Priority: research.priority_level || '',
    Confidence: research.confidence_level || '',
    'ICP Fit Score': research.icp_fit_score ?? '',
    'Signal Score': research.signal_score ?? '',
    'Composite Score': research.composite_score ?? '',
    'Executive Summary': research.executive_summary || '',
    'Markdown Report': research.markdown_report || '',
    'Company Data': research.company_data ? JSON.stringify(research.company_data) : '',
    'Buying Signals': research.buying_signals ? JSON.stringify(research.buying_signals) : '',
    'Custom Criteria': research.custom_criteria_assessment ? JSON.stringify(research.custom_criteria_assessment) : '',
    'Personalization Points': research.personalization_points ? JSON.stringify(research.personalization_points) : '',
    'Recommended Actions': research.recommended_actions ? JSON.stringify(research.recommended_actions) : '',
    Sources: sources,
  } as Record<string, unknown>;
};

export function ResearchHistory() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [untrackedResearch, setUntrackedResearch] = useState<ResearchSnapshot[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tracked' | 'recent'>('tracked');
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);

  const loadAccounts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await listTrackedAccounts('all');
      setAccounts(result.accounts);
      setStats(result.stats);
      // Safety filter: exclude junk/low-fit if backend misses any
      const cleaned = (result.untrackedResearch || []).filter(r => {
        try {
          const subject = String(r.subject || '').trim();
          if (!subject || subject.length < 2) return false;
          if (typeof r.icp_fit_score === 'number' && r.icp_fit_score < 30) return false;
        } catch {}
        return true;
      });
      setUntrackedResearch(cleaned);
      setSelectedAccountId(prev => {
        if (prev && result.accounts.some(acc => acc.id === prev)) {
          return prev;
        }
        return result.accounts[0]?.id ?? null;
      });
    } catch (err: any) {
      console.error('Failed to load tracked accounts', err);
      addToast({
        type: 'error',
        title: 'Could not load accounts',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  const loadChats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chats')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (data) setChats(data);
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadAccounts();
      void loadChats();
    }
  }, [user, loadAccounts, loadChats]);

  useEffect(() => {
    const handler = () => { void loadAccounts(); };
    window.addEventListener('accounts-updated', handler);
    return () => window.removeEventListener('accounts-updated', handler);
  }, [loadAccounts]);

  const selectedAccount = useMemo(
    () => accounts.find(acc => acc.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  useEffect(() => {
    if (!selectedAccount?.research_history?.length) {
      setSelectedResearchId(null);
      return;
    }
    if (selectedResearchId && selectedAccount.research_history.some(r => r.id === selectedResearchId)) {
      return;
    }
    setSelectedResearchId(selectedAccount.research_history[0].id);
  }, [selectedAccount, selectedResearchId]);

  const selectedResearch = useMemo(() => {
    if (!selectedAccount?.research_history?.length) return null;
    if (!selectedResearchId) return selectedAccount.research_history[0];
    return selectedAccount.research_history.find(r => r.id === selectedResearchId) ?? selectedAccount.research_history[0];
  }, [selectedAccount, selectedResearchId]);

  const handleExportPdf = useCallback((research: ResearchSnapshot) => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    appendResearchToPdf(doc, research);
    doc.save(`${slugify(research.subject || 'research-report')}.pdf`);
  }, []);

  const handleExportCsv = useCallback((research: ResearchSnapshot) => {
    const flat = flattenResearchForCsv(research);
    const csvContent = Object.entries(flat)
      .map(([key, value]) => `${toCsvValue(key)},${toCsvValue(value)}`)
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(research.subject || 'research-report')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const openResearchInChat = useCallback((subject: string) => {
    if (!subject) return;
    navigate('/');
    setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('chat:prefill', { detail: { prompt: `Research ${subject}` } }));
      } catch {
        // no-op
      }
    }, 0);
  }, [navigate]);

  const getUserInitial = () => (user?.email ? user.email[0].toUpperCase() : 'Y');

  const handleSidebarAccountClick = (account: TrackedAccount) => {
    setActiveTab('tracked');
    setSelectedAccountId(account.id);
  };

  const handleSidebarAddAccount = () => {
    navigate('/');
    setTimeout(() => {
      window.dispatchEvent(new Event('show-tracked-accounts'));
    }, 0);
  };

  const statsSummary = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Tracked', value: stats.total },
      { label: 'Hot', value: stats.hot },
      { label: 'Needs update', value: stats.stale },
      { label: 'Signals', value: stats.with_signals },
    ];
  }, [stats]);

  return (
    <div className="flex h-screen bg-gray-50" data-testid="research-history">
      <Sidebar
        onNewChat={() => navigate('/')}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={null}
        onChatSelect={(chatId) => {
          navigate('/');
          setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent('chat:open', { detail: { chatId } })); } catch {}
          }, 0);
        }}
        onCompanyProfile={() => navigate('/profile-coach')}
        onSettings={() => navigate('/settings')}
        onHome={() => navigate('/')}
        onResearchHistory={() => undefined}
        onAccountClick={handleSidebarAccountClick}
        onAddAccount={handleSidebarAddAccount}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-gray-200 bg-white px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tracked Accounts</h1>
              <p className="mt-1 text-sm text-gray-600">
                Every account you monitor keeps its research timeline here. Pick an account to review the latest report or step through prior updates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void loadAccounts(); }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          {statsSummary.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {statsSummary.map(item => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 inline-flex rounded-full border border-blue-200 bg-blue-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('tracked')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'tracked' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-600'
              }`}
            >
              Timeline by account
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recent')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'recent' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-600'
              }`}
            >
              Recent untracked research
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'tracked' ? (
            accounts.length === 0 && !loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">No tracked accounts yet</h2>
                  <p className="text-sm text-gray-600">
                    Track an account from the action bar after a research run and the full history will collect here automatically.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex w-full overflow-hidden">
                <aside className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
                  {loading && accounts.length === 0 ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {accounts.map(account => {
                        const isActive = account.id === selectedAccountId;
                        const latest = account.research_history?.[0];
                        return (
                          <button
                            key={account.id}
                            onClick={() => setSelectedAccountId(account.id)}
                            className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                              isActive
                                ? 'border-blue-400 bg-blue-50 shadow-sm'
                                : 'border-gray-200 bg-white hover:border-blue-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900 truncate">{account.company_name}</span>
                              {latest && (
                                <span className="text-[11px] font-medium text-blue-700">
                                  {formatRelativeDate(latest.created_at)}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                                {account.priority === 'hot' ? '🔥 Hot' : account.priority === 'warm' ? '⚡ Warm' : '📍 Standard'}
                              </span>
                              <span>Research runs: {account.research_history?.length ?? 0}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </aside>

                <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                  {selectedAccount && selectedResearch ? (
                    <>
                      <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
                            <Layers className="w-4 h-4" />
                            {selectedAccount.company_name}
                          </span>
                          <span className="text-xs text-gray-500">Tracked since {formatFullDate(selectedAccount.added_at)}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                          {typeof selectedAccount.icp_fit_score === 'number' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                              ICP Fit {selectedAccount.icp_fit_score}
                            </span>
                          )}
                          {typeof selectedAccount.signal_score === 'number' && selectedAccount.signal_score > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                              Signal score {selectedAccount.signal_score}
                            </span>
                          )}
                          {selectedAccount.last_researched_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                              Last researched {formatRelativeDate(selectedAccount.last_researched_at)}
                            </span>
                          )}
                        </div>
                      </section>

                      <ResearchOutput
                        research={selectedResearch}
                        onExportPDF={() => handleExportPdf(selectedResearch)}
                        onExportCSV={() => handleExportCsv(selectedResearch)}
                      />

                      {selectedAccount.research_history && selectedAccount.research_history.length > 1 && (
                        <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Research timeline</h3>
                            <span className="text-xs text-gray-500">{selectedAccount.research_history.length} reports saved</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {selectedAccount.research_history.map(entry => {
                              const isCurrent = entry.id === selectedResearchId;
                              return (
                                <button
                                  key={entry.id}
                                  onClick={() => setSelectedResearchId(entry.id)}
                                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                                    isCurrent
                                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                                      : 'border-gray-200 bg-gray-50 hover:border-blue-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-xs text-gray-600">
                                    <span>{formatFullDate(entry.created_at)}</span>
                                    {isCurrent && <span className="font-semibold text-blue-600">Viewing</span>}
                                  </div>
                                  {entry.executive_summary && (
                                    <p className="mt-1 text-sm text-gray-700 line-clamp-2">{entry.executive_summary}</p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center text-sm text-gray-600">
                        Select an account to review its research history.
                      </div>
                    </div>
                  )}
                </main>
              </div>
            )
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {untrackedResearch.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center max-w-sm">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-1">No untracked research yet</h2>
                    <p className="text-sm text-gray-600">
                      When you run research without tracking the account, the most recent reports will appear here so nothing gets lost.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-5xl space-y-4">
                  {untrackedResearch.map(research => (
                    <div key={research.id} className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{research.subject}</h3>
                          <div className="text-xs text-gray-500">
                            Saved {formatRelativeDate(research.created_at)} • {research.research_type}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openResearchInChat(research.subject)}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Research again
                        </button>
                      </div>
                      {research.executive_summary && (
                        <p className="mt-3 text-sm text-gray-700">{research.executive_summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
