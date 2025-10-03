-- Fix RLS authentication issues
-- Run this script in your Supabase SQL Editor

-- First, check if we can see the current authenticated user
SELECT 
  auth.uid() as current_user_id,
  auth.jwt() ->> 'role' as current_role;

-- Drop ALL existing policies on submissions table to start fresh
DROP POLICY IF EXISTS "Users can insert their own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can view their own submissions." ON submissions;
DROP POLICY IF EXISTS "Public submissions are viewable by everyone." ON submissions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON submissions;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON submissions;
DROP POLICY IF EXISTS "Enable read access for public submissions" ON submissions;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON submissions;
DROP POLICY IF EXISTS "Users can update own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can delete own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can update own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can delete own submissions" ON submissions;

-- Create simple, working policies

-- Policy 1: Allow authenticated users to insert submissions
-- More permissive - allows insert if user is authenticated
CREATE POLICY "authenticated_users_can_insert" ON submissions
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy 2: Allow users to view their own submissions and public ones
CREATE POLICY "users_can_view_own_and_public" ON submissions
FOR SELECT 
TO authenticated
USING (
  user_id = auth.uid() OR 
  is_public = true
);

-- Policy 3: Allow users to update their own submissions
CREATE POLICY "users_can_update_own" ON submissions
FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy 4: Allow users to delete their own submissions
CREATE POLICY "users_can_delete_own" ON submissions
FOR DELETE 
TO authenticated
USING (user_id = auth.uid());

-- Ensure RLS is enabled
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Check the policies we just created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies 
WHERE tablename = 'submissions'
ORDER BY policyname;

-- Test: Show current auth context
SELECT 
  auth.uid() as current_user_id,
  auth.jwt() ->> 'aud' as audience,
  auth.jwt() ->> 'role' as role,
  auth.jwt() ->> 'iss' as issuer;

-- Test insertion (should work if you're authenticated)
-- Comment this out if you don't want to create test data
/*
INSERT INTO submissions (
  user_id,
  title,
  product_name,
  score,
  status,
  submission_data,
  metrics
) VALUES (
  auth.uid(),
  'RLS Test - ' || EXTRACT(EPOCH FROM NOW())::text,
  'Test Product',
  85.0,
  'PASS',
  '{"productData": {}, "keepaResults": [], "marketScore": {}}'::jsonb,
  '{"totalCompetitors": 0}'::jsonb
) RETURNING id, user_id, title;
*/
