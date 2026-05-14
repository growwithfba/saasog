/**
 * Shared Keepa product → EnrichedRow logic.
 *
 * Extracted from /api/extension/enrich/route.ts so both the drawer
 * (read-path) and the new hydrateCompetitor module (write-paths) can
 * share the SAME math: BSR curve, parent attribution, variation cap,
 * 30d-avg revenue, etc.
 *
 * Keepa-everywhere sweep — 2026-05-13. Math identical to prior enrich
 * behavior; only changes vs. prior enrich are:
 *   1. Added cur[18] BUY_BOX_SHIPPING as preferred price source.
 *   2. The Keepa fetch URL gains &rating=1&buybox=1&aplus=1 — the
 *      first two unlock reviews/rating/buybox-price; aplus is for
 *      the separate LQS calculator (listingQualityScore.ts).
 */

import {
  bsrToMonthlyUnitsByCategory,
  CURVE_VERSION,
} from '@/lib/extension/bsrSalesCurve';
import { resolveCategoryMultiplier } from '@/lib/extension/bsrCategoryMultipliers';

// Keepa "minutes" since 2011-01-01.
export const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
export const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

// Keepa CSV index constants for the stats.current[] array.
export const KEEPA_CSV = {
  AMAZON_PRICE: 0,
  NEW_PRICE: 1,
  BSR: 3,
  RATING: 16,
  REVIEW_COUNT: 17,
  BUY_BOX_SHIPPING: 18,
} as const;

/** Query params for the canonical Keepa /product fetch. Use everywhere. */
export const KEEPA_FETCH_PARAMS = 'stats=180&history=1&rating=1&buybox=1&offers=20&aplus=1';

export type EnrichedRow = {
  rootCategory: string | null;
  matchedCategory: string | null;
  matchedBand: string | null;
  bsr: number | null;
  bsr30dMedian: number | null;
  bsrVolatility: number | null;
  bsrTrendPct: number | null;
  monthlyUnits: number | null;
  monthlyRevenue: number | null;
  parentMonthlyUnits: number | null;
  parentMonthlyRevenue: number | null;
  unitsSource: 'amazon-bucket' | 'bsr-curve' | 'bucket-fallback' | null;
  /** price is in cents. */
  price: number | null;
  weightLb: number | null;
  dimensions: { l: number; w: number; h: number } | null;
  listingCreatedAt: string | null;
  variationCount: number | null;
  rating: number | null;
  reviews: number | null;
  imageUrl: string | null;
  brand: string | null;
  dataQuality: 'full' | 'limited';
  curveVersion: string;
};

export function buildEmptyEnrichedRow(): EnrichedRow {
  return {
    rootCategory: null,
    matchedCategory: null,
    matchedBand: null,
    bsr: null,
    bsr30dMedian: null,
    bsrVolatility: null,
    bsrTrendPct: null,
    monthlyUnits: null,
    monthlyRevenue: null,
    parentMonthlyUnits: null,
    parentMonthlyRevenue: null,
    unitsSource: null,
    price: null,
    weightLb: null,
    dimensions: null,
    listingCreatedAt: null,
    variationCount: null,
    rating: null,
    reviews: null,
    imageUrl: null,
    brand: null,
    dataQuality: 'limited',
    curveVersion: CURVE_VERSION,
  };
}

/**
 * Build the enriched row for one Keepa product. Pure function over the
 * product blob — call site is responsible for fetching from Keepa.
 *
 * Source of child-level monthly units is Amazon's "X+ bought in past month"
 * badge (delivered via Keepa's monthlySold field), translated to bucket
 * midpoint. Falls back to BSR-curve / variation-cap split when the badge
 * is absent (low-volume or new listings). Parent-level units always use
 * the BSR-curve × category multiplier.
 *
 * Price preference order: cur[18] BUY_BOX_SHIPPING → cur[0] AMAZON →
 * cur[1] NEW. Buy box is the price the customer actually pays so it's
 * the most relevant for revenue calculation.
 *
 * `opts.bsrCategoryPath` — when the BSR-tracked category differs from
 * categoryTree[0] (resolved upstream via Keepa /category), pass the
 * resolved root → leaf path here. Drives `rootCategory`, category-curve
 * lookup, and band-aware multiplier resolution so multi-category products
 * (e.g. Health & Household listing with BSR tracked in Automotive) use
 * the correct multiplier instead of categoryTree[0].
 */
