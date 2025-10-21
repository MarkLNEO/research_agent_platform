import type { ResolvedPrefs, PreferenceRow } from '../../../lib/preferences/store.js';
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
    preferences?: PreferenceRow[];
    resolvedPrefs?: ResolvedPrefs;
    openQuestions?: any[];
    canonicalEntities?: Array<{
        canonical: string;
        type: string;
        confidence?: number;
        matched?: string;
    }>;
    unresolvedEntities?: string[];
    unresolvedAliasHints?: Array<{
        term: string;
        suggestion?: string;
    }>;
    recentPreferenceConfirmations?: Array<{
        key: string;
        label?: string;
    }>;
    recentAliasConfirmations?: Array<{
        alias: string;
        canonical: string;
    }>;
}
export declare function buildSystemPrompt(userContext: UserContext, agentType?: AgentType, researchMode?: ResearchMode): string;
export {};
