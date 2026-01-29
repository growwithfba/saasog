import type { KeepaPoint, NormalizedKeepaSnapshot, NormalizedKeepaCompetitor } from './normalize';

export type PricingBehavior = 'Stable' | 'Moderate' | 'Volatile' | 'Unknown';
export type RankBehavior = 'Stable' | 'Unstable' | 'Unknown';
export type PressureLevel = 'Low' | 'Medium' | 'High' | 'Unknown';
export type TrendLabel = 'Improving' | 'Flat' | 'Declining' | 'Unknown';

export interface KeepaPromoEvent {
  start: number;
  end: number;
  dropPct: number | null;
  source: 'explicit' | 'inferred';
}

export interface MonthlySeriesPoint {
  month: string;
  price?: number;
  bsr?: number;
}

export interface KeepaCompetitorMetrics {
  asin: string;
  brand?: string;
  title?: string;
  priceStabilityPct: number | null;
  rankStabilityPct: number | null;
  promoFrequencyPct: number | null;
  avgHistoricalPrice: number | null;
  avgHistoricalBsr: number | null;
  peakMonths: number[] | null;
  trend: TrendLabel;
  monthlySeries: MonthlySeriesPoint[];
  promoEvents: KeepaPromoEvent[];
  priceVolatilityPct: number | null;
  rankVolatilityPct: number | null;
}

export interface KeepaComputedAnalysis {
  windowMonths: number;
  insights: {
    seasonality: PressureLevel;
    seasonalityScore: number | null;
    peakMonths: number[] | null;
    pricingBehavior: PricingBehavior;
    priceVolatilityPct: number | null;
    discountPressure: PressureLevel;
    promoFrequencyPct: number | null;
    avgPromoDropPct: number | null;
    rankBehavior: RankBehavior;
    rankVolatilityPct: number | null;
    stockoutPressure: PressureLevel | 'None detected';
    oosTimePct: number | null;
    marketStoryText: string;
  };
  trends: {
    marketSeries: MonthlySeriesPoint[];
    promoEvents: KeepaPromoEvent[];
    typicalPriceRange: { min: number | null; max: number | null };
    largestPriceDrop: { pct: number | null; month: string | null };
    rankVolatilityCategory: RankBehavior;
  };
  seasonality: {
    curve: Array<{ month: number; index: number | null }>;
    peakMonths: number[] | null;
    troughMonths: number[] | null;
    score: number | null;
    takeaway: string;
  };
  promos: {
    promoFrequencyPct: number | null;
    avgPromoDropPct: number | null;
    promoMonthDistribution: Record<string, number>;
    interpretation: string;
    hasPromoData: boolean;
  };
  stockouts: {
    oosTimePct: number | null;
    oosEventCount: number | null;
    stockoutPressure: PressureLevel | 'None detected';
    hasMeaningfulStockouts: boolean;
  };
  competitors: KeepaCompetitorMetrics[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const monthKeyFromTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const monthFromTimestamp = (timestamp: number) => new Date(timestamp).getUTCMonth() + 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const percentile = (values: number[], pct: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * pct;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const median = (values: number[]) => percentile(values, 0.5);

const aggregateMonthly = (points: KeepaPoint[]) => {
  const buckets = new Map<string, number[]>();
  points.forEach(point => {
    if (!isFiniteNumber(point.value)) return;
    const key = monthKeyFromTimestamp(point.timestamp);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)?.push(point.value);
  });
  return Array.from(buckets.entries())
    .map(([month, values]) => ({
      month,
      value: median(values)
    }))
    .filter(item => isFiniteNumber(item.value))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const averageAbsolutePctChange = (values: number[]) => {
  if (values.length < 3) return null;
  const changes: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const current = values[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(current) || prev === 0) continue;
    changes.push(Math.abs((current - prev) / prev) * 100);
  }
  return changes.length ? average(changes) : null;
};

const coefficientOfVariationPct = (values: number[]) => {
  if (values.length < 4) return null;
  const mean = average(values);
  if (!isFiniteNumber(mean) || mean === 0) return null;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean * 100;
};

const calculateSeasonalityCurve = (bsrPoints: KeepaPoint[]) => {
  const monthlyBuckets = new Map<string, { month: number; demands: number[] }>();
  bsrPoints.forEach(point => {
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

  if (monthlyAverages.length < 6) {
    return {
      curve: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, index: null })),
      score: null,
      peakMonths: null,
      troughMonths: null
    };
  }

  const overallAvgDemand =
    monthlyAverages.reduce((sum, entry) => sum + entry.avgDemand, 0) / monthlyAverages.length;
  if (!isFiniteNumber(overallAvgDemand) || overallAvgDemand <= 0) {
    return {
      curve: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, index: null })),
      score: null,
      peakMonths: null,
      troughMonths: null
    };
  }

  const monthBuckets: Record<number, number[]> = {};
  monthlyAverages.forEach(entry => {
    if (!monthBuckets[entry.month]) monthBuckets[entry.month] = [];
    monthBuckets[entry.month].push(entry.avgDemand);
  });

  const curve = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const values = monthBuckets[month];
    if (!values?.length) return { month, index: null };
    const avgDemand = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { month, index: (avgDemand / overallAvgDemand) * 100 };
  });

  const validIndices = curve.map(item => item.index).filter(isFiniteNumber);
  if (validIndices.length < 2) {
    return { curve, score: null, peakMonths: null, troughMonths: null };
  }

  const maxIndex = Math.max(...validIndices);
  const minIndex = Math.min(...validIndices);
  const score = clamp(maxIndex - minIndex, 0, 100);

  const sorted = curve
    .filter(item => isFiniteNumber(item.index))
    .sort((a, b) => (b.index as number) - (a.index as number));
  const peakMonths = sorted.slice(0, 3).map(item => item.month);
  const troughMonths = [...sorted].reverse().slice(0, 3).map(item => item.month);

  return {
    curve,
    score,
    peakMonths,
    troughMonths
  };
};

