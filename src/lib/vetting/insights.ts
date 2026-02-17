export type FlagSeverity = 'green' | 'red' | 'yellow';

export type MarketFlag = {
  id: string;
  severity: FlagSeverity;
  title: string;
  description: string;
  metrics?: Record<string, number | string>;
  relatedAsins?: string[];
};

export type ScoreDelta = {
  prevScore: number;
  nextScore: number;
  drivers: Array<{
    id: string;
    label: string;
    direction: 'up' | 'down';
    magnitude?: number;
  }>;
};

export type RemovalReason =
  | 'LOW_REVENUE_FOR_AGE'
  | 'LOW_REVIEWS_FOR_AGE'
  | 'LOW_RATING'
  | 'FBM_ONLY'
  | 'OVERPRICED_OUTLIER'
  | 'LIKELY_NOT_TRUE_COMPETITOR';

export type SuggestedRemoval = {
  asin: string;
  brand?: string;
  title?: string;
  monthlyRevenue?: number;
  price?: number;
  reviews?: number;
  rating?: number;
  ageMonths?: number;
  fulfillment?: 'FBA' | 'FBM' | 'AMZ' | 'UNKNOWN';
  reasons: Array<{
    code: RemovalReason;
    label: string;
    detail?: string;
    confidence: 'low' | 'med' | 'high';
  }>;
  confidence: 'low' | 'med' | 'high';
};

export type CompetitorRowInsight = {
  asin: string;
  tags: Array<{
    type: 'removal_candidate' | 'very_weak' | 'fbm_weak' | 'overpriced_low_sales' | 'duplicate_variation';
    label: string;
    detail?: string;
    severity: 'info' | 'warning' | 'danger';
  }>;
  highlight?: {
    ringClass: string;
    accentClass: string;
  };
  duplicateInfo?: {
    recommendedRemovalAsin: string;
  };
};

export type VettingInsights = {
  computedAt: number;
  totals: {
    competitorCount: number;
    marketCap?: number;
    revenuePerCompetitor?: number;
  };
  concentration: {
    top1Share?: number;
    top3Share?: number;
    top5Share?: number;
  };
  distributions?: {
    price?: { min: number; max: number; median?: number; q1?: number; q3?: number };
    revenue?: { min: number; max: number; median?: number; q1?: number; q3?: number };
    reviews?: { min: number; max: number; median?: number; q1?: number; q3?: number };
    ageMonths?: { min: number; max: number; median?: number; q1?: number; q3?: number };
  };
  flags: {
    red: MarketFlag[];
    green: MarketFlag[];
    yellow?: MarketFlag[];
  };
  suggestedRemovals: SuggestedRemoval[];
  rowInsightsByAsin: Record<string, CompetitorRowInsight>;
};

type CompetitorLike = {
  asin?: string;
  monthlyRevenue?: number | string;
  monthlySales?: number | string;
  price?: number | string;
  reviews?: number | string;
  rating?: number | string;
  dateFirstAvailable?: string;
  ageDays?: number | string;
  age?: number | string;
  ageMonths?: number | string;
  brand?: string;
  title?: string;
  fulfillment?: string;
  fulfillmentMethod?: string;
  fulfilledBy?: string;
  marketShare?: number | string;
  [key: string]: any;
};

type Snapshot = {
  competitors: CompetitorLike[];
  removedAsins?: Set<string> | string[];
  score?: number;
};

const thresholdLabelMap = {
  competitorCountHigh: { value: 25, label: 'Heavy competition' },
  revenuePerCompetitorLow: { value: 3000, label: 'Low revenue per competitor' },
  marketCapLow: { value: 50000, label: 'Small market cap' },
  concentrationHigh: { value: 0.6, label: 'High revenue concentration' },
  leaderReviewMoat: { minTopReviews: 5000, multiple: 4, label: 'Review moat leader' },
  lowReviewMoat: { value: 300, label: 'Low review moat' },
  revenuePerCompetitorHealthy: { value: 8000, label: 'Healthy revenue per competitor' },
  concentrationLow: { value: 0.45, label: 'Low concentration' },
  removal: {
    launchDays: 60,
    weakRevenueThreshold: 1000,
    fbmRevenueMax: 2000,
    overpricedRevenueMax: 2000,
    reviewVelocityPoorDivisor: 20,
    ratingVisualPoorMax: 4.15,
    outlierIqrMultiplier: 1.5,
    labels: {
      LOW_REVENUE_FOR_AGE: 'Low revenue',
      LOW_REVIEWS_FOR_AGE: 'Low traction',
      LOW_RATING: 'Looks like 4★',
      FBM_ONLY: 'FBM weak',
      OVERPRICED_OUTLIER: 'Overpriced + low sales',
      LIKELY_NOT_TRUE_COMPETITOR: 'Likely not competitor'
    }
  }
} as const;

