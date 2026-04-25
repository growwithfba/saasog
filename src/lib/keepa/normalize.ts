export type KeepaPoint = {
  timestamp: number;
  value: number | null;
};

export type KeepaPriceSource = 'buyBox' | 'new' | 'amazon' | 'used' | 'fbm';

// Buy Box ownership pair — who held the buy box at a given moment.
// sellerId === null means the buy box was suppressed (Keepa's -1 / -2 sentinels).
export type BuyBoxOwnerPoint = {
  timestamp: number;
  sellerId: string | null;
};

export interface NormalizedKeepaSeries {
  // Core series (present before 2.8b)
  price: KeepaPoint[];
  bsr: KeepaPoint[];
  lightningDeal: KeepaPoint[];
  countNew: KeepaPoint[];
  buyBoxShipping: KeepaPoint[];
  priceSource: KeepaPriceSource | null;
  // Expanded series (2.8b)
  listPrice: KeepaPoint[];       // CSV 4 — MSRP / anchor price
  newFba: KeepaPoint[];          // CSV 10 — lowest 3P-FBA price
  rating: KeepaPoint[];          // CSV 16 — normalized to 0.0–5.0
  reviewCount: KeepaPoint[];     // CSV 17 — cumulative review count
}

export interface NormalizedKeepaCompetitor {
  asin: string;
  title: string;
  brand?: string;
  series: NormalizedKeepaSeries;
  // Per-competitor metadata (2.8b)
  listedSince: number | null;           // ms epoch, from product.listedSince
  trackingSince: number | null;         // ms epoch, from product.trackingSince
  launchDate: number | null;            // ms epoch, earliest reliable launch signal
  daysTracked: number | null;           // integer, convenience for UI
  fbaFees: { pickAndPackFee: number | null; storageFee: number | null } | null;
  returnRate: number | null;            // Keepa bucket index (0–10), raw
  monthlySold: number | null;           // current "1K+ bought in past month" snapshot
  monthlySoldHistory: KeepaPoint[];     // tracked series if Keepa returns it
  buyBoxOwnership: BuyBoxOwnerPoint[];  // from buyBoxSellerIdHistory
  imageUrl: string | null;              // first image from imagesCSV, full Amazon CDN URL
}

export interface NormalizedKeepaSnapshot {
  windowMonths: number;
  generatedAt: string;
  competitors: NormalizedKeepaCompetitor[];
}

const KEEPA_EPOCH = new Date('2011-01-01').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

const monthKeyFromTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

// Convert a Keepa-minutes-since-2011-01-01 value to a JS epoch ms.
// Returns null for Keepa's "unknown" sentinel (0 or negative).
const keepaMinutesToMs = (minutes: number | null | undefined): number | null => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  return KEEPA_EPOCH + minutes * 60 * 1000;
};

const KEEPACSV = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES: 3,
  LISTPRICE: 4,              // MSRP / anchor
  NEW_FBM_SHIPPING: 7,
  LIGHTNING_DEAL: 8,
  NEW_FBA: 10,               // lowest 3P-FBA
  COUNT_NEW: 11,
  RATING: 16,                // 0–50 integer; divide by 10 for stars
  COUNT_REVIEWS: 17,         // cumulative review count
  BUY_BOX_SHIPPING: 18
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeKeepaValue = (
  value: number | undefined,
  options: { allowZero?: boolean; allowNegativeOne?: boolean } = {}
): number | null => {
  if (!isFiniteNumber(value)) return null;
  if (value === -1 && options.allowNegativeOne) return value;
  if (value <= -1) return null;
  if (value === 0 && !options.allowZero) return null;
  return value;
};

