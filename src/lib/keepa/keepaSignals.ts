export type TrendDirection = 'up' | 'down' | 'stable';
export type TrendLabel = 'improving' | 'declining' | 'flat';

export interface KeepaSignalPoint {
  timestamp: number;
  value: number | null;
}

export interface KeepaSignalSeries {
  bsr: KeepaSignalPoint[];
  buyBoxPrice?: KeepaSignalPoint[];
  newPrice?: KeepaSignalPoint[];
  amazonPrice?: KeepaSignalPoint[];
  countNew?: KeepaSignalPoint[];
  buyBoxShipping?: KeepaSignalPoint[];
  lightningDeal?: KeepaSignalPoint[];
}

export interface KeepaPriceSignals {
  current: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  volatilityPct: number | null;
  stabilityScore: number | null;
  promoFrequencyPct: number | null;
  avgPromoDropPct: number | null;
  trend: TrendDirection;
}

export interface KeepaBsrSignals {
  current: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  volatilityPct: number | null;
  stabilityScore: number | null;
  trend: TrendDirection;
  trendLabel: TrendLabel;
}

export interface KeepaStockSignals {
  oosPercent: number | null;
  longestOosDays: number | null;
}

export interface KeepaSeasonalitySignals {
  score: number | null;
  peakMonths: number[] | null;
  troughMonths: number[] | null;
}

export interface KeepaSignals {
  price: KeepaPriceSignals;
  bsr: KeepaBsrSignals;
  stock: KeepaStockSignals;
  seasonality: KeepaSeasonalitySignals;
  meta: {
    lastUpdated: string;
    rangeMonths: number;
  };
}

export interface KeepaSignalsMarket {
  seasonalityScore: number | null;
  peakMonths: number[] | null;
  troughMonths: number[] | null;
  priceWarRisk: 'Low' | 'Medium' | 'High' | 'Unknown';
  stockoutPressure: 'Low' | 'Medium' | 'High' | 'Unknown';
  averageOosPercent: number | null;
}

export interface KeepaSignalsProduct {
  asin: string;
  title: string;
  brand?: string;
  status: 'complete' | 'loading' | 'error';
  productData: {
    title: string;
    bsr: KeepaSignalPoint[];
    prices: KeepaSignalPoint[];
    salesEstimates: KeepaSignalPoint[];
  };
  analysis: {
    bsr: {
      trend: {
        direction: TrendDirection;
        strength: number;
        confidence: number;
      };
      stability: number;
      volatility: number;
      details: null;
    };
    price: {
      trend: {
        direction: TrendDirection;
        strength: number;
      };
      stability: number;
    };
    competitivePosition: {
      score: number;
      factors: string[];
    };
  };
  series: KeepaSignalSeries;
  signals: KeepaSignals;
  error?: string;
}

export interface KeepaSignalsResponse {
  products: KeepaSignalsProduct[];
  market: KeepaSignalsMarket;
}

const KEEPA_EPOCH = new Date('2011-01-01').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const monthKeyFromTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const monthFromTimestamp = (timestamp: number) => new Date(timestamp).getUTCMonth() + 1;

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

const getTrendDirection = (values: number[]): TrendDirection => {
  if (values.length < 4) return 'stable';
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const avgFirst = first.reduce((sum, v) => sum + v, 0) / first.length;
  const avgSecond = second.reduce((sum, v) => sum + v, 0) / second.length;
  const change = (avgSecond - avgFirst) / Math.max(1, Math.abs(avgFirst));
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
};

const getTrendLabelForBsr = (values: number[]): TrendLabel => {
  if (values.length < 4) return 'flat';
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const avgFirst = first.reduce((sum, v) => sum + v, 0) / first.length;
  const avgSecond = second.reduce((sum, v) => sum + v, 0) / second.length;
  const change = (avgSecond - avgFirst) / Math.max(1, avgFirst);
  if (change < -0.05) return 'improving';
  if (change > 0.05) return 'declining';
  return 'flat';
};

const calculateVolatilityPct = (values: number[], minPoints = 10): number | null => {
  if (values.length < minPoints) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (!Number.isFinite(mean) || mean === 0) return null;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return Math.round((stdDev / mean) * 1000) / 10;
};

