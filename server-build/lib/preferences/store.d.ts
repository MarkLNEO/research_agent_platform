import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';
import type { ResolvedPrefs } from '../../shared/preferences.js';
export type { ResolvedPrefs } from '../../shared/preferences.js';
export type PreferenceSource = 'setup' | 'followup' | 'implicit' | 'system';
export interface PreferenceUpsert {
    key: string;
    value: Json;
    confidence?: number;
    source?: PreferenceSource;
}
export type PreferenceRow = Database['public']['Tables']['user_preferences']['Row'];
export declare function upsertPreferences(userId: string, preferences: PreferenceUpsert[], client?: SupabaseClient<Database>): Promise<void>;
export declare function buildResolvedPreferences(promptConfig: Record<string, any> | null | undefined, preferenceRows: PreferenceRow[] | null | undefined): ResolvedPrefs;
export declare function getResolvedPreferences(userId: string, client?: SupabaseClient<Database>): Promise<{
    resolved: ResolvedPrefs;
    preferences: PreferenceRow[];
    promptConfig: Record<string, any> | null;
}>;
