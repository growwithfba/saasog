// =============================================================================
// BSR → daily units curve (V1, coarse)
// =============================================================================
// Translates a sales rank into an estimated daily-units number. Used by
// /api/extension/enrich to derive monthlyUnits + monthlyRevenue from
// the multi-point-smoothed BSR.
//
// V1 uses a single all-categories curve derived from publicly-published
// Sellersprite/AMZScout-style approximation tables. This is intentionally
// coarse — the calibration harness (Phase 5.4-F V2) will tune per-category
// curves against H10 Xray CSVs already in Supabase.
//
// Curves are versioned, NOT constants. The exported `CURVE_VERSION` and
// `CURVE_CALIBRATED_AT` values get persisted alongside derived metrics so
// we can detect when a cached row was built against an old curve and
// invalidate selectively if we ship a new one.

/**
 * Curve identifier. Bump when the table below changes meaningfully.
 * Cached `keepa_lens_metrics.payload` rows include this in their payload
 * so we can selectively invalidate on a curve change.
 */
// 2026-05-13 sweep — bumped suffix to invalidate keepa_lens_metrics cache
// rows populated before `&rating=1&buybox=1` were added to the Keepa
// fetch URL. Those rows had reviews/rating null because Keepa returns
// -1 for cur[16]/cur[17] without rating=1; refetching gives real values.
export const CURVE_VERSION = 'v1.2.0-h10-corpus-recal-2026-05-04+h3-r7-cat-v6-band-aware+keepa-everywhere-2026-05-13+strip-quality-gates-2026-05-13+big-five-recal-2026-05-13+amazon-bucket-attribution-2026-05-14';
export const CURVE_CALIBRATED_AT = '2026-05-04';

/**
 * Anchor points for the curve. Each entry maps a BSR threshold to the
 * estimated daily-units sold AT that threshold. We linearly interpolate
 * between anchors in log-space (BSR is roughly log-distributed in sales
 * volume).
 *
 * v1.2.0 (2026-05-04) — refit against the merged H10 corpus
 * (~3,000 unique ASINs from CSV exports + single-variation submissions).
 * v1.1.0 was calibrated against just 48 popular ASINs (Test 6) which
 * left the broader BSR range mis-centered. The new anchors are bucket-
 * median monthly units (from Parent Level Sales) divided by 30, with
 * geometric-midpoint BSRs per bucket. Validated against Test 6
 * (per-parent 1.09x median, 100% in 0.5x-2x band) and a 15% held-out
 * subset of the merged corpus (median 0.80x with a long mid-BSR tail).
 *
 * Re-derived by `scripts/probes/recalibrate-base-curve.ts`. To refresh:
 * append more H10 CSVs via `scripts/probes/import-h10-csv.ts` then re-run
 * the recalibration script.
 */
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [7, 1_719],
  [100, 600],
  [316, 385],
  [866, 192],
  [2_739, 78],
  [8_660, 23],
  [27_386, 6],
  [86_603, 2],
  [273_861, 0.5],
  [1_000_000, 0.17],
] as const;

/**
 * Estimate daily units sold for a given (smoothed) BSR. Returns a float
 * that the caller should round / clamp before display. Returns null for
 * non-positive ranks (Keepa returns -1 when out-of-stock or unranked).
 *
 * Math:
 *   - Log-linear interpolation between adjacent anchors.
 *   - Clamps at the curve's endpoints rather than extrapolating wildly.
 *
 * Worked example: BSR 7,500 falls between (5,000 → 70) and (10,000 → 32).
 * Log-interpolated → ~46 units/day. × 30 → ~1,380 units/month.
 */
export function bsrToDailyUnits(bsr: number): number | null {
  if (!Number.isFinite(bsr) || bsr <= 0) return null;
  if (bsr <= ANCHORS[0][0]) return ANCHORS[0][1];
  const last = ANCHORS[ANCHORS.length - 1];
  if (bsr >= last[0]) return last[1];

  // Find the bracketing anchors.
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [r1, u1] = ANCHORS[i];
    const [r2, u2] = ANCHORS[i + 1];
    if (bsr >= r1 && bsr <= r2) {
      // Log-linear interpolation:
      //   t = (log bsr - log r1) / (log r2 - log r1)
      //   result = exp(log u1 + t * (log u2 - log u1))
      const logBsr = Math.log(bsr);
      const logR1 = Math.log(r1);
      const logR2 = Math.log(r2);
      const t = (logBsr - logR1) / (logR2 - logR1);
      const logU1 = Math.log(u1);
      const logU2 = Math.log(u2);
      return Math.exp(logU1 + t * (logU2 - logU1));
    }
  }
  return null;
}

/**
 * Convenience for the typical drawer flow: smoothed-BSR → monthly units.
 * Just `bsrToDailyUnits × 30`, but rounded and clamped to integer ≥ 0.
 */
export function bsrToMonthlyUnits(bsr: number): number | null {
  const daily = bsrToDailyUnits(bsr);
  if (daily === null) return null;
  return Math.max(0, Math.round(daily * 30));
}

/**
 * Category-aware variant. Applies a calibrated per-category multiplier
 * trained against the in-Supabase H10 corpus (Phase 5.4-H + 5.4-I).
 * Accepts either a single category name (legacy callers) or a full
 * Keepa category path (root → leaf) — when given a path, the deepest
 * calibrated entry wins (Phase 5.4-I leaf-first resolution).
 *
 * Pass `null` / `undefined` for category to opt out of the multiplier
 * (equivalent to calling `bsrToMonthlyUnits` directly).
 */
export function bsrToMonthlyUnitsByCategory(
  bsr: number,
  category: string | string[] | null | undefined,
): number | null {
  // Lazy import to keep the universal curve usable in places that don't
  // pull in the multipliers table (CSV import flows, in-app vetting math).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { categoryMultiplier } = require('./bsrCategoryMultipliers') as {
    categoryMultiplier: (c: string | string[] | null | undefined, bsr?: number | null) => number;
  };
  const base = bsrToMonthlyUnits(bsr);
  if (base === null) return null;
  // BSR is passed through so the multiplier lookup can pick the right
  // BSR-band override within the category (Phase 5.4-I band-aware).
  const m = categoryMultiplier(category, bsr);
  if (m === 1) return base;
  return Math.max(0, Math.round(base * m));
}
