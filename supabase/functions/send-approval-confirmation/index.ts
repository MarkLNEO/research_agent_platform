// Supabase Edge Function: Send approval confirmation email to the approved user
// POST body: { user: { email: string, name?: string } }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'Research Agent <noreply@rebarhq.ai>';

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user } = await req.json();
    if (!user?.email) {
      return new Response(JSON.stringify({ error: 'Missing user.email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const name = user.name || user.user_metadata?.name || 'there';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">You're approved! 🎉</h2>
        <p>Hi ${name},</p>
        <p>Your account has been approved. You now have credits to run research in the platform.</p>
        <p>
          <a href="${Deno.env.get('SITE_URL') || 'https://app.example.com'}" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Open Research Agent
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">If you have any questions, just reply to this email.</p>
      </div>
    `;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: 'Welcome to Research Agent', html }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ success: true, emailId: data.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