const extractSeries = (
  csv: number[] | undefined,
  options: { allowZero?: boolean; includeNulls?: boolean; allowNegativeOne?: boolean } = {}
): KeepaPoint[] => {
  if (!csv || csv.length < 2) return [];
  const points: KeepaPoint[] = [];
  for (let i = 0; i < csv.length; i += 2) {
    const minutes = csv[i];
    const value = csv[i + 1];
    if (!isFiniteNumber(minutes) || minutes < 0) continue;
    const timestamp = KEEPA_EPOCH + minutes * 60 * 1000;
    const normalized = normalizeKeepaValue(value, {
      allowZero: options.allowZero,
      allowNegativeOne: options.allowNegativeOne
    });
    if (normalized === null && !options.includeNulls) continue;
    points.push({ timestamp, value: normalized });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
};

const trimToMonths = (points: KeepaPoint[], months: number) => {
  if (!points.length) return points;
  const cutoff = Date.now() - months * 30 * DAY_MS;
  return points.filter(point => point.timestamp >= cutoff);
};

const downsampleSeries = (points: KeepaPoint[], maxPoints = 1200) => {
  if (points.length <= maxPoints) return points;
  const monthBuckets = new Map<string, number[]>();
  const monthValidBuckets = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = monthKeyFromTimestamp(point.timestamp);
    if (!monthBuckets.has(key)) monthBuckets.set(key, []);
    monthBuckets.get(key)?.push(index);
    if (isFiniteNumber(point.value)) {
      if (!monthValidBuckets.has(key)) monthValidBuckets.set(key, []);
      monthValidBuckets.get(key)?.push(index);
    }
  });

  const required = new Set<number>();
  monthBuckets.forEach(indices => {
    const key = monthKeyFromTimestamp(points[indices[0]].timestamp);
    const validIndices = monthValidBuckets.get(key);
    const source = validIndices?.length ? validIndices : indices;
    required.add(source[Math.floor(source.length / 2)]);
  });

  if (required.size >= maxPoints) {
    return Array.from(required)
      .sort((a, b) => a - b)
      .slice(0, maxPoints)
      .map(index => points[index]);
  }

  const remainingSlots = Math.max(maxPoints - required.size, 0);
  if (remainingSlots === 0) {
    return Array.from(required)
      .sort((a, b) => a - b)
      .map(index => points[index]);
  }

  const step = Math.ceil(points.length / remainingSlots);
  const sampled = new Set<number>(required);
  for (let i = 0; i < points.length && sampled.size < maxPoints; i += step) {
    sampled.add(i);
  }

  return Array.from(sampled)
    .sort((a, b) => a - b)
    .map(index => points[index]);
};

const toDollars = (points: KeepaPoint[]) =>
  points.map(point => ({
    ...point,
    value: isFiniteNumber(point.value) ? point.value / 100 : null
  }));

// buyBoxShipping uses `-1` as the "no buy box / stockout" sentinel and we
// rely on that downstream for stockout detection. Convert positive cents to
// dollars but pass `-1` and `null` through untouched.
const toDollarsPreservingSentinels = (points: KeepaPoint[]) =>
  points.map(point => {
    if (point.value === null) return point;
    if (point.value === -1) return point;
    if (!isFiniteNumber(point.value)) return { ...point, value: null };
    return { ...point, value: point.value / 100 };
  });

// Keepa stores rating as 0–50 integer (45 = 4.5 stars). Scale to 0.0–5.0.
const toRatingStars = (points: KeepaPoint[]) =>
  points.map(point => ({
    ...point,
    value: isFiniteNumber(point.value) ? point.value / 10 : null
  }));

