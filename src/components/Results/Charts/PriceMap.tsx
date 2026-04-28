'use client';

import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { calculateScore, getCompetitorStrength, safeParseNumber } from '@/utils/scoring';
import { getPercentileThresholds } from '@/utils/metricBands';

type PriceMapProps = {
  competitors: any[];
  imageUrlByAsin?: Map<string, string | null>;
};

type PricePoint = {
  asin: string;
  brand: string;
  title: string;
  price: number;
  revenue: number;
  reviews: number;
  rating: number | null;
  score: number;
  strengthLabel: 'STRONG' | 'DECENT' | 'WEAK';
  isAggregated: boolean;
  listingCount?: number;
};

const STRENGTH_CHIP: Record<PricePoint['strengthLabel'], string> = {
  STRONG: 'bg-red-500/15 text-red-300 border-red-500/40',
  DECENT: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  WEAK: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
};

const STRENGTH_TEXT: Record<PricePoint['strengthLabel'], string> = {
  STRONG: 'Strong',
  DECENT: 'Decent',
  WEAK: 'Weak'
};

// Row background: a softer Tailwind-400 ramp (emerald → amber → rose)
// keyed to the row's revenue rank within the visible list. Pure
// green/yellow/red looked garish — these 400-shades are designed to
// sit next to each other in a UI palette, so the transitions read
// as a continuous heatmap instead of three competing colors. The
// saturated end is on the RIGHT (where the metric text lives), so
// the row reads as a danger meter filling toward the rev figure.
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const lerpColor = (t: number): [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    const u = clamped / 0.5; // emerald-400 → amber-400
    return [lerp(52, 251, u), lerp(211, 191, u), lerp(153, 36, u)];
  }
  const u = (clamped - 0.5) / 0.5; // amber-400 → rose-400
  return [lerp(251, 251, u), lerp(191, 113, u), lerp(36, 133, u)];
};
const rowGradient = (revenueRank: number) => {
  const [r, g, b] = lerpColor(revenueRank);
  // Higher-rank rows get a richer right-edge tint so visual weight
  // tracks meaning (top of revenue = bold rose, bottom = soft emerald).
  const head = 0.04;
  const tail = 0.34 + revenueRank * 0.12;
  const borderAlpha = 0.28 + revenueRank * 0.18;
  return {
    bg: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${head}) 0%, rgba(${r}, ${g}, ${b}, ${tail}) 100%)`,
    border: `rgba(${r}, ${g}, ${b}, ${borderAlpha})`
  };
};

// Mirrors the per-competitor revenue band logic in ProductVettingResults
// (Competitor Matrix). p20/p80 for thresholds, p10/p90 for extremes,
// plus the same hard overrides that the matrix uses. Adds an explicit
// mid-range tone so every revenue cell has color (Dave 2026-04-27).
const REVENUE_OVERRIDES = { veryLow: 750, low: 1000, high: 10000, veryHigh: 15000 };

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};

const quantile = (values: number[], pct: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * pct;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const openAmazon = (asin: string) => {
  if (!asin || typeof window === 'undefined') return;
  window.open(`https://www.amazon.com/dp/${asin}`, '_blank', 'noopener,noreferrer');
};

