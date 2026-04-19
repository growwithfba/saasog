-- Tags feature for research/vetting funnel.
--
-- - tags: user-scoped free-form labels (e.g. "frozen meat slicer").
-- - product_tags: join table tying a tag to a research_products row.
--
-- Both tables are owner-only via RLS. user_id is denormalized onto
-- product_tags so every policy check is a single column compare —
-- no join into tags or research_products just to authorize a row.
--
-- Uniqueness is enforced on (user_id, lower(name)) so "Outdoor" and
-- "outdoor" don't create duplicates for the same user.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_user_name_lower_idx
  on public.tags (user_id, lower(name));

create index tags_user_idx
  on public.tags (user_id, created_at desc);

alter table public.tags enable row level security;

create policy "tags_select_own"
  on public.tags for select
  to authenticated
  using (auth.uid() = user_id);

create policy "tags_insert_own"
  on public.tags for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "tags_update_own"
  on public.tags for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tags_delete_own"
  on public.tags for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================

create table public.product_tags (
  research_product_id uuid not null references public.research_products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (research_product_id, tag_id)
);

create index product_tags_user_idx
  on public.product_tags (user_id);

create index product_tags_product_idx
  on public.product_tags (research_product_id);

create index product_tags_tag_idx
  on public.product_tags (tag_id);

alter table public.product_tags enable row level security;

create policy "product_tags_select_own"
  on public.product_tags for select
  to authenticated
  using (auth.uid() = user_id);

create policy "product_tags_insert_own"
  on public.product_tags for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "product_tags_delete_own"
  on public.product_tags for delete
  to authenticated
  using (auth.uid() = user_id);
