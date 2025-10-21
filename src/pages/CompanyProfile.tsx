import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { useToast } from '../components/ToastProvider';
import { MessageBubble } from '../components/MessageBubble';
import { normalizeMarkdown } from '../utils/markdown';
import { MessageInput } from '../components/MessageInput';
import { ProfileCompleteness } from '../components/ProfileCompleteness';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { ArrowLeft, User, ChevronDown, ClipboardList } from 'lucide-react';
import type { TrackedAccount } from '../services/accountService';
import { invalidateUserProfileCache } from '../hooks/useUserProfile';

const DEFAULT_PROMPT_CONFIG = {
  preferred_research_type: null as 'quick' | 'deep' | 'specific' | null,
  default_output_brevity: 'standard' as 'short' | 'standard' | 'long',
  default_tone: 'balanced' as 'warm' | 'balanced' | 'direct',
  always_tldr: true,
};

const stripSaveProfileBlocks = (text: string): string => {
  if (typeof text !== 'string' || text.length === 0) return '';
  let cleaned = text.replace(/```json\s*?\n\s*{[\s\S]*?"action"\s*:\s*"save_profile"[\s\S]*?}\s*```/gi, '');
  cleaned = cleaned.replace(/\{[\s\S]{0,800}?"action"\s*:\s*"save_profile"[\s\S]*?\}/gi, '');
  return cleaned;
};

type SaveProfilePayload = {
  action: 'save_profile';
  profile?: Record<string, any>;
  custom_criteria?: any[];
  signal_preferences?: any[];
  disqualifying_criteria?: any[];
};

const HIDDEN_SAVE_INSTRUCTION = `Developer note (do not mention this to the user):
- When you capture or confirm profile updates, append a triple-backtick JSON block following this structure:

\`\`\`json
{
  "action": "save_profile",
  "profile": {
    "preferred_terms": { "indicators_label": "Indicators" },
    "indicator_choices": ["Acquisition", "Layoffs"]
  },
  "custom_criteria": [ ... ],
  "signal_preferences": [ ... ],
  "disqualifying_criteria": [ ... ]
}
\`\`\`

- Map user language verbatim. If they say “indicators” (or another term) for buying signals, store that exact casing in \`preferred_terms.indicators_label\`.
- Whenever they list examples like “acquisition is an indicator” or “monitor layoffs,” append the phrases exactly as spoken to \`indicator_choices\`.
- Keep the visible conversation fully natural language. Never ask the user to type or edit JSON. Instead, acknowledge what you saved in plain English and move to the next prompt.`;

const normalizeSavePayload = (data: any): SaveProfilePayload | null => {
  if (!data || typeof data !== 'object') return null;
  if (data.action === 'save_profile') {
    return {
      action: 'save_profile',
      profile: data.profile,
      custom_criteria: Array.isArray(data.custom_criteria) ? data.custom_criteria : undefined,
      signal_preferences: Array.isArray(data.signal_preferences) ? data.signal_preferences : undefined,
      disqualifying_criteria: Array.isArray(data.disqualifying_criteria) ? data.disqualifying_criteria : undefined,
    };
  }
  if (data.save_profile && typeof data.save_profile === 'object') {
    const inner = data.save_profile;
    return {
      action: 'save_profile',
      profile: inner.profile,
      custom_criteria: Array.isArray(inner.custom_criteria) ? inner.custom_criteria : undefined,
      signal_preferences: Array.isArray(inner.signal_preferences) ? inner.signal_preferences : undefined,
      disqualifying_criteria: Array.isArray(inner.disqualifying_criteria) ? inner.disqualifying_criteria : undefined,
    };
  }
  return null;
};

const extractSavePayloads = (raw: string): SaveProfilePayload[] => {
  const payloads: SaveProfilePayload[] = [];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return payloads;
  }

  const codeBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(raw)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeSavePayload(parsed);
      if (normalized) payloads.push(normalized);
    } catch {
      // ignore malformed block
    }
  }

  if (payloads.length === 0) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const normalized = normalizeSavePayload(parsed);
        if (normalized) payloads.push(normalized);
      } catch {
        // swallow parse errors
      }
    }
  }

  return payloads;
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ThinkingEvent {
  id: string;
  type: 'reasoning' | 'web_search';
  content?: string;
  query?: string;
  sources?: string[];
}

