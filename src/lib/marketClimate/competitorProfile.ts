import type {
  NormalizedKeepaCompetitor,
  NormalizedKeepaSnapshot,
  KeepaPoint
} from '@/lib/keepa/normalize';

/* ----------------------------------------------------------------------------
 * Competitor pre-vetting profiles
 *
 * Turns each competitor's daily history into three "lens" reads:
 *   1. Launch — when did they enter, what was their playbook, how long to ramp
 *   2. Price & Supply — pricing rhythm, floor/ceiling, stockouts, gap behavior
 *   3. Rank — averages over multiple windows + the truth-teller (current
 *             BSR vs the all-year average).
 *
 * Pure facts. The AI narration layer turns these into plain English.
 * --------------------------------------------------------------------------*/

export type PriceActivityLevel = 'lazy' | 'reasonable' | 'active' | 'unknown';
export type CurrentVsAverage =
  | 'much-better-than-average'
  | 'better-than-average'
  | 'about-average'
  | 'worse-than-average'
  | 'much-worse-than-average'
  | 'unknown';

export interface LaunchSignals {
  launchDate: number | null;
  daysOnMarket: number | null;
  /** True when launchDate falls inside the analysis window. */
  isWithinAnalysisWindow: boolean;
  /** First buyBox / Amazon price recorded after the launch. */
  launchBuyBoxPrice: number | null;
  /** First list price recorded — anchor for the "launched on sale" call. */
  launchListPrice: number | null;
  /** True when launch buyBox was ≥10% under list price. */
  launchedOnSale: boolean;
  launchDiscountPct: number | null;
  /** First non-`-1` SALES rank timestamp — when Amazon first ranked them. */
  firstSaleDate: number | null;
  daysToFirstSale: number | null;
  /**
   * First date after launch when BSR dropped below the competitor's lifetime
   * median and stayed there for at least 14 consecutive days. Heuristic for
   * "they got noticed."
   */
  tractionDate: number | null;
  daysToTraction: number | null;
}

export interface PriceSupplySignals {
  priceFloor: number | null;
  priceCeiling: number | null;
  currentBuyBox: number | null;
  /** Number of distinct buy-box price changes in the analysis window. */
  priceChangeCount: number;
  priceChangesPerMonth: number | null;
  priceActivityLevel: PriceActivityLevel;
  stockoutCount: number;
  totalStockoutDays: number;
  longestStockoutDays: number | null;
  /** Days since the most-recent stockout ended (null if no stockouts). */
  daysSinceLastStockout: number | null;
  /** The latest list price (anchor) we observed. */
  currentListPrice: number | null;
}

export interface RankSignals {
  bsrCurrent: number | null;
  bsrFloor: number | null;
  bsrCeiling: number | null;
  bsrAvg30d: number | null;
  bsrAvg90d: number | null;
  bsrAvg365d: number | null;
  /** Coefficient of variation × 100 — bigger means more volatile. */
  volatilityPct: number | null;
  /**
   * The truth-teller: how does the most-recent BSR compare to the all-year
   * average? "Better" = current BSR is lower (fewer = better rank).
   */
  currentVsYearAverage: CurrentVsAverage;
  bsrCurrentRatio: number | null;
}

export interface CompetitorProfile {
  asin: string;
  brand?: string;
  title?: string;
  launch: LaunchSignals;
  priceSupply: PriceSupplySignals;
  rank: RankSignals;
}

export interface BigPictureLaunch {
  countLaunchedInWindow: number;
  countOver12mo: number;
  countOver24mo: number;
  averageDaysToTraction: number | null;
  averageLaunchDiscountPct: number | null;
  newcomerOpenness: 'open' | 'mixed' | 'closed' | 'unknown';
}

export interface BigPicturePriceSupply {
  avgPriceChangesPerMonth: number | null;
  activeSellerCount: number;
  lazySellerCount: number;
  totalStockoutEvents: number;
  totalStockoutDays: number;
  marketSupplyHealth: 'steady' | 'occasional-disruption' | 'volatile' | 'unknown';
}

export interface BigPictureRank {
  avgYearlyBsr: number | null;
  bestYearlyBsr: number | null;
  worstYearlyBsr: number | null;
  bsrConsistency: 'consistent' | 'mixed' | 'highly-volatile' | 'unknown';
}

