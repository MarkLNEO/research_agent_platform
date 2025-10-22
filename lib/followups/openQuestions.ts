import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';

type ServiceClient = SupabaseClient<Database>;
export type OpenQuestionRow = Database['public']['Tables']['open_questions']['Row'];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cachedClient: ServiceClient | null = null;

function resolveClient(client?: SupabaseClient<Database>): SupabaseClient<Database> {
  if (client) return client;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('[openQuestions] SUPABASE_SERVICE_ROLE_KEY missing; follow-up store unavailable.');
  }
  if (!cachedClient) {
    cachedClient = createClient<Database>(SUPABASE_URL, SERVICE_KEY);
  }
  return cachedClient;
}

export interface ListOptions {
  limit?: number;
}

export async function listOpenQuestions(
  userId: string,
  options: ListOptions = {},
  client?: SupabaseClient<Database>
): Promise<OpenQuestionRow[]> {
  if (!userId) return [];
  const supabase = resolveClient(client);
  const limit = Math.max(1, options.limit ?? 10);
  const { data, error } = await supabase
    .from('open_questions')
    .select('*')
    .eq('user_id', userId)
    .is('resolved_at', null)
    .order('asked_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[openQuestions] Failed to list unresolved questions', error);
    throw error;
  }
  return data || [];
}

export interface AddQuestionInput {
  question: string;
  context?: Json;
  askedAt?: string;
}

export async function addOpenQuestion(
  userId: string,
  input: AddQuestionInput,
  client?: SupabaseClient<Database>
): Promise<OpenQuestionRow | null> {
  if (!userId || !input?.question?.trim()) return null;
  const supabase = resolveClient(client);
  const payload = {
    user_id: userId,
    question: input.question.trim(),
    context: input.context ?? null,
    asked_at: input.askedAt || new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('open_questions')
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error('[openQuestions] Failed to insert open question', error);
    throw error;
  }
  return data;
}

export interface ResolveQuestionInput {
  resolution?: string;
  context?: Json;
}

export async function resolveOpenQuestion(
  id: string,
  input: ResolveQuestionInput = {},
  client?: SupabaseClient<Database>
): Promise<OpenQuestionRow | null> {
  if (!id) return null;
  const supabase = resolveClient(client);
  const payload: Partial<OpenQuestionRow> = {
    resolved_at: new Date().toISOString(),
  };
  if (typeof input.resolution === 'string') {
    payload.resolution = input.resolution;
  }
  if (input.context !== undefined) {
    payload.context = input.context;
  }
  const { data, error } = await supabase
    .from('open_questions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[openQuestions] Failed to resolve question', error);
    throw error;
  }
  return data;
}
