-- Test inserting a submission manually to verify the table structure works
-- Run this in your Supabase SQL Editor

-- First, let's see what users exist in the auth.users table
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Now let's try inserting a test submission
-- Replace 'USER_ID_HERE' with an actual user ID from the query above
INSERT INTO public.submissions (
  user_id,
  title,
  product_name,
  score,
  status,
  submission_data,
  metrics
) VALUES (
  (SELECT id FROM auth.users LIMIT 1), -- Use the first user ID
  'Test Submission',
  'Test Product',
  75.5,
  'PASS',
  '{"productData": {"competitors": []}, "keepaResults": [], "marketScore": {"score": 75.5, "status": "PASS"}}'::jsonb,
  '{"totalCompetitors": 0, "totalMarketCap": 0, "revenuePerCompetitor": 0}'::jsonb
);

-- Check if the insertion worked
SELECT 
  id,
  user_id,
  title,
  product_name,
  score,
  status,
  created_at
FROM public.submissions 
ORDER BY created_at DESC 
LIMIT 5;

-- Clean up the test data (optional)
-- DELETE FROM public.submissions WHERE title = 'Test Submission';
