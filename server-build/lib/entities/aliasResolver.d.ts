import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';
type UserAliasRow = Database['public']['Tables']['user_entity_aliases']['Row'];
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
export declare function getUserAliasMaps(userId: string, client?: SupabaseClient<Database>): Promise<{
    aliasMap: Map<string, UserAliasRow>;
    canonicalMap: Map<string, UserAliasRow>;
}>;
export interface LearnUserAliasOptions extends LearnAliasOptions {
    client?: SupabaseClient<Database>;
}
export declare function learnUserAlias(userId: string, canonical: string, alias: string, options?: LearnUserAliasOptions): Promise<void>;
export declare function invalidateUserAliasCache(userId?: string): void;
export interface LearnAliasOptions {
    type?: string;
    metadata?: Json;
    source?: string;
    client?: SupabaseClient<Database>;
}
export declare function learnAlias(canonical: string, alias: string, options?: LearnAliasOptions): Promise<void>;
export {};
