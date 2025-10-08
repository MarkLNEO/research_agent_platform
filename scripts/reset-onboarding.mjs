import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const email = process.env.RESET_EMAIL || process.argv[2] || 'codex.e2e@nevereverordinary.com'
const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) { console.error('Missing SUPABASE envs'); process.exit(2) }
const admin = createClient(url, service)

const { data: list } = await admin.auth.admin.listUsers()
const user = list.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
if (!user) { console.error('User not found', email); process.exit(1) }

await admin.from('company_profiles').upsert({
  user_id: user.id,
  onboarding_step: 1,
  onboarding_complete: false,
  company_name: null,
  company_url: null,
  user_role: null,
  use_case: null,
  industry: null,
  icp_definition: null,
  competitors: [],
  target_titles: []
}, { onConflict: 'user_id' })

await admin.from('user_custom_criteria').delete().eq('user_id', user.id)
await admin.from('user_signal_preferences').delete().eq('user_id', user.id)
console.log('Reset onboarding for', email, 'id', user.id)
