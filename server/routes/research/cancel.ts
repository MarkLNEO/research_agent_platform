import { createClient } from '@supabase/supabase-js';

export default async function cancelBulk(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

    // Authenticate user from bearer token
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
    const anonClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY as string, {
      global: { headers: { Authorization: authHeader as string } }
    });
    const { data: auth } = await anonClient.auth.getUser();
    if (!auth?.user) return res.status(401).json({ error: 'Invalid token' });
    const userId = auth.user.id;

    const { job_id } = req.body || {};
    if (!job_id || typeof job_id !== 'string') return res.status(400).json({ error: 'job_id is required' });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify ownership
    const { data: job, error: jobErr } = await admin
      .from('bulk_research_jobs')
      .select('id, user_id, status')
      .eq('id', job_id)
      .maybeSingle();
    if (jobErr || !job) return res.status(404).json({ error: 'Job not found' });
    if (job.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(200).json({ ok: true, message: 'Job already finished' });
    }

    // Mark all pending/running tasks as failed (cancelled)
    await admin
      .from('bulk_research_tasks')
      .update({ status: 'failed', error: 'Cancelled by user', completed_at: new Date().toISOString() })
      .eq('job_id', job_id)
      .in('status', ['pending', 'running'] as any);

    // Mark job as failed
    await admin
      .from('bulk_research_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', job_id);

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('bulk-cancel error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

