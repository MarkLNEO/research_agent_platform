type TableName = 'user_preferences' | 'entity_aliases' | 'user_entity_aliases' | 'open_questions';

const TABLE_SQL: Record<TableName | 'entity_alias_bundle', string> = {
  user_preferences: `
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('setup', 'followup', 'implicit', 'system')),
  confidence NUMERIC DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_preferences_key_unique UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON public.user_preferences (key);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can upsert own preferences"
  ON public.user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own preferences"
  ON public.user_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_user_preferences_updated ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
`.trim(),
  entity_alias_bundle: `
CREATE TABLE IF NOT EXISTS public.entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical TEXT NOT NULL,
  aliases TEXT[] NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB,
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_aliases_canonical_unique UNIQUE (canonical)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_type ON public.entity_aliases (type);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_aliases ON public.entity_aliases USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical ON public.entity_aliases (canonical);

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Entity aliases readable"
  ON public.entity_aliases FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_entity_aliases_updated ON public.entity_aliases;
CREATE TRIGGER trg_entity_aliases_updated
  BEFORE UPDATE ON public.entity_aliases
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT GENERATED ALWAYS AS (lower(trim(alias))) STORED,
  canonical TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB,
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_user_entity_aliases_user ON public.user_entity_aliases (user_id);
`.trim(),
  user_entity_aliases: '',
  entity_aliases: '',
  open_questions: `
CREATE TABLE IF NOT EXISTS public.open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  context JSONB,
  asked_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_questions_user ON public.open_questions (user_id);
CREATE INDEX IF NOT EXISTS idx_open_questions_active
  ON public.open_questions (user_id, asked_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their open questions"
  ON public.open_questions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can manage their open questions"
  ON public.open_questions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_open_questions_updated ON public.open_questions;
CREATE TRIGGER trg_open_questions_updated
  BEFORE UPDATE ON public.open_questions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
`.trim(),
};

const ensurePromises = new Map<TableName | 'entity_alias_bundle', Promise<void>>();

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('[ensureTables] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }
  return {
    supabaseUrl,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    } as Record<string, string>,
  };
}

async function tableExists(table: string, config: ReturnType<typeof getConfig>): Promise<boolean> {
  const url = `${config.supabaseUrl}/rest/v1/meta/tables?select=name,schema&name=eq.${table}&schema=eq.public`;
  const response = await fetch(url, {
    headers: {
      ...config.headers,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[ensureTables] Failed to inspect table ${table}: ${response.status} ${body}`);
  }
  const json = await response.json();
  return Array.isArray(json) && json.length > 0;
}

async function runSql(sql: string, config: ReturnType<typeof getConfig>): Promise<void> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/meta/sql`, {
    method: 'POST',
    headers: {
      ...config.headers,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[ensureTables] Failed to execute DDL: ${response.status} ${body}`);
  }
}

export async function ensureTable(table: TableName): Promise<void> {
  const key: TableName | 'entity_alias_bundle' =
    table === 'entity_aliases' || table === 'user_entity_aliases' ? 'entity_alias_bundle' : table;
  if (!ensurePromises.has(key)) {
    ensurePromises.set(
      key,
      (async () => {
        const config = getConfig();
        const tablesToCheck =
          key === 'entity_alias_bundle'
            ? ['entity_aliases', 'user_entity_aliases']
            : key === 'user_preferences' || key === 'open_questions'
            ? [key]
            : [table];
        const existence = await Promise.all(tablesToCheck.map((tbl) => tableExists(tbl, config)));
        if (existence.every(Boolean)) return;
        const sql = TABLE_SQL[key];
        if (!sql) return;
        await runSql(sql, config);
      })()
    );
  }
  await ensurePromises.get(key);
}
