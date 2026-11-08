-- Phone number collected on the BloomEngine signup form (required for new
-- signups from 2026-11). Nullable so existing profiles stay valid.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