const toArraySet = (input?: Set<string> | string[]) => {
  if (!input) return new Set<string>();
  if (input instanceof Set) return new Set([...input]);
  return new Set(input.filter(Boolean));
};

const safeNumber = (value: number | string | undefined | null): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseNumber = (value: number | string | undefined | null): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getAgeMonths = (competitor: CompetitorLike): number | undefined => {
  const direct = safeNumber(competitor.ageMonths ?? competitor.age);
  if (direct > 0) return direct;
  if (!competitor.dateFirstAvailable) return undefined;
  const date = new Date(competitor.dateFirstAvailable);
  if (Number.isNaN(date.getTime())) return undefined;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const months = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
  return Number.isFinite(months) ? months : undefined;
};

const getDaysOnMarket = (competitor: CompetitorLike): number | undefined => {
  const directDays = parseNumber(competitor.ageDays);
  if (directDays !== undefined && directDays > 0) return Math.ceil(directDays);
  if (competitor.dateFirstAvailable) {
    const date = new Date(competitor.dateFirstAvailable);
    if (!Number.isNaN(date.getTime())) {
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Number.isFinite(days) ? days : undefined;
    }
  }
  const ageMonths = parseNumber(competitor.ageMonths ?? competitor.age);
  if (ageMonths !== undefined && ageMonths > 0) return Math.ceil(ageMonths * 30);
  return undefined;
};

const normalizeFulfillment = (competitor: CompetitorLike): 'FBA' | 'FBM' | 'AMZ' | 'UNKNOWN' => {
  const raw = `${competitor.fulfillment || competitor.fulfillmentMethod || competitor.fulfilledBy || ''}`.toUpperCase();
  if (!raw) return 'UNKNOWN';
  if (raw.includes('AMAZON') || raw.includes('AMZ')) return 'AMZ';
  if (raw.includes('FBA')) return 'FBA';
  if (raw.includes('FBM')) return 'FBM';
  return 'UNKNOWN';
};

const normalizeBrand = (brand?: string) => {
  if (!brand) return '';
  return brand.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const findParentRevenueKey = (competitors: CompetitorLike[]) => {
  for (const competitor of competitors) {
    for (const key of Object.keys(competitor || {})) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized.includes('parent') && normalized.includes('revenue')) {
        return key;
      }
    }
  }
  return undefined;
};

const findParentIdentifierKey = (competitors: CompetitorLike[]) => {
  for (const competitor of competitors) {
    for (const key of Object.keys(competitor || {})) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!normalized.includes('parent')) continue;
      if (
        normalized.includes('asin') ||
        normalized.includes('id') ||
        normalized.includes('sku') ||
        normalized.includes('listing')
      ) {
        return key;
      }
    }
  }
  return undefined;
};

const isApproxMatch = (a: number, b: number, tolerance = 0.1) => {
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
};

type RemovalSignals = {
  asin: string;
  monthlyRevenue?: number;
  reviewCount?: number;
  rating?: number;
  price?: number;
  fulfillment: 'FBA' | 'FBM' | 'AMZ' | 'UNKNOWN';
  ageMonths?: number;
  daysOnMarket?: number;
  isLaunchPeriod: boolean;
  daysPerReview?: number;
  lowRevenueAfterLaunch: boolean;
  lowRevenueLongTenure: boolean;
  reviewVelocityPoor: boolean;
  reviewVelocityHealthy: boolean;
  ratingWeak: boolean;
  fbmWeak: boolean;
  overpricedLowSales: boolean;
};

