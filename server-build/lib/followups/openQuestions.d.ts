import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';
export type OpenQuestionRow = Database['public']['Tables']['open_questions']['Row'];
export interface ListOptions {
    limit?: number;
}
export declare function listOpenQuestions(userId: string, options?: ListOptions, client?: SupabaseClient<Database>): Promise<OpenQuestionRow[]>;
export interface AddQuestionInput {
    question: string;
    context?: Json;
    askedAt?: string;
}
export declare function addOpenQuestion(userId: string, input: AddQuestionInput, client?: SupabaseClient<Database>): Promise<OpenQuestionRow | null>;
export interface ResolveQuestionInput {
    resolution?: string;
    context?: Json;
}
export declare function resolveOpenQuestion(id: string, input?: ResolveQuestionInput, client?: SupabaseClient<Database>): Promise<OpenQuestionRow | null>;
