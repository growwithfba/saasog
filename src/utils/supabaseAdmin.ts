import { createClient } from '@supabase/supabase-js'

// Admin client bypasses RLS - use carefully and only in server-side code
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // You need to add this to your .env.local
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export { supabaseAdmin }
