-- =====================================================
-- KEEPA LENS METRICS
-- =====================================================
-- Per-ASIN cache of multi-point-smoothed Keepa-derived metrics that
-- back the Bloom Lens drawer's "heavy" columns (BSR median, monthly
-- units, monthly revenue, volatility, dimensions, etc.).
--
-- Why a separate table from keepa_listing_images:
--   - Different TTL profile. keepa_listing_images caches images + brand
--     for 30 days (those rarely change); this table holds dynamic
--     metrics that need a 24h TTL on the moving fields.
--   - Different shape. listing-images stores 2-3 columns per row; this
--     table needs a JSONB blob of derived stats.
--   - Different access pattern. Read-heavy from /api/extension/enrich
--     on every Bloom Lens drawer-open; image cache hits the dashboard
--     and vetting flows.
--
-- Caching strategy:
--   - cache_until is computed at write time. The route checks
--     `cache_until > now()` before deciding whether to call Keepa.
--   - On a write, the route computes a single cache_until = now + 24h
--     for the moving metrics. Static fields (dims, weight, listing
--     date) are stored in the same payload but persist across many
--     rebuilds because the values don't change.
--   - When an ASIN's csv[3] is empty (deactivated listings, ~6/10 in
--     the stale-fixture sample), data_quality is set to 'limited' and
--     the route falls back to whatever Keepa still surfaces. We still
--     cache 'limited' rows with the same TTL so we don't re-pay tokens
--     for guaranteed-empty fetches.

CREATE TABLE IF NOT EXISTS public.keepa_lens_metrics (
  asin TEXT PRIMARY KEY,

  -- Derived metrics blob. See bloom-lens-extension/research/phase-5.4-F-keepa-probe.md
  -- for the full field map. Storing JSONB (not a wide column list) so
  -- additions don't require migrations.
  payload JSONB NOT NULL,

  -- Was this row built from a full csv[3] history, or from a fallback
  -- snapshot because Keepa returned no history? Drives the
  -- "limited data" badge in the drawer UI.
  data_quality TEXT NOT NULL DEFAULT 'full'
    CHECK (data_quality IN ('full', 'limited')),

  -- When the metrics were derived. Mostly diagnostic — the freshness
  -- check uses cache_until.
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Hard cutoff for cache validity. Route refetches when now() > this.
  cache_until TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Composite index for the hot read path: "given a list of ASINs, which
-- have fresh cached metrics?". Postgres can use this for the IN-list +
-- cache_until filter together.
CREATE INDEX IF NOT EXISTS idx_keepa_lens_metrics_cache_until
  ON public.keepa_lens_metrics (cache_until DESC);

COMMENT ON TABLE public.keepa_lens_metrics IS
  'Per-ASIN cache of multi-point-smoothed Keepa metrics for Bloom Lens. 24h TTL on moving fields. Service-role writes only.';
COMMENT ON COLUMN public.keepa_lens_metrics.payload IS
  'JSONB blob of derived metrics: bsr, bsr30dMedian, bsrVolatility, monthlyUnits, monthlyRevenue, bsrTrendPct, listingCreatedAt, weightLb, dimensions, variationCount, etc.';
COMMENT ON COLUMN public.keepa_lens_metrics.data_quality IS
  'full = derived from a populated csv[3] history; limited = csv[3] was empty, payload is from snapshot fields only.';
COMMENT ON COLUMN public.keepa_lens_metrics.cache_until IS
  'Hard freshness cutoff. Route refetches when now() > cache_until.';

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
-- This is a system cache, not user data. All reads + writes flow
-- through the service-role API route (/api/extension/enrich), which
-- bypasses RLS by default. RLS is still enabled as a belt-and-braces
-- measure: any future direct client access is denied by lack of
-- policies.

ALTER TABLE public.keepa_lens_metrics ENABLE ROW LEVEL SECURITY;