const PriceMap: React.FC<PriceMapProps> = ({ competitors, imageUrlByAsin }) => {
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'decent' | 'weak'>('all');
  const [aggregateByBrand, setAggregateByBrand] = useState(false);

  // When aggregateByBrand is on, collapse listings sharing a brand into
  // one row. Sums for revenue/sales/reviews; weighted average for price
  // (by revenue) and rating (by reviews); we surface the brand's
  // top-revenue listing's ASIN so click-through still goes to a real
  // Amazon page (the largest listing in the brand).
  const aggregatedCompetitors = useMemo(() => {
    if (!aggregateByBrand) return competitors || [];
    const groups = new Map<string, any[]>();
    for (const c of competitors || []) {
      const brand = (c?.brand || c?.title || 'Unknown').toString().trim() || 'Unknown';
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand)!.push(c);
    }
    return Array.from(groups.entries()).map(([brand, listings]) => {
      const sortedByRev = [...listings].sort(
        (a, b) => (safeParseNumber(b?.monthlyRevenue) || 0) - (safeParseNumber(a?.monthlyRevenue) || 0)
      );
      const top = sortedByRev[0];
      const sum = (key: string) =>
        listings.reduce((acc, c) => acc + (safeParseNumber((c as any)[key]) || 0), 0);
      const weightedAvg = (key: string, weightKey: string) => {
        let totalW = 0;
        let totalWX = 0;
        for (const c of listings) {
          const w = safeParseNumber((c as any)[weightKey]) || 0;
          const x = safeParseNumber((c as any)[key]);
          if (!Number.isFinite(x)) continue;
          if (w > 0) {
            totalW += w;
            totalWX += w * x;
          }
        }
        if (totalW > 0) return totalWX / totalW;
        const xs = listings
          .map((c) => safeParseNumber((c as any)[key]))
          .filter((x): x is number => Number.isFinite(x));
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      };
      return {
        ...top,
        asin: top?.asin || '',
        brand,
        title: `${brand} (${listings.length} listings)`,
        price: weightedAvg('price', 'monthlyRevenue'),
        monthlyRevenue: sum('monthlyRevenue'),
        monthlySales: sum('monthlySales'),
        reviews: sum('reviews'),
        rating: weightedAvg('rating', 'reviews'),
        __isAggregated: true,
        __listingCount: listings.length
      };
    });
  }, [aggregateByBrand, competitors]);

  const points = useMemo<PricePoint[]>(() => {
    const list = aggregatedCompetitors
      .map((c) => {
        const price = safeParseNumber(c?.price);
        if (!Number.isFinite(price) || price <= 0) return null;
        const revenue = safeParseNumber(c?.monthlyRevenue);
        const reviews = safeParseNumber(c?.reviews);
        const rating = safeParseNumber(c?.rating);
        const score = parseFloat(calculateScore(c));
        const safeScore = Number.isFinite(score) ? score : 0;
        return {
          asin: c?.asin || '',
          brand: c?.brand || c?.title || 'Unknown Brand',
          title: c?.title || '',
          price,
          revenue: Number.isFinite(revenue) ? revenue : 0,
          reviews: Number.isFinite(reviews) ? reviews : 0,
          rating: rating > 0 && rating <= 5 ? rating : null,
          score: safeScore,
          strengthLabel: getCompetitorStrength(safeScore).label,
          isAggregated: !!(c as any).__isAggregated,
          listingCount: (c as any).__listingCount
        } as PricePoint;
      })
      .filter((p): p is PricePoint => Boolean(p));

    const filtered = strengthFilter === 'all'
      ? list
      : list.filter((p) => p.strengthLabel.toLowerCase() === strengthFilter);

    return filtered.sort((a, b) => b.price - a.price);
  }, [aggregatedCompetitors, strengthFilter]);

  const summary = useMemo(() => {
    if (!points.length) return null;
    const prices = points.map((p) => p.price);
    return {
      count: points.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      median: median(prices)
    };
  }, [points]);

  // Rank competitors by revenue desc; top-revenue = rank 0, lowest =
  // rank n-1. Normalize to [0..1] where 1 = top revenue → row gets
  // the red end of the gradient.
  const revenueRankByAsin = useMemo(() => {
    const map = new Map<string, number>();
    if (points.length <= 1) {
      points.forEach((p) => map.set(p.asin || `${p.brand}-${p.price}`, 0));
      return map;
    }
    const sorted = [...points].sort((a, b) => b.revenue - a.revenue);
    sorted.forEach((p, i) => {
      // Top-revenue gets t=1, lowest gets t=0.
      const t = 1 - i / (sorted.length - 1);
      map.set(p.asin || `${p.brand}-${p.price}`, t);
    });
    return map;
  }, [points]);

  const tierBoundaries = useMemo(() => {
    if (points.length < 4) return null;
    const prices = points.map((p) => p.price);
    return {
      premiumFloor: quantile(prices, 0.67),
      midFloor: quantile(prices, 0.33)
    };
  }, [points]);

  const revenueBands = useMemo(() => {
    const revs = points.map((p) => p.revenue).filter((v) => Number.isFinite(v) && v > 0);
    const thresholds = getPercentileThresholds(revs);
    const extremes = getPercentileThresholds(revs, { low: 0.1, high: 0.9 });
    return { thresholds, extremes };
  }, [points]);

  const maxRevenue = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.revenue), 0),
    [points]
  );

  const tierFor = (price: number): 'premium' | 'mid' | 'value' => {
    if (!tierBoundaries) return 'mid';
    if (price >= tierBoundaries.premiumFloor) return 'premium';
    if (price >= tierBoundaries.midFloor) return 'mid';
    return 'value';
  };

  // 5-band revenue color (Dave: every revenue value should be tinted).
  // very_high → red (toughest competitor); high → amber; mid → yellow;
  // low → emerald-200; very_low → emerald-300.
  const revenueClass = (revenue: number): string => {
    const { thresholds, extremes } = revenueBands;
    const veryLow = REVENUE_OVERRIDES.veryLow;
    const low = REVENUE_OVERRIDES.low;
    const high = REVENUE_OVERRIDES.high;
    const veryHigh = REVENUE_OVERRIDES.veryHigh;
    if (!Number.isFinite(revenue) || revenue <= 0) return 'text-slate-500';
    if (revenue >= Math.max(veryHigh, extremes.high || 0)) return 'text-red-300';
    if (revenue >= Math.max(high, thresholds.high || 0)) return 'text-amber-300';
    if (revenue <= Math.min(veryLow, extremes.low || Infinity)) return 'text-emerald-300';
    if (revenue <= Math.min(low, thresholds.low || Infinity)) return 'text-emerald-200';
    return 'text-yellow-200';
  };

  // Row width — proportional to revenue. sqrt-compressed so the
  // smallest rows aren't a sliver while the leader still dominates.
  // Floor at 35% so even zero-revenue rows are clickable.
  const widthPctFor = (revenue: number) => {
    if (maxRevenue <= 0) return 100;
    const ratio = Math.max(0, revenue) / maxRevenue;
    const compressed = Math.sqrt(ratio);
    return 35 + compressed * 65;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'strong', label: 'Strong' },
            { key: 'decent', label: 'Decent' },
            { key: 'weak', label: 'Weak' }
          ].map((option) => {
            const isActive = strengthFilter === option.key;
            const tones: Record<string, string> = {
              all: 'bg-blue-500/20 text-blue-200 border-blue-500/60',
              strong: 'bg-red-500/20 text-red-200 border-red-500/60',
              decent: 'bg-amber-500/20 text-amber-200 border-amber-500/60',
              weak: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60'
            };
            return (
              <button
                key={`strength-${option.key}`}
                type="button"
                onClick={() => setStrengthFilter(option.key as 'all' | 'strong' | 'decent' | 'weak')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  isActive
                    ? tones[option.key]
                    : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 select-none">
            <input
              type="checkbox"
              checked={aggregateByBrand}
              onChange={(e) => setAggregateByBrand(e.target.checked)}
              className="accent-blue-500"
            />
            Aggregate by brand
          </label>
          {summary && (
            <div className="text-[12px] text-slate-400 whitespace-nowrap">
              <span className="text-slate-200 font-medium">{summary.count}</span>{' '}
              {aggregateByBrand ? 'brand' : 'competitor'}{summary.count === 1 ? '' : 's'}
              <span className="mx-2 text-slate-600">·</span>
              Range <span className="text-slate-200 font-medium">{formatCurrency(summary.min)}</span>–<span className="text-slate-200 font-medium">{formatCurrency(summary.max)}</span>
              <span className="mx-2 text-slate-600">·</span>
              Median <span className="text-slate-200 font-medium">{formatCurrency(summary.median)}</span>
            </div>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-900/30 text-sm text-slate-400">
          No competitors match the current filter.
        </div>
      ) : (
        <div>
          {points.map((row, idx) => {
            const thumb = imageUrlByAsin?.get(String(row.asin || '').toUpperCase());
            const tier = tierFor(row.price);
            const prevTier = idx === 0 ? null : tierFor(points[idx - 1].price);
            const showDividerAbove = idx === 0 || (prevTier !== null && prevTier !== tier);
            const tierLabel = tier === 'premium' ? 'Premium' : tier === 'mid' ? 'Mid' : 'Value';
            const widthPct = widthPctFor(row.revenue);
            const revColor = revenueClass(row.revenue);
            const rank = revenueRankByAsin.get(row.asin || `${row.brand}-${row.price}`) ?? 0;
            const grad = rowGradient(rank);
            return (
              <React.Fragment key={row.asin || `${row.brand}-${row.price}-${idx}`}>
                {showDividerAbove && tierBoundaries && (
                  <div className="flex items-center gap-3 pt-3 pb-1.5 pl-24">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{tierLabel}</span>
                    <span className="flex-1 h-px bg-slate-700/40" />
                  </div>
                )}
                <div className="flex items-stretch py-1">
                  <div className="w-20 flex-shrink-0 flex items-center justify-end pr-3 border-r border-slate-700/30">
                    <span className="text-[16px] font-bold tabular-nums text-slate-100">{formatCurrency(row.price)}</span>
                  </div>
                  <div className="flex-1 pl-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => openAmazon(row.asin)}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left hover:brightness-110"
                      style={{
                        width: `${widthPct}%`,
                        backgroundImage: grad.bg,
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        borderColor: grad.border
                      }}
                    >
                      <div className="flex-shrink-0">
                        {thumb && !row.isAggregated ? (
                          <img
                            src={thumb}
                            alt=""
                            className="w-9 h-9 object-contain rounded-md border border-slate-700/60 bg-slate-900/40"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-md border border-slate-700/60 bg-slate-900/40" aria-hidden />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100 truncate">{row.brand}</span>
                        <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${STRENGTH_CHIP[row.strengthLabel]}`}>
                          {STRENGTH_TEXT[row.strengthLabel]}
                        </span>
                        <span className="text-[11px] text-slate-200 font-medium">
                          {formatNumber(row.reviews)} reviews
                          {row.rating !== null && (
                            <>
                              <span className="mx-1.5 text-slate-500">·</span>
                              {row.rating.toFixed(1)}★
                            </>
                          )}
                        </span>
                        {row.isAggregated && (
                          <span className="text-[10px] text-slate-300">{row.listingCount} listings</span>
                        )}
                      </div>
                      <div className="flex-shrink-0 inline-flex items-baseline gap-1 px-2 py-1 rounded-md bg-slate-950/70 border border-slate-700/40 backdrop-blur-sm">
                        <span className={`text-[16px] font-bold tabular-nums ${revColor}`}>
                          {formatCurrency(row.revenue)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 leading-none">/mo</span>
                      </div>
                      <div className="flex-shrink-0 text-slate-300 group-hover:text-slate-100 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PriceMap;
