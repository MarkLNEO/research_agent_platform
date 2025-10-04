// Supabase Edge Function: Refresh Tracked Accounts
// Runs periodically to update tracked accounts with latest research

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get accounts that need refreshing (not researched in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: accounts, error } = await supabase
      .from('tracked_accounts')
      .select('*')
      .eq('monitoring_enabled', true)
      .or(`last_researched_at.is.null,last_researched_at.lt.${sevenDaysAgo.toISOString()}`)
      .limit(10); // Process 10 at a time

    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No accounts need refreshing', processed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    // Process each account
    for (const account of accounts) {
      try {
        // Call OpenAI to get quick research update
        const research = await quickResearch(account.company_name);

        // Update the account with new data
        await supabase
          .from('tracked_accounts')
          .update({
            last_researched_at: new Date().toISOString(),
            last_research_summary: research.summary,
            signal_score: research.signalScore,
            priority: research.priority,
          })
          .eq('id', account.id);

        // Detect and log signals
        if (research.signals && research.signals.length > 0) {
          for (const signal of research.signals) {
            await supabase
              .from('account_signals')
              .insert({
                account_id: account.id,
                user_id: account.user_id,
                signal_type: signal.type,
                signal_title: signal.title,
                signal_description: signal.description,
                signal_date: signal.date,
                signal_score: signal.score,
                source_url: signal.sourceUrl,
              });
          }
        }

        results.push({
          company: account.company_name,
          status: 'success',
          signals: research.signals?.length || 0,
        });
      } catch (err: any) {
        results.push({
          company: account.company_name,
          status: 'error',
          error: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Accounts refreshed',
        processed: accounts.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error refreshing accounts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function quickResearch(companyName: string) {
  // Use GPT‑5 Responses API per project rules
  const body = {
    model: 'gpt-5-mini',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'You are a business intelligence analyst. Provide brief updates on companies in JSON.' }] },
      { role: 'user', content: [{ type: 'input_text', text: `Provide a brief update on ${companyName}. Return strict JSON with keys: summary, signalScore (0-100), priority (hot|warm|standard), signals: array of {type,title,description,date,score,sourceUrl}.` }] }
    ],
    text: { format: { type: 'json' }, verbosity: 'low' },
    store: false,
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errTxt = await response.text().catch(() => '');
    throw new Error(`OpenAI API error: ${response.status} ${errTxt}`);
  }
  const data = await response.json();
  let jsonText = '';
  try { jsonText = data.output_text || ''; } catch {}
  if (!jsonText) {
    try {
      const outputs = Array.isArray(data.output) ? data.output : [];
      const textPart = outputs.find((p: any) => p.type === 'output_text');
      if (textPart?.text) jsonText = textPart.text;
    } catch {}
  }
  const content = JSON.parse(jsonText);
  return {
    summary: content.summary || 'No recent updates',
    signalScore: Number(content.signalScore ?? 50),
    priority: String(content.priority ?? 'standard'),
    signals: Array.isArray(content.signals) ? content.signals : [],
  };
}
