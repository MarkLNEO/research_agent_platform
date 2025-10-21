import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { learnAlias } from '../../lib/entities/aliasResolver.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Authentication failed' });

    if (req.method === 'GET') {
      const { canonical, alias, search, limit } = req.query || {};
      const take = Math.min(Number(limit) || 50, 200);

      let query = supabase
        .from('entity_aliases')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(take);

      if (typeof canonical === 'string' && canonical.trim().length > 0) {
        query = query.ilike('canonical', `%${canonical}%`);
      }
      if (typeof alias === 'string' && alias.trim().length > 0) {
        query = query.contains('aliases', [alias]);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = data || [];
      if (typeof search === 'string' && search.trim()) {
        const lowered = search.toLowerCase();
        rows = rows.filter(row =>
          row.canonical?.toLowerCase().includes(lowered) ||
          (Array.isArray(row.aliases) && row.aliases.some((a: string) => a?.toLowerCase().includes(lowered)))
        );
      }

      return res.status(200).json({ aliases: rows });
    }

    if (req.method === 'POST') {
      const { canonical, alias, type, metadata } = req.body || {};
      if (typeof canonical !== 'string' || canonical.trim().length === 0) {
        return res.status(400).json({ error: 'canonical is required' });
      }
      if (typeof alias !== 'string' || alias.trim().length === 0) {
        return res.status(400).json({ error: 'alias is required' });
      }

      await learnAlias(canonical.trim(), alias.trim(), {
        type: typeof type === 'string' && type.trim().length > 0 ? type.trim() : 'unknown',
        metadata: metadata ?? null,
        source: 'followup',
        client: supabase,
      });

      const { data: row, error } = await supabase
        .from('entity_aliases')
        .select('*')
        .eq('canonical', canonical.trim())
        .maybeSingle();
      if (error) throw error;

      return res.status(200).json({ alias: row });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[entities] api error', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