const calculateStabilityScore = (volatilityPct: number | null) => {
  if (!isFiniteNumber(volatilityPct)) return null;
  const volatility = clamp(volatilityPct / 100, 0, 1);
  return clamp(1 - volatility, 0, 1);
};

const extractSeries = (
  csv: number[] | undefined,
  options: { allowZero?: boolean; includeNulls?: boolean; allowNegativeOne?: boolean } = {}
): KeepaSignalPoint[] => {
  if (!csv || csv.length < 2) return [];
  const points: KeepaSignalPoint[] = [];
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

const trimToMonths = (points: KeepaSignalPoint[], months: number) => {
  if (!points.length) return points;
  const cutoff = Date.now() - months * 30 * DAY_MS;
  return points.filter(point => point.timestamp >= cutoff);
};

const downsampleSeries = (points: KeepaSignalPoint[], maxPoints = 365) => {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0);
};

const toDollars = (points: KeepaSignalPoint[]) =>
  points.map(point => ({
    ...point,
    value: isFiniteNumber(point.value) ? point.value / 100 : null
  }));

const valuesFromPoints = (points: KeepaSignalPoint[]) =>
  points.map(point => point.value).filter(isFiniteNumber);

const latestNonNullValue = (points: KeepaSignalPoint[]) => {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = points[i]?.value;
    if (isFiniteNumber(value)) return value;
  }
  return null;
};

const calculateStats = (points: KeepaSignalPoint[]) => {
  const values = valuesFromPoints(points);
  if (!values.length) {
    return { current: null, avg: null, min: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    current: latestNonNullValue(points),
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
};

const calculateBsrVolatilityPct = (values: number[], minPoints = 10) => {
  if (values.length < minPoints) return null;
  const logs = values.filter(v => v > 0).map(v => Math.log(v));
  if (logs.length < minPoints) return null;
  const mean = logs.reduce((sum, v) => sum + v, 0) / logs.length;
  const variance = logs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / logs.length;
  const stdDev = Math.sqrt(variance);
  return clamp(Math.round(stdDev * 1000) / 10, 0, 150);
};

const calculateBsrStabilityScore = (values: number[], minPoints = 10) => {
  const volatility = calculateBsrVolatilityPct(values, minPoints);
  if (!isFiniteNumber(volatility)) return null;
  const normalized = clamp(volatility / 100, 0, 1.5);
  return clamp(1 - normalized, 0, 1);
};

const calculateOosStatsFromBsrGaps = (points: KeepaSignalPoint[]) => {
  const valid = points.filter(point => isFiniteNumber(point.value));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);
  const totalDays = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / DAY_MS;
  if (totalDays <= 0) return null;
  let oosDays = 0;
  let longestOosDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = (sorted[i].timestamp - sorted[i - 1].timestamp) / DAY_MS;
    if (gapDays > 7) {
      oosDays += gapDays;
      longestOosDays = Math.max(longestOosDays, gapDays);
    }
  }
  const oosPercent = clamp((oosDays / totalDays) * 100, 0, 100);
  return {
    oosPercent: Math.round(oosPercent * 10) / 10,
    longestOosDays: Math.round(longestOosDays)
  };
};

const calculateOosStatsFromPrice = (points: KeepaSignalPoint[]) => {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const totalDays = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / DAY_MS;
  if (totalDays <= 0) return null;
  let oosDays = 0;
  let longestOosDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const gapDays = (sorted[i].timestamp - prev.timestamp) / DAY_MS;
    if (prev.value === null) {
      oosDays += gapDays;
      longestOosDays = Math.max(longestOosDays, gapDays);
    }
  }
  const oosPercent = clamp((oosDays / totalDays) * 100, 0, 100);
  return {
    oosPercent: Math.round(oosPercent * 10) / 10,
    longestOosDays: Math.round(longestOosDays)
  };
};

