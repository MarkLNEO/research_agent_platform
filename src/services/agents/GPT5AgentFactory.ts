/**
 * GPT-5 Agent Factory
 *
 * Creates properly configured agents with correct database field mappings
 */

import { ResearchAgent, SettingsAgent, ProfilerAgent } from './ResearchAgent';
import { UserContext, AgentConfig, AgentType } from './types';
import { buildCompleteContext } from './prompts/ContextBuilder';

/**
 * Agent Factory with GPT-5 optimizations
 */
export class GPT5AgentFactory {
  /**
   * Create an agent with proper configuration
   */
  static createAgent(
    type: AgentType,
    context: UserContext,
    config?: Partial<AgentConfig>
  ) {
    // Ensure we have valid context
    const validatedContext = this.validateContext(context);

    // Select optimal configuration based on agent type
    const optimizedConfig = this.getOptimalConfig(type, config);

    // Create the appropriate agent
    switch (type) {
      case 'company_research':
        return new ResearchAgent(validatedContext, optimizedConfig);

      case 'settings_agent':
        return new SettingsAgent(validatedContext, optimizedConfig);

      case 'company_profiler':
        return new ProfilerAgent(validatedContext, optimizedConfig);

      default:
        return new ResearchAgent(validatedContext, optimizedConfig);
    }
  }

  /**
   * Validate and normalize user context
   */
  private static validateContext(context: UserContext): UserContext {
    // Ensure all required fields exist
    const validated: UserContext = {
      profile: context.profile || null,
      customCriteria: context.customCriteria || [],
      signals: context.signals || [],
      disqualifiers: context.disqualifiers || [],
      promptConfig: context.promptConfig || null,
      reportPreferences: context.reportPreferences || [],
      agentType: context.agentType || 'company_research'
    };

    // Ensure arrays are properly typed
    if (validated.profile?.target_titles && !Array.isArray(validated.profile.target_titles)) {
      validated.profile.target_titles = [];
    }
    if (validated.profile?.seniority_levels && !Array.isArray(validated.profile.seniority_levels)) {
      validated.profile.seniority_levels = [];
    }
    if (validated.profile?.target_departments && !Array.isArray(validated.profile.target_departments)) {
      validated.profile.target_departments = [];
    }
    if (validated.profile?.competitors && !Array.isArray(validated.profile.competitors)) {
      validated.profile.competitors = [];
    }

    return validated;
  }

  /**
   * Get optimal configuration for agent type
   */
  private static getOptimalConfig(
    type: AgentType,
    userConfig?: Partial<AgentConfig>
  ): AgentConfig {
    const baseConfig: AgentConfig = {
      model: 'gpt-5-mini',
      streamingEnabled: true,
      apiEndpoint: '/api/ai/chat'
    };

    // Agent-specific optimizations
    const agentConfigs: Record<AgentType, Partial<AgentConfig>> = {
      company_research: {
        reasoning_effort: 'medium',
        verbosity: 'adaptive'
      },
      settings_agent: {
        reasoning_effort: 'low',
        verbosity: 'low'
      },
      company_profiler: {
        reasoning_effort: 'high',
        verbosity: 'medium'
      }
    };

    return {
      ...baseConfig,
      ...agentConfigs[type],
      ...userConfig // User config takes precedence
    };
  }

  /**
   * Create agent from database data
   */
  static async createFromDatabase(
    userId: string,
    agentType: AgentType,
    supabase: any
  ) {
    // Fetch user profile
    const { data: profile } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Fetch custom criteria
    const { data: customCriteria } = await supabase
      .from('user_custom_criteria')
      .select('*')
      .eq('user_id', userId)
      .order('display_order');

    // Fetch signal preferences
    const { data: signals } = await supabase
      .from('user_signal_preferences')
      .select('*')
      .eq('user_id', userId);

    // Fetch disqualifying criteria
    const { data: disqualifiers } = await supabase
      .from('user_disqualifying_criteria')
      .select('*')
      .eq('user_id', userId);

    // Build context
    const context: UserContext = {
      profile: profile || null,
      customCriteria: customCriteria || [],
      signals: signals || [],
      disqualifiers: disqualifiers || [],
      promptConfig: null,
      reportPreferences: [],
      agentType
    };

    return this.createAgent(agentType, context);
  }
}

/**
 * Helper function to build prompt with proper context
 */
export function buildPromptWithContext(
  basePrompt: string,
  context: UserContext,
  options?: {
    includeProfile?: boolean;
    includeCriteria?: boolean;
    includeSignals?: boolean;
    includeDisqualifiers?: boolean;
  }
): string {
  const contextString = buildCompleteContext(context, options);
  return `${basePrompt}\n\n${contextString}`;
}

/**
 * Export for convenience
 */
export default GPT5AgentFactory;