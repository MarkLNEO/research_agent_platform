// Email Service for sending notifications
// Uses Resend API for reliable email delivery

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'mlerner@rebarhq.ai';
const SITE_URL = process.env.SITE_URL || 'http://localhost:5173';

/**
 * Send approval notification email to admin
 */
async function sendApprovalNotification(user) {
  if (!RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not configured, skipping email notification');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Research Agent <noreply@rebarhq.ai>',
        to: [ADMIN_EMAIL],
        subject: `🔔 New User Signup: ${user.email}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #2563eb; margin: 0; font-size: 24px;">Research Agent Platform</h1>
                <p style="color: #6b7280; margin: 10px 0 0 0;">New User Approval Required</p>
              </div>

              <!-- Main Content -->
              <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px;">
                <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 20px;">New User Signup</h2>
                
                <div style="background: #f9fafb; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Email:</td>
                      <td style="padding: 8px 0; color: #111827;">${user.email}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Name:</td>
                      <td style="padding: 8px 0; color: #111827;">${user.name || 'Not provided'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Signed up:</td>
                      <td style="padding: 8px 0; color: #111827;">${new Date().toLocaleString('en-US', { 
                        dateStyle: 'medium', 
                        timeStyle: 'short' 
                      })}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">User ID:</td>
                      <td style="padding: 8px 0; color: #111827; font-family: monospace; font-size: 12px;">${user.id}</td>
                    </tr>
                  </table>
                </div>

                <p style="color: #374151; line-height: 1.6; margin: 20px 0;">
                  A new user has signed up for the Research Agent Platform and is awaiting your approval.
                </p>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${SITE_URL}/admin/approvals" 
                     style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Review Pending Users →
                  </a>
                </div>

                <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; color: #92400e; font-size: 14px;">
                    <strong>⏰ Action Required:</strong> The user is currently seeing a "Pending Approval" screen and cannot access the platform until you approve their account.
                  </p>
                </div>
              </div>

              <!-- Footer -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                  This is an automated notification from Research Agent Platform
                </p>
                <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                  To manage email preferences, visit your admin dashboard
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EMAIL] Resend API error:', response.status, errorText);
      throw new Error(`Resend API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[EMAIL] Approval notification sent successfully:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send approval notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send approval confirmation email to user
 */
async function sendApprovalConfirmation(user) {
  if (!RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Research Agent <noreply@rebarhq.ai>',
        to: [user.email],
        subject: '✅ Your Research Agent account has been approved!',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #2563eb; margin: 0;">Welcome to Research Agent! 🎉</h1>
              </div>

              <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px;">
                <p style="font-size: 18px; color: #111827; margin: 0 0 20px 0;">
                  Hi ${user.name || 'there'},
                </p>

                <p style="color: #374151; line-height: 1.6;">
                  Great news! Your account has been approved and you're ready to start using Research Agent Platform.
                </p>

                <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #065f46; font-weight: 600;">✨ You've been granted 1,000 credits to get started!</p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${SITE_URL}" 
                     style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                    Start Researching →
                  </a>
                </div>

                <h3 style="color: #111827; margin: 30px 0 15px 0;">What you can do:</h3>
                <ul style="color: #374151; line-height: 1.8; padding-left: 20px;">
                  <li>Research companies with AI-powered insights</li>
                  <li>Track strategic accounts for signals</li>
                  <li>Get personalized outreach recommendations</li>
                  <li>Bulk upload companies via CSV</li>
                </ul>

                <p style="color: #6b7280; font-size: 14px; margin: 30px 0 0 0;">
                  Need help? Reply to this email or contact us at ${ADMIN_EMAIL}
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EMAIL] Resend API error:', errorText);
      throw new Error(`Resend API error: ${errorText}`);
    }

    const data = await response.json();
    console.log('[EMAIL] Approval confirmation sent to user:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send approval confirmation:', error);
    return { success: false, error: error.message };
  }
}

export {
  sendApprovalNotification,
  sendApprovalConfirmation,
};