const categoryFromVolatility = (volatilityPct: number | null): PricingBehavior => {
  if (!isFiniteNumber(volatilityPct)) return 'Unknown';
  if (volatilityPct < 8) return 'Stable';
  if (volatilityPct <= 20) return 'Moderate';
  return 'Volatile';
};

const discountPressureFromFrequency = (promoFrequencyPct: number | null): PressureLevel => {
  if (!isFiniteNumber(promoFrequencyPct)) return 'Unknown';
  if (promoFrequencyPct < 10) return 'Low';
  if (promoFrequencyPct <= 30) return 'Medium';
  return 'High';
};

const rankBehaviorFromVolatility = (volatilityPct: number | null): RankBehavior => {
  if (!isFiniteNumber(volatilityPct)) return 'Unknown';
  return volatilityPct < 30 ? 'Stable' : 'Unstable';
};

const stockoutPressureFromOos = (oosPct: number | null): PressureLevel | 'None detected' => {
  if (!isFiniteNumber(oosPct)) return 'Unknown';
  if (oosPct < 1) return 'None detected';
  if (oosPct < 7) return 'Low';
  if (oosPct <= 15) return 'Medium';
  return 'High';
};

const trendFromBsrSlope = (monthlyBsr: Array<{ month: string; value: number }>) => {
  if (monthlyBsr.length < 4) return 'Unknown';
  const recent = monthlyBsr.slice(-6);
  if (recent.length < 3) return 'Unknown';
  const values = recent.map(item => item.value);
  const mean = average(values);
  if (!isFiniteNumber(mean)) return 'Unknown';
  const xs = recent.map((_, idx) => idx + 1);
  const xMean = average(xs) as number;
  const yMean = mean as number;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < recent.length; i += 1) {
    const dx = xs[i] - xMean;
    numerator += dx * (values[i] - yMean);
    denominator += dx * dx;
  }
  if (denominator === 0) return 'Unknown';
  const slope = numerator / denominator;
  const normalizedSlope = slope / mean;
  if (normalizedSlope <= -0.03) return 'Improving';
  if (normalizedSlope >= 0.03) return 'Declining';
  return 'Flat';
};

const buildPromoEventsFromLightning = (lightning: KeepaPoint[]) => {
  const valid = lightning.filter(point => isFiniteNumber(point.value)) as Array<
    KeepaPoint & { value: number }
  >;
  if (valid.length < 2) return [] as KeepaPromoEvent[];
  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);
  const events: KeepaPromoEvent[] = [];
  let currentStart: number | null = null;
  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const isPromo = point.value > 0;
    if (isPromo && currentStart === null) {
      currentStart = point.timestamp;
    }
    if (!isPromo && currentStart !== null) {
      events.push({ start: currentStart, end: point.timestamp, dropPct: null, source: 'explicit' });
      currentStart = null;
    }
  }
  if (currentStart !== null) {
    events.push({
      start: currentStart,
      end: sorted[sorted.length - 1].timestamp,
      dropPct: null,
      source: 'explicit'
    });
  }
  return events;
};

