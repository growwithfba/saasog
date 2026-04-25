import type {
  NormalizedKeepaSnapshot,
  NormalizedKeepaCompetitor,
  KeepaPoint
} from '@/lib/keepa/normalize';

/* ----------------------------------------------------------------------------
 * Market-Climate event detection
 *
 * Turns per-competitor daily history into a list of semantic events
 * (launches, stockouts, promos, rank swings, review acceleration, entry surges).
 * Each event has an impact score 0–100 and enough evidence for the UI to
 * render a "show me why" mini-chart.
 *
 * Descriptions are filled in by the AI layer in 2.8d — this module just
 * produces the raw facts.
 * --------------------------------------------------------------------------*/

export type MarketEventType =
  | 'LAUNCH'
  | 'STOCKOUT'
  | 'MAJOR_PROMO'
  | 'PROMO_CASCADE'
  | 'RANK_COLLAPSE'
  | 'RANK_BREAKOUT'
  | 'REVIEW_ACCELERATION'
  | 'COMPETITOR_ENTRY';

export type MarketEventMetric =
  | 'price'
  | 'bsr'
  | 'buyBoxShipping'
  | 'reviewCount'
  | 'countNew';

export interface MarketEventEvidence {
  metric: MarketEventMetric;
  dataPoints: KeepaPoint[];
}

