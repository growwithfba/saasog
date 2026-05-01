-- =====================================================
-- BLOOMENGINE EXTENSION TOKENS
-- =====================================================
-- Backs the BloomEngine Chrome extension auth flow (Phase 5.4).
--
-- Flow:
--   1. Extension generates a random pair_code, opens
--      bloomengine.ai/login?ext_pair=<code>
--   2. After Supabase login, Login.tsx POSTs to /api/extension/pair.
--      Server creates a row here with the user_id, the pair_code,
--      and a sha256 hash of a freshly-generated raw token.
--   3. Extension polls /api/extension/pair-status?code=<code>.
--      First successful poll returns the raw token AND clears
--      pair_code (single-use), so the token can never be re-fetched.
--   4. All future extension API calls send Authorization: Bearer <raw>.
--      Server hashes and looks up by token_hash.
--   5. On every /me hit, server checks expires_at. If <30 days remain,
--      it issues a fresh row (revokes old) and returns the new raw
--      token to the extension via a response header — silent refresh.
--
-- Security model:
--   - Raw tokens are NEVER stored. Only sha256(raw) lives in token_hash.
--   - Pair codes expire after 5 minutes (pair_code_expires_at).
--   - All writes go through service-role API routes; no client writes.
--   - Users can SELECT their own tokens (for a "manage devices" UI later)
--     and UPDATE to revoke their own tokens.

CREATE TABLE IF NOT EXISTS public.extension_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- sha256 hex of the raw token. Raw token is returned to the
  -- extension exactly once (during pair-status poll) and never stored.
  token_hash TEXT NOT NULL UNIQUE,

  -- Single-use pairing code. NULL once the extension has retrieved the
  -- token. Indexed when present so pair-status polling is O(log n).
  pair_code TEXT UNIQUE,
  pair_code_expires_at TIMESTAMP WITH TIME ZONE,

  -- Token lifecycle.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,

  -- Diagnostic context (not used for auth).
  user_agent TEXT,
  ip_addr INET
);

-- Indexes
-- Fast lookup of a user's active tokens (for revoke-all on logout, and
-- a future "manage devices" UI).
CREATE INDEX IF NOT EXISTS idx_extension_tokens_user_active
  ON public.extension_tokens (user_id)
  WHERE revoked_at IS NULL;

-- Fast pair-code lookup during the polling window. Partial index keeps
-- it small — most rows will have pair_code = NULL.
CREATE INDEX IF NOT EXISTS idx_extension_tokens_pair_code
  ON public.extension_tokens (pair_code)
  WHERE pair_code IS NOT NULL;

-- Hash lookup is the hot path on every API call. UNIQUE constraint
-- already creates a btree index, but make it explicit for clarity.
CREATE INDEX IF NOT EXISTS idx_extension_tokens_token_hash
  ON public.extension_tokens (token_hash);

-- Comments
COMMENT ON TABLE public.extension_tokens IS
  'Long-lived bearer tokens for the BloomEngine Chrome extension. Raw tokens are never stored — only sha256 hashes.';
COMMENT ON COLUMN public.extension_tokens.token_hash IS
  'sha256 hex of the raw token. Raw token leaves the server exactly once.';
COMMENT ON COLUMN public.extension_tokens.pair_code IS
  'Single-use code that links a pre-login extension to a post-login user. NULL after first retrieval.';
COMMENT ON COLUMN public.extension_tokens.expires_at IS
  '90 days after creation. Refreshed silently when <30 days remain.';

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

-- Service-role API routes do all writes (token creation, refresh,
-- revoke). Authenticated users can only read their own tokens (for a
-- future "Connected Devices" UI) and update them (to revoke).

CREATE POLICY "extension_tokens_select_own"
  ON public.extension_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "extension_tokens_update_own"
  ON public.extension_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No INSERT or DELETE policies for authenticated role.
-- All writes flow through service-role API routes.
