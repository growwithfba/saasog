-- =====================================================
-- COMPLETE SUPABASE SETUP FOR SAASOG APPLICATION
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE (for user management)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  username TEXT UNIQUE,
  website TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =====================================================
-- 2. SUBMISSIONS TABLE (already exists, but ensure it's complete)
-- =====================================================
-- This table was already created in the previous migration
-- Just ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_public ON public.submissions(is_public) WHERE is_public = TRUE;

-- =====================================================
-- 3. VALIDATION_SUBMISSIONS TABLE (already exists)
-- =====================================================
-- This table was already created in the previous migration
-- Just ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_validation_submissions_user_id ON public.validation_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_validation_submissions_status ON public.validation_submissions(status);
CREATE INDEX IF NOT EXISTS idx_validation_submissions_created_at ON public.validation_submissions(created_at DESC);

-- =====================================================
-- 4. USER SESSIONS TABLE (for better session management)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET
);

-- Enable RLS on user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- User sessions RLS policies
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON public.user_sessions(expires_at);

-- =====================================================
-- 5. FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to automatically create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER handle_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_submissions
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_validation_submissions
  BEFORE UPDATE ON public.validation_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_user_sessions
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- 6. STORAGE SETUP (for file uploads if needed)
-- =====================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can upload an avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can update their own avatar" ON storage.objects
  FOR UPDATE USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for submissions
CREATE POLICY "Users can view their own submission files" ON storage.objects
  FOR SELECT USING (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own submission files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================
-- 7. ADDITIONAL HELPER FUNCTIONS
-- =====================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_sessions 
  WHERE expires_at < NOW();
END;
$$;

-- Function to get user profile
CREATE OR REPLACE FUNCTION public.get_user_profile(user_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  avatar_url TEXT,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    au.email
  FROM public.profiles p
  JOIN auth.users au ON p.id = au.id
  WHERE p.id = user_id;
END;
$$;

-- =====================================================
-- 8. SEED DATA AND INITIAL SETUP
-- =====================================================

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);

-- =====================================================
-- 9. SECURITY ENHANCEMENTS
-- =====================================================

-- Ensure all tables have proper RLS enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- =====================================================
-- 10. FINAL VERIFICATION
-- =====================================================

-- Verify all tables exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    RAISE EXCEPTION 'profiles table was not created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'submissions' AND table_schema = 'public') THEN
    RAISE EXCEPTION 'submissions table was not created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'validation_submissions' AND table_schema = 'public') THEN
    RAISE EXCEPTION 'validation_submissions table was not created';
  END IF;
  
  RAISE NOTICE 'All tables created successfully!';
END;
$$;