// buyBoxSellerIdHistory comes as a flat array of [keepaMinutes, sellerId, ...]
// where sellerId can be a seller code like "A2L77EE7U53NWQ" or a sentinel "-1"/"-2".
const extractBuyBoxOwnership = (raw: unknown): BuyBoxOwnerPoint[] => {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const points: BuyBoxOwnerPoint[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const minutes = Number(raw[i]);
    const sellerRaw = raw[i + 1];
    const timestamp = keepaMinutesToMs(minutes);
    if (timestamp === null) continue;
    // Treat -1 / -2 sentinels and empty strings as "no winner".
    const sellerStr = typeof sellerRaw === 'string' ? sellerRaw : String(sellerRaw ?? '');
    const sellerId = sellerStr === '-1' || sellerStr === '-2' || sellerStr === '' ? null : sellerStr;
    points.push({ timestamp, sellerId });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
};

// Combine the three launch signals and pick the earliest reliable one.
// Priority: listedSince (authoritative) → first-rank timestamp → trackingSince.
const deriveLaunchDate = (
  listedSinceMs: number | null,
  trackingSinceMs: number | null,
  firstRankTimestamp: number | null
): number | null => {
  const candidates = [listedSinceMs, firstRankTimestamp, trackingSinceMs].filter(
    (value): value is number => typeof value === 'number' && value > 0
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
};

const daysBetween = (laterMs: number | null, earlierMs: number | null): number | null => {
  if (laterMs === null || earlierMs === null || laterMs < earlierMs) return null;
  return Math.floor((laterMs - earlierMs) / DAY_MS);
};

// Keepa exposes images as an array of `{ l, m, lH, lW, mH, mW }` objects on
// `product.images`, where `m` is a medium variant (~500px on the long side)
// and `l` is the original. We pick `m` for thumbnails. Filenames already
// include the extension (e.g. "41nqMxX3xpL.jpg") so the URL is just
// https://m.media-amazon.com/images/I/{filename}.
const firstImageUrlFromImages = (images: unknown): string | null => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!first || typeof first !== 'object') return null;
  const filename =
    typeof (first as any).m === 'string' && (first as any).m.length > 0
      ? (first as any).m
      : typeof (first as any).l === 'string' && (first as any).l.length > 0
      ? (first as any).l
      : null;
  if (!filename) return null;
  return `https://m.media-amazon.com/images/I/${filename}`;
};

const selectPriceSeries = (product: any) => {
  const amazon = extractSeries(product.csv?.[KEEPACSV.AMAZON], { includeNulls: true });
  const newPrice = extractSeries(product.csv?.[KEEPACSV.NEW], { includeNulls: true });
  const usedPrice = extractSeries(product.csv?.[KEEPACSV.USED], { includeNulls: true });
  const buyBox = extractSeries(product.csv?.[KEEPACSV.BUY_BOX_SHIPPING], { includeNulls: true });
  const fbm = extractSeries(product.csv?.[KEEPACSV.NEW_FBM_SHIPPING], { includeNulls: true });

  if (buyBox.length) return { series: buyBox, source: 'buyBox' as const };
  if (newPrice.length) return { series: newPrice, source: 'new' as const };
  if (amazon.length) return { series: amazon, source: 'amazon' as const };
  if (usedPrice.length) return { series: usedPrice, source: 'used' as const };
  return { series: fbm, source: fbm.length ? ('fbm' as const) : null };
};

