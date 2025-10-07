import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { ChevronDown, ArrowRight, AlertCircle, AlertTriangle, ArrowLeft, Zap } from 'lucide-react';
import type { AgentType } from '../services/agents/types';
import { useUserProfile } from '../hooks/useUserProfile';
import { getUserFriendlyError } from '../utils/retry';
import { SaveResearchDialog } from '../components/SaveResearchDialog';
import { buildResearchDraft, approximateTokenCount, normalizeSourceEvents, type ResearchDraft } from '../utils/researchOutput';
import type { CreditEstimate } from '../utils/creditEstimation';
import { useResearchEngine } from '../contexts/ResearchEngineContext';
import { TemplateGallery } from '../components/TemplateGallery';
import { TemplateInputEditor } from '../components/TemplateInputEditor';
import { GuardrailSelector } from '../components/GuardrailSelector';
import { SignalPreview } from '../components/SignalPreview';
import { CapabilityPlanCard } from '../components/CapabilityPlanCard';
import { PlaybookList } from '../components/PlaybookList';
import { buildTemplateKickoffMarkdown } from '../utils/templateRun';
import { DashboardGreeting } from '../components/DashboardGreeting';

const LOW_BALANCE_THRESHOLD = 10;

interface MessageMetadata {
  tokens_used?: number;
  credits_used?: number;
  sources?: { url: string; query?: string }[];
  research_output_id?: string;
  [key: string]: any;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  streaming?: boolean;
  metadata?: MessageMetadata;
}

interface ThinkingEvent {
  id: string;
  type: 'reasoning' | 'web_search';
  content?: string;
  query?: string;
  sources?: string[];
}

interface Chat {
  id: string;
  title: string;
  agent_type?: AgentType;
  created_at: string;
  metadata?: Record<string, any> | null;
}

interface ResponseMetadata {
  webEvents: { query?: string; sources?: string[] }[];
}

