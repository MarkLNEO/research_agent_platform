import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { useToast } from '../components/ToastProvider';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ProfileCompleteness } from '../components/ProfileCompleteness';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { ArrowLeft, User, ChevronDown } from 'lucide-react';
import type { TrackedAccount } from '../services/accountService';

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
  const [streamingMessage, setStreamingMessage] = useState('');
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  const refreshProfileData = async () => {
    if (!user) return null;

    const [profileResult, criteriaResult, signalsResult] = await Promise.all([
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
        .eq('user_id', user.id)
    ]);

    const profile = profileResult.data;
    setProfileData(profile);
    setCustomCriteriaCount(criteriaResult.data?.length || 0);
    setSignalPreferencesCount(signalsResult.data?.length || 0);
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
        title: 'Settings Agent',
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

      systemPrompt = `The user ${userName} already has a company profile with the following details:\n${profileSummary.join('\n')}\n\nGreet them warmly, acknowledge their existing profile, and offer to help them review, update, or refine any aspect of it. Be conversational and helpful. Mention 1-2 specific things from their profile to show you're aware of it.`;
    } else {
      systemPrompt = `Greet the user ${userName} warmly and help them get started with creating their company profile. Explain briefly how having a detailed profile will help with research quality, then ask them to start by sharing their company name and industry.`;
    }

    try {
      const fullResponse = await streamAIResponse(systemPrompt, chatId, true);

      // Persist streamed message after completion
      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: fullResponse })
        .select()
        .single();

      if (savedAssistantMsg) {
        setMessages(prev => {
          // Replace streaming view with saved message
          return [savedAssistantMsg];
        });
        setStreamingMessage('');
      }

      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

    } catch (error) {
      console.error('Error sending initial greeting:', error);
      addToast({ type: 'error', title: 'Failed to initialize', description: 'Could not start the Settings Agent. Please try again.' });
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

      const fullResponse = await streamAIResponse(userMessage);

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

      const chatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      // Instrumentation start
      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'settings', url: chatUrl, ts: Date.now() } })); } catch {}
      const response = await fetch(
        chatUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            messages: conversationHistory,
            stream: true,
            chat_id: activeChatId
          }),
        }
      );

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
                // Responses API format
                else if (parsed.type === 'response.output_text.delta') {
                  const content = parsed.delta;
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

          const updateProfileUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-profile`;

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
        onCompanyProfile={() => navigate('/settings-agent')}
        onResearchHistory={() => navigate('/research')}
        onSettings={() => navigate('/settings')}
        onAccountClick={(account: TrackedAccount) => {
          // Jump to dashboard and research the selected account
          navigate(`/?q=${encodeURIComponent(`Research ${account.company_name}`)}`);
        }}
        onAddAccount={() => navigate('/')}
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
                <span className="font-medium">Settings Agent</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {agentMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setAgentMenuOpen(false); navigate('/'); }}
                  >
                    Research Agent
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setAgentMenuOpen(false); navigate('/settings-agent'); }}
                  >
                    Settings Agent
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
                {/* Streaming status / thinking events */}
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
                {/* Fallback loader if nothing has streamed yet */}
                {loading && !streamingMessage && thinkingEvents.length === 0 && (
                  <ThinkingIndicator type={"reasoning_progress" as any} content="Preparing suggestions..." />
                )}
                {streamingMessage && (
                  <MessageBubble
                    role="assistant"
                    content={streamingMessage}
                    userName={getUserInitial()}
                    showActions={false}
                  />
                )}
                {profileData && (
                  <ProfileCompleteness
                    profile={{
                      ...profileData,
                      custom_criteria_count: customCriteriaCount,
                      signal_preferences_count: signalPreferencesCount
                    }}
                  />
                )}
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    userName={getUserInitial()}
                    showActions={message.role === 'assistant' && index === messages.length - 1 && !streamingMessage}
                  />
                ))}

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
                selectedAgent="Settings Agent"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