const getRemovalSignals = (
  competitor: CompetitorLike,
  priceOutlierCutoff?: number
): RemovalSignals | undefined => {
  const asin = competitor.asin?.trim();
  if (!asin) return undefined;

  const ageMonths = getAgeMonths(competitor);
  const daysOnMarket = getDaysOnMarket(competitor);
  const isLaunchPeriod =
    daysOnMarket !== undefined
      ? daysOnMarket < thresholdLabelMap.removal.launchDays
      : ageMonths !== undefined
        ? ageMonths < 2
        : false;
  const monthlyRevenue = parseNumber(competitor.monthlyRevenue);
  const reviewCount = parseNumber(competitor.reviews);
  const rating = parseNumber(competitor.rating);
  const price = parseNumber(competitor.price);
  const fulfillment = normalizeFulfillment(competitor);

  const daysPerReview =
    daysOnMarket !== undefined
      ? daysOnMarket / Math.max(reviewCount ?? 0, 1)
      : undefined;
  const reviewVelocityPoor = !isLaunchPeriod && daysPerReview !== undefined && daysPerReview > thresholdLabelMap.removal.reviewVelocityPoorDivisor;
  const reviewVelocityHealthy = daysPerReview !== undefined && daysPerReview <= 10;
  const hasReviewSignal = (reviewCount !== undefined && reviewCount >= 20) || reviewVelocityPoor || reviewVelocityHealthy;

  const lowRevenueAfterLaunch =
    !isLaunchPeriod &&
    monthlyRevenue !== undefined &&
    monthlyRevenue < thresholdLabelMap.removal.weakRevenueThreshold;
  const lowRevenueLongTenure =
    lowRevenueAfterLaunch &&
    ((daysOnMarket !== undefined && daysOnMarket >= 180) || (ageMonths !== undefined && ageMonths >= 6));

  const ratingWeak =
    rating !== undefined &&
    rating < thresholdLabelMap.removal.ratingVisualPoorMax &&
    hasReviewSignal;

  const fbmWeak =
    fulfillment === 'FBM' &&
    monthlyRevenue !== undefined &&
    monthlyRevenue < thresholdLabelMap.removal.fbmRevenueMax;

  const overpricedLowSales =
    priceOutlierCutoff !== undefined &&
    price !== undefined &&
    price > priceOutlierCutoff &&
    monthlyRevenue !== undefined &&
    monthlyRevenue < thresholdLabelMap.removal.overpricedRevenueMax;

  return {
    asin,
    monthlyRevenue,
    reviewCount,
    rating,
    price,
    fulfillment,
    ageMonths,
    daysOnMarket,
    isLaunchPeriod,
    daysPerReview,
    lowRevenueAfterLaunch,
    lowRevenueLongTenure,
    reviewVelocityPoor,
    reviewVelocityHealthy,
    ratingWeak,
    fbmWeak,
    overpricedLowSales
  };
};

const quantiles = (values: number[]) => {
  if (!values.length) return { min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const getQuantile = (q: number) => {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };
  return {
    min,
    max,
    q1: getQuantile(0.25),
    median: getQuantile(0.5),
    q3: getQuantile(0.75)
  };
};

const topNShare = (values: number[], n: number) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  const topSum = [...values].sort((a, b) => b - a).slice(0, n).reduce((sum, value) => sum + value, 0);
  return topSum / total;
};

const computeDrivers = (prev: Snapshot | undefined, next: VettingInsights) => {
  if (!prev) return [];
  const removedSet = toArraySet(prev.removedAsins);
  const prevCompetitors = prev.competitors.filter((comp) => !removedSet.has(comp.asin || ''));
  const prevRevenue = prevCompetitors.map((comp) => safeNumber(comp.monthlyRevenue)).filter((v) => v > 0);
  const prevMarketCap = prevRevenue.reduce((sum, value) => sum + value, 0);
  const prevRevenuePerCompetitor = prevCompetitors.length ? prevMarketCap / prevCompetitors.length : 0;
  const prevTop3Share = topNShare(prevRevenue, 3);

  const drivers: ScoreDelta['drivers'] = [];
  if (prevCompetitors.length !== next.totals.competitorCount) {
    const delta = next.totals.competitorCount - prevCompetitors.length;
    drivers.push({
      id: 'competitor_count_change',
      label: `Competitor count ${delta < 0 ? 'down' : 'up'}`,
      direction: delta < 0 ? 'up' : 'down',
      magnitude: Math.abs(delta)
    });
  }
  if (Number.isFinite(prevTop3Share) && Number.isFinite(next.concentration.top3Share ?? 0)) {
    const delta = (next.concentration.top3Share ?? 0) - prevTop3Share;
    if (Math.abs(delta) > 0.01) {
      drivers.push({
        id: 'top3_share_change',
        label: `Top 3 share ${delta < 0 ? 'down' : 'up'}`,
        direction: delta < 0 ? 'up' : 'down',
        magnitude: Math.abs(delta)
      });
    }
  }
  if (Number.isFinite(prevRevenuePerCompetitor) && Number.isFinite(next.totals.revenuePerCompetitor ?? 0)) {
    const delta = (next.totals.revenuePerCompetitor ?? 0) - prevRevenuePerCompetitor;
    if (Math.abs(delta) > 1) {
      drivers.push({
        id: 'revenue_per_competitor_change',
        label: `Revenue per competitor ${delta < 0 ? 'down' : 'up'}`,
        direction: delta < 0 ? 'down' : 'up',
        magnitude: Math.abs(delta)
      });
    }
  }

  return drivers;
};

