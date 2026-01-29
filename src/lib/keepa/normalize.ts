export type KeepaPoint = {
  timestamp: number;
  value: number | null;
};

export type KeepaPriceSource = 'buyBox' | 'new' | 'amazon' | 'used' | 'fbm';

export interface NormalizedKeepaSeries {
  price: KeepaPoint[];
  bsr: KeepaPoint[];
  lightningDeal: KeepaPoint[];
  countNew: KeepaPoint[];
  buyBoxShipping: KeepaPoint[];
  priceSource: KeepaPriceSource | null;
}

export interface NormalizedKeepaCompetitor {
  asin: string;
  title: string;
  brand?: string;
  series: NormalizedKeepaSeries;
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

const KEEPACSV = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES: 3,
  NEW_FBM_SHIPPING: 7,
  LIGHTNING_DEAL: 8,
  COUNT_NEW: 11,
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
  const normalized = (products || []).map(product => {
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

    const bsr = downsampleSeries(trimToMonths(bsrRaw, windowMonths));
    const price = downsampleSeries(toDollars(trimToMonths(priceRaw, windowMonths)));
    const lightningDeal = downsampleSeries(trimToMonths(lightningRaw, windowMonths));
    const countNew = downsampleSeries(trimToMonths(countNewRaw, windowMonths));
    const buyBoxShipping = downsampleSeries(trimToMonths(buyBoxShippingRaw, windowMonths));

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
        priceSource: source
      }
    } as NormalizedKeepaCompetitor;
  });

  return {
    windowMonths,
    generatedAt: new Date().toISOString(),
    competitors: normalized.filter(item => Boolean(item.asin))
  };
};
