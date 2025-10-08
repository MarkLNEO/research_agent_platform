// Supabase Edge Function: Bulk Runner
// POST body: { job_id: string, concurrency?: number }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { job_id, concurrency } = await req.json()
    if (!job_id) {
      return new Response(
        JSON.stringify({ error: 'job_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: job, error: loadErr } = await supabase
      .from('bulk_research_jobs')
      .select('*')
      .eq('id', job_id)
      .single()

    if (loadErr || !job) {
      return new Response(
        JSON.stringify({ error: 'job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (job.status === 'pending') {
      await supabase
        .from('bulk_research_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', job_id)
    }

    // Reclaim stale running tasks older than 15 minutes
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data: stale } = await supabase
        .from('bulk_research_tasks')
        .select('id')
        .eq('job_id', job_id)
        .eq('status', 'running')
        .lt('started_at', fifteenMinAgo)
      if (Array.isArray(stale) && stale.length) {
        const ids = stale.map((t: any) => t.id)
        await supabase
          .from('bulk_research_tasks')
          .update({ status: 'pending', started_at: null })
          .in('id', ids)
      }
    } catch (e) {
      console.error('failed to reclaim stale running tasks', e)
    }

    // Find pending tasks for this job
    const parallel = Math.max(1, Math.min(3, Number(concurrency) || (job.research_type === 'deep' ? 2 : 3)))
    const { data: pendingTasks } = await supabase
      .from('bulk_research_tasks')
      .select('*')
      .eq('job_id', job_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(parallel)

    if (!pendingTasks || pendingTasks.length === 0) {
      // finalize if not already
      if (job.status !== 'completed') {
        await supabase
          .from('bulk_research_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', job_id)
      }
      return new Response(JSON.stringify({ message: 'job already complete' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const svcAnon = createClient(supabaseUrl, anonKey)

    async function processTask(task: any) {
      const startedAt = new Date().toISOString()
      const nextAttempt = (task.attempt_count || 0) + 1
      // mark running with claim-check
      const { data: claimRows } = await supabase
        .from('bulk_research_tasks')
        .update({ status: 'running', started_at: startedAt, attempt_count: nextAttempt })
        .eq('id', task.id)
        .eq('status', 'pending')
        .select('id')
      if (!Array.isArray(claimRows) || claimRows.length === 0) {
        // someone else claimed it
        return
      }
      try {
        const { data: chatData, error: chatErr } = await svcAnon.functions.invoke('chat', {
          body: {
            messages: [
              { role: 'user', content: `Research ${task.company}` },
              { role: 'user', content: job.research_type }
            ],
            stream: false,
            system_run: true,
            impersonate_user_id: job.user_id,
            bulk_research_job_id: job_id,
            bulk_task_id: task.id,
            bulk_subject: task.company,
            user_id: job.user_id,
          },
          headers: { apikey: anonKey }
        })

        const now = new Date().toISOString()
        if (chatErr) {
          // append failed
          const errText = chatErr.message || 'invoke_error'
          if (nextAttempt < 3) {
            await supabase
              .from('bulk_research_tasks')
              .update({ status: 'pending', started_at: null })
              .eq('id', task.id)
          } else {
            await supabase
              .from('bulk_research_tasks')
              .update({ status: 'failed', error: `Research failed: ${errText}`, completed_at: now })
              .eq('id', task.id)
          }
          return
        }

        const payload = chatData as any
        if (payload && typeof payload === 'object' && payload.error) {
          const errText = String(payload.error)
          await supabase
            .from('bulk_research_tasks')
            .update({ status: 'failed', error: `Research failed: ${errText}`, completed_at: now })
            .eq('id', task.id)
          return
        }

        const text = (payload && typeof payload === 'object' && typeof payload.text === 'string')
          ? payload.text
          : (typeof chatData === 'string' ? chatData : '')
        const researchResult = text || (typeof chatData === 'string' ? chatData : JSON.stringify(chatData))

        // Save research output
        try {
          await supabase
            .from('research_outputs')
            .insert({
              user_id: job.user_id,
              subject: task.company,
              research_type: 'company',
              markdown_report: researchResult,
              executive_summary: null,
              sources: [],
              company_data: {},
              leadership_team: [],
              buying_signals: [],
              custom_criteria_assessment: [],
              personalization_points: [],
              recommended_actions: {}
            })
        } catch (e) {
          console.error('save research_outputs failed', e)
        }

        await supabase
          .from('bulk_research_tasks')
          .update({ status: 'completed', result: researchResult, completed_at: now })
          .eq('id', task.id)

      } catch (e: any) {
        const now2 = new Date().toISOString()
        if (nextAttempt < 3) {
          await supabase
            .from('bulk_research_tasks')
            .update({ status: 'pending', started_at: null })
            .eq('id', task.id)
        } else {
          await supabase
            .from('bulk_research_tasks')
            .update({ status: 'failed', error: String(e?.message || e), completed_at: now2 })
            .eq('id', task.id)
        }
      }
    }

    // Run in parallel
    await Promise.all(pendingTasks.map(processTask))

    // Rebuild job results from tasks and update counts
    const { data: taskDone } = await supabase
      .from('bulk_research_tasks')
      .select('company,status,result,error,completed_at')
      .eq('job_id', job_id)
      .in('status', ['completed','failed'] as any)
      .order('completed_at', { ascending: true })

    const doneCount = (taskDone || []).length
    const total = job.total_count || (job.companies?.length || 0)

    await supabase
      .from('bulk_research_jobs')
      .update({
        completed_count: doneCount,
        results: taskDone || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id)

    if (doneCount >= total) {
      await supabase
        .from('bulk_research_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job_id)

      // notify
      try {
        if (Deno.env.get('ENABLE_BULK_EMAIL') === 'true') {
          const notifyUrl = `${supabaseUrl}/functions/v1/send-bulk-complete-notification`
          const companies = (taskDone || []).map((r: any) => r.company).filter(Boolean)
          await fetch(notifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
            },
            body: JSON.stringify({ job_id, user_id: job.user_id, companies, research_type: job.research_type })
          })
        }
      } catch (e) {
        console.error('notify failed', e)
      }
    } else {
      // Self-trigger next batch
      const runnerUrl = `${supabaseUrl}/functions/v1/bulk-runner`
      fetch(runnerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
        body: JSON.stringify({ job_id, concurrency: parallel })
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ processed: pendingTasks.length, remaining: Math.max(0, (total - doneCount)) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('bulk-runner error', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
