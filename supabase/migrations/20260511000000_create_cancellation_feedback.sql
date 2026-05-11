-- =====================================================
-- CANCELLATION FEEDBACK
-- =====================================================
-- Captures the "why" and "what would have kept you" answers from the
-- Sprint E manage-subscription cancellation funnel.
--
-- Why a dedicated table (not a JSONB column on profiles):
--   - Multiple cancellations per user over time (they may resubscribe
--     and cancel again).
--   - Needs to be queryable by reason / by save-offer-shown for churn
--     analysis later.
--   - Decoupled from auth.users so analytics survive a user-account
--     deletion (set null on delete).
-- =====================================================

create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tier text not null,
  billing_interval text,
  reason text not null,
  free_text text,
  attempted_save_offer text,
  accepted_save_offer boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_cancellation_feedback_created_at
  on public.cancellation_feedback (created_at desc);
create index if not exists idx_cancellation_feedback_reason
  on public.cancellation_feedback (reason);
create index if not exists idx_cancellation_feedback_user
  on public.cancellation_feedback (user_id);

alter table public.cancellation_feedback enable row level security;

-- Service-role only: the /api/stripe/cancel endpoint writes via the
-- service-role client. Users have no direct read/write — admins query
-- via Supabase studio or the service key.
create policy "cancellation_feedback: service-role only"
  on public.cancellation_feedback
  for all
  using (false)
  with check (false);
