import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { ResearchOutput } from '../components/ResearchOutput';
import {
  Search,
  TrendingUp,
  Clock,
  Target,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ResearchItem {
  id: string;
  subject: string;
  research_type: string;
  icp_fit_score?: number;
  signal_score?: number;
  composite_score?: number;
  priority_level?: 'hot' | 'warm' | 'standard';
  executive_summary?: string;
  company_data?: any;
  leadership_team?: any[];
  buying_signals?: any[];
  custom_criteria_assessment?: any[];
  personalization_points?: any[];
  recommended_actions?: any;
  confidence_level?: 'high' | 'medium' | 'low';
  markdown_report?: string;
  sources?: any;
  created_at: string;
}

export function ResearchHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [research, setResearch] = useState<ResearchItem[]>([]);
  const [filteredResearch, setFilteredResearch] = useState<ResearchItem[]>([]);
  const [selectedResearch, setSelectedResearch] = useState<ResearchItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'score'>('recent');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pageSize = 10;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [research, searchQuery, filterType, filterPriority, sortBy]);

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => filteredResearch.some(item => item.id === id)));

    const totalPages = Math.max(1, Math.ceil(filteredResearch.length / pageSize));
    setCurrentPage(prev => Math.min(prev, totalPages));
  }, [filteredResearch, pageSize]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);

    const [chatsResult, researchResult] = await Promise.all([
      supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('research_outputs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
    ]);

    if (chatsResult.data) {
      setChats(chatsResult.data);
    }

    if (researchResult.data) {
      setResearch(researchResult.data);
    }

    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...research];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.subject.toLowerCase().includes(query) ||
        item.executive_summary?.toLowerCase().includes(query)
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.research_type === filterType);
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(item => item.priority_level === filterPriority);
    }

    if (sortBy === 'score') {
      filtered.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
    } else {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredResearch(filtered);
    setCurrentPage(1);
  };

  const getUserInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'Y';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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

  const appendResearchToPdf = (doc: jsPDF, researchItem: ResearchItem, isFirstPage: boolean) => {
    if (!isFirstPage) {
      doc.addPage();
    }

    const margin = 48;
    let cursor = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(researchItem.subject, margin, cursor);
    cursor += 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(`Type: ${researchItem.research_type}`, margin, cursor);
    cursor += 18;

    if (researchItem.priority_level) {
      doc.text(`Priority: ${researchItem.priority_level}`, margin, cursor);
      cursor += 18;
    }

    if (researchItem.confidence_level) {
      doc.text(`Confidence: ${researchItem.confidence_level}`, margin, cursor);
      cursor += 18;
    }

    if (
      researchItem.icp_fit_score !== undefined ||
      researchItem.signal_score !== undefined ||
      researchItem.composite_score !== undefined
    ) {
      const scoreLine = [
        researchItem.icp_fit_score !== undefined ? `ICP: ${researchItem.icp_fit_score}` : null,
        researchItem.signal_score !== undefined ? `Signal: ${researchItem.signal_score}` : null,
        researchItem.composite_score !== undefined ? `Composite: ${researchItem.composite_score}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      if (scoreLine) {
        doc.text(scoreLine, margin, cursor);
        cursor += 18;
      }
    }

    if (researchItem.executive_summary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Executive Summary', margin, cursor);
      cursor += 20;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const summaryLines = doc.splitTextToSize(researchItem.executive_summary, 540);
      doc.text(summaryLines, margin, cursor);
      cursor += summaryLines.length * 14 + 20;
    }

    const report = researchItem.markdown_report || '';
    if (report) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Full Report', margin, cursor);
      cursor += 20;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const cleanedReport = report.replace(/[#*_`>-]/g, '');
      const reportLines = doc.splitTextToSize(cleanedReport, 540);
      doc.text(reportLines, margin, cursor);
      cursor += reportLines.length * 14 + 20;
    }

    if (Array.isArray(researchItem.sources) && researchItem.sources.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Sources', margin, cursor);
      cursor += 20;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      researchItem.sources.forEach((source: any) => {
        const label =
          typeof source === 'string'
            ? source
            : `${source.url}${source.query ? ` (${source.query})` : ''}`;
        const lines = doc.splitTextToSize(label, 540);
        doc.text(lines, margin, cursor);
        cursor += lines.length * 12;
      });
    }
  };

  const flattenResearchForCsv = (researchItem: ResearchItem) => {
    const sources = Array.isArray(researchItem.sources)
      ? researchItem.sources
          .map((source: any) =>
            typeof source === 'string'
              ? source
              : `${source.url}${source.query ? ` (${source.query})` : ''}`
          )
          .join(' | ')
      : '';

    return {
      Subject: researchItem.subject,
      'Research Type': researchItem.research_type,
      Priority: researchItem.priority_level || '',
      Confidence: researchItem.confidence_level || '',
      'ICP Fit Score': researchItem.icp_fit_score ?? '',
      'Signal Score': researchItem.signal_score ?? '',
      'Composite Score': researchItem.composite_score ?? '',
      'Executive Summary': researchItem.executive_summary || '',
      'Markdown Report': researchItem.markdown_report || '',
      'Company Data': researchItem.company_data ? JSON.stringify(researchItem.company_data) : '',
      'Buying Signals': researchItem.buying_signals ? JSON.stringify(researchItem.buying_signals) : '',
      'Custom Criteria': researchItem.custom_criteria_assessment
        ? JSON.stringify(researchItem.custom_criteria_assessment)
        : '',
      'Recommended Actions': researchItem.recommended_actions
        ? JSON.stringify(researchItem.recommended_actions)
        : '',
      Sources: sources,
    } as Record<string, unknown>;
  };

  const handleExportPDF = (researchItem: ResearchItem) => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    appendResearchToPdf(doc, researchItem, true);
    doc.save(`${slugify(researchItem.subject)}.pdf`);
  };

  const handleExportCSV = (researchItem: ResearchItem) => {
    const flat = flattenResearchForCsv(researchItem);
    const csvContent = Object.entries(flat)
      .map(([key, value]) => `${toCsvValue(key)},${toCsvValue(value)}`)
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(researchItem.subject)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedItems = useMemo(
    () => filteredResearch.filter(item => selectedIds.includes(item.id)),
    [filteredResearch, selectedIds]
  );

  const selectedCount = selectedItems.length;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredResearch.length / pageSize)),
    [filteredResearch.length, pageSize]
  );

  const paginatedResearch = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResearch.slice(start, start + pageSize);
  }, [filteredResearch, currentPage, pageSize]);

  const pageIds = useMemo(() => paginatedResearch.map(item => item.id), [paginatedResearch]);
  const isPageFullySelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));

  const pageRangeStart = filteredResearch.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageRangeEnd = Math.min(currentPage * pageSize, filteredResearch.length);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const handleSelectAllOnPage = () => {
    setSelectedIds(prev => {
      if (isPageFullySelected) {
        const pageIdSet = new Set(pageIds);
        return prev.filter(id => !pageIdSet.has(id));
      }

      const next = [...prev];
      pageIds.forEach(id => {
        if (!next.includes(id)) {
          next.push(id);
        }
      });
      return next;
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const handleBulkExportPDF = () => {
    if (selectedItems.length === 0) return;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    selectedItems.forEach((item, index) => appendResearchToPdf(doc, item, index === 0));
    doc.save(`research-bundle-${selectedItems.length}.pdf`);
  };

  const handleBulkExportCSV = () => {
    if (selectedItems.length === 0) return;
    const headerOrder = Object.keys(flattenResearchForCsv(selectedItems[0]));
    const rows = selectedItems.map(item => {
      const flat = flattenResearchForCsv(item) as Record<string, unknown>;
      return headerOrder.map(key => toCsvValue(flat[key])).join(',');
    });

    const csvContent = [
      headerOrder.map(key => toCsvValue(key)).join(','),
      ...rows,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `research-bundle.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const goToPage = (page: number) => {
    const target = Math.min(totalPages, Math.max(1, page));
    setCurrentPage(target);
  };

  const getPriorityColor = (level?: string) => {
    switch (level) {
      case 'hot': return 'text-red-600 bg-red-50 border-red-200';
      case 'warm': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50" data-testid="research-history">
      <Sidebar
        onNewChat={() => navigate('/')}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={null}
        onChatSelect={() => navigate('/')}
        onCompanyProfile={() => navigate('/profile-coach')}
        onSettings={() => navigate('/settings')}
        onHome={() => navigate('/')}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Research History</h1>
          <p className="text-sm text-gray-600 mb-4">
            This list shows the reports you save from the Company Researcher. Use the “Save to Research” button after a run and it will appear here for later reference or export.
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="history-search" className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Search all research
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="history-search"
                  type="text"
                  placeholder="Search by company, topic, or keyword"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="research-history-search"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs" aria-label="Filters and sorting controls">
              <div className="flex items-center gap-1">
                <span className="text-gray-500 uppercase tracking-wide">Type</span>
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'company', label: 'Company' },
                    { value: 'prospect', label: 'Prospect' },
                    { value: 'competitive', label: 'Competitive' },
                    { value: 'market', label: 'Market' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`px-2.5 py-1 rounded-full border ${filterType === option.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                      onClick={() => setFilterType(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-gray-500 uppercase tracking-wide">Priority</span>
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'hot', label: '🔥 Hot' },
                    { value: 'warm', label: '⚡ Warm' },
                    { value: 'standard', label: '📍 Standard' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`px-2.5 py-1 rounded-full border ${filterPriority === option.value ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                      onClick={() => setFilterPriority(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-auto">
                <span className="text-gray-500 uppercase tracking-wide">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recent' | 'score')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
                >
                  <option value="recent">Most recent</option>
                  <option value="score">Highest score</option>
                </select>
              </div>
            </div>
          </div>

          {selectedCount > 0 && !selectedResearch && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium text-blue-900">
                {selectedCount} report{selectedCount === 1 ? '' : 's'} selected
              </div>
              <button
                type="button"
                onClick={handleBulkExportPDF}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-800 hover:text-blue-900"
              >
                <FileDown className="w-4 h-4" />
                Export PDFs
              </button>
              <button
                type="button"
                onClick={handleBulkExportCSV}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-800 hover:text-blue-900"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export CSV bundle
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="ml-auto text-sm text-blue-700 hover:text-blue-900"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          ) : filteredResearch.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Target className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Research Found</h3>
              <p className="text-gray-600 mb-6">
                {searchQuery || filterType !== 'all' || filterPriority !== 'all'
                  ? 'Try adjusting your filters or search query.'
                  : 'Run company research and use “Save to Research” to keep the report here for future reference.'}
              </p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start Research
              </button>
            </div>
          ) : selectedResearch ? (
            <div className="max-w-5xl mx-auto px-6 py-8">
              <button
                onClick={() => setSelectedResearch(null)}
                className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
              >
                ← Back to list
              </button>
              <ResearchOutput
                research={selectedResearch}
                onExportPDF={() => handleExportPDF(selectedResearch)}
                onExportCSV={() => handleExportCSV(selectedResearch)}
              />
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-6 py-8">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">
                  Showing {pageRangeStart}-{pageRangeEnd} of {filteredResearch.length} reports
                </div>
                {filteredResearch.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllOnPage}
                    className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    {isPageFullySelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {isPageFullySelected ? 'Deselect page' : 'Select page'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {paginatedResearch.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedResearch(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedResearch(item);
                        }
                      }}
                      className={`bg-white border rounded-xl p-5 transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isSelected
                          ? 'border-blue-400 ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                      }`}
                      data-testid="research-history-card"
                      data-subject={item.subject}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelection(item.id);
                            }}
                            aria-pressed={isSelected}
                            aria-label={isSelected ? 'Remove from bulk selection' : 'Add to bulk selection'}
                            className="mt-1 text-gray-500 hover:text-blue-600 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">{item.subject}</h3>
                            <p className="text-sm text-gray-600 line-clamp-2">{item.executive_summary}</p>
                          </div>
                        </div>
                        {item.priority_level && (
                          <span className={`ml-4 px-3 py-1 rounded-full text-xs font-semibold border flex-shrink-0 ${getPriorityColor(item.priority_level)}`}>
                            {item.priority_level === 'hot'
                              ? '🔥 HOT'
                              : item.priority_level === 'warm'
                                ? '⚡ WARM'
                                : '📍 STANDARD'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDate(item.created_at)}
                        </div>
                        {item.composite_score !== undefined && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" />
                            Score: {item.composite_score}/100
                          </div>
                        )}
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs capitalize">
                          {item.research_type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <div className="text-sm text-gray-600">Page {currentPage} of {totalPages}</div>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
