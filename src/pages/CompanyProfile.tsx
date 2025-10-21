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
        .select('id')
        .eq('user_id', user.id),
      supabase
        .from('user_signal_preferences')
        .select('id')
        .eq('user_id', user.id),
      supabase
        .from('user_prompt_config')
        .select('preferred_research_type, default_output_brevity, default_tone, always_tldr')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);

    const profile = profileResult.data;
    setProfileData(profile);
    setCustomCriteriaCount(criteriaResult.data?.length || 0);
    setSignalPreferencesCount(signalsResult.data?.length || 0);
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
      const guidance = missing.length ? `
Coach flow requirements:
- Guide the user to complete missing items in this order: target_titles -> custom_criteria -> signal_preferences.
- Ask one concise question at a time; propose examples.
- When the user provides values, emit a JSON block so the app can persist it. Example JSON:
{ "action": "save_profile", "profile": { "target_titles": ["VP Security", "CISO"] }, "custom_criteria": [ {"field_name":"Has CISO","importance":"critical"} ], "signal_preferences": [ {"signal_type":"security_breach","importance":"critical"} ] }
- After saving, briefly confirm and move to the next missing item automatically.
- If nothing is missing, offer two actionable improvements (e.g., refine ICP or add competitors).
` : '';

      systemPrompt = `The user ${userName} already has a company profile with the following details:\n${profileSummary.join('\n')}\n\n${needs}\n${guidance}\nGreet them warmly, then begin.`;
    } else {
      systemPrompt = `Greet the user ${userName} warmly and help them get started with creating their company profile. Explain briefly how a detailed profile improves research quality. Start by asking for company name and industry, then guide them through target_titles, custom_criteria (3+ items), and signal_preferences (2+ items) using the same JSON "save_profile" format described earlier. Keep each question short and proceed step-by-step.`;
    }

    try {
      let fullResponse = await streamAIResponse(systemPrompt, chatId, true);
      fullResponse = normalizeMarkdown(fullResponse, { enforceResearchSections: false });

      // Persist streamed message after completion
      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: fullResponse })
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

      let fullResponse = await streamAIResponse(userMessage);
      fullResponse = normalizeMarkdown(fullResponse, { enforceResearchSections: false });

      // Check if response contains profile save command
      await processSaveCommands(fullResponse);

      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          role: 'assistant',
          content: fullResponse,
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
                  }
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
                    setStreamingMessage(fullText);
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
                  setStreamingMessage(fullText);
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

  const processSaveCommands = async (responseText: string) => {
    // Look for JSON code blocks with action: save_profile
    const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
    const matches = Array.from(responseText.matchAll(jsonBlockRegex));

    for (const match of matches) {
      try {
        const jsonContent = match[1].trim();
        const data = JSON.parse(jsonContent);

        if (data.action === 'save_profile') {
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
              profile: data.profile,
              custom_criteria: data.custom_criteria,
              signal_preferences: data.signal_preferences,
              disqualifying_criteria: data.disqualifying_criteria
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
            window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: user?.id } }));
            addToast({ type: 'success', title: 'Profile updated', description: 'Your preferences were saved.' });
          }
        }
      } catch (e) {
        console.error('Error processing save command:', e);
        addToast({ type: 'error', title: 'Profile save failed', description: 'Invalid save instruction. Please try again.' });
      }
    }
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
                      <ul className="mt-4 space-y-2">
                        {prefsLoading && savedPreferences.length === 0 ? (
                          <li className="text-sm text-emerald-700">Loading saved preferences…</li>
                        ) : savedPreferences.length === 0 ? (
                          <li className="text-sm text-emerald-700">No conversational preferences stored yet. The agent will add items as you correct or refine outputs.</li>
                        ) : (
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