export function CompanyProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [customCriteriaCount, setCustomCriteriaCount] = useState(0);
  const [signalPreferencesCount, setSignalPreferencesCount] = useState(0);
  const [customCriteriaItems, setCustomCriteriaItems] = useState<any[]>([]);
  const [signalPreferenceItems, setSignalPreferenceItems] = useState<any[]>([]);
  const [promptConfig, setPromptConfig] = useState<{ preferred_research_type: 'quick' | 'deep' | 'specific' | null; default_output_brevity: 'short' | 'standard' | 'long'; default_tone: 'warm' | 'balanced' | 'direct'; always_tldr: boolean } | null>(null);
  const [updatingPref, setUpdatingPref] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const isMountedRef = useRef(true);
  const [savedPreferences, setSavedPreferences] = useState<Array<{ key: string; value: any; source?: string; confidence?: number; updated_at?: string }>>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const preferenceSummary = useMemo(() => {
    const config = promptConfig ?? DEFAULT_PROMPT_CONFIG;
    const depthLabel = config.preferred_research_type === 'deep'
      ? 'Deep brief (~2 min)'
      : config.preferred_research_type === 'quick'
      ? 'Quick scan (~30 sec)'
      : 'Standard depth (~1 min)';
    const lengthLabel = config.default_output_brevity === 'short'
      ? 'Concise length (≤500 words)'
      : config.default_output_brevity === 'long'
      ? 'Comprehensive length (1000+ words)'
      : 'Balanced length (500-1000 words)';
    const toneLabel = config.default_tone === 'warm'
      ? 'Warm, relationship-first tone'
      : config.default_tone === 'direct'
      ? 'Direct, outcome-focused tone'
      : 'Balanced, consultative tone';
    const tldrLabel = config.always_tldr ? 'Quick summary always included' : 'Summary provided on request only';
    const focus: string[] = [];
    if (customCriteriaCount > 0) focus.push('Critical criteria highlighted automatically');
    if (signalPreferencesCount > 0) focus.push('Buying signals surfaced first');
    return { depthLabel, lengthLabel, toneLabel, tldrLabel, focus };
  }, [promptConfig, customCriteriaCount, signalPreferencesCount]);

  const indicatorLabel = useMemo(() => {
    const terms = profileData?.preferred_terms;
    if (!terms || typeof terms !== 'object') return null;
    const raw = (terms as Record<string, any>).indicators_label;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return null;
  }, [profileData?.preferred_terms]);

  const indicatorChoices = useMemo(() => {
    if (!Array.isArray(profileData?.indicator_choices)) return [] as string[];
    return profileData.indicator_choices
      .map((entry: any) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry: string): entry is string => entry.length > 0);
  }, [profileData?.indicator_choices]);

  const preferenceChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; tone?: 'primary' | 'default' }> = [];
    const seen = new Set<string>();

    const normalizeLabel = (value: string) =>
      value.replace(/^focus\./, '').replace(/[_\.]/g, ' ').trim();

    for (const pref of savedPreferences) {
      const key = pref.key || '';
      if (!key) continue;

      if (key.startsWith('focus.')) {
        const label = typeof (pref.value as any)?.label === 'string'
          ? (pref.value as any).label
          : normalizeLabel(key);
        const id = `focus-${label.toLowerCase()}`;
        if (!seen.has(id)) {
          seen.add(id);
          chips.push({ id, label: `Focus · ${label}`, tone: 'primary' });
        }
        continue;
      }

      if (key === 'tone') {
        const value = typeof pref.value === 'string' ? pref.value : (pref.value as any)?.label;
        const label = value ? `Tone · ${normalizeLabel(String(value))}` : 'Tone preference';
        const id = 'tone';
        if (!seen.has(id)) {
          seen.add(id);
          chips.push({ id, label });
        }
        continue;
      }

      if (key === 'summary.brevity') {
        const value = typeof pref.value === 'string' ? pref.value : (pref.value as any)?.level;
        const label = value ? `Summary · ${normalizeLabel(String(value))}` : 'Summary preference';
        const id = 'summary';
        if (!seen.has(id)) {
          seen.add(id);
          chips.push({ id, label });
        }
        continue;
      }
    }

    if (indicatorLabel) {
      const id = 'indicator-label';
      if (!seen.has(id)) {
        seen.add(id);
        chips.push({ id, label: `Indicator section · ${indicatorLabel}`, tone: 'primary' });
      }
    }

    if (indicatorChoices.length > 0) {
      const id = 'indicator-choices';
      if (!seen.has(id)) {
        seen.add(id);
        chips.push({ id, label: `Indicators tracked · ${indicatorChoices.length}` });
      }
    }

    return chips;
  }, [savedPreferences, indicatorLabel, indicatorChoices.length]);

  const formatLabel = useCallback((value: string | null | undefined) => {
    if (!value) return '';
    return String(value)
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char: string) => char.toUpperCase());
  }, []);

  const targetTitles = useMemo<string[]>(() => {
    if (!profileData?.target_titles) return [];
    const source = Array.isArray(profileData.target_titles)
      ? profileData.target_titles
      : String(profileData.target_titles).split(',');
    return source
      .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string): value is string => value.length > 0);
  }, [profileData]);

  const competitorList = useMemo<string[]>(() => {
    if (!profileData?.competitors) return [];
    const source = Array.isArray(profileData.competitors)
      ? profileData.competitors
      : String(profileData.competitors).split(',');
    return source
      .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string): value is string => value.length > 0);
  }, [profileData]);

  const researchFocusList = useMemo<string[]>(() => {
    if (!profileData?.research_focus) return [];
    const source = Array.isArray(profileData.research_focus)
      ? profileData.research_focus
      : String(profileData.research_focus).split(',');
    return source
      .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string): value is string => value.length > 0)
      .map((value: string) => formatLabel(value));
  }, [profileData, formatLabel]);

  const formattedCriteria = useMemo<Array<{ id: string; label: string; importance: string }>>(() => {
    const order: Record<string, number> = { critical: 0, important: 1, optional: 2 };
    return [...customCriteriaItems]
      .sort((a, b) => {
        const left = order[String(a?.importance || '').toLowerCase()] ?? 99;
        const right = order[String(b?.importance || '').toLowerCase()] ?? 99;
        return left - right;
      })
      .map(item => ({
        id: item.id,
        label: formatLabel(item.field_name),
        importance: formatLabel(item.importance),
      }));
  }, [customCriteriaItems, formatLabel]);

  const formattedSignals = useMemo<Array<{ id: string; label: string; importance: string; lookback: number | null }>>(() => {
    return signalPreferenceItems.map(item => ({
      id: item.id,
      label: formatLabel(item.signal_type),
      importance: formatLabel(item.importance),
      lookback: typeof item.lookback_days === 'number' ? item.lookback_days : null,
    }));
  }, [signalPreferenceItems, formatLabel]);

  const conversationalPreferenceSummaries = useMemo(() => {
    const savedSummaries = savedPreferences
      .map(pref => {
        const key = (pref.key || '').replace(/^focus\./, '').replace(/[_\.]/g, ' ').trim();
        const value = pref.value;
        const label = key.length > 0 ? key : pref.key || 'preference';
        if (typeof value === 'string' && value.trim()) {
          return `${label}: ${value.trim()}`;
        }
        if (Array.isArray(value)) {
          const arr = value
            .map(item => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .join(', ');
          return arr ? `${label}: ${arr}` : null;
        }
        if (value && typeof value === 'object') {
          try {
            return `${label}: ${JSON.stringify(value)}`;
          } catch {
            return `${label}: [object]`;
          }
        }
        if (value !== undefined && value !== null) {
          return `${label}: ${String(value)}`;
        }
        return null;
      })
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

    if (savedSummaries.length > 0) {
      return savedSummaries;
    }

    const fallback: string[] = [];
    if (profileData?.company_name) fallback.push(`Company: ${profileData.company_name}`);
    if (profileData?.industry) fallback.push(`Industry: ${profileData.industry}`);
    if (profileData?.icp_definition) fallback.push(`ICP: ${profileData.icp_definition}`);
    if (Array.isArray(targetTitles) && targetTitles.length > 0) {
      fallback.push(`Target titles: ${targetTitles.join(', ')}`);
    }
    if (competitorList.length > 0) {
      fallback.push(`Competitors to watch: ${competitorList.join(', ')}`);
    }
    if (researchFocusList.length > 0) {
      fallback.push(`Research focus: ${researchFocusList.join(', ')}`);
    }
    if (Array.isArray(formattedSignals) && formattedSignals.length > 0) {
      const signals = formattedSignals.map(item => item.label).join(', ');
      if (signals) fallback.push(`Signals monitored: ${signals}`);
    }
    if (Array.isArray(formattedCriteria) && formattedCriteria.length > 0) {
      const criteria = formattedCriteria.map(item => `${item.label} (${item.importance})`).join(', ');
      if (criteria) fallback.push(`Custom criteria: ${criteria}`);
    }
    if (indicatorLabel) fallback.push(`Signals label: ${indicatorLabel}`);
    if (indicatorChoices.length > 0) {
      fallback.push(`Watchlist: ${indicatorChoices.join(', ')}`);
    }
    return fallback;
  }, [savedPreferences, profileData, targetTitles, competitorList, researchFocusList, formattedSignals, formattedCriteria, indicatorLabel, indicatorChoices]);

  const hasSetupDetails = useMemo(() => {
    if (!profileData) return false;
    return Boolean(
      profileData.company_name ||
      profileData.industry ||
      profileData.icp_definition ||
      profileData.user_role ||
      profileData.use_case ||
      targetTitles.length ||
      competitorList.length ||
      researchFocusList.length ||
      formattedCriteria.length ||
      formattedSignals.length ||
      indicatorLabel ||
      indicatorChoices.length
    );
  }, [profileData, targetTitles.length, competitorList.length, researchFocusList.length, formattedCriteria.length, formattedSignals.length, indicatorLabel, indicatorChoices.length]);

  const depthOptions = useMemo(
    () => [
      {
        id: 'quick',
        label: 'Quick',
        description: '30 sec • Headlines & essentials',
        value: 'quick' as 'quick' | 'deep' | 'specific' | null,
      },
      {
        id: 'standard',
        label: 'Standard',
        description: '≈1 min • Balanced depth',
        value: null as 'quick' | 'deep' | 'specific' | null,
      },
      {
        id: 'deep',
        label: 'Deep',
        description: '≈2 min • Comprehensive brief',
        value: 'deep' as 'quick' | 'deep' | 'specific' | null,
      },
    ],
    []
  );

  const lengthOptions = useMemo(
    () => [
      {
        id: 'short',
        label: 'Concise',
        description: '≤500 words • Quick read',
        value: 'short' as 'short' | 'standard' | 'long',
      },
      {
        id: 'standard-length',
        label: 'Standard',
        description: '500-1000 words • Balanced detail',
        value: 'standard' as 'short' | 'standard' | 'long',
      },
      {
        id: 'long',
        label: 'Detailed',
        description: '1000+ words • Full narrative',
        value: 'long' as 'short' | 'standard' | 'long',
      },
    ],
    []
  );

  const toneOptions = useMemo(
    () => [
      {
        id: 'tone-warm',
        label: 'Warm',
        description: 'Relationship-forward, collaborative voice',
        value: 'warm' as 'warm' | 'balanced' | 'direct',
      },
      {
        id: 'tone-balanced',
        label: 'Balanced',
        description: 'Consultative + confident (default)',
        value: 'balanced' as 'warm' | 'balanced' | 'direct',
      },
      {
        id: 'tone-direct',
        label: 'Direct',
        description: 'Crisp, outcome-driven tone',
        value: 'direct' as 'warm' | 'balanced' | 'direct',
      },
    ],
    []
  );

  const tldrOptions = useMemo(
    () => [
      {
        id: 'tldr-always',
        label: 'Always include summary',
        description: 'Lead with an executive overview',
        value: true,
      },
      {
        id: 'tldr-optional',
        label: 'Only when I ask',
        description: 'Skip the summary unless requested',
        value: false,
      },
    ],
    []
  );

  const refreshProfileData = async () => {
    if (!user) return null;

    const [profileResult, criteriaResult, signalsResult, promptConfigResult] = await Promise.all([
      supabase
        .from('company_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_custom_criteria')
        .select('id, field_name, importance, field_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('user_signal_preferences')
        .select('id, signal_type, importance, lookback_days, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('user_prompt_config')
        .select('preferred_research_type, default_output_brevity, default_tone, always_tldr')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);

    const profile = profileResult.data;
    setProfileData(profile);
    const criteriaRows = Array.isArray(criteriaResult.data) ? criteriaResult.data : [];
    const signalRows = Array.isArray(signalsResult.data) ? signalsResult.data : [];
    setCustomCriteriaItems(criteriaRows);
    setSignalPreferenceItems(signalRows);
    setCustomCriteriaCount(criteriaRows.length);
    setSignalPreferencesCount(signalRows.length);
    const prompt = promptConfigResult.data || DEFAULT_PROMPT_CONFIG;
    setPromptConfig({
      preferred_research_type: prompt.preferred_research_type ?? null,
      default_output_brevity: (prompt.default_output_brevity as 'short' | 'standard' | 'long') || 'standard',
      default_tone: (prompt.default_tone as 'warm' | 'balanced' | 'direct') || 'balanced',
      always_tldr: typeof prompt.always_tldr === 'boolean' ? prompt.always_tldr : true,
    });
    return profile;
  };

  useEffect(() => {
    if (user) {
      initializeProfilePage();
    }
  }, [user]);

  useEffect(() => {
    if (currentChatId) {
      loadMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  const refreshPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (isMountedRef.current) setSavedPreferences([]);
        return;
      }
      const response = await fetch('/api/preferences', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch preferences (${response.status})`);
      const payload = await response.json();
      if (isMountedRef.current) {
        setSavedPreferences(payload?.preferences || []);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('Failed to load saved preferences', error);
        setSavedPreferences([]);
      }
    } finally {
      if (isMountedRef.current) setPrefsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, thinkingEvents]);

  const initializeProfilePage = async (forceReload = false) => {
    if (!user) return;
    if (!forceReload && hasInitialized.current) return;
    if (forceReload) {
      hasInitialized.current = false;
    }
    hasInitialized.current = true;

    await loadChats();
    const profile = await refreshProfileData();
    const chatData = await createNewChat();
    if (chatData) {
      // Start greeting stream without blocking UI
      void sendInitialGreeting(!!profile, profile, chatData.id);
    }
    setInitializing(false);
  };

  const updatePromptPreference = async (
    updates: Partial<{ preferred_research_type: 'quick' | 'deep' | 'specific' | null; default_output_brevity: 'short' | 'standard' | 'long'; default_tone: 'warm' | 'balanced' | 'direct'; always_tldr: boolean }>,
    key: string
  ) => {
    if (!user) return;
    const previous = promptConfig ? { ...promptConfig } : { ...DEFAULT_PROMPT_CONFIG };
    const next = { ...previous, ...updates };
    setPromptConfig(next);
    setUpdatingPref(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt_config: updates }),
      });

      if (!res.ok) {
        const detail = (await res.text()) || 'Failed to update preferences';
        throw new Error(detail);
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'preferred_research_type')) {
        const value = updates.preferred_research_type;
        if (value) localStorage.setItem('preferred_research_type', value);
        else localStorage.removeItem('preferred_research_type');
      }

      addToast({ type: 'success', title: 'Preferences updated', description: 'Future research will use these defaults.' });
      window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: user.id } }));
    } catch (error: any) {
      console.error('Failed to update prompt preferences', error);
      setPromptConfig(previous);
      addToast({ type: 'error', title: 'Update failed', description: error?.message || 'Unable to update preferences.' });
    } finally {
      setUpdatingPref(null);
    }
  };

  const loadChats = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (data) {
      setChats(data);
    }
  };

  const loadMessages = async (chatId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const createNewChat = async () => {
    if (!user) return null;

    const { data } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'Profile Coach',
        agent_type: 'settings_agent',
      })
      .select()
      .single();

    if (data) {
      setChats([data, ...chats]);
      setCurrentChatId(data.id);
      setMessages([]);
      return data;
    }
    return null;
  };

  const summarizeMissingForCoach = (profile: any) => {
    const missing: string[] = [];
    if (!profile?.target_titles || (profile.target_titles || []).length === 0) missing.push('target_titles');
    if (customCriteriaCount < 3) missing.push('custom_criteria');
    if (signalPreferencesCount < 2) missing.push('signal_preferences');
    return missing;
  };

  const sendInitialGreeting = async (hasExistingProfile: boolean, profile: any, chatId: string) => {
    setLoading(true);
    // Show immediate acknowledgment so the UI isn't blank
    setThinkingEvents(prev => ([
      ...prev,
      { id: 'ack-initial', type: 'acknowledgment' as any, content: "Got it — I'll review your profile and suggest 1–2 high‑impact improvements." }
    ]));

    const userName = getUserName();
    let systemPrompt = '';

    if (hasExistingProfile && profile) {
      const profileSummary = [];
      if (profile.company_name) profileSummary.push(`Company: ${profile.company_name}`);
      if (profile.industry) profileSummary.push(`Industry: ${profile.industry}`);
      if (profile.icp_definition) profileSummary.push(`ICP: ${profile.icp_definition.slice(0, 100)}...`);
      if (profile.target_titles?.length) profileSummary.push(`Target Titles: ${profile.target_titles.slice(0, 3).join(', ')}`);

      const missing = summarizeMissingForCoach(profile);
      const needs = missing.length
        ? `Missing prioritized fields: ${missing.join(', ')}.`
        : 'All critical fields appear present.';
      const coachingNotes = missing.length
        ? `Coaching flow requirements:
- Guide the user to complete missing items in this order: target_titles -> custom_criteria -> signal_preferences -> indicator terminology.
- Ask one concise question at a time; propose example responses that align with their industry.
- Confirm each item in natural language (e.g., "Great, I saved those titles") before moving on.
- If they mention what they call buying signals (e.g., "Indicators" or "Buying Triggers"), save that under \`preferred_terms.indicators_label\`.
- When they list concrete examples (e.g., "acquisitions", "leadership changes"), append them verbatim to \`indicator_choices\`.`
        : `Coaching flow requirements:
- Confirm their saved profile details in natural language.
- Double-check the terminology they want for buying signals; if they provide a new label or examples, update \`preferred_terms.indicators_label\` and \`indicator_choices\`.
- Offer two actionable improvements (e.g., refine ICP narrative, add competitors or disqualifiers).`;

      systemPrompt = `The user ${userName} already has a company profile with the following details:
${profileSummary.join('\n')}

${needs}

${HIDDEN_SAVE_INSTRUCTION}

${coachingNotes}

Begin with a warm greeting, then continue coaching.`;
    } else {
      systemPrompt = `You are the Profile Coach for ${userName}. Greet them warmly and explain briefly how a detailed profile improves research quality.

${HIDDEN_SAVE_INSTRUCTION}

Onboarding flow:
- Start by asking for company name and industry in natural language.
- Confirm what you saved after each answer (e.g., "Got it — I'll remember that").
- Progress through target_titles (aim for 3+), custom_criteria (aim for 3+), signal_preferences (aim for 2+), then ask how they label their buying signals and what examples they track. Record the label in preferred_terms.indicators_label and the examples in indicator_choices verbatim.
- Capture competitors or disqualifiers if relevant.
- Ask one concise question at a time and suggest concrete examples the user can react to.
- Wrap up with a short recap of what you captured and invite them to adjust anything later.`;
    }

    try {
      let fullResponse = await streamAIResponse(systemPrompt, chatId, true);
      fullResponse = normalizeMarkdown(fullResponse, { enforceResearchSections: false });
      const saveConfirmation = await processSaveCommands(fullResponse);
      let displayResponse = (() => {
        const stripped = stripSaveProfileBlocks(fullResponse).trim();
        return stripped.length > 0 ? stripped : fullResponse;
      })();
      if (saveConfirmation) {
        displayResponse = displayResponse
          ? `${displayResponse}\n\n${saveConfirmation}`
          : saveConfirmation;
      }

      // Persist streamed message after completion
      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: displayResponse })
        .select()
        .single();

      if (savedAssistantMsg) {
        setMessages([savedAssistantMsg]);
        setStreamingMessage('');
      }

      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

    } catch (error) {
      console.error('Error sending initial greeting:', error);
      addToast({ type: 'error', title: 'Failed to initialize', description: 'Could not start the Profile Coach. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading || !currentChatId) return;

    const userMessage = inputValue.trim();
    const now = Date.now();
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (
      (lastUser && lastUser.content.trim().toLowerCase() === userMessage.toLowerCase()) ||
      (lastSentRef.current && lastSentRef.current.text === userMessage.toLowerCase() && now - lastSentRef.current.at < 4000)
    ) {
      return;
    }
    lastSentRef.current = { text: userMessage.toLowerCase(), at: now };
    setInputValue('');
    setLoading(true);

    const tempUserMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setStreamingMessage('');
    setThinkingEvents([]);

    try {
      const { data: savedUserMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          role: 'user',
          content: userMessage,
        })
        .select()
        .single();

      const manualConfirmation = await processSaveCommands(userMessage);
      if (manualConfirmation) {
        const { data: savedAssistantMsg } = await supabase
          .from('messages')
          .insert({
            chat_id: currentChatId,
            role: 'assistant',
            content: manualConfirmation,
          })
          .select()
          .single();

        setMessages(prev =>
          prev.filter(m => m.id !== tempUserMsg.id)
            .concat([savedUserMsg, savedAssistantMsg])
        );
        setStreamingMessage('');
        setThinkingEvents([]);
        await supabase
          .from('chats')
          .update({
            updated_at: new Date().toISOString(),
            title: messages.length === 0 ? userMessage.slice(0, 60) : undefined
          })
          .eq('id', currentChatId);
        setLoading(false);
        return;
      }

      let fullResponse = await streamAIResponse(userMessage);
      fullResponse = normalizeMarkdown(fullResponse, { enforceResearchSections: false });

      // Check if response contains profile save command
      const saveConfirmation = await processSaveCommands(fullResponse);

      let displayResponse = (() => {
        const stripped = stripSaveProfileBlocks(fullResponse).trim();
        return stripped.length > 0 ? stripped : fullResponse;
      })();

      if (saveConfirmation) {
        displayResponse = displayResponse
          ? `${displayResponse}\n\n${saveConfirmation}`
          : saveConfirmation;
      }

      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          role: 'assistant',
          content: displayResponse,
        })
        .select()
        .single();

      await supabase
        .from('chats')
        .update({
          updated_at: new Date().toISOString(),
          title: messages.length === 0 ? userMessage.slice(0, 60) : undefined
        })
        .eq('id', currentChatId);

      setMessages(prev =>
        prev.filter(m => m.id !== tempUserMsg.id)
          .concat([savedUserMsg, savedAssistantMsg])
      );
      setStreamingMessage('');
      setThinkingEvents([]);

      // Reload profile data to reflect changes
      hasInitialized.current = false;
      await initializeProfilePage(true);
      invalidateUserProfileCache(user?.id);
      void refreshPreferences();

      loadChats();
    } catch (error) {
      console.error('Error:', error);
      addToast({ type: 'error', title: 'Message failed', description: 'There was a problem sending your message. Please try again.' });
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setStreamingMessage('');
      setThinkingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const streamAIResponse = async (userMessage: string, chatId?: string, isSystemPrompt: boolean = false): Promise<string> => {
    const activeChatId = chatId || currentChatId;
    if (!activeChatId) throw new Error('No active chat');

    try {
      let conversationHistory: any[] = [];

      if (!isSystemPrompt) {
        conversationHistory = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role,
            content: m.content
          }));
      }

      if (isSystemPrompt) {
        conversationHistory.push({
          role: 'system',
          content: userMessage
        });
      } else {
        conversationHistory.push({
          role: 'user',
          content: userMessage
        });
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Use Vercel API by default; opt-out only if explicitly disabled
      const chatUrl = '/api/ai/chat';
      // Instrumentation start
      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'settings', url: chatUrl, ts: Date.now() } })); } catch {}
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          stream: true,
          chat_id: activeChatId,
          agentType: 'settings_agent',
          config: {
            disable_fast_plan: true,
            clarifiers_locked: false,
          },
          research_type: null,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          addToast({ type: 'error', title: 'Session expired', description: 'Please sign in again.' });
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let usedTokens: number | null = null;
      let firstDeltaAt: number | null = null;
      let startedOutput = false;

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
              if (data === '[DONE]' || !data) continue;

              try {
                const parsed = JSON.parse(data);

                // Handle quick acknowledgment for instant feedback
                if (parsed.type === 'acknowledgment') {
                  setThinkingEvents(prev => {
                    const others = prev.filter(e => e.id !== 'ack-live');
                    return [...others, { id: 'ack-live', type: 'acknowledgment' as any, content: parsed.content }];
                  });
                }
                // Handle reasoning events
                if (parsed.type === 'reasoning') {
                  setThinkingEvents(prev => [...prev, {
                    id: `reasoning-${Date.now()}`,
                    type: 'reasoning',
                    content: parsed.content
                  }]);
                }
                // Handle web search events
                else if (parsed.type === 'web_search') {
                  setThinkingEvents(prev => {
                    const same = prev.find(e => e.type === 'web_search' && e.query === parsed.query);
                    if (same) {
                      return prev.map(e => (e.type === 'web_search' && e.query === parsed.query)
                        ? { ...e, sources: parsed.sources || [] }
                        : e
                      );
                    }
                    return [...prev, {
                      id: `search-${Date.now()}`,
                      type: 'web_search',
                      query: parsed.query,
                      sources: parsed.sources || []
                    }];
                  });
                }
                else if (parsed.type === 'preference_saved') {
                  if (Array.isArray(parsed.preferences) && parsed.preferences.length) {
                    const labels = parsed.preferences
                      .map((pref: any) => (typeof pref?.label === 'string' && pref.label.trim())
                        ? pref.label.trim()
                        : typeof pref?.key === 'string'
                          ? pref.key.split('.').pop()?.replace(/_/g, ' ') ?? pref.key
                          : null)
                      .filter((label: string | null): label is string => Boolean(label));
                    if (labels.length) {
                      addToast({
                        type: 'success',
                        title: 'Preference saved',
                        description: `Noted — I’ll keep highlighting ${labels.join(', ')}.`,
                      });
                    }
                    invalidateUserProfileCache(user?.id);
                    void refreshPreferences();
                    void refreshProfileData();
                  }
                }
                else if (parsed.type === 'profile_saved') {
                  if (parsed.profile && typeof parsed.profile === 'object') {
                    setProfileData(parsed.profile);
                  }
                  if (Array.isArray(parsed.custom_criteria)) {
                    setCustomCriteriaItems(parsed.custom_criteria);
                    setCustomCriteriaCount(parsed.custom_criteria.length);
                  }
                  if (Array.isArray(parsed.signal_preferences)) {
                    setSignalPreferenceItems(parsed.signal_preferences);
                    setSignalPreferencesCount(parsed.signal_preferences.length);
                  }
                  void refreshPreferences();
                  void refreshProfileData();
                  invalidateUserProfileCache(user?.id);
                }
                else if (parsed.type === 'alias_learned') {
                  if (Array.isArray(parsed.aliases) && parsed.aliases.length) {
                    const summaries = parsed.aliases
                      .map((entry: any) => {
                        if (!entry?.alias || !entry?.canonical) return null;
                        return `${entry.alias} → ${entry.canonical}`;
                      })
                      .filter((item: string | null): item is string => Boolean(item));
                    if (summaries.length) {
                      addToast({
                        type: 'info',
                        title: summaries.length === 1 ? 'Alias remembered' : 'Aliases remembered',
                        description: summaries.join(', '),
                      });
                    }
                  }
                }
                // Responses API format (supports both canonical and simplified events)
                else if (parsed.type === 'response.output_text.delta' || parsed.type === 'content') {
                  const content = parsed.delta || parsed.content;
                  if (content) {
                    if (!startedOutput) {
                      startedOutput = true;
                      // Remove any acknowledgment banners once streaming starts
                      setThinkingEvents(prev => prev.filter(e => !['ack-initial','ack-live'].includes(e.id)));
                    }
                    fullText += content;
                    setStreamingMessage(stripSaveProfileBlocks(fullText));
                    if (firstDeltaAt == null) {
                      firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                      try { window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'settings', ttfbMs: firstDeltaAt - startedAt } })); } catch {}
                    }
                  }
                }
                // Usage metadata
                else if (parsed.type === 'response.metadata' && parsed.usage?.total_tokens != null) {
                  usedTokens = parsed.usage.total_tokens;
                }
                // Also support Chat Completions format for backward compatibility
                else if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  fullText += content;
                  setStreamingMessage(stripSaveProfileBlocks(fullText));
                }
              } catch (_e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      try {
        const endedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        window.dispatchEvent(new CustomEvent('llm:complete', {
          detail: {
            page: 'settings',
            totalMs: endedAt - startedAt,
            ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null,
            tokens: usedTokens,
          }
        }));
      } catch {}
      return fullText;
    } catch (error) {
      console.error('OpenAI error:', error);
      return `I apologize, but I encountered an error processing your request. Please try again.`;
    }
  };

  const getUserInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'Y';
  };

  const getUserName = () => {
    try {
      const meta: any = (user as any)?.user_metadata || {};
      const first = meta.first_name || meta.given_name;
      const full = meta.full_name || meta.name;
      if (typeof first === 'string' && first.trim()) return first.trim();
      if (typeof full === 'string' && full.trim()) return String(full).trim().split(' ')[0];
    } catch {}
    if (user?.email) return user.email.split('@')[0];
    return 'there';
  };

  const processSaveCommands = async (responseText: string): Promise<string | null> => {
    const payloads = extractSavePayloads(responseText);
    if (payloads.length === 0) return null;

    const confirmations: string[] = [];

    for (const payload of payloads) {
      try {
        if (payload.action === 'save_profile') {
          console.log('Found save_profile command, executing...');

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            console.error('No session found');
            continue;
          }

          // Route profile updates through Vercel API proxy
          const updateProfileUrl = '/api/update-profile';

          const response = await fetch(updateProfileUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              profile: payload.profile,
              custom_criteria: payload.custom_criteria,
              signal_preferences: payload.signal_preferences,
              disqualifying_criteria: payload.disqualifying_criteria
            }),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            console.error('Failed to save profile:', errText);
            addToast({ type: 'error', title: 'Profile save failed', description: String(errText).slice(0, 240) });
          } else {
            const result = await response.json();
            console.log('Profile saved successfully:', result);
            await refreshProfileData();
            await refreshPreferences();
            window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: user?.id } }));
            addToast({ type: 'success', title: 'Profile updated', description: 'Your preferences were saved.' });

            const savedBits: string[] = [];
            if (payload.profile?.company_name) {
              savedBits.push(`Company → ${payload.profile.company_name}`);
            }
            if (payload.profile?.industry) {
              savedBits.push(`Industry → ${payload.profile.industry}`);
            }
            const indicatorLabel = payload.profile?.preferred_terms?.indicators_label;
            if (typeof indicatorLabel === 'string' && indicatorLabel.trim()) {
              savedBits.push(`Signals label → ${indicatorLabel.trim()}`);
            }
            if (Array.isArray(payload.profile?.indicator_choices) && payload.profile.indicator_choices.length > 0) {
              const list = payload.profile.indicator_choices
                .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
                .join(', ');
              if (list) savedBits.push(`Watchlist → ${list}`);
            }
            if (Array.isArray(payload.profile?.target_titles) && payload.profile.target_titles.length > 0) {
              const titles = payload.profile.target_titles
                .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
                .join(', ');
              if (titles) savedBits.push(`Target titles → ${titles}`);
            }
            if (Array.isArray(payload.signal_preferences) && payload.signal_preferences.length > 0) {
              const signals = payload.signal_preferences
                .map((pref: any) => pref?.signal_type)
                .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
                .join(', ');
              if (signals) savedBits.push(`Signal alerts → ${signals}`);
            }
            if (Array.isArray(payload.custom_criteria) && payload.custom_criteria.length > 0) {
              const criteria = payload.custom_criteria
                .map((criterion: any) => criterion?.field_name)
                .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
                .join(', ');
              if (criteria) savedBits.push(`Custom criteria → ${criteria}`);
            }

            if (savedBits.length) {
              confirmations.push(`All set — I captured: ${savedBits.join('; ')}.`);
            } else {
              confirmations.push('Saved your latest profile updates.');
            }
          }
        }
      } catch (e) {
        console.error('Error processing save command:', e);
        addToast({ type: 'error', title: 'Profile save failed', description: 'Invalid save instruction. Please try again.' });
      }
    }

    if (confirmations.length > 0) {
      return confirmations.join('\n');
    }
    return null;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onNewChat={createNewChat}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={currentChatId}
        onChatSelect={setCurrentChatId}
        onCompanyProfile={() => navigate('/profile-coach')}
        onResearchHistory={() => navigate('/research')}
        onSettings={() => navigate('/settings')}
        onAccountClick={(account: TrackedAccount) => {
          // Jump to dashboard and research the selected account
          navigate(`/?q=${encodeURIComponent(`Research ${account.company_name}`)}`);
        }}
        onAddAccount={() => navigate('/')}
        onHome={() => navigate('/')}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Dashboard</span>
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => setAgentMenuOpen(v => !v)}
                className="flex items-center gap-2 text-sm text-gray-700 px-3 py-1.5 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <User className="w-4 h-4" />
                <span className="font-medium">Profile Coach</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {agentMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setAgentMenuOpen(false); navigate('/'); }}
                  >
                    Company Researcher
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setAgentMenuOpen(false); navigate('/profile-coach'); }}
                  >
                    Profile Coach
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">

            {initializing ? (
              <div className="flex flex-col items-center justify-center h-96">
                <div className="flex gap-1 mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
                <p className="text-gray-600 text-sm">Initializing...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {profileData && (
                  <ProfileCompleteness
                    profile={{
                      ...profileData,
                      custom_criteria_count: customCriteriaCount,
                      signal_preferences_count: signalPreferencesCount
                    }}
                  />
                )}
                <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-blue-900">Your saved setup</h2>
                      <p className="text-xs text-blue-700 mt-1">
                        Everything the agent remembers before running research or meeting prep.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-600">{hasSetupDetails ? 'Synced instantly' : 'Waiting for details'}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/research?q=${encodeURIComponent('View my setup')}`)}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        View in chat
                      </button>
                    </div>
                  </div>

                  {hasSetupDetails ? (
                    <>
                      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-900">
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-500">Company</dt>
                          <dd className="mt-1">
                            {profileData?.company_name || 'Not set'}
                            {profileData?.company_url && (
                              <a
                                href={profileData.company_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs text-blue-600 hover:underline"
                              >
                                {profileData.company_url}
                              </a>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-500">Industry</dt>
                          <dd className="mt-1">{profileData?.industry || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-500">ICP summary</dt>
                          <dd className="mt-1 text-sm text-gray-800 leading-snug">
                            {profileData?.icp_definition || 'Not captured yet'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-500">Role &amp; use case</dt>
                          <dd className="mt-1">
                            {profileData?.user_role || profileData?.use_case
                              ? [profileData?.user_role, profileData?.use_case].filter(Boolean).join(' • ')
                              : 'Not set'}
                          </dd>
                        </div>
                      </dl>

                      {targetTitles.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Target titles</p>
                          <div className="flex flex-wrap gap-2">
                            {targetTitles.map((title: string) => (
                              <span
                                key={title}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-full"
                              >
                                {title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {formattedCriteria.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Custom criteria ({formattedCriteria.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {formattedCriteria.map(item => (
                              <span
                                key={item.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-100 rounded-full"
                              >
                                {item.label}
                                <span className="text-[10px] uppercase tracking-wide text-amber-700">• {item.importance}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {formattedSignals.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Signal alerts ({formattedSignals.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {formattedSignals.map(item => (
                              <span
                                key={item.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-100 rounded-full"
                              >
                                {item.label}
                                <span className="text-[10px] uppercase tracking-wide text-red-600">• {item.importance}</span>
                                {item.lookback ? (
                                  <span className="text-[10px] text-red-500">({item.lookback}d)</span>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(indicatorLabel || indicatorChoices.length > 0) && (
                        <div className="mt-4">
                          {indicatorLabel && (
                            <div className="mb-2">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Indicator section label</p>
                              <p className="text-sm text-gray-900 mt-1">{indicatorLabel}</p>
                            </div>
                          )}
                          {indicatorChoices.length > 0 && (
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Indicator watchlist</p>
                              <div className="flex flex-wrap gap-2">
                                {indicatorChoices.map((choice: string, idx: number) => (
                                  <span
                                    key={`${choice}-${idx}`}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-100 rounded-full"
                                  >
                                    {choice}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {competitorList.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Competitors to monitor</p>
                          <div className="flex flex-wrap gap-2">
                            {competitorList.map((name: string) => (
                              <span
                                key={name}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 rounded-full"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {researchFocusList.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Research focus</p>
                          <div className="flex flex-wrap gap-2">
                            {researchFocusList.map((focus: string) => (
                              <span
                                key={focus}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100 rounded-full"
                              >
                                {focus}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-gray-600">
                      You haven&apos;t saved any profile details yet. Answer the quick prompts below and I&apos;ll remember everything for future research.
                    </p>
                  )}
                </div>
                {promptConfig && (
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-purple-900">Research preferences</h2>
                        <p className="text-xs text-purple-700 mt-1">
                          These defaults apply automatically whenever you run company research.
                        </p>
                      </div>
                      <span className="text-xs text-purple-600">{updatingPref ? 'Saving…' : 'Instantly applied'}</span>
                    </div>

                    <div className="mt-4 space-y-5">
                      <div>
                        <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-2">Depth</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {depthOptions.map(option => {
                            const currentDepth = promptConfig?.preferred_research_type === 'specific' ? null : promptConfig?.preferred_research_type ?? null;
                            const active = currentDepth === option.value;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updatePromptPreference({ preferred_research_type: option.value }, 'depth')}
                                disabled={updatingPref === 'depth'}
                                className={`flex-1 min-w-[160px] px-4 py-3 border-2 rounded-xl text-left transition-all ${
                                  active
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                    : 'bg-white text-gray-700 border-purple-200 hover:border-purple-400 hover:shadow-sm'
                                } ${updatingPref === 'depth' ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{option.label}</span>
                                  {active && <span className="text-[10px] font-semibold uppercase">Active</span>}
                                </div>
                                <p className={`text-xs mt-1 ${active ? 'text-purple-100' : 'text-gray-500'}`}>{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-2">Tone</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {toneOptions.map(option => {
                            const currentTone = promptConfig?.default_tone || 'balanced';
                            const active = currentTone === option.value;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updatePromptPreference({ default_tone: option.value }, 'tone')}
                                disabled={updatingPref === 'tone'}
                                className={`flex-1 min-w-[160px] px-4 py-3 border-2 rounded-xl text-left transition-all ${
                                  active
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                    : 'bg-white text-gray-700 border-purple-200 hover:border-purple-400 hover:shadow-sm'
                                } ${updatingPref === 'tone' ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{option.label}</span>
                                  {active && <span className="text-[10px] font-semibold uppercase">Active</span>}
                                </div>
                                <p className={`text-xs mt-1 ${active ? 'text-purple-100' : 'text-gray-500'}`}>{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-2">Length</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {lengthOptions.map(option => {
                            const active = (promptConfig?.default_output_brevity || 'standard') === option.value;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updatePromptPreference({ default_output_brevity: option.value }, 'length')}
                                disabled={updatingPref === 'length'}
                                className={`flex-1 min-w-[160px] px-4 py-3 border-2 rounded-xl text-left transition-all ${
                                  active
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                    : 'bg-white text-gray-700 border-purple-200 hover:border-purple-400 hover:shadow-sm'
                                } ${updatingPref === 'length' ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{option.label}</span>
                                  {active && <span className="text-[10px] font-semibold uppercase">Active</span>}
                                </div>
                                <p className={`text-xs mt-1 ${active ? 'text-purple-100' : 'text-gray-500'}`}>{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-2">Summary preference</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {tldrOptions.map(option => {
                            const active = Boolean(promptConfig?.always_tldr) === option.value;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updatePromptPreference({ always_tldr: option.value }, 'tldr')}
                                disabled={updatingPref === 'tldr'}
                                className={`flex-1 min-w-[160px] px-4 py-3 border-2 rounded-xl text-left transition-all ${
                                  active
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                    : 'bg-white text-gray-700 border-purple-200 hover:border-purple-400 hover:shadow-sm'
                                } ${updatingPref === 'tldr' ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{option.label}</span>
                                  {active && <span className="text-[10px] font-semibold uppercase">Active</span>}
                                </div>
                                <p className={`text-xs mt-1 ${active ? 'text-purple-100' : 'text-gray-500'}`}>{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-purple-200">
                        <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-2">What this unlocks</p>
                        <ul className="text-xs text-purple-800 space-y-1">
                          <li>• {preferenceSummary.depthLabel}</li>
                          <li>• {preferenceSummary.lengthLabel}</li>
                          <li>• {preferenceSummary.toneLabel}</li>
                          <li>• {preferenceSummary.tldrLabel}</li>
                          {preferenceSummary.focus.map((item, idx) => (
                            <li key={idx}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-emerald-600">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-emerald-900">Saved conversational preferences</h2>
                          <p className="text-sm text-emerald-800 mt-1">
                            When you clarify something in chat, I store it here so future research aligns automatically.
                          </p>
                        </div>
                        <span className="text-xs text-emerald-600">{prefsLoading ? 'Refreshing…' : 'Synced instantly'}</span>
                      </div>
                      {preferenceChips.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {preferenceChips.map(chip => (
                            <span
                              key={chip.id}
                              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full border ${
                                chip.tone === 'primary'
                                  ? 'bg-emerald-600/90 text-white border-emerald-600'
                                  : 'bg-white/80 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <ul className="mt-4 space-y-2">
                        {prefsLoading && savedPreferences.length === 0 && conversationalPreferenceSummaries.length === 0 ? (
                          <li className="text-sm text-emerald-700">Loading saved preferences…</li>
                        ) : savedPreferences.length > 0 ? (
                          savedPreferences.map((pref) => {
                            const confidence = typeof pref.confidence === 'number' ? ` (confidence ${(pref.confidence * 100).toFixed(0)}%)` : '';
                            const formattedValue = (() => {
                              if (pref.value === null || pref.value === undefined) return '—';
                              if (typeof pref.value === 'object') {
                                try {
                                  return JSON.stringify(pref.value);
                                } catch {
                                  return String(pref.value);
                                }
                              }
                              return String(pref.value);
                            })();
                            return (
                              <li key={`${pref.key}-${pref.updated_at || ''}`} className="bg-white/70 border border-emerald-200 rounded-xl px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">{pref.key}</p>
                                    <p className="text-sm text-gray-800 mt-1">{formattedValue}</p>
                                  </div>
                                  <span className="text-[10px] uppercase text-emerald-700 font-semibold">{pref.source || 'followup'}{confidence}</span>
                                </div>
                              </li>
                            );
                          })
                        ) : conversationalPreferenceSummaries.length > 0 ? (
                          conversationalPreferenceSummaries.map((summary, idx) => (
                            <li key={`derived-pref-${idx}`} className="bg-white/70 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-gray-800">
                              {summary}
                            </li>
                          ))
                        ) : (
                          <li className="text-sm text-emerald-700">No conversational preferences stored yet. The agent will add items as you correct or refine outputs.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-blue-600">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-base font-semibold text-blue-900">What the Profile Coach captures for every account</h2>
                      <p className="text-sm text-blue-800 mt-1">
                        I keep your research configuration transparent so you always know the data points we\'re calibrating against.
                        Update anything here and future research will align instantly.
                      </p>
                      <ul className="mt-4 grid gap-2 text-sm text-blue-900 sm:grid-cols-2">
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Ideal customer profile & industry focus</li>
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Target roles, seniority, and departments</li>
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Buying signals you care about most</li>
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Custom qualification criteria & disqualifiers</li>
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Competitors and adjacent vendors to monitor</li>
                        <li className="flex items-center gap-2"><span className="text-blue-600">•</span> Preferred output formats & tone</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    userName={getUserInitial()}
                    showActions={message.role === 'assistant' && index === messages.length - 1 && !streamingMessage}
                    agentType="company_profiler"
                  />
                ))}

                {streamingMessage && (
                  <MessageBubble
                    role="assistant"
                    content={streamingMessage}
                    userName={getUserInitial()}
                    showActions={false}
                    agentType="company_profiler"
                  />
                )}

                {thinkingEvents.length > 0 && (
                  <div className="space-y-2">
                    {thinkingEvents.map((event) => (
                      <ThinkingIndicator
                        key={event.id}
                        type={event.type}
                        content={event.content}
                        query={event.query}
                        sources={event.sources}
                      />
                    ))}
                  </div>
                )}

                {loading && !streamingMessage && thinkingEvents.length === 0 && messages.length === 0 && (
                  <ThinkingIndicator type={"reasoning_progress" as any} content="Preparing suggestions..." />
                )}

                {loading && !streamingMessage && messages.length > 0 && (
                  <div className="flex gap-3 items-start">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {currentChatId && !initializing && (
          <div className="bg-gray-50">
            <div className="max-w-3xl mx-auto px-6 py-4">
              <MessageInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                disabled={loading}
                placeholder="Tell me about your company..."
                selectedAgent="Profile Coach"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
