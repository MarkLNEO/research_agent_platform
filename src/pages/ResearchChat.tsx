import { useEffect, useMemo, useRef, useState } from 'react';
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
import { SubjectMismatchModal } from '../components/SubjectMismatchModal';
import { BulkResearchDialog } from '../components/BulkResearchDialog';
import { BulkResearchStatus } from '../components/BulkResearchStatus';
import { ProfileCompletenessBanner } from '../components/ProfileCompletenessBanner';
import { AccountSignalsDrawer } from '../components/AccountSignalsDrawer';
import { listRecentSignals, type AccountSignalSummary } from '../services/signalService';
import { fetchDashboardGreeting } from '../services/accountService';
import { useToast } from '../components/ToastProvider';
import { buildResearchDraft } from '../utils/researchOutput';
import type { ResearchDraft } from '../utils/researchOutput';
import type { TrackedAccount } from '../services/accountService';
import { useUserProfile } from '../hooks/useUserProfile';

const ALL_REFINE_FACETS = ['leadership', 'funding', 'tech stack', 'news', 'competitors', 'hiring'] as const;

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

const isResearchPrompt = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.startsWith('research ') ||
    lower.includes(' research ') ||
    lower.startsWith('tell me about') ||
    lower.startsWith('analyze ') ||
    lower.startsWith('find ') ||
    lower.startsWith('who is ') ||
    lower.startsWith('what is ')
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
  const streamingAbortRef = useRef<AbortController | null>(null);
  // acknowledgment messages are displayed via ThinkingIndicator events
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const autoSentRef = useRef(false);
  const [showClarify, setShowClarify] = useState(false);
  const [focusComposerTick, setFocusComposerTick] = useState(0);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [preferredResearchType, setPreferredResearchType] = useState<'deep' | 'quick' | 'specific' | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<ResearchDraft | null>(null);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchDraft, setMismatchDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ tokens: number; credits: number } | null>(null);
  const [csvUploadOpen, setCSVUploadOpen] = useState(false);
  const [bulkResearchOpen, setBulkResearchOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const assistantInsertedRef = useRef(false);
  const [signalsDrawerOpen, setSignalsDrawerOpen] = useState(false);
  const [signalsAccountId, setSignalsAccountId] = useState<string | null>(null);
  const [signalsCompanyName, setSignalsCompanyName] = useState<string | undefined>(undefined);
  const [recentSignals, setRecentSignals] = useState<AccountSignalSummary[]>([]);
  const [greeting, setGreeting] = useState<{ time_of_day: string; user_name: string } | null>(null);
  const [accountStats, setAccountStats] = useState<{ total: number; hot: number; warm: number; stale: number; with_signals: number } | null>(null);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);
  const [postSummarizeNudge, setPostSummarizeNudge] = useState(false);
  const [clarifiersLocked, setClarifiersLocked] = useState(false);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineFacets, setRefineFacets] = useState<string[]>([]);
  const [refineTimeframe, setRefineTimeframe] = useState<string>('last 12 months');
  const [crumbOpen, setCrumbOpen] = useState(false);
  const [switchInput, setSwitchInput] = useState('');
  const lastSubjectRef = useRef<{ prev: string | null; at: number | null }>({ prev: null, at: null });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lastRunMode, setLastRunMode] = useState<'deep'|'quick'|'specific'|'auto'|null>(null);
  const skipInitialLoadRef = useRef(false);
  const { profile: userProfile } = useUserProfile();
  const [customCriteria, setCustomCriteria] = useState<any[]>([]);
  const [signalPreferences, setSignalPreferences] = useState<any[]>([]);
  const [creatingNewChat, setCreatingNewChat] = useState(false);
  const [showContextTooltip, setShowContextTooltip] = useState(false);
  const suggestions = useMemo(
    () => generateSuggestions(userProfile, customCriteria, signalPreferences),
    [userProfile, customCriteria, signalPreferences]
  );
  const dismissContextTooltip = () => {
    setShowContextTooltip(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('contextTooltipSeen', 'true');
    }
  };

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantMessage = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;

  useEffect(() => {
    if (user) void loadChats();
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchPreferences = async () => {
      try {
        const { data: criteria } = await supabase
          .from('user_custom_criteria')
          .select('id,name,importance')
          .eq('user_id', user.id)
          .order('importance', { ascending: true });
        if (criteria) setCustomCriteria(criteria as any[]);

        const { data: signals } = await supabase
          .from('user_signal_preferences')
          .select('id, signal_type, importance')
          .eq('user_id', user.id);
        if (signals) setSignalPreferences(signals as any[]);
      } catch (error) {
        console.error('Failed to load user preferences', error);
      }
    };
    void fetchPreferences();
  }, [user?.id]);

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

  // Load greeting + signals for proactive dashboard
  useEffect(() => {
    const load = async () => {
      try {
        try {
          const data = await fetchDashboardGreeting();
          if (data?.greeting) setGreeting(data.greeting as any);
          if (Array.isArray(data?.signals)) setRecentSignals(data.signals as any);
          if (data?.account_stats) setAccountStats(data.account_stats as any);
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

      if (existingAccount) {
        addToast({
          title: 'Account already tracked',
          description: `${companyName} is already in your tracked accounts`,
          type: 'info',
        });
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
      const { data: inserted, error } = await supabase.from('research_outputs').insert({
        user_id: user.id,
        subject: draft.subject,
        research_type: draft.research_type,
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
      }).select('id').single();
      if (error) throw error;
      // Evaluate custom criteria post-save
      try {
        const auth = (await supabase.auth.getSession()).data.session?.access_token;
        await fetch('/api/research/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` },
          body: JSON.stringify({ research_id: inserted?.id, markdown: draft.markdown_report })
        });
      } catch (e) {
        console.warn('Criteria evaluation failed', e);
      }
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

  const createNewChat = async () => {
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
      return data.id;
    }
    return null;
  };

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

  const handleSendMessageWithChat = async (chatId: string, text: string) => {
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
    assistantInsertedRef.current = false;

    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: normalized,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);

    const detectedCompany = extractCompanyNameFromQuery(normalized);
    if (detectedCompany) setActiveSubject(detectedCompany);

    const looksLikeResearch = isResearchPrompt(normalized);
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

      let assistant = await streamAIResponse(text, chatId);

      // Normalize markdown for numbering and headings
      try {
        const { normalizeMarkdown } = await import('../utils/markdown');
        assistant = normalizeMarkdown(assistant);
      } catch {}

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
    } finally {
      setLoading(false);
      try { localStorage.removeItem('last_research_message'); } catch {}
    }
  };

  const needsClarification = (text: string) => {
    const t = text.toLowerCase();
    return t.includes('research') || t.includes('tell me about') || t.includes('analyze') || t.includes('find out about');
  };

  const startSuggestion = (prompt: string) => {
    if (!prompt) return;
    setInputValue(prompt);
    setShowClarify(false);
    setFocusComposerTick(t => t + 1);
  };

  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content) return;

    // If no preference yet and looks like a research task, ask for clarification
    if (!preferredResearchType && needsClarification(content)) {
      setPendingQuery(content);
      setShowClarify(true);
      return;
    }

    setInputValue('');
    if (!currentChatId) {
      const id = await createNewChat();
      if (id) await handleSendMessageWithChat(id, content);
      return;
    }
    await handleSendMessageWithChat(currentChatId, content);
  };

  const persistPreference = async (type: 'deep' | 'quick' | 'specific') => {
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
      localStorage.setItem('preferred_research_type', type);
      setPreferredResearchType(type);
    } catch (err) {
      console.error('Failed to persist preference:', err);
    }
  };

  const chooseResearchType = async (type: 'deep' | 'quick' | 'specific') => {
    await persistPreference(type);
    setShowClarify(false);
    const content = pendingQuery || inputValue.trim();
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

  const streamAIResponse = async (userMessage: string, chatId?: string): Promise<string> => {
    try {
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const looksLikeResearch = isResearchPrompt(userMessage);
      const referencesActive = activeSubject
        ? userMessage.toLowerCase().includes(activeSubject.toLowerCase())
        : false;
      const enrichedMessage =
        activeSubject && !looksLikeResearch && !referencesActive
          ? `${userMessage}\n\n[Context: The company in focus is ${activeSubject}.]`
          : userMessage;

      history.push({ role: 'user', content: enrichedMessage });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

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
      const depth = preferredResearchType || (needsClarification(userMessage) ? null : 'specific');
      setLastRunMode((depth as any) || 'auto');
      const cfg: any = {};
      if (depth === 'deep') cfg.model = 'gpt-5';
      if (depth === 'quick') cfg.model = 'gpt-5-mini';
      if (depth === 'specific') cfg.model = 'gpt-5';
      cfg.clarifiers_locked = clarifiersLocked;
      cfg.facet_budget = depth === 'quick' ? 3 : depth === 'deep' ? 8 : 6;

      // Setup abort controller for Stop action
      const controller = new AbortController();
      streamingAbortRef.current = controller;

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: history,
          stream: true,
          chatId: chatId ?? currentChatId,
          config: cfg,
          research_type: depth,
          active_subject: activeSubject || null
        }),
        signal: controller.signal,
      });
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
              'Authorization': `Bearer ${session.access_token}`,
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
      let full = '';
      let buffer = '';
      let usedTokens: number | null = null;
      let firstDeltaAt: number | null = null;
      const markFirstDelta = () => {
        if (firstDeltaAt == null) {
          firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          setThinkingEvents(prev => prev.filter(e => e.type !== 'acknowledgment' && e.type !== 'reasoning_progress' && e.type !== 'context_preview'));
          try {
            window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'research', ttfbMs: firstDeltaAt - startedAt } }));
            console.log('[LLM][research] first-delta', { ttfbMs: firstDeltaAt - startedAt });
          } catch {}
        }
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
                    full += delta;
                    setStreamingMessage(full);
                  }
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
        if (m && m[1]) {
          setActiveSubject(m[1].trim());
        } else if (lastAssistantMessage?.content || full) {
          const text = (lastAssistantMessage?.content || full || '').slice(0, 800);
          const patterns = [
            /researching\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /found about\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /analysis of\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /^#\s+([^\n]+)/m,
          ];
          for (const p of patterns) {
            const mm = text.match(p);
            if (mm && mm[1] && mm[1].trim().length >= 2) { setActiveSubject(mm[1].trim()); break; }
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
      return full;
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

  // Next Actions helpers
  const handleStartNewCompany = () => {
    setActiveSubject(null);
    setInputValue('Research ');
    setShowClarify(false);
    setFocusComposerTick(t => t + 1);
  };
  const handleContinueCompany = () => {
    if (activeSubject) {
      setInputValue(`Continue research on ${activeSubject}`);
    } else {
      setInputValue('Research ');
    }
    setFocusComposerTick(t => t + 1);
  };
  const handleSummarizeLast = async () => {
    if (!currentChatId) return;
    await handleSendMessageWithChat(currentChatId, 'Summarize the above into a one-line headline (<=140 chars) and a TL;DR with 5–8 bullets. No web research.');
  };
  const handleEmailDraftFromLast = async () => {
    try {
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAssistant) return addToast({ type: 'error', title: 'No content to draft', description: 'Send a research query first.' });
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token;
      const resp = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: JSON.stringify({ research_markdown: lastAssistant.content, company: activeSubject || undefined })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Draft failed');
      await navigator.clipboard.writeText(json.email || '');
      addToast({ type: 'success', title: 'Draft email copied' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to draft email', description: e?.message || String(e) });
    }
  };

  const handleOpenRefine = () => {
    setRefineFacets(prev => (prev.length ? prev : Array.from(ALL_REFINE_FACETS)));
    setShowRefine(true);
  };

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

  // Open Save dialog for the latest assistant message (also used by Next Actions bar)
  const openSaveForLastAssistant = () => {
    const idx = [...messages].reduce((last, m, i) => (m.role === 'assistant' ? i : last), -1);
    if (idx === -1) return;
    const m = messages[idx];
    const userMessage = [...messages].slice(0, idx).reverse().find(msg => msg.role === 'user')?.content;
    const sources = thinkingEvents
      .filter(ev => ev.type === 'web_search' && ev.query && ev.sources)
      .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];
    const draft = buildResearchDraft({
      assistantMessage: m.content,
      userMessage,
      chatTitle: chats.find(c => c.id === currentChatId)?.title,
      agentType: 'company_research',
      sources,
    });
    const subj = (draft.subject || '').trim();
    const active = (activeSubject || '').trim();
    const isMismatch = Boolean(active && subj && active.toLowerCase() !== subj.toLowerCase());
    if (isMismatch) {
      setMismatchDraft(draft);
      setMismatchOpen(true);
      return;
    }
    setSaveDraft(draft);
    setSaveOpen(true);
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
        <div className="flex-1 overflow-y-auto" data-testid="chat-surface">
          <div className="max-w-3xl mx-auto px-6 py-8">
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
                  {userProfile && (
                    <div className="border border-blue-200 rounded-2xl p-4 bg-white shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="text-sm font-semibold text-blue-900 mb-1">Using your saved profile</div>
                          <p className="text-xs text-gray-600">
                            ICP focus: <span className="font-medium text-gray-900">{userProfile.icp_definition || userProfile.icp || 'Not specified yet'}</span>
                          </p>
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
                        {suggestions.length > 0 && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {suggestions.map((suggestion, index) => (
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
                            <div className="mt-2 flex items-center gap-2">
                              <button className="text-xs text-blue-600 hover:text-blue-700" onClick={() => { setSignalsAccountId(s.account_id); setSignalsCompanyName(s.company_name); setSignalsDrawerOpen(true); }}>Review</button>
                              <button
                                className="text-xs text-gray-700 hover:text-gray-900"
                                onClick={() => { setInputValue(`Research ${s.company_name}`); setTimeout(() => void handleSendMessage(), 50); }}
                              >
                                Research
                              </button>
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
                      });

                      // Proactive subject mismatch handling (before Save dialog)
                      const subj = (draft.subject || '').trim();
                      const active = (activeSubject || '').trim();
                      const isMismatch = Boolean(active && subj && active.toLowerCase() !== subj.toLowerCase());
                      if (isMismatch) {
                        setMismatchDraft(draft);
                        setMismatchOpen(true);
                        return;
                      }

                      setSaveDraft(draft);
                      setSaveOpen(true);
                    } : undefined}
                    onSummarize={isLastAssistant ? async () => {
                      setPostSummarizeNudge(false);
                      await handleSendMessageWithChat(currentChatId!, 'Summarize the above into a TL;DR (1–2 sentences) followed by 5–8 decision-relevant bullets. Do not ask for inputs. No web research.');
                      setPostSummarizeNudge(true);
                    } : undefined}
                    disablePromote={saving}
                    onRetry={isLastAssistant ? handleRetry : undefined}
                    usage={isLastAssistant ? lastUsage || undefined : undefined}
                  />
                );
              })}

              {thinkingEvents.length > 0 && (
                <div className="space-y-2">
                  {thinkingEvents.map(ev => (
                    <ThinkingIndicator
                      key={ev.id}
                      type={ev.type}
                      content={ev.content}
                      query={ev.query}
                      sources={ev.sources}
                      url={ev.url}
                      count={ev.count}
                      companies={ev.companies}
                      company={ev.company}
                      icp={ev.icp}
                      critical={ev.critical}
                      important={ev.important}
                    />
                  ))}
                </div>
              )}

              {streamingMessage && (
                <MessageBubble role="assistant" content={streamingMessage} userName={getUserInitial()} showActions={false} />
              )}

              {/* Next Actions bar after a completed assistant turn */}
              {!streamingMessage && lastAssistantMessage && (
                <div className="mt-3 flex flex-wrap items-center gap-2 p-3 border border-gray-200 rounded-xl bg-white shadow-sm">
                  <span className="text-xs text-gray-600 mr-2 font-semibold uppercase tracking-wide">Next actions</span>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" onClick={handleStartNewCompany}>
                    + Start new company
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" onClick={handleContinueCompany}>
                    ↺ Continue {activeSubject ? activeSubject : 'current company'}
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" onClick={async () => { await handleSummarizeLast(); }}>
                    📝 Summarize
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" onClick={handleEmailDraftFromLast}>
                    ✉️ Draft email
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" aria-label="Save to Research" onClick={openSaveForLastAssistant}>
                    💾 Save to Research
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-800 rounded-lg hover:border-gray-300 hover:bg-gray-50" onClick={handleOpenRefine}>
                    🎯 Refine focus
                  </button>
                  <label className="ml-auto text-xs text-gray-500 inline-flex items-center gap-1">
                    <input type="checkbox" checked={clarifiersLocked} onChange={(e) => setClarifiersLocked(e.target.checked)} />
                    No more setup questions this chat
                  </label>
                </div>
              )}

              {/* Post-summarize nudge: offer to persist TL;DR or brevity preference */}
              {postSummarizeNudge && (
                <div className="mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-xs text-blue-900">
                    Prefer me to keep outputs shorter or always include a TL;DR next time?
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
                          addToast({ type: 'success', title: 'Preference saved', description: 'I\'ll include a TL;DR by default.' });
                        } catch (e: any) {
                          addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Unable to save preference' });
                        } finally {
                          setPostSummarizeNudge(false);
                        }
                      }}
                    >
                      Always include TL;DR
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
                        const cmd = `${target}. Focus on ${refineFacets.join(', ') || 'top facets'} within ${refineTimeframe}.`;
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
                  Context: {activeSubject ? activeSubject : 'None'} ▾
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
            isStreaming={Boolean(streamingMessage)}
            onStop={handleStopStreaming}
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
    <SubjectMismatchModal
      open={mismatchOpen}
      draftSubject={mismatchDraft?.subject || ''}
      activeSubject={activeSubject}
      markdown={mismatchDraft?.markdown_report || ''}
      onClose={() => setMismatchOpen(false)}
      onChoose={(choice) => {
        if (!mismatchDraft) return;
        if (choice.mode === 'use_draft') {
          setMismatchOpen(false);
          setSaveDraft({ ...mismatchDraft });
          setSaveOpen(true);
          return;
        }
        if (choice.mode === 'use_active' && activeSubject) {
          setMismatchOpen(false);
          setSaveDraft({ ...mismatchDraft, subject: activeSubject });
          setSaveOpen(true);
          return;
        }
        // proceed = open editor unchanged
        setMismatchOpen(false);
        setSaveDraft(mismatchDraft);
        setSaveOpen(true);
      }}
      onSplit={async () => {
        if (!mismatchDraft) return;
        try {
          await handleSaveResearch(mismatchDraft);
          if (activeSubject && activeSubject.trim().toLowerCase() !== (mismatchDraft.subject || '').trim().toLowerCase()) {
            await handleSaveResearch({ ...mismatchDraft, subject: activeSubject });
          }
          setMismatchOpen(false);
          addToast({ type: 'success', title: 'Saved two drafts', description: 'Both subjects saved as separate entries.' });
        } catch (e: any) {
          addToast({ type: 'error', title: 'Split save failed', description: e?.message || 'Try saving manually from the editor.' });
        }
      }}
    />
    <CSVUploadDialog
      isOpen={csvUploadOpen}
      onClose={() => setCSVUploadOpen(false)}
      onSuccess={handleCSVUploadSuccess}
    />
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