const calculateAvailabilityOosStats = (
  points: KeepaSignalPoint[],
  isOosValue: (value: number) => boolean
) => {
  const valid = points.filter(point => isFiniteNumber(point.value));
  if (valid.length < 2) return { oosPercent: null, longestOosDays: null };
  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);
  const totalMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  if (totalMs <= 0) return { oosPercent: null, longestOosDays: null };
  let oosMs = 0;
  let longestOosMs = 0;
  let currentOosMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const duration = sorted[i].timestamp - prev.timestamp;
    if (duration <= 0) continue;
    if (isOosValue(prev.value as number)) {
      oosMs += duration;
      currentOosMs += duration;
      longestOosMs = Math.max(longestOosMs, currentOosMs);
    } else {
      currentOosMs = 0;
    }
  }
  const oosPercent = clamp((oosMs / totalMs) * 100, 0, 100);
  return {
    oosPercent: Math.round(oosPercent * 10) / 10,
    longestOosDays: Math.round(longestOosMs / DAY_MS)
  };
};

const calculatePercentTime = (
  points: KeepaSignalPoint[],
  isActiveValue: (value: number) => boolean
) => {
  const valid = points.filter(point => isFiniteNumber(point.value));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);
  const totalMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  if (totalMs <= 0) return null;
  let activeMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const duration = sorted[i].timestamp - prev.timestamp;
    if (duration <= 0) continue;
    if (isActiveValue(prev.value as number)) {
      activeMs += duration;
    }
  }
  return clamp((activeMs / totalMs) * 100, 0, 100);
};
const calculateOosStats = (bsrPoints: KeepaSignalPoint[], pricePoints: KeepaSignalPoint[]) => {
  const priceBased = calculateOosStatsFromPrice(pricePoints);
  if (priceBased && isFiniteNumber(priceBased.oosPercent)) return priceBased;
  const bsrBased = calculateOosStatsFromBsrGaps(bsrPoints);
  return bsrBased || { oosPercent: null, longestOosDays: null };
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculatePromoFrequency = (
  points: KeepaSignalPoint[],
  options: { maxPromoDays?: number } = {}
) => {
  const prices = points.filter(point => isFiniteNumber(point.value)) as Array<
    KeepaSignalPoint & { value: number }
  >;
  if (prices.length < 10) return { frequencyPct: null, avgDropPct: null };
  const sorted = [...prices].sort((a, b) => a.timestamp - b.timestamp);
  const totalDays = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / DAY_MS;
  if (totalDays <= 0) return { frequencyPct: null, avgDropPct: null };

  const windowDays = 30;
  const dropThreshold = 0.1;
  const minPromoDays = 5;
  const maxPromoDays = options.maxPromoDays ?? null;
  let promoEvents = 0;
  let promoDays = 0;
  let dropSum = 0;
  let inPromo = false;
  let promoStartTime = 0;
  let promoStartMedian = 0;
  let promoStartPrice = 0;

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    const windowStart = point.timestamp - windowDays * DAY_MS;
    const windowValues = sorted
      .filter(p => p.timestamp >= windowStart && p.timestamp < point.timestamp)
      .map(p => p.value);
    if (windowValues.length < 4) continue;
    const baseline = median(windowValues);
    if (!isFiniteNumber(baseline) || baseline === 0) continue;

    const isPromo = point.value <= baseline * (1 - dropThreshold);
    if (isPromo && !inPromo) {
      inPromo = true;
      promoStartTime = point.timestamp;
      promoStartMedian = baseline;
      promoStartPrice = point.value;
    }

    if (!isPromo && inPromo) {
      const durationDays = (point.timestamp - promoStartTime) / DAY_MS;
      if (durationDays >= minPromoDays && (!maxPromoDays || durationDays <= maxPromoDays)) {
        promoEvents += 1;
        promoDays += durationDays;
        dropSum += ((promoStartMedian - promoStartPrice) / promoStartMedian) * 100;
      }
      inPromo = false;
    }
  }

  if (inPromo) {
    const durationDays = (sorted[sorted.length - 1].timestamp - promoStartTime) / DAY_MS;
    if (durationDays >= minPromoDays && (!maxPromoDays || durationDays <= maxPromoDays)) {
      promoEvents += 1;
      promoDays += durationDays;
      if (promoStartMedian) {
        dropSum += ((promoStartMedian - promoStartPrice) / promoStartMedian) * 100;
      }
    }
  }

  const frequencyPct = clamp((promoDays / totalDays) * 100, 0, 100);
  const avgDropPct = promoEvents ? dropSum / promoEvents : null;
  return {
    frequencyPct: Math.round(frequencyPct * 10) / 10,
    avgDropPct: avgDropPct ? Math.round(avgDropPct * 10) / 10 : null
  };
};