export function DashboardNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  // Minimal local agent catalog to decouple from deprecated src/config/agents
  const LOCAL_AGENTS = [
    {
      id: 'company_research' as AgentType,
      label: 'Company Researcher',
      description: 'Deep research on specific companies with scoring and insights',
    }
  ];
  const getAgentById = (id: AgentType) => LOCAL_AGENTS.find(a => a.id === id) || LOCAL_AGENTS[0];
  const [selectedAgent, setSelectedAgent] = useState(LOCAL_AGENTS[0]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const [userCredits, setUserCredits] = useState({ remaining: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [researchDraft, setResearchDraft] = useState<ResearchDraft | null>(null);
  const [draftContext, setDraftContext] = useState<{
    messageId: string;
    chatId: string;
    usage?: { tokens: number; credits: number };
    researchOutputId?: string;
  } | null>(null);
  const [savingResearch, setSavingResearch] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [currentEstimate, setCurrentEstimate] = useState<CreditEstimate | null>(null);
  const [lowBalanceDismissed, setLowBalanceDismissed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const responseMetadataRef = useRef<ResponseMetadata>({ webEvents: [] });
  const lastUserMessageRef = useRef<Message | null>(null);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);
  const autoPromptedMessagesRef = useRef(new Set<string>());
  const [pendingAutoPrompt, setPendingAutoPrompt] = useState<string | null>(null);
  const assistantInsertedRef = useRef(false);

  const {
    templates,
    selectedTemplate,
    selectedTemplateId,
    selectTemplate,
    templateInputs,
    updateTemplateInput,
    replaceTemplateInputs,
    guardrailProfiles,
    selectedGuardrailProfile,
    selectGuardrailProfile,
    signalSets,
    selectedSignalSet,
    selectSignalSet,
    capabilityPlan,
    playbooks,
    selectedPlaybook,
    selectPlaybook,
    qualityChecklist
  } = useResearchEngine();

  const qualitySummary = useMemo(() => {
    if (qualityChecklist.length === 0) return '';
    return qualityChecklist
      .slice(0, 3)
      .map(item => item.label)
      .join(' • ');
  }, [qualityChecklist]);

  const templateMetadata = useMemo(() => {
    if (!selectedTemplate || !selectedGuardrailProfile || !selectedSignalSet) return null;
    return {
      template_id: selectedTemplate.id,
      template_version: selectedTemplate.version,
      guardrail_profile_id: selectedGuardrailProfile.id,
      signal_set_id: selectedSignalSet.id,
      template_inputs: templateInputs,
      tools_policy: selectedTemplate.tools_policy,
      quality_bar: selectedTemplate.quality_bar,
      exports: selectedTemplate.export,
      playbook_id: selectedPlaybook?.id ?? null
    };
  }, [selectedTemplate, selectedGuardrailProfile, selectedSignalSet, templateInputs, selectedPlaybook]);

  const handleGuardrailClick = () => {
    const element = document.getElementById('guardrail-panel');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const {
    profile: profileData,
    customCriteriaCount,
    signalPreferencesCount
  } = useUserProfile();

  const isLowBalance = userCredits.remaining > 0 && userCredits.remaining <= LOW_BALANCE_THRESHOLD;
  const isEstimateTooHigh = currentEstimate ? currentEstimate.max > userCredits.remaining : false;
  const showLowBalanceAlert = !lowBalanceDismissed && (isLowBalance || isEstimateTooHigh);

  useEffect(() => {
    loadChats();
    loadUserCredits();
  }, [user]);

  useEffect(() => {
    const state = location.state as { chatId?: string } | null;
    if (state?.chatId) {
      setCurrentChatId(state.chatId);
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    setLowBalanceDismissed(false);
  }, [userCredits.remaining]);

  useEffect(() => {
    if (!currentChatId) return;
    const chat = chats.find(item => item.id === currentChatId);
    if (!chat) return;

    if (chat.agent_type) {
      const agentConfig = getAgentById(chat.agent_type);
      if (agentConfig) {
        setSelectedAgent(agentConfig);
      }
    }

    const metadata = chat.metadata as Record<string, any> | undefined;
    if (metadata?.template_id) {
      if (metadata.template_id !== selectedTemplateId) {
        selectTemplate(metadata.template_id);
      }

      if (metadata.template_inputs && typeof metadata.template_inputs === 'object') {
        replaceTemplateInputs(metadata.template_inputs as Record<string, unknown>);
      }

      if (metadata.guardrail_profile_id) {
        selectGuardrailProfile(metadata.guardrail_profile_id);
      }

      if (metadata.signal_set_id) {
        selectSignalSet(metadata.signal_set_id);
      }

      if (metadata.playbook_id) {
        selectPlaybook(metadata.playbook_id);
      }
    }

    if (!metadata?.playbook_id) {
      selectPlaybook(null);
    }
  }, [currentChatId, chats, selectTemplate, replaceTemplateInputs, selectGuardrailProfile, selectSignalSet, selectPlaybook, selectedTemplateId]);

  const loadUserCredits = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('users')
      .select('credits_remaining, credits_total')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setUserCredits({
        remaining: data.credits_remaining || 0,
        total: data.credits_total || 0
      });
    }
  };


  const resetResponseMetadata = () => {
    responseMetadataRef.current = { webEvents: [] };
  };

  const findPreviousUserMessage = (assistantMessageId: string): Message | null => {
    const index = messages.findIndex(m => m.id === assistantMessageId);
    if (index === -1) return lastUserMessageRef.current;

    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }

    return lastUserMessageRef.current;
  };

  const attachUsageAndMetadata = async (
    chatId: string,
    messageId: string,
    assistantContent: string,
    userContent: string,
    metadataSnapshot: ResponseMetadata
  ) => {
    if (!user) return;

    try {
      const { data: usageData } = await supabase
        .from('usage_logs')
        .select('id, tokens_used, metadata, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6);

      const usageEntry = usageData?.find((entry: any) => entry.metadata?.chat_id === chatId);
      const tokensUsed = usageEntry?.tokens_used ?? approximateTokenCount(assistantContent);
      const creditsUsed = Math.max(1, Math.ceil(tokensUsed / 1000));
      const normalizedSources = normalizeSourceEvents(metadataSnapshot.webEvents);

      const metadataPayload = {
        tokens_used: tokensUsed,
        credits_used: creditsUsed,
        sources: normalizedSources,
        user_prompt: userContent,
        generated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('messages')
        .update({ metadata: metadataPayload })
        .eq('id', messageId);

      if (error) {
        console.error('Failed to update message metadata', error);
      }

      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId
            ? { ...msg, metadata: { ...(msg.metadata || {}), ...metadataPayload } }
            : msg
        )
      );

      const existingMessage = messages.find(msg => msg.id === messageId);
      const wordCount = assistantContent.split(/\s+/).filter(Boolean).length;
      const shouldPrompt =
        !existingMessage?.metadata?.research_output_id &&
        !autoPromptedMessagesRef.current.has(messageId) &&
        (normalizedSources.length > 0 || wordCount >= 80);

      if (shouldPrompt) {
        setPendingAutoPrompt(messageId);
      }
    } catch (err) {
      console.error('Failed to attach usage metadata', err);
    }
  };

  const handleOpenSaveDialog = (message: Message) => {
    if (!currentChatId) return;

    autoPromptedMessagesRef.current.add(message.id);

    const chat = chats.find(c => c.id === currentChatId);
    const agentType = chat?.agent_type;
    const priorUserMessage = findPreviousUserMessage(message.id);

    const draft = buildResearchDraft({
      assistantMessage: message.content,
      userMessage: priorUserMessage?.content,
      chatTitle: chat?.title,
      agentType,
      sources: message.metadata?.sources,
    });

    const mergedDraft: ResearchDraft = {
      ...draft,
      icp_fit_score: message.metadata?.icp_fit_score ?? draft.icp_fit_score,
      signal_score: message.metadata?.signal_score ?? draft.signal_score,
      composite_score: message.metadata?.composite_score ?? draft.composite_score,
      priority_level: message.metadata?.priority_level ?? draft.priority_level,
      confidence_level: message.metadata?.confidence_level ?? draft.confidence_level,
      sources: message.metadata?.sources ?? draft.sources,
    };

    setResearchDraft(mergedDraft);
    setDraftContext({
      messageId: message.id,
      chatId: currentChatId,
      usage: message.metadata?.tokens_used
        ? {
            tokens: message.metadata.tokens_used,
            credits: message.metadata.credits_used ?? Math.max(1, Math.ceil(message.metadata.tokens_used / 1000)),
          }
        : undefined,
      researchOutputId: message.metadata?.research_output_id,
    });
    setSaveDialogOpen(true);
  };

  useEffect(() => {
    if (!pendingAutoPrompt || saveDialogOpen) return;
    const messageToPrompt = messages.find(message => message.id === pendingAutoPrompt);
    if (!messageToPrompt) return;

    setPendingAutoPrompt(null);
    handleOpenSaveDialog(messageToPrompt);
  }, [pendingAutoPrompt, saveDialogOpen, messages, handleOpenSaveDialog]);

  const handleSaveResearch = async (draft: ResearchDraft) => {
    if (!user || !draftContext) return;

    setSavingResearch(true);
    setSaveError(null);

    try {
      const tokensUsed = draftContext.usage?.tokens ?? approximateTokenCount(draft.markdown_report || draft.executive_summary || '');
      const creditsUsed = Math.max(1, Math.ceil(tokensUsed / 1000));
      const normalizedSources = draft.sources ?? [];
      const existingMessage = messages.find(message => message.id === draftContext.messageId);

      const dataPayload = {
        executive_summary: draft.executive_summary,
        markdown_report: draft.markdown_report,
        company_data: draft.company_data ?? {},
        buying_signals: draft.buying_signals ?? [],
        custom_criteria_assessment: draft.custom_criteria_assessment ?? [],
        personalization_points: draft.personalization_points ?? [],
        recommended_actions: draft.recommended_actions ?? {},
        leadership_team: draft.leadership_team ?? [],
      };

      const basePayload = {
        user_id: user.id,
        chat_id: draftContext.chatId,
        research_type: draft.research_type,
        subject: draft.subject,
        data: dataPayload,
        sources: normalizedSources,
        tokens_used: tokensUsed,
        icp_fit_score: draft.icp_fit_score,
        signal_score: draft.signal_score,
        composite_score: draft.composite_score,
        priority_level: draft.priority_level,
        executive_summary: draft.executive_summary,
        company_data: draft.company_data ?? {},
        leadership_team: draft.leadership_team ?? [],
        buying_signals: draft.buying_signals ?? [],
        custom_criteria_assessment: draft.custom_criteria_assessment ?? [],
        personalization_points: draft.personalization_points ?? [],
        recommended_actions: draft.recommended_actions ?? {},
        markdown_report: draft.markdown_report,
        confidence_level: draft.confidence_level,
      };

      let savedOutput;
      if (draftContext.researchOutputId) {
        const { data, error } = await supabase
          .from('research_outputs')
          .update(basePayload)
          .eq('id', draftContext.researchOutputId)
          .select()
          .single();

        if (error) throw error;
        savedOutput = data;
      } else {
        const { data, error } = await supabase
          .from('research_outputs')
          .insert(basePayload)
          .select()
          .single();

        if (error) throw error;
        savedOutput = data;
      }

      const nextMetadata = {
        ...(existingMessage?.metadata || {}),
        tokens_used: tokensUsed,
        credits_used: creditsUsed,
        sources: normalizedSources,
        research_output_id: savedOutput.id,
        icp_fit_score: draft.icp_fit_score,
        signal_score: draft.signal_score,
        composite_score: draft.composite_score,
        priority_level: draft.priority_level,
        confidence_level: draft.confidence_level,
      };

      const { error: metadataError } = await supabase
        .from('messages')
        .update({ metadata: nextMetadata })
        .eq('id', draftContext.messageId);

      if (metadataError) {
        throw metadataError;
      }

      setMessages(prev =>
        prev.map(message =>
          message.id === draftContext.messageId
            ? { ...message, metadata: nextMetadata }
            : message
        )
      );

      setSaveSuccess(draftContext.researchOutputId ? 'Research output updated successfully.' : 'Research output saved to history.');
      setSaveDialogOpen(false);
      setResearchDraft(null);
      setDraftContext({
        messageId: draftContext.messageId,
        chatId: draftContext.chatId,
        usage: { tokens: tokensUsed, credits: creditsUsed },
        researchOutputId: savedOutput.id,
      });
    } catch (error: any) {
      console.error('Failed to save research output', error);
      setSaveError(getUserFriendlyError(error) || error?.message || 'Unable to save research output.');
    } finally {
      setSavingResearch(false);
    }
  };



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
      const lastUserMessage = [...data].reverse().find(message => message.role === 'user') || null;
      lastUserMessageRef.current = lastUserMessage;
    }
  };

  const createNewChat = async (options?: {
    title?: string;
    agentType?: AgentType;
    metadata?: Record<string, any>;
  }) => {
    if (!user) return null;

    const { data } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: options?.title ?? selectedAgent.label,
        agent_type: options?.agentType ?? selectedAgent.id,
        metadata: options?.metadata ?? {}
      })
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

  const handleSendMessageWithChat = async (chatId: string, message: string) => {
    if (!message.trim() || loading) return;

    // Duplicate-send suppression: ignore identical message within 4s
    const normalized = message.trim();
    const now = Date.now();
    const lastSent = lastSentRef.current;
    if (lastSent && lastSent.text === normalized.toLowerCase() && now - lastSent.at < 4000) {
      return;
    }
    lastSentRef.current = { text: normalized.toLowerCase(), at: now };

    setLoading(true);
    setStreamingMessage('');
    setThinkingEvents([]);
    setSaveError(null);
    setSaveSuccess(null);
    resetResponseMetadata();
    assistantInsertedRef.current = false;

    const tempUserMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const { data: savedUserMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          role: 'user',
          content: message,
        })
        .select()
        .single();

      if (savedUserMsg) {
        lastUserMessageRef.current = savedUserMsg;
      }

      const response = await streamAIResponse(message);

      // Prevent duplicate insertions in case of race or re-entry
      if (assistantInsertedRef.current) {
        setStreamingMessage('');
        setThinkingEvents([]);
        return;
      }
      assistantInsertedRef.current = true;
      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          role: 'assistant',
          content: response,
        })
        .select()
        .single();

      await supabase
        .from('chats')
        .update({
          updated_at: new Date().toISOString(),
          title: messages.length === 0 ? message.slice(0, 60) : undefined
        })
        .eq('id', chatId);

      setMessages(prev =>
        prev.filter(m => m.id !== tempUserMsg.id)
          .concat([savedUserMsg, savedAssistantMsg])
      );
      setStreamingMessage('');
      setThinkingEvents([]);

      const metadataSnapshot: ResponseMetadata = {
        webEvents: [...responseMetadataRef.current.webEvents],
      };
      resetResponseMetadata();

      if (savedAssistantMsg && savedUserMsg) {
        void attachUsageAndMetadata(chatId, savedAssistantMsg.id, response, savedUserMsg.content, metadataSnapshot);
      }

      loadChats();
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setStreamingMessage('');
      setThinkingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage = inputValue;
    setInputValue('');

    if (!currentChatId) {
      const newChatId = await createNewChat({
        title: selectedTemplate?.label ?? selectedAgent.label,
        agentType: 'company_research',
        metadata: templateMetadata
          ? { ...templateMetadata, capability_plan: capabilityPlan }
          : {}
      });
      if (newChatId) {
        await handleSendMessageWithChat(newChatId, userMessage);
      }
      return;
    }

    await handleSendMessageWithChat(currentChatId, userMessage);
  };

  const launchTemplateRun = async () => {
    if (!selectedTemplate || !selectedGuardrailProfile || !selectedSignalSet) return;

    setSelectedAgent(getAgentById('company_research'));

    const metadata = templateMetadata
      ? { ...templateMetadata, capability_plan: capabilityPlan }
      : { capability_plan: capabilityPlan };

    const chatId = await createNewChat({
      title: `${selectedTemplate.label} • ${new Date().toLocaleDateString()}`,
      agentType: 'company_research',
      metadata
    });

    if (!chatId) return;

    setCurrentChatId(chatId);

    const kickoffMarkdown = buildTemplateKickoffMarkdown({
      template: selectedTemplate,
      inputs: templateInputs,
      guardrail: selectedGuardrailProfile,
      signalSet: selectedSignalSet,
      capabilityPlan,
      qualityChecklist
    });

    const { data: kickoffMessage, error: kickoffError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        role: 'assistant',
        content: kickoffMarkdown,
        metadata: {
          ...metadata,
          kickoff: true
        }
      })
      .select()
      .single();

    if (kickoffError || !kickoffMessage) {
      setMessages([
        {
          id: `local-${Date.now()}`,
          role: 'assistant',
          content: kickoffMarkdown,
          created_at: new Date().toISOString()
        }
      ]);
    } else {
      setMessages([kickoffMessage]);
    }

    await loadChats();
  };



  const streamAIResponse = async (userMessage: string): Promise<string> => {
    try {
      const conversationHistory = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      conversationHistory.push({
        role: 'user',
        content: userMessage
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const templateConfig = templateMetadata
        ? { ...templateMetadata, capability_plan: capabilityPlan }
        : undefined;

      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'dashboard', ts: Date.now() } })); } catch {}
      // Use Vercel API by default; opt-out only if explicitly disabled
      const chatUrl = '/api/ai/chat';

      const response = await fetch(
        chatUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: conversationHistory,
            stream: true,
            chat_id: currentChatId,
            template_config: templateConfig
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Response Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
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
              if (data === '[DONE]' || !data) continue;

              try {
                const parsed = JSON.parse(data);

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
                  setThinkingEvents(prev => [...prev, {
                    id: `search-${Date.now()}`,
                    type: 'web_search',
                    query: parsed.query,
                    sources: parsed.sources
                  }]);
                }
                // Responses API format: support both canonical and simplified events
                else if (parsed.type === 'response.output_text.delta' || parsed.type === 'content') {
                  const content = parsed.delta || parsed.content;
                  if (content) {
                    if (firstDeltaAt == null) {
                      firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                      try { window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'dashboard', ttfbMs: firstDeltaAt - startedAt } })); } catch {}
                    }
                    fullText += content;
                    setStreamingMessage(fullText);
                  }
                }
                // Also support Chat Completions format for backward compatibility
                else if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  if (firstDeltaAt == null) {
                    firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                    try { window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'dashboard', ttfbMs: firstDeltaAt - startedAt } })); } catch {}
                  }
                  fullText += content;
                  setStreamingMessage(fullText);
                }
              } catch (_e) {
                // Silently skip parse errors for non-critical events
              }
            }
          }
        }
      }

      try {
        const endedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        window.dispatchEvent(new CustomEvent('llm:complete', { detail: { page: 'dashboard', totalMs: endedAt - startedAt, ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null } }));
      } catch {}
      return fullText;
    } catch (error: any) {
      console.error('OpenAI error:', error);
      const errorMessage = error?.message || String(error);
      return `I apologize, but I encountered an error: ${errorMessage}`;
    }
  };

  const getUserInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'Y';
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
        profile={profileData}
        customCriteriaCount={customCriteriaCount}
        signalPreferencesCount={signalPreferencesCount}
        onHome={() => navigate('/')}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {showAgentDropdown && (
          <div className="absolute top-4 left-16 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
            <div className="px-4 py-3 border-b border-gray-200">
              <span className="font-medium text-gray-900">Select Agent</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {LOCAL_AGENTS.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgent(agent);
                    setShowAgentDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selectedAgent.id === agent.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 mt-0.5 flex-shrink-0 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">{agent.label[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{agent.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{agent.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full px-6 py-8">
              <div className="max-w-6xl mx-auto space-y-8">
                {/* Dashboard Greeting with signals and proactive insights */}
                <DashboardGreeting
                  onSuggestionClick={(suggestion) => {
                    setInputValue(suggestion);
                  }}
                  onSignalClick={(company) => {
                    const next = `Research ${company} and show me what changed`;
                    setInputValue(next);
                    // Immediately send the message
                    void (async () => {
                      if (!currentChatId) {
                        const newChatId = await createNewChat({
                          title: selectedTemplate?.label ?? selectedAgent.label,
                          agentType: 'company_research',
                          metadata: templateMetadata
                            ? { ...templateMetadata, capability_plan: capabilityPlan }
                            : {}
                        });
                        if (newChatId) await handleSendMessageWithChat(newChatId, next);
                        return;
                      }
                      await handleSendMessageWithChat(currentChatId, next);
                    })();
                  }}
                  onViewAccounts={() => {
                    window.dispatchEvent(new CustomEvent('show-tracked-accounts'));
                  }}
                />

                {/* Template Console Section */}
                <div className="border-t border-gray-200 pt-8">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-serif text-gray-900">Universal Brief Console</h2>
                      <p className="text-gray-600 mt-1">
                        Configure templates, guardrails, and signals to launch research instantly.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => selectPlaybook(null)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Reset config
                      </button>
                      <button
                        onClick={launchTemplateRun}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Launch brief
                      </button>
                    </div>
                  </div>

                <div className="grid lg:grid-cols-[2fr,1fr] gap-6">
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-gray-900">Saved playbooks</h2>
                        {selectedPlaybook && (
                          <span className="text-xs text-blue-600 font-medium">Active: {selectedPlaybook.label}</span>
                        )}
                      </div>
                      <PlaybookList
                        playbooks={playbooks}
                        selectedId={selectedPlaybook?.id ?? undefined}
                        onSelect={selectPlaybook}
                      />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-gray-900">Use-case templates</h2>
                        <span className="text-xs text-gray-500">{templates.length} available</span>
                      </div>
                      <TemplateGallery
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={selectTemplate}
                      />
                    </div>

                    {selectedTemplate && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-sm font-semibold text-gray-900">Template inputs</h2>
                          <span className="text-xs text-gray-500">Required fields marked</span>
                        </div>
                        <TemplateInputEditor
                          template={selectedTemplate}
                          values={templateInputs}
                          onChange={updateTemplateInput}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div id="guardrail-panel" className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                      <h2 className="text-sm font-semibold text-gray-900 mb-4">Guardrail profiles</h2>
                      <GuardrailSelector
                        profiles={guardrailProfiles}
                        selectedId={selectedGuardrailProfile?.id}
                        onSelect={selectGuardrailProfile}
                      />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                      <h2 className="text-sm font-semibold text-gray-900 mb-4">Signal detectors</h2>
                      <SignalPreview
                        signalSets={signalSets}
                        selectedId={selectedSignalSet?.id}
                        onSelect={selectSignalSet}
                      />
                    </div>

                    <CapabilityPlanCard plan={capabilityPlan} />

                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                      <h2 className="text-sm font-semibold text-gray-900 mb-3">Quality checklist</h2>
                      <ul className="space-y-2">
                        {qualityChecklist.map(item => (
                          <li key={item.id} className="text-xs text-gray-600 flex items-start gap-2">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            <span>
                              <span className="font-medium text-gray-800">{item.label}</span>
                              {item.description ? ` — ${item.description}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-8">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => {
                    setCurrentChatId(null);
                    setMessages([]);
                    setStreamingMessage('');
                    setThinkingEvents([]);
                    setErrorMessage(null);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </button>
                <button
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                  className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
                >
                  <div className="w-4 h-4 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold">{selectedAgent.label[0]}</div>
                  {selectedAgent.label}
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-900 mb-1">Error</h3>
                      <p className="text-sm text-red-800">{errorMessage}</p>
                      <button
                        onClick={() => setErrorMessage(null)}
                        className="mt-2 text-sm text-red-700 hover:text-red-900 font-medium underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {saveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-emerald-900 mb-1">Saved</h3>
                      <p className="text-sm text-emerald-800">{saveSuccess}</p>
                      <button
                        onClick={() => setSaveSuccess(null)}
                        className="mt-2 text-sm text-emerald-700 hover:text-emerald-900 font-medium underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showLowBalanceAlert && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-amber-900">
                      <p className="font-semibold mb-1">Low credit balance</p>
                      <p className="mb-2">
                        {isEstimateTooHigh
                          ? 'This request is likely to exceed your remaining credits. Consider topping up before running large research jobs.'
                          : 'You are running low on credits. Add more to avoid interruptions in your research workflows.'}
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => navigate('/settings')}
                          className="inline-flex items-center px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors"
                        >
                          Manage credits
                        </button>
                        <button
                          onClick={() => setLowBalanceDismissed(true)}
                          className="text-xs text-amber-800/80 hover:text-amber-900 underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {messages.map((message, index) => (
                  (() => {
                    const canInteract =
                      message.role === 'assistant' &&
                      index === messages.length - 1 &&
                      !message.streaming &&
                      !streamingMessage;

                    return (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    userName={getUserInitial()}
                    showActions={canInteract}
                    onPromote={canInteract ? () => handleOpenSaveDialog(message) : undefined}
                    disablePromote={loading}
                    streaming={message.streaming}
                  />
                    );
                  })()
                ))}

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

                {streamingMessage && (
                  <MessageBubble
                    role="assistant"
                    content={streamingMessage}
                    userName={getUserInitial()}
                    showActions={false}
                  />
                )}

                {loading && !streamingMessage && thinkingEvents.length === 0 && (
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
            </div>
          )}
      </div>

      {messages.length > 0 && (
        <div className="bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 py-4">
              <MessageInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                disabled={loading}
                placeholder="Reply to Agent..."
                selectedAgent={selectedAgent.label}
                guardrailProfileName={selectedGuardrailProfile?.label}
                onGuardrailClick={handleGuardrailClick}
                qualityChecklistSummary={qualitySummary}
                onEstimateChange={setCurrentEstimate}
              />
          </div>
        </div>
      )}
    </div>
    <SaveResearchDialog
      open={saveDialogOpen}
      initialDraft={researchDraft}
      onClose={() => {
        if (draftContext?.messageId) {
          autoPromptedMessagesRef.current.add(draftContext.messageId);
        }
        setSaveDialogOpen(false);
        setSaveError(null);
        setResearchDraft(null);
        setDraftContext(null);
      }}
      onSave={handleSaveResearch}
      saving={savingResearch}
      usage={draftContext?.usage}
      error={saveError}
    />
  </div>
);
}
