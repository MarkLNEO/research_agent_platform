export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const SITE_URL = process.env.SITE_URL || '';
        const { user } = req.body || {};
        if (!user?.email)
            return res.status(400).json({ error: 'Missing user.email' });
        const name = user.name || user.user_metadata?.name || 'there';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">You're approved! 🎉</h2>
        <p>Hi ${name},</p>
        <p>Your account has been approved. You now have credits to run research in the platform.</p>
        <p>
          <a href="${SITE_URL}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Open Research Agent</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">If you have any questions, just reply to this email.</p>
      </div>`;
        if (!RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not set; skipping email send');
            return res.status(200).json({ success: true, skipped: true });
        }
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Research Agent <noreply@rebarhq.ai>', to: [user.email], subject: 'Welcome to Research Agent', html }) });
        if (!r.ok)
            return res.status(500).json({ error: await r.text() });
        const data = await r.json();
        return res.status(200).json({ success: true, emailId: data.id });
    }
    catch (error) {
        console.error('approvals/confirm error', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
