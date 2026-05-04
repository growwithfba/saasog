// =============================================================================
// Per-Amazon-root-category multipliers on the v1.1.0 base BSR curve.
// =============================================================================
// AUTO-GENERATED placeholder. The harness at
// `scripts/probes/calibrate-category-multipliers.ts` regenerates this file
// with median(observedH10Units / v11CurveUnits) per category, computed
// against ~2,800 paired samples in the in-Supabase H10 corpus.
//
// While the multipliers map is empty, every category falls back to 1.0
// (no-op) — so this file is safe to ship before the harness has been
// run, and the V1.1 single-curve calibration applies uniformly.
//
// Run the harness:
//   npx tsx scripts/probes/calibrate-category-multipliers.ts
//
// See `bloom-lens-extension/research/phase-5.4-H-category-calibration.md`
// for the full design.

export const CATEGORY_CALIBRATION_VERSION = 'v0-stub-2026-05-04';

/**
 * Median (observed-H10-units / v11-curve-units) ratio per Amazon root
 * category, trained on the H10 corpus in `submissions.submission_data
 * .productData.competitors`. A multiplier < 1.0 means the universal v1.1
 * curve overshoots units in that category (slow seller); > 1.0 means
 * undershoots (fast seller).
 */
export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  // Empty until the harness runs. Every category falls back to 1.0 below.
};

/**
 * Look up a category multiplier. Returns 1.0 for categories we haven't
 * calibrated — keeps the v1.1.0 curve as the safe fallback rather than
 * guessing.
 */
export function categoryMultiplier(category: string | null | undefined): number {
  if (!category) return 1;
  return CATEGORY_MULTIPLIERS[category] ?? 1;
}
