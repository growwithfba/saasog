import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://znzzgvdxndkuwbqswajw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuenpndmR4bmRrdXdicXN3YWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2OTQ2NzksImV4cCI6MjA2MTI3MDY3OX0.D2U5JWJQ0ZSDjuOlVer4szZBBYd4lQzaBj93qOUweE4'

// Configure with persistent localStorage session
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'saasog-auth-storage',
    detectSessionInUrl: true
  },
  global: {
    fetch: fetch, // Use the global fetch
    headers: { 'x-application-name': 'saasog' } // Add custom headers
  },
})

// Helper function to ensure an anonymous session exists
export const ensureAnonymousSession = async () => {
  try {
    // Check if there's an existing session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    // If no session, create an anonymous one
    if (sessionError || !sessionData.session) {
      console.log('No existing session found, creating anonymous session...')
      const { data, error } = await supabase.auth.signInAnonymously()
      
      if (error) {
        console.error('Failed to create anonymous session:', error)
        return false
      }
      
      console.log('Anonymous session created:', data.user?.id)
      return true
    }
    
    console.log('Using existing session:', sessionData.session.user.id)
    return true
  } catch (error) {
    console.error('Error ensuring anonymous session:', error)
    return false
  }
} 