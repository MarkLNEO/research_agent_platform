import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const admin = createClient(url, service)

const userId = process.argv[2] || process.env.TARGET_USER_ID
const newPassword = process.argv[3] || process.env.TARGET_USER_NEW_PASSWORD || '123456'

if (!userId) {
  console.error('Usage: node scripts/admin-update-user-password.mjs <userId> [newPassword]')
  process.exit(2)
}

try {
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword
  })
  if (error) {
    console.error('Update failed:', error.message)
    process.exit(1)
  }
  console.log('Password updated for user:', data.user?.email || userId)
  process.exit(0)
} catch (e) {
  console.error('Error:', e?.message || e)
  process.exit(1)
}

