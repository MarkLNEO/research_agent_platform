import { ThumbsUp, ThumbsDown, Copy, RotateCcw, Coins, Building2, Mail } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { useToast } from './ToastProvider';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  userName?: string;
  showActions?: boolean;
  streaming?: boolean;
  onPromote?: () => void;
  disablePromote?: boolean;
  onRetry?: () => void;
  onTrackAccount?: (company: string) => void;
  metadata?: Record<string, unknown>;
  usage?: { tokens: number; credits: number };
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="streamdown-wrapper text-gray-900">
      <Streamdown
        className="prose prose-gray max-w-none"
        // Keep component overrides minimal so Streamdown can provide
        // built-in Shiki highlighting, copy controls, and math/mermaid.
        components={{
          h1: ({ children }) => <h1 className="mt-8 mb-4 text-gray-900 font-bold text-2xl">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-7 mb-3 text-gray-900 font-semibold text-xl">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-3 text-gray-900 font-semibold text-lg">{children}</h3>,
          p: ({ children }) => <p className="mb-4 leading-relaxed text-gray-800">{children}</p>,
          a: ({ children, href }) => <a href={href} className="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          hr: () => <hr className="my-6 border-gray-200" />,
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export function MessageBubble({
  role,
  content,
  userName = 'Y',
  showActions = false,
  streaming = false,
  onPromote,
  disablePromote,
  onRetry,
  onTrackAccount,
  usage,
}: MessageBubbleProps) {
  const { addToast } = useToast();

  // Extract company name from research content if applicable
  const extractCompanyName = () => {
    // Prefer explicit labels
    const labelMatch = content.match(/^\s*(?:Company|Target Company|Account)\s*:\s*(.+)$/mi);
    if (labelMatch?.[1]) {
      const cand = labelMatch[1].trim();
      if (!/^\d+[).]?$/.test(cand)) return cand;
    }

    // Use top-level heading if present (and not just a numeral)
    const h1 = content.match(/^#\s+(.+?)$/m);
    if (h1?.[1] && !/^\d+[).]?$/.test(h1[1].trim())) {
      return h1[1].trim();
    }

    // Fallback: "Research on X" phrasing
    const onMatch = content.match(/Research\s+(?:on|about)\s+(.+?)(?:\s+for|\.|$)/i);
    if (onMatch?.[1] && !/^\d+[).]?$/.test(onMatch[1].trim())) {
      return onMatch[1].trim();
    }

    // Fallback: first non-empty line that looks like a name and not a list marker
    const firstLine = content.split('\n').map(l => l.trim()).find(l => l && !/^\d+[).]/.test(l) && !/^[-*]/.test(l));
    if (firstLine && !/^\d+[).]?$/.test(firstLine)) {
      return firstLine.replace(/^#+\s*/, '').trim();
    }

    return null;
  };

  // Gate tracking: only show Track when we have a concise, human-looking company name
  const looksLikeCompany = (name: string | null) => {
    if (!name) return false;
    const s = name.trim();
    if (s.length < 2 || s.length > 80) return false;
    if (/^if you want/i.test(s)) return false;
    if (/\s{2,}/.test(s)) return false;
    // Avoid sentences (multiple punctuation)
    const puncts = (s.match(/[.!?]/g) || []).length;
    if (puncts >= 2) return false;
    // Allow up to 5 words
    if (s.split(/\s+/).length > 6) return false;
    return true;
  };
  const extracted = role === 'assistant' && showActions ? extractCompanyName() : null;
  const companyName = looksLikeCompany(extracted) ? extracted : null;
  const draftEmail = async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token;
      const resp = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { 'Authorization': `Bearer ${auth}` } : {}) },
        body: JSON.stringify({ research_markdown: content, company: companyName })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Draft failed');
      await navigator.clipboard.writeText(json.email || '');
      addToast({ type: 'success', title: 'Draft email copied' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to draft email', description: e?.message || String(e) });
    }
  };

  if (role === 'user') {
    return (
      <div className="flex gap-3 items-start" data-testid="message-user">
        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
          {userName}
        </div>
        <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-gray-900">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="message-assistant">
      <div className="relative">
        <MarkdownContent content={content} />
        {streaming && content && (
          <span className="inline-block w-0.5 h-4 bg-blue-600 ml-1 animate-pulse" />
        )}
        {streaming && !content && (
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
          </div>
        )}
      </div>

      {showActions && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title="Copy"
              aria-label="Copy message"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  addToast({ type: 'success', title: 'Copied to clipboard' });
                } catch {
                  addToast({ type: 'error', title: 'Copy failed', description: 'Select and copy manually.' });
                }
              }}
            >
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              className="p-1.5 hover:bg-gray-100 rounded transition-colors" 
              title="Like"
              onClick={() => addToast({ type: 'success', title: 'Feedback recorded', description: 'Thanks for your input!' })}
            >
              <ThumbsUp className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              className="p-1.5 hover:bg-gray-100 rounded transition-colors" 
              title="Dislike"
              onClick={() => addToast({ type: 'info', title: 'Feedback recorded', description: 'We\'ll work on improving this.' })}
            >
              <ThumbsDown className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {onRetry && (
            <button 
              onClick={onRetry}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1" 
              aria-label="Retry generation"
            >
              Retry
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {onPromote && (
            <button
              onClick={onPromote}
              disabled={disablePromote}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              aria-label="Save to Research"
            >
              Save to Research
            </button>
          )}
          <button
            onClick={draftEmail}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
            aria-label="Draft Email"
          >
            <Mail className="w-3.5 h-3.5" /> Draft Email
          </button>
          {onTrackAccount && companyName && (
            <button
              onClick={() => onTrackAccount(companyName)}
              className="text-xs font-semibold text-purple-600 hover:text-purple-700"
              aria-label="Track Account"
            >
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                Track {companyName}
              </span>
            </button>
          )}

          {usage && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto mr-2">
              <Coins className="w-3.5 h-3.5" />
              <span className="font-medium">{usage.tokens.toLocaleString()} tokens</span>
              <span className="text-gray-400">•</span>
              <span>~{usage.credits} credits</span>
            </div>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            Agent can make mistakes. Please double-check responses.
          </span>
        </div>
      )}
    </div>
  );
}
