import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildSystemPrompt } from '../_lib/systemPrompt.js';
import { assertEmailAllowed } from '../_lib/access.js';
const NON_RESEARCH_TERMS = new Set([
    'hi',
    'hello',
    'hey',
    'thanks',
    'thank you',
    'agenda',
    'notes',
    'help',
    'update',
    'updates',
    'plan',
    'planning',
    'what',
    'who',
    'why',
    'how',
    'where',
    'when',
    'test'
]);
// Helper function to estimate tokens
function estimateTokens(text = '') {
    return Math.ceil((text || '').length / 4);
}
// Helper function to check user credits
async function checkUserCredits(supabase, userId) {
    const INITIAL_CREDITS = 1000;
    let { data: userRow } = await supabase
        .from('users')
        .select('id, credits_remaining, credits_total_used, approval_status')
        .eq('id', userId)
        .maybeSingle();
    if (!userRow) {
        const { data: inserted } = await supabase
            .from('users')
            .insert({
            id: userId,
            credits_remaining: INITIAL_CREDITS,
            credits_total_used: 0,
            approval_status: 'pending'
        })
            .select('id, credits_remaining, credits_total_used, approval_status')
            .single();
        userRow = inserted;
    }
    if (userRow?.approval_status === 'pending') {
        return {
            hasCredits: false,
            remaining: userRow?.credits_remaining || 0,
            needsApproval: true,
            message: 'Your account is pending approval. Please check your email or contact support'
        };
    }
    if (userRow?.approval_status === 'rejected') {
        return {
            hasCredits: false,
            remaining: 0,
            needsApproval: true,
            message: 'Your account access has been restricted. Please contact support'
        };
    }
    const remaining = userRow?.credits_remaining || 0;
    if (remaining <= 0) {
        return {
            hasCredits: false,
            remaining: 0,
            message: 'You have used all your free credits. Please contact support to request additional credits.'
        };
    }
    return {
        hasCredits: true,
        remaining,
        message: null
    };
}
// Helper function to log usage
async function logUsage(supabase, userId, actionType, tokensUsed, metadata = {}) {
    await supabase
        .from('usage_logs')
        .insert({
        user_id: userId,
        action_type: actionType,
        tokens_used: tokensUsed,
        tool_name: 'chat',
        metadata
    });
}
// Helper function to deduct credits
async function deductCredits(supabase, userId, tokensUsed) {
    const creditsToDeduct = Math.ceil(tokensUsed / 1000);
    const { error } = await supabase.rpc('deduct_user_credits', {
        p_user_id: userId,
        p_credits: creditsToDeduct
    });
    if (error) {
        console.error('Failed to deduct credits:', error);
    }
}
async function fetchUserContext(client, userId) {
    const { data, error } = await client.rpc('get_user_context', { p_user: userId });
    if (error) {
        console.error('get_user_context error:', error);
        throw error;
    }
    const ctx = (data || {});
    return {
        profile: ctx?.profile || null,
        customCriteria: ctx?.custom_criteria || [],
        signals: ctx?.signals || [],
        disqualifiers: ctx?.disqualifiers || [],
        promptConfig: ctx?.prompt_config || null,
        reportPreferences: ctx?.report_preferences || [],
    };
}
function classifyResearchIntent(raw) {
    const text = (raw || '').trim();
    if (!text)
        return false;
    const RESEARCH_VERBS = /(research|analy[sz]e|investigate|look\s*up|deep\s*dive|latest\s+news|competitive|funding|hiring|tech(?:\s|-)?stack|security|signals?|tell me about|what is|who is)/i;
    const COMPANY_INDICATORS = /(inc\.|corp\.|ltd\.|llc|company|co\b)/i;
    const ALL_SYNONYMS = /\ball(\s+of\s+the\s+(above|those|them))?\b/i;
    const hasVerb = RESEARCH_VERBS.test(text);
    const companyLike = /\b[A-Z][\w&]+(?:\s+[A-Z][\w&]+){0,3}\b/.test(text) && COMPANY_INDICATORS.test(text);
    const allPhrase = ALL_SYNONYMS.test(text);
    if (hasVerb || companyLike || allPhrase)
        return true;
    const extracted = extractCompanyName(text);
    if (extracted) {
        if (NON_RESEARCH_TERMS.has(text.toLowerCase())) {
            return false;
        }
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        if (wordCount > 0 && wordCount <= 4) {
            return true;
        }
    }
    return false;
}
function summarizeContextForPlan(userContext) {
    if (!userContext)
        return '';
    const bits = [];
    const profile = userContext.profile || {};
    if (profile.company_name)
        bits.push(`Company: ${profile.company_name}`);
    if (profile.industry)
        bits.push(`Industry: ${profile.industry}`);
    if (Array.isArray(profile.target_titles) && profile.target_titles.length) {
        bits.push(`Target titles: ${profile.target_titles.slice(0, 4).join(', ')}`);
    }
    if (Array.isArray(userContext.customCriteria) && userContext.customCriteria.length) {
        const criteria = userContext.customCriteria
            .slice(0, 4)
            .map((c) => `${c.field_name}${c.importance ? ` (${c.importance})` : ''}`)
            .join(', ');
        bits.push(`Custom criteria: ${criteria}`);
    }
    if (Array.isArray(userContext.signals) && userContext.signals.length) {
        const signals = userContext.signals
            .slice(0, 3)
            .map((s) => s.signal_type || s.type)
            .filter(Boolean)
            .join(', ');
        if (signals)
            bits.push(`Monitored signals: ${signals}`);
    }
    return bits.join('\n');
}
function extractCompanyName(raw) {
    if (!raw)
        return '';
    let text = String(raw || '').trim();
    if (!text)
        return '';
    const actionPrefix = /^(summarize|continue|resume|draft|write|compose|email|refine|save|track|start|generate|rerun|retry|copy|share|compare)\b/i;
    if (actionPrefix.test(text)) {
        return '';
    }
    const leadingVerb = /^(research|analy[sz]e|investigate|look\s*up|deep\s*dive|tell me about|find|discover|explore|dig into)\s+/i;
    text = text.replace(leadingVerb, '').trim();
    text = text.replace(/\?/g, '').trim();
    const stopMatch = text.match(/\s+(?:in|at|for|with|that|who|which|using|focused|within)\s+/i);
    if (stopMatch?.index) {
        text = text.slice(0, stopMatch.index).trim();
    }
    text = text.replace(/^[^A-Za-z0-9(]+/, '').replace(/[^A-Za-z0-9)&.\-\s]+$/, '').trim();
    if (!text)
        return '';
    const words = text.split(/\s+/).slice(0, 6);
    if (!words.length)
        return '';
    const formatted = words
        .map((word) => {
        if (!word)
            return '';
        if (word.toUpperCase() === word)
            return word;
        return word[0].toUpperCase() + word.slice(1);
    })
        .join(' ')
        .trim();
    if (/^\d+$/.test(formatted))
        return '';
    if (formatted.length > 80)
        return '';
    return formatted;
}
export const config = {
    runtime: 'nodejs',
    maxDuration: 30, // 30 seconds for streaming
};
export default async function handler(req, res) {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    // Initialize Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (req.body || {});
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }
    let keepAlive = null;
    try {
        const processStart = Date.now();
        const token = authHeader.replace('Bearer ', '').trim();
        let user = null;
        if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
            const impersonateId = (body === null || body === void 0 ? void 0 : body.impersonate_user_id) || (body === null || body === void 0 ? void 0 : body.user_id) || (body === null || body === void 0 ? void 0 : body.bulk_user_id);
            if (!impersonateId || typeof impersonateId !== 'string') {
                return res.status(400).json({ error: 'impersonate_user_id is required when using a service role token' });
            }
            const { data: impersonated, error: adminErr } = await supabase.auth.admin.getUserById(impersonateId);
            if (adminErr || !(impersonated === null || impersonated === void 0 ? void 0 : impersonated.user)) {
                console.error('Impersonation lookup failed:', adminErr);
                return res.status(401).json({ error: 'Unable to impersonate user for service request' });
            }
            user = impersonated.user;
        }
        else {
            const { data, error: authError } = await supabase.auth.getUser(token);
            if (authError || !(data === null || data === void 0 ? void 0 : data.user)) {
                return res.status(401).json({ error: 'Invalid authentication token' });
            }
            user = data.user;
        }
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ error: e.message });
        }
        // Check user credits
        const creditCheck = await checkUserCredits(supabase, user.id);
        if (!creditCheck.hasCredits) {
            return res.status(403).json({
                error: creditCheck.message,
                needsApproval: creditCheck.needsApproval,
                remaining: creditCheck.remaining
            });
        }
        const authAndCreditMs = Date.now() - processStart;
        // Parse request body
        const { messages, systemPrompt, chatId, agentType = 'company_research', config: userConfig = {}, research_type } = body;
        const contextFetchStart = Date.now();
        const userContext = await fetchUserContext(supabase, user.id);
        const contextFetchMs = Date.now() - contextFetchStart;
        // Build system prompt if not provided; pass research_type to bias depth
        let instructions = systemPrompt || buildSystemPrompt(userContext, agentType, body.research_type);
        // Append guardrail hint if present in prompt config
        try {
            const guard = userContext.promptConfig?.guardrail_profile;
            if (guard)
                instructions += `\n\n<guardrails>Use guardrail profile: ${guard}. Respect source allowlists and safety constraints.</guardrails>`;
        }
        catch { }
        if (typeof (userConfig === null || userConfig === void 0 ? void 0 : userConfig.summary_brevity) === 'string') {
            instructions += `\n\n<summary_brevity>${userConfig.summary_brevity}</summary_brevity>`;
        }
        instructions += `\n\n<streaming_guidance>Stream your thinking immediately in short bullet updates. Narrate progress while research tasks run. Keep each update concise.</streaming_guidance>`;
        let input;
        let lastUserMessage = null;
        // If we have messages array, convert it to the Responses API format
        if (messages && messages.length > 0) {
            // For Responses API, we need to convert messages to a string format
            // The Responses API expects input as a string, not an array
            // Get just the last user message for research
            lastUserMessage = messages
                .filter(msg => msg.role === 'user')
                .pop();
            if (lastUserMessage) {
                // Intent classification: decide whether to perform research or just reply briefly
                const _text = String(lastUserMessage.content || '').trim();
                let _isResearchQuery = classifyResearchIntent(_text);
                if (!_isResearchQuery && research_type) {
                    _isResearchQuery = true;
                }
                console.log('[DEBUG] Research classification', {
                    raw: _text,
                    classified: _isResearchQuery,
                    research_type
                });
                req.__isResearchQuery = _isResearchQuery;
                if (_isResearchQuery || research_type) {
                    // Build explicit research task input
                    // Include brief recent context (last 4 messages) so we don't lose company URL or scope already provided
                    const recent = (messages || []).slice(-4).map(m => {
                        const role = m.role === 'user' ? 'User' : (m.role === 'assistant' ? 'Assistant' : 'System');
                        const text = String(m.content || '').replace(/\s+/g, ' ').trim();
                        return `${role}: ${text}`;
                    }).join('\n');
                    input = `Task: Perform company research as specified in the instructions.\n\nRecent context (last turns):\n${recent}\n\nRequest: ${lastUserMessage.content}\n\nPlease use the web_search tool to research this company and provide a concise, well-formatted analysis following the output structure defined in the instructions.`;
                }
                else {
                    // Generic small talk / non-research: short helpful reply only (no web_search)
                    instructions = 'You are a concise assistant for a company research tool. Respond briefly and help the user formulate a research request. Do not perform web_search unless explicitly asked for research.';
                    input = lastUserMessage.content;
                }
            }
            else {
                // Fallback to conversation format if no user message
                const conversationText = messages
                    .map(msg => {
                    if (msg.role === 'user') {
                        return `User: ${msg.content}`;
                    }
                    else if (msg.role === 'assistant') {
                        return `Assistant: ${msg.content}`;
                    }
                    return msg.content;
                })
                    .join('\n\n');
                input = conversationText;
            }
            // Add debug logging to see what we're sending
            console.log('[DEBUG] Formatted input for Responses API:', input.substring(0, 200) + '...');
        }
        else {
            return res.status(400).json({ error: 'No messages provided' });
        }
        // Estimate tokens for usage tracking
        const totalEstimatedTokens = estimateTokens(JSON.stringify(messages));
        // Initialize OpenAI
        const openai = new OpenAI({
            apiKey: OPENAI_API_KEY,
        });
        // Set up streaming response headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        });
        try {
            if (typeof res.flushHeaders === 'function') {
                res.flushHeaders();
            }
        }
        catch (flushErr) {
            console.warn('Failed to flush headers early:', flushErr);
        }
        let responseClosed = false;
        const safeWrite = (payload) => {
            if (responseClosed)
                return;
            try {
                res.write(payload);
            }
            catch (writeErr) {
                responseClosed = true;
                console.error('SSE write failed:', writeErr);
            }
        };
        res.on('close', () => {
            responseClosed = true;
            if (keepAlive) {
                clearTimeout(keepAlive);
                keepAlive = null;
            }
        });
        try {
            // Add more detailed debugging
            console.log('[DEBUG] System instructions length:', instructions?.length || 0);
            console.log('[DEBUG] System instructions full text:\n', instructions);
            console.log('[DEBUG] Input full text:\n', input);
            console.log('[DEBUG] ENABLE_PROMPT_DEBUG resolved to:', process.env.ENABLE_PROMPT_DEBUG);
            const requestText = lastUserMessage?.content || '';
            const isResearchQuery = research_type ? true : !!req.__isResearchQuery;
            const defaultModel = (() => {
                if (research_type === 'deep')
                    return 'gpt-5';
                if (research_type === 'quick')
                    return 'gpt-5-mini';
                return 'gpt-5-mini';
            })();
            const selectedModel = userConfig.model || defaultModel;
            const reasoningEffort = research_type === 'deep' ? 'medium' : 'low';
            const wantsFreshIntel = /recent|latest|today|yesterday|this week|signals?|news|breach|breaches|leadership|funding|acquisition|hiring|layoff|changed|update|report/i.test(requestText.toLowerCase());
            let useTools = research_type === 'deep' || (!research_type && isResearchQuery);
            if (research_type === 'specific' && !wantsFreshIntel) {
                useTools = false;
            }
            if (research_type === 'quick') {
                useTools = false;
            }
            if (!useTools) {
                instructions += '\n\n<tool_policy>Do not call web_search unless a user explicitly asks for fresh external data. Prioritize saved profile context and internal knowledge.</tool_policy>';
            }
            if (isResearchQuery) {
                const contextSummary = summarizeContextForPlan(userContext).replace(/\s+/g, ' ').trim();
                const preview = contextSummary ? `Planning next steps using: ${contextSummary.slice(0, 160)}${contextSummary.length > 160 ? '…' : ''}` : 'Planning next steps using your saved preferences…';
                safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: preview })}\n\n`);
            }
            const storeRun = userConfig?.debug_store ?? true;
            const shouldPlanStream = isResearchQuery && !userConfig?.disable_fast_plan;
            if (!shouldPlanStream) {
                try {
                    const lastUser = Array.isArray(messages) ? messages.filter(m => m.role === 'user').pop() : null;
                    const q = String(lastUser?.content || '').toLowerCase();
                    let ack = '';
                    if (research_type) {
                        if (research_type === 'deep')
                            ack = 'Starting Deep Research — streaming findings…';
                        else if (research_type === 'quick')
                            ack = 'Quick Facts — fetching essentials…';
                        else if (research_type === 'specific')
                            ack = 'On it — answering your specific question…';
                    }
                    else if (isResearchQuery) {
                        ack = "Got it — I'll research that and stream findings.";
                    }
                    else if (q) {
                        ack = 'Okay — answering briefly.';
                    }
                    if (ack) {
                        safeWrite(`data: ${JSON.stringify({ type: 'acknowledgment', content: ack })}\n\n`);
                    }
                }
                catch { }
            }
            console.log('[DEBUG] Creating OpenAI Responses API call with:', {
                model: selectedModel,
                hasInstructions: !!instructions,
                instructionsLength: instructions?.length || 0,
                hasInput: !!input,
                inputLength: input?.length || 0,
                stream: true,
                store: storeRun,
                isResearchQuery,
                useTools,
                reasoningEffort
            });
            let planPromise = null;
            if (shouldPlanStream && lastUserMessage?.content) {
                const planInstructions = `You are the fast planning cortex for a research assistant.\n- Start with a single standalone acknowledgement sentence that confirms you are beginning now, states the research mode (deep/quick/specific/auto), and gives a realistic ETA (deep ≈2 min, quick ≈30 sec, specific ≈1 min, auto ≈1-2 min).\n- Immediately follow with 2-3 markdown bullet steps (prefix each with "- ") describing the investigative actions you will take.\n- Keep bullets under 12 words, action-oriented, and reference saved preferences when they change sequencing.\n- Do not ask the user questions or request clarifications; assume sensible defaults.\n- Do not add closing statements or extra blank lines.`;
                const contextSummary = summarizeContextForPlan(userContext).slice(0, 600);
                const planInput = `Research mode: ${research_type || (isResearchQuery ? 'auto' : 'general')}\nUser request: ${lastUserMessage.content}\nETA guide: deep ≈2 min, quick ≈30 sec, specific ≈1 min, auto ≈90 sec.\nRelevant context:\n${contextSummary || 'No saved profile context yet.'}`;
                planPromise = (async () => {
                    try {
                        const fastStream = await openai.responses.stream({
                            model: 'gpt-5-mini',
                            instructions: planInstructions,
                            input: planInput,
                            text: { format: { type: 'text' }, verbosity: 'low' },
                            reasoning: { effort: 'low' },
                            store: false,
                            metadata: {
                                agent: 'company_research',
                                stage: 'fast_plan',
                                chat_id: chatId || null,
                                user_id: user.id
                            }
                        });
                        let planFirstDeltaSent = false;
                        for await (const fastChunk of fastStream) {
                            if (responseClosed)
                                break;
                            if (fastChunk.type === 'response.output_text.delta' && fastChunk.delta) {
                                if (!planFirstDeltaSent) {
                                    planFirstDeltaSent = true;
                                    safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'fast_plan', event: 'first_delta', ttfb_ms: Date.now() - processStart })}\n\n`);
                                }
                                safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: fastChunk.delta, stage: 'plan' })}\n\n`);
                            }
                        }
                        try {
                            await fastStream.finalResponse();
                        }
                        catch (fastFinalErr) {
                            console.error('Fast plan finalization error:', fastFinalErr);
                        }
                    }
                    catch (fastErr) {
                        console.error('Fast plan stream failed:', fastErr);
                        try {
                            safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: 'Plan generation failed, continuing anyway…' })}\n\n`);
                        }
                        catch { }
                    }
                })();
            }
            // Create streaming response using GPT-5 Responses API
            const openAIConnectStart = Date.now();
            const stream = await openai.responses.stream({
                model: selectedModel,
                instructions,
                input,
                text: { format: { type: 'text' }, verbosity: 'low' },
                reasoning: { effort: reasoningEffort },
                tools: useTools ? [{ type: 'web_search' }] : [],
                parallel_tool_calls: useTools,
                store: storeRun,
                metadata: {
                    agent: 'company_research',
                    research_type: research_type || (isResearchQuery ? 'auto' : 'none'),
                    chat_id: chatId || null,
                    user_id: user.id
                }
                // Do not limit include fields; allow default event stream so we can surface reasoning + tool events
            });
            const openAIConnectMs = Date.now() - openAIConnectStart;
            try {
                const routeMeta = {
                    type: 'meta',
                    response_id: 'pending',
                    model: selectedModel,
                    route: 'vercel/api/ai/chat',
                    runtime: 'nodejs',
                    timings: {
                        auth_ms: authAndCreditMs,
                        context_ms: contextFetchMs,
                        openai_connect_ms: openAIConnectMs
                    }
                };
                safeWrite(`data: ${JSON.stringify(routeMeta)}\n\n`);
            }
            catch (metaErr) {
                console.error('Failed to emit meta event', metaErr);
            }
    let accumulatedContent = '';
    let chunkCount = 0;
    let metaSent = false;
    let firstContentSent = false;
    let firstContentAt = null;
    let reasoningStartedAt = null;
    let contentLatencyEmitted = false;
            let keepAliveDelay = 2000;
            const scheduleKeepAlive = () => {
                keepAlive = setTimeout(() => {
                    if (firstContentSent)
                        return;
                    try {
                        safeWrite(`data: ${JSON.stringify({ type: 'ping', ts: Date.now() })}\n\n`);
                    }
                    catch (intervalError) {
                        console.error('Keep-alive write failed:', intervalError);
                        return;
                    }
                    keepAliveDelay = Math.min(10000, keepAliveDelay + 3000);
                    scheduleKeepAlive();
                }, keepAliveDelay);
            };
            scheduleKeepAlive();
            console.log('[DEBUG] Starting to process stream...');
            if (process.env.ENABLE_PROMPT_DEBUG === 'true') {
                try {
                    safeWrite(`data: ${JSON.stringify({ type: 'debug_prompt', instructions, input })}\n\n`);
                }
                catch (debugErr) {
                    console.warn('Failed to emit prompt debug event', debugErr);
                }
            }
            // Process the stream
            for await (const chunk of stream) {
                chunkCount++;
                // Handle different event types from the Responses API
                if (!metaSent && chunk?.response?.id) {
                    try {
                        console.log('[OPENAI] response.id:', chunk.response.id);
                    }
                    catch { }
                    safeWrite(`data: ${JSON.stringify({ type: 'meta', response_id: chunk.response.id, model: selectedModel })}\n\n`);
                    metaSent = true;
                }
        if (chunk.type === 'response.reasoning_summary_text.delta' || chunk.type === 'response.reasoning.delta') {
            const delta = chunk.delta || '';
            if (delta) {
                if (reasoningStartedAt == null) {
                    reasoningStartedAt = Date.now();
                    safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'reasoning_start', ms_since_request: reasoningStartedAt - processStart })}\n\n`);
                }
                safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: delta })}\n\n`);
            }
        }
        else if (chunk.type === 'response.output_text.delta') {
            if (chunk.delta) {
                accumulatedContent += chunk.delta;
                safeWrite(`data: ${JSON.stringify({
                    type: 'content',
                    content: chunk.delta
                })}\n\n`);
                if (!firstContentSent) {
                    firstContentSent = true;
                    firstContentAt = Date.now();
                    safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'primary', event: 'first_delta', ttfb_ms: firstContentAt - processStart })}\n\n`);
                    if (!contentLatencyEmitted && reasoningStartedAt != null) {
                        contentLatencyEmitted = true;
                        safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'content_latency', reasoning_to_content_ms: firstContentAt - reasoningStartedAt })}\n\n`);
                    }
                    if (keepAlive) {
                        clearTimeout(keepAlive);
                        keepAlive = null;
                    }
                }
            }
        }
                else if (chunk.type?.includes('tool') ||
                    chunk.type === 'response.function_call.arguments.delta' ||
                    chunk.type === 'response.function_call.done') {
                    // Surface web_search tool activity across different event types
                    const name = chunk.name || chunk.tool_name || '';
                    const args = chunk.arguments || chunk.tool_arguments || {};
                    const result = chunk.result || chunk.tool_result || {};
                    const query = (args && (args.query || args.q)) || (result && result.query) || '';
                    let sources = [];
                    const r = result?.results || result?.items || result?.sources || [];
                    if (Array.isArray(r)) {
                        sources = r
                            .map((item) => typeof item === 'string' ? item : (item?.url || item?.link || item?.source_url))
                            .filter(Boolean)
                            .slice(0, 5);
                    }
                    if (String(name).includes('web_search')) {
                        safeWrite(`data: ${JSON.stringify({ type: 'web_search', query, sources })}\n\n`);
                    }
                }
                else if (chunk.type === 'response.completed') {
                    // Response is complete
                    safeWrite(`data: ${JSON.stringify({
                        type: 'done',
                        response_id: chunk.response?.id || chunk.id
                    })}\n\n`);
                    break;
                }
                // Log for debugging
                if (chunkCount <= 5 || chunk.type === 'response.completed') {
                    console.log('[DEBUG] Chunk', chunkCount, 'type:', chunk.type);
                }
            }
            let finalResponseData = null;
            try {
                finalResponseData = await stream.finalResponse();
            }
            catch (finalErr) {
                console.error('Stream finalization error:', finalErr);
            }
            console.log('[DEBUG] Stream processing complete. Total chunks:', chunkCount);
            console.log('[DEBUG] Total content length:', accumulatedContent.length);
            if (planPromise) {
                try {
                    await planPromise;
                }
                catch (planAwaitErr) {
                    console.error('Fast plan await error:', planAwaitErr);
                }
            }
            safeWrite(`data: [DONE]\n\n`);
            responseClosed = true;
            res.end();
            if (keepAlive) {
                clearTimeout(keepAlive);
                keepAlive = null;
            }
            // Log usage and deduct credits
            await logUsage(supabase, user.id, 'chat_completion', totalEstimatedTokens, {
                chat_id: chatId,
                agent_type: agentType,
                model: selectedModel,
                api: 'responses', // Note that we're using Responses API
                chunks: chunkCount,
                prompt_head: (instructions || '').slice(0, 1000),
                input_head: (input || '').slice(0, 400),
                final_response_id: finalResponseData?.id || finalResponseData?.response?.id || null
            });
            await deductCredits(supabase, user.id, totalEstimatedTokens);
        }
        catch (streamError) {
            console.error('Streaming error:', streamError);
            if (keepAlive) {
                clearTimeout(keepAlive);
                keepAlive = null;
            }
            // Send error through SSE
            safeWrite(`data: ${JSON.stringify({
                type: 'error',
                error: streamError.message || 'Streaming failed'
            })}\n\n`);
            safeWrite(`data: [DONE]\n\n`);
            responseClosed = true;
            res.end();
        }
    }
    catch (error) {
        console.error('Request error:', error);
        // ensure keep-alive interval is cleaned up
        try {
            if (keepAlive) {
                clearTimeout(keepAlive);
                keepAlive = null;
            }
        }
        catch { }
        // If headers haven't been sent yet, send JSON error
        if (!res.headersSent) {
            return res.status(500).json({
                error: error.message || 'Internal server error'
            });
        }
        else {
            // Otherwise send error through SSE
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: error.message || 'Internal server error'
                })}\n\n`);
            }
            catch { }
            try {
                res.end();
            }
            catch { }
        }
    }
}
