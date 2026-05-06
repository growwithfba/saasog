// Hand-edited 2026-05-06 (v6) on top of recalibrate-base-curve.ts output.
// Re-run the harness to regenerate the v3 multipliers; manually re-add
// the v6 entries below if it overwrites this file.
//
// Per-Amazon-root-category multipliers applied on top of the v1.2.0 base
// BSR curve. Trained against H10 Xray CSV exports stored either in the
// in-Supabase corpus (~3,000 ASINs from prior submissions) or fresh
// per-category batches saved alongside the calibration scripts.
//
// v6 (2026-05-06, Phase 5.4-I) introduces band-aware multipliers. Each
// entry stores a `default` (full-range median for the category) plus
// optional `bands` — per-BSR-range multipliers that override `default`
// for products whose BSR falls in a band where we have enough samples
// (n >= 30) to fit a stable median.
//
// Why bands: a single multiplier compresses real signal. For high-
// velocity categories (Beauty & Personal Care, Health & Household) the
// curve under-predicts at hunt-zone BSR (4k-15k) by ~7x while over-
// predicting at long-tail BSR (60k+) by ~2x. A single-mult fit splits
// the difference and gets BOTH bands wrong. Bands fix this without
// sacrificing accuracy at any one BSR range.
//
// Lookup contract (categoryMultiplier / resolveCategoryMultiplier):
//   1. Walk Keepa categoryTree leaf -> root, take the deepest calibrated
//      entry (Phase 5.4-I leaf-first resolution).
//   2. Within that entry, find the band whose [bsrMin, bsrMax) contains
//      the product's BSR. Return its mult.
//   3. If no band matches (or no BSR provided), return `default`.
//
// Categories not in this table fall back to 1.0x (the universal curve).
// That's safer than guessing.

export const CATEGORY_CALIBRATION_VERSION = 'v6-2026-05-06-band-aware-r7';

export type CategoryBand = {
  /** Inclusive lower bound. */
  bsrMin: number;
  /** Exclusive upper bound. Use Infinity for the open-ended top band. */
  bsrMax: number;
  mult: number;
  /** Sample count from the calibration corpus that fitted this band. */
  n?: number;
};

export type CategoryCalibration = {
  /** Full-range median; the safe fallback when no band matches. */
  default: number;
  /** Sample count behind `default`. */
  n?: number;
  /** ISO date the fit was generated. */
  fitDate?: string;
  /** Free-form provenance / notes. */
  notes?: string;
  /** Per-BSR-band overrides. Bands are checked in order; first match wins. */
  bands?: CategoryBand[];
};

