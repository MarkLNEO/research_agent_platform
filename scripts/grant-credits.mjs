import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(2)
  }

  const email = process.env.GRANT_EMAIL || process.argv[2]
  const amount = Number(process.env.GRANT_CREDITS || process.argv[3] || 10000)
  if (!email) {
    console.error('Usage: node scripts/grant-credits.mjs <email> [amount]')
    process.exit(2)
  }

  const admin = createClient(url, service)

  // Find user by email in auth
  // Prefer direct lookup by email to avoid pagination issues
  let user = null
  try {
    const { data } = await admin.auth.admin.getUserByEmail(email)
    user = data?.user || null
  } catch (e) {
    // Fallback to paginated list if getUserByEmail not available/throws
    const { data: list, error: listErr } = await admin.auth.admin.listUsers()
    if (listErr) { console.error('listUsers error:', listErr.message); process.exit(1) }
    user = list?.users?.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null
  }
  if (!user) { console.error('User not found:', email); process.exit(1) }

  // Upsert app-level users row
  const upsertPayload = {
    id: user.id,
    email: user.email,
    credits_remaining: amount,
    credits_total_used: 0,
    approval_status: 'approved'
  }
  const { error: upsertErr } = await admin.from('users').upsert(upsertPayload, { onConflict: 'id' })
  if (upsertErr) { console.error('Upsert error:', upsertErr.message); process.exit(1) }

  console.log(`Granted ${amount} credits to ${email} (id: ${user.id})`)
}

main().catch(e => { console.error(e); process.exit(1) })
