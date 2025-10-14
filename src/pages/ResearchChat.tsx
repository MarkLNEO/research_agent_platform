import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { SaveResearchDialog } from '../components/SaveResearchDialog';
import { CSVUploadDialog } from '../components/CSVUploadDialog';
import { BulkResearchDialog } from '../components/BulkResearchDialog';
import { BulkResearchStatus } from '../components/BulkResearchStatus';
import { ProfileCompletenessBanner } from '../components/ProfileCompletenessBanner';
import { AccountSignalsDrawer } from '../components/AccountSignalsDrawer';
import { listRecentSignals, type AccountSignalSummary } from '../services/signalService';
import { fetchDashboardGreeting } from '../services/accountService';
import { useToast } from '../components/ToastProvider';
import { buildResearchDraft, approximateTokenCount } from '../utils/researchOutput';
import type { ResearchDraft } from '../utils/researchOutput';
import { normalizeMarkdown, stripClarifierBlocks } from '../utils/markdown';
import type { TrackedAccount, AccountStats } from '../services/accountService';
import { useUserProfile } from '../hooks/useUserProfile';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { OptimizeICPModal } from '../components/OptimizeICPModal';
import { useResearchEngine } from '../contexts/ResearchEngineContext';

const ALL_REFINE_FACETS = ['leadership', 'funding', 'tech stack', 'news', 'competitors', 'hiring'] as const;

type ResearchAction = 'new' | 'continue' | 'email' | 'refine';

type Suggestion = {
  icon: string;
  title: string;
  description: string;
  prompt: string;
};

const extractCompanyNameFromQuery = (raw: string): string | null => {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^research\s+/i, '')
    .replace(/^tell me about\s+/i, '')
    .replace(/^find\s+/i, '')
    .replace(/^analyze\s+/i, '')
    .replace(/^who is\s+/i, '')
    .replace(/^what is\s+/i, '')
    .trim();
  if (!cleaned) return null;

  const actionPrefix = /^(summarize|continue|draft|write|compose|email|refine|save|track|start|begin|generate|rerun|retry|copy|share|compare)\b/i;
  if (actionPrefix.test(cleaned)) {
    return null;
  }

  if (!cleaned) return null;
  const stopPattern = /\s+(in|at|for|with|that|who|which)\s+/i;
  const parts = cleaned.split(stopPattern);
  const candidate = (parts[0] || '').replace(/[^A-Za-z0-9&.\s-]/g, '').trim();
  if (!candidate) return null;
  return candidate
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
};

const deriveChatTitle = (text: string): string => {
  const company = extractCompanyNameFromQuery(text);
  if (company) return `Research: ${company}`;
  const trimmed = text.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'New Chat';
};