export interface MarketEvent {
  type: MarketEventType;
  /** ASIN of the affected competitor, or 'MARKET' for cross-competitor events. */
  asin: string | 'MARKET';
  brand?: string;
  startTimestamp: number;
  endTimestamp?: number;
  /** 0–100. Our own scoring model, not Keepa's. */
  impactScore: number;
  /** Structured facts for the AI to narrate in 2.8d. */
  summary: Record<string, unknown>;
  /** Raw data slice the UI can chart to explain the event. */
  evidence: MarketEventEvidence;
  /** Filled by the AI layer in 2.8d. Null here. */
  description: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EVIDENCE_MAX_POINTS = 30;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const finiteValuesBetween = (
  series: KeepaPoint[],
  startTs: number,
  endTs: number
): number[] => {
  const values: number[] = [];
  for (const point of series) {
    if (point.timestamp < startTs) continue;
    if (point.timestamp > endTs) break;
    if (isFiniteNumber(point.value)) values.push(point.value);
  }
  return values;
};

/**
 * Downsample an evidence window so we don't inflate the stored payload.
 * Keeps the first and last points plus an evenly-spaced sample in between.
 */
const pickEvidence = (series: KeepaPoint[], startTs: number, endTs: number): KeepaPoint[] => {
  const window = series.filter(
    point => point.timestamp >= startTs && point.timestamp <= endTs
  );
  if (window.length <= EVIDENCE_MAX_POINTS) return window;
  const step = Math.ceil(window.length / EVIDENCE_MAX_POINTS);
  const picked: KeepaPoint[] = [];
  for (let i = 0; i < window.length; i += step) picked.push(window[i]);
  const last = window[window.length - 1];
  if (picked[picked.length - 1] !== last) picked.push(last);
  return picked;
};

/* ----------------------------------------------------------------------------
 * Detector: LAUNCH
 *   Emit when the competitor's launchDate falls inside the analysis window.
 *   Impact decays with age — a launch 30 days ago is much more relevant than
 *   one 18 months ago. Floor at 30 so a 24mo-old launch still surfaces.
 * --------------------------------------------------------------------------*/
const detectLaunch = (
  competitor: NormalizedKeepaCompetitor,
  windowMonths: number,
  nowMs: number
): MarketEvent[] => {
  const launch = competitor.launchDate;
  if (!isFiniteNumber(launch) || launch <= 0) return [];
  const windowStartMs = nowMs - windowMonths * 30 * DAY_MS;
  if (launch < windowStartMs) return [];

  const ageDays = Math.max(0, Math.floor((nowMs - launch) / DAY_MS));
  const impactScore = clamp(100 - (ageDays / 730) * 70, 30, 100);

  const evidenceStart = launch;
  const evidenceEnd = Math.min(nowMs, launch + 60 * DAY_MS);

  return [
    {
      type: 'LAUNCH',
      asin: competitor.asin,
      brand: competitor.brand,
      startTimestamp: launch,
      impactScore: Math.round(impactScore),
      summary: {
        launchDate: launch,
        ageDays,
        daysTracked: competitor.daysTracked ?? null,
        listedSince: competitor.listedSince ?? null,
        trackingSince: competitor.trackingSince ?? null
      },
      evidence: {
        metric: 'bsr',
        dataPoints: pickEvidence(competitor.series.bsr, evidenceStart, evidenceEnd)
      },
      description: null
    }
  ];
};

/* ----------------------------------------------------------------------------
 * Detector: STOCKOUT
 *   A run of -1 in buyBoxShipping spanning ≥2 days is a stockout.
 *   (`-1` is Keepa's "no Buy Box winner" sentinel, preserved at normalize.)
 * --------------------------------------------------------------------------*/
const detectStockouts = (competitor: NormalizedKeepaCompetitor): MarketEvent[] => {
  const series = competitor.series.buyBoxShipping;
  if (!series.length) return [];

  const events: MarketEvent[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;

  for (const point of series) {
    const isOut = point.value === -1;
    if (isOut) {
      if (runStart === null) runStart = point.timestamp;
      runEnd = point.timestamp;
    } else if (runStart !== null && runEnd !== null) {
      pushStockoutIfLongEnough(events, competitor, runStart, runEnd);
      runStart = null;
      runEnd = null;
    }
  }
  if (runStart !== null && runEnd !== null) {
    pushStockoutIfLongEnough(events, competitor, runStart, runEnd);
  }
  return events;
};

const pushStockoutIfLongEnough = (
  events: MarketEvent[],
  competitor: NormalizedKeepaCompetitor,
  startTs: number,
  endTs: number
) => {
  const days = Math.max(1, Math.round((endTs - startTs) / DAY_MS));
  if (days < 2) return;
  const impactScore = clamp(days * 3, 20, 100);
  events.push({
    type: 'STOCKOUT',
    asin: competitor.asin,
    brand: competitor.brand,
    startTimestamp: startTs,
    endTimestamp: endTs,
    impactScore: Math.round(impactScore),
    summary: { days },
    evidence: {
      metric: 'buyBoxShipping',
      dataPoints: pickEvidence(
        competitor.series.buyBoxShipping,
        startTs - 3 * DAY_MS,
        endTs + 3 * DAY_MS
      )
    },
    description: null
  });
};

/* ----------------------------------------------------------------------------
 * Detector: MAJOR_PROMO
 *   Price drops ≥10% below trailing-60-day median, sustained for ≥2
 *   consecutive samples. Emits one event per distinct promo cluster.
 * --------------------------------------------------------------------------*/
const PROMO_DROP_THRESHOLD_PCT = 10;

const detectMajorPromos = (competitor: NormalizedKeepaCompetitor): MarketEvent[] => {
  const series = competitor.series.price;
  const valid = series.filter(point => isFiniteNumber(point.value)) as Array<
    KeepaPoint & { value: number }
  >;
  if (valid.length < 5) return [];

  const events: MarketEvent[] = [];
  let clusterStart: number | null = null;
  let clusterEnd: number | null = null;
  let clusterMinPrice = Infinity;
  let clusterBaseline = 0;

  for (let i = 0; i < valid.length; i++) {
    const point = valid[i];
    const baselineStart = point.timestamp - 60 * DAY_MS;
    const priorValues = finiteValuesBetween(series, baselineStart, point.timestamp - DAY_MS);
    const baseline = median(priorValues);
    if (!baseline || baseline <= 0) continue;
    const dropPct = ((baseline - point.value) / baseline) * 100;

    if (dropPct >= PROMO_DROP_THRESHOLD_PCT) {
      if (clusterStart === null) {
        clusterStart = point.timestamp;
        clusterBaseline = baseline;
      }
      clusterEnd = point.timestamp;
      clusterMinPrice = Math.min(clusterMinPrice, point.value);
    } else if (clusterStart !== null && clusterEnd !== null) {
      pushPromoIfSustained(events, competitor, clusterStart, clusterEnd, clusterBaseline, clusterMinPrice);
      clusterStart = null;
      clusterEnd = null;
      clusterMinPrice = Infinity;
      clusterBaseline = 0;
    }
  }
  if (clusterStart !== null && clusterEnd !== null) {
    pushPromoIfSustained(events, competitor, clusterStart, clusterEnd, clusterBaseline, clusterMinPrice);
  }
  return events;
};

const pushPromoIfSustained = (
  events: MarketEvent[],
  competitor: NormalizedKeepaCompetitor,
  startTs: number,
  endTs: number,
  baseline: number,
  minPrice: number
) => {
  const days = Math.max(1, Math.round((endTs - startTs) / DAY_MS));
  if (days < 2) return;
  const dropPct = ((baseline - minPrice) / baseline) * 100;
  // Scale impact so a 10% drop (threshold) reads as low impact and
  // 30%+ reads as high. We keep 40 as the floor because every qualifying
  // promo is at least "meaningful" to a first-time seller.
  const impactScore = clamp(20 + dropPct * 2.5, 40, 100);
  events.push({
    type: 'MAJOR_PROMO',
    asin: competitor.asin,
    brand: competitor.brand,
    startTimestamp: startTs,
    endTimestamp: endTs,
    impactScore: Math.round(impactScore),
    summary: {
      baselinePrice: Math.round(baseline * 100) / 100,
      lowPrice: Math.round(minPrice * 100) / 100,
      dropPct: Math.round(dropPct * 10) / 10,
      days
    },
    evidence: {
      metric: 'price',
      dataPoints: pickEvidence(
        competitor.series.price,
        startTs - 14 * DAY_MS,
        endTs + 7 * DAY_MS
      )
    },
    description: null
  });
};

/* ----------------------------------------------------------------------------
 * Detector: RANK_COLLAPSE + RANK_BREAKOUT
 *   Rolling 14-day window on BSR.
 *     collapse  = endBsr ≥ 2.5 × startBsr (rank got 2.5× worse)
 *     breakout  = endBsr ≤ 0.4 × startBsr (rank got 2.5× better)
 *   The new rank level must also SUSTAIN — we require the mean of the next
 *   14 days to stay ≥1.8× (collapse) or ≤0.55× (breakout) of the start,
 *   so transient spikes that bounce back don't count. 60-day cooldown per
 *   type per competitor keeps the timeline readable.
 *
 *   Remember: lower BSR is better.
 * --------------------------------------------------------------------------*/
const RANK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RANK_SUSTAIN_MS = 14 * 24 * 60 * 60 * 1000;
const RANK_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const COLLAPSE_RATIO = 2.5;
const BREAKOUT_RATIO = 0.4;
const SUSTAIN_COLLAPSE_MIN_RATIO = 1.8;
const SUSTAIN_BREAKOUT_MAX_RATIO = 0.55;

const detectRankMoves = (competitor: NormalizedKeepaCompetitor): MarketEvent[] => {
  const series = competitor.series.bsr;
  const valid = series.filter(point => isFiniteNumber(point.value) && (point.value as number) > 0) as Array<
    KeepaPoint & { value: number }
  >;
  if (valid.length < 10) return [];

  const events: MarketEvent[] = [];
  let lastEventTs: Record<'collapse' | 'breakout', number> = { collapse: 0, breakout: 0 };

  const sustainedMean = (fromIndex: number, durationMs: number): number | null => {
    const endTs = valid[fromIndex].timestamp + durationMs;
    const values: number[] = [];
    for (let k = fromIndex; k < valid.length && valid[k].timestamp <= endTs; k++) {
      values.push(valid[k].value);
    }
    if (values.length < 3) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  for (let i = 0; i < valid.length; i++) {
    const anchor = valid[i];
    let j = i - 1;
    while (j >= 0 && anchor.timestamp - valid[j].timestamp <= RANK_WINDOW_MS) j--;
    const windowStart = valid[j + 1];
    if (!windowStart || windowStart.timestamp === anchor.timestamp) continue;

    const startBsr = windowStart.value;
    const endBsr = anchor.value;
    const ratio = endBsr / startBsr;

    if (ratio >= COLLAPSE_RATIO && anchor.timestamp - lastEventTs.collapse > RANK_COOLDOWN_MS) {
      // Sustain check — does the worse rank actually stick?
      const nextMean = sustainedMean(i, RANK_SUSTAIN_MS);
      if (nextMean === null || nextMean / startBsr < SUSTAIN_COLLAPSE_MIN_RATIO) continue;
      const pctWorse = Math.round((ratio - 1) * 100);
      events.push({
        type: 'RANK_COLLAPSE',
        asin: competitor.asin,
        brand: competitor.brand,
        startTimestamp: windowStart.timestamp,
        endTimestamp: anchor.timestamp,
        impactScore: clamp(Math.round(40 + (ratio - 1) * 20), 40, 95),
        summary: {
          startBsr: Math.round(startBsr),
          endBsr: Math.round(endBsr),
          pctWorse
        },
        evidence: {
          metric: 'bsr',
          dataPoints: pickEvidence(
            competitor.series.bsr,
            windowStart.timestamp - 7 * DAY_MS,
            anchor.timestamp + 7 * DAY_MS
          )
        },
        description: null
      });
      lastEventTs.collapse = anchor.timestamp;
    } else if (ratio <= BREAKOUT_RATIO && anchor.timestamp - lastEventTs.breakout > RANK_COOLDOWN_MS) {
      const nextMean = sustainedMean(i, RANK_SUSTAIN_MS);
      if (nextMean === null || nextMean / startBsr > SUSTAIN_BREAKOUT_MAX_RATIO) continue;
      const pctBetter = Math.round((1 - ratio) * 100);
      events.push({
        type: 'RANK_BREAKOUT',
        asin: competitor.asin,
        brand: competitor.brand,
        startTimestamp: windowStart.timestamp,
        endTimestamp: anchor.timestamp,
        impactScore: clamp(Math.round(40 + (1 - ratio) * 80), 40, 95),
        summary: {
          startBsr: Math.round(startBsr),
          endBsr: Math.round(endBsr),
          pctBetter
        },
        evidence: {
          metric: 'bsr',
          dataPoints: pickEvidence(
            competitor.series.bsr,
            windowStart.timestamp - 7 * DAY_MS,
            anchor.timestamp + 7 * DAY_MS
          )
        },
        description: null
      });
      lastEventTs.breakout = anchor.timestamp;
    }
  }

  return events;
};

/* ----------------------------------------------------------------------------
 * Detector: REVIEW_ACCELERATION
 *   Cumulative review count. Compare the last 30 days of velocity (reviews/day)
 *   against the prior 90 days. Fires when recent velocity is ≥1.5× the
 *   baseline AND the product added at least 5 new reviews in that window.
 *   Also handles "cold start" acceleration: if baseline velocity is ~0 but
 *   recent velocity is picking up, fire with a synthesized multiplier.
 * --------------------------------------------------------------------------*/
const REVIEW_ACCEL_MULTIPLIER = 1.5;
const REVIEW_ACCEL_MIN_NEW = 5;

const detectReviewAcceleration = (
  competitor: NormalizedKeepaCompetitor,
  nowMs: number
): MarketEvent[] => {
  const series = competitor.series.reviewCount.filter(point =>
    isFiniteNumber(point.value)
  ) as Array<KeepaPoint & { value: number }>;
  if (series.length < 6) return [];

  const recentStart = nowMs - 30 * DAY_MS;
  const baselineStart = nowMs - 120 * DAY_MS;

  const recentPoints = series.filter(p => p.timestamp >= recentStart);
  const baselinePoints = series.filter(
    p => p.timestamp >= baselineStart && p.timestamp < recentStart
  );

  if (recentPoints.length < 2 || baselinePoints.length < 2) return [];

  const recentDelta = recentPoints[recentPoints.length - 1].value - recentPoints[0].value;
  const recentDays = Math.max(
    1,
    (recentPoints[recentPoints.length - 1].timestamp - recentPoints[0].timestamp) / DAY_MS
  );
  const baselineDelta =
    baselinePoints[baselinePoints.length - 1].value - baselinePoints[0].value;
  const baselineDays = Math.max(
    1,
    (baselinePoints[baselinePoints.length - 1].timestamp - baselinePoints[0].timestamp) / DAY_MS
  );

  const recentVelocity = recentDelta / recentDays;
  const baselineVelocity = baselineDelta / baselineDays;
  if (recentDelta < REVIEW_ACCEL_MIN_NEW) return [];

  // Cold-start path: almost no prior reviews, recent pace picking up.
  // Treat as a meaningful acceleration with a floor multiplier of 3.
  const effectiveBaselineVelocity = baselineVelocity <= 0.01 ? 0.01 : baselineVelocity;
  const multiplier = recentVelocity / effectiveBaselineVelocity;
  if (multiplier < REVIEW_ACCEL_MULTIPLIER) return [];

  return [
    {
      type: 'REVIEW_ACCELERATION',
      asin: competitor.asin,
      brand: competitor.brand,
      startTimestamp: recentPoints[0].timestamp,
      endTimestamp: recentPoints[recentPoints.length - 1].timestamp,
      impactScore: clamp(Math.round(30 + multiplier * 15), 40, 95),
      summary: {
        recentVelocityPerDay: Math.round(recentVelocity * 100) / 100,
        baselineVelocityPerDay: Math.round(baselineVelocity * 100) / 100,
        multiplier: Math.round(multiplier * 10) / 10,
        reviewsGained: Math.round(recentDelta)
      },
      evidence: {
        metric: 'reviewCount',
        dataPoints: pickEvidence(
          competitor.series.reviewCount,
          baselineStart,
          nowMs
        )
      },
      description: null
    }
  ];
};

/* ----------------------------------------------------------------------------
 * Detector: COMPETITOR_ENTRY
 *   Count of 3P-new offers (csv[11]). If it jumps ≥50% or by at least 3
 *   in a 30-day window, flag new entrants piling on this listing.
 * --------------------------------------------------------------------------*/
const detectCompetitorEntry = (competitor: NormalizedKeepaCompetitor): MarketEvent[] => {
  const series = competitor.series.countNew.filter(point =>
    isFiniteNumber(point.value)
  ) as Array<KeepaPoint & { value: number }>;
  if (series.length < 6) return [];

  const events: MarketEvent[] = [];
  const WINDOW_MS = 30 * DAY_MS;
  const COOLDOWN_MS = 45 * DAY_MS;
  let lastEventTs = 0;

  for (let i = 0; i < series.length; i++) {
    const anchor = series[i];
    let j = i - 1;
    while (j >= 0 && anchor.timestamp - series[j].timestamp <= WINDOW_MS) j--;
    const windowStart = series[j + 1];
    if (!windowStart || windowStart.timestamp === anchor.timestamp) continue;

    const start = windowStart.value;
    const end = anchor.value;
    const absIncrease = end - start;
    const pctIncrease = start > 0 ? (absIncrease / start) * 100 : absIncrease * 100;

    const qualifies = absIncrease >= 3 || (start > 0 && pctIncrease >= 50);
    if (!qualifies) continue;
    if (anchor.timestamp - lastEventTs < COOLDOWN_MS) continue;

    events.push({
      type: 'COMPETITOR_ENTRY',
      asin: competitor.asin,
      brand: competitor.brand,
      startTimestamp: windowStart.timestamp,
      endTimestamp: anchor.timestamp,
      impactScore: clamp(Math.round(30 + absIncrease * 8 + pctIncrease * 0.2), 30, 85),
      summary: {
        startOfferCount: Math.round(start),
        endOfferCount: Math.round(end),
        newEntrants: Math.round(absIncrease),
        pctIncrease: Math.round(pctIncrease)
      },
      evidence: {
        metric: 'countNew',
        dataPoints: pickEvidence(
          competitor.series.countNew,
          windowStart.timestamp - 14 * DAY_MS,
          anchor.timestamp + 14 * DAY_MS
        )
      },
      description: null
    });
    lastEventTs = anchor.timestamp;
  }

  return events;
};

/* ----------------------------------------------------------------------------
 * Detector: PROMO_CASCADE (cross-competitor)
 *   ≥3 competitors ran MAJOR_PROMO inside a rolling 14-day window. The whole
 *   market slapped discounts at once — probably responding to Black Friday,
 *   a category-wide event, or each other.
 * --------------------------------------------------------------------------*/
const detectPromoCascade = (
  competitors: NormalizedKeepaCompetitor[],
  allEvents: MarketEvent[]
): MarketEvent[] => {
  const promoEvents = allEvents
    .filter(e => e.type === 'MAJOR_PROMO')
    .sort((a, b) => a.startTimestamp - b.startTimestamp);
  if (promoEvents.length < 3) return [];

  const WINDOW_MS = 14 * DAY_MS;
  const cascades: MarketEvent[] = [];
  const consumedEventIds = new Set<number>();

  for (let i = 0; i < promoEvents.length; i++) {
    if (consumedEventIds.has(i)) continue;
    const windowStart = promoEvents[i].startTimestamp;
    const participating: number[] = [];
    const participatingAsins = new Set<string>();
    for (let j = i; j < promoEvents.length; j++) {
      if (promoEvents[j].startTimestamp - windowStart > WINDOW_MS) break;
      if (participatingAsins.has(promoEvents[j].asin)) continue;
      participating.push(j);
      participatingAsins.add(promoEvents[j].asin);
    }
    if (participating.length >= 3) {
      const involvedEvents = participating.map(k => promoEvents[k]);
      const endTs = involvedEvents.reduce(
        (max, e) => Math.max(max, e.endTimestamp ?? e.startTimestamp),
        windowStart
      );
      const avgDropPct =
        involvedEvents.reduce(
          (sum, e) => sum + Number((e.summary as any)?.dropPct ?? 0),
          0
        ) / involvedEvents.length;

      cascades.push({
        type: 'PROMO_CASCADE',
        asin: 'MARKET',
        startTimestamp: windowStart,
        endTimestamp: endTs,
        impactScore: clamp(Math.round(40 + participating.length * 10 + avgDropPct), 50, 100),
        summary: {
          participantAsins: involvedEvents.map(e => e.asin),
          participantCount: participating.length,
          avgDropPct: Math.round(avgDropPct * 10) / 10
        },
        evidence: {
          // Cascade evidence is synthetic — flatten price points from each
          // participant in the window so the UI can overlay them.
          metric: 'price',
          dataPoints: involvedEvents.flatMap(e => e.evidence.dataPoints).slice(0, EVIDENCE_MAX_POINTS)
        },
        description: null
      });
      participating.forEach(k => consumedEventIds.add(k));
    }
  }

  return cascades;
};

/* ----------------------------------------------------------------------------
 * Entry point
 * --------------------------------------------------------------------------*/
export const detectMarketEvents = (snapshot: NormalizedKeepaSnapshot): MarketEvent[] => {
  const nowMs = Date.now();
  const all: MarketEvent[] = [];

  for (const competitor of snapshot.competitors) {
    all.push(...detectLaunch(competitor, snapshot.windowMonths, nowMs));
    all.push(...detectStockouts(competitor));
    all.push(...detectMajorPromos(competitor));
    all.push(...detectRankMoves(competitor));
    all.push(...detectReviewAcceleration(competitor, nowMs));
    all.push(...detectCompetitorEntry(competitor));
  }

  all.push(...detectPromoCascade(snapshot.competitors, all));

  // Sort most recent first so timelines read newest → oldest by default.
  all.sort((a, b) => b.startTimestamp - a.startTimestamp);
  return all;
};
