-- Add Typeform submission tracking to profiles table
-- This migration adds fields to track weekly Typeform submissions per user

-- Add columns to profiles table for typeform tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS typeform_submissions_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS typeform_week_start DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS typeform_last_submission TIMESTAMP WITH TIME ZONE;

-- Create an index for better performance when querying typeform data
CREATE INDEX IF NOT EXISTS idx_profiles_typeform_week ON public.profiles(typeform_week_start);

-- Function to reset weekly typeform submissions
CREATE OR REPLACE FUNCTION public.reset_weekly_typeform_submissions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset count for users whose week has expired (7 days have passed)
  UPDATE public.profiles 
  SET 
    typeform_submissions_count = 0,
    typeform_week_start = CURRENT_DATE
  WHERE typeform_week_start <= CURRENT_DATE - INTERVAL '7 days';
END;
$$;

-- Function to check and update typeform submission count
CREATE OR REPLACE FUNCTION public.check_and_update_typeform_submissions(user_id UUID)
RETURNS TABLE (
  can_submit BOOLEAN,
  submissions_used INTEGER,
  submissions_remaining INTEGER,
  week_resets_at DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
  week_start DATE;
  days_since_start INTEGER;
BEGIN
  -- First, reset expired weeks for all users
  PERFORM public.reset_weekly_typeform_submissions();
  
  -- Get current user's typeform data
  SELECT 
    COALESCE(typeform_submissions_count, 0),
    COALESCE(typeform_week_start, CURRENT_DATE)
  INTO current_count, week_start
  FROM public.profiles 
  WHERE id = user_id;
  
  -- If user doesn't exist in profiles, return default values
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, CURRENT_DATE;
    RETURN;
  END IF;
  
  -- Calculate days since week start
  days_since_start := CURRENT_DATE - week_start;
  
  -- If more than 7 days have passed, reset the count
  IF days_since_start >= 7 THEN
    UPDATE public.profiles 
    SET 
      typeform_submissions_count = 0,
      typeform_week_start = CURRENT_DATE
    WHERE id = user_id;
    
    current_count := 0;
    week_start := CURRENT_DATE;
  END IF;
  
  -- Return current status
  RETURN QUERY SELECT 
    (current_count < 2) as can_submit,
    current_count as submissions_used,
    GREATEST(0, 2 - current_count) as submissions_remaining,
    (week_start + INTERVAL '7 days')::DATE as week_resets_at;
END;
$$;

-- Function to increment typeform submission count
CREATE OR REPLACE FUNCTION public.increment_typeform_submissions(user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  new_count INTEGER,
  submissions_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
  week_start DATE;
  days_since_start INTEGER;
BEGIN
  -- First, reset expired weeks for all users
  PERFORM public.reset_weekly_typeform_submissions();
  
  -- Get current user's typeform data
  SELECT 
    COALESCE(typeform_submissions_count, 0),
    COALESCE(typeform_week_start, CURRENT_DATE)
  INTO current_count, week_start
  FROM public.profiles 
  WHERE id = user_id;
  
  -- If user doesn't exist in profiles, create basic profile
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, typeform_submissions_count, typeform_week_start)
    VALUES (user_id, 0, CURRENT_DATE)
    ON CONFLICT (id) DO UPDATE SET
      typeform_submissions_count = COALESCE(profiles.typeform_submissions_count, 0),
      typeform_week_start = COALESCE(profiles.typeform_week_start, CURRENT_DATE);
    
    current_count := 0;
    week_start := CURRENT_DATE;
  END IF;
  
  -- Calculate days since week start
  days_since_start := CURRENT_DATE - week_start;
  
  -- If more than 7 days have passed, reset the count
  IF days_since_start >= 7 THEN
    current_count := 0;
    week_start := CURRENT_DATE;
  END IF;
  
  -- Check if user can still submit
  IF current_count >= 2 THEN
    RETURN QUERY SELECT false, current_count, 0;
    RETURN;
  END IF;
  
  -- Increment the count
  UPDATE public.profiles 
  SET 
    typeform_submissions_count = current_count + 1,
    typeform_week_start = week_start,
    typeform_last_submission = NOW()
  WHERE id = user_id;
  
  -- Return success status
  RETURN QUERY SELECT 
    true as success,
    (current_count + 1) as new_count,
    GREATEST(0, 2 - (current_count + 1)) as submissions_remaining;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.reset_weekly_typeform_submissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_update_typeform_submissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_typeform_submissions(UUID) TO authenticated;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.typeform_submissions_count IS 'Number of Typeform submissions made in current week (max 2)';
COMMENT ON COLUMN public.profiles.typeform_week_start IS 'Start date of current typeform submission week';
COMMENT ON COLUMN public.profiles.typeform_last_submission IS 'Timestamp of last typeform submission';
COMMENT ON FUNCTION public.check_and_update_typeform_submissions(UUID) IS 'Check if user can submit typeform and get current status';
COMMENT ON FUNCTION public.increment_typeform_submissions(UUID) IS 'Increment user typeform submission count';
COMMENT ON FUNCTION public.reset_weekly_typeform_submissions() IS 'Reset typeform counts for users whose week has expired';