const formatDisplaySubject = (subject: string | null | undefined): string => {
  if (!subject) return 'None';
  const trimmed = subject.trim();
  if (!trimmed) return 'None';
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}…` : trimmed;
};

const isLikelySubject = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(summarize|continue|draft|write|compose|email|refine|help me|start|begin|generate|retry|rerun)/i.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 80) return false;
  if (/\s{2,}/.test(trimmed)) return false;
  return true;
};

const DEFAULT_AGENT = 'company_research';

const sendPreferenceSignal = async (
  key: string,
  observed: Record<string, any>,
  opts?: { agent?: string; weight?: number }
) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (anonKey) headers['apikey'] = String(anonKey);

    const payload: Record<string, any> = {
      agent: opts?.agent || DEFAULT_AGENT,
      key,
      observed,
    };
    if (typeof opts?.weight === 'number') payload.weight = opts.weight;

    await fetch('/api/agent/signal', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[research-chat] preference signal failed', error);
  }
};

const GENERIC_HELP_PROMPTS = new Set([
  'what can you help me with',
  'what can you help me with?',
  'what can you help with',
  'what can you help with?',
  'what do you do',
  'what do you do?',
  'help',
  'help me',
  'help me?',
  'how can you help',
  'how can you help?',
]);

const isGenericHelpPrompt = (text: string): boolean => GENERIC_HELP_PROMPTS.has(text.trim().toLowerCase());

const getGenericHelpResponse = (): string => [
  'Happy to help — here’s what I can do right now:',
  '',
  '## Research & Intelligence',
  '- Deep-dive company research in ~2 minutes (signals, tech stack, decision makers, next actions).',
  '- Quick fact pulls when you just need headcount, funding, or leadership highlights.',
  '- Specific answers about tools, breaches, compliance, or timing signals.',
  '',
  '## Meeting Prep',
  '- Auto-generate briefing docs for upcoming calls with talking points, objections, and follow-ups.',
  '- Capture context from past conversations so you never start cold.',
  '',
  '## Account Tracking & Signals',
  '- Monitor your strategic accounts for leadership changes, breaches, funding, procurement, and more.',
  '- Prioritize accounts with hot signals and suggest the right outreach.',
  '',
  '## Actions You Can Take Now',
  '- Ask me to “Research <Company>” for a full report.',
  '- Say “Prep me for my call with <Company> tomorrow.”',
  '- Drop a CSV of accounts and I’ll track and update them automatically.',
].join('\n');

const isResearchPrompt = (text: string): boolean => {
  const lower = text.toLowerCase();
  if (isGenericHelpPrompt(lower)) return false;
  return (
    lower.startsWith('research ') ||
    lower.includes(' research ') ||
    lower.startsWith('tell me about') ||
    lower.startsWith('analyze ') ||
    lower.startsWith('find ') ||
    lower.startsWith('who is ') ||
    lower.startsWith('what is ') ||
    (() => {
      // Fallback: a short noun phrase that looks like a company
      const candidate = extractCompanyNameFromQuery(text);
      if (!candidate) return false;
      const words = text.trim().split(/\s+/).length;
      return words <= 4; // treat short company-only prompts as research
    })()
  );
};

const generateSuggestions = (profile: any, criteria: any[], signalPrefs: any[]): Suggestion[] => {
  if (!profile) return [];
  const suggestions: Suggestion[] = [];
  const industry = profile.industry || '';
  const icp = profile.icp_definition || profile.icp || '';
  const criticalCriteria = criteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'critical');
  const importantCriteria = criteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'important');
  const signalTypes = signalPrefs.map((s: any) => s?.signal_type).filter(Boolean);

  if (icp) {
    suggestions.push({
      icon: '🎯',
      title: 'Find ICP Matches',
      description: 'Search for companies that match your ideal customer profile',
      prompt: `Find companies that match this ICP: ${icp}`,
    });
  }

  if (criticalCriteria.length > 0) {
    suggestions.push({
      icon: '🔥',
      title: 'Critical Signals Watchlist',
      description: `Monitor companies hitting: ${criticalCriteria.map((c: any) => c.name).join(', ')}`,
      prompt: `Show ${industry || 'relevant'} companies with signals for: ${criticalCriteria.map((c: any) => c.name).join(', ')}`,
    });
  }

  if (signalTypes.length > 0) {
    suggestions.push({
      icon: '📡',
      title: 'New Signal Alerts',
      description: `Companies with recent ${signalTypes.slice(0, 2).join(' & ')} activity`,
      prompt: `Find ${industry || 'relevant'} companies with recent ${signalTypes.join(', ')} events`,
    });
  }

  if (importantCriteria.length > 0) {
    suggestions.push({
      icon: '🧭',
      title: 'Deep Dive Priorities',
      description: `Evaluate prospects on ${importantCriteria.slice(0, 3).map((c: any) => c.name).join(', ')}`,
      prompt: `Research a company focusing on: ${importantCriteria.map((c: any) => c.name).join(', ')}`,
    });
  }

  return suggestions.slice(0, 4);
};

const summarizeForMemory = (markdown: string): string => {
  if (!markdown) return '';
  const execMatch = markdown.match(/##\s+Executive Summary\s*([\s\S]*?)(?=\n##\s+|$)/i);
  if (execMatch?.[1]) {
    return execMatch[1].replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return markdown.split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
};

const SIMPLE_FOLLOW_UP = /^(who|what|when|where|which|how|is|are|was|were|do|does|did|show me|give me|tell me)\b/i;

function inferResearchMode(prompt: string): 'deep' | 'quick' | 'specific' {
  const trimmed = prompt.trim();
  if (!trimmed) return 'deep';
  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksLikeQuestion = trimmed.endsWith('?') || SIMPLE_FOLLOW_UP.test(trimmed);
  if (looksLikeQuestion && words.length <= 12) {
    return 'specific';
  }
  return 'deep';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  streaming?: boolean;
}

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ThinkingEvent {
  id: string;
  type: 'reasoning' | 'web_search' | 'reasoning_progress' | 'acknowledgment' | 'content_extraction' | 'accounts_added' | 'context_preview';
  content?: string;
  query?: string;
  sources?: string[];
  url?: string;
  count?: number;
  companies?: string[];
  company?: string;
  icp?: string;
  critical?: string[];
  important?: string[];
}

export function ResearchChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const [actionBarCompany, setActionBarCompany] = useState<string | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
  // acknowledgment messages are displayed via ThinkingIndicator events
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [showInlineReasoning, setShowInlineReasoning] = useState<boolean>(() => {
    try { return localStorage.getItem('showInlineReasoning') !== '0'; } catch { return true; }
  });
  // Fast mode toggle: prioritizes speed via concise outputs and minimal reasoning
  const [fastMode, setFastMode] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('fastMode');
      if (v === '1') return true;
      if (v === '0') return false;
      // Default ON for users asking for faster responses
      return true;
    } catch { return true; }
  });
  const persistFastMode = (v: boolean) => {
    setFastMode(v);
    try { localStorage.setItem('fastMode', v ? '1' : '0'); } catch {}
    // When fast mode is enabled, hide inline reasoning to reduce UI noise
    if (v) {
      try { localStorage.setItem('showInlineReasoning', '0'); } catch {}
      setShowInlineReasoning(false);
    }
  };
  const persistInlineReasoning = (v: boolean) => {
    setShowInlineReasoning(v);
    try { localStorage.setItem('showInlineReasoning', v ? '1' : '0'); } catch {}
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const autoSentRef = useRef(false);
  const [showClarify, setShowClarify] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [focusComposerTick, setFocusComposerTick] = useState(0);
  const [preferredResearchType, setPreferredResearchType] = useState<'deep' | 'quick' | 'specific' | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ tokens: number; credits: number } | null>(null);
  const [draftEmailPending, setDraftEmailPending] = useState(false);
  // Cache for background-generated summaries keyed by assistant message id
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const [csvUploadOpen, setCSVUploadOpen] = useState(false);
  const [bulkResearchOpen, setBulkResearchOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const assistantInsertedRef = useRef(false);
  const [signalsDrawerOpen, setSignalsDrawerOpen] = useState(false);
  const [signalsAccountId, setSignalsAccountId] = useState<string | null>(null);
  const [signalsCompanyName, setSignalsCompanyName] = useState<string | undefined>(undefined);
  const [recentSignals, setRecentSignals] = useState<AccountSignalSummary[]>([]);
  const [greeting, setGreeting] = useState<{ time_of_day: string; user_name: string } | null>(null);
  const [greetingOpeningLine, setGreetingOpeningLine] = useState<string | null>(null);
  const [greetingSpotlights, setGreetingSpotlights] = useState<Array<{ icon: string; label: string; detail: string; prompt: string; tone?: 'critical' | 'info' | 'success' }>>([]);
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const [accountStats, setAccountStats] = useState<AccountStats | null>(null);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);
  const [postSummarizeNudge, setPostSummarizeNudge] = useState(false);
  const [clarifiersLocked, setClarifiersLocked] = useState(false);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const currentActionCompany = actionBarCompany || activeSubject;
  const displayActionCompany = currentActionCompany ? formatDisplaySubject(currentActionCompany) : null;
  const canRefreshResearch = Boolean(currentActionCompany);
  const refreshLabel = canRefreshResearch
    ? `Refresh ${displayActionCompany ?? 'research'}`
    : 'Refresh research';
  const [showRefine, setShowRefine] = useState(false);
  const [refineFacets, setRefineFacets] = useState<string[]>([]);
  const [refineTimeframe, setRefineTimeframe] = useState<string>('last 12 months');
  const [crumbOpen, setCrumbOpen] = useState(false);
  const [switchInput, setSwitchInput] = useState('');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const lastSubjectRef = useRef<{ prev: string | null; at: number | null }>({ prev: null, at: null });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lastRunMode, setLastRunMode] = useState<'deep'|'quick'|'specific'|'auto'|null>(null);
  const skipInitialLoadRef = useRef(false);
  const { profile: userProfile } = useUserProfile();
  const {
    selectedTemplate,
    selectedTemplateId,
    templateInputs,
    selectedGuardrailProfile,
    selectedSignalSet
  } = useResearchEngine();
  const [customCriteria, setCustomCriteria] = useState<any[]>([]);
  const [signalPreferences, setSignalPreferences] = useState<any[]>([]);
  const [creatingNewChat, setCreatingNewChat] = useState(false);
  const [showContextTooltip, setShowContextTooltip] = useState(false);
  const suggestions = useMemo(
    () => generateSuggestions(userProfile, customCriteria, signalPreferences),
    [userProfile, customCriteria, signalPreferences]
  );
  const icpQuickSuggestions = useMemo(() => {
    if (!userProfile) return [] as Array<{ title: string; description: string; prompt: string }>;
    const items: Array<{ title: string; description: string; prompt: string }> = [];
    const icp = userProfile.icp_definition || userProfile.icp || '';
    if (icp) {
      items.push({
        title: 'Companies that match your ICP',
        description: icp.length > 140 ? `${icp.slice(0, 137)}…` : icp,
        prompt: `Find companies that match this ICP: ${icp}`,
      });
    }
    const criticalCriteria = customCriteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'critical').map((c: any) => c.name).filter(Boolean);
    if (criticalCriteria.length) {
      items.push({
        title: 'Accounts hitting your critical criteria',
        description: `Surface companies where ${criticalCriteria.slice(0, 2).join(' & ')} are true.`,
        prompt: `Show companies with ${criticalCriteria.join(', ')} signals in the last 90 days`,
      });
    }
    const signalTypes = signalPreferences.map((s: any) => s?.signal_type).filter(Boolean);
    if (signalTypes.length) {
      items.push({
        title: 'Accounts with buying signals',
        description: `Focus on ${signalTypes.slice(0, 2).join(' & ')} signals this week.`,
        prompt: `Which tracked accounts triggered ${signalTypes.join(', ')} signals this week?`,
      });
    }
    if (accountStats?.stale) {
      items.push({
        title: 'Refresh stale accounts',
        description: `${accountStats.stale} tracked account${accountStats.stale === 1 ? '' : 's'} need an update.`,
        prompt: 'Which tracked accounts have not been researched in the last two weeks?',
      });
    }
    if (accountStats?.hot) {
      items.push({
        title: 'Hot accounts right now',
        description: `${accountStats.hot} account${accountStats.hot === 1 ? ' has' : 's have'} critical signals.`,
        prompt: 'Which of my tracked accounts are hot opportunities today?',
      });
    }
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.prompt.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }, [userProfile, customCriteria, signalPreferences, accountStats]);

  const combinedSuggestions = useMemo(() => {
    const base = suggestions.slice(0, 4);
    const extras = serverSuggestions
      .filter((prompt) => typeof prompt === 'string' && prompt.trim().length > 0)
      .map((prompt) => ({
        icon: '✨',
        title: prompt.length > 42 ? `${prompt.slice(0, 39)}…` : prompt,
        description: 'Quick suggestion from your dashboard activity.',
        prompt
      }));
    const merged = [...base, ...extras];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = item.prompt.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [suggestions, serverSuggestions]);
  const dismissContextTooltip = () => {
    setShowContextTooltip(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('contextTooltipSeen', 'true');
    }
  };
  const lastResearchSummaryRef = useRef<string>('');

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantMessage = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;
  const canDraftEmail = !!lastAssistantMessage && !draftEmailPending && !streamingMessage;
  const chatPaddingClass = actionBarVisible && !streamingMessage ? 'pb-32 md:pb-40' : '';

  const buildDraftFromLastAssistant = useCallback((): ResearchDraft | null => {
    if (lastAssistantIndex < 0) return null;
    const assistantMsg = messages[lastAssistantIndex];
    if (!assistantMsg) return null;
    const userMessage = [...messages].slice(0, lastAssistantIndex).reverse().find(msg => msg.role === 'user')?.content;
    const sources = thinkingEvents
      .filter(ev => ev.type === 'web_search' && ev.query && ev.sources)
      .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];

    const draft = buildResearchDraft({
      assistantMessage: assistantMsg.content,
      userMessage,
      chatTitle: chats.find(c => c.id === currentChatId)?.title,
      agentType: 'company_research',
      sources,
      activeSubject,
    });

    const normalizedDraft = (() => {
      const active = activeSubject?.trim();
      if (!active) return draft;
      const current = (draft.subject || '').trim();
      if (current && current.toLowerCase() === active.toLowerCase()) {
        return draft;
      }
      return { ...draft, subject: active };
    })();

    return normalizedDraft;
  }, [lastAssistantIndex, messages, thinkingEvents, chats, currentChatId, activeSubject]);

  useEffect(() => {
    if (user) void loadChats();
  }, [user]);

  // Allow any child component to open the ICP optimizer
  useEffect(() => {
    const open = () => setOptimizeOpen(true);
    window.addEventListener('optimize-icp:open', open);
    return () => window.removeEventListener('optimize-icp:open', open);
  }, []);

  useEffect(() => {
    if (!lastAssistantMessage) {
      setActionBarVisible(false);
    }
  }, [lastAssistantMessage]);

  const fetchUserPreferences = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [{ data: criteria }, { data: signals }] = await Promise.all([
        supabase
          .from('user_custom_criteria')
          .select('id, field_name, field_type, importance, hints, display_order')
          .eq('user_id', user.id)
          .order('display_order', { ascending: true }),
        supabase
          .from('user_signal_preferences')
          .select('id, signal_type, importance')
          .eq('user_id', user.id),
      ]);

      if (criteria) {
        setCustomCriteria(
          (criteria as any[]).map((item: any) => ({
            ...item,
            name: item.field_name ?? item.name ?? '',
          }))
        );
      } else {
        setCustomCriteria([]);
      }

      if (signals) {
        setSignalPreferences(signals as any[]);
      } else {
        setSignalPreferences([]);
      }
    } catch (error) {
      console.error('Failed to load user preferences', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchUserPreferences();
  }, [user?.id, fetchUserPreferences]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ criteria?: any[] }>).detail;
      if (detail?.criteria) {
        setCustomCriteria(
          detail.criteria.map((item: any) => ({
            ...item,
            name: item.field_name ?? item.name ?? '',
          }))
        );
      } else {
        void fetchUserPreferences();
      }
    };
    window.addEventListener('icp:criteria-updated', handler as EventListener);
    return () => window.removeEventListener('icp:criteria-updated', handler as EventListener);
  }, [fetchUserPreferences]);

  useEffect(() => {
    if (!currentChatId) {
      setMessages([]);
      return;
    }
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }
    void loadMessages(currentChatId);
  }, [currentChatId]);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, streamingMessage, thinkingEvents]);

useEffect(() => {
  if (showRefine && refineFacets.length === 0) {
    setRefineFacets([...ALL_REFINE_FACETS]);
  }
}, [showRefine, refineFacets.length]);

  // Load preference and handle quick starter
  useEffect(() => {
    // Recover last unsent or mid-stream message after refresh
    try {
      const raw = localStorage.getItem('last_research_message');
      if (raw) {
        const saved = JSON.parse(raw) as { text: string; at: number } | null;
        if (saved && Date.now() - saved.at < 20000 && !inputValue) {
          setInputValue(saved.text);
          setFocusComposerTick(tick => tick + 1);
          addToast({ type: 'info', title: 'Recovered your last request', description: 'Press Send to continue.' });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pref = localStorage.getItem('preferred_research_type');
    if (pref === 'deep' || pref === 'quick' || pref === 'specific') {
      setPreferredResearchType(pref);
    }
  }, []);

  // Listen for optimize ICP events from message bubbles
  useEffect(() => {
    const handler = () => setOptimizeOpen(true);
    window.addEventListener('icp:optimize', handler as any);
    return () => window.removeEventListener('icp:optimize', handler as any);
  }, []);

  // Load greeting + signals for proactive dashboard
  useEffect(() => {
    const load = async () => {
      try {
        try {
          const data = await fetchDashboardGreeting();
          if (data?.greeting) setGreeting(data.greeting as any);
          if (Array.isArray(data?.signals)) setRecentSignals(data.signals as any);
          if (data?.account_stats) setAccountStats(data.account_stats);
          setGreetingOpeningLine(data?.opening_line ?? null);
          setGreetingSpotlights(Array.isArray(data?.spotlights) ? data.spotlights : []);
          setServerSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        } catch {
          const list = await listRecentSignals(6);
          setRecentSignals(list);
        }
      } catch {
        // best effort; silent
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (!q || autoSentRef.current) return;
    autoSentRef.current = true;
    const sendStarter = async () => {
      let chatId = currentChatId;
      if (!chatId) {
        const newId = await createNewChat();
        chatId = newId;
      }
      if (chatId) {
        await handleSendMessageWithChat(chatId, q);
      }
    };
    void sendStarter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    const prefillHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (typeof detail?.prompt === 'string') {
        setInputValue(detail.prompt);
        setFocusComposerTick(tick => tick + 1);
      }
    };

    window.addEventListener('chat:prefill', prefillHandler as EventListener);
    const continueWithout = () => setSaveOpen(false);
    window.addEventListener('save:continue-without', continueWithout as EventListener);
    const keyHandler = (e: KeyboardEvent) => {
      const mac = navigator.platform.toLowerCase().includes('mac');
      const combo = (mac && e.metaKey && e.key.toLowerCase() === 'k') || (!mac && e.ctrlKey && e.key.toLowerCase() === 'k');
      if (combo) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('chat:prefill', prefillHandler as EventListener);
      window.removeEventListener('save:continue-without', continueWithout as EventListener);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('contextTooltipSeen') === 'true') return;
    let hideTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      setShowContextTooltip(true);
      hideTimer = window.setTimeout(() => {
        dismissContextTooltip();
      }, 6000);
    }, 1500);
    return () => {
      window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [dismissContextTooltip]);

  useEffect(() => {
    if (showRefine && refineFacets.length === 0) {
      setRefineFacets(Array.from(ALL_REFINE_FACETS));
    }
  }, [showRefine, refineFacets.length]);

  // Allow tests and power users to open the signals drawer programmatically
  useEffect(() => {
    const openHandler = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ accountId?: string; companyName?: string }>).detail;
        if (detail && typeof detail.accountId === 'string' && detail.accountId.length > 0) {
          setSignalsAccountId(detail.accountId);
          setSignalsCompanyName(detail.companyName);
          setSignalsDrawerOpen(true);
        }
      } catch {
        // no-op
      }
    };
    window.addEventListener('signals:open', openHandler as EventListener);
    return () => window.removeEventListener('signals:open', openHandler as EventListener);
  }, []);

  // Allow tests to open Bulk Research dialog programmatically
  useEffect(() => {
    const openBulk = () => setBulkResearchOpen(true);
    window.addEventListener('bulk:open', openBulk);
    return () => window.removeEventListener('bulk:open', openBulk);
  }, []);

  const loadChats = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setChats(data);
  };

  // Helper: find current chat if needed
  // const getCurrentChat = () => chats.find(c => c.id === currentChatId) || null;

  // Save dialog opens via onPromote in MessageBubble (last assistant message)

  const persistResearchDraft = useCallback(async (draft: ResearchDraft) => {
    const dataPayload = {
      subject: draft.subject,
      executive_summary: draft.executive_summary,
      markdown_report: draft.markdown_report,
      icp_fit_score: draft.icp_fit_score,
      signal_score: draft.signal_score,
      composite_score: draft.composite_score,
      priority_level: draft.priority_level,
      confidence_level: draft.confidence_level,
      company_data: draft.company_data || {},
      leadership_team: draft.leadership_team || [],
      buying_signals: draft.buying_signals || [],
      custom_criteria_assessment: draft.custom_criteria_assessment || [],
      personalization_points: draft.personalization_points || [],
      recommended_actions: draft.recommended_actions || {},
      sources: draft.sources || [],
    };
    const tokens = approximateTokenCount(`${draft.executive_summary}\n\n${draft.markdown_report}`);
    const { data: inserted, error } = await supabase.from('research_outputs').insert({
      user_id: user?.id,
      subject: draft.subject,
      research_type: draft.research_type,
      data: dataPayload,
      tokens_used: tokens,
      // Also store structured columns for easy querying
      executive_summary: draft.executive_summary,
      markdown_report: draft.markdown_report,
      icp_fit_score: draft.icp_fit_score,
      signal_score: draft.signal_score,
      composite_score: draft.composite_score,
      priority_level: draft.priority_level,
      confidence_level: draft.confidence_level,
      sources: draft.sources || [],
      company_data: draft.company_data || {},
      leadership_team: draft.leadership_team || [],
      buying_signals: draft.buying_signals || [],
      custom_criteria_assessment: draft.custom_criteria_assessment || [],
      personalization_points: draft.personalization_points || [],
      recommended_actions: draft.recommended_actions || {},
    }).select('*').single();
    if (error) throw error;
    try {
      const auth = (await supabase.auth.getSession()).data.session?.access_token;
      if (auth) {
        await fetch('/api/research/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ research_id: inserted?.id, markdown: draft.markdown_report })
        });
      }
    } catch (e) {
      console.warn('Criteria evaluation failed', e);
    }
    window.dispatchEvent(new CustomEvent('accounts-updated'));
    window.dispatchEvent(new CustomEvent('research-history-updated'));
    return inserted;
  }, [supabase, user?.id]);

  const handleTrackAccount = async (rawCompanyName: string) => {
    if (!user) return;
    const companyName = String(rawCompanyName || '')
      .replace(/^\s*\d+[).-]?\s*/, '') // drop leading list markers like "1)"
      .replace(/^[-*]\s*/, '')
      .trim();
    if (!companyName) {
      addToast({ title: 'Invalid company name', description: 'Could not determine a company name to track.', type: 'error' });
      return;
    }

    try {
      // Check if account already exists
      const { data: existingAccount } = await supabase
        .from('tracked_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_name', companyName)
        .single();

      const draft = buildDraftFromLastAssistant();
      const normalizedDraft = draft ? { ...draft, subject: companyName } : null;

      if (existingAccount) {
        if (normalizedDraft) {
          try {
            await persistResearchDraft(normalizedDraft);
            addToast({
              title: 'Research updated',
              description: `Saved latest findings for ${companyName}.`,
              type: 'success',
            });
          } catch (err: any) {
            addToast({
              title: 'Failed to save research',
              description: err?.message || 'Could not attach the latest report.',
              type: 'error',
            });
          }
        } else {
          addToast({
            title: 'Account already tracked',
            description: `${companyName} is already in your tracked accounts`,
            type: 'info',
          });
        }
        return;
      }

      // Add new tracked account
      const { error } = await supabase
        .from('tracked_accounts')
        .insert({
          user_id: user.id,
          company_name: companyName,
          monitoring_enabled: true,
          priority: 'standard',
        });

      if (error) throw error;

      addToast({ title: 'Account tracked', description: `${companyName} has been added to your tracked accounts`, type: 'success' });

      if (normalizedDraft) {
        try {
          await persistResearchDraft(normalizedDraft);
          addToast({
            title: 'Research attached',
            description: `Saved the current ${companyName} report and started monitoring.`,
            type: 'success',
          });
        } catch (err: any) {
          addToast({
            title: 'Could not save research',
            description: err?.message || 'Account is tracked, but the latest report was not saved automatically.',
            type: 'error',
          });
        }
      }

      // Trigger signal detection for new account
      fetch(`/api/signals/trigger-detection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      }).catch(console.error);

      // Dispatch event to update AccountListWidget
      window.dispatchEvent(new CustomEvent('accounts-updated'));

    } catch (error: any) {
      console.error('Failed to track account:', error);
      addToast({
        title: 'Failed to track account',
        description: error.message || 'Unable to add account to tracking',
        type: 'error',
      });
    }
  };

  const handleSaveResearch = async (draft: ResearchDraft) => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persistResearchDraft(draft);
      setSaveOpen(false);
      addToast({ type: 'success', title: 'Saved to history', description: 'Your research was added to History.' , actionText: 'View', onAction: () => navigate('/research') });
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save research');
      addToast({ type: 'error', title: 'Save failed', description: 'Could not save this response. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const createNewChat = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from('chats')
      .insert({ user_id: user.id, title: 'Company Research', agent_type: 'company_research' })
      .select()
      .single();
    if (data) {
      setChats(prev => [data, ...prev]);
      setCurrentChatId(data.id);
      setMessages([]);
      skipInitialLoadRef.current = true;
      lastResearchSummaryRef.current = '';
      return data.id;
    }
    return null;
  }, [supabase, user]);

  const handleNewChatClick = async () => {
    if (creatingNewChat) return;
    setCreatingNewChat(true);
    try {
      const id = await createNewChat();
      if (id) {
        addToast({
          type: 'success',
          title: 'New session ready',
          description: 'Start typing to kick off your next research.',
        });
      }
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Could not start new chat',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setCreatingNewChat(false);
    }
  };

  const handleSendMessageWithChat = async (chatId: string, text: string, runModeOverride?: 'deep' | 'quick' | 'specific') => {
    if (!text.trim() || loading) return;
    const normalized = text.trim();
    const now = Date.now();
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (
      (lastUser && lastUser.content.trim().toLowerCase() === normalized.toLowerCase()) ||
      (lastSentRef.current && lastSentRef.current.text === normalized.toLowerCase() && now - lastSentRef.current.at < 4000)
    ) {
      return; // prevent duplicate immediate sends of same text
    }
    lastSentRef.current = { text: normalized.toLowerCase(), at: now };
    setLoading(true);
    setStreamingMessage('');
    setThinkingEvents([]);
    setActionBarVisible(false);
    setActionBarCompany(null);
    assistantInsertedRef.current = false;

    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: normalized,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);

    const isGenericHelp = isGenericHelpPrompt(normalized);
    const looksLikeResearch = !isGenericHelp && isResearchPrompt(normalized);
    const continuationMatch = normalized.match(/^(?:continue|resume)\s+(?:research(?:\s+on)?\s+)?(.+)/i);
    const continuationTarget = continuationMatch?.[1]?.trim() || null;

    let detectedCompany = extractCompanyNameFromQuery(normalized);
    if (!detectedCompany && continuationTarget) {
      detectedCompany = extractCompanyNameFromQuery(`research ${continuationTarget}`);
    }

    if ((looksLikeResearch || continuationTarget) && isLikelySubject(detectedCompany)) {
      setActiveSubject(detectedCompany);
    }
    if ((looksLikeResearch || continuationTarget) && isLikelySubject(detectedCompany) && detectedCompany && detectedCompany !== activeSubject) {
      lastResearchSummaryRef.current = '';
    }

    if (isGenericHelp) {
      try {
        const { data: savedUser } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'user', content: normalized })
          .select()
          .single();

        const helperMessage = getGenericHelpResponse();
        const { data: savedAssistant } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'assistant', content: helperMessage })
          .select()
          .single();

        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUser.id);
          const next: Message[] = [...filtered];
          if (savedUser) next.push(savedUser);
          if (savedAssistant) next.push(savedAssistant);
          return next;
        });
      } catch (err) {
        console.error('Failed to handle help prompt', err);
        addToast({
          type: 'error',
          title: 'Something went wrong',
          description: 'Try again or ask about a specific company.',
        });
        setMessages(prev => prev.filter(m => m.id !== tempUser.id));
      } finally {
        setLoading(false);
        setStreamingMessage('');
        setThinkingEvents([]);
      }
      return;
    }

    if (looksLikeResearch && userProfile) {
      const criticalNames = customCriteria
        .filter((c: any) => (c?.importance || '').toLowerCase() === 'critical')
        .map((c: any) => c.name)
        .filter(Boolean)
        .slice(0, 4);
      const importantNames = customCriteria
        .filter((c: any) => (c?.importance || '').toLowerCase() === 'important')
        .map((c: any) => c.name)
        .filter(Boolean)
        .slice(0, 4);

      setThinkingEvents([{
        id: `context-${Date.now()}`,
        type: 'context_preview',
        company: detectedCompany || activeSubject || 'this company',
        icp: userProfile.icp_definition || userProfile.icp || userProfile.industry || '',
        critical: criticalNames,
        important: importantNames,
      }]);
    }

    try {
      // Persist last message for recovery in case of refresh
      try { localStorage.setItem('last_research_message', JSON.stringify({ text: normalized, at: Date.now() })); } catch {}
      const { data: savedUser } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'user', content: normalized })
        .select()
        .single();

      let assistant = await streamAIResponse(text, chatId, { overrideDepth: runModeOverride });
      assistant = normalizeMarkdown(assistant);

      // Persist any save_profile commands returned by the agent
      await processSaveCommands(assistant);

      // Prevent duplicate assistant insertion if this handler races or is re-entered
      if (assistantInsertedRef.current) {
        // Already appended once; just ensure UI state is clean
        setStreamingMessage('');
        setThinkingEvents([]);
        return;
      }
      assistantInsertedRef.current = true;
      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: assistant })
        .select()
        .single();

      const updatedAt = new Date().toISOString();
      if (messages.length === 0) {
        const title = deriveChatTitle(normalized);
        await supabase
          .from('chats')
          .update({ updated_at: updatedAt, title })
          .eq('id', chatId);
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title, updated_at: updatedAt } : chat));
      } else {
        await supabase
          .from('chats')
          .update({ updated_at: updatedAt })
          .eq('id', chatId);
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, updated_at: updatedAt } : chat));
      }

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUser.id);
        const next: Message[] = [...filtered];
        if (savedUser) next.push(savedUser);
        if (savedAssistant) next.push(savedAssistant);
        return next.filter((m, index, self) => m && index === self.findIndex(msg => msg?.id === m.id));
      });
      setStreamingMessage('');
      setThinkingEvents([]);
      lastResearchSummaryRef.current = summarizeForMemory(assistant);

      // Background: precompute a concise summary for instant access on click
      try {
        const msgId = (savedAssistant as any)?.id as string | undefined;
        if (msgId && assistant && assistant.trim().length > 0) {
          (async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              const chatUrl = '/api/ai/chat';
              const payload = {
                messages: [
                  { role: 'user', content: 'Summarize the previous research for executive consumption.' }
                ],
                stream: true,
                chatId,
                config: { summarize_source: assistant }
              } as any;
              const resp = await fetch(chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(payload)
              });
              if (!resp.ok || !resp.body) return;
              const reader = resp.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let summary = '';
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  const data = line.slice(6).trim();
                  if (!data || data === '[DONE]') continue;
                  try {
                    const evt = JSON.parse(data);
                    if (evt.type === 'content' && typeof evt.content === 'string') {
                      summary += evt.content;
                    }
                  } catch {}
                }
              }
              if (summary && summary.trim().length > 0) {
                setSummaryCache(prev => ({ ...prev, [msgId]: normalizeMarkdown(summary) }));
              }
            } catch {}
          })();
        }
      } catch {}

      if (assistant?.trim()) {
        const assistantCandidate = extractCompanyNameFromQuery(assistant);
        const nextCompany = isLikelySubject(detectedCompany)
          ? detectedCompany
          : isLikelySubject(activeSubject)
            ? activeSubject
            : isLikelySubject(assistantCandidate)
              ? assistantCandidate
              : null;
        setActionBarCompany(nextCompany);
        setActionBarVisible(true);
      }

      // JIT prompts based on usage milestones and profile state
      try {
        // Increment research count (local + server)
        const key = 'research_count';
        const current = Number(localStorage.getItem(key) || '0') || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));

        // Persist in user_prompt_config (best-effort)
        try {
          const host = typeof window !== 'undefined' ? window.location.hostname : '';
          const isLocal = host === 'localhost' || host === '127.0.0.1';
          if (!isLocal) {
            const sessionResult = await supabase.auth.getSession();
            const profileUpdate = await fetch('/api/update-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionResult.data.session?.access_token}`,
              },
              body: JSON.stringify({ prompt_config: { research_count: next } })
            });

            if (!profileUpdate.ok && profileUpdate.status !== 204) {
              const detail = `Failed with status ${profileUpdate.status}`;
              console.warn('[ProfileCoach] prompt_config update failed:', detail);
              addToast({
                type: 'error',
                title: 'Could not save research preferences',
                description: detail,
              });
            }
          } else {
            console.debug('[ProfileCoach] skipping prompt_config update while running without local API server');
          }
        } catch (updateErr) {
          console.warn('Prompt config update error', updateErr);
        }

        // After 1st research: suggest tracking account if none tracked
        if (next === 1) {
          const { count } = await supabase
            .from('tracked_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user!.id);
          if ((count || 0) === 0) {
            addToast({
              type: 'info',
              title: 'Track this account?',
              description: 'I can monitor it for signals and changes.',
              actionText: 'Track',
              onAction: async () => {
                const company = (assistant || '').split('\n')[0]?.replace(/^#+\s*/, '') || 'This account';
                await handleTrackAccount(company);
              }
            });
          }
        }

        // After 3rd research: suggest setting industry if missing
        if (next === 3) {
          const { data: profileRow } = await supabase
            .from('company_profiles')
            .select('industry')
            .eq('user_id', user!.id)
            .maybeSingle();
          if (!profileRow?.industry) {
            addToast({
              type: 'info',
              title: 'Set your target industry?',
              description: 'This helps tailor research quality.',
              actionText: 'Update',
              onAction: () => navigate('/profile-coach')
            });
          }
        }

        // After 5th research: suggest signal tracking if none configured
        if (next === 5) {
          const { count: sigCount } = await supabase
            .from('user_signal_preferences')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user!.id);
          if ((sigCount || 0) === 0) {
            addToast({
              type: 'info',
              title: 'Set up signal tracking?',
              description: 'Get alerts on leadership changes, breaches, funding, and more.',
              actionText: 'Configure',
              onAction: () => navigate('/settings/signals')
            });
          }
        }
      } catch {}
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || 'There was a problem sending your message. Please try again.';
      addToast({
        type: 'error',
        title: 'Message failed',
        description: errorMessage,
      });
      
      // Add error message to chat
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ I encountered an error while processing your request: **${errorMessage}**\n\nPlease try again, or rephrase your question.`,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => prev.filter(m => m.id !== tempUser.id).concat([tempUser, errorMsg] as any));
      setStreamingMessage('');
      setThinkingEvents([]);
      setActionBarVisible(false);
    } finally {
      setLoading(false);
      try { localStorage.removeItem('last_research_message'); } catch {}
    }
  };

  const startSuggestion = (prompt: string) => {
    if (!prompt) return;
    setInputValue(prompt);
    setShowClarify(false);
    setPendingQuery(null);
    setFocusComposerTick(t => t + 1);
  };

  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content) return;

    const isResearch = isResearchPrompt(content);
    const inferredMode = isResearch ? inferResearchMode(content) : undefined;

    if (!preferredResearchType && isResearch && inferredMode === 'deep') {
      setPendingQuery(content);
      setShowClarify(true);
      setInputValue('');
      return;
    }

    const runMode = preferredResearchType ?? inferredMode;

    setInputValue('');
    if (!currentChatId) {
      const id = await createNewChat();
      if (id) await handleSendMessageWithChat(id, content, runMode || undefined);
      return;
    }
    await handleSendMessageWithChat(currentChatId, content, runMode || undefined);
  };

  const persistPreference = async (type: 'deep' | 'quick' | 'specific') => {
    setPreferredResearchType(type);
    try { localStorage.setItem('preferred_research_type', type); } catch {}
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const updateProfileUrl = '/api/update-profile';
      await fetch(updateProfileUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ prompt_config: { preferred_research_type: type } }),
      });
    } catch (err) {
      console.error('Failed to persist preference:', err);
    }
  };

  const chooseResearchType = async (type: 'deep' | 'quick' | 'specific') => {
    await persistPreference(type);
    const lengthChoice: Record<'deep' | 'quick' | 'specific', 'long' | 'brief' | 'standard'> = {
      deep: 'long',
      quick: 'brief',
      specific: 'standard',
    };
    void sendPreferenceSignal('length', { kind: 'categorical', choice: lengthChoice[type] }, {
      weight: type === 'quick' ? 1.5 : type === 'deep' ? 1.2 : 1,
    });
    setShowClarify(false);
    const content = (pendingQuery || inputValue.trim());
    setPendingQuery(null);
    if (!content) return;
    setInputValue('');
    if (!currentChatId) {
      const id = await createNewChat();
      if (id) await handleSendMessageWithChat(id, content);
      return;
    }
    await handleSendMessageWithChat(currentChatId, content);
  };

  const streamAIResponse = async (
    userMessage: string,
    chatId?: string,
    options?: { config?: Record<string, any>; overrideDepth?: 'deep' | 'quick' | 'specific' }
  ): Promise<string> => {
    try {
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const looksLikeResearch = isResearchPrompt(userMessage);
      const referencesActive = activeSubject
        ? userMessage.toLowerCase().includes(activeSubject.toLowerCase())
        : false;
      const summarySnippet = !looksLikeResearch && lastResearchSummaryRef.current
        ? `\n\n[Recent findings recap: ${lastResearchSummaryRef.current}]`
        : '';
      const enrichedMessage =
        activeSubject && !looksLikeResearch && !referencesActive
          ? `${userMessage}\n\n[Context: The company in focus is ${activeSubject}.]${summarySnippet}`
          : `${userMessage}${summarySnippet}`;

      history.push({ role: 'user', content: enrichedMessage });

      let { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      let authToken = session.access_token;

      // Feature flag for safe API migration
      // Set VITE_USE_VERCEL_API=true in .env to use Vercel API instead of Edge Functions
      // Default to Vercel API unless explicitly disabled
      const chatUrl = '/api/ai/chat';

      console.log('[DEBUG] Calling chat API:', { chatUrl, hasSession: !!session });
      // Instrumentation: request start
      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { 
        window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'research', url: chatUrl, ts: Date.now() } }));
        console.log('[LLM][research] request', { url: chatUrl });
      } catch {}
      // Build config to influence model depth based on user preference/clarifier
      const overrideDepth = options?.overrideDepth;
      const depth = overrideDepth || preferredResearchType || 'deep';
      setLastRunMode((depth as any) || 'auto');
      const cfg: any = { ...(options?.config || {}) };
      if (depth === 'deep') cfg.model = 'gpt-5-mini';
      if (depth === 'quick') cfg.model = 'gpt-5-mini';
      if (depth === 'specific') cfg.model = 'gpt-5-mini';
      cfg.clarifiers_locked = clarifiersLocked;
      cfg.facet_budget = depth === 'quick' ? 3 : depth === 'deep' ? 10 : 6;
      // Fast mode hints to server for lower verbosity/reasoning and shorter summaries
      if (fastMode) {
        cfg.fast_mode = true;
        cfg.summary_brevity = 'short';
        // Lock clarifiers to avoid back-and-forth and save time
        cfg.clarifiers_locked = true;
      }

      // Setup abort controller for Stop action
      const controller = new AbortController();
      streamingAbortRef.current = controller;

      const requestPayload = JSON.stringify({
        messages: history,
        stream: true,
        chatId: chatId ?? currentChatId,
        config: {
          ...cfg,
          template: selectedTemplate ? {
            id: selectedTemplateId,
            version: selectedTemplate.version,
            sections: (selectedTemplate.sections || []).map(s => ({ id: s.id, label: s.label, required: Boolean((s as any).required) })),
            inputs: templateInputs || {},
            guardrail_profile_id: selectedGuardrailProfile?.id,
            signal_set_id: selectedSignalSet?.id,
          } : undefined
        },
        research_type: depth,
        active_subject: activeSubject || null
      });

      const makeRequest = (token: string) => fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: requestPayload,
        signal: controller.signal,
      });

      let response = await makeRequest(authToken);

      if (response.status === 401) {
        try {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed?.session?.access_token) {
            session = refreshed.session;
            authToken = refreshed.session.access_token;
            response = await makeRequest(authToken);
          }
        } catch (refreshErr) {
          console.warn('Token refresh failed', refreshErr);
        }
      }
      console.log('[DEBUG] Response status:', response.status, response.statusText);
      if (!response.ok) {
        try {
          const errBody = await response.text();
          addToast({
            type: 'error',
            title: `Chat API error ${response.status}`,
            description: errBody?.slice(0, 300) || response.statusText,
          });
        } catch {}
        if (response.status === 402) {
          try {
            const body = await response.json();
            if (body?.needsApproval) {
              navigate('/pending-approval');
            }
            throw new Error(body?.error || `API error: ${response.status} ${response.statusText}`);
          } catch {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }
        }
        // Decide whether to allow a non-streaming fallback (disabled by default).
        const allowFallback = import.meta.env.VITE_ALLOW_STREAM_FALLBACK === 'true';
        if (!allowFallback) {
          // Signal tests that streaming failed and fallback was NOT allowed.
          try { window.dispatchEvent(new CustomEvent('streaming-failed-no-fallback')); } catch {}
          throw new Error(`Streaming failed and fallback disabled`);
        }

        // Fallback (DEV/diagnostic only): retry without streaming to capture error body clearly
        try {
          const retry = await fetch(chatUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ messages: history, stream: false, chat_id: chatId ?? currentChatId }),
          });
          const fallbackText = await retry.text();
          try { window.dispatchEvent(new CustomEvent('stream-fallback-used')); } catch {}
          addToast({
            type: retry.ok ? 'success' : 'error',
            title: retry.ok ? 'Fallback (non-stream) succeeded' : `Fallback failed ${retry.status}`,
            description: fallbackText?.slice(0, 300) || 'No body',
          });
          if (retry.ok) {
            // Return textual body to surface something to user while we fix streaming
            try {
              const parsed = JSON.parse(fallbackText);
              const output = parsed?.text || parsed?.raw?.output_text || '';
              return typeof output === 'string' && output.length > 0 ? output : (fallbackText || '');
            } catch {
              return fallbackText || '';
            }
          }
        } catch (fallbackErr) {
          console.error('non-stream fallback error', fallbackErr);
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let mainContent = '';
      let tldrBuffer = '';
      let buffer = '';
      let usedTokens: number | null = null;
      let firstDeltaAt: number | null = null;
      const markFirstDelta = () => {
        if (firstDeltaAt == null) {
          firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          setThinkingEvents(prev => prev.filter(e => e.type !== 'acknowledgment' && e.type !== 'context_preview'));
          try {
            window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'research', ttfbMs: firstDeltaAt - startedAt } }));
            console.log('[LLM][research] first-delta', { ttfbMs: firstDeltaAt - startedAt });
          } catch {}
        }
      };
      const composeOutput = () => {
        const trimmedTldr = tldrBuffer.trim();
        if (!mainContent && !trimmedTldr) return '';
        const lines = mainContent.split('\n');
        let ackLine = '';
        let remainder = mainContent;
        if (lines.length > 0) {
          const first = lines[0].trim();
          if (first && !first.startsWith('#')) {
            ackLine = lines[0];
            remainder = lines.slice(1).join('\n').trimStart();
          }
        }
        const parts: string[] = [];
        if (ackLine) parts.push(ackLine.trim());
        if (remainder) parts.push(remainder.trim());
        if (trimmedTldr) parts.push(trimmedTldr);
        return parts.join('\n\n').trim();
      };
      const updateStreaming = () => {
        const composed = composeOutput();
        setStreamingMessage(stripClarifierBlocks(composed));
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'meta') {
                  try {
                    console.log('[LLM][meta]', parsed);
                    window.dispatchEvent(new CustomEvent('llm:meta', { detail: parsed }));
                  } catch {}
                }
                // Handle acknowledgment (shown before research starts)
                else if (parsed.type === 'acknowledgment') {
                  setThinkingEvents(prev => [...prev, { id: `ack-${Date.now()}`, type: 'acknowledgment', content: parsed.content }]);
                }
                // Handle reasoning events - UPDATE existing reasoning indicator
                else if (parsed.type === 'reasoning') {
                  markFirstDelta();
                  setThinkingEvents(prev => {
                    const existing = prev.find(e => e.type === 'reasoning');
                    if (existing) {
                      return prev.map(e => e.type === 'reasoning' ? { ...e, content: (e.content || '') + parsed.content } : e);
                    }
                    return [...prev, { id: 'reasoning-main', type: 'reasoning', content: parsed.content }];
                  });
                }
                // Handle reasoning progress
                else if (parsed.type === 'reasoning_progress') {
                  markFirstDelta();
                  setThinkingEvents(prev => {
                    // Replace or add reasoning progress indicator
                    const filtered = prev.filter(e => e.type !== 'reasoning_progress');
                    return [...filtered, { id: `rp-${Date.now()}`, type: 'reasoning_progress', content: parsed.content }];
                  });
                }
                // Handle web search events - UPDATE existing search indicator
                else if (parsed.type === 'web_search') {
                  setThinkingEvents(prev => {
                    const same = prev.find(e => e.type === 'web_search' && e.query === parsed.query);
                    if (same) {
                      return prev.map(e => (e.type === 'web_search' && e.query === parsed.query)
                        ? { ...e, sources: parsed.sources }
                        : e
                      );
                    }
                    const id = `search-${Date.now()}`;
                    return [...prev, { id, type: 'web_search', query: parsed.query, sources: parsed.sources }];
                  });
                }
                // Handle content extraction events
                else if (parsed.type === 'content_extraction') {
                  setThinkingEvents(prev => [...prev, { id: `e-${Date.now()}`, type: 'content_extraction', url: parsed.url }]);
                }
                // Handle accounts added event
                else if (parsed.type === 'accounts_added') {
                  setThinkingEvents(prev => [...prev, { 
                    id: `a-${Date.now()}`, 
                    type: 'accounts_added', 
                    count: parsed.count,
                    companies: parsed.companies 
                  }]);
                  // Show success toast
                  addToast({
                    title: 'Accounts Added',
                    description: `Added ${parsed.count} ${parsed.count === 1 ? 'company' : 'companies'} to tracking`,
                    type: 'success',
                  });
                  // Trigger sidebar refresh by dispatching custom event
                  window.dispatchEvent(new CustomEvent('accounts-updated'));
                }
                // Handle output text deltas (supports both Edge Function and Vercel API formats)
                else if (parsed.type === 'response.output_text.delta' || parsed.type === 'content') {
                  // Edge Function uses parsed.delta, Vercel API uses parsed.content
                  const delta = parsed.delta || parsed.content;
                  if (delta) {
                    markFirstDelta();
                    mainContent += delta;
                    updateStreaming();
                  }
                } else if (parsed.type === 'tldr') {
                  if (typeof parsed.content === 'string') {
                    tldrBuffer += parsed.content;
                    updateStreaming();
                    setThinkingEvents(prev =>
                      prev.filter(e => !(e.type === 'reasoning_progress' && (e.content || '').toLowerCase().includes('summary')))
                    );
                  }
                } else if (parsed.type === 'tldr_status') {
                  setThinkingEvents(prev => [...prev.filter(e => e.type !== 'reasoning_progress'), {
                    id: `tldr-${Date.now()}`,
                    type: 'reasoning_progress',
                    content: parsed.content || 'Preparing high level summary…'
                  }]);
                } else if (parsed.type === 'tldr_error') {
                  addToast({
                    type: 'error',
                    title: 'High level summary unavailable',
                    description: parsed.message || 'Could not create summary.'
                  });
                } else if (parsed.type === 'tldr_done') {
                  setThinkingEvents(prev =>
                    prev.filter(e => !(e.type === 'reasoning_progress' && (e.content || '').toLowerCase().includes('summary')))
                  );
                } else if (parsed.type === 'response.completed' && parsed.response?.usage?.total_tokens) {
                  usedTokens = Number(parsed.response.usage.total_tokens) || usedTokens;
                } else if (parsed.type === 'response' && parsed.usage?.total_tokens) {
                  usedTokens = Number(parsed.usage.total_tokens) || usedTokens;
                }
              } catch {}
            }
          }
        }
      }
      if (usedTokens != null) {
        const credits = Math.ceil(usedTokens / 1000);
        setLastUsage({ tokens: usedTokens, credits });
        addToast({ type: 'info', title: `Turn used ${usedTokens.toLocaleString()} tokens (~${credits} credits)` });
        // Trigger credit display refresh
        window.dispatchEvent(new CustomEvent('credits-updated'));
      }
      // Update active subject from the user message or assistant output
      try {
        const m = userMessage.match(/\bresearch\s+([\w\s.&-]{2,})/i);
        if (m && m[1] && isLikelySubject(m[1])) {
          setActiveSubject(m[1].trim());
        } else if (lastAssistantMessage?.content || mainContent) {
          const text = (lastAssistantMessage?.content || mainContent || '').slice(0, 800);
          const patterns = [
            /researching\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /found about\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /analysis of\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /^#\s+([^\n]+)/m,
          ];
          for (const p of patterns) {
            const mm = text.match(p);
            if (mm && mm[1] && mm[1].trim().length >= 2 && isLikelySubject(mm[1])) { setActiveSubject(mm[1].trim()); break; }
          }
        }
      } catch {}
      try {
        const endedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        window.dispatchEvent(new CustomEvent('llm:complete', {
          detail: {
            page: 'research',
            totalMs: endedAt - startedAt,
            ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null,
            tokens: usedTokens,
          }
        }));
        console.log('[LLM][research] complete', { totalMs: endedAt - startedAt, ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null, tokens: usedTokens });
      } catch {}
      return composeOutput();
    } catch (e: any) {
      // Swallow abort errors as user-initiated stops
      if (e?.name === 'AbortError') {
        console.log('[LLM] stream aborted by user');
        return (streamingMessage || '');
      }
      console.error('stream error', e);
      const errorMsg = e?.message || String(e);
      addToast({
        type: 'error',
        title: 'Research failed',
        description: `Error: ${errorMsg}`,
      });
      return `Sorry, I had trouble completing that request.\n\n**Error details:** ${errorMsg}`;
    }
  };

  const startSummarize = async (chatId: string, sourceMarkdown: string) => {
    const prompt = 'Summarize the previous research for executive consumption.';
    await streamAIResponse(prompt, chatId, { config: { summarize_source: sourceMarkdown } });
  };

  const getUserInitial = () => (user?.email ? user.email[0].toUpperCase() : 'Y');

  const handleRetry = async () => {
    // Find the last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage || !currentChatId) return;

    // Remove the last assistant message
    if (lastAssistantIndex < 0) return;
    const filteredMessages = messages.filter((_, idx) => idx !== lastAssistantIndex);
    setMessages(filteredMessages);

    // Regenerate the response
    await handleSendMessageWithChat(currentChatId, lastUserMessage.content);
  };

  const ensureActiveChat = useCallback(async (): Promise<string | null> => {
    if (currentChatId) return currentChatId;
    return await createNewChat();
  }, [createNewChat, currentChatId]);

  // Next Actions helpers
  const handleStartNewCompany = useCallback(async () => {
    const newChatId = await createNewChat();
    if (!newChatId) return;
    setActiveSubject(null);
    setActionBarCompany(null);
    setInputValue('Research ');
    setShowClarify(false);
    setPendingQuery(null);
    setFocusComposerTick(t => t + 1);
    lastResearchSummaryRef.current = '';
  }, [createNewChat]);

  const handleContinueCompany = useCallback(async () => {
    const subject = currentActionCompany;
    const chatId = await ensureActiveChat();
    if (!chatId) return;
    if (subject) {
      const refreshPrompt = `Refresh research on ${subject}. Focus purely on what changed since the last report.