export const normalizeKeepaProducts = (
  products: any[],
  windowMonths: number
): NormalizedKeepaSnapshot => {
  const nowMs = Date.now();
  const normalized = (products || []).map(product => {
    // Core series
    const bsrRaw = extractSeries(product.csv?.[KEEPACSV.SALES], { includeNulls: true });
    const lightningRaw = extractSeries(product.csv?.[KEEPACSV.LIGHTNING_DEAL], {
      includeNulls: true,
      allowZero: true,
      allowNegativeOne: true
    });
    const countNewRaw = extractSeries(product.csv?.[KEEPACSV.COUNT_NEW], {
      includeNulls: true,
      allowZero: true
    });
    const buyBoxShippingRaw = extractSeries(product.csv?.[KEEPACSV.BUY_BOX_SHIPPING], {
      includeNulls: true,
      allowNegativeOne: true
    });
    const { series: priceRaw, source } = selectPriceSeries(product);

    // Expanded series (2.8b)
    const listPriceRaw = extractSeries(product.csv?.[KEEPACSV.LISTPRICE], { includeNulls: true });
    const newFbaRaw = extractSeries(product.csv?.[KEEPACSV.NEW_FBA], { includeNulls: true });
    const ratingRaw = extractSeries(product.csv?.[KEEPACSV.RATING], { includeNulls: true });
    const reviewCountRaw = extractSeries(product.csv?.[KEEPACSV.COUNT_REVIEWS], {
      includeNulls: true,
      allowZero: true
    });
    // monthlySoldHistory lives on the top-level product object when Keepa returns
    // it (not guaranteed for every marketplace / category).
    const monthlySoldHistoryRaw = extractSeries(product.monthlySoldHistory, {
      includeNulls: true,
      allowZero: true
    });

    const bsr = downsampleSeries(trimToMonths(bsrRaw, windowMonths));
    // Price, buyBoxShipping, and countNew feed event detectors that look for
    // multi-day runs of specific values (price drops, `-1` stockouts, offer
    // surges). Downsampling to one point per month smooths those runs out of
    // existence, so we keep them raw. 730 daily points × 5 competitors is
    // still well under JSONB's practical ceiling.
    const price = trimToMonths(toDollars(priceRaw), windowMonths);
    const lightningDeal = downsampleSeries(trimToMonths(lightningRaw, windowMonths));
    const countNew = trimToMonths(countNewRaw, windowMonths);
    const buyBoxShipping = toDollarsPreservingSentinels(
      trimToMonths(buyBoxShippingRaw, windowMonths)
    );
    const listPrice = downsampleSeries(toDollars(trimToMonths(listPriceRaw, windowMonths)));
    const newFba = downsampleSeries(toDollars(trimToMonths(newFbaRaw, windowMonths)));
    const rating = downsampleSeries(toRatingStars(trimToMonths(ratingRaw, windowMonths)));
    const reviewCount = downsampleSeries(trimToMonths(reviewCountRaw, windowMonths));
    const monthlySoldHistory = downsampleSeries(trimToMonths(monthlySoldHistoryRaw, windowMonths));

    // Metadata
    const listedSince = keepaMinutesToMs(product.listedSince);
    const trackingSince = keepaMinutesToMs(product.trackingSince);
    // First-rank timestamp: earliest point in the SALES CSV with a finite value
    // (ignore -1 / null). bsrRaw is already sorted by extractSeries.
    const firstRankPoint = bsrRaw.find(point => isFiniteNumber(point.value));
    const firstRankTimestamp = firstRankPoint?.timestamp ?? null;
    const launchDate = deriveLaunchDate(listedSince, trackingSince, firstRankTimestamp);
    const daysTracked = daysBetween(nowMs, launchDate);

    const fbaFees = product.fbaFees && typeof product.fbaFees === 'object'
      ? {
          pickAndPackFee: isFiniteNumber(product.fbaFees.pickAndPackFee)
            ? product.fbaFees.pickAndPackFee / 100
            : null,
          storageFee: isFiniteNumber(product.fbaFees.storageFee)
            ? product.fbaFees.storageFee / 100
            : null
        }
      : null;

    const returnRate = isFiniteNumber(product.returnRate) ? product.returnRate : null;
    const monthlySold = isFiniteNumber(product.monthlySold) ? product.monthlySold : null;
    const buyBoxOwnership = extractBuyBoxOwnership(product.buyBoxSellerIdHistory);
    const imageUrl = firstImageUrlFromImages(product.images);

    return {
      asin: product.asin,
      title: product.title || 'Unknown Product',
      brand: product.brand || product.manufacturer || undefined,
      series: {
        price,
        bsr,
        lightningDeal,
        countNew,
        buyBoxShipping,
        priceSource: source,
        listPrice,
        newFba,
        rating,
        reviewCount
      },
      listedSince,
      trackingSince,
      launchDate,
      daysTracked,
      fbaFees,
      returnRate,
      monthlySold,
      monthlySoldHistory,
      buyBoxOwnership,
      imageUrl
    } as NormalizedKeepaCompetitor;
  });

  return {
    windowMonths,
    generatedAt: new Date().toISOString(),
    competitors: normalized.filter(item => Boolean(item.asin))
  };
};
