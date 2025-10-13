// Shared request/response contracts for chat API and frontend consumers

export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export type AgentType = 'company_research' | 'settings_agent' | 'company_profiler';

export interface ChatRequestBody {
  messages: ChatMessage[];
  systemPrompt?: string;
  chatId?: string;
  agentType?: AgentType;
  config?: {
    model?: 'gpt-5-nano' | 'gpt-5-mini' | 'gpt-5' | string;
    reasoning_effort?: 'low' | 'medium' | 'high';
  };
}

export type SSEEvent =
  | { type: 'content'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'web_search'; query: string; sources: string[] }
  | { type: 'meta'; response_id: string; model: string }
  | { type: 'done'; response_id?: string }
  | { type: 'error'; error: string };

export interface UsageLogMetadata {
  chat_id?: string;
  agent_type?: AgentType;
  model?: string;
  api?: 'responses' | 'completions';
  chunks?: number;
}
