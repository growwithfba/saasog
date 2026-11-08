-- Optional phone number from the BloomEngine signup form (added 2026-11).
-- Nullable: the field is optional and existing profiles have none.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