const confidenceRank = { low: 1, med: 2, high: 3 } as const;

const computeSuggestedRemovals = (params: { competitors: CompetitorLike[] }) => {
  const { competitors } = params;
  const prices = competitors.map((comp) => parseNumber(comp.price)).filter((v): v is number => typeof v === 'number' && v > 0);

  const priceStats = prices.length ? quantiles(prices) : undefined;
  const priceOutlierCutoff =
    priceStats?.q1 !== undefined && priceStats?.q3 !== undefined
      ? priceStats.q3 + (priceStats.q3 - priceStats.q1) * thresholdLabelMap.removal.outlierIqrMultiplier
      : undefined;

  const results: SuggestedRemoval[] = [];
  for (const competitor of competitors) {
    const signals = getRemovalSignals(competitor, priceOutlierCutoff);
    if (!signals) continue;

    const reasons: SuggestedRemoval['reasons'] = [];
    const {
      asin,
      monthlyRevenue,
      reviewCount,
      rating,
      fulfillment,
      ageMonths,
      daysOnMarket,
      daysPerReview,
      lowRevenueAfterLaunch,
      lowRevenueLongTenure,
      reviewVelocityPoor,
      ratingWeak,
      fbmWeak,
      overpricedLowSales
    } = signals;

    if (lowRevenueAfterLaunch) {
      const ageDetail =
        daysOnMarket !== undefined
          ? `${daysOnMarket} days`
          : ageMonths !== undefined
            ? `${Math.ceil(ageMonths)} months`
            : 'post-launch';
      reasons.push({
        code: 'LOW_REVENUE_FOR_AGE',
        label: thresholdLabelMap.removal.labels.LOW_REVENUE_FOR_AGE,
        detail: `Low revenue after ${ageDetail} on market.`,
        confidence: monthlyRevenue !== undefined && (monthlyRevenue < 500 || lowRevenueLongTenure) ? 'high' : 'med'
      });
    }

    if (reviewVelocityPoor) {
      const velocityDetail =
        daysPerReview !== undefined
          ? `~1 review every ${daysPerReview.toFixed(1)} days`
          : 'Slow review velocity';
      reasons.push({
        code: 'LOW_REVIEWS_FOR_AGE',
        label: thresholdLabelMap.removal.labels.LOW_REVIEWS_FOR_AGE,
        detail: `${velocityDetail}${daysOnMarket !== undefined ? ` after ${daysOnMarket} days` : ''}.`,
        confidence: daysPerReview !== undefined && daysPerReview > 40 ? 'high' : 'med'
      });
    }

    if (ratingWeak) {
      const reviewDetail = reviewCount !== undefined ? ` with ${Math.round(reviewCount)} reviews` : '';
      reasons.push({
        code: 'LOW_RATING',
        label: thresholdLabelMap.removal.labels.LOW_RATING,
        detail: `Rating ${rating?.toFixed(2)}${reviewDetail}.`,
        confidence: reviewCount !== undefined && reviewCount >= 50 ? 'high' : 'med'
      });
    }

    if (fbmWeak) {
      reasons.push({
        code: 'FBM_ONLY',
        label: thresholdLabelMap.removal.labels.FBM_ONLY,
        detail: 'FBM fulfillment with under $2k/mo revenue.',
        confidence: 'med'
      });
    }

    if (overpricedLowSales) {
      reasons.push({
        code: 'OVERPRICED_OUTLIER',
        label: thresholdLabelMap.removal.labels.OVERPRICED_OUTLIER,
        detail: 'Price is a high outlier while revenue stays low.',
        confidence: 'med'
      });
    }

    const baseWeakness = lowRevenueAfterLaunch || fbmWeak || overpricedLowSales;
    const shouldSuggest = baseWeakness || (reviewVelocityPoor && ratingWeak);
    if (!shouldSuggest) continue;

    const reasonCodes = new Set(reasons.map((reason) => reason.code));
    if (
      (reasonCodes.has('LOW_REVENUE_FOR_AGE') &&
        (reasonCodes.has('LOW_REVIEWS_FOR_AGE') ||
          reasonCodes.has('LOW_RATING') ||
          reasonCodes.has('FBM_ONLY') ||
          reasonCodes.has('OVERPRICED_OUTLIER'))) ||
      reasons.length >= 3
    ) {
      reasons.push({
        code: 'LIKELY_NOT_TRUE_COMPETITOR',
        label: thresholdLabelMap.removal.labels.LIKELY_NOT_TRUE_COMPETITOR,
        detail: 'Multiple weak signals suggest a non-competitive listing.',
        confidence: 'high'
      });
    }

    if (!reasons.length) continue;

    const overallConfidence = reasons.reduce<'low' | 'med' | 'high'>((current, reason) => {
      return confidenceRank[reason.confidence] > confidenceRank[current] ? reason.confidence : current;
    }, 'low');
    const confidence =
      reasons.length >= 3 && overallConfidence === 'med'
        ? 'high'
        : reasons.length >= 2 && overallConfidence === 'low'
          ? 'med'
          : overallConfidence;

    results.push({
      asin,
      brand: competitor.brand,
      title: competitor.title,
      monthlyRevenue: monthlyRevenue ?? undefined,
      price: signals.price ?? undefined,
      reviews: reviewCount ?? undefined,
      rating: rating ?? undefined,
      ageMonths: ageMonths ?? undefined,
      fulfillment,
      reasons,
      confidence
    });
  }

  return results
    .sort((a, b) => {
      const confidenceDiff = confidenceRank[b.confidence] - confidenceRank[a.confidence];
      if (confidenceDiff !== 0) return confidenceDiff;
      const reasonDiff = b.reasons.length - a.reasons.length;
      if (reasonDiff !== 0) return reasonDiff;
      const aRevenue = a.monthlyRevenue ?? Number.POSITIVE_INFINITY;
      const bRevenue = b.monthlyRevenue ?? Number.POSITIVE_INFINITY;
      return aRevenue - bRevenue;
    })
    .slice(0, 8);
};

