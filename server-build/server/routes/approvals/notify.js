export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const ADMIN_EMAIL = process.env.ADMIN_APPROVER_EMAIL || 'mlerner@rebarhq.ai';
        const SITE_URL = process.env.SITE_URL || '';
        const { user } = req.body || {};
        if (!user?.email)
            return res.status(400).json({ error: 'Missing user data' });
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New User Signup Pending Approval</h2>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Name:</strong> ${user.user_metadata?.name || 'Not provided'}</p>
          <p><strong>Signed up:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <div style="margin: 30px 0;">
          <a href="${SITE_URL}/admin/approvals" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Pending Users</a>
        </div>
      </div>`;
        if (!RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not set; skipping email send');
            return res.status(200).json({ success: true, skipped: true });
        }
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Research Agent <noreply@rebarhq.ai>', to: [ADMIN_EMAIL], subject: `New User Signup: ${user.email}`, html })
        });
        if (!r.ok)
            return res.status(500).json({ error: await r.text() });
        const data = await r.json();
        return res.status(200).json({ success: true, emailId: data.id });
    }
    catch (error) {
        console.error('approvals/notify error', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
