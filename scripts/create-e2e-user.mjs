import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
const admin = createClient(url, service)

const email = process.env.TEST_EMAIL || 'teste2e@testing.com'
const password = process.env.TEST_PASSWORD || '123456'

try {
  // Check if user exists via Admin API
  const list = await admin.auth.admin.listUsers()
  const exists = list?.data?.users?.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
  if (exists) {
    console.log('User already exists:', exists.email)
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) { console.error('Create user failed:', error.message); process.exit(1) }
    console.log('Created user:', data.user?.email)
  }
  process.exit(0)
} catch (e) {
  console.error('Error:', e?.message || e)
  process.exit(1)
}