export interface CompetitorProfileSet {
  competitors: CompetitorProfile[];
  bigPicture: {
    launch: BigPictureLaunch;
    priceSupply: BigPicturePriceSupply;
    rank: BigPictureRank;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_ENTRANT_WINDOW_DAYS = 365;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const finiteValues = (series: KeepaPoint[]): number[] =>
  series.map(p => p.value).filter((v): v is number => isFiniteNumber(v));

const finiteValuesSince = (series: KeepaPoint[], sinceTs: number): number[] => {
  const out: number[] = [];
  for (const p of series) {
    if (p.timestamp >= sinceTs && isFiniteNumber(p.value)) out.push(p.value);
  }
  return out;
};

const mean = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentile = (values: number[], pct: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * pct)));
  return sorted[idx];
};

const stddev = (values: number[], avg: number): number => {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const lastFiniteValue = (series: KeepaPoint[]): number | null => {
  for (let i = series.length - 1; i >= 0; i--) {
    if (isFiniteNumber(series[i].value)) return series[i].value as number;
  }
  return null;
};

const firstFiniteValue = (series: KeepaPoint[]): number | null => {
  for (const p of series) {
    if (isFiniteNumber(p.value)) return p.value as number;
  }
  return null;
};

const firstFiniteTimestamp = (series: KeepaPoint[]): number | null => {
  for (const p of series) {
    if (isFiniteNumber(p.value)) return p.timestamp;
  }
  return null;
};

/* ----------------------------------------------------------------------------
 * Lens 1 — Launch
 * --------------------------------------------------------------------------*/

const buildLaunchSignals = (
  competitor: NormalizedKeepaCompetitor,
  windowMonths: number,
  nowMs: number
): LaunchSignals => {
  const launchDate = competitor.launchDate ?? null;
  const daysOnMarket = competitor.daysTracked ?? (
    launchDate ? Math.floor((nowMs - launchDate) / DAY_MS) : null
  );
  const windowStartMs = nowMs - windowMonths * 30 * DAY_MS;
  const isWithinAnalysisWindow = !!launchDate && launchDate >= windowStartMs;

  // Launch price playbook — read first observed list and buy-box prices.
  const launchListPrice = firstFiniteValue(competitor.series.listPrice);
  const launchBuyBoxPrice =
    firstFiniteValue(competitor.series.buyBoxShipping) ??
    firstFiniteValue(competitor.series.price);

  let launchedOnSale = false;
  let launchDiscountPct: number | null = null;
  if (
    isFiniteNumber(launchListPrice) &&
    isFiniteNumber(launchBuyBoxPrice) &&
    launchListPrice > 0 &&
    launchBuyBoxPrice > 0
  ) {
    const discountPct = ((launchListPrice - launchBuyBoxPrice) / launchListPrice) * 100;
    launchDiscountPct = Math.round(discountPct * 10) / 10;
    launchedOnSale = discountPct >= 10;
  }

  // First-sale + traction signals are derived from the BSR series.
  const bsrFiniteIndex = competitor.series.bsr.findIndex(p => isFiniteNumber(p.value));
  const firstSaleDate =
    bsrFiniteIndex >= 0 ? competitor.series.bsr[bsrFiniteIndex].timestamp : null;
  const daysToFirstSale =
    isFiniteNumber(launchDate) && isFiniteNumber(firstSaleDate)
      ? Math.max(0, Math.floor((firstSaleDate - launchDate) / DAY_MS))
      : null;

  // Traction = first 14-day rolling window where mean BSR <= lifetime median.
  const lifetimeBsrValues = finiteValues(competitor.series.bsr);
  const lifetimeMedian = median(lifetimeBsrValues);
  let tractionDate: number | null = null;
  if (isFiniteNumber(lifetimeMedian) && lifetimeBsrValues.length >= 14) {
    const validPoints = competitor.series.bsr.filter(p => isFiniteNumber(p.value)) as Array<
      KeepaPoint & { value: number }
    >;
    for (let i = 0; i < validPoints.length; i++) {
      const anchor = validPoints[i];
      const windowEnd = anchor.timestamp + 14 * DAY_MS;
      const windowValues: number[] = [];
      for (let j = i; j < validPoints.length && validPoints[j].timestamp <= windowEnd; j++) {
        windowValues.push(validPoints[j].value);
      }
      if (windowValues.length < 5) continue;
      const avg = mean(windowValues);
      if (avg !== null && avg <= lifetimeMedian) {
        tractionDate = anchor.timestamp;
        break;
      }
    }
  }
  const daysToTraction =
    isFiniteNumber(launchDate) && isFiniteNumber(tractionDate)
      ? Math.max(0, Math.floor((tractionDate - launchDate) / DAY_MS))
      : null;

  return {
    launchDate,
    daysOnMarket,
    isWithinAnalysisWindow,
    launchBuyBoxPrice,
    launchListPrice,
    launchedOnSale,
    launchDiscountPct,
    firstSaleDate,
    daysToFirstSale,
    tractionDate,
    daysToTraction
  };
};

/* ----------------------------------------------------------------------------
 * Lens 2 — Price & Supply
 * --------------------------------------------------------------------------*/

const buildPriceSupplySignals = (
  competitor: NormalizedKeepaCompetitor,
  windowMonths: number,
  nowMs: number
): PriceSupplySignals => {
  // Buy-box price for floor/ceiling and change-frequency analysis. Fall back
  // to the price series when the competitor's buyBox series is sparse.
  const bbSeries = competitor.series.buyBoxShipping.filter(p => isFiniteNumber(p.value)) as Array<
    KeepaPoint & { value: number }
  >;
  const priceSeries = competitor.series.price.filter(p => isFiniteNumber(p.value)) as Array<
    KeepaPoint & { value: number }
  >;
  const workingSeries = bbSeries.length >= 5 ? bbSeries : priceSeries;
  const workingValues = workingSeries.map(p => p.value);

  const priceFloor = percentile(workingValues, 0.05);
  const priceCeiling = percentile(workingValues, 0.95);
  const currentBuyBox = workingSeries.length
    ? workingSeries[workingSeries.length - 1].value
    : null;

  // Price-change count: count distinct adjacent values, ignoring sub-cent
  // noise. We round to the nearest cent so $19.99 → $19.99 doesn't fire.
  let priceChangeCount = 0;
  for (let i = 1; i < workingSeries.length; i++) {
    const prev = Math.round(workingSeries[i - 1].value * 100);
    const curr = Math.round(workingSeries[i].value * 100);
    if (prev !== curr) priceChangeCount += 1;
  }
  const priceChangesPerMonth =
    workingSeries.length >= 2
      ? priceChangeCount / Math.max(1, windowMonths)
      : null;
  let priceActivityLevel: PriceActivityLevel = 'unknown';
  if (isFiniteNumber(priceChangesPerMonth)) {
    if (priceChangesPerMonth < 0.5) priceActivityLevel = 'lazy';
    else if (priceChangesPerMonth <= 2) priceActivityLevel = 'reasonable';
    else priceActivityLevel = 'active';
  }

  // Stockouts — runs of `-1` in buyBoxShipping spanning ≥2 days.
  const stockoutRuns: Array<{ start: number; end: number; days: number }> = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (const p of competitor.series.buyBoxShipping) {
    const isOut = p.value === -1;
    if (isOut) {
      if (runStart === null) runStart = p.timestamp;
      runEnd = p.timestamp;
    } else if (runStart !== null && runEnd !== null) {
      const days = Math.max(1, Math.round((runEnd - runStart) / DAY_MS));
      if (days >= 2) stockoutRuns.push({ start: runStart, end: runEnd, days });
      runStart = null;
      runEnd = null;
    }
  }
  if (runStart !== null && runEnd !== null) {
    const days = Math.max(1, Math.round((runEnd - runStart) / DAY_MS));
    if (days >= 2) stockoutRuns.push({ start: runStart, end: runEnd, days });
  }
  const totalStockoutDays = stockoutRuns.reduce((sum, r) => sum + r.days, 0);
  const longestStockoutDays = stockoutRuns.length
    ? Math.max(...stockoutRuns.map(r => r.days))
    : null;
  const lastStockoutEnd = stockoutRuns.length
    ? stockoutRuns[stockoutRuns.length - 1].end
    : null;
  const daysSinceLastStockout =
    lastStockoutEnd !== null
      ? Math.max(0, Math.floor((nowMs - lastStockoutEnd) / DAY_MS))
      : null;

  return {
    priceFloor,
    priceCeiling,
    currentBuyBox,
    priceChangeCount,
    priceChangesPerMonth: priceChangesPerMonth ?? null,
    priceActivityLevel,
    stockoutCount: stockoutRuns.length,
    totalStockoutDays,
    longestStockoutDays,
    daysSinceLastStockout,
    currentListPrice: lastFiniteValue(competitor.series.listPrice)
  };
};

/* ----------------------------------------------------------------------------
 * Lens 3 — Rank
 * --------------------------------------------------------------------------*/

const buildRankSignals = (
  competitor: NormalizedKeepaCompetitor,
  nowMs: number
): RankSignals => {
  const validBsr = competitor.series.bsr.filter(p => isFiniteNumber(p.value)) as Array<
    KeepaPoint & { value: number }
  >;
  if (!validBsr.length) {
    return {
      bsrCurrent: null,
      bsrFloor: null,
      bsrCeiling: null,
      bsrAvg30d: null,
      bsrAvg90d: null,
      bsrAvg365d: null,
      volatilityPct: null,
      currentVsYearAverage: 'unknown',
      bsrCurrentRatio: null
    };
  }

  const allValues = validBsr.map(p => p.value);
  const bsrCurrent = validBsr[validBsr.length - 1].value;
  const bsrFloor = Math.min(...allValues);
  const bsrCeiling = Math.max(...allValues);

  const avg30d = mean(finiteValuesSince(validBsr, nowMs - 30 * DAY_MS));
  const avg90d = mean(finiteValuesSince(validBsr, nowMs - 90 * DAY_MS));
  const avg365d = mean(finiteValuesSince(validBsr, nowMs - 365 * DAY_MS));

  // Volatility — coefficient of variation across the year.
  const yearAvg = avg365d ?? mean(allValues);
  const yearValues = finiteValuesSince(validBsr, nowMs - 365 * DAY_MS).length
    ? finiteValuesSince(validBsr, nowMs - 365 * DAY_MS)
    : allValues;
  const volatilityPct =
    yearAvg && yearAvg > 0
      ? (stddev(yearValues, yearAvg) / yearAvg) * 100
      : null;

  // Current-vs-year truth-teller. Lower BSR = better. Buckets:
  //   ≤0.5×yearAvg → much-better, ≤0.8 → better, 0.8–1.2 → about-average,
  //   1.2–2.0 → worse, >2.0 → much-worse.
  let currentVsYearAverage: CurrentVsAverage = 'unknown';
  let bsrCurrentRatio: number | null = null;
  if (isFiniteNumber(yearAvg) && yearAvg > 0) {
    bsrCurrentRatio = bsrCurrent / yearAvg;
    if (bsrCurrentRatio <= 0.5) currentVsYearAverage = 'much-better-than-average';
    else if (bsrCurrentRatio <= 0.8) currentVsYearAverage = 'better-than-average';
    else if (bsrCurrentRatio <= 1.2) currentVsYearAverage = 'about-average';
    else if (bsrCurrentRatio <= 2.0) currentVsYearAverage = 'worse-than-average';
    else currentVsYearAverage = 'much-worse-than-average';
  }

  return {
    bsrCurrent,
    bsrFloor,
    bsrCeiling,
    bsrAvg30d: avg30d,
    bsrAvg90d: avg90d,
    bsrAvg365d: avg365d,
    volatilityPct: volatilityPct !== null ? Math.round(volatilityPct * 10) / 10 : null,
    currentVsYearAverage,
    bsrCurrentRatio: bsrCurrentRatio !== null ? Math.round(bsrCurrentRatio * 100) / 100 : null
  };
};

/* ----------------------------------------------------------------------------
 * Big-picture summaries (cross-cutting)
 * --------------------------------------------------------------------------*/

const buildLaunchBigPicture = (
  profiles: CompetitorProfile[],
  windowMonths: number
): BigPictureLaunch => {
  const launchDates = profiles.map(p => p.launch.launchDate).filter(isFiniteNumber);
  const nowMs = Date.now();
  const countLaunchedInWindow = profiles.filter(p => p.launch.isWithinAnalysisWindow).length;
  const countOver12mo = launchDates.filter(d => nowMs - d <= 365 * DAY_MS).length;
  const countOver24mo = launchDates.filter(d => nowMs - d <= 730 * DAY_MS).length;

  const tractionDays = profiles
    .map(p => p.launch.daysToTraction)
    .filter(isFiniteNumber);
  const averageDaysToTraction = tractionDays.length ? mean(tractionDays) : null;

  const discountPcts = profiles
    .map(p => p.launch.launchDiscountPct)
    .filter(isFiniteNumber);
  const averageLaunchDiscountPct = discountPcts.length ? mean(discountPcts) : null;

  let newcomerOpenness: BigPictureLaunch['newcomerOpenness'] = 'unknown';
  if (countOver12mo >= 2) newcomerOpenness = 'open';
  else if (countOver12mo === 1) newcomerOpenness = 'mixed';
  else if (countOver24mo === 0) newcomerOpenness = 'closed';
  else newcomerOpenness = 'mixed';

  return {
    countLaunchedInWindow,
    countOver12mo,
    countOver24mo,
    averageDaysToTraction:
      averageDaysToTraction !== null ? Math.round(averageDaysToTraction) : null,
    averageLaunchDiscountPct:
      averageLaunchDiscountPct !== null
        ? Math.round(averageLaunchDiscountPct * 10) / 10
        : null,
    newcomerOpenness
  };
};

const buildPriceSupplyBigPicture = (
  profiles: CompetitorProfile[]
): BigPicturePriceSupply => {
  const monthlyChanges = profiles
    .map(p => p.priceSupply.priceChangesPerMonth)
    .filter(isFiniteNumber);
  const avgPriceChangesPerMonth = monthlyChanges.length ? mean(monthlyChanges) : null;
  const activeSellerCount = profiles.filter(p => p.priceSupply.priceActivityLevel === 'active').length;
  const lazySellerCount = profiles.filter(p => p.priceSupply.priceActivityLevel === 'lazy').length;
  const totalStockoutEvents = profiles.reduce((sum, p) => sum + p.priceSupply.stockoutCount, 0);
  const totalStockoutDays = profiles.reduce((sum, p) => sum + p.priceSupply.totalStockoutDays, 0);

  let marketSupplyHealth: BigPicturePriceSupply['marketSupplyHealth'] = 'steady';
  if (totalStockoutEvents === 0) marketSupplyHealth = 'steady';
  else if (totalStockoutDays > 60 || totalStockoutEvents >= profiles.length)
    marketSupplyHealth = 'volatile';
  else marketSupplyHealth = 'occasional-disruption';

  return {
    avgPriceChangesPerMonth:
      avgPriceChangesPerMonth !== null
        ? Math.round(avgPriceChangesPerMonth * 10) / 10
        : null,
    activeSellerCount,
    lazySellerCount,
    totalStockoutEvents,
    totalStockoutDays,
    marketSupplyHealth
  };
};

const buildRankBigPicture = (profiles: CompetitorProfile[]): BigPictureRank => {
  const yearAverages = profiles.map(p => p.rank.bsrAvg365d).filter(isFiniteNumber);
  const floors = profiles.map(p => p.rank.bsrFloor).filter(isFiniteNumber);
  const ceilings = profiles.map(p => p.rank.bsrCeiling).filter(isFiniteNumber);
  const volatilities = profiles.map(p => p.rank.volatilityPct).filter(isFiniteNumber);

  const avgYearlyBsr = yearAverages.length ? mean(yearAverages) : null;
  const bestYearlyBsr = floors.length ? Math.min(...floors) : null;
  const worstYearlyBsr = ceilings.length ? Math.max(...ceilings) : null;
  const avgVolatility = volatilities.length ? mean(volatilities) : null;

  let bsrConsistency: BigPictureRank['bsrConsistency'] = 'unknown';
  if (avgVolatility === null) bsrConsistency = 'unknown';
  else if (avgVolatility < 30) bsrConsistency = 'consistent';
  else if (avgVolatility < 60) bsrConsistency = 'mixed';
  else bsrConsistency = 'highly-volatile';

  return {
    avgYearlyBsr: avgYearlyBsr !== null ? Math.round(avgYearlyBsr) : null,
    bestYearlyBsr: bestYearlyBsr !== null ? Math.round(bestYearlyBsr) : null,
    worstYearlyBsr: worstYearlyBsr !== null ? Math.round(worstYearlyBsr) : null,
    bsrConsistency
  };
};

/* ----------------------------------------------------------------------------
 * Entry point
 * --------------------------------------------------------------------------*/

export const buildCompetitorProfiles = (
  snapshot: NormalizedKeepaSnapshot
): CompetitorProfileSet => {
  const nowMs = Date.now();
  const profiles: CompetitorProfile[] = snapshot.competitors.map(competitor => ({
    asin: competitor.asin,
    brand: competitor.brand,
    title: competitor.title,
    launch: buildLaunchSignals(competitor, snapshot.windowMonths, nowMs),
    priceSupply: buildPriceSupplySignals(competitor, snapshot.windowMonths, nowMs),
    rank: buildRankSignals(competitor, nowMs)
  }));

  return {
    competitors: profiles,
    bigPicture: {
      launch: buildLaunchBigPicture(profiles, snapshot.windowMonths),
      priceSupply: buildPriceSupplyBigPicture(profiles),
      rank: buildRankBigPicture(profiles)
    }
  };
};
