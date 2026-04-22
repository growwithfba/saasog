-- Phase 2.3: AI-generated vetting summary.
--
-- Replaces the client-side template "Mad-Libs" verdict on the vetting
-- results page with a real Anthropic-generated summary grounded in the
-- vetting score and the 5 SSP categories.
--
-- Persisted per-submission so public share views get the cached summary
-- for free (no generation happens on unauth'd loads — see the roadmap in
-- memory file project_v9_roadmap.md).
--
-- Shape (see src/services/vettingSummary.ts for the authoritative type):
--   {
--     model, generatedAt, headline, narrative,
--     opportunityCategories: string[],
--     primaryRisks: string[],
--     usage?: { input_tokens, output_tokens, cache_read_input_tokens? }
--   }

alter table public.submissions
  add column if not exists ai_summary jsonb;

-- No backfill. Legacy rows stay null and the UI falls back to the
-- existing mad-libs string until the owner reloads the page, which
-- kicks off lazy generation.
