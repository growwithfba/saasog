-- Fix RLS policies to allow proper insertion and selection
-- Run this in your Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own submissions." ON submissions;
DROP POLICY IF EXISTS "Users can view their own submissions." ON submissions;
DROP POLICY IF EXISTS "Public submissions are viewable by everyone." ON submissions;

-- Create more permissive policies for development
-- Policy 1: Allow users to insert submissions
CREATE POLICY "Enable insert for authenticated users only" ON submissions
FOR INSERT TO authenticated
WITH CHECK (true);

-- Policy 2: Allow users to view their own submissions
CREATE POLICY "Enable read access for users based on user_id" ON submissions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Policy 3: Allow viewing public submissions
CREATE POLICY "Enable read access for public submissions" ON submissions
FOR SELECT TO authenticated
USING (is_public = true);

-- Policy 4: Allow users to update their own submissions
CREATE POLICY "Enable update for users based on user_id" ON submissions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'submissions';

-- Also check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'submissions';
