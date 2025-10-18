import { ThumbsUp, ThumbsDown, Copy, RotateCcw, Coins, Building2, CheckCircle2, Target, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import { useToast } from './ToastProvider';
import { deriveIcpMeta } from '../utils/researchOutput';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  userName?: string;
  showActions?: boolean;
  streaming?: boolean;
  mode?: 'deep' | 'quick' | 'specific' | 'auto' | null;
  onModeChange?: (mode: 'deep' | 'quick' | 'specific') => void;
  onPromote?: () => void;
  disablePromote?: boolean;
  onRetry?: () => void;
  onTrackAccount?: (company: string) => void;
  metadata?: Record<string, unknown>;
  usage?: { tokens: number; credits: number };
  onSummarize?: () => void | Promise<void>;
  isSummarizing?: boolean;
  onNextAction?: (action: string) => void;
  collapseEnabled?: boolean;
  collapseThresholdWords?: number;
  agentType?: string;
  summarizeReady?: boolean;
  assumed?: { name: string; industry?: string | null; website?: string | null };
  onAssumedChange?: (assumed: { name: string; industry?: string | null; website?: string | null }) => void;
  contextSummary?: {
    icp?: string | null;
    targetTitles?: string[];
    criteria?: Array<{ name: string; importance?: string | null }>;
    signals?: string[];
  } | null;
  recentlySaved?: boolean;
}

const EMPTY_SECTION_PATTERNS = [
  /^none\s+found\.?$/i,
  /^unknown\.?$/i,
  /^n\/a$/i,
  /^no\s+material\s+findings\.?$/i,
  /^no\s+(?:new|significant)\s+(?:updates|signals)\.?$/i,
];

