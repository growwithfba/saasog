-- Phase 3.4b: per-user UI preferences (column picker selections, etc.).
--
-- Lives on profiles so it follows the user across devices. JSONB so
-- new keys can be added without further migrations.
--
-- Initial keys (set/read by the client):
--   vetting_columns  — Record<string, boolean> mirroring Dashboard.tsx
--                      column visibility state.
--   research_columns — same shape, mirroring Table.tsx state. Today
--                      that picker is local-state-only; persisting it
--                      via this column gives parity with the new
--                      vetting picker.
--
-- See src/app/api/profiles/preferences/route.ts for the read/write
-- shim. Existing rows get the empty object via DEFAULT, so legacy
-- profiles don't need a backfill.

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