Format exactly:
## What's New
- ...
## Opportunities
- ...
## Risks
- ...
Limit to 5 bullets total, cite sources inline, and end with one proactive next step.`;
      await handleSendMessageWithChat(chatId, refreshPrompt);
    } else {
      setInputValue('Research ');
      setFocusComposerTick(t => t + 1);
    }
  }, [currentActionCompany, ensureActiveChat, handleSendMessageWithChat]);

  const handleEmailDraftFromLast = useCallback(async (markdownOverride?: string, companyOverride?: string | null) => {
    if (draftEmailPending) return;
    try {
      const researchMarkdown = markdownOverride ?? lastAssistantMessage?.content;
      if (!researchMarkdown) {
        addToast({ type: 'error', title: 'No content to draft', description: 'Run research before drafting an email.' });
        return;
      }
      setDraftEmailPending(true);
      addToast({ type: 'info', title: 'Drafting email', description: 'Generating tailored outreach copy…' });
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token;
      const resp = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: JSON.stringify({
          research_markdown: researchMarkdown,
          company: companyOverride || activeSubject || undefined
        })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Draft failed');
      const email = typeof json?.email === 'string' ? json.email : '';
      if (email) {
        const formattedEmail = [
          '## Draft Email',
          '',
          '```text',
          email,
          '```',
        ].join('\n');

        if (navigator?.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(email);
            addToast({ type: 'success', title: 'Draft email copied' });
          } catch {
            addToast({ type: 'info', title: 'Clipboard unavailable', description: 'Showing the draft below.' });
          }
        } else {
          addToast({ type: 'success', title: 'Draft email ready', description: 'Showing the draft below.' });
        }

        let savedAssistant: Message | null = null;
        if (currentChatId) {
          try {
            const { data } = await supabase
              .from('messages')
              .insert({ chat_id: currentChatId, role: 'assistant', content: formattedEmail })
              .select()
              .single();
            if (data) {
              savedAssistant = data;
            }
          } catch (insertErr) {
            console.error('Failed to persist draft email message', insertErr);
          }
        }

        if (!savedAssistant) {
          savedAssistant = {
            id: `draft-email-${Date.now()}`,
            role: 'assistant',
            content: formattedEmail,
            created_at: new Date().toISOString(),
          } as Message;
        }

        setMessages(prev => [...prev, savedAssistant!]);
      } else {
        addToast({ type: 'error', title: 'No email generated', description: 'The drafting service returned an empty response.' });
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to draft email', description: e?.message || String(e) });
    } finally {
      setDraftEmailPending(false);
    }
  }, [draftEmailPending, lastAssistantMessage, supabase, activeSubject, addToast, currentChatId, setMessages]);

  const handleNextAction = async (action: string) => {
    if (!currentChatId) return;
    await handleSendMessageWithChat(currentChatId, `Help me with this next step: ${action}`);
  };

  const handleActionBarAction = useCallback(async (action: ResearchAction) => {
    switch (action) {
      case 'new':
        addToast({ type: 'info', title: 'Starting new research', description: 'Opening a fresh thread…' });
        await handleStartNewCompany();
        return;
      case 'continue':
        if (currentActionCompany) {
          addToast({ type: 'info', title: `Refreshing ${currentActionCompany}`, description: 'Focusing on what changed…' });
        } else {
          addToast({ type: 'info', title: 'Refresh research', description: 'Send a company name to continue.' });
        }
        await handleContinueCompany();
        return;
      case 'email':
        await handleEmailDraftFromLast();
        return;
      case 'refine':
        addToast({ type: 'info', title: 'Refine scope', description: 'Adjust focus areas for the next run.' });
        setShowRefine(true);
        return;
      default:
        return;
    }
  }, [handleStartNewCompany, handleContinueCompany, handleEmailDraftFromLast, currentActionCompany, addToast]);

  const shortcutHandlers = useMemo<Record<string, () => void>>(() => {
    const handlers: Record<string, () => void> = {};
    if (!actionBarVisible || streamingMessage) {
      return handlers;
    }
    handlers.n = () => { void handleActionBarAction('new'); };
    handlers.c = () => { void handleActionBarAction('continue'); };
    if (canDraftEmail) handlers.e = () => { void handleActionBarAction('email'); };
    handlers.r = () => { void handleActionBarAction('refine'); };
    return handlers;
  }, [actionBarVisible, streamingMessage, handleActionBarAction, canDraftEmail]);

  useKeyboardShortcuts(shortcutHandlers);

  const canUndoSubject = () => {
    const at = lastSubjectRef.current.at; if (!at) return false; return (Date.now() - at) < 10000;
  };
  const handleSwitchSubject = async () => {
    const next = (switchInput || '').trim();
    if (!next) { setCrumbOpen(false); return; }
    if (saveOpen || saving) {
      const ok = window.confirm('You have unsaved changes. Switch subject anyway?');
      if (!ok) return;
    }
    lastSubjectRef.current = { prev: activeSubject, at: Date.now() };
    setActiveSubject(next);
    setCrumbOpen(false);
    setSwitchInput('');
    addToast({ type: 'info', title: `Context switched to ${next}`, description: 'Undo available for 10 seconds.' });
  };
  const handleUndoSubject = () => {
    if (!canUndoSubject()) return;
    const prev = lastSubjectRef.current.prev;
    setActiveSubject(prev);
    lastSubjectRef.current = { prev: null, at: null };
    addToast({ type: 'success', title: 'Context restored' });
  };

  // New: Stop streaming handler
  const handleStopStreaming = () => {
    try { streamingAbortRef.current?.abort(); } catch {}
    setThinkingEvents([]);
  };

  const handleAccountClick = (account: TrackedAccount) => {
    // Open a detailed signals drawer for the account
    setSignalsAccountId(account.id);
    setSignalsCompanyName(account.company_name);
    setSignalsDrawerOpen(true);
  };

  const handleResearchAccount = (account: TrackedAccount) => {
    window.dispatchEvent(new CustomEvent('chat:prefill', {
      detail: { prompt: `Research ${account.company_name}` }
    }));
  };

  const handleAddAccount = () => {
    // Open CSV upload dialog
    setCSVUploadOpen(true);
  };

  const handleCSVUploadSuccess = (addedCount: number) => {
    addToast({
      type: 'success',
      title: 'Accounts Added',
      description: `Successfully added ${addedCount} account${addedCount !== 1 ? 's' : ''} to tracking`
    });
    // Optionally refresh the account list widget
  };

  // Look for JSON code blocks with action: save_profile and persist via server
  const processSaveCommands = async (responseText: string) => {
    const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
    const matches = Array.from(responseText.matchAll(jsonBlockRegex));
    for (const match of matches) {
      try {
        const content = match[1].trim();
        const data = JSON.parse(content);
        if (data.action === 'save_profile') {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) continue;
          
          const updateProfileUrl = '/api/update-profile';
          
          const res = await fetch(updateProfileUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              profile: data.profile,
              custom_criteria: data.custom_criteria,
              signal_preferences: data.signal_preferences,
              disqualifying_criteria: data.disqualifying_criteria,
            }),
          });
          if (!res.ok) {
            addToast({ type: 'error', title: 'Profile save failed', description: 'Could not apply your preferences. Try again from Settings.' });
          } else {
            addToast({ type: 'success', title: 'Profile updated', description: 'Your preferences were saved.' });
          }
        }
      } catch {
        addToast({ type: 'error', title: 'Profile save failed', description: 'Invalid save instruction. Please try again.' });
      }
    }
  };

  const handleGoHome = () => {
    setCurrentChatId(null);
    setMessages([]);
    setStreamingMessage('');
    setThinkingEvents([]);
    assistantInsertedRef.current = false;
    setShowClarify(false);
    setPendingQuery(null);
    navigate('/');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };

  return (
    <>
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onNewChat={handleNewChatClick}
        creatingNewChat={creatingNewChat}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={currentChatId}
        onChatSelect={setCurrentChatId}
        onSettings={() => navigate('/settings')}
        onCompanyProfile={() => navigate('/profile-coach')}
        onResearchHistory={() => navigate('/research')}
        onAccountClick={handleAccountClick}
        onAddAccount={handleAddAccount}
        onResearchAccount={handleResearchAccount}
        onHome={handleGoHome}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => void handleNewChatClick()}
                disabled={creatingNewChat}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-60"
              >
                {creatingNewChat ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Creating...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">New session</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setBulkResearchOpen(true)}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Upload CSV to research multiple companies"
                aria-label="Upload CSV to research multiple companies"
              >
                Bulk Research
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => persistFastMode(!fastMode)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${fastMode ? 'bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                aria-pressed={fastMode}
                title="Fast mode: shorter outputs, minimal reasoning"
                data-testid="fast-mode-toggle"
              >
                <span className="mr-1">⚡</span>
                <span className="font-medium">{fastMode ? 'Fast' : 'Standard'}</span>
              </button>
              <div className="relative">
              <button
                onClick={() => setAgentMenuOpen(prev => !prev)}
                className="flex items-center gap-2 text-sm text-gray-700 px-3 py-1.5 bg-gray-50 rounded-lg hover:bg-gray-100"
                aria-haspopup="menu"
                aria-expanded={agentMenuOpen}
              >
                <span className="font-medium">Company Researcher</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {agentMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20" role="menu">
                  <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" role="menuitem" onClick={() => setAgentMenuOpen(false)}>
                    Company Researcher
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" role="menuitem" onClick={() => { setAgentMenuOpen(false); navigate('/profile-coach'); }}>
                    Profile Coach
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="chat-surface">
          <div className={`max-w-3xl mx-auto px-6 py-8 ${chatPaddingClass}`}>
            <div className="space-y-6">
              {/* Profile completeness banner */}
              <ProfileCompletenessBanner />
              
              {/* Proactive dashboard hero (always visible at top) */}
              <div className="space-y-6" data-testid="dashboard-greeting">
                  <div className="py-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {greeting ? `👋 Good ${greeting.time_of_day}, ${greeting.user_name}!` : '👋 Welcome back!'}
                    </h2>
                  </div>
                  {greetingOpeningLine && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 shadow-sm">
                      <div className="flex items-start gap-2 text-sm text-blue-900 leading-relaxed">
                        <span className="text-lg">💬</span>
                        <span>{greetingOpeningLine}</span>
                      </div>
                    </div>
                  )}
                  {greetingSpotlights.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {greetingSpotlights.slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.label}-${idx}`}
                          onClick={() => startSuggestion(item.prompt)}
                          className={`text-left rounded-xl border px-4 py-3 transition-all hover:shadow-md ${
                            item.tone === 'critical'
                              ? 'border-red-200 bg-red-50/70 hover:border-red-300'
                              : 'border-blue-100 bg-blue-50/60 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xl">{item.icon}</span>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                              <p className="text-xs text-gray-700 mt-1 leading-relaxed">{item.detail}</p>
                              <p className="text-xs text-blue-700 mt-2 font-medium">Tap to act →</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {userProfile && (
                    <div className="border border-blue-200 rounded-2xl p-4 bg-white shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="text-sm font-semibold text-blue-900 mb-1">Using your saved profile</div>
                          <p className="text-xs text-gray-600">
                            ICP focus: <span className="font-medium text-gray-900">{userProfile.icp_definition || userProfile.icp || 'Not specified yet'}</span>
                          </p>
                          {(customCriteria.length > 0 || signalPreferences.length > 0) && (
                            <p className="text-xs text-gray-600 mt-2">
                              I’ll emphasise your <span className="font-medium text-gray-800">critical criteria</span> and flag <span className="font-medium text-gray-800">priority signals</span> every time you run research.
                            </p>
                          )}
                        </div>
                        {customCriteria.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {customCriteria
                              .filter((c: any) => (c?.importance || '').toLowerCase() === 'critical')
                              .map((c: any) => (
                                <span key={c.id} className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                                  🔥 {c.name}
                                </span>
                              ))}
                            {customCriteria
                              .filter((c: any) => (c?.importance || '').toLowerCase() === 'important')
                              .map((c: any) => (
                                <span key={c.id} className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-full">
                                  ⭐ {c.name}
                                </span>
                              ))}
                          </div>
                        )}
                        {icpQuickSuggestions.length > 0 && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {icpQuickSuggestions.map((item, idx) => (
                              <button
                                key={`${item.title}-${idx}`}
                                onClick={() => startSuggestion(item.prompt)}
                                className="w-full text-left border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all rounded-xl p-3 bg-blue-50/60"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-lg">💡</span>
                                  <div className="flex-1">
                                    <div className="text-sm font-semibold text-gray-900 mb-1">{item.title}</div>
                                    <p className="text-xs text-gray-600">{item.description}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {combinedSuggestions.length > 0 && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {combinedSuggestions.map((suggestion, index) => (
                              <button
                                key={`${suggestion.title}-${index}`}
                                onClick={() => startSuggestion(suggestion.prompt)}
                                className="w-full text-left border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all rounded-xl p-3 bg-blue-50/50"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-xl">{suggestion.icon}</span>
                                  <div className="flex-1">
                                    <div className="text-sm font-semibold text-gray-900 mb-1">
                                      {suggestion.title}
                                    </div>
                                    <p className="text-xs text-gray-600">
                                      {suggestion.description}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {recentSignals.length > 0 && (
                    <div className="border border-gray-200 rounded-2xl p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-900">Top signals</div>
                        <button
                          className="text-xs text-blue-600 hover:text-blue-700"
                          onClick={() => navigate('/signals')}
                        >
                          View all
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {recentSignals.map(s => (
                          <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-semibold text-gray-900 truncate">{s.company_name}</div>
                            <div className="text-xs text-gray-600 truncate">{s.signal_type.replace(/_/g, ' ')} • {new Date(s.signal_date).toLocaleDateString()}</div>
                            <div className="text-sm text-gray-900 mt-1 line-clamp-2">{s.description}</div>
                            {s.impact && (
                              <div className="text-xs text-gray-600 mt-2 leading-relaxed">
                                <span className="font-semibold text-gray-800">Why it matters: </span>{s.impact}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <button className="text-xs text-blue-600 hover:text-blue-700" onClick={() => { setSignalsAccountId(s.account_id); setSignalsCompanyName(s.company_name); setSignalsDrawerOpen(true); }}>Review</button>
                              <button
                                className="text-xs text-gray-700 hover:text-gray-900"
                                onClick={() => { setInputValue(`Research ${s.company_name}`); setTimeout(() => void handleSendMessage(), 50); }}
                              >
                                Research
                              </button>
                              {s.recommended_action && (
                                <button
                                  className="text-xs text-blue-700 hover:text-blue-900"
                                  onClick={() => startSuggestion(s.recommended_action!)}
                                >
                                  Do it for me
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setInputValue('Research ');
                        setFocusComposerTick(t => t + 1);
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Research a company"
                    >
                      Research a company
                    </button>
                    <button
                      onClick={() => setBulkResearchOpen(true)}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Upload a list"
                    >
                      Upload a list
                    </button>
                    <button
                      onClick={handleAddAccount}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Track an account"
                    >
                      Track an account
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="px-3 py-1.5 text-xs rounded-full bg-gray-100 text-gray-400 cursor-not-allowed border border-dashed border-gray-300"
                      aria-label="Lead list generator coming soon"
                    >
                      Lead list generator
                    </button>
                  </div>
              </div>
              
              {/* Bulk Research Status */}
              <BulkResearchStatus />
              
              {/* Clarification panel */}
              {showClarify && (
                <div className="border border-blue-200 bg-blue-50 rounded-2xl p-4">
                  <div className="text-sm font-semibold text-blue-900 mb-2">Quick question before I start</div>
                  <div className="text-sm text-blue-900 mb-3">What type of research would be most helpful?</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button onClick={() => void chooseResearchType('deep')} className="text-left border border-blue-200 rounded-xl p-3 bg-white hover:border-blue-400">
                      <div className="font-semibold">📊 Deep Account Research</div>
                      <div className="text-xs text-gray-600">Full report • ~25-35 credits • ~2 min</div>
                    </button>
                    <button onClick={() => void chooseResearchType('quick')} className="text-left border border-blue-200 rounded-xl p-3 bg-white hover:border-blue-400">
                      <div className="font-semibold">⚡ Quick Facts</div>
                      <div className="text-xs text-gray-600">Basics • ~5-10 credits • ~20 sec</div>
                    </button>
                    <button onClick={() => void chooseResearchType('specific')} className="text-left border border-blue-200 rounded-xl p-3 bg-white hover:border-blue-400">
                      <div className="font-semibold">🔍 Specific Question</div>
                      <div className="text-xs text-gray-600">Targeted answer • Varies</div>
                    </button>
                  </div>
                  <div className="text-xs text-blue-900 mt-2">💡 I'll remember your preference for next time.</div>
                </div>
              )}
              {messages.map((m, idx) => {
                const isLastAssistant = m.role === 'assistant' && idx === messages.length - 1 && !streamingMessage;
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    userName={getUserInitial()}
                    showActions={isLastAssistant}
                    collapseEnabled={isLastAssistant && lastRunMode === 'quick'}
                    collapseThresholdWords={150}
                    onTrackAccount={handleTrackAccount}
                    agentType="company_research"
                    onPromote={isLastAssistant ? () => {
                      // Find the user message that triggered this response
                      const userMessage = [...messages].slice(0, idx).reverse().find(msg => msg.role === 'user')?.content;

                      // Get any web search events from the thinking stream
                      const sources = thinkingEvents
                        .filter(ev => ev.type === 'web_search' && ev.query && ev.sources)
                        .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];

                      const draft = buildResearchDraft({
                        assistantMessage: m.content,
                        userMessage,
                        chatTitle: chats.find(c => c.id === currentChatId)?.title,
                        agentType: 'company_research',
                        sources,
                        activeSubject,
                      });

                      const normalizedDraft = (() => {
                        const active = activeSubject?.trim();
                        if (!active) return draft;
                        const current = (draft.subject || '').trim();
                        if (current && current.toLowerCase() === active.toLowerCase()) {
                          return draft;
                        }
                        return { ...draft, subject: active };
                      })();

                      setSaveDraft(normalizedDraft);
                      setSaveOpen(true);
                    } : undefined}
                    onSummarize={isLastAssistant ? async () => {
                      setPostSummarizeNudge(false);
                      try {
                        const cached = summaryCache[m.id];
                        if (cached) {
                          // Insert cached summary instantly
                          let savedAssistant: Message | null = null;
                          if (currentChatId) {
                            try {
                              const { data } = await supabase
                                .from('messages')
                                .insert({ chat_id: currentChatId, role: 'assistant', content: cached })
                                .select()
                                .single();
                              if (data) savedAssistant = data;
                            } catch {}
                          }
                          if (!savedAssistant) {
                            savedAssistant = { id: `summary-${Date.now()}`, role: 'assistant', content: cached, created_at: new Date().toISOString() } as Message;
                          }
                          setMessages(prev => [...prev, savedAssistant!]);
                        } else {
                          await startSummarize(currentChatId!, m.content);
                        }
                        void sendPreferenceSignal('length', { kind: 'categorical', choice: 'brief' }, { weight: 1.5 });
                        setPostSummarizeNudge(true);
                      } catch (e: any) {
                        addToast({ type: 'error', title: 'Summarize failed', description: e?.message || 'Please try again.' });
                      }
                    } : undefined}
                    onNextAction={isLastAssistant ? handleNextAction : undefined}
                    disablePromote={saving}
                    onRetry={isLastAssistant ? handleRetry : undefined}
                    usage={isLastAssistant ? lastUsage || undefined : undefined}
                  />
                );
              })}

              {thinkingEvents.length > 0 && (() => {
                const latestPlan = [...thinkingEvents].reverse().find(ev => ev.type === 'reasoning_progress');
                const latestReasoning = [...thinkingEvents].reverse().find(ev => ev.type === 'reasoning');
                const reasoningLine = (() => {
                  if (!latestReasoning || typeof latestReasoning.content !== 'string') return '';
                  const lines = latestReasoning.content.split(/\n+/).map(line => line.trim()).filter(Boolean);
                  return lines.length ? lines[lines.length - 1] : latestReasoning.content.trim();
                })();

                const renderReasoningSummary = () => {
                  if (!reasoningLine) return null;
                  if (!showInlineReasoning) {
                    return (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
                        <div className="text-blue-900">Thinking hidden</div>
                        <div className="flex items-center gap-3">
                          <button className="text-blue-700 hover:text-blue-900" onClick={() => persistInlineReasoning(true)}>Show thinking</button>
                          <button className="text-blue-700 hover:text-blue-900" onClick={() => setReasoningOpen(true)}>View all</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
                      <div className="text-blue-900 truncate pr-2">
                        <span className="font-semibold">Thinking:</span> {reasoningLine}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => persistInlineReasoning(false)}
                          className="text-blue-700 hover:text-blue-900"
                          aria-label="Hide reasoning"
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasoningOpen(true)}
                          className="text-blue-700 hover:text-blue-900"
                          aria-label="View full reasoning stream"
                        >
                          View all
                        </button>
                      </div>
                    </div>
                  );
                };

                if (!latestPlan && !reasoningLine) return null;

                return (
                  <div className="space-y-2">
                    {latestPlan && (
                      <ThinkingIndicator
                        key={latestPlan.id}
                        type="reasoning_progress"
                        content={latestPlan.content}
                      />
                    )}
                    {renderReasoningSummary()}
                  </div>
                );
              })()}

              {streamingMessage && (
                  <MessageBubble
                    role="assistant"
                    content={streamingMessage}
                    userName={getUserInitial()}
                    showActions={false}
                    streaming
                    agentType="company_research"
                  />
              )}

              {/* Next Actions bar after a completed assistant turn */}
              {actionBarVisible && !streamingMessage && lastAssistantMessage && (
                <section className="mt-6 mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Next actions</h3>
                    <div className="hidden sm:block text-xs text-gray-500">
                      Shortcuts:&nbsp;
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">N</kbd> new •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">C</kbd>{' '}
                      refresh •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">E</kbd>{' '}
                      email •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">R</kbd> refine
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      onClick={() => { void handleActionBarAction('new'); }}
                    >
                      ➕ New research
                    </button>
                    <button
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                        canRefreshResearch
                          ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400'
                          : 'bg-gray-300 text-gray-600 cursor-not-allowed focus:ring-gray-300'
                      }`}
                      onClick={() => { void handleActionBarAction('continue'); }}
                      disabled={!canRefreshResearch}
                    >
                      ↺ {refreshLabel}
                    </button>
                    <button
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                        draftEmailPending
                          ? 'bg-rose-500 text-white focus:ring-rose-400 cursor-wait'
                          : canDraftEmail
                            ? 'bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-400'
                            : 'bg-gray-300 text-gray-600 cursor-not-allowed focus:ring-gray-300'
                      }`}
                      onClick={() => { void handleActionBarAction('email'); }}
                      disabled={!canDraftEmail || draftEmailPending}
                      aria-busy={draftEmailPending}
                    >
                      {draftEmailPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          ✉️ Draft email
                        </>
                      )}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      onClick={() => { void handleActionBarAction('refine'); }}
                    >
                      🎯 Refine focus
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-gray-500 sm:hidden">
                    Shortcuts: N new • C refresh • E email • R refine
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={clarifiersLocked}
                      onChange={(e) => setClarifiersLocked(e.target.checked)}
                    />
                    <span title="Prevents the agent from asking profile/setup follow-up questions in this chat.">
                      Skip preference follow-ups this chat
                    </span>
                  </label>
                </section>
              )}

              {/* Post-summarize nudge: offer to persist summary or brevity preference */}
              {postSummarizeNudge && (
                <div className="mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-xs text-blue-900">
                    Prefer me to keep outputs shorter or always include a quick summary next time?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) throw new Error('Not authenticated');
                          await fetch('/api/update-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({ prompt_config: { always_tldr: true } })
                          });
                          void sendPreferenceSignal('tldr_trigger', { tokens: 0, choice: 'always' }, { weight: 1.2 });
                          addToast({ type: 'success', title: 'Preference saved', description: 'I\'ll include a quick summary by default.' });
                        } catch (e: any) {
                          addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Unable to save preference' });
                        } finally {
                          setPostSummarizeNudge(false);
                        }
                      }}
                    >
                      Always include summary
                    </button>
                    <button
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) throw new Error('Not authenticated');
                          await fetch('/api/update-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({ prompt_config: { default_output_brevity: 'short' } })
                          });
                          void sendPreferenceSignal('length', { kind: 'categorical', choice: 'brief' }, { weight: 2 });
                          addToast({ type: 'success', title: 'Preference saved', description: 'I\'ll keep outputs shorter by default.' });
                        } catch (e: any) {
                          addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Unable to save preference' });
                        } finally {
                          setPostSummarizeNudge(false);
                        }
                      }}
                    >
                      Prefer shorter outputs
                    </button>
                    <button
                      className="px-2 py-1 text-xs text-blue-900 hover:underline"
                      onClick={() => setPostSummarizeNudge(false)}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              )}

              {/* Refine scope modal (simple) */}
              {showRefine && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
                  <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-4">
                    <div className="font-semibold text-gray-900 mb-2">Refine scope</div>
                    <div className="text-xs text-gray-600 mb-2">Pick focus facets and timeframe for the next run.</div>
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      {['leadership','funding','tech stack','news','competitors','hiring'].map(f => (
                        <label key={f} className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={refineFacets.includes(f)} onChange={(e) => setRefineFacets(prev => e.target.checked ? Array.from(new Set([...prev, f])) : prev.filter(x => x!==f))} />
                          <span className="capitalize">{f}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-gray-700">Timeframe</label>
                      <select className="mt-1 w-full border border-gray-300 rounded-lg text-sm p-2" value={refineTimeframe} onChange={e => setRefineTimeframe(e.target.value)}>
                        {['last 3 months','last 6 months','last 12 months'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button className="px-3 py-1.5 text-sm text-gray-700" onClick={() => setShowRefine(false)}>Cancel</button>
                      <button className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg" onClick={async () => {
                        setShowRefine(false);
                        const target = activeSubject ? `Research ${activeSubject}` : 'Continue research';
                        const facets = refineFacets.join(', ') || 'leadership, funding, tech stack, news, competitors, hiring';
                        const cmd = `${target}. Focus on ${facets} within ${refineTimeframe}. Use web_search for recency. Do not return placeholders or 'None found' — if data is thin, synthesize from available context and add investigative next steps with at least 3 sources. Keep sections and provide an Executive Summary upfront.`;
                        if (!currentChatId) {
                          const id = await createNewChat();
                          if (id) await handleSendMessageWithChat(id, cmd);
                        } else {
                          await handleSendMessageWithChat(currentChatId, cmd);
                        }
                      }}>Apply</button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
        {/* Inline clarify choices: always visible near composer for clarity */}
        {showClarify && (
          <div className="px-6 py-2 border-t border-blue-200 bg-blue-50">
            <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-blue-900">Choose research type:</span>
              <button onClick={() => void chooseResearchType('deep')} className="text-xs px-2 py-1 rounded bg-white border border-blue-200 hover:border-blue-400">📊 Deep</button>
              <button onClick={() => void chooseResearchType('quick')} className="text-xs px-2 py-1 rounded bg-white border border-blue-200 hover:border-blue-400">⚡ Quick</button>
              <button onClick={() => void chooseResearchType('specific')} className="text-xs px-2 py-1 rounded bg-white border border-blue-200 hover:border-blue-400">🔍 Specific</button>
            </div>
          </div>
        )}
      <div className="bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {/* Context crumb (above composer) */}
          <div className="mb-2 flex items-center justify-between" data-testid="context-crumb">
            <div className="text-xs text-gray-700 inline-flex items-center gap-2">
              <div className="relative inline-flex">
                {showContextTooltip && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-lg">
                    Tip: Save contexts to jump between research threads.
                  </div>
                )}
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                  onClick={() => {
                    dismissContextTooltip();
                    setCrumbOpen(o => !o);
                  }}
                  aria-expanded={crumbOpen}
                >
                  Context: {formatDisplaySubject(activeSubject)} ▾
                </button>
              </div>
              {canUndoSubject() && (
                <button type="button" className="text-blue-700 hover:underline" onClick={handleUndoSubject}>Undo</button>
              )}
            </div>
            {/* Header metrics (right-aligned) */}
            <div className="text-xs text-gray-600 hidden sm:flex items-center gap-2" data-testid="header-metrics">
              {accountStats && (
                <>
                  <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">📊 {accountStats.total} tracked</span>
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded">🔥 {accountStats.hot} hot</span>
                  <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded">⚡ {accountStats.with_signals} with signals</span>
                </>
              )}
              {/* Research mode selector (persists preference) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModeMenuOpen(v => !v)}
                  className="ml-2 inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-50"
                  aria-expanded={modeMenuOpen}
                  title="Preferred research mode"
                >
                  <span className="text-gray-700">Mode:</span>
                  <span className="font-semibold text-gray-900">
                    {preferredResearchType ? (preferredResearchType === 'deep' ? 'Deep' : preferredResearchType === 'quick' ? 'Quick' : 'Specific') : 'Auto'}
                  </span>
                  ▾
                </button>
                {modeMenuOpen && (
                  <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    {([
                      { id: 'deep', label: 'Deep' },
                      { id: 'quick', label: 'Quick' },
                      { id: 'specific', label: 'Specific' },
                      { id: 'auto', label: 'Auto (ask/decide)' },
                    ] as Array<{id: 'deep'|'quick'|'specific'|'auto', label: string}>).map(opt => (
                      <button
                        key={opt.id}
                        className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 ${
                          (preferredResearchType || 'auto') === opt.id ? 'font-semibold text-gray-900' : 'text-gray-700'
                        }`}
                        onClick={async () => {
                          setModeMenuOpen(false);
                          if (opt.id === 'auto') {
                            try {
                              localStorage.removeItem('preferred_research_type');
                            } catch {}
                            setPreferredResearchType(null);
                            addToast({ type: 'success', title: 'Mode set to Auto', description: 'I will clarify or infer per request.' });
                            return;
                          }
                          await persistPreference(opt.id);
                          addToast({ type: 'success', title: `Mode set to ${opt.label}` });
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {crumbOpen && (
              <div className="absolute z-30 mt-10 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg p-3" data-testid="context-crumb-open">
                <div className="text-xs text-gray-600 mb-2">Switch to new subject (company/person)</div>
                <input
                  value={switchInput}
                  onChange={(e) => setSwitchInput(e.target.value)}
                  placeholder="e.g., Clari or Andy Byrne"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  data-testid="context-crumb-input"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="px-2.5 py-1.5 text-xs text-gray-700" onClick={() => setCrumbOpen(false)}>Cancel</button>
                  <button className="px-2.5 py-1.5 text-xs text-white bg-blue-600 rounded" onClick={handleSwitchSubject}>Apply</button>
                  {activeSubject && (
                    <button className="px-2.5 py-1.5 text-xs text-gray-700" onClick={() => { lastSubjectRef.current = { prev: activeSubject, at: Date.now() }; setActiveSubject(null); setCrumbOpen(false); }}>Clear</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            disabled={loading}
            isStreaming={loading}
            onStop={handleStopStreaming}
            onAttach={() => setCSVUploadOpen(true)}
            // Use a single clear CTA above for bulk research; keep Settings action to open dialog if needed
            onSettings={() => setBulkResearchOpen(true)}
            selectedAgent="Company Researcher"
            focusSignal={focusComposerTick}
          />
          {/* Empty-state panel */}
          {messages.length === 0 && !streamingMessage && (
            <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-white" data-testid="empty-state-tasks">
              <div className="text-xs text-gray-600 mb-2">Start with:</div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={() => { setInputValue('Research '); setFocusComposerTick(t=>t+1); }}>Research a company</button>
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={() => setBulkResearchOpen(true)}>Upload list</button>
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={handleAddAccount}>Track account</button>
              </div>
            </div>
          )}
        </div>
      </div>
  </div>
  </div>
  {/* Command palette */}
  {paletteOpen && (
      <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center p-6" onClick={() => setPaletteOpen(false)}>
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl p-3" onClick={e => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-900 mb-2">Quick actions</div>
          <div className="flex flex-col gap-2" data-testid="command-palette">
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); setInputValue('Research '); setFocusComposerTick(t=>t+1); }}>Research a company</button>
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); setBulkResearchOpen(true); }}>Upload list (Bulk research)</button>
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); handleAddAccount(); }}>Track account</button>
            <button
              className="text-left px-3 py-2 rounded text-gray-400 bg-gray-50 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Lead list generator (coming soon)
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">Press Esc to close</div>
        </div>
      </div>
    )}
    <SaveResearchDialog
      open={saveOpen}
      initialDraft={saveDraft}
      onClose={() => setSaveOpen(false)}
      onSave={handleSaveResearch}
      saving={saving}
      error={saveError}
      usage={lastUsage || undefined}
      activeSubject={activeSubject}
    />
    <CSVUploadDialog
      isOpen={csvUploadOpen}
      onClose={() => setCSVUploadOpen(false)}
      onSuccess={handleCSVUploadSuccess}
    />

    {/* Optimize ICP modal (for inline scorecard link) */}
    <OptimizeICPModal isOpen={optimizeOpen} onClose={() => setOptimizeOpen(false)} />

    {reasoningOpen && (
      <div
        className="fixed inset-0 z-40 bg-black/30 flex items-start justify-end"
        onClick={() => setReasoningOpen(false)}
      >
        <div
          className="w-full max-w-xl h-full bg-white border-l border-gray-200 shadow-2xl p-4 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Reasoning stream"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900">Reasoning Stream</div>
            <button
              className="text-xs text-gray-600 hover:text-gray-900"
              onClick={() => setReasoningOpen(false)}
              aria-label="Close reasoning stream"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {thinkingEvents.map(ev => (
              <ThinkingIndicator
                key={ev.id}
                type={ev.type}
                content={ev.content}
                query={ev.query}
                sources={ev.sources}
                url={(ev as any).url}
                count={(ev as any).count}
                companies={(ev as any).companies}
                company={(ev as any).company}
                icp={(ev as any).icp}
                critical={(ev as any).critical}
                important={(ev as any).important}
              />
            ))}
          </div>
        </div>
      </div>
    )}
    <AccountSignalsDrawer
      open={signalsDrawerOpen}
      accountId={signalsAccountId}
      companyName={signalsCompanyName}
      onClose={() => setSignalsDrawerOpen(false)}
      onResearch={(company) => { setSignalsDrawerOpen(false); setInputValue(`Research ${company}`); setTimeout(() => void handleSendMessage(), 50); }}
    />
    <BulkResearchDialog
      isOpen={bulkResearchOpen}
      onClose={() => setBulkResearchOpen(false)}
      onSuccess={(_jobId, count) => {
        addToast({
          type: 'success',
          title: 'Bulk research started',
          description: `Research queued for ${count} companies. Check progress below.`,
        });
      }}
    />
    </>
  );
}
