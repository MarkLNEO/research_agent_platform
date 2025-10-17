import { useState, useCallback, useRef } from 'react';
import { UserContext, ChatMessage } from '../services/agents/types';
import { ResearchAgent, SettingsAgent, ProfilerAgent } from '../services/agents/ResearchAgent';

export interface StreamingAgentOptions {
  agentType?: 'company_research' | 'settings_agent' | 'company_profiler';
  chatId?: string;
  onStreamUpdate?: (content: string) => void;
  onWebSearch?: (query: string, sources: string[]) => void;
  onReasoning?: (reasoning: string) => void;
  onError?: (error: string) => void;
}

export function useStreamingAgent(userContext: UserContext, options: StreamingAgentOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const agentType = options.agentType || userContext.agentType || 'company_research';

  // Create agent instance based on type
  const createAgent = useCallback(() => {
    const config = {
      model: 'gpt-5-mini',
      streamingEnabled: true,
      apiEndpoint: '/api/ai/chat'
    };

    switch (agentType) {
      case 'settings_agent':
        return new SettingsAgent(userContext, config);
      case 'company_profiler':
        return new ProfilerAgent(userContext, config);
      case 'company_research':
      default:
        return new ResearchAgent(userContext, config);
    }
  }, [agentType, userContext]);

  // Send message with streaming
  const sendMessage = useCallback(async (
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void
  ) => {
    setIsLoading(true);
    setError(null);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const agent = createAgent();

      // Get auth token
      const { supabase } = await import('@supabase/supabase-js').then(m => ({
        supabase: m.createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
      }));

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('No authentication session');
      }

      // Prepare request
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          messages: agent.optimizeContext(messages),
          chatId: options.chatId,
          agentType
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]' || !data) continue;

              try {
                const parsed = JSON.parse(data);

                switch (parsed.type) {
                  case 'content':
                    accumulated += parsed.content;
                    onChunk?.(parsed.content);
                    options.onStreamUpdate?.(parsed.content);
                    break;

                  case 'web_search':
                    options.onWebSearch?.(parsed.query, parsed.sources);
                    break;

                  case 'reasoning':
                    options.onReasoning?.(parsed.content);
                    break;

                  case 'error':
                    throw new Error(parsed.error);

                  case 'done':
                    // Stream completed
                    break;
                }
              } catch (e) {
                console.error('Failed to parse streaming chunk:', e);
              }
            }
          }
        }
      }

      setIsLoading(false);
      return accumulated;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Streaming error:', err);
        setError(err.message);
        options.onError?.(err.message);
      }
      setIsLoading(false);
      throw err;
    }
  }, [createAgent, agentType, options]);

  // Stop streaming
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return {
    sendMessage,
    stop,
    isLoading,
    error,
    agentType
  };
}