const computeDuplicateVariations = (competitors: CompetitorLike[]) => {
  const parentRevenueKey = findParentRevenueKey(competitors);
  const parentIdentifierKey = parentRevenueKey ? undefined : findParentIdentifierKey(competitors);
  if (!parentRevenueKey && !parentIdentifierKey) {
    return { duplicateByAsin: {} as Record<string, { recommendedRemovalAsin: string }> };
  }

  const duplicateByAsin: Record<string, { recommendedRemovalAsin: string }> = {};

  if (parentRevenueKey) {
    const groupedByBrand = new Map<string, Array<{ competitor: CompetitorLike; parentRevenue: number }>>();
    for (const competitor of competitors) {
      const brandKey = normalizeBrand(competitor.brand);
      if (!brandKey) continue;
      const parentRevenue = parseNumber(competitor[parentRevenueKey]);
      if (parentRevenue === undefined || parentRevenue <= 0) continue;
      const entry = groupedByBrand.get(brandKey) ?? [];
      entry.push({ competitor, parentRevenue });
      groupedByBrand.set(brandKey, entry);
    }

    groupedByBrand.forEach((entries) => {
      const sorted = [...entries].sort((a, b) => a.parentRevenue - b.parentRevenue);
      let cluster: typeof entries = [];

      const flushCluster = () => {
        if (cluster.length < 2) {
          cluster = [];
          return;
        }
        let lowestRevenueAsin = cluster[0].competitor.asin || '';
        let lowestRevenue = Number.POSITIVE_INFINITY;
        cluster.forEach(({ competitor }) => {
          const revenue = parseNumber(competitor.monthlyRevenue);
          if (revenue !== undefined && revenue < lowestRevenue) {
            lowestRevenue = revenue;
            lowestRevenueAsin = competitor.asin || lowestRevenueAsin;
          }
        });
        if (!lowestRevenueAsin) {
          lowestRevenueAsin = cluster[0].competitor.asin || '';
        }
        cluster.forEach(({ competitor }) => {
          if (!competitor.asin) return;
          duplicateByAsin[competitor.asin] = {
            recommendedRemovalAsin: lowestRevenueAsin
          };
        });
        cluster = [];
      };

      for (const entry of sorted) {
        if (!cluster.length) {
          cluster.push(entry);
          continue;
        }
        const clusterBase = cluster[0].parentRevenue;
        if (isApproxMatch(clusterBase, entry.parentRevenue, 0.1)) {
          cluster.push(entry);
        } else {
          flushCluster();
          cluster.push(entry);
        }
      }
      flushCluster();
    });
  } else if (parentIdentifierKey) {
    const groupedByParent = new Map<string, CompetitorLike[]>();
    for (const competitor of competitors) {
      const brandKey = normalizeBrand(competitor.brand);
      if (!brandKey) continue;
      const parentIdentifier = competitor[parentIdentifierKey];
      if (!parentIdentifier) continue;
      const groupKey = `${brandKey}::${String(parentIdentifier).toLowerCase()}`;
      const entry = groupedByParent.get(groupKey) ?? [];
      entry.push(competitor);
      groupedByParent.set(groupKey, entry);
    }

    groupedByParent.forEach((entries) => {
      if (entries.length < 2) return;
      let lowestRevenueAsin = entries[0]?.asin || '';
      let lowestRevenue = Number.POSITIVE_INFINITY;
      entries.forEach((competitor) => {
        const revenue = parseNumber(competitor.monthlyRevenue);
        if (revenue !== undefined && revenue < lowestRevenue) {
          lowestRevenue = revenue;
          lowestRevenueAsin = competitor.asin || lowestRevenueAsin;
        }
      });
      if (!lowestRevenueAsin) {
        lowestRevenueAsin = entries[0]?.asin || '';
      }
      entries.forEach((competitor) => {
        if (!competitor.asin) return;
        duplicateByAsin[competitor.asin] = {
          recommendedRemovalAsin: lowestRevenueAsin
        };
      });
    });
  }

  return { duplicateByAsin };
};

