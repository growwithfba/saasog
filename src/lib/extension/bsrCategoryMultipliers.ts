// Hand-edited 2026-05-05 (v4) on top of recalibrate-base-curve.ts output.
// Re-run the harness to regenerate the v3 multipliers; manually re-add
// the v4 entries below if it overwrites this file.
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
// ratio fell inside the 0.5x-2.0x band. v4 (2026-05-05) adds 3 lower-
// confidence rough multipliers for the categories that had been omitted
// — Home & Kitchen, Health & Household, Clothing/Shoes/Jewelry. Their
// raw medians were 3.28x, 3.02x, 4.84x respectively (sub-category mix
// likely amplifies these); shipping rough single-multiplier fits per
// Dave 2026-05-05 ("just do the calibration as best you can and then
// ship it" — these aren't private-label focus categories so absolute
// accuracy is low priority). Clothing capped at 3.0 to limit overshoot.
//
// Health & Personal Care, Cell Phones & Accessories: no calibration data
// in the H10 corpus. Fall back to base curve (1.0x).
//
// Calibration date: 2026-05-05 (v4)

export const CATEGORY_CALIBRATION_VERSION = 'v4-2026-05-05';

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
  // v4 — low-confidence rough fits (sub-category mix unaddressed)
  "Home & Kitchen": 3.28,                       // n=231, raw median 3.28x
  "Health & Household": 3.02,                   // n=95,  raw median 3.02x
  "Clothing, Shoes & Jewelry": 3.0,             // n=195, raw median 4.84x (capped)
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
