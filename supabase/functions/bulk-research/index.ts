// Supabase Edge Function: Bulk Research
// POST body: { companies: string[], research_type: 'quick' | 'deep' }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { companies, research_type } = await req.json()

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Companies array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!research_type || !['quick', 'deep'].includes(research_type)) {
      return new Response(
        JSON.stringify({ error: 'Research type must be "quick" or "deep"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create bulk research job record
    const jobId = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('bulk_research_jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        companies,
        research_type,
        status: 'pending',
        total_count: companies.length,
        completed_count: 0,
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Failed to create bulk research job:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create research job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Start processing companies in background
    // Note: In a production environment, you'd want to use a proper job queue
    // For now, we'll process them sequentially with the chat function
    processCompaniesInBackground(jobId, companies, research_type, user.id, supabase)

    return new Response(
      JSON.stringify({ 
        success: true, 
        job_id: jobId,
        message: `Started ${research_type} research for ${companies.length} companies`,
        estimated_completion: new Date(Date.now() + (companies.length * (research_type === 'deep' ? 8 : 3) * 60 * 1000)).toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Bulk research error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function processCompaniesInBackground(
  jobId: string, 
  companies: string[], 
  researchType: string, 
  userId: string, 
  supabase: any
) {
  try {
    // Update job status to running
    await supabase
      .from('bulk_research_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId)

    const results = []
    
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]
      
      try {
        // Call the chat function for each company
        const chatResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/chat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
            'apikey': `${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            messages: [
              { 
                role: 'user', 
                content: `Research ${company}` 
              },
              {
                role: 'user',
                content: researchType
              }
            ],
            stream: false, // Non-streaming for bulk processing
            bulk_research_job_id: jobId,
            user_id: userId,
          }),
        })

        if (chatResponse.ok) {
          const researchResult = await chatResponse.text()
          results.push({
            company,
            status: 'completed',
            result: researchResult,
            completed_at: new Date().toISOString()
          })
        } else {
          results.push({
            company,
            status: 'failed',
            error: `Research failed: ${chatResponse.status}`,
            completed_at: new Date().toISOString()
          })
        }

        // Update progress
        await supabase
          .from('bulk_research_jobs')
          .update({ 
            completed_count: i + 1,
            results: results,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId)

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`Failed to research ${company}:`, error)
        results.push({
          company,
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString()
        })
      }
    }

    // Mark job as completed
    await supabase
      .from('bulk_research_jobs')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: results
      })
      .eq('id', jobId)

    console.log(`Bulk research job ${jobId} completed: ${results.length} companies processed`)

  } catch (error) {
    console.error(`Bulk research job ${jobId} failed:`, error)
    
    // Mark job as failed
    await supabase
      .from('bulk_research_jobs')
      .update({ 
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}
