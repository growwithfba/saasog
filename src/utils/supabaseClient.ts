// src/utils/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://znzzgvdxndkuwbqswajw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuenpndmR4bmRrdXdicXN3YWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2OTQ2NzksImV4cCI6MjA2MTI3MDY3OX0.D2U5JWJQ0ZSDjuOlVer4szZBBYd4lQzaBj93qOUweE4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 