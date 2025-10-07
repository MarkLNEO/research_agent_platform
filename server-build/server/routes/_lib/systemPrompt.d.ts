export type AgentType = 'company_research' | 'settings_agent' | 'company_profiler';
type ResearchMode = 'quick' | 'deep' | 'specific' | undefined;
type NullableRecord = Record<string, any> | null | undefined;
export interface UserContext {
    profile?: NullableRecord;
    customCriteria?: any[];
    signals?: any[];
    disqualifiers?: any[];
    promptConfig?: NullableRecord;
    reportPreferences?: any[];
}
export declare function buildSystemPrompt(userContext: UserContext, agentType?: AgentType, researchMode?: ResearchMode): string;
export {};
