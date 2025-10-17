import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ code: 'method_not_allowed', message: 'Method not allowed', error: 'Method not allowed' });
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY)
            return res.status(500).json({ code: 'server_config_error', message: 'Server not configured', error: 'Server not configured' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = String(req.headers.authorization || '').replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ code: 'unauthorized', message: 'Invalid token', error: 'Invalid token' });
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ code: 'access_denied', message: e.message, error: e.message });
        }
        const { companies, research_type } = req.body || {};
        if (!Array.isArray(companies) || companies.length === 0) {
            return res.status(400).json({ code: 'bad_request', message: 'Companies array is required', error: 'Companies array is required' });
        }
        if (!['quick', 'deep'].includes(research_type)) {
            return res.status(400).json({ code: 'bad_request', message: 'Research type must be "quick" or "deep"', error: 'Invalid research type' });
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
        if (insertError)
            return res.status(500).json({ code: 'db_insert_failed', message: 'Failed to create research job', error: 'Failed to create research job' });
        const tasks = companies.map((c) => ({ job_id: jobId, user_id: user.id, company: c, status: 'pending' }));
        await supabase.from('bulk_research_tasks').insert(tasks);
        // Trigger our runner function; it will self-trigger subsequent batches
        try {
            await fetch(`${process.env.SITE_URL || ''}/api/research/bulk-runner`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, concurrency: research_type === 'deep' ? 2 : 3 })
            }).catch(() => { });
        }
        catch { }
        return res.status(200).json({ success: true, job_id: jobId, message: `Started ${research_type} research for ${companies.length} companies` });
    }
    catch (error) {
        console.error('research/bulk error', error);
        return res.status(500).json({ code: 'internal_error', message: 'Internal server error', error: 'Internal server error' });
    }
}
