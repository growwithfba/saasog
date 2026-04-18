-- Consolidate RLS policies across all public tables.
--
-- Problems this closes:
--   1. keepa_runs had RLS entirely disabled (108 rows exposed).
--   2. submissions / research_products / offer_products had a
--      "qual: true" SELECT policy that let any visitor (including
--      anonymous) read every row.
--   3. submissions had duplicate policies layered by several
--      fix_rls_*.sql patches, making the access model unclear.
--
-- Design:
--   - Every data-bearing table follows a single pattern:
--     owner-only select / insert / update / delete,
--     enforced on the `authenticated` role so real anons are blocked.
--   - submissions keeps a public-read path for shared vetting links
--     via (user_id = auth.uid() OR is_public = true).
--   - profiles keeps public select intentionally (display-name lookups
--     from a shared submission page work without auth).
--   - API routes that use service_role bypass RLS entirely, so server
--     bulk-inserts and admin reads are unaffected.

-- ============================================================
-- 1) keepa_runs: enable RLS (critical - currently disabled)
-- ============================================================
alter table public.keepa_runs enable row level security;

create policy "keepa_runs_select_own"
  on public.keepa_runs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "keepa_runs_insert_own"
  on public.keepa_runs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "keepa_runs_update_own"
  on public.keepa_runs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "keepa_runs_delete_own"
  on public.keepa_runs for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 2) submissions: close public-read hole, dedupe, preserve share links
-- ============================================================
drop policy if exists "Public submissions are viewable by anyone" on public.submissions;
drop policy if exists "Users can view their own submissions" on public.submissions;
drop policy if exists "users_can_view_own_and_public" on public.submissions;
drop policy if exists "Users can insert their own submissions" on public.submissions;
drop policy if exists "authenticated_users_can_insert" on public.submissions;
drop policy if exists "Users can update their own submissions" on public.submissions;
drop policy if exists "users_can_update_own" on public.submissions;
drop policy if exists "Users can delete their own submissions" on public.submissions;
drop policy if exists "users_can_delete_own" on public.submissions;

create policy "submissions_select_own_or_public"
  on public.submissions for select
  to authenticated, anon
  using (auth.uid() = user_id or is_public = true);

create policy "submissions_insert_own"
  on public.submissions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "submissions_update_own"
  on public.submissions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "submissions_delete_own"
  on public.submissions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 3) research_products: close public-read hole, tighten insert
-- ============================================================
drop policy if exists "Enable read access for all users" on public.research_products;
drop policy if exists "Enable insert for authenticated users only" on public.research_products;
drop policy if exists "Users can only insert their own records" on public.research_products;
drop policy if exists "Update own record" on public.research_products;
drop policy if exists "Remove only owner" on public.research_products;

create policy "research_products_select_own"
  on public.research_products for select
  to authenticated
  using (auth.uid() = user_id);

create policy "research_products_insert_own"
  on public.research_products for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "research_products_update_own"
  on public.research_products for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "research_products_delete_own"
  on public.research_products for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 4) offer_products: close public-read hole
-- ============================================================
drop policy if exists "Enable read access for all users" on public.offer_products;
drop policy if exists "Enable insert for authenticated users only" on public.offer_products;
drop policy if exists "Allow me to update my own products" on public.offer_products;
drop policy if exists "Remove only owner" on public.offer_products;

create policy "offer_products_select_own"
  on public.offer_products for select
  to authenticated
  using (auth.uid() = user_id);

create policy "offer_products_insert_own"
  on public.offer_products for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "offer_products_update_own"
  on public.offer_products for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "offer_products_delete_own"
  on public.offer_products for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 5) sourcing_products: rename for consistency (already owner-only)
-- ============================================================
drop policy if exists "Enable users to view their own data only" on public.sourcing_products;
drop policy if exists "Enable insert for users based on user_id" on public.sourcing_products;
drop policy if exists "Allow me to update my own products" on public.sourcing_products;
drop policy if exists "Enable delete for users based on user_id" on public.sourcing_products;

create policy "sourcing_products_select_own"
  on public.sourcing_products for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sourcing_products_insert_own"
  on public.sourcing_products for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "sourcing_products_update_own"
  on public.sourcing_products for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sourcing_products_delete_own"
  on public.sourcing_products for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 6) keepa_analysis: rename for consistency, add missing delete
-- ============================================================
drop policy if exists "Users can view their own keepa analysis" on public.keepa_analysis;
drop policy if exists "Users can insert their own keepa analysis" on public.keepa_analysis;
drop policy if exists "Users can update their own keepa analysis" on public.keepa_analysis;

create policy "keepa_analysis_select_own"
  on public.keepa_analysis for select
  to authenticated
  using (auth.uid() = user_id);

create policy "keepa_analysis_insert_own"
  on public.keepa_analysis for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "keepa_analysis_update_own"
  on public.keepa_analysis for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "keepa_analysis_delete_own"
  on public.keepa_analysis for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 7) user_sessions: rename for consistency (already owner-only)
-- ============================================================
drop policy if exists "Users can view their own sessions" on public.user_sessions;
drop policy if exists "Users can insert their own sessions" on public.user_sessions;
drop policy if exists "Users can update their own sessions" on public.user_sessions;
drop policy if exists "Users can delete their own sessions" on public.user_sessions;

create policy "user_sessions_select_own"
  on public.user_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_sessions_insert_own"
  on public.user_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_sessions_update_own"
  on public.user_sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_sessions_delete_own"
  on public.user_sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 8) validation_submissions: rename for consistency, add delete
-- ============================================================
drop policy if exists "Users can view their own validation submissions" on public.validation_submissions;
drop policy if exists "Users can insert their own validation submissions" on public.validation_submissions;
drop policy if exists "Users can update their own validation submissions" on public.validation_submissions;

create policy "validation_submissions_select_own"
  on public.validation_submissions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "validation_submissions_insert_own"
  on public.validation_submissions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "validation_submissions_update_own"
  on public.validation_submissions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "validation_submissions_delete_own"
  on public.validation_submissions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 9) profiles: keep SELECT public (cross-user display names),
--    normalize naming. No delete policy - profiles aren't deleted.
-- ============================================================
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "profiles_select_all"
  on public.profiles for select
  to authenticated, anon
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
