import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'Research Agent <noreply@rebarhq.ai>'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { job_id, user_id, companies, research_type, to_email } = await req.json()
    if (!job_id || !user_id || !Array.isArray(companies)) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Resolve recipient email if not provided
    let recipient = to_email as string | undefined
    if (!recipient) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const admin = createClient(supabaseUrl, serviceKey)
      const { data, error } = await admin.auth.admin.getUserById(user_id)
      if (error) throw error
      recipient = data.user?.email ?? undefined
    }

    if (!recipient) {
      return new Response(JSON.stringify({ error: 'No recipient email for user' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color:#2563eb;">Bulk Research Complete</h2>
        <p>Your bulk ${research_type || 'quick'} research has completed for ${companies.length} companies.</p>
        <p><strong>Job ID:</strong> ${job_id}</p>
        <p><strong>Companies (first 10):</strong> ${(companies.slice(0,10) as string[]).join(', ')}</p>
        <p>You can view the results in the app under Bulk Research Jobs or download the CSV there.</p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        subject: 'Your bulk research job has completed',
        html,
      })
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(JSON.stringify({ error: text }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
