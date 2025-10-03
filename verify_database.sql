-- Verify that the tables were created successfully
SELECT 'submissions' as table_name, count(*) as row_count FROM submissions
UNION ALL
SELECT 'validation_submissions' as table_name, count(*) as row_count FROM validation_submissions;

-- Check the structure of the submissions table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'submissions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check the structure of the validation_submissions table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'validation_submissions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verify RLS policies are in place
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename IN ('submissions', 'validation_submissions')
ORDER BY tablename, policyname;

-- Check indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes 
WHERE tablename IN ('submissions', 'validation_submissions')
AND schemaname = 'public'
ORDER BY tablename, indexname;
