import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Missing SUPABASE envs')
  process.exit(2)
}
const supabase = createClient(url, anon)

const email = process.env.TEST_EMAIL || 'teste2e@testing.com'
const password = process.env.TEST_PASSWORD || '123456'

const { data, error } = await supabase.auth.signInWithPassword({ email, password })
if (error) {
  console.error('Sign-in failed:', error.message)
  process.exit(1)
}

console.log('Sign-in succeeded. User ID:', data.user?.id)
process.exit(0)
