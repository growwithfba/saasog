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
export const CURVE_VERSION = 'v1.0.0-coarse-2026-05-04';
export const CURVE_CALIBRATED_AT = '2026-05-04';

/**
 * Anchor points for the curve. Each entry maps a BSR threshold to the
 * estimated daily-units sold AT that threshold. We linearly interpolate
 * between anchors in log-space (BSR is roughly log-distributed in sales
 * volume).
 *
 * Numbers are intentionally conservative on the low-BSR end — Helium 10
 * tends to over-estimate top-100 ASIN units, and post-launch calibration
 * will sharpen this. Better to underread bestsellers in V1 than to mark
 * a niche product as unrealistically hot.
 */
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [1, 5_000],
  [50, 2_000],
  [100, 1_200],
  [500, 600],
  [1_000, 320],
  [2_000, 160],
  [5_000, 70],
  [10_000, 32],
  [25_000, 13],
  [50_000, 6],
  [100_000, 2.5],
  [250_000, 0.8],
  [500_000, 0.3],
  [1_000_000, 0.1],
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
