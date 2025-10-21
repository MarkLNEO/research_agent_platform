import { createClient } from '@supabase/supabase-js';
export const config = { runtime: 'nodejs', maxDuration: 30 };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY)
            return res.status(500).json({ error: 'Server not configured' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const { job_id, concurrency } = req.body || {};
        if (!job_id)
            return res.status(400).json({ error: 'job_id is required' });
        const { data: job, error: loadErr } = await supabase.from('bulk_research_jobs').select('*').eq('id', job_id).single();
        if (loadErr || !job)
            return res.status(404).json({ error: 'job not found' });
        if (job.status === 'pending') {
            await supabase.from('bulk_research_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job_id);
        }
        const parallel = Math.max(1, Math.min(3, Number(concurrency) || (job.research_type === 'deep' ? 2 : 3)));
        const { data: pendingTasks } = await supabase
            .from('bulk_research_tasks')
            .select('*')
            .eq('job_id', job_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(parallel);
        if (!pendingTasks || pendingTasks.length === 0) {
            if (job.status !== 'completed') {
                await supabase.from('bulk_research_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job_id);
            }
            return res.status(200).json({ message: 'job already complete' });
        }
        async function processTask(task) {
            const startedAt = new Date().toISOString();
            const nextAttempt = (task.attempt_count || 0) + 1;
            const { data: claimRows } = await supabase
                .from('bulk_research_tasks')
                .update({ status: 'running', started_at: startedAt, attempt_count: nextAttempt })
                .eq('id', task.id)
                .eq('status', 'pending')
                .select('id');
            if (!Array.isArray(claimRows) || claimRows.length === 0)
                return;
            try {
                const result = await runCompanyResearch(task.company, job.research_type, OPENAI_API_KEY);
                const now = new Date().toISOString();
                // Save research output
                try {
                    await supabase.from('research_outputs').insert({
                        user_id: job.user_id,
                        subject: task.company,
                        research_type: 'company',
                        markdown_report: result,
                        executive_summary: null,
                        sources: [],
                        company_data: {},
                        leadership_team: [],
                        buying_signals: [],
                        custom_criteria_assessment: [],
                        personalization_points: [],
                        recommended_actions: {}
                    });
                }
                catch { }
                await supabase.from('bulk_research_tasks').update({ status: 'completed', result: result, completed_at: now }).eq('id', task.id);
            }
            catch (e) {
                const now = new Date().toISOString();
                if (nextAttempt < 3) {
                    await supabase.from('bulk_research_tasks').update({ status: 'pending', started_at: null }).eq('id', task.id);
                }
                else {
                    await supabase.from('bulk_research_tasks').update({ status: 'failed', error: String(e?.message || e), completed_at: now }).eq('id', task.id);
                }
            }
        }
        await Promise.all(pendingTasks.map(processTask));
        const { data: taskDone } = await supabase
            .from('bulk_research_tasks')
            .select('company,status,result,error,completed_at')
            .eq('job_id', job_id)
            .in('status', ['completed', 'failed'])
            .order('completed_at', { ascending: true });
        const doneCount = (taskDone || []).length;
        const total = job.total_count || (job.companies?.length || 0);
        await supabase.from('bulk_research_jobs').update({ completed_count: doneCount, results: taskDone || [], updated_at: new Date().toISOString() }).eq('id', job_id);
        if (doneCount < total) {
            try {
                await fetch(`${process.env.SITE_URL || ''}/api/research/bulk-runner`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id, concurrency: parallel }) });
            }
            catch { }
        }
        else {
            await supabase.from('bulk_research_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job_id);
        }
        return res.status(200).json({ processed: pendingTasks.length, remaining: Math.max(0, (total - doneCount)) });
    }
    catch (error) {
        console.error('bulk-runner error', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function runCompanyResearch(company, depth, key) {
    const focus = depth === 'deep'
        ? 'Company overview, recent signals (breaches/leadership/funding), tech stack, decision makers, competitors, recommended next actions'
        : 'Company overview, leadership, 3 key recent signals, quick ICP fit';
    const instructions = `You are an elite B2B research agent. Output a concise, well-structured markdown report for sales meeting prep.`;
    const input = `Research ${company}. Focus: ${focus}. Return an executive summary first, then bullet sections.`;
    const body = {
        model: 'gpt-5-mini',
        instructions,
        input,
        tools: [{ type: 'web_search' }],
        text: { format: { type: 'text' }, verbosity: 'low' },
        stream: false,
        store: false,
    };
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok)
        throw new Error(`OpenAI error ${r.status}`);
    const j = await r.json();
    const text = Array.isArray(j.output)
        ? (j.output.find((p) => p.type === 'output_text')?.text || j.output.find((p) => p.type === 'message')?.content?.[0]?.text || '')
        : (j.output_text || j.content || '');
    return String(text || '');
}