const buildRowInsights = (params: {
  competitors: CompetitorLike[];
  suggestedRemovals: SuggestedRemoval[];
  priceOutlierCutoff?: number;
}) => {
  const { competitors, suggestedRemovals, priceOutlierCutoff } = params;
  const suggestedByAsin = new Map(suggestedRemovals.map((item) => [item.asin, item]));
  const { duplicateByAsin } = computeDuplicateVariations(competitors);
  const rowInsightsByAsin: Record<string, CompetitorRowInsight> = {};

  competitors.forEach((competitor) => {
    const signals = getRemovalSignals(competitor, priceOutlierCutoff);
    if (!signals) return;
    const suggested = suggestedByAsin.get(signals.asin);
    const duplicateInfo = duplicateByAsin[signals.asin];
    const tags: CompetitorRowInsight['tags'] = [];

    if (duplicateInfo) {
      tags.push({
        type: 'duplicate_variation',
        label: 'Duplicate variation?',
        detail:
          'Possible child variation of the same parent listing. Consider removing the weaker child ASIN.',
        severity: 'warning'
      });
    }

    if (suggested || duplicateInfo?.recommendedRemovalAsin === signals.asin) {
      const topReason = suggested?.reasons?.[0];
      const confidence = suggested?.confidence ?? 'med';
      tags.push({
        type: 'removal_candidate',
        label: 'Removal candidate',
        detail: topReason?.detail || topReason?.label,
        severity: confidence === 'high' ? 'danger' : 'warning'
      });
    }

    if (signals.lowRevenueAfterLaunch) {
      tags.push({
        type: 'very_weak',
        label: 'Very weak',
        detail: 'Low revenue after launch window.',
        severity: 'danger'
      });
    }

    if (signals.fbmWeak) {
      tags.push({
        type: 'fbm_weak',
        label: 'FBM weak',
        detail: 'FBM fulfillment under $2k/mo revenue.',
        severity: 'warning'
      });
    }

    if (signals.overpricedLowSales) {
      tags.push({
        type: 'overpriced_low_sales',
        label: 'Overpriced + low sales',
        detail: 'High price outlier with low revenue.',
        severity: 'warning'
      });
    }

    if (!tags.length) return;

    const highlight =
      tags.find((tag) => tag.type === 'removal_candidate')
        ? {
            ringClass: 'hover:ring-1 hover:ring-red-400/30',
            accentClass: 'border-l-2 border-red-500/70 bg-red-500/10'
          }
        : tags.find((tag) => tag.type === 'very_weak')
          ? {
              ringClass: 'hover:ring-1 hover:ring-red-400/20',
              accentClass: 'border-l-2 border-red-500/40 bg-red-500/5'
            }
          : tags.find((tag) => tag.type === 'duplicate_variation')
            ? {
                ringClass: 'hover:ring-1 hover:ring-violet-400/20',
                accentClass: 'border-l-2 border-violet-500/50 bg-violet-500/5'
              }
            : tags.find((tag) => tag.type === 'fbm_weak' || tag.type === 'overpriced_low_sales')
              ? {
                  ringClass: 'hover:ring-1 hover:ring-amber-400/20',
                  accentClass: 'border-l-2 border-amber-500/50 bg-amber-500/5'
                }
              : undefined;

    rowInsightsByAsin[signals.asin] = {
      asin: signals.asin,
      tags: tags.slice(0, 3),
      highlight,
      duplicateInfo: duplicateInfo ? { recommendedRemovalAsin: duplicateInfo.recommendedRemovalAsin } : undefined
    };
  });

  return rowInsightsByAsin;
};

