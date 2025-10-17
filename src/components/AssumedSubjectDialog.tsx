import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Sparkles, X } from 'lucide-react';

interface AssumedSubjectDialogProps {
  open: boolean;
  initialName: string;
  loading: boolean;
  suggestions: Array<{ name: string; industry?: string | null }>;
  onRefresh: (query: string) => void;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function AssumedSubjectDialog({ open, initialName, loading, suggestions, onRefresh, onSelect, onClose }: AssumedSubjectDialogProps) {
  const [query, setQuery] = useState(initialName);

  useEffect(() => {
    if (open) {
      setQuery(initialName);
    }
  }, [open, initialName]);

  const normalizedSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return suggestions.filter(item => {
      const key = item.name.toLowerCase();
      if (!item.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }, [suggestions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Pick the right company</h2>
            <p className="text-xs text-gray-600 mt-1">Select from the best matches or enter a different name to rerun research.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Close assumed company dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">Search companies</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., GardaWorld"
                />
              </div>
              <button
                type="button"
                onClick={() => onRefresh(query)}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                disabled={!query.trim() || loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Refresh
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Top matches</div>
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {loading && normalizedSuggestions.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
                </div>
              ) : normalizedSuggestions.length === 0 ? (
                <div className="py-6 text-sm text-gray-600 text-center px-4">
                  No matches yet. Try refining the company name above.
                </div>
              ) : (
                normalizedSuggestions.map((item, idx) => (
                  <button
                    key={`${item.name}-${idx}`}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                    onClick={() => onSelect(item.name)}
                  >
                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                    {item.industry && (
                      <div className="text-xs text-gray-600 mt-0.5">{item.industry}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onSelect(query.trim() || initialName)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            disabled={!query.trim()}
          >
            Use “{query.trim() || initialName}”
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
