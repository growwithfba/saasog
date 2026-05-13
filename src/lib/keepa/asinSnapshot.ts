/**
 * Centralized single-ASIN enrichment from Keepa.
 *
 * Returns an `AsinSnapshot` — a normalized, UI-ready shape that
 * covers every field we can pull or derive from Keepa's `/product`
 * endpoint. Fields we cannot get from Keepa are explicitly null with
 * a `pending_sources: [...]` array so the UI can display "Pending"
 * and the upcoming Chrome extension knows what to fill.
 *
 * This is server-side only — it calls Keepa directly with the API
 * key. Invoke from a Next.js route handler or server component,
 * never from the browser.
 */

import { withTracking, estimateKeepaCostUsd } from '@/utils/observability';
import { bsrToMonthlyUnitsByCategory } from '@/lib/extension/bsrSalesCurve';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_EPOCH_MS = new Date('2011-01-01').getTime();
const MINUTE_MS = 60 * 1000;

// Keepa CSV types we read directly from the stats.current array.
const CSV = {
  AMAZON_PRICE: 0,
  NEW_PRICE: 1,
  BSR: 3,
  COUNT_NEW_OFFERS: 11,
  RATING: 16,
  REVIEW_COUNT: 17,
  BUY_BOX_SHIPPING: 18,
} as const;

export type PendingSource = 'chrome_extension' | 'amazon_sp_api' | 'keepa_offers' | 'keepa_variations';

export interface AsinSnapshot {
  asin: string;
  fetchedAt: string; // ISO timestamp

  // Dedicated research_products columns
  title: string | null;
  brand: string | null;
  /** Top-level Amazon category (e.g. "Toys & Games"). Used for the research row. */
  category: string | null;
  /** Full category path for future use — e.g. ["Toys & Games", "Games & Accessories", "Card Games"]. */
  category_path: string[] | null;
  price: number | null;               // USD
  /**
   * Monthly revenue is deliberately null here. It is derived from
   * monthly_units_sold, which Keepa exposes only as Amazon's rounded
   * "X+ bought in past month" display badge (not a real sales estimate).
   * Revenue — along with units sold, last-year sales, and sales-to-reviews
   * — is flagged pending and will be populated by the Chrome extension
   * or a future BSR-to-sales converter.
   */
  monthly_revenue: number | null;
  monthly_units_sold: number | null;
  /**
   * Amazon's own "X+ bought in the past month" display value, as surfaced
   * by Keepa. Kept for reference only — not a real sales estimate.
   */
  amazon_bought_past_month_display: number | null;

  // extra_data fields that map to existing Helium 10 column headers
  bsr: number | null;
  rating: number | null;              // 1.0–5.0
  review: number | null;              // review count
  weight: number | null;              // pounds (converted from grams)
  number_of_images: number | null;
  size_tier: string | null;           // derived from weight + dims (best-effort)
  price_trend: number | null;         // % change over 90d
  sales_trend: number | null;         // % change over 90d
  last_year_sales: number | null;     // 12-mo units × avg price, USD
  sales_year_over_year: number | null;// % YoY change in units
  sales_to_reviews: number | null;    // monthly units / review count
  best_sales_period: string | null;   // peak months label
  date_first_available: string | null;// ISO date
  variation_count: number | null;

  // Keepa-everywhere sweep — derived from product.offers
  active_sellers: number | null;
  fulfilled_by: 'AMZ' | 'FBA' | 'FBM' | null;

  // Family-level totals (same logic as enrichedRow.ts parent attribution)
  parent_level_sales: number | null;
  parent_level_revenue: number | null;

  // Fields Keepa cannot provide today — will be filled by Chrome extension
  // or later Keepa calls.
  pending_sources: Record<string, PendingSource>;

  // For debugging + observability
  debug?: {
    keepaTokensLeft?: number | null;
    keepaTokensConsumed?: number | null;
    rangeMonths: number;
  };
}

const sanitizeAsin = (asin: string) => asin.replace(/[^A-Z0-9]/gi, '').toUpperCase();

/**
 * Convert Keepa minute-since-epoch to an ISO timestamp.
 */
