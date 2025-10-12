import { useState } from 'react';
import { X, SplitSquareHorizontal, GitCommit, ChevronDown, ChevronRight } from 'lucide-react';

interface SubjectMismatchModalProps {
  open: boolean;
  draftSubject: string;
  activeSubject?: string | null;
  markdown: string;
  onClose: () => void;
  onChoose: (choice: { mode: 'use_draft' | 'use_active' | 'custom' | 'proceed'; custom?: string }) => void;
  onSplit: () => Promise<void> | void;
}

function countMentions(text: string, term: string) {
  if (!text || !term) return 0;
  try {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
    return (text.match(re) || []).length;
  } catch { return 0; }
}

export function SubjectMismatchModal({
  open,
  draftSubject,
  activeSubject,
  markdown,
  onClose,
  onChoose,
  onSplit,
}: SubjectMismatchModalProps) {
  const show = open && draftSubject && activeSubject && draftSubject.trim().toLowerCase() !== activeSubject.trim().toLowerCase();
  if (!show) return null;

  const subjectCount = countMentions(markdown, draftSubject);
  const activeCount = activeSubject ? countMentions(markdown, activeSubject) : 0;
  const paragraphs = (markdown || '').split(/\n\s*\n/).filter(Boolean).slice(0, 14);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm" data-testid="subject-mismatch-modal">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slideUp">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div>
            <div className="text-base font-semibold text-gray-900">Possible mixed entities detected</div>
            <div className="text-xs text-gray-700">We found mentions of both subjects. Choose how you want to proceed.</div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-white/60" aria-label="Close mismatch modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
            <div className="font-semibold">Subjects detected</div>
            <div className="mt-1 text-amber-800 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-amber-200">
                <span className="font-medium">{draftSubject}</span>
                <span className="text-xs bg-amber-100 border border-amber-200 rounded px-1.5">{subjectCount} mentions</span>
              </span>
              {activeSubject && (
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-amber-200">
                  <span className="font-medium">{activeSubject}</span>
                  <span className="text-xs bg-amber-100 border border-amber-200 rounded px-1.5">{activeCount} mentions</span>
                </span>
              )}
            </div>
          </div>

          <div>
            <button
              className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2"
              onClick={() => setDetailsOpen(v => !v)}
            >
              {detailsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              View paragraph matches
            </button>
            {detailsOpen && (
              <div className="space-y-2" data-testid="entity-paragraph-tags">
                {paragraphs.map((p, i) => {
                  const c1 = countMentions(p, draftSubject);
                  const c2 = activeSubject ? countMentions(p, activeSubject) : 0;
                  const has = (c1 + c2) > 0;
                  return (
                    <div key={i} className={`rounded-lg border p-2 ${has ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-600">Paragraph {i + 1}</div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {c1 > 0 && (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-900">{draftSubject} <span className="text-[10px] font-semibold">×{c1}</span></span>)}
                          {c2 > 0 && activeSubject && (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-orange-200 text-orange-900">{activeSubject} <span className="text-[10px] font-semibold">×{c2}</span></span>)}
                          {(c1 + c2) === 0 && (<span className="text-gray-400">—</span>)}
                        </div>
                      </div>
                      <div className="text-xs text-gray-700 mt-1 line-clamp-3">{p}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <GitCommit className="w-3.5 h-3.5" />
            Pick which company this draft belongs to:
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900" onClick={() => onChoose({ mode: 'use_draft' })}>Use “{draftSubject}”</button>
            {activeSubject && (
              <button className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900" onClick={() => onChoose({ mode: 'use_active' })}>Use “{activeSubject}”</button>
            )}
            <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100" onClick={() => onChoose({ mode: 'proceed' })}>Edit details</button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700" onClick={() => void onSplit()}>
              <SplitSquareHorizontal className="w-4 h-4" /> Split into two drafts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
