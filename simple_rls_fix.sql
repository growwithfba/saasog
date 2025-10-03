-- Simpler RLS approach that should work immediately
-- Run this in Supabase SQL Editor

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can update own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can delete own submissions" ON submissions;

-- Create a single, simple policy for all operations for authenticated users
-- This is less secure but will work for development

-- Allow all operations for authenticated users on their own data
CREATE POLICY "Enable all for authenticated users" ON submissions
FOR ALL 
USING (auth.uid()::text = user_id::text)
WITH CHECK (auth.uid()::text = user_id::text);

-- Also allow viewing public submissions
CREATE POLICY "Anyone can view public submissions" ON submissions
FOR SELECT
USING (is_public = true);

-- Make sure RLS is enabled
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Verify the new policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'submissions';

-- Important: Check if your user_id matches auth.uid()
SELECT 
  auth.uid() as auth_user_id,
  '94a96a9c-ef9e-4e9c-bf8e-44db914feb58' as your_user_id,
  auth.uid() = '94a96a9c-ef9e-4e9c-bf8e-44db914feb58'::uuid as do_they_match;