export const buildSeasonalityIndexByMonth = (
  bsr: KeepaSignalPoint[],
  minMonthsWithData = 6
) => {
  const monthlyBuckets = new Map<string, { month: number; demands: number[] }>();
  bsr.forEach(point => {
    if (!isFiniteNumber(point.value) || point.value <= 0) return;
    const demand = 1 / Math.max(point.value, 1);
    const key = monthKeyFromTimestamp(point.timestamp);
    const month = monthFromTimestamp(point.timestamp);
    const bucket = monthlyBuckets.get(key) ?? { month, demands: [] };
    bucket.demands.push(demand);
    monthlyBuckets.set(key, bucket);
  });

  const monthlyAverages = Array.from(monthlyBuckets.values())
    .map(bucket => ({
      month: bucket.month,
      avgDemand: bucket.demands.reduce((sum, value) => sum + value, 0) / bucket.demands.length
    }))
    .filter(entry => isFiniteNumber(entry.avgDemand));

  const monthsWithData = monthlyAverages.length;
  const enoughHistory = monthsWithData >= minMonthsWithData;
  if (!enoughHistory) {
    return {
      indicesByMonth: Array.from({ length: 12 }, () => null as number | null),
      monthsWithData,
      enoughHistory,
      score: null,
      peakMonths: null,
      troughMonths: null
    };
  }

  const overallAvgDemand =
    monthlyAverages.reduce((sum, entry) => sum + entry.avgDemand, 0) / monthlyAverages.length;
  if (!isFiniteNumber(overallAvgDemand) || overallAvgDemand <= 0) {
    return {
      indicesByMonth: Array.from({ length: 12 }, () => null as number | null),
      monthsWithData,
      enoughHistory,
      score: null,
      peakMonths: null,
      troughMonths: null
    };
  }

  const monthOfYearBuckets: Record<number, number[]> = {};
  monthlyAverages.forEach(entry => {
    if (!monthOfYearBuckets[entry.month]) {
      monthOfYearBuckets[entry.month] = [];
    }
    monthOfYearBuckets[entry.month].push(entry.avgDemand);
  });

  const indicesByMonth = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const values = monthOfYearBuckets[month];
    if (!values?.length) return null;
    const avgDemand = values.reduce((sum, value) => sum + value, 0) / values.length;
    return (avgDemand / overallAvgDemand) * 100;
  });

  const validIndices = indicesByMonth.filter(isFiniteNumber);
  if (validIndices.length < 2) {
    return {
      indicesByMonth,
      monthsWithData,
      enoughHistory,
      score: null,
      peakMonths: null,
      troughMonths: null
    };
  }

  const maxIndex = Math.max(...validIndices);
  const minIndex = Math.min(...validIndices);
  const score = maxIndex - minIndex;

  const sorted = indicesByMonth
    .map((value, index) => ({ index, value }))
    .filter(item => isFiniteNumber(item.value))
    .sort((a, b) => (b.value as number) - (a.value as number));
  const peakMonths = sorted.slice(0, 3).map(item => item.index + 1);

  const troughSorted = [...sorted].reverse();
  const troughMonths = troughSorted.slice(0, 3).map(item => item.index + 1);

  return {
    indicesByMonth,
    monthsWithData,
    enoughHistory,
    score,
    peakMonths,
    troughMonths
  };
};

const calculateSeasonality = (bsr: KeepaSignalPoint[]) => {
  const seasonality = buildSeasonalityIndexByMonth(bsr);
  return {
    score: isFiniteNumber(seasonality.score) ? seasonality.score : null,
    peakMonths: seasonality.peakMonths,
    troughMonths: seasonality.troughMonths
  };
};