const buildPromoEventsFromPrice = (price: KeepaPoint[]) => {
  const points = price.filter(point => isFiniteNumber(point.value)) as Array<
    KeepaPoint & { value: number }
  >;
  if (points.length < 10) return [] as KeepaPromoEvent[];
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const events: KeepaPromoEvent[] = [];
  const dropThreshold = 0.1;
  const recoveryDays = 42;

  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const windowStart = point.timestamp - 30 * DAY_MS;
    const windowValues = sorted
      .filter(p => p.timestamp >= windowStart && p.timestamp < point.timestamp)
      .map(p => p.value);
    if (windowValues.length < 4) continue;
    const baseline = median(windowValues);
    if (!isFiniteNumber(baseline) || baseline === 0) continue;
    const dropPct = ((baseline - point.value) / baseline) * 100;
    if (dropPct < dropThreshold * 100) continue;

    const recoveryCutoff = point.timestamp + recoveryDays * DAY_MS;
    const recovery = sorted.find(p => p.timestamp > point.timestamp && p.timestamp <= recoveryCutoff && p.value >= baseline * 0.95);
    if (!recovery) continue;
    events.push({
      start: point.timestamp,
      end: recovery.timestamp,
      dropPct: Math.round(dropPct * 10) / 10,
      source: 'inferred'
    });
  }

  return events;
};

const computePromoStats = (
  promoEvents: KeepaPromoEvent[],
  series: KeepaPoint[]
): { promoFrequencyPct: number | null; avgPromoDropPct: number | null; monthDistribution: Record<string, number> } => {
  if (!promoEvents.length || series.length < 2) {
    return { promoFrequencyPct: null, avgPromoDropPct: null, monthDistribution: {} };
  }
  const sortedSeries = [...series].sort((a, b) => a.timestamp - b.timestamp);
  const totalMs = sortedSeries[sortedSeries.length - 1].timestamp - sortedSeries[0].timestamp;
  if (totalMs <= 0) {
    return { promoFrequencyPct: null, avgPromoDropPct: null, monthDistribution: {} };
  }
  let promoMs = 0;
  const drops: number[] = [];
  const monthDistribution: Record<string, number> = {};
  promoEvents.forEach(event => {
    promoMs += Math.max(0, event.end - event.start);
    if (isFiniteNumber(event.dropPct)) drops.push(event.dropPct as number);
    const monthKey = monthKeyFromTimestamp(event.start);
    monthDistribution[monthKey] = (monthDistribution[monthKey] ?? 0) + 1;
  });
  const promoFrequencyPct = clamp((promoMs / totalMs) * 100, 0, 100);
  const avgPromoDropPct = drops.length ? average(drops) : null;
  return {
    promoFrequencyPct: Math.round(promoFrequencyPct * 10) / 10,
    avgPromoDropPct: isFiniteNumber(avgPromoDropPct) ? Math.round(avgPromoDropPct * 10) / 10 : null,
    monthDistribution
  };
};

const computeOosStats = (
  buyBoxShipping: KeepaPoint[],
  countNew: KeepaPoint[]
): { oosTimePct: number | null; oosEventCount: number | null } => {
  const series =
    buyBoxShipping.length > 1
      ? buyBoxShipping
      : countNew.length > 1
      ? countNew
      : [];
  if (!series.length) return { oosTimePct: null, oosEventCount: null };
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
  const totalMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  if (totalMs <= 0) return { oosTimePct: null, oosEventCount: null };

  let oosMs = 0;
  let eventCount = 0;
  let inOos = false;
  let oosStart = 0;
  const isOosValue = (value: number | null) => {
    if (value === null) return false;
    if (buyBoxShipping.length > 1) return value === -1;
    return value === 0;
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const duration = sorted[i].timestamp - prev.timestamp;
    if (duration <= 0) continue;
    const oos = isOosValue(prev.value);
    if (oos) {
      oosMs += duration;
      if (!inOos) {
        inOos = true;
        oosStart = prev.timestamp;
      }
    } else if (inOos) {
      if (sorted[i].timestamp - oosStart >= DAY_MS * 2) {
        eventCount += 1;
      }
      inOos = false;
    }
  }
  if (inOos) {
    if (sorted[sorted.length - 1].timestamp - oosStart >= DAY_MS * 2) {
      eventCount += 1;
    }
  }

  const oosTimePct = clamp((oosMs / totalMs) * 100, 0, 100);
  return { oosTimePct: Math.round(oosTimePct * 10) / 10, oosEventCount: eventCount };
};

