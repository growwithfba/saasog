-- usage_events: single table that logs every external-service call
-- made by the app (Anthropic, OpenAI, Keepa, Stripe, Resend, etc.).
--
-- Purpose:
--   - visibility into API spend per user and per feature
--   - debugging (capture latency, errors, model used)
--   - foundation for per-tier usage caps in Phase 6 billing
--
-- Design:
--   - Inserts are performed server-side via service_role from a
--     TypeScript wrapper (src/utils/observability.ts), so there is
--     no client-facing INSERT policy.
--   - SELECT is owner-only so users can see their own usage dashboard
--     in a future phase. Admin reporting uses service_role.
--   - cost_usd is snapshotted at call time (pricing can drift; the
--     stored value is what we charged / what it cost us then).

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  model text,
  operation text not null,
  status text not null check (status in ('ok', 'error')),
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10, 6),
  latency_ms integer,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on column public.usage_events.provider is
  'External service identifier: anthropic | openai | keepa | stripe | resend | other';
comment on column public.usage_events.model is
  'Model or API variant, e.g. claude-sonnet-4-6, gpt-4-turbo, keepa-bulk-asin';
comment on column public.usage_events.operation is
  'Business-level operation name, e.g. review_insights | ssp_generate | keepa_enrichment';
comment on column public.usage_events.cost_usd is
  'Cost in USD snapshotted at call time. 6 decimal places to track sub-cent spend.';
comment on column public.usage_events.metadata is
  'Free-form context: submission_id, asins, retry_count, etc.';

create index usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

create index usage_events_provider_created_idx
  on public.usage_events (provider, created_at desc);

create index usage_events_operation_created_idx
  on public.usage_events (operation, created_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events_select_own"
  on public.usage_events for select
  to authenticated
  using (auth.uid() = user_id);
