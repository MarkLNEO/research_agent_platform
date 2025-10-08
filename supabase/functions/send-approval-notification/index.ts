// Supabase Edge Function: Send approval notification email
// Triggered when a new user signs up

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = 'mlerner@rebarhq.ai';

serve(async (req) => {
  try {
    const { user } = await req.json();

    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: 'Missing user data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Research Agent <noreply@rebarhq.ai>',
        to: [ADMIN_EMAIL],
        subject: `New User Signup: ${user.email}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New User Signup Pending Approval</h2>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Name:</strong> ${user.user_metadata?.name || 'Not provided'}</p>
              <p><strong>Signed up:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <p>A new user has signed up and is awaiting approval.</p>

            <div style="margin: 30px 0;">
              <a href="${Deno.env.get('SITE_URL')}/admin/approvals" 
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Review Pending Users
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 14px;">
              This is an automated notification from Research Agent Platform.
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error('Resend API error:', error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const emailData = await emailResponse.json();
    console.log('Email sent successfully:', emailData);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending approval notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