const dropEmptySections = (markdown: string | null | undefined): string => {
  if (!markdown) return '';
  let trimmed = markdown.trim();
  // Strip common acknowledgement/meta lines that sometimes leak into sections
  const ACK_LINE = /^(?:on it\b.*?|starting\b.*?|quick facts\b.*?|quick scan\b.*?|specific answer\b.*?|deep dive\b.*?|starting deep research\b.*?)(?:\.|!|\))?\s*$/i;
  const ETA_LINE = /^\s*ETA\s*:\s*~?\d+\s*min(?:ute)?s?\.?\s*$/i;
  trimmed = trimmed
    .split('\n')
    .filter((line) => {
      const isAck = ACK_LINE.test(line.trim());
      const isEta = ETA_LINE.test(line.trim());
      // Keep if not a pure ack/eta line
      return !(isAck || isEta);
    })
    .join('\n');
  if (!trimmed) return '';
  const segments = trimmed.split(/(?=^##\s+)/m);
  const preserved: string[] = [];
  for (const segment of segments) {
    const block = segment.trim();
    if (!block) continue;
    const lines = block.split('\n');
    const heading = lines[0] || '';
    if (!/^##\s+/i.test(heading)) {
      if (block.replace(/\s+/g, '').length) {
        preserved.push(block);
      }
      continue;
    }
    const body = lines.slice(1).join('\n').trim();
    if (!body) continue;
    const bodyForCheck = body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/[*_`]/g, '')
      .replace(/[-•\u2022]\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!bodyForCheck) continue;
    const isPlaceholder = EMPTY_SECTION_PATTERNS.some(pattern => pattern.test(bodyForCheck));
    if (isPlaceholder) continue;
    preserved.push(block);
  }
  return preserved.join('\n\n').trim();
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="streamdown-wrapper text-gray-900 select-text">
      <Streamdown
        className="prose prose-gray max-w-none"
        // Keep component overrides minimal so Streamdown can provide
        // built-in Shiki highlighting, copy controls, and math/mermaid.
        components={{
          h1: ({ children }) => <h1 className="mt-8 mb-4 text-gray-900 font-bold text-2xl">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-7 mb-3 text-gray-900 font-semibold text-xl">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-3 text-gray-900 font-semibold text-lg">{children}</h3>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 text-gray-800 marker:text-gray-400">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1 text-gray-800 marker:text-gray-400">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
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
  mode = null,
  onModeChange,
  onPromote,
  disablePromote,
  onRetry,
  onTrackAccount,
  usage,
  onSummarize,
  isSummarizing = false,
  onNextAction,
  collapseEnabled = false,
  collapseThresholdWords = 150,
  agentType = 'company_research',
  summarizeReady = false,
  assumed,
  onAssumedChange,
  contextSummary,
  recentlySaved = false,
}: MessageBubbleProps) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const safeContent = content ?? '';
  const isCompanyResearch = agentType === 'company_research';
  const selectableMode = mode && mode !== 'auto' ? mode : null;
  const isSpecificMode = selectableMode === 'specific';
  const icpMeta = useMemo(() => {
    if (!isCompanyResearch || role !== 'assistant' || streaming) return null;
    // Do not show ICP scorecard for draft email content
    if (/^\s*##\s*Draft Email\b/i.test(safeContent)) return null;
    // Only show ICP card for full research outputs that include a real Executive Summary section.
    const hasExecSummary = /^##\s+Executive Summary\b/im.test(safeContent);
    if (!hasExecSummary) return null;
    try {
      return deriveIcpMeta(safeContent);
    } catch {
      return null;
    }
  }, [safeContent, role, streaming, isCompanyResearch]);

  const contextDetails = useMemo(() => {
    if (!contextSummary) return null;
    const items: Array<{ label: string; value: string }> = [];
    if (contextSummary.icp) {
      items.push({ label: 'ICP', value: contextSummary.icp });
    }
    if (Array.isArray(contextSummary.targetTitles) && contextSummary.targetTitles.length) {
      items.push({ label: 'Target titles', value: contextSummary.targetTitles.join(', ') });
    }
    if (Array.isArray(contextSummary.criteria) && contextSummary.criteria.length) {
      const crit = contextSummary.criteria
        .map(c => `${c.name}${c.importance ? ` (${c.importance.toLowerCase()})` : ''}`)
        .join(', ');
      if (crit) items.push({ label: 'Criteria applied', value: crit });
    }
    if (Array.isArray(contextSummary.signals) && contextSummary.signals.length) {
      items.push({ label: 'Signals monitoring', value: contextSummary.signals.join(', ') });
    }
    return items.length ? items : null;
  }, [contextSummary]);

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
    try { return stripMd(safeContent).trim().split(/\s+/).filter(Boolean).length; } catch { return 0; }
  })();

  const extractFirstDomain = (text: string): string | null => {
    const m = text.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
    return m && m[1] ? m[1].toLowerCase() : null;
  };

  const extractContactNames = (): Array<{ name: string; title?: string }> => {
    try {
      const lines = safeContent.split(/\n+/);
      const arr: Array<{ name: string; title?: string }> = [];
      for (const ln of lines) {
        const t = ln.replace(/^[-*•]\s*/, '');
        const mm = t.match(/([A-Z][A-Za-z.'\-]+\s+[A-Z][A-Za-z.'\-]+)\s+\—\s+(.+)$/);
        if (mm) arr.push({ name: mm[1], title: mm[2] });
      }
      return arr.slice(0, 6);
    } catch { return []; }
  };

  const handleVerifyEmails = async () => {
    try {
      const domain = extractFirstDomain(safeContent);
      const names = extractContactNames();
      if (!domain || names.length === 0) {
        alert('No website or contacts detected in this report.');
        return;
      }
      const resp = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, names, limit: 6 })
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        alert(`Verification failed: ${txt || resp.statusText}`);
        return;
      }
      const data = await resp.json();
      const count = Array.isArray(data?.contacts) ? data.contacts.filter((c: any) => c?.email).length : 0;
      alert(count > 0 ? `Found ${count} verified email${count === 1 ? '' : 's'}.` : 'No verified emails found.');
    } catch (e: any) {
      alert(`Verification error: ${e?.message || 'unknown error'}`);
    }
  };
  const structured = useMemo(() => {
    if (isSpecificMode) return null; // Do not force research sections for specific follow-ups
    if (!isCompanyResearch || role !== 'assistant' || streaming) return null;
    // Skip research-specific layout for draft emails
    if (/^\s*##\s*Draft Email\b/i.test(safeContent)) return null;
    let remaining = safeContent.trim();
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

    const tldrRegex = /##\s+(?:TL;DR|High Level Summary)\s*([\s\S]*?)(?=\n##\s+|$)/i;
    let tldrBody: string | null = null;
    const tldrMatch = tldrRegex.exec(remaining);
    if (tldrMatch) {
      tldrBody = tldrMatch[1].trim();
      const before = remaining.slice(0, tldrMatch.index).trim();
      const after = remaining.slice(tldrMatch.index + tldrMatch[0].length).trim();
      remaining = [before, after].filter(Boolean).join('\n\n').trim();
    }

    // Helper: strip any acknowledgement line that accidentally streamed inside the Executive Summary body
    const stripAckFromStart = (body: string): string => {
      if (!body) return body;
      const lines = body.split(/\n+/);
      if (!lines.length) return body;
      const first = (lines[0] || '').trim();
      const ackLike = /^(on it\b|starting\b|quick facts\b|quick scan\b|specific answer\b|deep dive\b|starting deep research\b|got it\b)/i;
      // Also catch variants like “On it — deep dive (~2 min).”
      if (ackLike.test(first) || /deep\s*dive\s*\(~?\d+\s*min\)?/i.test(first)) {
        return lines.slice(1).join('\n').trim();
      }
      return body;
    };

    // 1) Canonical Executive Summary section
    const execRegex = /##\s+Executive Summary\s*([\s\S]*?)(?=\n##\s+|$)/i;
    let match = execRegex.exec(remaining);
    if (match) {
      const execBody = stripAckFromStart(match[1].trim());
      const before = remaining.slice(0, match.index).trim();
      const after = remaining.slice(match.index + match[0].length).trim();
      const rest = [before, after].filter(Boolean).join('\n\n').trim();
      return { ackLine, tldrBody, execBody, remaining: rest, autoGenerated: false };
    }

    // 2) Alternate heading style like "Company — Executive Summary" or any heading containing that phrase
    const altExecRegex = /^#{1,3}\s+.*?executive\s+summary.*?\n([\s\S]*?)(?=\n#{1,3}\s+|$)/im;
    match = altExecRegex.exec(remaining);
    if (match) {
      const execBody = stripAckFromStart(match[1].trim());
      const before = remaining.slice(0, match.index).trim();
      const after = remaining.slice(match.index + match[0].length).trim();
      const rest = [before, after].filter(Boolean).join('\n\n').trim();
      return { ackLine, tldrBody, execBody, remaining: rest, autoGenerated: false };
    }

    // 3) Streamed emphasis blocks (e.g., orchestrator <em> summary hints)
    const emRegex = /<em(?:\s+[^>]*?)?>([\s\S]*?)<\/em>/i;
    const emMatch = emRegex.exec(remaining);
    if (emMatch) {
      const candidate = emMatch[1].trim();
      const plain = stripMd(candidate).replace(/\s+/g, ' ').trim();
      const meaningful = plain.split(/\s+/).filter(Boolean).length >= 8 && plain.length >= 40;
      if (meaningful) {
        const before = remaining.slice(0, emMatch.index).trim();
        const after = remaining.slice(emMatch.index + emMatch[0].length).trim();
        const rest = [before, after].filter(Boolean).join('\n\n').trim();
        return { ackLine, tldrBody, execBody: candidate, remaining: rest, autoGenerated: false };
      }
    }

    // Auto-generate a quick summary if content is lengthy but missing an executive summary section
    const plain = stripMd(remaining);
    const words = plain.split(/\s+/).filter(Boolean);
    if (isSpecificMode || words.length < 80) return null;
    const summaryWordCount = Math.min(120, Math.max(80, Math.floor(words.length * 0.25)));
    const summary = words.slice(0, summaryWordCount).join(' ').trim();
    if (!summary) return null;

    return { ackLine, tldrBody, execBody: summary, remaining, autoGenerated: true };
  }, [safeContent, role, streaming, isCompanyResearch]);

  const enableCollapse = !streaming && collapseEnabled && !structured && wordCount > collapseThresholdWords;
  const truncated = useMemo(() => {
    if (!enableCollapse) return safeContent;
    try {
      const words = stripMd(safeContent).trim().split(/\s+/);
      const head = words.slice(0, collapseThresholdWords).join(' ');
      return `${head} …`;
    } catch { return safeContent; }
  }, [enableCollapse, safeContent, collapseThresholdWords]);
  const displayContent = enableCollapse && !expanded ? truncated : safeContent;

  const normalizedContent = useMemo(() => {
    return safeContent.trim();
  }, [safeContent]);

  const effectiveContent = useMemo(() => {
    if (!structured) return safeContent;
    const cleaned = dropEmptySections(structured?.remaining || '');
    if (cleaned && cleaned.trim()) return cleaned.trim();
    if (structured.execBody && structured.execBody.trim()) return structured.execBody.trim();
    if (structured.tldrBody && structured.tldrBody.trim()) return structured.tldrBody.trim();
    if (structured.ackLine) return structured.ackLine;
    return safeContent;
  }, [structured, safeContent]);

  const nextActions = useMemo(() => {
    const source = safeContent || '';
    const sectionMatch = source.match(/##\s+(Next Actions?|Next Steps?|Proactive Follow-ups)[\s\S]*?(?=\n##\s+|$)/i);
    if (!sectionMatch) return [] as string[];
    const lines = sectionMatch[0].split(/\n+/).slice(1); // skip heading
    const actions = lines
      .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(text => text.length > 0 && text.length <= 140 && !/^none\s+found\.?$/i.test(text) && !/^unknown\b/i.test(text))
    const unique = Array.from(new Set(actions));
    return unique.slice(0, 6);
  }, [safeContent]);

  // Extract company name from research content if applicable
  const extractCompanyName = () => {
    // Prefer explicit labels
    const labelMatch = safeContent.match(/^\s*(?:Company|Target Company|Account)\s*:\s*(.+)$/mi);
    if (labelMatch?.[1]) {
      const cand = labelMatch[1].trim();
      if (!/^\d+[).]?$/.test(cand)) return cand;
    }

    // Use top-level heading if present (and not just a numeral)
    const h1 = safeContent.match(/^#\s+(.+?)$/m);
    if (h1?.[1] && !/^\d+[).]?$/.test(h1[1].trim())) {
      return h1[1].trim();
    }

    // Fallback: "Research on X" phrasing
    const onMatch = safeContent.match(/Research\s+(?:on|about)\s+(.+?)(?:\s+for|\.|$)/i);
    if (onMatch?.[1] && !/^\d+[).]?$/.test(onMatch[1].trim())) {
      return onMatch[1].trim();
    }

    // Fallback: first non-empty line that looks like a name and not a list marker
    const firstLine = safeContent.split('\n').map(l => l.trim()).find(l => l && !/^\d+[).]/.test(l) && !/^[-*]/.test(l));
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
    if (/^draft email$/i.test(s)) return false;
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
  const ackLine = structured?.ackLine;
  const tldrBody = structured?.tldrBody;
  const execBody = structured?.execBody;
  const remainingMarkdown = useMemo(() => dropEmptySections(structured?.remaining || ''), [structured]);
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
  const autoSummary = structured?.autoGenerated ?? false;
  const showCollapseToggle = enableCollapse;
  const renderIcpScorecard = isCompanyResearch && icpMeta ? (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl border-2 border-emerald-300 bg-white px-4 py-3 shadow-sm">
          <span className="text-3xl font-bold text-emerald-600">{icpMeta.score}</span>
          <span className="text-[11px] font-semibold uppercase text-emerald-700">/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-900">
            ICP Fit: {icpMeta.verdict}
          </div>
          <div className="text-xs text-emerald-800 mt-1">
            Confidence: {icpMeta.confidence}%
          </div>
          {icpMeta.rationale && (
            <div className="mt-2 text-[11px] text-emerald-800">{icpMeta.rationale}</div>
          )}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => { try { window.dispatchEvent(new CustomEvent('optimize-icp:open')); } catch {} }}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              Tweak scoring model
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const isDraftEmail = /^\s*##\s*Draft Email\b/i.test(safeContent);
  return (
    <div className="space-y-3" data-testid="message-assistant">
      {(assumed || onModeChange || selectableMode) && (
        <div className="space-y-2">
          {assumed && (
            <div className="w-full flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2 text-amber-900">
                <Target className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Assumed</span>
                <span className="text-sm font-semibold">{assumed.name}</span>
                {assumed.industry ? (
                  <span className="text-xs text-amber-800">— {assumed.industry}</span>
                ) : null}
              </div>
              {onAssumedChange && (
                <button
                  type="button"
                  className="text-xs font-semibold text-amber-800 underline hover:text-amber-900"
                  onClick={() => onAssumedChange(assumed)}
                  aria-label="Change assumed company"
                >
                  Change
                </button>
              )}
            </div>
          )}
          {onModeChange && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-2 py-1">
              <span className="text-[10px] font-semibold uppercase text-gray-500">Mode</span>
              {(['quick', 'deep', 'specific'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onModeChange(option)}
                  disabled={streaming}
                  className={`px-2 py-0.5 text-[10px] rounded-full font-semibold transition-colors ${selectableMode === option
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'} ${streaming ? 'opacity-60 cursor-not-allowed' : ''}`}
                  aria-pressed={selectableMode === option}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {structured ? (
        <div className="space-y-3">
          {ackLine && (
            <p className="text-xs text-gray-500 italic">{ackLine}</p>
          )}
          {renderIcpScorecard}
          {contextDetails && (
            <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Context Applied</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 hover:text-blue-900 underline"
                    onClick={() => addToast({
                      type: 'info',
                      title: 'About context',
                      description: 'This context comes from your saved profile (ICP, target titles, criteria, and signals). It is threaded through each section to tailor the brief.'
                    })}
                  >
                    What’s this?
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 hover:text-blue-900 underline"
                    onClick={() => { try { window.dispatchEvent(new Event('icp:optimize')); } catch {} }}
                    aria-label="Edit context"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <ul className="space-y-1 text-xs text-blue-800">
                {contextDetails.map(item => (
                  <li key={`${item.label}-${item.value}`}><span className="font-semibold text-blue-900">{item.label}:</span> {item.value}</li>
                ))}
              </ul>
            </div>
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
                    {autoSummary && (
                      <span className="px-2 py-1 text-[11px] font-bold bg-blue-600 text-white rounded-full">Auto Summary</span>
                    )}
                  </div>
                  <Streamdown className="prose prose-sm text-gray-800 max-w-none">
                    {(() => {
                      // Light cleanup to prevent reasoning/citations leaking into the summary card
                      const plain = stripMd(execBody)
                        .replace(/\s*\(source[s]?:[^)]*\)/gi, ' ')
                        .replace(/\bsource[s]?:\s*https?:\/\/\S+/gi, ' ')
                        .replace(/\s*\[[^\]]+\]\([^)]*\)/g, ' ')
                        .replace(/\s+/g, ' ') // collapse whitespace
                        .trim();
                      const sentences = plain.split(/(?<=[.!?])\s+/).filter(s => s && s.length > 8);
                      const limited = sentences.slice(0, 3).join(' ');
                      return limited || plain;
                    })()}
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
                  <Streamdown
                    className="prose prose-sm max-w-none text-gray-800"
                    components={{
                      ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    }}
                  >
                    {remainingMarkdown}
                  </Streamdown>
              </div>
            </div>
          )}
          {nextActions.length > 0 && onNextAction && (
            <div className="bg-white border border-blue-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">Suggested next steps</div>
              <div className="flex flex-wrap items-center gap-2">
                {nextActions.map((action, idx) => (
                  <button
                    key={`${action}-${idx}`}
                    type="button"
                    onClick={() => onNextAction(action)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!remainingMarkdown && !execBody && effectiveContent && (
            <MarkdownContent content={effectiveContent} />
          )}
          {tldrBody && (
            <div className="bg-blue-600/10 border border-blue-400/60 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg">
                  ⚡
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-blue-900">High Level Summary</h3>
                    <span className="px-2 py-1 text-[11px] font-bold bg-blue-700 text-white rounded-full">
                      Auto Summary
                    </span>
                  </div>
                  <Streamdown
                    className="prose prose-sm text-blue-900 max-w-none"
                    components={{
                      ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    }}
                  >
                    {tldrBody}
                  </Streamdown>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {renderIcpScorecard}
          <div className="relative">
          <MarkdownContent content={displayContent} />
          {streaming && safeContent && (
            <span className="inline-block w-0.5 h-4 bg-blue-600 ml-1 animate-pulse" />
          )}
          {streaming && !safeContent && (
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
            </div>
            )}
          </div>
        </div>
      )}

      {!structured && nextActions.length > 0 && onNextAction && !streaming && (
        <div className="bg-white border border-blue-100 rounded-2xl px-4 py-3 shadow-sm">
          <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">Suggested next steps</div>
          <div className="flex flex-wrap items-center gap-2">
            {nextActions.map((action, idx) => (
              <button
                key={`${action}-${idx}`}
                type="button"
                onClick={() => onNextAction(action)}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
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
                  await navigator.clipboard.writeText(normalizedContent);
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

          {onPromote && !isDraftEmail && (
            <div className="flex items-center gap-2">
              <button
                onClick={onPromote}
                disabled={disablePromote || recentlySaved}
                className={`text-xs font-semibold ${recentlySaved ? 'text-emerald-600 cursor-default' : 'text-blue-600 hover:text-blue-700'} ${(disablePromote || recentlySaved) ? 'disabled:text-gray-400 disabled:cursor-not-allowed' : ''} inline-flex items-center gap-1`}
                aria-label="Save & Track"
              >
                {recentlySaved ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                ) : disablePromote ? (
                  <>
                    <svg className="animate-spin h-3 w-3 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    Saving…
                  </>
                ) : (
                  'Save & Track'
                )}
              </button>
              <button
                onClick={handleVerifyEmails}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                title="Verify and surface decision-maker emails"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Get verified emails
              </button>
            </div>
          )}
          {onSummarize && !isDraftEmail && (
            <button
              onClick={onSummarize}
              disabled={isSummarizing}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center gap-1"
              aria-label="Summarize this response"
              aria-busy={isSummarizing}
            >
              {isSummarizing && (
                <svg className="animate-spin h-3 w-3 text-gray-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              )}
              {isSummarizing ? 'Summarizing…' : 'Summarize'}
            </button>
          )}
          {onSummarize && summarizeReady && (
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Ready
            </span>
          )}
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