export function buildEnrichedRow(
  product: any,
  opts: { bsrCategoryPath?: string[] | null } = {},
): EnrichedRow {
  const cur: number[] = product.stats?.current ?? [];
  const currentBsr = posOrNull(cur[KEEPA_CSV.BSR]);
  // Price: prefer Buy Box (idx 18), then Amazon (0), then New (1).
  const currentPriceCents =
    posOrNull(cur[KEEPA_CSV.BUY_BOX_SHIPPING]) ??
    posOrNull(cur[KEEPA_CSV.AMAZON_PRICE]) ??
    posOrNull(cur[KEEPA_CSV.NEW_PRICE]);
  const reviews = nonNegOrNull(cur[KEEPA_CSV.REVIEW_COUNT]);
  const ratingTenths = posOrNull(cur[KEEPA_CSV.RATING]);

  // BSR history (csv[3]) — alternating [keepaMinute, rank, ...]. -1 sentinel
  // means out-of-stock or no rank; skip those points.
  const csv3: number[] = Array.isArray(product.csv?.[KEEPA_CSV.BSR]) ? product.csv[KEEPA_CSV.BSR] : [];
  const points: Array<{ ts: number; rank: number }> = [];
  for (let i = 0; i + 1 < csv3.length; i += 2) {
    const km = csv3[i];
    const rank = csv3[i + 1];
    if (typeof km !== 'number' || typeof rank !== 'number' || rank <= 0) continue;
    points.push({ ts: km2ms(km), rank });
  }

  const cutoff30 = Date.now() - 30 * 86_400_000;
  const points30 = points.filter((p) => p.ts >= cutoff30);

  // Median-of-daily-medians smoothing.
  let bsr30dMedian: number | null = null;
  let bsrVolatility: number | null = null;
  let bsrTrendPct: number | null = null;

  if (points30.length >= 5) {
    const byDay = new Map<string, number[]>();
    for (const pt of points30) {
      const day = new Date(pt.ts).toISOString().slice(0, 10);
      const arr = byDay.get(day) ?? [];
      arr.push(pt.rank);
      byDay.set(day, arr);
    }
    const dailyMedians = Array.from(byDay.values()).map(median);
    bsr30dMedian = median(dailyMedians);
    if (dailyMedians.length >= 2) {
      const m = dailyMedians.reduce((a, b) => a + b, 0) / dailyMedians.length;
      const variance =
        dailyMedians.reduce((a, b) => a + (b - m) ** 2, 0) / dailyMedians.length;
      bsrVolatility = m > 0 ? Math.sqrt(variance) / m : null;
    }
    if (currentBsr != null && bsr30dMedian != null) {
      bsrTrendPct = ((currentBsr - bsr30dMedian) / bsr30dMedian) * 100;
    }
  }

  // Prefer the BSR-resolved path (set when categoryTree[0] disagrees with
  // the category Amazon actually ranks the product in — passed in via
  // opts.bsrCategoryPath after the caller resolves it via Keepa /category).
  const treeRootName = pickRootCategoryName(product);
  const treeCategoryPath = pickCategoryPath(product);
  const rootCategoryName =
    opts.bsrCategoryPath && opts.bsrCategoryPath.length > 0
      ? opts.bsrCategoryPath[0]
      : treeRootName;
  const categoryPath =
    opts.bsrCategoryPath && opts.bsrCategoryPath.length > 0
      ? opts.bsrCategoryPath
      : treeCategoryPath;
  const bsrForUnits = bsr30dMedian ?? currentBsr;
  const { matched: matchedCategory, band: matchedBand } = resolveCategoryMultiplier(
    categoryPath,
    bsrForUnits,
  );
  const parentMonthlyUnits =
    bsrForUnits != null
      ? bsrToMonthlyUnitsByCategory(bsrForUnits, categoryPath)
      : null;

  const variationCount = Array.isArray(product.variations)
    ? product.variations.length || 1
    : 1;

  const monthlySoldRaw =
    typeof product.monthlySold === 'number' && product.monthlySold > 0
      ? product.monthlySold
      : typeof cur[30] === 'number' && cur[30] > 0
        ? cur[30]
        : null;

  // Prefer Amazon's "X+ bought in past month" badge (via Keepa monthlySold)
  // over BSR-derived attribution. The badge is source-of-truth — Amazon's
  // own published number, not an estimate. Validated against 149 child
  // variations: bucket-midpoint cuts residual error 4.5× vs the prior
  // parent/N equal-split. Falls back to BSR curve when Amazon doesn't
  // display the badge (low-volume or new listings).
  let monthlyUnits: number | null = null;
  let unitsSource: EnrichedRow['unitsSource'] = null;
  if (monthlySoldRaw != null && monthlySoldRaw > 0) {
    monthlyUnits = bucketMidpoint(monthlySoldRaw);
    unitsSource = 'amazon-bucket';
  } else if (parentMonthlyUnits != null) {
    monthlyUnits =
      variationCount <= 1
        ? parentMonthlyUnits
        : Math.max(0, Math.round(parentMonthlyUnits / Math.min(variationCount, 5)));
    unitsSource = 'bsr-curve';
  }

  // 30-day avg price for revenue (so a deal-day spike doesn't skew).
  const csv0: number[] = Array.isArray(product.csv?.[0]) ? product.csv[0] : [];
  const csv1: number[] = Array.isArray(product.csv?.[1]) ? product.csv[1] : [];
  const priceHistory = csv0.length >= csv1.length ? csv0 : csv1;
  const pricePoints30: number[] = [];
  for (let i = 0; i + 1 < priceHistory.length; i += 2) {
    const km = priceHistory[i];
    const cents = priceHistory[i + 1];
    if (typeof km !== 'number' || typeof cents !== 'number' || cents <= 0) continue;
    if (km2ms(km) >= cutoff30) pricePoints30.push(cents);
  }
  const avgPriceCents =
    pricePoints30.length > 0
      ? pricePoints30.reduce((a, b) => a + b, 0) / pricePoints30.length
      : currentPriceCents;

  const monthlyRevenue =
    monthlyUnits != null && avgPriceCents != null
      ? Math.round(monthlyUnits * avgPriceCents)
      : null;

  // Parent-level invariant: parent >= child × cap.
  const parentCap = Math.min(Math.max(variationCount, 1), 5);
  const minParentFromChild = monthlyUnits != null ? monthlyUnits * parentCap : null;
  let parentUnitsResolved = parentMonthlyUnits;
  if (minParentFromChild != null) {
    if (parentUnitsResolved == null || parentUnitsResolved < minParentFromChild) {
      parentUnitsResolved = minParentFromChild;
    }
  }

  const parentMonthlyRevenue =
    parentUnitsResolved != null && avgPriceCents != null
      ? Math.round(parentUnitsResolved * avgPriceCents)
      : null;

  const listingCreatedAt = keepaMinutesToIso(product.listedSince);

  const weightLb =
    typeof product.packageWeight === 'number' && product.packageWeight > 0
      ? round2(product.packageWeight / 453.592)
      : null;
  const dimensions =
    typeof product.packageLength === 'number' &&
    typeof product.packageWidth === 'number' &&
    typeof product.packageHeight === 'number' &&
    product.packageLength > 0 &&
    product.packageWidth > 0 &&
    product.packageHeight > 0
      ? { l: product.packageLength, w: product.packageWidth, h: product.packageHeight }
      : null;
  const imageUrl = pickImageUrl(product);
  const brand = pickBrand(product);

  return {
    rootCategory: rootCategoryName,
    matchedCategory,
    matchedBand,
    bsr: currentBsr,
    bsr30dMedian: bsr30dMedian != null ? Math.round(bsr30dMedian) : null,
    bsrVolatility: bsrVolatility != null ? round2(bsrVolatility) : null,
    bsrTrendPct: bsrTrendPct != null ? round2(bsrTrendPct) : null,
    monthlyUnits,
    monthlyRevenue,
    parentMonthlyUnits: parentUnitsResolved,
    parentMonthlyRevenue,
    unitsSource,
    price: currentPriceCents,
    weightLb,
    dimensions,
    listingCreatedAt,
    variationCount: variationCount > 0 ? variationCount : null,
    rating: ratingTenths != null ? ratingTenths / 10 : null,
    reviews,
    imageUrl,
    brand,
    // 'limited' only when Keepa returned no usable signal at all. The prior
    // gate (bsr30dMedian != null) was a synthetic threshold that dashed
    // legitimate top-rank products (stable BSR = few rank-change points)
    // and confused the matrix vs drawer parity. If Keepa gave us BSR
    // snapshot, monthlySold, reviews, or rating, the row is 'full'.
    dataQuality:
      currentBsr != null || monthlySoldRaw != null || reviews != null || ratingTenths != null
        ? 'full'
        : 'limited',
    curveVersion: CURVE_VERSION,
  };
}