export function getVettingInsights(params: {
  competitors: CompetitorLike[];
  removedAsins?: Set<string> | string[];
  prevSnapshot?: Snapshot;
  currentScore?: number;
  prevScore?: number;
}): { insights: VettingInsights; scoreDelta?: ScoreDelta } {
  const { competitors, removedAsins, prevSnapshot, currentScore, prevScore } = params;
  const removedSet = toArraySet(removedAsins);
  const filtered = competitors.filter((comp) => !removedSet.has(comp.asin || ''));

  const revenues = filtered.map((comp) => safeNumber(comp.monthlyRevenue)).filter((v) => v > 0);
  const prices = filtered.map((comp) => safeNumber(comp.price)).filter((v) => v > 0);
  const reviews = filtered.map((comp) => safeNumber(comp.reviews)).filter((v) => v > 0);
  const ages = filtered.map((comp) => getAgeMonths(comp)).filter((v): v is number => typeof v === 'number' && v > 0);

  const marketCap = revenues.reduce((sum, value) => sum + value, 0);
  const revenuePerCompetitor = filtered.length ? marketCap / filtered.length : 0;

  const concentration = {
    top1Share: revenues.length ? topNShare(revenues, 1) : 0,
    top3Share: revenues.length ? topNShare(revenues, 3) : 0,
    top5Share: revenues.length ? topNShare(revenues, 5) : 0
  };

  const distributions = {
    price: prices.length ? quantiles(prices) : undefined,
    revenue: revenues.length ? quantiles(revenues) : undefined,
    reviews: reviews.length ? quantiles(reviews) : undefined,
    ageMonths: ages.length ? quantiles(ages) : undefined
  };

  const sortedByRevenue = [...filtered].sort(
    (a, b) => safeNumber(b.monthlyRevenue) - safeNumber(a.monthlyRevenue)
  );
  const topRevenueAsins = sortedByRevenue.slice(0, 5).map((comp) => comp.asin).filter(Boolean) as string[];

  const avgTop5Reviews = sortedByRevenue
    .slice(0, 5)
    .reduce((sum, comp) => sum + safeNumber(comp.reviews), 0) / Math.max(sortedByRevenue.slice(0, 5).length, 1);

  const topReviewCompetitor = [...filtered].sort(
    (a, b) => safeNumber(b.reviews) - safeNumber(a.reviews)
  )[0];
  const topReviewCount = safeNumber(topReviewCompetitor?.reviews);
  const medianReview = distributions.reviews?.median ?? 0;

  const redCandidates: Array<MarketFlag & { score: number }> = [];
  if (filtered.length > thresholdLabelMap.competitorCountHigh.value) {
    redCandidates.push({
      id: 'high_competitor_count',
      severity: 'red',
      title: thresholdLabelMap.competitorCountHigh.label,
      description: `Competitor count is high (${filtered.length}).`,
      metrics: { competitorCount: filtered.length },
      score: filtered.length
    });
  }
  if (revenuePerCompetitor > 0 && revenuePerCompetitor < thresholdLabelMap.revenuePerCompetitorLow.value) {
    redCandidates.push({
      id: 'low_rev_per_competitor',
      severity: 'red',
      title: thresholdLabelMap.revenuePerCompetitorLow.label,
      description: `Revenue per competitor is low (~$${Math.round(revenuePerCompetitor).toLocaleString()}).`,
      metrics: { revenuePerCompetitor: Math.round(revenuePerCompetitor) },
      score: (thresholdLabelMap.revenuePerCompetitorLow.value - revenuePerCompetitor) / thresholdLabelMap.revenuePerCompetitorLow.value
    });
  }
  if (marketCap > 0 && marketCap < thresholdLabelMap.marketCapLow.value) {
    redCandidates.push({
      id: 'low_market_cap',
      severity: 'red',
      title: thresholdLabelMap.marketCapLow.label,
      description: `Market cap is under $${Math.round(thresholdLabelMap.marketCapLow.value / 1000)}k (~$${Math.round(marketCap).toLocaleString()}).`,
      metrics: { marketCap: Math.round(marketCap) },
      score: (thresholdLabelMap.marketCapLow.value - marketCap) / thresholdLabelMap.marketCapLow.value
    });
  }
  if ((concentration.top3Share ?? 0) > thresholdLabelMap.concentrationHigh.value) {
    redCandidates.push({
      id: 'high_concentration',
      severity: 'red',
      title: thresholdLabelMap.concentrationHigh.label,
      description: `Top 3 competitors control ${(concentration.top3Share ?? 0) * 100 > 0
        ? Math.round((concentration.top3Share ?? 0) * 100)
        : 0}% of revenue.`,
      metrics: { top3Share: concentration.top3Share ?? 0 },
      relatedAsins: topRevenueAsins.slice(0, 3),
      score: concentration.top3Share ?? 0
    });
  }
  if (
    topReviewCount > thresholdLabelMap.leaderReviewMoat.minTopReviews &&
    medianReview > 0 &&
    topReviewCount / medianReview > thresholdLabelMap.leaderReviewMoat.multiple
  ) {
    redCandidates.push({
      id: 'leader_review_moat',
      severity: 'red',
      title: thresholdLabelMap.leaderReviewMoat.label,
      description: 'Top listing has an outsized review count compared to the median.',
      metrics: { topReviews: topReviewCount, medianReviews: Math.round(medianReview) },
      relatedAsins: topReviewCompetitor?.asin ? [topReviewCompetitor.asin] : undefined,
      score: topReviewCount / Math.max(medianReview, 1)
    });
  }

  const greenCandidates: Array<MarketFlag & { score: number }> = [];
  if (avgTop5Reviews > 0 && avgTop5Reviews < thresholdLabelMap.lowReviewMoat.value) {
    greenCandidates.push({
      id: 'low_review_moat',
      severity: 'green',
      title: thresholdLabelMap.lowReviewMoat.label,
      description: `Top competitors average fewer than ${thresholdLabelMap.lowReviewMoat.value} reviews (~${Math.round(avgTop5Reviews)}).`,
      metrics: { avgTop5Reviews: Math.round(avgTop5Reviews) },
      relatedAsins: topRevenueAsins.slice(0, 5),
      score: (thresholdLabelMap.lowReviewMoat.value - avgTop5Reviews) / thresholdLabelMap.lowReviewMoat.value
    });
  }
  if (revenuePerCompetitor >= thresholdLabelMap.revenuePerCompetitorHealthy.value) {
    greenCandidates.push({
      id: 'healthy_rev_per_competitor',
      severity: 'green',
      title: thresholdLabelMap.revenuePerCompetitorHealthy.label,
      description: `Revenue per competitor is strong (~$${Math.round(revenuePerCompetitor).toLocaleString()}).`,
      metrics: { revenuePerCompetitor: Math.round(revenuePerCompetitor) },
      score: revenuePerCompetitor
    });
  }
  if ((concentration.top3Share ?? 0) > 0 && (concentration.top3Share ?? 0) < thresholdLabelMap.concentrationLow.value) {
    greenCandidates.push({
      id: 'low_concentration',
      severity: 'green',
      title: thresholdLabelMap.concentrationLow.label,
      description: `Top 3 competitors control under 45% of revenue.`,
      metrics: { top3Share: concentration.top3Share ?? 0 },
      score: thresholdLabelMap.concentrationLow.value - (concentration.top3Share ?? 0)
    });
  }

  const flags = {
    red: redCandidates.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score, ...flag }) => flag),
    green: greenCandidates.sort((a, b) => b.score - a.score).slice(0, 2).map(({ score, ...flag }) => flag),
    yellow: []
  };

  const suggestedRemovals = computeSuggestedRemovals({ competitors });
  const priceInputs = competitors.map((comp) => parseNumber(comp.price)).filter((v): v is number => typeof v === 'number' && v > 0);
  const priceStats = priceInputs.length ? quantiles(priceInputs) : undefined;
  const priceOutlierCutoff =
    priceStats?.q1 !== undefined && priceStats?.q3 !== undefined
      ? priceStats.q3 + (priceStats.q3 - priceStats.q1) * thresholdLabelMap.removal.outlierIqrMultiplier
      : undefined;
  const rowInsightsByAsin = buildRowInsights({ competitors, suggestedRemovals, priceOutlierCutoff });

  const insights: VettingInsights = {
    computedAt: Date.now(),
    totals: {
      competitorCount: filtered.length,
      marketCap,
      revenuePerCompetitor
    },
    concentration,
    distributions,
    flags,
    suggestedRemovals,
    rowInsightsByAsin
  };

  let scoreDelta: ScoreDelta | undefined;
  if (typeof prevScore === 'number' && typeof currentScore === 'number' && prevScore !== currentScore) {
    const drivers = computeDrivers(prevSnapshot, insights);
    scoreDelta = {
      prevScore,
      nextScore: currentScore,
      drivers
    };
  }

  return { insights, scoreDelta };
}