export const CATEGORY_MULTIPLIERS: Record<string, CategoryCalibration> = {
  // v3 — high-confidence (median in 0.5x-2.0x band against in-Supabase
  // H10 corpus). No band breakdown yet — Phase 5.4-I roadmap calls for
  // re-running the calibration harness against the existing corpus to
  // emit per-band multipliers for these categories.
  "Kitchen & Dining":         { default: 0.853, n: 488, fitDate: "2026-05-04" },
  "Sports & Outdoors":        { default: 0.758, n: 280, fitDate: "2026-05-04" },
  "Pet Supplies":             { default: 0.611, n: 217, fitDate: "2026-05-04" },
  "Toys & Games":             { default: 1.199, n: 202, fitDate: "2026-05-04" },
  "Office Products":          { default: 1.288, n: 172, fitDate: "2026-05-04" },
  "Patio, Lawn & Garden":     { default: 0.635, n: 166, fitDate: "2026-05-04" },
  "Tools & Home Improvement": { default: 1.614, n: 164, fitDate: "2026-05-04" },
  "Baby":                     { default: 0.925, n: 115, fitDate: "2026-05-04" },
  // alias — Keepa returns "Baby Products" for the same root
  "Baby Products":            { default: 0.925, n: 115, fitDate: "2026-05-04" },
  "Arts, Crafts & Sewing":    { default: 0.579, n: 104, fitDate: "2026-05-04" },
  "Electronics":              { default: 0.624, n: 92,  fitDate: "2026-05-04" },
  "Industrial & Scientific":  { default: 0.523, n: 70,  fitDate: "2026-05-04" },

  // Phase 5.4-I r7 (2026-05-06) — band-aware fits from fresh per-category
  // H10 batches. Total new samples: 2,304 ASINs across 6 categories.
  // Two of these (Automotive, Musical Instruments) were previously
  // uncalibrated and defaulted to 1.0x. Three (H&K root, H&H, Cell Phones)
  // replace post-r5 1.0x fallbacks with proper data.

  // Beauty & Personal Care — n=232. High-velocity category; curve under-
  // predicts ~4.4x at full range, with hunt-low (4k-15k) wanting 6x.
  "Beauty & Personal Care": {
    default: 4.421,
    n: 232,
    fitDate: "2026-05-06",
    bands: [
      { bsrMin: 0,     bsrMax: 4_000,  mult: 4.290, n: 152 },
      { bsrMin: 4_000, bsrMax: 15_000, mult: 5.951, n: 44 },
    ],
  },

  // Health & Household — n=204. Highest-velocity calibrated category;
  // hunt-low wants 7.4x. Replaces the post-r5 1.0x fallback that was
  // undershooting H10 by ~6x for fast-moving H&H products.
  "Health & Household": {
    default: 6.468,
    n: 204,
    fitDate: "2026-05-06",
    bands: [
      { bsrMin: 0,      bsrMax: 4_000,  mult: 6.139, n: 95 },
      { bsrMin: 4_000,  bsrMax: 15_000, mult: 7.396, n: 60 },
      { bsrMin: 15_000, bsrMax: 60_000, mult: 6.503, n: 37 },
    ],
  },

  // Cell Phones & Accessories — n=263. Curve overshoots slightly. Most
  // samples concentrated in 0-4k BSR (popular accessory queries). Hunt-mid
  // (15k-60k) only n=13 in this batch — falls back to default; could be
  // refined later with niche-product searches.
  "Cell Phones & Accessories": {
    default: 0.875,
    n: 263,
    fitDate: "2026-05-06",
    bands: [
      { bsrMin: 0,     bsrMax: 4_000,  mult: 0.893, n: 203 },
      { bsrMin: 4_000, bsrMax: 15_000, mult: 0.797, n: 43 },
    ],
  },

  // Automotive — n=379. PRIORITY private-label category — was previously
  // uncalibrated (1.0x). All 5 BSR bands fit cleanly (n>=30). Strong band
  // structure: curve overshoots top movers (0.80x) but undershoots
  // hunt-mid (2.04x) and long tail (2.20x) by ~2x. A single multiplier
  // would have been wildly wrong at both ends — this is the strongest
  // case yet for band-aware multipliers.
  "Automotive": {
    default: 1.058,
    n: 379,
    fitDate: "2026-05-06",
    bands: [
      { bsrMin: 0,        bsrMax: 4_000,    mult: 0.796, n: 176 },
      { bsrMin: 4_000,    bsrMax: 15_000,   mult: 1.032, n: 61 },
      { bsrMin: 15_000,   bsrMax: 60_000,   mult: 2.043, n: 70 },
      { bsrMin: 60_000,   bsrMax: 200_000,  mult: 2.200, n: 40 },
      { bsrMin: 200_000,  bsrMax: Infinity, mult: 1.717, n: 32 },
    ],
  },

  // Home & Kitchen (root, non-Kitchen-&-Dining) — n=623. PRIORITY private-
  // label category — was 1.0x post-r5. All 5 bands fit. Spans 2.8x at top
  // movers to 10.4x at long tail (60k-200k) — a 4x range within one
  // category, reflecting the breadth of H&K (Bath/Bedding/Furniture/
  // Décor/Vacuums/Storage have very different velocity curves).
  // IMPORTANT: Brewing/cookware products with categoryTree
  // ["Home & Kitchen", "Kitchen & Dining", ...] still resolve to K&D
  // 0.853x via Phase 5.4-I leaf-first lookup — they don't accidentally
  // pick up these H&K root multipliers.
  "Home & Kitchen": {
    default: 5.310,
    n: 623,
    fitDate: "2026-05-06",
    notes: "leaf-first lookup ensures K&D-subcategory products miss this and get K&D 0.853x",
    bands: [
      { bsrMin: 0,        bsrMax: 4_000,    mult: 2.798, n: 164 },
      { bsrMin: 4_000,    bsrMax: 15_000,   mult: 4.810, n: 129 },
      { bsrMin: 15_000,   bsrMax: 60_000,   mult: 8.299, n: 140 },
      { bsrMin: 60_000,   bsrMax: 200_000,  mult: 10.404, n: 102 },
      { bsrMin: 200_000,  bsrMax: Infinity, mult: 5.175, n: 88 },
    ],
  },

  // Musical Instruments — n=603. PRIORITY private-label category — was
  // previously uncalibrated (1.0x). Small category: curve massively
  // OVERSHOOTS — true sales are ~0.12x of universal curve at every BSR
  // band. Bands are uniform (0.109-0.124) so the default is also a safe
  // fallback for any out-of-band BSR.
  "Musical Instruments": {
    default: 0.116,
    n: 603,
    fitDate: "2026-05-06",
    notes: "small category — universal curve overshoots dramatically",
    bands: [
      { bsrMin: 0,      bsrMax: 4_000,  mult: 0.123, n: 251 },
      { bsrMin: 4_000,  bsrMax: 15_000, mult: 0.109, n: 206 },
      { bsrMin: 15_000, bsrMax: 60_000, mult: 0.124, n: 132 },
    ],
  },
};