// -----------------------------------------------------------------------------
// Helpers (also exported for the hydrateCompetitor module)
// -----------------------------------------------------------------------------

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function posOrNull(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

export function nonNegOrNull(v: unknown): number | null {
  return typeof v === 'number' && v >= 0 ? v : null;
}

/**
 * Translate Amazon's "X+ bought in past month" bucket into a point estimate.
 * Buckets are right-open intervals: 100+ means [100, 200), 1000+ means [1000, 2000).
 * Midpoint of the interval is the best single-value estimator and is what
 * H10's X-Ray ASIN Sales column lands at empirically (validated 2026-05-14
 * against 149 child variations, median residual 0.31 vs 1.38 for equal-split).
 */
export function bucketMidpoint(bucket: number): number {
  if (!Number.isFinite(bucket) || bucket <= 0) return 0;
  let next: number;
  if (bucket < 100) next = 100;            // 50 → 100, midpoint 75
  else if (bucket < 1000) next = bucket + 100;  // 100→200, …, 900→1000
  else if (bucket < 10_000) next = bucket + 1000; // 1k→2k, …, 9k→10k
  else if (bucket < 100_000) next = bucket + 10_000;
  else next = bucket + 100_000;
  return Math.round((bucket + next) / 2);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function keepaMinutesToIso(km: any): string | null {
  if (typeof km !== 'number' || km <= 0) return null;
  return new Date(km2ms(km)).toISOString().slice(0, 10);
}

export function pickImageUrl(product: any): string | null {
  if (Array.isArray(product?.images) && product.images.length > 0) {
    const first = product.images[0];
    const filename =
      typeof first?.m === 'string' && first.m
        ? first.m
        : typeof first?.l === 'string' && first.l
          ? first.l
          : null;
    if (filename) return `https://m.media-amazon.com/images/I/${filename}`;
  }
  if (typeof product?.imagesCSV === 'string' && product.imagesCSV.length > 0) {
    const filename = product.imagesCSV.split(',')[0]?.trim();
    if (filename) return `https://m.media-amazon.com/images/I/${filename}`;
  }
  return null;
}

export function pickRootCategoryName(product: any): string | null {
  const tree = product?.categoryTree;
  if (Array.isArray(tree) && tree.length > 0) {
    const root = tree[0];
    if (root && typeof root.name === 'string' && root.name.trim()) {
      return root.name.trim();
    }
  }
  return null;
}

export function pickCategoryPath(product: any): string[] | null {
  const tree = product?.categoryTree;
  if (!Array.isArray(tree) || tree.length === 0) return null;
  const names = tree
    .map((t: any) => (typeof t?.name === 'string' ? t.name.trim() : ''))
    .filter((n: string) => n.length > 0);
  return names.length > 0 ? names : null;
}

export function pickBrand(product: any): string | null {
  const brand =
    typeof product?.brand === 'string' && product.brand.trim()
      ? product.brand.trim()
      : null;
  if (brand) return brand;
  const manufacturer =
    typeof product?.manufacturer === 'string' && product.manufacturer.trim()
      ? product.manufacturer.trim()
      : null;
  return manufacturer;
}

/**
 * Derive fulfillment ('AMZ' | 'FBA' | 'FBM' | null) from Keepa offers.
 * 'AMZ' wins (Amazon is selling directly), else 'FBA' if any offer is FBA,
 * else 'FBM' if there are non-Amazon non-FBA offers, else null.
 */
export function deriveFulfillment(product: any): 'AMZ' | 'FBA' | 'FBM' | null {
  const offers = Array.isArray(product?.offers) ? product.offers : [];
  if (offers.length === 0) return null;
  if (offers.some((o: any) => o?.isAmazon === true)) return 'AMZ';
  if (offers.some((o: any) => o?.isFBA === true)) return 'FBA';
  return 'FBM';
}

/**
 * Format dimensions as a display string (e.g. "13.0 × 13.0 × 2.9 in").
 * Keepa stores in millimeters; convert to inches.
 */
export function formatDimensions(dims: { l: number; w: number; h: number } | null): string | null {
  if (!dims) return null;
  const l = round2(dims.l / 25.4);
  const w = round2(dims.w / 25.4);
  const h = round2(dims.h / 25.4);
  return `${l.toFixed(1)} × ${w.toFixed(1)} × ${h.toFixed(1)} in`;
}

/**
 * FBA size tier from weight + dimensions. Best-effort.
 * (Duplicated from asinSnapshot.ts to keep this module self-contained.)
 */
export function deriveSizeTier(
  lbs: number | null,
  dims: { l: number; w: number; h: number } | null,
): string | null {
  if (lbs == null || !dims) return null;
  const lIn = dims.l / 25.4;
  const wIn = dims.w / 25.4;
  const hIn = dims.h / 25.4;
  const sorted = [lIn, wIn, hIn].sort((a, b) => b - a);
  const [longest, medianDim, shortest] = sorted;
  if (lbs <= 1 && longest <= 15 && medianDim <= 12 && shortest <= 0.75) return 'Small Standard';
  if (lbs <= 20 && longest <= 18 && medianDim <= 14 && shortest <= 8) return 'Large Standard';
  if (lbs <= 50 && longest <= 60 && medianDim <= 30) return 'Large Bulky';
  if (lbs <= 50 && longest <= 108) return 'Extra-Large (0-50 lb)';
  if (lbs <= 70) return 'Extra-Large (50-70 lb)';
  if (lbs <= 150) return 'Extra-Large (70-150 lb)';
  return 'Extra-Large (150+ lb)';
}
