-- Temporarily disable RLS for testing
-- Run this in your Supabase SQL Editor to test data flow
-- WARNING: This removes security temporarily - only for testing!

-- Disable RLS on submissions table
ALTER TABLE public.submissions DISABLE ROW LEVEL SECURITY;

-- Check that RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'submissions';

-- Test inserting a record manually
INSERT INTO public.submissions (
  user_id,
  title,
  product_name,
  score,
  status,
  submission_data,
  metrics
) VALUES (
  '94a96a9c-ef9e-4e9c-bf8e-44db914feb58', -- Your user ID from logs
  'Test Manual Insert',
  'Test Product Manual',
  85.0,
  'PASS',
  '{"productData": {"competitors": []}, "keepaResults": [], "marketScore": {"score": 85, "status": "PASS"}}'::jsonb,
  '{"totalCompetitors": 0, "totalMarketCap": 0, "revenuePerCompetitor": 0}'::jsonb
);

-- Check if the insert worked
SELECT id, user_id, title, product_name, score, status, created_at
FROM public.submissions 
WHERE user_id = '94a96a9c-ef9e-4e9c-bf8e-44db914feb58'
ORDER BY created_at DESC;

-- After testing, you can re-enable RLS with:
-- ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
