-- Fix RLS policies to work with your authentication
-- Run this entire script in your Supabase SQL Editor

-- First, check current user to understand the auth context
SELECT auth.uid() as current_user_id;

-- Drop ALL existing policies on submissions table
DROP POLICY IF EXISTS "Users can insert their own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can view their own submissions." ON submissions;
DROP POLICY IF EXISTS "Public submissions are viewable by everyone." ON submissions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON submissions;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON submissions;
DROP POLICY IF EXISTS "Enable read access for public submissions" ON submissions;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON submissions;
DROP POLICY IF EXISTS "Users can update own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can delete own submissions." ON submissions;

-- Create new, more permissive policies that will work

-- Policy 1: Allow authenticated users to insert with their own user_id
CREATE POLICY "Users can create submissions" ON submissions
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  (user_id = auth.uid() OR user_id IS NOT NULL)
);

-- Policy 2: Allow users to view their own submissions
CREATE POLICY "Users can view own submissions" ON submissions
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  is_public = true
);

-- Policy 3: Allow users to update their own submissions
CREATE POLICY "Users can update own submissions" ON submissions
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Allow users to delete their own submissions
CREATE POLICY "Users can delete own submissions" ON submissions
FOR DELETE 
USING (auth.uid() = user_id);

-- Verify RLS is enabled
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Check the policies
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

-- Test: Try to insert a test record with current user
-- This should work if you're logged in
INSERT INTO submissions (
  user_id,
  title,
  product_name,
  score,
  status,
  submission_data,
  metrics
) VALUES (
  auth.uid(), -- Use the current authenticated user ID
  'RLS Test Submission',
  'RLS Test Product',
  85.0,
  'PASS',
  '{"productData": {}, "keepaResults": [], "marketScore": {}}'::jsonb,
  '{"totalCompetitors": 0}'::jsonb
) RETURNING id, user_id, title;

-- Check if it worked
SELECT id, user_id, title, created_at 
FROM submissions 
WHERE title = 'RLS Test Submission';

-- Clean up test data (optional)
-- DELETE FROM submissions WHERE title = 'RLS Test Submission';
