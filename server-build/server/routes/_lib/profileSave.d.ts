import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types.js';
export interface SaveProfilePayload {
    action: 'save_profile';
    profile?: Record<string, any> | null;
    custom_criteria?: any[] | null;
    signal_preferences?: any[] | null;
    disqualifying_criteria?: any[] | null;
    prompt_config?: Record<string, any> | null;
}
export interface SaveProfileResult {
    summary: string[];
    profile: Record<string, any> | null;
    customCriteria: any[];
    signalPreferences: any[];
    disqualifyingCriteria: any[];
    promptConfig: Record<string, any> | null;
}
type SupabaseDb = SupabaseClient<Database>;
export declare function extractSaveProfilePayloads(raw: string, limit?: number): SaveProfilePayload[];
export declare function applySaveProfilePayloads(supabase: SupabaseDb, userId: string, payloads: SaveProfilePayload[]): Promise<SaveProfileResult>;
export {};
