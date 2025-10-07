export interface UserProfile {
  company_name?: string;
  company_url?: string;
  industry?: string;
  linkedin_url?: string;
  youtube_channel?: string;
  user_role?: string;
  use_case?: string;
  icp_definition?: string;
  target_titles?: string[];
  seniority_levels?: string[];
  target_departments?: string[];
  competitors?: string[];
  metadata?: {
    research_depth?: 'quick' | 'deep';
  };
}

export interface CustomCriteria {
  field_name: string;
  field_type: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  hints?: string[];
  display_order?: number;
}

export interface SignalPreference {
  signal_type: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  lookback_days: number;
  config?: Record<string, any>;
}

export interface DisqualifyingCriteria {
  criterion: string;
}

export interface PromptConfig {
  include_company_context?: boolean;
  include_custom_criteria?: boolean;
  include_signal_preferences?: boolean;
  include_icp_definition?: boolean;
  include_competitors?: boolean;
  include_decision_maker_targets?: boolean;
  include_disqualifying_criteria?: boolean;
  custom_prompt_additions?: string;
}

export interface ReportPreference {
  report_type: string;
  sections?: Array<{
    name: string;
    enabled: boolean;
    order: number;
    detail_level?: string;
  }>;
  custom_instructions?: string;
  is_active?: boolean;
}

export interface UserContext {
  profile: UserProfile | null;
  customCriteria: CustomCriteria[];
  signals: SignalPreference[];
  disqualifiers: DisqualifyingCriteria[];
  promptConfig: PromptConfig | null;
  reportPreferences: ReportPreference[];
  agentType?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentConfig {
  model?: string;
  temperature?: number; // Not used in GPT-5 but kept for compatibility
  maxTokens?: number; // Not used in GPT-5 but kept for compatibility
  streamingEnabled?: boolean;
  apiEndpoint?: string;
  // GPT-5 specific parameters
  reasoning_effort?: 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high' | 'adaptive';
  store?: boolean; // Enable conversation persistence
  previous_response_id?: string; // For conversation chaining
}

export type AgentType =
  | 'company_research'
  | 'settings_agent'
  | 'company_profiler';

export interface AgentResponse {
  content: string;
  reasoning?: string;
  webSearches?: Array<{
    query: string;
    sources: string[];
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}