import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';
export declare function invalidateAliasCache(): void;
export interface ResolvedEntity {
    canonical: string;
    type: string;
    confidence: number;
    matched: string;
    aliases: string[];
    metadata: Json | null;
    source: string | null;
}
export declare function resolveEntity(term: string, client?: SupabaseClient<Database>): Promise<ResolvedEntity | null>;
export interface LearnAliasOptions {
    type?: string;
    metadata?: Json;
    source?: string;
    client?: SupabaseClient<Database>;
}
export declare function learnAlias(canonical: string, alias: string, options?: LearnAliasOptions): Promise<void>;
