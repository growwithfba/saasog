// Hand-edited 2026-05-08 (v7) — adds band-aware fits to the 12 categories
// that were single-multiplier in v6. Source: scripts/probes/calibrate-r8-
// bands-from-supabase.ts run against merged corpus (Supabase submissions
// + scripts/probes/data/h10-extra-corpus.jsonl, 2,506 deduped samples).
// Defaults landed within ±13% of v6 across all 11 categories, validating
// corpus stability. 10 of 11 picked up at least one fitted band (n>=30).
//
// v6 r7 entries (Beauty, Health & Household, Cell Phones, Automotive,
// Home & Kitchen, Musical Instruments) preserved as-is — those used
// fresh per-category H10 batches and shouldn't be regressed.
//
// Re-run the harness to regenerate proposed multipliers; manually re-
// edit this file (do not auto-overwrite) to keep the per-category
// notes that aren't reproducible from the data alone.
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

export const CATEGORY_CALIBRATION_VERSION = 'v7-2026-05-08-band-aware-r8';

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
  // Phase 5.4-N r8 (2026-05-08) — band-aware fits replacing v6's single-
  // multiplier "v3" block. Same merged corpus as v6 (Supabase + JSONL),
  // refit against the v1.2.0 base curve. Defaults within ±13% of v6.

  // Kitchen & Dining — n=480. All 5 bands fit. Top movers (1.14x) and
  // hunt-low (1.39x) higher than default; long tail (0.41x) much lower.
  // The single 0.853x default was splitting a 3.4x range across bands.
  "Kitchen & Dining": {
    default: 0.935,
    n: 480,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0,        bsrMax: 4_000,    mult: 1.141, n: 103 },
      { bsrMin: 4_000,    bsrMax: 15_000,   mult: 1.393, n: 63 },
      { bsrMin: 15_000,   bsrMax: 60_000,   mult: 0.836, n: 125 },
      { bsrMin: 60_000,   bsrMax: 200_000,  mult: 0.731, n: 129 },
      { bsrMin: 200_000,  bsrMax: Infinity, mult: 0.406, n: 60 },
    ],
  },

  // Sports & Outdoors — n=565. All 5 bands fit. Refit 2026-05-12 with the
  // 9-CSV May-11 batch (+233 S&O rows after dedupe). Pulled every band up
  // 13-66% vs the 5-08 fit, which lined up with Dave's "S&O reads low
  // vs Helium 10" feedback. Hunt-mid (15-60k) moves from 1.01x → 1.30x;
  // 4-15k from 0.71x → 1.18x. Long tail (200k+) holds near default.
  "Sports & Outdoors": {
    default: 1.015,
    n: 565,
    fitDate: "2026-05-12",
    bands: [
      { bsrMin: 0,        bsrMax: 4_000,    mult: 0.724, n: 83 },
      { bsrMin: 4_000,    bsrMax: 15_000,   mult: 1.182, n: 89 },
      { bsrMin: 15_000,   bsrMax: 60_000,   mult: 1.302, n: 181 },
      { bsrMin: 60_000,   bsrMax: 200_000,  mult: 0.976, n: 131 },
      { bsrMin: 200_000,  bsrMax: Infinity, mult: 0.810, n: 81 },
    ],
  },

  // Pet Supplies — n=231. 3 hunt-zone bands (4k-200k). Top + deep-tail
  // bands have <30 samples, fall back to default 0.59x.
  "Pet Supplies": {
    default: 0.592,
    n: 231,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 4_000,   bsrMax: 15_000,  mult: 0.743, n: 47 },
      { bsrMin: 15_000,  bsrMax: 60_000,  mult: 0.651, n: 104 },
      { bsrMin: 60_000,  bsrMax: 200_000, mult: 0.450, n: 62 },
    ],
  },

  // Toys & Games — n=363. Refit 2026-05-12 with the May-11 batch (+114
  // T&G rows after dedupe). 60k-200k tail band now has enough samples
  // (n=38) to fit; came in close to the hunt-mid bands. Default + 0-4k
  // hold near v8; 4-15k and 15-60k bump 11-15% upward.
  "Toys & Games": {
    default: 1.287,
    n: 363,
    fitDate: "2026-05-12",
    bands: [
      { bsrMin: 0,       bsrMax: 4_000,    mult: 1.087, n: 143 },
      { bsrMin: 4_000,   bsrMax: 15_000,   mult: 1.523, n: 85 },
      { bsrMin: 15_000,  bsrMax: 60_000,   mult: 1.694, n: 86 },
      { bsrMin: 60_000,  bsrMax: 200_000,  mult: 1.601, n: 38 },
    ],
  },

  // Office Products — n=198. Top 3 bands fit. Higher-than-1.0x in the
  // hunt zone (1.16x → 1.57x → 1.63x), undercutting the 1.29x v6 default
  // for top movers and overshooting it for hunt-mid.
  "Office Products": {
    default: 1.262,
    n: 198,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0,       bsrMax: 4_000,   mult: 1.161, n: 86 },
      { bsrMin: 4_000,   bsrMax: 15_000,  mult: 1.567, n: 34 },
      { bsrMin: 15_000,  bsrMax: 60_000,  mult: 1.633, n: 52 },
    ],
  },

  // Patio, Lawn & Garden — n=208. 3 bands fit (4k-200k). Hunt-low band
  // (4k-15k) is dramatically lower than mid (0.32x vs 0.74x) — likely
  // seasonal/niche-product noise. IQR for that band is wide.
  "Patio, Lawn & Garden": {
    default: 0.676,
    n: 208,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 4_000,   bsrMax: 15_000,  mult: 0.317, n: 30 },
      { bsrMin: 15_000,  bsrMax: 60_000,  mult: 0.738, n: 93 },
      { bsrMin: 60_000,  bsrMax: 200_000, mult: 0.683, n: 48 },
    ],
  },

  // Tools & Home Improvement — n=339. 4 bands fit. Strong band structure:
  // top movers undershoot (1.24x), hunt-mid spikes (2.41x), tail back to
  // default. Doubles the v6 sample count thanks to the merged corpus.
  "Tools & Home Improvement": {
    default: 1.626,
    n: 339,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0,       bsrMax: 4_000,   mult: 1.243, n: 90 },
      { bsrMin: 4_000,   bsrMax: 15_000,  mult: 1.857, n: 66 },
      { bsrMin: 15_000,  bsrMax: 60_000,  mult: 2.407, n: 81 },
      { bsrMin: 60_000,  bsrMax: 200_000, mult: 1.757, n: 73 },
    ],
  },

  // Baby — n=145. Only 1 band qualifies (0-4k); higher BSRs sparse.
  // Baby Products is an alias — Keepa returns it for the same Amazon
  // root. Both entries kept identical so leaf-first lookup hits either.
  "Baby": {
    default: 0.926,
    n: 145,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0, bsrMax: 4_000, mult: 1.175, n: 88 },
    ],
  },
  "Baby Products": {
    default: 0.926,
    n: 145,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0, bsrMax: 4_000, mult: 1.175, n: 88 },
    ],
  },

  // Arts, Crafts & Sewing — n=126. 2 bands fit (15k-200k). Hunt-mid at
  // 0.74x, long-tail collapses to 0.35x — typical pattern for craft
  // products where deep-tail BSRs have very low velocity.
  "Arts, Crafts & Sewing": {
    default: 0.582,
    n: 126,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 15_000,  bsrMax: 60_000,  mult: 0.742, n: 56 },
      { bsrMin: 60_000,  bsrMax: 200_000, mult: 0.345, n: 30 },
    ],
  },

  // Electronics — n=116. Only 1 band qualifies (0-4k). The corpus is
  // weighted toward popular electronics; hunt zones thin out fast.
  "Electronics": {
    default: 0.665,
    n: 116,
    fitDate: "2026-05-08",
    bands: [
      { bsrMin: 0, bsrMax: 4_000, mult: 0.705, n: 78 },
    ],
  },

  // Industrial & Scientific — n=85. No bands meet the n>=30 threshold;
  // default-only fit. Niche category — would need fresh per-category
  // batches to band-fit cleanly.
  "Industrial & Scientific": {
    default: 0.590,
    n: 85,
    fitDate: "2026-05-08",
  },

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
