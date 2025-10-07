import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return res.status(401).json({ error: 'Authorization header required' });
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY)
            return res.status(500).json({ error: 'Server not configured' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ error: 'Authentication failed' });
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ success: false, error: e.message });
        }
        const body = req.body || {};
        const action = body.action;
        switch (action) {
            case 'add': {
                const exists = await supabase
                    .from('tracked_accounts')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('company_name', body.company_name)
                    .maybeSingle();
                if (exists.data) {
                    return res.status(400).json({ success: false, error: 'Account already tracked', account_id: exists.data.id });
                }
                const { data, error } = await supabase
                    .from('tracked_accounts')
                    .insert({
                    user_id: user.id,
                    company_name: body.company_name,
                    company_url: body.company_url,
                    industry: body.industry,
                    employee_count: body.employee_count,
                    monitoring_enabled: true,
                })
                    .select()
                    .single();
                if (error)
                    throw error;
                return res.status(200).json({ success: true, account: data });
            }
            case 'bulk_add': {
                const accounts = Array.isArray(body.accounts) ? body.accounts : [];
                const results = { added: [], skipped: [], errors: [] };
                for (const acc of accounts) {
                    try {
                        const existing = await supabase
                            .from('tracked_accounts')
                            .select('id')
                            .eq('user_id', user.id)
                            .eq('company_name', acc.company_name)
                            .maybeSingle();
                        if (existing.data) {
                            results.skipped.push(acc.company_name);
                            continue;
                        }
                        const { data, error } = await supabase
                            .from('tracked_accounts')
                            .insert({ user_id: user.id, ...acc, monitoring_enabled: true })
                            .select()
                            .single();
                        if (error) {
                            results.errors.push(`${acc.company_name}: ${error.message}`);
                        }
                        else
                            results.added.push(data);
                    }
                    catch (e) {
                        results.errors.push(`${acc.company_name}: ${e?.message || String(e)}`);
                    }
                }
                return res.status(200).json({ success: true, ...results, summary: { added: results.added.length, skipped: results.skipped.length, errors: results.errors.length } });
            }
            case 'list': {
                let query = supabase
                    .from('tracked_accounts')
                    .select(`*, latest_research:research_outputs(id, created_at, executive_summary), recent_signals:account_signals(id, signal_type, severity, description, signal_date, viewed, score)`)
                    .eq('user_id', user.id)
                    .order('priority', { ascending: false })
                    .order('updated_at', { ascending: false });
                if (body.filter === 'hot')
                    query = query.eq('priority', 'hot');
                else if (body.filter === 'warm')
                    query = query.eq('priority', 'warm');
                else if (body.filter === 'stale')
                    query = query.or(`last_researched_at.lt.${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()},last_researched_at.is.null`);
                const { data, error } = await query;
                if (error)
                    throw error;
                const accounts = (data || []).map((a) => {
                    const signals = a.recent_signals || [];
                    return { ...a, signal_count: signals.length, unviewed_signal_count: signals.filter((s) => !s.viewed).length };
                });
                const stats = {
                    total: accounts.length,
                    hot: accounts.filter((a) => a.priority === 'hot').length,
                    warm: accounts.filter((a) => a.priority === 'warm').length,
                    standard: accounts.filter((a) => a.priority === 'standard').length,
                    with_signals: accounts.filter((a) => (a.recent_signals || []).length > 0).length,
                    stale: accounts.filter((a) => { const d = a.last_researched_at ? new Date(a.last_researched_at).getTime() : 0; return !d || (Date.now() - d) > (14 * 24 * 60 * 60 * 1000); }).length,
                };
                return res.status(200).json({ success: true, accounts, stats });
            }
            case 'update': {
                const { data, error } = await supabase
                    .from('tracked_accounts')
                    .update(body.updates)
                    .eq('id', body.account_id)
                    .eq('user_id', user.id)
                    .select()
                    .single();
                if (error)
                    throw error;
                return res.status(200).json({ success: true, account: data });
            }
            case 'delete': {
                const { error } = await supabase
                    .from('tracked_accounts')
                    .delete()
                    .eq('id', body.account_id)
                    .eq('user_id', user.id);
                if (error)
                    throw error;
                return res.status(200).json({ success: true, message: 'Account removed from tracking' });
            }
        }
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
    catch (error) {
        console.error('accounts/manage error', error);
        return res.status(500).json({ success: false, error: String(error?.message || error) });
    }
}
