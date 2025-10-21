import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header required' });
        }
        const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
        const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'Authentication failed' });
        }
        const user = authData.user;
        const [profileResult, criteriaResult, signalsResult, disqualifiersResult, preferencesResult] = await Promise.all([
            supabase.from('company_profiles').select('*').eq('user_id', user.id).maybeSingle(),
            supabase.from('user_custom_criteria').select('*').eq('user_id', user.id).order('display_order', { ascending: true }),
            supabase.from('user_signal_preferences').select('*').eq('user_id', user.id),
            supabase.from('user_disqualifying_criteria').select('*').eq('user_id', user.id),
            supabase.from('user_preferences').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        ]);
        if (profileResult.error)
            throw profileResult.error;
        if (criteriaResult.error)
            throw criteriaResult.error;
        if (signalsResult.error)
            throw signalsResult.error;
        if (disqualifiersResult.error)
            throw disqualifiersResult.error;
        if (preferencesResult.error)
            throw preferencesResult.error;
        return res.json({
            profile: profileResult.data,
            custom_criteria: criteriaResult.data || [],
            signal_preferences: signalsResult.data || [],
            disqualifying_criteria: disqualifiersResult.data || [],
            preferences: preferencesResult.data || [],
        });
    }
    catch (error) {
        console.error('Error in GET /preferences:', error);
        return res.status(500).json({ error: error?.message || 'Failed to load preferences' });
    }
}
