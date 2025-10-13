import { ThumbsUp, ThumbsDown, Copy, RotateCcw, Coins, Building2, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  onDraftEmail?: (markdown: string, company?: string | null) => void;
  draftEmailPending?: boolean;
  metadata?: Record<string, unknown>;
  usage?: { tokens: number; credits: number };
  onSummarize?: () => void | Promise<void>;
  collapseEnabled?: boolean;
  collapseThresholdWords?: number;
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
  onDraftEmail,
  draftEmailPending = false,
  usage,
  onSummarize,
  collapseEnabled = false,
  collapseThresholdWords = 150,
}: MessageBubbleProps) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);

  // Simple markdown-stripping for word count
  const stripMd = (s: string) => s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[>|-]{1,}\s?/g, ' ');
  const wordCount = (() => {
    try { return stripMd(content).trim().split(/\s+/).filter(Boolean).length; } catch { return 0; }
  })();
  const structured = useMemo(() => {
    if (role !== 'assistant') return null;
    let remaining = content?.trim();
    if (!remaining) return null;

    let ackLine: string | null = null;
    const firstBreak = remaining.indexOf('\n');
    if (firstBreak > 0) {
      const firstLine = remaining.slice(0, firstBreak).trim();
      if (firstLine && !firstLine.startsWith('##')) {
        ackLine = firstLine;
        remaining = remaining.slice(firstBreak + 1).trim();
      }
    }

    const execRegex = /##\s+Executive Summary\s*([\s\S]*?)(?=\n##\s+|$)/i;
    const execMatch = execRegex.exec(remaining);
    if (!execMatch) return null;
    const execBody = execMatch[1].trim();
    const before = remaining.slice(0, execMatch.index).trim();
    const after = remaining.slice(execMatch.index + execMatch[0].length).trim();
    const rest = [before, after].filter(Boolean).join('\n\n').trim();

    return {
      ackLine,
      execBody,
      remaining: rest,
    };
  }, [content, role]);

  const enableCollapse = !streaming && collapseEnabled && !structured && wordCount > collapseThresholdWords;
  const truncated = useMemo(() => {
    if (!enableCollapse) return content;
    try {
      const words = stripMd(content).trim().split(/\s+/);
      const head = words.slice(0, collapseThresholdWords).join(' ');
      return `${head} …`;
    } catch { return content; }
  }, [enableCollapse, content, collapseThresholdWords]);
  const displayContent = enableCollapse && !expanded ? truncated : content;

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

  const sanitizeCompanyName = (raw: string | null) => {
    if (!raw) return null;
    let value = raw.replace(/\s+[–—-]\s+Executive Summary$/i, '').replace(/Executive Summary$/i, '').trim();
    value = value.replace(/— Executive Summary$/i, '').trim();
    if (/^executive summary$/i.test(value)) return null;
    return value;
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
  const extracted = role === 'assistant' && showActions ? sanitizeCompanyName(extractCompanyName()) : null;
  const companyName = looksLikeCompany(extracted) ? extracted : null;
  const draftEmail = async () => {
    if (draftEmailPending) {
      addToast({ type: 'info', title: 'Draft in progress', description: 'I’m already drafting an email for you.' });
      return;
    }
    if (onDraftEmail) {
      onDraftEmail(content, companyName);
      return;
    }
    addToast({ type: 'error', title: 'Draft unavailable', description: 'Email drafting is not enabled in this view.' });
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

  const ackLine = structured?.ackLine;
  const execBody = structured?.execBody;
  const remainingMarkdown = structured?.remaining;
  const showCollapseToggle = enableCollapse;

  return (
    <div className="space-y-3" data-testid="message-assistant">
      {structured && !streaming ? (
        <div className="space-y-3">
          {ackLine && (
            <p className="text-xs text-gray-500 italic">{ackLine}</p>
          )}
          {execBody && (
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center text-lg">
                  📊
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-blue-900">Executive Summary</h3>
                    <span className="px-2 py-1 text-[11px] font-bold bg-blue-600 text-white rounded-full">TL;DR</span>
                  </div>
                  <Streamdown className="prose prose-sm text-gray-800 max-w-none">
                    {execBody}
                  </Streamdown>
                </div>
              </div>
            </div>
          )}
          {remainingMarkdown && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
                Detailed Findings
              </div>
              <div className="px-4 py-3">
                <Streamdown className="prose prose-sm max-w-none text-gray-800">
                  {remainingMarkdown}
                </Streamdown>
              </div>
            </div>
          )}
          {!remainingMarkdown && !execBody && content && (
            <MarkdownContent content={content} />
          )}
        </div>
      ) : (
        <div className="relative">
          <MarkdownContent content={displayContent} />
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
      )}

      {showCollapseToggle && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="text-xs text-blue-700 hover:text-blue-900"
            onClick={() => setExpanded((prev: boolean) => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show less' : 'Show more'}
            data-testid="collapse-toggle"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}

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
          {onSummarize && (
            <button
              onClick={onSummarize}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900"
              aria-label="Summarize this response"
            >
              Summarize
            </button>
          )}
         <button
           onClick={draftEmail}
           disabled={draftEmailPending}
           className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 disabled:text-gray-400 disabled:cursor-not-allowed"
           aria-label="Draft Email"
          >
            <Mail className="w-3.5 h-3.5" /> {draftEmailPending ? 'Drafting…' : 'Draft Email'}
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