const selectPriceSeries = (product: any) => {
  const amazon = extractSeries(product.csv?.[KEEPACSV.AMAZON], { includeNulls: true });
  const newPrice = extractSeries(product.csv?.[KEEPACSV.NEW], { includeNulls: true });
  const usedOrBuyBox = extractSeries(product.csv?.[KEEPACSV.USED], { includeNulls: true });
  const buyBox = extractSeries(product.csv?.[KEEPACSV.BUY_BOX_SHIPPING], { includeNulls: true });
  const altPrice = extractSeries(product.csv?.[KEEPACSV.NEW_FBM_SHIPPING], { includeNulls: true });
  const primary =
    buyBox.length > 0
      ? buyBox
      : newPrice.length > 0
      ? newPrice
      : amazon.length > 0
      ? amazon
      : usedOrBuyBox.length > 0
      ? usedOrBuyBox
      : altPrice;
  return {
    buyBox: buyBox.length ? buyBox : undefined,
    newPrice: newPrice.length ? newPrice : undefined,
    amazonPrice: amazon.length ? amazon : undefined,
    primary
  };
};

let debugLogged = false;

export const buildKeepaSignalsProduct = (product: any, rangeMonths: number): KeepaSignalsProduct => {
  if (!product?.asin || !product?.csv) {
    return {
      asin: product?.asin || 'unknown',
      title: product?.title || 'Unknown Product',
      status: 'error',
      productData: {
        title: product?.title || 'Unknown Product',
        bsr: [],
        prices: [],
        salesEstimates: []
      },
      analysis: {
        bsr: {
          trend: { direction: 'stable', strength: 0, confidence: 0 },
          stability: 0,
          volatility: 1,
          details: null
        },
        price: {
          trend: { direction: 'stable', strength: 0 },
          stability: 0
        },
        competitivePosition: {
          score: 0,
          factors: ['Insufficient data']
        }
      },
      series: {
        bsr: [],
        buyBoxPrice: [],
        newPrice: [],
        amazonPrice: [],
        countNew: [],
        buyBoxShipping: [],
        lightningDeal: []
      },
      signals: {
        price: {
          current: null,
          avg: null,
          min: null,
          max: null,
          volatilityPct: null,
          stabilityScore: null,
          promoFrequencyPct: null,
          avgPromoDropPct: null,
          trend: 'stable'
        },
        bsr: {
          current: null,
          avg: null,
          min: null,
          max: null,
          volatilityPct: null,
          stabilityScore: null,
          trend: 'stable',
          trendLabel: 'flat'
        },
        stock: {
          oosPercent: null,
          longestOosDays: null
        },
        seasonality: {
          score: null,
          peakMonths: null,
          troughMonths: null
        },
        meta: {
          lastUpdated: new Date().toISOString(),
          rangeMonths
        }
      },
      error: 'Invalid product data'
    };
  }

  const bsrRaw = extractSeries(product.csv?.[KEEPACSV.SALES], { includeNulls: true });
  const salesRaw = extractSeries(product.csv?.[KEEPACSV.COUNT_NEW], { allowZero: true, includeNulls: true });
  const countNewRaw = extractSeries(product.csv?.[KEEPACSV.COUNT_NEW], {
    allowZero: true,
    includeNulls: true
  });
  const buyBoxShippingRaw = extractSeries(product.csv?.[KEEPACSV.BUY_BOX_SHIPPING], {
    includeNulls: true,
    allowNegativeOne: true
  });
  const lightningDealRaw = extractSeries(product.csv?.[KEEPACSV.LIGHTNING_DEAL], {
    includeNulls: true,
    allowZero: true,
    allowNegativeOne: true
  });
  const { buyBox, newPrice, amazonPrice, primary } = selectPriceSeries(product);
  const bsr = downsampleSeries(trimToMonths(bsrRaw, rangeMonths));
  const pricePrimaryRaw = downsampleSeries(trimToMonths(primary, rangeMonths));
  const pricePrimary = toDollars(pricePrimaryRaw);
  const sales = downsampleSeries(trimToMonths(salesRaw, rangeMonths));
  const countNew = downsampleSeries(trimToMonths(countNewRaw, rangeMonths));
  const buyBoxShipping = downsampleSeries(trimToMonths(buyBoxShippingRaw, rangeMonths));
  const lightningDeal = downsampleSeries(trimToMonths(lightningDealRaw, rangeMonths));

  const priceValues = valuesFromPoints(pricePrimary);
  const bsrValues = valuesFromPoints(bsr);
  const priceStats = calculateStats(pricePrimary);
  const bsrStats = calculateStats(bsr);
  const priceVolatility = calculateVolatilityPct(priceValues);
  const bsrVolatility = calculateBsrVolatilityPct(bsrValues);
  const priceStability = calculateStabilityScore(priceVolatility);
  const bsrStability = calculateBsrStabilityScore(bsrValues);
  const priceTrend = getTrendDirection(priceValues);
  const bsrTrend = getTrendDirection(bsrValues);
  const bsrTrendLabel = getTrendLabelForBsr(bsrValues);
  const promoStats = calculatePromoFrequency(pricePrimary, { maxPromoDays: 14 });
  const lightningPromoPct = calculatePercentTime(lightningDeal, value => value > 0);
  const promoFrequencyPct = isFiniteNumber(lightningPromoPct)
    ? Math.round(lightningPromoPct * 10) / 10
    : promoStats.frequencyPct;

  const buyBoxOosStats = calculateAvailabilityOosStats(buyBoxShipping, value => value === -1);
  const countNewOosStats = calculateAvailabilityOosStats(countNew, value => value === 0);
  const stockStats =
    isFiniteNumber(buyBoxOosStats.oosPercent) || isFiniteNumber(buyBoxOosStats.longestOosDays)
      ? buyBoxOosStats
      : countNewOosStats;
  const seasonality = calculateSeasonality(bsr);

  const avgBsr = bsrStats.avg ?? null;
  const competitiveScore =
    isFiniteNumber(avgBsr) && avgBsr > 0 ? Math.max(1, Math.min(10, 10 - Math.log10(avgBsr))) : 0;

  const normalized = {
    asin: product.asin,
    title: product.title || 'Unknown Product',
    brand: product.brand || product.manufacturer || undefined,
    status: 'complete',
    productData: {
      title: product.title || 'Unknown Product',
      bsr,
      prices: pricePrimaryRaw,
      salesEstimates: sales
    },
    analysis: {
      bsr: {
        trend: {
          direction: bsrTrend,
          strength: isFiniteNumber(bsrVolatility) ? Math.min(1, Math.abs(bsrVolatility / 100)) : 0,
          confidence: bsrValues.length > 30 ? 0.8 : bsrValues.length >= 10 ? 0.6 : 0.4
        },
        stability: bsrStability ?? 0,
        volatility: isFiniteNumber(bsrVolatility) ? clamp(bsrVolatility / 100, 0, 1) : 0,
        details: null
      },
      price: {
        trend: {
          direction: priceTrend,
          strength: isFiniteNumber(priceVolatility) ? Math.min(1, Math.abs(priceVolatility / 100)) : 0
        },
        stability: priceStability ?? 0
      },
      competitivePosition: {
        score: competitiveScore,
        factors: isFiniteNumber(avgBsr)
          ? [`Average BSR: ${Math.round(avgBsr).toLocaleString()}`]
          : ['Insufficient BSR data']
      }
    },
    series: {
      bsr,
      buyBoxPrice: buyBox
        ? downsampleSeries(toDollars(trimToMonths(buyBox, rangeMonths)))
        : undefined,
      newPrice: newPrice ? downsampleSeries(toDollars(trimToMonths(newPrice, rangeMonths))) : undefined,
      amazonPrice: amazonPrice
        ? downsampleSeries(toDollars(trimToMonths(amazonPrice, rangeMonths)))
        : undefined,
      countNew,
      buyBoxShipping,
      lightningDeal
    },
    signals: {
      price: {
        current: priceStats.current,
        avg: priceStats.avg,
        min: priceStats.min,
        max: priceStats.max,
        volatilityPct: priceVolatility,
        stabilityScore: priceStability,
        promoFrequencyPct,
        avgPromoDropPct: promoStats.avgDropPct,
        trend: priceTrend
      },
      bsr: {
        current: bsrStats.current,
        avg: bsrStats.avg,
        min: bsrStats.min,
        max: bsrStats.max,
        volatilityPct: bsrVolatility,
        stabilityScore: bsrStability,
        trend: bsrTrend,
        trendLabel: bsrTrendLabel
      },
      stock: {
        oosPercent: stockStats.oosPercent,
        longestOosDays: stockStats.longestOosDays
      },
      seasonality,
      meta: {
        lastUpdated: new Date().toISOString(),
        rangeMonths
      }
    }
  };
  if (process.env.NODE_ENV !== 'production' && !debugLogged) {
    debugLogged = true;
    console.log('Keepa normalized sample', {
      asin: normalized.asin,
      title: normalized.title,
      pricePoints: normalized.series.buyBoxPrice?.length || normalized.productData.prices.length,
      bsrPoints: normalized.series.bsr.length,
      currentPrice: normalized.signals.price.current,
      currentBsr: normalized.signals.bsr.current
    });
  }
  return normalized as KeepaSignalsProduct;
};

