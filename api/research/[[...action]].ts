import type { VercelRequest, VercelResponse } from '@vercel/node';
import bulk from '../../server-build/server/routes/research/bulk.js';
import bulkRunner from '../../server-build/server/routes/research/bulk-runner.js';
import evaluate from '../../server-build/server/routes/research/evaluate.js';
import { createClient } from '@supabase/supabase-js';

async function bulkCancel(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return res.status(500).json({ error: 'Server not configured' });
    const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
    const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await anon.auth.getUser();
    if (!auth?.user) return res.status(401).json({ error: 'Invalid token' });
    const userId = auth.user.id;
    const { job_id } = (req.body as any) || {};
    if (!job_id || typeof job_id !== 'string') return res.status(400).json({ error: 'job_id is required' });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job } = await admin.from('bulk_research_jobs').select('id,user_id,status').eq('id', job_id).maybeSingle();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (job.status === 'completed' || job.status === 'failed') return res.status(200).json({ ok: true, message: 'Job already finished' });
    await admin
      .from('bulk_research_tasks')
      .update({ status: 'failed', error: 'Cancelled by user', completed_at: new Date().toISOString() })
      .eq('job_id', job_id)
      .in('status', ['pending','running'] as any);
    await admin
      .from('bulk_research_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', job_id);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('api/bulk-cancel error', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void> | void> = {
  bulk,
  'bulk-runner': bulkRunner,
  evaluate,
  'bulk-cancel': bulkCancel,
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = normalize(req.query.action) || fromPath(req.url, '/api/research');
  const fn = handlers[slug];
  if (!fn) {
    res.status(404).json({ error: `No research handler for ${slug || '(root)'}` });
    return;
  }
  await fn(req as any, res as any);
}

function normalize(param: string | string[] | undefined): string {
  if (!param) return '';
  if (Array.isArray(param)) return param.filter(Boolean).join('/');
  return param;
}

function fromPath(url: string | undefined, base: string): string {
  if (!url) return '';
  const path = url.split('?')[0] || '';
  if (path === base || path === `${base}/`) return '';
  if (path.startsWith(`${base}/`)) {
    return path.slice(base.length + 1).replace(/\/+/g, '/').replace(/\/+$/, '');
  }
  return '';
}
