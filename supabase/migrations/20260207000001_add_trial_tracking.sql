-- =====================================================
-- ADD TRIAL TRACKING TO PROFILES TABLE
-- =====================================================

-- Add has_used_trial column to track if user has ever had a trial period
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT FALSE;

-- Add first_subscription_date to track when user first subscribed
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_subscription_date TIMESTAMP WITH TIME ZONE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_has_used_trial ON public.profiles(has_used_trial);

-- Add comment to columns for documentation
COMMENT ON COLUMN public.profiles.has_used_trial IS 'Whether the user has ever used a free trial period (true after first subscription)';
COMMENT ON COLUMN public.profiles.first_subscription_date IS 'Date when user first subscribed (with or without trial)';

-- Optional: Set has_used_trial to TRUE for existing users with ACTIVE or TRIALING subscriptions
-- This ensures existing subscribed users won't get a trial again if they resubscribe
UPDATE public.profiles
SET has_used_trial = TRUE
WHERE subscription_status IN ('ACTIVE', 'TRIALING') 
  AND has_used_trial = FALSE;
