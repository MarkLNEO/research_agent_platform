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
        // Auth user
        const token = String(req.headers.authorization || '').replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ error: e.message });
        }
        // Load signal preferences and accounts
        const [{ data: prefs }, { data: accounts }] = await Promise.all([
            supabase.from('user_signal_preferences').select('*').eq('user_id', user.id),
            supabase.from('tracked_accounts').select('id, user_id, company_name, company_url').eq('user_id', user.id).eq('monitoring_enabled', true)
        ]);
        if (!accounts || accounts.length === 0 || !prefs || prefs.length === 0) {
            return res.status(200).json({ success: true, accounts_processed: 0, signals_detected: 0 });
        }
        // Limit processing for this invocation
        const maxAccounts = Number(process.env.DETECTION_MAX_ACCOUNTS || 5);
        const selectedAccounts = accounts.slice(0, maxAccounts);
        let totalSignals = 0;
        for (const account of selectedAccounts) {
            const detected = await detectForAccount(account, prefs, OPENAI_API_KEY);
            totalSignals += detected.length;
            if (detected.length) {
                await supabase.from('account_signals').insert(detected.map((s) => ({
                    account_id: account.id,
                    user_id: account.user_id,
                    signal_type: s.signal_type,
                    severity: s.severity,
                    description: s.description,
                    signal_date: s.signal_date,
                    source_url: s.source_url,
                    score: s.score,
                    importance: s.importance,
                    detection_source: 'api_trigger',
                    metadata: { confidence: s.confidence, detected_at: new Date().toISOString() }
                })));
            }
        }
        return res.status(200).json({ success: true, accounts_processed: selectedAccounts.length, signals_detected: totalSignals });
    }
    catch (error) {
        console.error('signals/trigger-detection error', error);
        return res.status(500).json({ success: false, error: String(error?.message || error) });
    }
}
async function detectForAccount(account, prefs, openaiKey) {
    const uniqueTypes = dedupeBy(prefs, (p) => norm(p.signal_type));
    const lookback = Math.max(...uniqueTypes.map((p) => p.lookback_days || 30));
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hints = buildHints(uniqueTypes);
    const prompt = [
        `You are part of a SignalMonitor service. Today is ${today}.`,
        `Task: Find recent news/events about "${account.company_name}" between ${startDate} and ${today}.`,
        `Focus on: ${hints.focus}. Use the web_search tool; prefer news sources (Reuters, Bloomberg, CNBC, official press releases).`,
        `Return JSON in code fences (\`\`\`json...\`\`\`) with an array of items:`,
        `[{ signal_type, description, signal_date (YYYY-MM-DD), source_url (https), confidence (high|medium|low) }]`,
    ].join('\n\n');
    const body = {
        model: 'gpt-5-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        tools: [{ type: 'web_search' }],
        text: { format: { type: 'text' } },
        stream: false,
        store: false,
    };
    const resp = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok)
        return [];
    const json = await resp.json();
    const text = extractOutputText(json);
    const arr = parseJsonArrayFromText(text);
    const normalized = arr.map((raw) => normalizeSignal(raw, uniqueTypes));
    return normalized.filter(Boolean);
}
function extractOutputText(apiResponse) {
    if (Array.isArray(apiResponse?.output)) {
        const message = apiResponse.output.find((i) => i?.type === 'message');
        if (message?.content?.[0]?.text)
            return String(message.content[0].text);
        const textOutput = apiResponse.output.filter((i) => i?.type === 'output_text' && typeof i.text === 'string').map((i) => i.text).join('\n');
        if (textOutput)
            return textOutput;
    }
    if (apiResponse?.content)
        return String(apiResponse.content);
    if (apiResponse?.output_text)
        return String(apiResponse.output_text);
    return '';
}
function parseJsonArrayFromText(text) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
    const jsonText = match ? match[1] : text;
    try {
        const parsed = JSON.parse(jsonText);
        return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.signals) ? parsed.signals : []);
    }
    catch {
        return [];
    }
}
function norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_').trim(); }
function dedupeBy(arr, key) { const m = new Map(); for (const x of arr) {
    const k = key(x);
    if (!m.has(k))
        m.set(k, x);
} return [...m.values()]; }
function buildHints(prefs) {
    const types = prefs.map((p) => norm(p.signal_type));
    const focus = [];
    if (types.some((t) => t.includes('breach') || t.includes('security')))
        focus.push('security breaches/incidents/ransomware');
    if (types.some((t) => t.includes('leadership')))
        focus.push('leadership changes (CISO/CTO/CEO)');
    if (types.some((t) => t.includes('funding')))
        focus.push('funding rounds');
    if (types.some((t) => t.includes('hiring')))
        focus.push('hiring surges');
    return { focus: focus.join(', ') || 'material company events' };
}
function normalizeSignal(raw, prefs) {
    if (!raw || typeof raw !== 'object')
        return null;
    const signal_type = norm(raw.signal_type || 'custom');
    const pref = prefs.find((p) => norm(p.signal_type) === signal_type) || prefs[0];
    if (!pref)
        return null;
    const description = String(raw.description || '').trim();
    const signal_date = String(raw.signal_date || new Date().toISOString().slice(0, 10));
    const source_url = typeof raw.source_url === 'string' ? raw.source_url : undefined;
    if (!description || !source_url || !source_url.startsWith('http'))
        return null;
    const confidenceNorm = String(raw.confidence || 'medium').toLowerCase();
    const confidence = confidenceNorm.includes('high') ? 'high' : confidenceNorm.includes('low') ? 'low' : 'medium';
    const base = confidence === 'high' ? 80 : confidence === 'medium' ? 60 : 40;
    const score = base + (pref.importance === 'critical' ? 15 : pref.importance === 'important' ? 8 : 0);
    const severity = score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low';
    return { signal_type, description, signal_date, source_url, confidence, score, severity, importance: pref.importance };
}
