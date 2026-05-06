// Hand-edited 2026-05-06 (v5) on top of recalibrate-base-curve.ts output.
// Re-run the harness to regenerate the v3 multipliers; manually re-add
// the v5 entries below if it overwrites this file.
//
// Per-Amazon-root-category multipliers applied on top of the v1.2.0
// base BSR curve. Trained against ~3,000 unique ASINs from the merged
// corpus (H10 Xray CSV exports + single-variation submissions).
//
// Each multiplier represents median(observedH10ParentSales / v12CurveOutput)
// for that category — a value < 1.0 means the universal curve
// overestimates units in this category; > 1.0 means it underestimates.
//
// v3 (2026-05-04) shipped 12 high-confidence categories where the median
// ratio fell inside the 0.5x-2.0x band. v4 (2026-05-05) added 3 lower-
// confidence rough fits for Home & Kitchen, Health & Household, and
// Clothing/Shoes/Jewelry — but the H&K 3.28x overshot Kitchen-subcategory
// products by ~3x (Keepa reports "Home & Kitchen" as categoryTree[0] for
// products H10 classifies as "Kitchen & Dining" — same overshoot risk
// applies to Health & Household and Clothing). v5 (2026-05-06) drops all
// three back to 1.0x (no-op): undershoot for true H&K/H&H/Clothing rows
// is a smaller error than overshooting Kitchen-subcategory rows by 3x.
// Phase 5.4-I (sub-category granularity via categoryTree[1]) is the
// proper fix and is queued for Sprint A.
//
// Health & Personal Care, Cell Phones & Accessories: no calibration data
// in the H10 corpus. Fall back to base curve (1.0x).
//
// Calibration date: 2026-05-06 (v5)

export const CATEGORY_CALIBRATION_VERSION = 'v5-2026-05-06';

export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  // v3 — high-confidence (median in 0.5x-2.0x band against H10 corpus)
  "Kitchen & Dining": 0.853,            // n=488
  "Sports & Outdoors": 0.758,           // n=280
  "Pet Supplies": 0.611,                // n=217
  "Toys & Games": 1.199,                // n=202
  "Office Products": 1.288,             // n=172
  "Patio, Lawn & Garden": 0.635,        // n=166
  "Tools & Home Improvement": 1.614,    // n=164
  "Baby": 0.925,                        // n=115
  "Baby Products": 0.925,               // alias — Keepa returns "Baby Products" for the same root
  "Arts, Crafts & Sewing": 0.579,       // n=104
  "Electronics": 0.624,                 // n=92
  "Industrial & Scientific": 0.523,     // n=70
  // v5 — H&K/H&H/Clothing dropped to 1.0x; sub-category mix overshoots
  // Kitchen-subcategory rows (and likely H&H/Clothing equivalents) by 3x.
  // Phase 5.4-I will index by categoryTree[1].name.
};

/**
 * Look up a category multiplier. Returns 1.0 (no-op) for categories
 * we haven't calibrated — keeps the base curve as the safe fallback
 * rather than guessing.
 */
export function categoryMultiplier(category: string | null | undefined): number {
  if (!category) return 1;
  return CATEGORY_MULTIPLIERS[category] ?? 1;
}
