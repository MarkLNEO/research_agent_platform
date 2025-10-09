import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import { Streamdown } from 'streamdown';
import type { ResearchDraft, ResearchSource } from '../utils/researchOutput';
import { normalizeSourceEvents } from '../utils/researchOutput';

interface SaveResearchDialogProps {
  open: boolean;
  initialDraft: ResearchDraft | null;
  onClose: () => void;
  onSave: (draft: ResearchDraft) => void | Promise<void>;
  saving: boolean;
  usage?: { tokens: number; credits: number };
  error?: string | null;
  activeSubject?: string | null;
}

const RESEARCH_TYPES: ResearchDraft['research_type'][] = ['company', 'prospect', 'competitive', 'market'];
const PRIORITIES: Exclude<ResearchDraft['priority_level'], undefined>[] = ['hot', 'warm', 'standard'];
const CONFIDENCE_LEVELS: Exclude<ResearchDraft['confidence_level'], undefined>[] = ['high', 'medium', 'low'];

export function SaveResearchDialog({
  open,
  initialDraft,
  onClose,
  onSave,
  saving,
  usage,
  error,
  activeSubject,
}: SaveResearchDialogProps) {
  const [draft, setDraft] = useState<ResearchDraft | null>(initialDraft);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<number, string>>({});
  const [formTouched, setFormTouched] = useState(false);
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [subjectChoice, setSubjectChoice] = useState<'draft' | 'active' | 'custom'>('draft');
  const [customSubject, setCustomSubject] = useState('');

  useEffect(() => {
    if (open && initialDraft) {
      // Clone to prevent accidental mutation of parent state
      setDraft(JSON.parse(JSON.stringify(initialDraft)) as ResearchDraft);
      setValidationErrors({});
      setSourceErrors({});
      setFormTouched(false);
      setPreviewMode('edit');
    }
  }, [open, initialDraft]);

  const runValidation = (candidate: ResearchDraft) => {
    const nextErrors: Record<string, string> = {};
    const nextSourceErrors: Record<number, string> = {};

    if (!candidate.subject?.trim()) {
      nextErrors.subject = 'Add a subject so teammates can find this later.';
    } else if (candidate.subject.trim().length < 3) {
      nextErrors.subject = 'Subject should be at least 3 characters.';
    }

    if (!candidate.executive_summary?.trim()) {
      nextErrors.executive_summary = 'Provide a short executive summary.';
    } else if (candidate.executive_summary.trim().length < 40) {
      nextErrors.executive_summary = 'Summaries under 40 characters rarely capture the insight—add more detail.';
    }

    const markdown = candidate.markdown_report?.trim() || '';
    if (!markdown) {
      nextErrors.markdown_report = 'Paste the full markdown report before saving.';
    } else if (markdown.split(/\s+/).filter(Boolean).length < 60) {
      nextErrors.markdown_report = 'Research reports should include at least 60 words of context.';
    }

    const trimmedSources = (candidate.sources || [])
      .map(source => ({
        url: source.url?.trim() || '',
        query: source.query?.trim() || undefined,
      }))
      .filter(source => source.url);

    const seenUrls = new Map<string, number>();
    trimmedSources.forEach((source, index) => {
      try {
        new URL(source.url);
      } catch {
        nextSourceErrors[index] = 'Enter a valid URL.';
        return;
      }

      const normalizedUrl = source.url.toLowerCase();
      if (seenUrls.has(normalizedUrl)) {
        const previousIndex = seenUrls.get(normalizedUrl)!;
        nextSourceErrors[index] = 'Duplicate source detected.';
        nextSourceErrors[previousIndex] = 'Duplicate source detected.';
      } else {
        seenUrls.set(normalizedUrl, index);
      }
    });

    // Allow saving without sources; warn in UI instead of blocking

    setValidationErrors(nextErrors);
    setSourceErrors(nextSourceErrors);
    return Object.keys(nextErrors).length === 0 && Object.keys(nextSourceErrors).length === 0;
  };

  const commitDraftUpdate = (updater: (current: ResearchDraft) => ResearchDraft) => {
    setDraft(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      if (formTouched) {
        runValidation(next);
      }
      return next;
    });
  };

  const updateField = <K extends keyof ResearchDraft>(key: K, value: ResearchDraft[K]) => {
    commitDraftUpdate(prev => ({ ...prev, [key]: value }));
  };

  const updateSource = (index: number, key: keyof ResearchSource, value: string) => {
    commitDraftUpdate(prev => {
      const sources = [...(prev.sources || [])];
      sources[index] = { ...sources[index], [key]: value };
      return { ...prev, sources };
    });
  };

  const addSource = () => {
    commitDraftUpdate(prev => {
      const sources = [...(prev.sources || [])];
      sources.push({ url: '', query: '' });
      return { ...prev, sources };
    });
  };

  const removeSource = (index: number) => {
    commitDraftUpdate(prev => {
      const sources = [...(prev.sources || [])];
      sources.splice(index, 1);
      return { ...prev, sources };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    setFormTouched(true);
    if (runValidation(draft)) {
      // Apply chosen subject if mismatch was shown
      let finalSubject = draft.subject;
      if (subjectMismatch) {
        if (subjectChoice === 'active' && activeSubject) finalSubject = activeSubject;
        if (subjectChoice === 'custom' && customSubject.trim()) finalSubject = customSubject.trim();
      }
      await onSave({
        ...draft,
        subject: finalSubject,
        sources: draft.sources?.map(source => ({
          url: source.url?.trim() || '',
          query: source.query?.trim() || undefined,
        })) || [],
      });
    }
  };

  const handleNormalizeSources = () => {
    if (!draft?.sources?.length) return;
    const normalized = normalizeSourceEvents(
      draft.sources.map(source => ({ url: source.url.trim(), query: source.query?.trim() }))
    );

    commitDraftUpdate(prev => ({
      ...prev,
      sources: normalized,
    }));
  };

  const stats = useMemo(() => {
    const wordCount = draft?.markdown_report?.trim()
      ? draft.markdown_report.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const sentenceCount = draft?.executive_summary?.split(/(?<=[.!?])\s+/).filter(Boolean).length || 0;
    const sourceCount = draft?.sources?.filter(source => source.url?.trim()).length || 0;
    return { wordCount, sentenceCount, sourceCount };
  }, [draft?.markdown_report, draft?.executive_summary, draft?.sources]);

  if (!open || !draft) {
    return null;
  }

  // Subject mismatch detection: if activeSubject provided and different than draft.subject
  const subjectMismatch = Boolean(activeSubject && draft.subject && activeSubject.trim().toLowerCase() !== draft.subject.trim().toLowerCase());

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const countMentions = (text: string, term: string) => {
    if (!text || !term) return 0;
    try {
      const re = new RegExp(`\\b${escapeRe(term.trim().toLowerCase())}\\b`, 'g');
      return (text.toLowerCase().match(re) || []).length;
    } catch { return 0; }
  };
  const reportText = draft.markdown_report || '';
  const subjectCount = draft.subject ? countMentions(reportText, draft.subject) : 0;
  const activeCount = activeSubject ? countMentions(reportText, activeSubject) : 0;
  const mentionMismatch = Boolean(activeSubject && draft.subject && activeCount > 0 && subjectCount > 0 && activeSubject.trim().toLowerCase() !== draft.subject.trim().toLowerCase());
  const showSubjectConfirm = subjectMismatch || mentionMismatch;
  const paragraphs = (reportText || '').split(/\n\s*\n/).filter(Boolean).slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-fadeIn" data-testid="save-research-dialog">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Finalize research output
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">Review and enrich this response before saving it to history.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-white/60 transition-colors"
            aria-label="Close save dialog"
            disabled={saving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {showSubjectConfirm && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold mb-1">Confirm subject</div>
                <div className="text-xs text-amber-800 mb-2">
                  Draft subject: <span className="font-medium">{draft.subject}</span>{subjectCount ? ` (${subjectCount} mentions)` : ''}. 
                  Active context: <span className="font-medium">{activeSubject || '—'}</span>{activeCount ? ` (${activeCount} mentions)` : ''}. 
                  Choose which subject to save under.
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="subjectChoice" checked={subjectChoice==='draft'} onChange={() => setSubjectChoice('draft')} />
                    Use draft subject: <span className="font-medium">{draft.subject}</span>
                  </label>
                  {activeSubject && (
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="subjectChoice" checked={subjectChoice==='active'} onChange={() => setSubjectChoice('active')} />
                      Use active context: <span className="font-medium">{activeSubject}</span>
                    </label>
                  )}
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="subjectChoice" checked={subjectChoice==='custom'} onChange={() => setSubjectChoice('custom')} />
                    <span>Custom:</span>
                    <input className="border border-gray-300 rounded px-2 py-1 text-xs" value={customSubject} onChange={e=>setCustomSubject(e.target.value)} placeholder="Enter subject" />
                  </label>
                </div>
                <div className="mt-2 text-xs text-amber-700">Or <button type="button" className="text-amber-900 underline" onClick={async () => {
                  // Split into two drafts by saving twice
                  try {
                    await onSave({ ...draft });
                    if (activeSubject && activeSubject.trim().toLowerCase() !== draft.subject.trim().toLowerCase()) {
                      await onSave({ ...draft, subject: activeSubject });
                    }
                    onClose();
                  } catch (e) { /* errors will be handled by parent */ }
                }}>Split into two drafts</button></div>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <div className="font-semibold">Save failed</div>
                <div className="mt-1">{error}</div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-700 rounded hover:bg-red-100"
                  >
                    Retry save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
                    onClick={() => {
                      try { (window as any).dispatchEvent(new CustomEvent('save:continue-without')); } catch {}
                      // Close dialog so user can continue with Draft/Track
                      (document.activeElement as HTMLElement)?.blur?.();
                    }}
                  >
                    Continue without saving
                  </button>
                </div>
              </div>
            )}

            {formTouched && Object.keys(validationErrors).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Let’s tighten this up</p>
                  <p>We spotted a few fields that need attention before this ships to your teammates.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</label>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(event) => updateField('subject', event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {validationErrors.subject && (
                  <p className="text-xs text-red-600">{validationErrors.subject}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Research Type</label>
                <select
                  value={draft.research_type}
                  onChange={(event) => updateField('research_type', event.target.value as ResearchDraft['research_type'])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {RESEARCH_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ICP Fit Score</label>
                <input
                  type="number"
                  value={draft.icp_fit_score ?? ''}
                  onChange={(event) => updateField('icp_fit_score', event.target.value ? Number(event.target.value) : undefined)}
                  min={0}
                  max={100}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Signal Score</label>
                <input
                  type="number"
                  value={draft.signal_score ?? ''}
                  onChange={(event) => updateField('signal_score', event.target.value ? Number(event.target.value) : undefined)}
                  min={0}
                  max={100}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Composite Score</label>
                <input
                  type="number"
                  value={draft.composite_score ?? ''}
                  onChange={(event) => updateField('composite_score', event.target.value ? Number(event.target.value) : undefined)}
                  min={0}
                  max={100}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</label>
                <select
                  value={draft.priority_level || 'standard'}
                  onChange={(event) => updateField('priority_level', event.target.value as ResearchDraft['priority_level'])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PRIORITIES.map(level => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</label>
                <select
                  value={draft.confidence_level || 'medium'}
                  onChange={(event) => updateField('confidence_level', event.target.value as ResearchDraft['confidence_level'])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CONFIDENCE_LEVELS.map(level => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Executive Summary</label>
              <textarea
                value={draft.executive_summary}
                onChange={(event) => updateField('executive_summary', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
              />
              {validationErrors.executive_summary && (
                <p className="text-xs text-red-600">{validationErrors.executive_summary}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Markdown Report</label>
                <div className="inline-flex items-center rounded-lg border border-gray-200 text-xs font-medium overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${previewMode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                    onClick={() => setPreviewMode('edit')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${previewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                    onClick={() => setPreviewMode('preview')}
                  >
                    Preview
                  </button>
                </div>
              </div>
              {/* Entity tagging at paragraph level (counts) */}
              {(activeSubject || draft.subject) && (
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Entity mentions (paragraphs)</div>
                  <div className="space-y-1 max-h-40 overflow-auto" data-testid="entity-tags">
                    {paragraphs.length === 0 && <div className="text-xs text-gray-500">No content yet.</div>}
                    {paragraphs.map((p, i) => {
                      const c1 = draft.subject ? countMentions(p, draft.subject) : 0;
                      const c2 = activeSubject ? countMentions(p, activeSubject) : 0;
                      const has = (c1 + c2) > 0;
                      return (
                        <div key={i} className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${has ? 'bg-amber-50' : ''}`}>
                          <div className="text-[11px] text-gray-700 truncate max-w-[60%]">{p}</div>
                          <div className="flex items-center gap-1 text-[11px]">
                            {draft.subject && <span className={`px-1.5 py-0.5 rounded border ${c1>0?'border-amber-300 bg-white text-amber-900':'border-gray-200 text-gray-500'}`}>{draft.subject} ×{c1}</span>}
                            {activeSubject && <span className={`px-1.5 py-0.5 rounded border ${c2>0?'border-orange-300 bg-white text-orange-900':'border-gray-200 text-gray-500'}`}>{activeSubject} ×{c2}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {previewMode === 'edit' ? (
                <textarea
                  value={draft.markdown_report}
                  onChange={(event) => updateField('markdown_report', event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[220px] font-mono"
                />
              ) : (
                <div className="border border-gray-200 rounded-lg px-4 py-3 max-h-64 overflow-y-auto bg-gray-50">
                  <Streamdown className="prose prose-sm max-w-none">
                    {draft.markdown_report?.trim() || '_Nothing to preview yet._'}
                  </Streamdown>
                </div>
              )}
              {validationErrors.markdown_report && (
                <p className="text-xs text-red-600">{validationErrors.markdown_report}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{stats.wordCount.toLocaleString()} words</span>
                <span>{stats.sentenceCount} sentences</span>
                <span>{stats.sourceCount} sources referenced</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sources</label>
                <button
                  type="button"
                  onClick={addSource}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add source
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Add reputable URLs that back up the findings.</span>
                {(draft.sources?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleNormalizeSources}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clean &amp; dedupe
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {(draft.sources || []).length === 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No sources were captured from this run. You can add links that support this research, or save without sources.
                  </div>
                )}

                {(draft.sources || []).map((source, index) => (
                  <div key={`${source.url}-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                    <input
                      type="url"
                      value={source.url}
                      onChange={(event) => updateSource(index, 'url', event.target.value)}
                      placeholder="https://..."
                      className="md:col-span-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <input
                      type="text"
                      value={source.query || ''}
                      onChange={(event) => updateSource(index, 'query', event.target.value)}
                      placeholder="Search query"
                      className="md:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeSource(index)}
                      className="md:col-span-1 p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                      aria-label="Remove source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {sourceErrors[index] && (
                      <p className="md:col-span-6 text-xs text-red-600">{sourceErrors[index]}</p>
                    )}
                  </div>
                ))}
              </div>
              {/* Non-blocking: no hard error when sources are empty */}
            </div>

            {usage && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700">
                This turn used approximately <span className="font-semibold">{usage.tokens.toLocaleString()} tokens</span> (~
                <span className="font-semibold">{usage.credits.toLocaleString()} credits</span>).
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save research output'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
