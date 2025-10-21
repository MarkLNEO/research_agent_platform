import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { learnAlias, learnUserAlias } from '../../lib/entities/aliasResolver.js';
import { resolveOpenQuestion } from '../../lib/followups/openQuestions.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    const { alias, canonical, question_id: questionId, action } = (req.body ?? {}) as {
      alias?: string;
      canonical?: string;
      question_id?: string | null;
      action?: 'confirm' | 'reject';
    };

    const trimmedAlias = (alias || '').trim();
    if (!trimmedAlias) {
      return res.status(400).json({ error: 'alias is required' });
    }

    if (action === 'confirm') {
      const trimmedCanonical = (canonical || '').trim();
      if (!trimmedCanonical) {
        return res.status(400).json({ error: 'canonical is required for confirmation' });
      }

      await learnAlias(trimmedCanonical, trimmedAlias, { client: supabase, source: 'user' });
      await learnUserAlias(user.id, trimmedCanonical, trimmedAlias, { client: supabase, source: 'user' });

      if (questionId) {
        await resolveOpenQuestion(questionId, { resolution: `Alias ${trimmedAlias} confirmed as ${trimmedCanonical}.` }, supabase);
      }

      return res.status(200).json({ success: true });
    }

    if (action === 'reject') {
      if (questionId) {
        await resolveOpenQuestion(questionId, { resolution: `Alias ${trimmedAlias} skipped by user.` }, supabase);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unsupported action' });
  } catch (error: any) {
    console.error('[alias.confirm] error', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
