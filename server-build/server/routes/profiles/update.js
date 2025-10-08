import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') {
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
        const updateData = req.body || {};
        const results = {
            profile: null,
            custom_criteria: [],
            signal_preferences: [],
            disqualifying_criteria: []
        };
        // Update profile
        if (updateData.profile) {
            const { data: existingProfile } = await supabase
                .from('company_profiles')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();
            if (existingProfile) {
                const { data, error } = await supabase
                    .from('company_profiles')
                    .update({ ...updateData.profile, updated_at: new Date().toISOString() })
                    .eq('user_id', user.id)
                    .select()
                    .single();
                if (error)
                    throw error;
                results.profile = data;
            }
            else {
                const { data, error } = await supabase
                    .from('company_profiles')
                    .insert({ user_id: user.id, ...updateData.profile })
                    .select()
                    .single();
                if (error)
                    throw error;
                results.profile = data;
            }
        }
        // Update custom criteria
        if (Array.isArray(updateData.custom_criteria) && updateData.custom_criteria.length > 0) {
            await supabase.from('user_custom_criteria').delete().eq('user_id', user.id);
            const criteriaToInsert = updateData.custom_criteria.map((c, idx) => ({
                user_id: user.id,
                field_name: c.field_name,
                field_type: c.field_type,
                importance: c.importance,
                hints: c.hints || [],
                display_order: idx + 1,
            }));
            const { data, error } = await supabase
                .from('user_custom_criteria')
                .insert(criteriaToInsert)
                .select();
            if (error)
                throw error;
            results.custom_criteria = data;
        }
        // Update signal preferences
        if (Array.isArray(updateData.signal_preferences) && updateData.signal_preferences.length > 0) {
            await supabase.from('user_signal_preferences').delete().eq('user_id', user.id);
            const signalsToInsert = updateData.signal_preferences.map((s) => ({
                user_id: user.id,
                signal_type: s.signal_type,
                importance: s.importance,
                lookback_days: s.lookback_days || 90,
                config: s.config || {},
            }));
            const { data, error } = await supabase
                .from('user_signal_preferences')
                .insert(signalsToInsert)
                .select();
            if (error)
                throw error;
            results.signal_preferences = data;
        }
        // Update disqualifying criteria
        if (Array.isArray(updateData.disqualifying_criteria) && updateData.disqualifying_criteria.length > 0) {
            await supabase.from('user_disqualifying_criteria').delete().eq('user_id', user.id);
            const disqualifiersToInsert = updateData.disqualifying_criteria.map((d) => ({
                user_id: user.id,
                criterion: d.criterion
            }));
            const { data, error } = await supabase
                .from('user_disqualifying_criteria')
                .insert(disqualifiersToInsert)
                .select();
            if (error)
                throw error;
            results.disqualifying_criteria = data;
        }
        // Update prompt config (best-effort; ignore unknown columns)
        if (updateData.prompt_config && typeof updateData.prompt_config === 'object') {
            try {
                const { data: existingCfg } = await supabase
                    .from('user_prompt_config')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (existingCfg) {
                    const { error } = await supabase
                        .from('user_prompt_config')
                        .update({ ...updateData.prompt_config, updated_at: new Date().toISOString() })
                        .eq('user_id', user.id);
                    if (error)
                        throw error;
                }
                else {
                    const { error } = await supabase
                        .from('user_prompt_config')
                        .insert({ user_id: user.id, ...updateData.prompt_config });
                    if (error)
                        throw error;
                }
            }
            catch (e) {
                console.warn('[update-profile] prompt_config update skipped:', e?.message || e);
            }
        }
        return res.json({ success: true, data: results });
    }
    catch (error) {
        console.error('Error in update-profile:', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