/**
 * Look up a category multiplier. Walks Keepa's category path leaf -> root
 * (Phase 5.4-I), then within the matched category looks up the BSR band
 * that contains the product's BSR (Phase 5.4-I band-aware). Falls back to
 * the category's `default` when no band matches and 1.0 when no category
 * in the path is calibrated.
 *
 * @param category Single name or full path (root -> leaf).
 * @param bsr      Product BSR. Used for band lookup only; pass null/0 to
 *                 force the `default` fit.
 */
export function categoryMultiplier(
  category: string | string[] | null | undefined,
  bsr?: number | null,
): number {
  if (!category) return 1;
  const path = Array.isArray(category) ? category : [category];
  for (let i = path.length - 1; i >= 0; i--) {
    const name = path[i];
    if (typeof name === 'string' && name in CATEGORY_MULTIPLIERS) {
      return resolveBand(CATEGORY_MULTIPLIERS[name], bsr);
    }
  }
  return 1;
}

/**
 * Like `categoryMultiplier` but also returns which category-name and
 * which BSR band matched. Used for telemetry — drawer can show the user
 * "this number was fit on Kitchen & Dining (BSR 4k-15k, n=50)".
 */
export function resolveCategoryMultiplier(
  category: string | string[] | null | undefined,
  bsr?: number | null,
): { multiplier: number; matched: string | null; band: string | null } {
  if (!category) return { multiplier: 1, matched: null, band: null };
  const path = Array.isArray(category) ? category : [category];
  for (let i = path.length - 1; i >= 0; i--) {
    const name = path[i];
    if (typeof name === 'string' && name in CATEGORY_MULTIPLIERS) {
      const cal = CATEGORY_MULTIPLIERS[name];
      const band = pickBand(cal, bsr);
      if (band) {
        return {
          multiplier: band.mult,
          matched: name,
          band: bandLabel(band),
        };
      }
      return { multiplier: cal.default, matched: name, band: 'default' };
    }
  }
  return { multiplier: 1, matched: null, band: null };
}

function resolveBand(cal: CategoryCalibration, bsr: number | null | undefined): number {
  const band = pickBand(cal, bsr);
  return band ? band.mult : cal.default;
}

function pickBand(cal: CategoryCalibration, bsr: number | null | undefined): CategoryBand | null {
  if (!cal.bands || typeof bsr !== 'number' || bsr <= 0) return null;
  for (const b of cal.bands) {
    if (bsr >= b.bsrMin && bsr < b.bsrMax) return b;
  }
  return null;
}

function bandLabel(b: CategoryBand): string {
  const hi = b.bsrMax === Infinity ? '+' : `-${b.bsrMax}`;
  return `${b.bsrMin}${hi}`;
}
