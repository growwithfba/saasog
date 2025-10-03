-- Test Database Setup Script
-- Run this in your Supabase SQL Editor to verify everything is working

-- 1. Check all tables exist
SELECT 'Tables Check' as test_type, 
       COUNT(*) as count,
       STRING_AGG(table_name, ', ') as tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'submissions', 'validation_submissions', 'user_sessions');

-- 2. Check profiles table structure
SELECT 'Profiles Structure' as test_type, 
       column_name, 
       data_type, 
       is_nullable, 
       column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check submissions table structure
SELECT 'Submissions Structure' as test_type,
       column_name, 
       data_type, 
       is_nullable
FROM information_schema.columns 
WHERE table_name = 'submissions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check RLS is enabled
SELECT 'RLS Status' as test_type,
       schemaname,
       tablename,
       rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'submissions', 'validation_submissions', 'user_sessions');

-- 5. Check triggers exist
SELECT 'Triggers' as test_type,
       trigger_name,
       event_object_table,
       action_timing,
       event_manipulation
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND event_object_table IN ('profiles', 'submissions', 'validation_submissions', 'user_sessions')
ORDER BY event_object_table, trigger_name;

-- 6. Check functions exist
SELECT 'Functions' as test_type,
       routine_name,
       routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name IN ('handle_new_user', 'handle_updated_at', 'cleanup_expired_sessions', 'get_user_profile');

-- 7. Test profile creation (this will be handled by the trigger when a user registers)
-- You don't need to run this, it's just for reference
/*
-- This should happen automatically when a user signs up:
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  gen_random_uuid(),
  'test@example.com',
  '{"full_name": "Test User"}'::jsonb
);
*/

-- 8. Check storage buckets
SELECT 'Storage Buckets' as test_type,
       id,
       name,
       public
FROM storage.buckets
WHERE id IN ('avatars', 'submissions');