const keepaMinutesToIso = (minutes: number | undefined | null): string | null => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  const ms = KEEPA_EPOCH_MS + minutes * MINUTE_MS;
  return new Date(ms).toISOString();
};

/**
 * Keepa prices are integer cents; -1 means "unknown".
 */
const centsToDollars = (value: number | undefined | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value) / 100;
};

/**
 * Keepa weight is in grams × 10 (Keepa docs call this "weight in hundredths
 * of a gram"). Convert to pounds for BloomEngine's research-row convention.
 */
const keepaWeightToLbs = (value: number | undefined | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const grams = value / 10;
  const pounds = grams / 453.59237;
  return Math.round(pounds * 1000) / 1000;
};

const ratingFromKeepa = (value: number | undefined | null): number | null => {
  // Keepa rating is stored × 10 (e.g. 47 = 4.7 stars).
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / 10) * 10) / 10;
};

const categoryPath = (product: any): string[] | null => {
  const tree: Array<{ catId: number; name: string }> = product?.categoryTree || [];
  if (!Array.isArray(tree) || tree.length === 0) return null;
  const names = tree.map((t) => t?.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
  return names.length > 0 ? names : null;
};

const rootCategoryName = (product: any): string | null => {
  const path = categoryPath(product);
  return path && path.length > 0 ? path[0] : null;
};

const countImages = (product: any): number | null => {
  // Keepa returns images as an array of {l, lH, lW, m, mH, mW} objects.
  // Prefer that — probe confirmed `imagesCSV` is undefined on most modern
  // Keepa responses, so reading only imagesCSV gave us null.
  if (Array.isArray(product?.images) && product.images.length > 0) {
    return product.images.length;
  }
  if (typeof product?.imagesCSV === 'string' && product.imagesCSV.length > 0) {
    return product.imagesCSV.split(',').filter(Boolean).length;
  }
  if (typeof product?.imageCount === 'number' && Number.isFinite(product.imageCount)) {
    return product.imageCount;
  }
  return null;
};

const countVariations = (product: any): number | null => {
  if (Array.isArray(product?.variations)) return product.variations.length;
  if (typeof product?.variationCSV === 'string' && product.variationCSV.length > 0) {
    return product.variationCSV.split(',').filter(Boolean).length;
  }
  return null;
};

/**
 * Best-effort FBA size tier classification from weight + dimensions.
 * Uses Amazon's Standard vs. Large vs. Oversize buckets as of 2025.
 * Returns null if we can't determine confidently.
 */
const deriveSizeTier = (
  lbs: number | null,
  dims: { length: number | null; width: number | null; height: number | null }
): string | null => {
  if (lbs == null) return null;
  const { length, width, height } = dims;
  // Can't classify without longest/median/shortest dimensions.
  if (length == null || width == null || height == null) return null;
  const sorted = [length, width, height].sort((a, b) => b - a);
  const [longest, median, shortest] = sorted;
  if (lbs <= 1 && longest <= 15 && median <= 12 && shortest <= 0.75) return 'Small Standard';
  if (lbs <= 20 && longest <= 18 && median <= 14 && shortest <= 8) return 'Large Standard';
  if (lbs <= 50 && longest <= 60 && median <= 30) return 'Large Bulky';
  if (lbs <= 50 && longest <= 108) return 'Extra-Large (0-50 lb)';
  if (lbs <= 70) return 'Extra-Large (50-70 lb)';
  if (lbs <= 150) return 'Extra-Large (70-150 lb)';
  return 'Extra-Large (150+ lb)';
};

/**
 * Walk a csv history array [(timestamp_min, value), (timestamp_min, value), ...]
 * and return the most recent value. Keepa csv arrays are interleaved integers.
 */
const latestCsvValue = (csv: number[] | undefined | null): number | null => {
  if (!Array.isArray(csv) || csv.length < 2) return null;
  const value = csv[csv.length - 1];
  if (typeof value !== 'number' || value < 0) return null;
  return value;
};

/**
 * Average of csv values over a rolling window, in minutes from the most
 * recent timestamp. Returns null if insufficient data.
 */
const csvAverageWithinDays = (
  csv: number[] | undefined | null,
  windowDays: number
): number | null => {
  if (!Array.isArray(csv) || csv.length < 4) return null;
  const lastTsMin = csv[csv.length - 2];
  if (typeof lastTsMin !== 'number') return null;
  const cutoffMin = lastTsMin - windowDays * 24 * 60;
  const values: number[] = [];
  for (let i = 0; i < csv.length - 1; i += 2) {
    const ts = csv[i];
    const v = csv[i + 1];
    if (ts >= cutoffMin && typeof v === 'number' && v >= 0) values.push(v);
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

/**
 * Compute a percent change = (current - past_avg) / past_avg * 100.
 * Past window is 30..120 days ago so recent spikes don't dominate.
 */
const trendPctOver90Days = (csv: number[] | undefined | null): number | null => {
  const recent = csvAverageWithinDays(csv, 30);
  const past = csvAverageWithinDays(csv, 120);
  if (recent == null || past == null || past === 0) return null;
  return Math.round(((recent - past) / past) * 1000) / 10; // one decimal
};

/**
 * Seasonality "best sales period" — months where avg monthly-sold rank
 * is highest (lowest rank). Rough, but gives users a quick signal.
 */
const deriveBestSalesPeriod = (bsrCsv: number[] | undefined | null): string | null => {
  if (!Array.isArray(bsrCsv) || bsrCsv.length < 24) return null;
  const byMonth: Record<number, { sum: number; count: number }> = {};
  for (let i = 0; i < bsrCsv.length - 1; i += 2) {
    const ts = bsrCsv[i];
    const v = bsrCsv[i + 1];
    if (typeof ts !== 'number' || typeof v !== 'number' || v < 0) continue;
    const ms = KEEPA_EPOCH_MS + ts * MINUTE_MS;
    const month = new Date(ms).getUTCMonth() + 1;
    byMonth[month] ??= { sum: 0, count: 0 };
    byMonth[month].sum += v;
    byMonth[month].count += 1;
  }
  const avgs = Object.entries(byMonth)
    .map(([m, { sum, count }]) => ({ month: Number(m), avg: sum / count }))
    .filter(({ count }: any) => true);
  if (avgs.length < 6) return null;
  // Best = lowest BSR average.
  avgs.sort((a, b) => a.avg - b.avg);
  const top = avgs.slice(0, 3).map((a) => a.month).sort((a, b) => a - b);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return top.map((m) => monthNames[m - 1]).join(', ');
};

export interface FetchAsinSnapshotOptions {
  userId: string | null;
  domain?: number;
  rangeMonths?: number;
}

/**
 * Fetch a single ASIN from Keepa and build a normalized snapshot.
 * Logs the call through observability.withTracking so Keepa token
 * spend and latency land in usage_events.
 */
export async function fetchAsinSnapshot(
  asin: string,
  options: FetchAsinSnapshotOptions
): Promise<AsinSnapshot> {
  const normalized = sanitizeAsin(asin);
  if (normalized.length !== 10) {
    throw new Error(`Invalid ASIN format: ${asin}`);
  }
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY is not configured');

  const domain = options.domain ?? 1;
  const rangeMonths = options.rangeMonths ?? 24;

  return withTracking<AsinSnapshot>(
    {
      userId: options.userId,
      provider: 'keepa',
      operation: 'asin_snapshot',
      model: 'keepa-product-v1',
      metadata: { asin: normalized, domain, rangeMonths },
      extractUsage: () => ({ costUsd: estimateKeepaCostUsd(3) }),
    },
    async () => {
      // Keepa-everywhere sweep — add &buybox=1 to unlock cur[18]
      // BUY_BOX_SHIPPING. Without it, that index returns -1 and we
      // fall back to AMAZON / NEW prices which aren't always what
      // the customer actually pays.
      const url =
        `${KEEPA_BASE_URL}/product` +
        `?key=${apiKey}` +
        `&domain=${domain}` +
        `&asin=${normalized}` +
        `&stats=180` +
        `&history=1` +
        `&rating=1` +
        `&buybox=1` +
        `&offers=20`;

      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Keepa API ${response.status}: ${text.slice(0, 200)}`);
      }
      const data = await response.json();
      const product = data?.products?.[0];
      if (!product) {
        throw new Error('Keepa returned no product for this ASIN');
      }

      // Category resolution — Keepa's categoryTree[0] is sometimes the
      // marketplace-listing category rather than the BSR-tracked category.
      // (Example caught 2026-05-13: B0095UVKRI Bacon Air Freshener —
      // categoryTree[0] = "Health & Household" but product.salesRankReference
      // points to "Automotive" where the BSR 36,406 is actually tracked.
      // The wrong category drives the wrong BSR-curve multiplier, which
      // produces wrong monthly units / revenue estimates.)
      //
      // When salesRankReference doesn't appear in categoryTree's catIds,
      // hit Keepa /category to resolve the right name + parent chain.
      let bsrCategoryName: string | null = null;
      let bsrCategoryPath: string[] | null = null;
      try {
        const treeCatIds: number[] = (Array.isArray(product?.categoryTree) ? product.categoryTree : [])
          .map((c: any) => c?.catId)
          .filter((id: any) => typeof id === 'number');
        const bsrCatId =
          typeof product?.salesRankReference === 'number' && product.salesRankReference > 0
            ? product.salesRankReference
            : null;
        if (bsrCatId && !treeCatIds.includes(bsrCatId)) {
          const catUrl =
            `${KEEPA_BASE_URL}/category` +
            `?key=${apiKey}` +
            `&domain=${domain}` +
            `&category=${bsrCatId}` +
            `&parents=1`;
          const catRes = await fetch(catUrl);
          if (catRes.ok) {
            const catData: any = await catRes.json();
            const cats = catData?.categories || {};
            const path: string[] = [];
            const visited = new Set<number>();
            let currentId: number | null = bsrCatId;
            while (currentId && !visited.has(currentId)) {
              visited.add(currentId);
              const node: any = cats[String(currentId)];
              if (!node) break;
              if (typeof node.name === 'string' && node.name) path.unshift(node.name);
              currentId =
                typeof node.parent === 'number' && node.parent !== 0 ? node.parent : null;
            }
            if (path.length > 0) {
              bsrCategoryName = path[0];
              bsrCategoryPath = path;
            }
          }
        }
      } catch (err) {
        console.warn('Keepa /category resolution failed; falling back to categoryTree', err);
      }

      return buildSnapshotFromKeepaProduct(product, {
        rangeMonths,
        tokensLeft: data?.tokensLeft ?? null,
        tokensConsumed: data?.tokensConsumed ?? null,
        bsrCategoryName,
        bsrCategoryPath,
      });
    }
  );
}

interface BuildOptions {
  rangeMonths: number;
  tokensLeft?: number | null;
  tokensConsumed?: number | null;
  /** When the BSR-tracked category differs from categoryTree (resolved
   *  via Keepa /category), pass the resolved root + path here so display
   *  + BSR curve use the correct category. */
  bsrCategoryName?: string | null;
  bsrCategoryPath?: string[] | null;
}

function buildSnapshotFromKeepaProduct(product: any, opts: BuildOptions): AsinSnapshot {
  const asin = sanitizeAsin(product.asin || '');

  // Current values from stats.current[] (index-aligned with CSV types).
  const current = product?.stats?.current || [];
  const amazonCents = current[CSV.AMAZON_PRICE];
  const newCents = current[CSV.NEW_PRICE];
  const buyBoxCents = current[CSV.BUY_BOX_SHIPPING];
  const bsrRaw = current[CSV.BSR];
  const ratingRaw = current[CSV.RATING];
  const reviewRaw = current[CSV.REVIEW_COUNT];

  // Keepa-everywhere sweep — prefer Buy Box (cur[18]) since that's what
  // the customer actually pays. Falls back to Amazon → New if Buy Box
  // is unavailable.
  const price =
    centsToDollars(buyBoxCents) ??
    centsToDollars(amazonCents) ??
    centsToDollars(newCents) ??
    null;
  const bsr = typeof bsrRaw === 'number' && bsrRaw > 0 ? bsrRaw : null;
  const rating = ratingFromKeepa(ratingRaw);
  const review = typeof reviewRaw === 'number' && reviewRaw >= 0 ? reviewRaw : null;

  const amazonDisplayUnits =
    typeof current[30] === 'number' && current[30] > 0
      ? current[30]
      : typeof product?.monthlySold === 'number' && product.monthlySold > 0
        ? product.monthlySold
        : null;

  // Keepa-everywhere sweep — compute monthly units/revenue from the same
  // BSR-curve + variation-cap math used by enrichedRow.ts. Identical
  // calibration; only the calling path differs.
  const variationCount = Array.isArray(product?.variations)
    ? product.variations.length || 1
    : 1;
  const catTree: Array<{ name?: string }> = Array.isArray(product?.categoryTree) ? product.categoryTree : [];
  const treeCategoryPath = catTree
    .map((c) => (typeof c?.name === 'string' ? c.name : ''))
    .filter((n) => n.length > 0);
  // Use the BSR-resolved category path when available (covers the case
  // where the displayed-listing category and the BSR-tracked category
  // disagree — see comment in fetchAsinSnapshot's call site).
  const categoryPathForCurve =
    opts.bsrCategoryPath && opts.bsrCategoryPath.length > 0
      ? opts.bsrCategoryPath
      : treeCategoryPath.length > 0
        ? treeCategoryPath
        : null;
  const bsrForCurve = bsr;
  const parentMonthlyUnits =
    bsrForCurve != null
      ? bsrToMonthlyUnitsByCategory(bsrForCurve, categoryPathForCurve)
      : null;

  const monthlySold: number | null =
    parentMonthlyUnits != null
      ? variationCount <= 1
        ? parentMonthlyUnits
        : Math.max(0, Math.round(parentMonthlyUnits / Math.min(variationCount, 5)))
      : null;

  const monthlyRevenue: number | null =
    monthlySold != null && price != null ? Math.round(monthlySold * price * 100) / 100 : null;

  // Parent-level totals — child × variation cap (matches enrichedRow.ts).
  const parentCap = Math.min(Math.max(variationCount, 1), 5);
  const parent_level_sales: number | null =
    monthlySold != null
      ? Math.max(parentMonthlyUnits ?? 0, monthlySold * parentCap)
      : null;
  const parent_level_revenue: number | null =
    parent_level_sales != null && price != null
      ? Math.round(parent_level_sales * price * 100) / 100
      : null;

  // Sales-to-reviews ratio (decimal, e.g. 1.5 = 1.5 sales per review per month)
  const salesToReviews: number | null =
    monthlySold != null && review != null && review > 0
      ? Math.round((monthlySold / review) * 100) / 100
      : null;

  // Active sellers + fulfilled_by from offers.
  //
  // 2026-05-13: Dave caught a 112-seller count on B0095UVKRI (Bacon Air
  // Freshener) where Amazon shows "16 New". The previous count was
  // product.offers.length — Keepa returns up to N historical unique
  // offers (cumulative all-time, not currently live), so a long-tracked
  // listing accumulates 100+ entries that aren't selling today.
  //
  // The right field is `product.liveOffersOrder` — an array of indices
  // into `offers[]` for the offers Keepa believes are currently active.
  // We filter to NEW condition (1) so used/refurbished count separately.
  const offers: any[] = Array.isArray(product?.offers) ? product.offers : [];
  const liveOffersOrder: number[] = Array.isArray(product?.liveOffersOrder)
    ? product.liveOffersOrder
    : [];
  const liveNewOffers = liveOffersOrder
    .map((idx) => offers[idx])
    .filter((o) => o && o.condition === 1);
  const active_sellers: number | null =
    liveOffersOrder.length > 0
      ? liveNewOffers.length || liveOffersOrder.length
      : offers.length > 0
        ? offers.length
        : null;
  const fulfilled_by: 'AMZ' | 'FBA' | 'FBM' | null = (() => {
    const liveOffers = liveOffersOrder.length > 0
      ? liveOffersOrder.map((idx) => offers[idx]).filter(Boolean)
      : offers;
    if (liveOffers.length === 0) return null;
    if (liveOffers.some((o) => o?.isAmazon === true)) return 'AMZ';
    if (liveOffers.some((o) => o?.isFBA === true)) return 'FBA';
    return 'FBM';
  })();

  const weightLbs = keepaWeightToLbs(product?.packageWeight);
  const dims = {
    length: typeof product?.packageLength === 'number' ? product.packageLength / 25.4 : null,
    width: typeof product?.packageWidth === 'number' ? product.packageWidth / 25.4 : null,
    height: typeof product?.packageHeight === 'number' ? product.packageHeight / 25.4 : null,
  };
  const sizeTier = deriveSizeTier(weightLbs, dims);

  // Trends from csv history (90-day rolling).
  const priceTrend = trendPctOver90Days(product?.csv?.[CSV.NEW_PRICE] ?? product?.csv?.[CSV.AMAZON_PRICE]);
  const salesCsv = product?.csv?.[CSV.BSR]; // inverse: BSR drop = sales trend up
  const rawSalesTrend = trendPctOver90Days(salesCsv);
  // BSR and sales move inversely; flip sign so positive = "selling more".
  const salesTrend = rawSalesTrend == null ? null : -1 * rawSalesTrend;

  const bestSalesPeriod = deriveBestSalesPeriod(product?.csv?.[CSV.BSR]);

  // Last-year sales — rough estimate: monthly units × 12 × avg price.
  // Same logic the H10 column means; not a precise reading but signals
  // scale. Null when we don't have units.
  const lastYearSales: number | null =
    monthlySold != null && price != null ? Math.round(monthlySold * 12 * price * 100) / 100 : null;

  // YoY: compare current monthlySold to an older window. Without a second
  // explicit call we approximate with stats.min vs stats.current. Mark as
  // pending if we can't compute with confidence.
  const salesYoY: number | null = null;

  const dateFirstAvailable = keepaMinutesToIso(product?.listedSince);

  const pending: Record<string, PendingSource> = {};
  const markPending = (field: string, src: PendingSource) => {
    pending[field] = src;
  };

  // Fields Keepa STILL cannot give us. Anything Keepa now provides is
  // populated above and not marked pending.
  if (monthlySold == null) markPending('monthly_units_sold', 'chrome_extension');
  if (monthlyRevenue == null) markPending('monthly_revenue', 'chrome_extension');
  if (lastYearSales == null) markPending('last_year_sales', 'chrome_extension');
  if (salesToReviews == null) markPending('sales_to_reviews', 'chrome_extension');
  if (parent_level_sales == null) markPending('parent_level_sales', 'keepa_variations');
  if (parent_level_revenue == null) markPending('parent_level_revenue', 'keepa_variations');
  if (active_sellers == null) markPending('active_sellers', 'keepa_offers');
  if (fulfilled_by == null) markPending('fulfilled_by', 'keepa_offers');
  // Net price needs Amazon SP-API (post-fee net) — Keepa doesn't have it.
  markPending('net_price', 'amazon_sp_api');
  if (salesYoY == null) markPending('sales_year_over_year', 'chrome_extension');

  return {
    asin,
    fetchedAt: new Date().toISOString(),

    title: typeof product?.title === 'string' ? product.title : null,
    brand: typeof product?.brand === 'string' ? product.brand : null,
    // Prefer the BSR-resolved category for display so the surfaced
    // category matches the BSR breakdown Amazon shows on the listing.
    category: opts.bsrCategoryName ?? rootCategoryName(product),
    category_path: opts.bsrCategoryPath ?? categoryPath(product),
    price,
    monthly_revenue: monthlyRevenue,
    monthly_units_sold: monthlySold,
    amazon_bought_past_month_display: amazonDisplayUnits,

    bsr,
    rating,
    review,
    weight: weightLbs,
    number_of_images: countImages(product),
    size_tier: sizeTier,
    price_trend: priceTrend,
    sales_trend: salesTrend,
    last_year_sales: lastYearSales,
    sales_year_over_year: salesYoY,
    sales_to_reviews: salesToReviews,
    best_sales_period: bestSalesPeriod,
    date_first_available: dateFirstAvailable,
    variation_count: countVariations(product),

    active_sellers,
    fulfilled_by,
    parent_level_sales,
    parent_level_revenue,

    pending_sources: pending,

    debug: {
      keepaTokensLeft: opts.tokensLeft ?? null,
      keepaTokensConsumed: opts.tokensConsumed ?? null,
      rangeMonths: opts.rangeMonths,
    },
  };
}
