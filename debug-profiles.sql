-- View raw user data to see how metadata is stored
SELECT id, email, raw_user_meta_data 
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- Check profiles table data
SELECT id, full_name, username, avatar_url, updated_at
FROM public.profiles
ORDER BY updated_at DESC
LIMIT 10;

-- Check if trigger function is working as expected
-- This query will help debug the handle_new_user function
SELECT id, raw_user_meta_data->>'name' as name, 
       raw_user_meta_data->>'full_name' as full_name,
       raw_user_meta_data->>'avatar_url' as avatar_url
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ORDER BY created_at DESC;

-- Create a test to verify the trigger function works
-- You can run this in the SQL editor to test without creating an account
DO $$
DECLARE
  test_id uuid := gen_random_uuid();
BEGIN
  -- Insert a test user with metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    test_id, 
    'test_trigger@example.com',
    '{"full_name": "Test User", "avatar_url": "https://example.com/avatar.png"}'::jsonb
  );
  
  -- The trigger should automatically create a profile
  -- Check if it worked
  RAISE NOTICE 'Profile record created: %', exists(
    SELECT 1 FROM public.profiles WHERE id = test_id
  );
  
  -- Clean up (optional)
  DELETE FROM auth.users WHERE id = test_id;
END;
$$; 