const buildMonthlySeries = (price: KeepaPoint[], bsr: KeepaPoint[]): MonthlySeriesPoint[] => {
  const priceMonthly = aggregateMonthly(price);
  const bsrMonthly = aggregateMonthly(bsr);
  const merged = new Map<string, MonthlySeriesPoint>();
  priceMonthly.forEach(item => {
    merged.set(item.month, { month: item.month, price: item.value as number });
  });
  bsrMonthly.forEach(item => {
    const existing = merged.get(item.month) || { month: item.month };
    merged.set(item.month, { ...existing, bsr: item.value as number });
  });
  return Array.from(merged.values()).sort((a, b) => a.month.localeCompare(b.month));
};

const aggregateMarketSeries = (competitors: KeepaCompetitorMetrics[]): MonthlySeriesPoint[] => {
  const merged = new Map<string, { price: number[]; bsr: number[] }>();
  competitors.forEach(competitor => {
    competitor.monthlySeries.forEach(item => {
      if (!merged.has(item.month)) merged.set(item.month, { price: [], bsr: [] });
      if (isFiniteNumber(item.price)) merged.get(item.month)?.price.push(item.price as number);
      if (isFiniteNumber(item.bsr)) merged.get(item.month)?.bsr.push(item.bsr as number);
    });
  });
  return Array.from(merged.entries())
    .map(([month, values]) => ({
      month,
      price: values.price.length ? average(values.price) ?? undefined : undefined,
      bsr: values.bsr.length ? average(values.bsr) ?? undefined : undefined
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const formatMonths = (months: number[]) => {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const unique = Array.from(new Set(months)).filter(month => month >= 1 && month <= 12);
  const sorted = unique.sort((a, b) => a - b);
  return sorted.map(month => labels[month - 1]).join(', ');
};

const getTopPromoMonths = (monthDistribution: Record<string, number>) => {
  const totals: Record<number, number> = {};
  Object.entries(monthDistribution).forEach(([monthKey, count]) => {
    const month = Number(monthKey.split('-')[1]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return;
    totals[month] = (totals[month] ?? 0) + count;
  });
  const top = Object.entries(totals)
    .sort((a, b) => {
      const diff = (b[1] ?? 0) - (a[1] ?? 0);
      return diff !== 0 ? diff : Number(a[0]) - Number(b[0]);
    })
    .slice(0, 2)
    .map(([month]) => Number(month))
    .sort((a, b) => a - b);
  return top.length ? formatMonths(top) : '';
};

const buildMarketStory = (analysis: Pick<KeepaComputedAnalysis, 'insights' | 'promos' | 'stockouts'>) => {
  const { insights, promos, stockouts } = analysis;
  const sentences: string[] = [];
  const peakMonthsText = insights.peakMonths?.length ? formatMonths(insights.peakMonths) : '';

  if (insights.seasonality === 'High') {
    sentences.push(
      peakMonthsText
        ? `Demand is strongly seasonal, with the strongest months in ${peakMonthsText} and slower off-season periods.`
        : 'Demand is strongly seasonal, with clear peak and off-season swings.'
    );
  } else if (insights.seasonality === 'Medium') {
    sentences.push(
      peakMonthsText
        ? `Demand shows some seasonality, peaking in ${peakMonthsText} while staying active the rest of the year.`
        : 'Demand shows some seasonality, with modest peaks and troughs.'
    );
  } else if (insights.seasonality === 'Low') {
    sentences.push(
      peakMonthsText
        ? `Demand is relatively steady, with slightly stronger months in ${peakMonthsText}.`
        : 'Demand is relatively steady throughout the year.'
    );
  } else {
    sentences.push('Demand seasonality is unclear due to limited history.');
  }

  if (insights.pricingBehavior === 'Stable') {
    sentences.push('Pricing is stable overall, so competitors tend to hold price with less frequent repricing.');
  } else if (insights.pricingBehavior === 'Moderate') {
    sentences.push('Pricing is moderately volatile, so expect periodic repricing as competitors react.');
  } else if (insights.pricingBehavior === 'Volatile') {
    sentences.push('Pricing is volatile, with frequent repricing that can pressure margins.');
  } else {
    sentences.push('Pricing behavior is unclear due to limited history.');
  }

  if (promos.hasPromoData && isFiniteNumber(promos.promoFrequencyPct)) {
    let promoSentence =
      insights.discountPressure === 'Low'
        ? 'Discounting is low overall'
        : insights.discountPressure === 'Medium'
        ? 'Discounting is moderate overall'
        : insights.discountPressure === 'High'
        ? 'Discounting is high overall'
        : 'Discounting appears in this market';
    if (isFiniteNumber(promos.avgPromoDropPct)) {
      promoSentence += `, with typical promo depth around ${Math.round(promos.avgPromoDropPct)}%.`;
    } else {
      promoSentence += '.';
    }
    const promoMonths = getTopPromoMonths(promos.promoMonthDistribution);
    if (promoMonths) {
      promoSentence += ` Discounts show up most often in ${promoMonths}.`;
    }
    sentences.push(promoSentence);
  } else {
    sentences.push('Discount history is limited, so promo pressure is unclear.');
  }

  if (insights.rankBehavior === 'Stable') {
    sentences.push('Demand looks steady based on historical BSR swings, which supports consistent inventory planning.');
  } else if (insights.rankBehavior === 'Unstable') {
    sentences.push('Demand is choppy based on historical BSR swings, so plan inventory with buffer around peak months.');
  } else {
    sentences.push('Demand stability is unclear due to limited history.');
  }

  if (stockouts.stockoutPressure === 'None detected') {
    sentences.push('Stockouts were not meaningful in this window, suggesting supply is generally consistent.');
  } else if (stockouts.stockoutPressure === 'Low') {
    sentences.push('Some minor stockouts appear, but supply looks mostly consistent.');
  } else if (stockouts.stockoutPressure === 'Medium') {
    sentences.push('Stockouts show up regularly, which can create opportunities when competitors run out during peak demand.');
  } else if (stockouts.stockoutPressure === 'High') {
    sentences.push('Stockouts are common, which can create opportunities when competitors run out during peak demand.');
  } else {
    sentences.push('Stockout signals are unclear due to limited history.');
  }

  return sentences.filter(Boolean).slice(0, 5).join(' ');
};

const computeCompetitorMetrics = (competitor: NormalizedKeepaCompetitor): KeepaCompetitorMetrics => {
  const monthlySeries = buildMonthlySeries(competitor.series.price, competitor.series.bsr);
  const monthlyPrice = monthlySeries.map(item => item.price).filter(isFiniteNumber);
  const monthlyBsr = monthlySeries.map(item => item.bsr).filter(isFiniteNumber);
  const priceVolatilityPct = averageAbsolutePctChange(monthlyPrice);
  const rankVolatilityPct = coefficientOfVariationPct(monthlyBsr);

  const lightningEvents = buildPromoEventsFromLightning(competitor.series.lightningDeal);
  const promoEvents = lightningEvents.length
    ? lightningEvents
    : buildPromoEventsFromPrice(competitor.series.price);
  const promoStats = computePromoStats(promoEvents, competitor.series.price);
  const oosStats = computeOosStats(competitor.series.buyBoxShipping, competitor.series.countNew);
  const seasonality = calculateSeasonalityCurve(competitor.series.bsr);

  const trend = trendFromBsrSlope(
    aggregateMonthly(competitor.series.bsr).filter(item => isFiniteNumber(item.value)) as Array<{
      month: string;
      value: number;
    }>
  );

  return {
    asin: competitor.asin,
    brand: competitor.brand,
    title: competitor.title,
    priceStabilityPct: isFiniteNumber(priceVolatilityPct)
      ? Math.round(clamp(100 - priceVolatilityPct, 0, 100))
      : null,
    rankStabilityPct: isFiniteNumber(rankVolatilityPct)
      ? Math.round(clamp(100 - rankVolatilityPct, 0, 100))
      : null,
    promoFrequencyPct: promoStats.promoFrequencyPct,
    avgHistoricalPrice: average(monthlyPrice),
    avgHistoricalBsr: average(monthlyBsr),
    peakMonths: seasonality.peakMonths,
    trend,
    monthlySeries,
    promoEvents,
    priceVolatilityPct,
    rankVolatilityPct
  };
};

const pickLargestPriceDrop = (monthlyPrice: Array<{ month: string; value: number }>) => {
  if (monthlyPrice.length < 2) return { pct: null, month: null };
  let maxDropPct = 0;
  let maxDropMonth: string | null = null;
  for (let i = 1; i < monthlyPrice.length; i += 1) {
    const prev = monthlyPrice[i - 1].value;
    const current = monthlyPrice[i].value;
    if (!isFiniteNumber(prev) || !isFiniteNumber(current) || prev === 0) continue;
    const dropPct = ((prev - current) / prev) * 100;
    if (dropPct > maxDropPct) {
      maxDropPct = dropPct;
      maxDropMonth = monthlyPrice[i].month;
    }
  }
  return {
    pct: maxDropPct ? Math.round(maxDropPct * 10) / 10 : null,
    month: maxDropMonth
  };
};

const buildPromoInterpretation = (frequencyPct: number | null, avgDropPct: number | null) => {
  if (!isFiniteNumber(frequencyPct)) return 'Not enough promo data to detect discounts reliably.';
  if (frequencyPct >= 25 && (avgDropPct ?? 0) >= 12) return 'Promotions are frequent and deep.';
  if (frequencyPct >= 15) return 'Promotions show up regularly with moderate depth.';
  if (frequencyPct >= 5) return 'Promotions appear occasionally and are mostly shallow.';
  return 'Promotions are rare and shallow.';
};

const buildSeasonalityTakeaway = (score: number | null, peakMonths: number[] | null, troughMonths: number[] | null) => {
  if (!isFiniteNumber(score) || !peakMonths?.length) return 'Not enough history to identify a clear demand pattern.';
  const peak = formatMonths(peakMonths.slice(0, 2));
  const trough = troughMonths?.length ? formatMonths(troughMonths.slice(0, 2)) : null;
  if (trough) return `Demand tends to peak in ${peak} and soften around ${trough}.`;
  return `Demand tends to peak in ${peak}.`;
};

export const computeKeepaAnalysis = (snapshot: NormalizedKeepaSnapshot): KeepaComputedAnalysis => {
  const competitors = snapshot.competitors.map(competitor => computeCompetitorMetrics(competitor));

  const marketSeries = aggregateMarketSeries(competitors);
  const marketPriceValues = marketSeries.map(item => item.price).filter(isFiniteNumber);
  const marketBsrValues = marketSeries.map(item => item.bsr).filter(isFiniteNumber);
  const priceVolatilityPct = averageAbsolutePctChange(marketPriceValues);
  const rankVolatilityPct = coefficientOfVariationPct(marketBsrValues);

  const allBsrPoints = snapshot.competitors.flatMap(competitor => competitor.series.bsr);
  const seasonality = calculateSeasonalityCurve(allBsrPoints);

  const promoFrequencyValues = competitors
    .map(item => item.promoFrequencyPct)
    .filter(isFiniteNumber);
  const promoFrequencyPct = promoFrequencyValues.length ? average(promoFrequencyValues) : null;
  const avgPromoDropValues = competitors
    .map(item => item.promoEvents)
    .flat()
    .map(event => event.dropPct)
    .filter(isFiniteNumber);
  const avgPromoDropPct = avgPromoDropValues.length ? average(avgPromoDropValues) : null;

  const promoMonthDistribution: Record<string, number> = {};
  competitors.forEach(item => {
    item.promoEvents.forEach(event => {
      const key = monthKeyFromTimestamp(event.start);
      promoMonthDistribution[key] = (promoMonthDistribution[key] ?? 0) + 1;
    });
  });

  const oosValues = snapshot.competitors
    .map(competitor => computeOosStats(competitor.series.buyBoxShipping, competitor.series.countNew).oosTimePct)
    .filter(isFiniteNumber);
  const oosTimePct = oosValues.length ? average(oosValues) : null;

  const oosEventCounts = snapshot.competitors
    .map(competitor => computeOosStats(competitor.series.buyBoxShipping, competitor.series.countNew).oosEventCount)
    .filter(isFiniteNumber);
  const oosEventCount = oosEventCounts.length ? Math.round(average(oosEventCounts) as number) : null;

  const typicalPriceRange = {
    min:
      marketPriceValues.length >= 6
        ? percentile(marketPriceValues, 0.05)
        : marketPriceValues.length
        ? Math.min(...marketPriceValues)
        : null,
    max:
      marketPriceValues.length >= 6
        ? percentile(marketPriceValues, 0.95)
        : marketPriceValues.length
        ? Math.max(...marketPriceValues)
        : null
  };

  const largestPriceDrop = pickLargestPriceDrop(
    marketSeries
      .map(item => ({ month: item.month, value: item.price }))
      .filter((item): item is { month: string; value: number } => isFiniteNumber(item.value))
  );

  const pricingBehavior = categoryFromVolatility(priceVolatilityPct);
  const discountPressure = discountPressureFromFrequency(promoFrequencyPct);
  const rankBehavior = rankBehaviorFromVolatility(rankVolatilityPct);
  const stockoutPressure = stockoutPressureFromOos(oosTimePct);
  const seasonalityPressure: PressureLevel =
    isFiniteNumber(seasonality.score) ? (seasonality.score >= 60 ? 'High' : seasonality.score >= 30 ? 'Medium' : 'Low') : 'Unknown';

  const insights = {
    seasonality: seasonalityPressure,
    seasonalityScore: isFiniteNumber(seasonality.score) ? Math.round(seasonality.score) : null,
    peakMonths: seasonality.peakMonths,
    pricingBehavior,
    priceVolatilityPct: isFiniteNumber(priceVolatilityPct) ? Math.round(priceVolatilityPct * 10) / 10 : null,
    discountPressure,
    promoFrequencyPct: isFiniteNumber(promoFrequencyPct) ? Math.round(promoFrequencyPct * 10) / 10 : null,
    avgPromoDropPct: isFiniteNumber(avgPromoDropPct) ? Math.round(avgPromoDropPct * 10) / 10 : null,
    rankBehavior,
    rankVolatilityPct: isFiniteNumber(rankVolatilityPct) ? Math.round(rankVolatilityPct * 10) / 10 : null,
    stockoutPressure,
    oosTimePct: isFiniteNumber(oosTimePct) ? Math.round(oosTimePct * 10) / 10 : null,
    marketStoryText: ''
  };

  const promoSummary = {
    promoFrequencyPct: isFiniteNumber(promoFrequencyPct) ? Math.round(promoFrequencyPct * 10) / 10 : null,
    avgPromoDropPct: isFiniteNumber(avgPromoDropPct) ? Math.round(avgPromoDropPct * 10) / 10 : null,
    promoMonthDistribution,
    interpretation: buildPromoInterpretation(promoFrequencyPct, avgPromoDropPct),
    hasPromoData: promoFrequencyValues.length > 0
  };

  const stockoutSummary = {
    oosTimePct: isFiniteNumber(oosTimePct) ? Math.round(oosTimePct * 10) / 10 : null,
    oosEventCount: isFiniteNumber(oosEventCount) ? oosEventCount : null,
    stockoutPressure,
    hasMeaningfulStockouts: stockoutPressure !== 'None detected' && stockoutPressure !== 'Unknown'
  };

  insights.marketStoryText = buildMarketStory({ insights, promos: promoSummary, stockouts: stockoutSummary });

  return {
    windowMonths: snapshot.windowMonths,
    insights,
    trends: {
      marketSeries,
      promoEvents: competitors.flatMap(item => item.promoEvents),
      typicalPriceRange: {
        min: isFiniteNumber(typicalPriceRange.min) ? Math.round((typicalPriceRange.min as number) * 100) / 100 : null,
        max: isFiniteNumber(typicalPriceRange.max) ? Math.round((typicalPriceRange.max as number) * 100) / 100 : null
      },
      largestPriceDrop,
      rankVolatilityCategory: rankBehavior
    },
    seasonality: {
      curve: seasonality.curve,
      peakMonths: seasonality.peakMonths,
      troughMonths: seasonality.troughMonths,
      score: isFiniteNumber(seasonality.score) ? Math.round(seasonality.score) : null,
      takeaway: buildSeasonalityTakeaway(
        isFiniteNumber(seasonality.score) ? seasonality.score : null,
        seasonality.peakMonths,
        seasonality.troughMonths
      )
    },
    promos: promoSummary,
    stockouts: stockoutSummary,
    competitors
  };
};
