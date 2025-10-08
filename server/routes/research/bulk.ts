import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });
    try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }

    const { companies, research_type } = req.body || {};
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: 'Companies array is required' });
    }
    if (!['quick', 'deep'].includes(research_type)) {
      return res.status(400).json({ error: 'Research type must be "quick" or "deep"' });
    }

    const jobId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('bulk_research_jobs').insert({
      id: jobId,
      user_id: user.id,
      companies,
      research_type,
      status: 'pending',
      total_count: companies.length,
      completed_count: 0,
      created_at: new Date().toISOString(),
    });
    if (insertError) return res.status(500).json({ error: 'Failed to create research job' });

    const tasks = companies.map((c: string) => ({ job_id: jobId, user_id: user.id, company: c, status: 'pending' }));
    await supabase.from('bulk_research_tasks').insert(tasks);

    // Trigger our runner function; it will self-trigger subsequent batches
    try {
      await fetch(`${process.env.SITE_URL || ''}/api/research/bulk-runner`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, concurrency: research_type === 'deep' ? 2 : 3 })
      }).catch(() => {});
    } catch {}

    return res.status(200).json({ success: true, job_id: jobId, message: `Started ${research_type} research for ${companies.length} companies` });
  } catch (error: any) {
    console.error('research/bulk error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
