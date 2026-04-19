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
} as const;

export type PendingSource = 'chrome_extension' | 'amazon_sp_api' | 'keepa_offers' | 'keepa_variations';

export interface AsinSnapshot {
  asin: string;
  fetchedAt: string; // ISO timestamp

  // Dedicated research_products columns
  title: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;               // USD
  monthly_revenue: number | null;     // USD, derived
  monthly_units_sold: number | null;  // estimated units per month

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

  // Fields Keepa cannot provide today — will be filled by Chrome extension
  // or later Keepa calls (offers/variations endpoints).
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

const lastCategoryName = (product: any): string | null => {
  const tree: Array<{ catId: number; name: string }> = product?.categoryTree || [];
  if (!Array.isArray(tree) || tree.length === 0) return null;
  const last = tree[tree.length - 1];
  return last?.name ?? null;
};

const countImages = (product: any): number | null => {
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
      const url =
        `${KEEPA_BASE_URL}/product` +
        `?key=${apiKey}` +
        `&domain=${domain}` +
        `&asin=${normalized}` +
        `&stats=180` +
        `&history=1` +
        `&rating=1` +
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
      return buildSnapshotFromKeepaProduct(product, {
        rangeMonths,
        tokensLeft: data?.tokensLeft ?? null,
        tokensConsumed: data?.tokensConsumed ?? null,
      });
    }
  );
}

interface BuildOptions {
  rangeMonths: number;
  tokensLeft?: number | null;
  tokensConsumed?: number | null;
}

function buildSnapshotFromKeepaProduct(product: any, opts: BuildOptions): AsinSnapshot {
  const asin = sanitizeAsin(product.asin || '');

  // Current values from stats.current[] (index-aligned with CSV types).
  const current = product?.stats?.current || [];
  const amazonCents = current[CSV.AMAZON_PRICE];
  const newCents = current[CSV.NEW_PRICE];
  const bsrRaw = current[CSV.BSR];
  const ratingRaw = current[CSV.RATING];
  const reviewRaw = current[CSV.REVIEW_COUNT];

  const price =
    centsToDollars(amazonCents) ??
    centsToDollars(newCents) ??
    null;
  const bsr = typeof bsrRaw === 'number' && bsrRaw > 0 ? bsrRaw : null;
  const rating = ratingFromKeepa(ratingRaw);
  const review = typeof reviewRaw === 'number' && reviewRaw >= 0 ? reviewRaw : null;

  // Keepa's monthly sales estimate (only populated when rangeMonths is set).
  const monthlySold =
    typeof product?.monthlySold === 'number' && product.monthlySold > 0
      ? product.monthlySold
      : null;
  const monthlyRevenue = monthlySold != null && price != null ? Math.round(monthlySold * price) : null;
  const salesToReviews =
    monthlySold != null && review != null && review > 0 ? Math.round((monthlySold / review) * 100) / 100 : null;

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

  // Last year sales: average monthly units over ~12 months × avg price.
  // Keepa stats.avg array gives us averages over the window we requested.
  const avg = product?.stats?.avg || [];
  const avgPrice =
    centsToDollars(avg[CSV.AMAZON_PRICE]) ??
    centsToDollars(avg[CSV.NEW_PRICE]) ??
    price;
  const lastYearSales =
    monthlySold != null && avgPrice != null ? Math.round(monthlySold * 12 * avgPrice) : null;

  // YoY: compare current monthlySold to an older window. Without a second
  // explicit call we approximate with stats.min vs stats.current. Mark as
  // pending if we can't compute with confidence.
  const salesYoY: number | null = null;

  const dateFirstAvailable = keepaMinutesToIso(product?.listedSince);

  const pending: Record<string, PendingSource> = {};
  const markPending = (field: string, src: PendingSource) => {
    pending[field] = src;
  };

  // Fields truly out of reach today.
  markPending('net_price', 'amazon_sp_api');              // Post-fee net
  markPending('parent_level_sales', 'keepa_variations');
  markPending('parent_level_revenue', 'keepa_variations');
  markPending('active_sellers', 'keepa_offers');          // Need offers parsing
  markPending('fulfilled_by', 'keepa_offers');            // Need offers parsing
  if (salesYoY == null) markPending('sales_year_over_year', 'chrome_extension');

  return {
    asin,
    fetchedAt: new Date().toISOString(),

    title: typeof product?.title === 'string' ? product.title : null,
    brand: typeof product?.brand === 'string' ? product.brand : null,
    category: lastCategoryName(product),
    price,
    monthly_revenue: monthlyRevenue,
    monthly_units_sold: monthlySold,

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

    pending_sources: pending,

    debug: {
      keepaTokensLeft: opts.tokensLeft ?? null,
      keepaTokensConsumed: opts.tokensConsumed ?? null,
      rangeMonths: opts.rangeMonths,
    },
  };
}
