import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'GET')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const responseId = (req.query?.id || req.query?.response_id || '').toString().trim();
        if (!responseId) {
            return res.status(400).json({ error: 'Missing response id' });
        }
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({ error: 'Server not configured' });
        }
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.replace('Bearer ', '');
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData?.user) {
            return res.status(401).json({ error: 'Authentication failed' });
        }
        try {
            assertEmailAllowed(userData.user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ error: e.message });
        }
        const { data, error } = await supabase
            .from('usage_logs')
            .select('*')
            .eq('final_response_id', responseId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error('[debug/get-response-prompt] query error', error);
            return res.status(500).json({ error: 'Failed to query usage logs' });
        }
        if (!data) {
            return res.status(404).json({ error: 'No usage log found for that response id' });
        }
        return res.status(200).json({
            response_id: responseId,
            created_at: data.created_at,
            chat_id: data.chat_id,
            agent_type: data.agent_type,
            prompt_head: data.prompt_head,
            input_head: data.input_head,
            metadata: data.metadata || null,
            raw: data,
        });
    }
    catch (err) {
        console.error('[debug/get-response-prompt] unexpected error', err);
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
}
