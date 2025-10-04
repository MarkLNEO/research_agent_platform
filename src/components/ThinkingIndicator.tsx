import { Brain, Search, ExternalLink, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ThinkingIndicatorProps {
  type: 'reasoning' | 'web_search' | 'reasoning_progress' | 'acknowledgment' | 'content_extraction' | 'accounts_added';
  content?: string;
  query?: string;
  sources?: string[];
  url?: string;
  count?: number;
  companies?: string[];
}

function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
}

function formatSourceTitle(url: string): string {
  const domain = extractDomain(url);
  const parts = domain.split('.');
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

export function ThinkingIndicator({ type, content, query, sources, url, count, companies }: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [userToggled, setUserToggled] = useState(false);
  const toggle = () => { setIsExpanded(v => !v); setUserToggled(true); };

  if (type === 'reasoning') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="flex gap-2 items-start px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl text-sm shadow-sm max-w-full">
          <Brain className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-blue-900 font-semibold">Thinking</span>
              <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
            </div>
            {content && (
              <div className="mt-1">
                <button
                  onClick={toggle}
                  className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 text-xs font-medium"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {isExpanded ? 'Hide reasoning' : 'Show reasoning'}
                </button>
                {isExpanded && (
                  <div className="mt-2 text-blue-800 text-xs leading-relaxed bg-white/50 p-2 rounded border border-blue-100 prose prose-sm max-w-none">
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            {!content && (
              <div className="mt-1 text-blue-700 text-xs">
                Analyzing your request...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'reasoning_progress') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="flex gap-2 items-center px-4 py-2 bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl text-sm shadow-sm">
          <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
          <span className="text-purple-900 text-xs font-medium">{content || 'Thinking...'}</span>
        </div>
      </div>
    );
  }

  if (type === 'acknowledgment') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl text-sm shadow-sm">
          <div className="text-amber-900 font-medium">{content}</div>
        </div>
      </div>
    );
  }

  if (type === 'content_extraction') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="flex gap-2 items-center px-4 py-2 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl text-sm shadow-sm">
          <ExternalLink className="w-4 h-4 text-indigo-600 animate-pulse" />
          <div className="flex-1 min-w-0">
            <span className="text-indigo-900 text-xs font-medium">Extracting content from page</span>
            {url && (
              <div className="mt-0.5 text-indigo-700 text-[10px] truncate opacity-75">{extractDomain(url)}</div>
            )}
          </div>
          <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (type === 'accounts_added') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="flex gap-2 items-start px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-300 rounded-xl text-sm shadow-sm max-w-full">
          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-emerald-900 font-semibold">
              ✅ Added {count} {count === 1 ? 'company' : 'companies'} to tracking
            </div>
            {companies && companies.length > 0 && (
              <div className="mt-1 text-emerald-700 text-xs">
                {companies.slice(0, 3).join(', ')}
                {companies.length > 3 && ` and ${companies.length - 3} more`}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'web_search') {
    return (
      <div className="flex gap-3 items-start mb-4 animate-fadeIn">
        <div className="flex gap-2 items-start px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl text-sm shadow-sm max-w-full">
          <Search className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-green-900 font-semibold">Searching the web</span>
              <Loader2 className="w-3 h-3 text-green-600 animate-spin" />
            </div>
            {query && (
              <div className="mt-1 text-green-800 text-xs">
                <span className="opacity-75">Query:</span> <span className="font-medium">&quot;{query}&quot;</span>
              </div>
            )}
            {sources && sources.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-700 font-medium">
                    Found {sources.length} source{sources.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={toggle}
                    className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-xs font-medium"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-2 space-y-1.5 bg-white/60 p-2 rounded border border-green-100">
                    {sources.slice(0, 8).map((source, idx) => (
                      <a
                        key={idx}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 text-xs text-green-700 hover:text-green-900 hover:bg-white/80 p-1.5 rounded transition-colors group"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-50 group-hover:opacity-100" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{formatSourceTitle(source)}</div>
                          <div className="text-[10px] text-green-600 truncate opacity-75">{extractDomain(source)}</div>
                        </div>
                      </a>
                    ))}
                    {sources.length > 8 && (
                      <div className="text-[10px] text-green-600 text-center pt-1 opacity-75">
                        +{sources.length - 8} more sources
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {(!sources || sources.length === 0) && (
              <div className="mt-1 text-green-700 text-xs">
                Finding relevant sources...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