export const buildMarketSignals = (products: KeepaSignalsProduct[]): KeepaSignalsMarket => {
  const seasonalityPoints = products.flatMap(
    product => product?.series?.bsr || product?.productData?.bsr || []
  );
  const seasonality = buildSeasonalityIndexByMonth(seasonalityPoints);
  const seasonalityScore = isFiniteNumber(seasonality.score) ? seasonality.score : null;
  const sortedPeakMonths = seasonality.peakMonths || [];
  const sortedTroughMonths = seasonality.troughMonths || [];

  const valid = products.filter(
    product =>
      product &&
      product.signals &&
      product.signals.bsr &&
      isFiniteNumber(product.signals.bsr.avg)
  );
  if (!valid.length) {
    return {
      seasonalityScore,
      peakMonths: sortedPeakMonths.length ? sortedPeakMonths.slice(0, 3) : null,
      troughMonths: sortedTroughMonths.length ? sortedTroughMonths.slice(0, 3) : null,
      priceWarRisk: 'Unknown',
      stockoutPressure: 'Unknown',
      averageOosPercent: null
    };
  }

  const oosValues = valid
    .map(product => product.signals.stock.oosPercent)
    .filter(isFiniteNumber);
  const averageOosPercent = oosValues.length
    ? oosValues.reduce((sum, value) => sum + value, 0) / oosValues.length
    : null;
  const priceWarCandidates = valid.filter(
    product =>
      isFiniteNumber(product.signals.price.promoFrequencyPct) &&
      isFiniteNumber(product.signals.price.stabilityScore)
  );
  const priceWarSignals = priceWarCandidates.filter(
    product =>
      (product.signals.price.promoFrequencyPct as number) >= 15 &&
      (product.signals.price.stabilityScore as number) <= 0.6
  );
  const priceWarRatio = priceWarCandidates.length
    ? priceWarSignals.length / priceWarCandidates.length
    : null;
  const priceWarRisk =
    priceWarRatio === null ? 'Unknown' : priceWarRatio >= 0.5 ? 'High' : priceWarRatio >= 0.25 ? 'Medium' : 'Low';
  const stockoutPressure =
    averageOosPercent === null
      ? 'Unknown'
      : averageOosPercent >= 15
      ? 'High'
      : averageOosPercent >= 7
      ? 'Medium'
      : 'Low';

  return {
    seasonalityScore: isFiniteNumber(seasonalityScore) ? seasonalityScore : null,
    peakMonths: sortedPeakMonths.length ? sortedPeakMonths.slice(0, 3) : null,
    troughMonths: sortedTroughMonths.length ? sortedTroughMonths.slice(0, 3) : null,
    priceWarRisk,
    stockoutPressure,
    averageOosPercent: isFiniteNumber(averageOosPercent)
      ? Math.round(averageOosPercent * 10) / 10
      : null
  };
};
