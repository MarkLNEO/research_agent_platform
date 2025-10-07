import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
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
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '') || '';
        const { data: { user } } = await supabase.auth.getUser(token);
        try {
            assertEmailAllowed(user?.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ error: e.message });
        }
        // Find accounts to refresh (user-scoped if provided)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const query = supabase
            .from('tracked_accounts')
            .select('*')
            .eq('monitoring_enabled', true)
            .or(`last_researched_at.is.null,last_researched_at.lt.${sevenDaysAgo.toISOString()}`)
            .limit(10);
        const { data: accounts, error } = user ? await query.eq('user_id', user.id) : await query;
        if (error)
            throw error;
        if (!accounts || accounts.length === 0)
            return res.status(200).json({ message: 'No accounts need refreshing', processed: 0 });
        const results = [];
        for (const account of accounts) {
            try {
                const research = await quickResearch(account.company_name, OPENAI_API_KEY);
                await supabase.from('tracked_accounts')
                    .update({ last_researched_at: new Date().toISOString(), last_research_summary: research.summary, signal_score: research.signalScore, priority: research.priority })
                    .eq('id', account.id);
                if (Array.isArray(research.signals) && research.signals.length) {
                    const rows = research.signals.map((s) => ({
                        account_id: account.id,
                        user_id: account.user_id,
                        signal_type: s.type || s.signal_type,
                        signal_title: s.title,
                        signal_description: s.description,
                        signal_date: s.date || s.signal_date,
                        signal_score: s.score || s.signal_score,
                        source_url: s.sourceUrl || s.source_url,
                    }));
                    await supabase.from('account_signals').insert(rows);
                }
                results.push({ company: account.company_name, status: 'success', signals: research.signals?.length || 0 });
            }
            catch (e) {
                results.push({ company: account.company_name, status: 'error', error: e?.message || String(e) });
            }
        }
        return res.status(200).json({ message: 'Accounts refreshed', processed: accounts.length, results });
    }
    catch (error) {
        console.error('accounts/refresh error', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
async function quickResearch(companyName, key) {
    const body = {
        model: 'gpt-5-mini',
        input: [
            { role: 'system', content: [{ type: 'input_text', text: 'You are a business intelligence analyst. Provide brief updates on companies in JSON.' }] },
            { role: 'user', content: [{ type: 'input_text', text: `Provide a brief update on ${companyName}. Return strict JSON with keys: summary, signalScore (0-100), priority (hot|warm|standard), signals: array of {type,title,description,date,score,sourceUrl}.` }] }
        ],
        text: { format: { type: 'text' }, verbosity: 'low' },
        store: false,
    };
    const resp = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok)
        throw new Error(`OpenAI error ${resp.status}`);
    const data = await resp.json();
    let jsonText = '';
    try {
        jsonText = data.output_text || '';
    }
    catch { }
    if (!jsonText && Array.isArray(data.output)) {
        const textPart = data.output.find((p) => p.type === 'output_text');
        if (textPart?.text)
            jsonText = textPart.text;
    }
    const content = JSON.parse(jsonText || '{}');
    return {
        summary: content.summary || 'No recent updates',
        signalScore: Number(content.signalScore ?? 50),
        priority: String(content.priority ?? 'standard'),
        signals: Array.isArray(content.signals) ? content.signals : [],
    };
}
