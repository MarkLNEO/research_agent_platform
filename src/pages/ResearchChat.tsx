import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { SaveResearchDialog } from '../components/SaveResearchDialog';
import { ProactiveDashboard } from '../components/ProactiveDashboard';
import { CSVUploadDialog } from '../components/CSVUploadDialog';
import { BulkResearchDialog } from '../components/BulkResearchDialog';
import { BulkResearchStatus } from '../components/BulkResearchStatus';
import { ProfileCompletenessBanner } from '../components/ProfileCompletenessBanner';
import { useToast } from '../components/ToastProvider';
import { buildResearchDraft } from '../utils/researchOutput';
import type { ResearchDraft } from '../utils/researchOutput';
import type { TrackedAccount } from '../services/accountService';

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
  type: 'reasoning' | 'web_search' | 'reasoning_progress' | 'acknowledgment' | 'content_extraction' | 'accounts_added';
  content?: string;
  query?: string;
  sources?: string[];
  url?: string;
  count?: number;
  companies?: string[];
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
  const [acknowledgment, setAcknowledgment] = useState('');
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const autoSentRef = useRef(false);
  const [showClarify, setShowClarify] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [preferredResearchType, setPreferredResearchType] = useState<'deep' | 'quick' | 'specific' | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ tokens: number; credits: number } | null>(null);
  const [csvUploadOpen, setCSVUploadOpen] = useState(false);
  const [bulkResearchOpen, setBulkResearchOpen] = useState(false);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (user) void loadChats();
  }, [user]);

  useEffect(() => {
    if (currentChatId) void loadMessages(currentChatId);
    else setMessages([]);
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, thinkingEvents]);

  // Load preference and handle quick starter
  useEffect(() => {
    const pref = localStorage.getItem('preferred_research_type');
    if (pref === 'deep' || pref === 'quick' || pref === 'specific') {
      setPreferredResearchType(pref);
    }
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

  const loadChats = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setChats(data);
  };

  const getCurrentChat = () => chats.find(c => c.id === currentChatId) || null;

  const handleOpenSaveDialog = () => {
    // Use the last assistant message as the base
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const current = getCurrentChat();

    const sources = thinkingEvents
      .filter(ev => ev.type === 'web_search' && (ev.sources?.length || 0) > 0)
      .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];

    const draft = buildResearchDraft({
      assistantMessage: lastAssistant.content,
      userMessage: [...messages].reverse().find(m => m.role === 'user')?.content,
      chatTitle: current?.title,
      agentType: 'company_research',
      sources,
    });

    setSaveDraft(draft);
    setSaveOpen(true);
  };

  const handleSaveResearch = async (draft: ResearchDraft) => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from('research_outputs').insert({
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
      });
      if (error) throw error;
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
      setChats([data, ...chats]);
      setCurrentChatId(data.id);
      setMessages([]);
      return data.id;
    }
    return null;
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

    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: normalized,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);

    try {
      const { data: savedUser } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'user', content: normalized })
        .select()
        .single();

      const assistant = await streamAIResponse(text, chatId);

      // Persist any save_profile commands returned by the agent
      await processSaveCommands(assistant);

      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: assistant })
        .select()
        .single();

      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString(), title: messages.length === 0 ? text.slice(0, 60) : undefined })
        .eq('id', chatId);

      setMessages(prev => prev.filter(m => m.id !== tempUser.id).concat([savedUser, savedAssistant] as any));
      setStreamingMessage('');
      setAcknowledgment('');
      setThinkingEvents([]);
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
      setAcknowledgment('');
      setThinkingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const needsClarification = (text: string) => {
    const t = text.toLowerCase();
    return t.includes('research') || t.includes('tell me about') || t.includes('analyze') || t.includes('find out about');
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
      
      const updateProfileUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-profile`;
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
      history.push({ role: 'user', content: userMessage });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const chatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      console.log('[DEBUG] Calling chat API:', { chatUrl, hasSession: !!session });
      // Instrumentation: request start
      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { 
        window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'research', url: chatUrl, ts: Date.now() } }));
        console.log('[LLM][research] request', { url: chatUrl });
      } catch {}
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ messages: history, stream: true, chat_id: chatId ?? currentChatId }),
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
                // Handle acknowledgment (shown before research starts)
                if (parsed.type === 'acknowledgment') {
                  setAcknowledgment(parsed.content);
                }
                // Handle reasoning events - UPDATE existing reasoning indicator
                else if (parsed.type === 'reasoning') {
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
                // Handle output text deltas
                else if (parsed.type === 'response.output_text.delta') {
                  const delta = parsed.delta;
                  if (delta) {
                    if (firstDeltaAt == null) {
                      firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                      // Clear any acknowledgment/progress banners at first token
                      try {
                        setThinkingEvents(prev => prev.filter(e => e.type !== 'reasoning_progress' && e.type !== 'acknowledgment'));
                        window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'research', ttfbMs: firstDeltaAt - startedAt } }));
                        console.log('[LLM][research] first-delta', { ttfbMs: firstDeltaAt - startedAt });
                      } catch {}
                    }
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
    const filteredMessages = messages.filter(m => m !== messages[messages.length - 1]);
    setMessages(filteredMessages);

    // Regenerate the response
    await handleSendMessageWithChat(currentChatId, lastUserMessage.content);
  };

  const handleAccountClick = (account: TrackedAccount) => {
    // When an account is clicked, start a research query
    setInputValue(`Research ${account.company_name} and provide updated analysis`);
    setTimeout(() => {
      void handleSendMessage();
    }, 100);
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
          
          const updateProfileUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-profile`;
          
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

  return (
    <>
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onNewChat={createNewChat}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={currentChatId}
        onChatSelect={setCurrentChatId}
        onSettings={() => navigate('/settings')}
        onCompanyProfile={() => navigate('/settings-agent')}
        onResearchHistory={() => navigate('/research')}
        onAccountClick={handleAccountClick}
        onAddAccount={handleAddAccount}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => {
                setCurrentChatId(null);
                setMessages([]);
                setShowClarify(false);
              }} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">New session</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 px-3 py-1.5 bg-gray-50 rounded-lg">
              <span className="font-medium">Company Researcher</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <div className="space-y-6">
              {/* Profile completeness banner */}
              <ProfileCompletenessBanner />
              
              {/* Proactive dashboard when chat is empty */}
              {messages.length === 0 && !streamingMessage && !loading && (
                <div className="text-center py-12">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    👋 Ready to research companies?
                  </h2>
                  <p className="text-gray-600 mb-8">
                    Ask me to research any company and I'll provide detailed intelligence.
                  </p>
                </div>
              )}
              
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
                    onPromote={isLastAssistant ? () => {
                      const draft = buildResearchDraft(m.content);
                      if (draft) {
                        setSaveDraft(draft);
                        setSaveOpen(true);
                      } else {
                        addToast({ type: 'error', title: 'Cannot save', description: 'This message does not contain research data.' });
                      }
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
                    <ThinkingIndicator key={ev.id} type={ev.type} content={ev.content} query={ev.query} sources={ev.sources} url={ev.url} count={ev.count} companies={ev.companies} />
                  ))}
                </div>
              )}

              {streamingMessage && (
                <MessageBubble role="assistant" content={streamingMessage} userName={getUserInitial()} showActions={false} />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
        <div className="bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <MessageInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSendMessage}
              disabled={loading}
              onAttach={() => setCSVUploadOpen(true)}
              onSettings={() => setBulkResearchOpen(true)}
              selectedAgent="Company Researcher"
            />
          </div>
        </div>
      </div>
    </div>
    <SaveResearchDialog
      initialDraft={saveDraft}
      onClose={() => setSaveOpen(false)}
      onSave={handleSaveResearch}
      saving={saving}
      error={saveError}
      usage={lastUsage || undefined}
    />
    <CSVUploadDialog
      isOpen={csvUploadOpen}
      onClose={() => setCSVUploadOpen(false)}
      onSuccess={handleCSVUploadSuccess}
    />
    <BulkResearchDialog
      isOpen={bulkResearchOpen}
      onClose={() => setBulkResearchOpen(false)}
      onSuccess={(jobId, count) => {
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
