-- keepa_lens_metrics is shared between Bloom Lens (/api/extension/enrich) and
-- Discovery (/api/discovery/hydrate). They fetch at different depths:
--   full = stats+history+rating+buybox+offers (6 tokens/ASIN) -- Bloom Lens
--   lean = stats+history+aplus                (1 token/ASIN)  -- Discovery
--
-- A lean row is missing Buy Box price and offer data, so buildEnrichedRow falls
-- back to the New price. That is fine for a Discovery results grid but would be
-- a silent quality regression in the Lens drawer. This column lets each consumer
-- require the depth it needs while still sharing every row it can use.
--
-- Default 'full': every row that exists today was written by Bloom Lens.
ALTER TABLE public.keepa_lens_metrics
  ADD COLUMN IF NOT EXISTS fetch_depth TEXT NOT NULL DEFAULT 'full'
  CHECK (fetch_depth IN ('lean', 'full'));

COMMENT ON COLUMN public.keepa_lens_metrics.fetch_depth IS
  'How deeply this row was fetched. lean = Discovery (1 token, no buybox/offers); full = Bloom Lens (6 tokens). Consumers requiring buybox data must filter to full.';
