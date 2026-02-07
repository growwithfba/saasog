-- =====================================================
-- ADD SUBSCRIPTION FIELDS TO PROFILES TABLE
-- =====================================================

-- Add subscription_status column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (subscription_status IN ('ACTIVE', 'TRIALING', 'CANCELED'));

-- Add subscription_type column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_type TEXT CHECK (subscription_type IN ('MONTHLY', 'YEARLY'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_type ON public.profiles(subscription_type);

-- Add comment to columns for documentation
COMMENT ON COLUMN public.profiles.subscription_status IS 'User subscription status: ACTIVE, TRIALING, or CANCELED';
COMMENT ON COLUMN public.profiles.subscription_type IS 'User subscription type: MONTHLY or YEARLY';
