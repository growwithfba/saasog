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

// Mirrors the per-competitor revenue band logic in ProductVettingResults
// (Competitor Matrix). p20/p80 for thresholds, p10/p90 for extremes,
// plus the same hard overrides ($750/$1k/$10k/$15k) so a very small
// market doesn't skew the colors.
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

  const points = useMemo<PricePoint[]>(() => {
    const list = (competitors || [])
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
          strengthLabel: getCompetitorStrength(safeScore).label
        } as PricePoint;
      })
      .filter((p): p is PricePoint => Boolean(p));

    const filtered = strengthFilter === 'all'
      ? list
      : list.filter((p) => p.strengthLabel.toLowerCase() === strengthFilter);

    return filtered.sort((a, b) => b.price - a.price);
  }, [competitors, strengthFilter]);

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
    return 'text-slate-200';
  };

  // Row width — proportional to revenue. Use sqrt so the smallest rows
  // aren't reduced to a thin sliver while the leader still visually
  // dominates. Floor at 35% so even zero-revenue rows are clickable.
  const widthPctFor = (revenue: number) => {
    if (maxRevenue <= 0) return 100;
    const ratio = Math.max(0, revenue) / maxRevenue;
    const compressed = Math.sqrt(ratio); // 0..1
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
        {summary && (
          <div className="text-[12px] text-slate-400 whitespace-nowrap">
            <span className="text-slate-200 font-medium">{summary.count}</span> competitor{summary.count === 1 ? '' : 's'}
            <span className="mx-2 text-slate-600">·</span>
            Range <span className="text-slate-200 font-medium">{formatCurrency(summary.min)}</span>–<span className="text-slate-200 font-medium">{formatCurrency(summary.max)}</span>
            <span className="mx-2 text-slate-600">·</span>
            Median <span className="text-slate-200 font-medium">{formatCurrency(summary.median)}</span>
          </div>
        )}
      </div>

      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-900/30 text-sm text-slate-400">
          No competitors match the current filter.
        </div>
      ) : (
        <div className="space-y-1">
          {points.map((row, idx) => {
            const thumb = imageUrlByAsin?.get(String(row.asin || '').toUpperCase());
            const tier = tierFor(row.price);
            const prevTier = idx === 0 ? null : tierFor(points[idx - 1].price);
            const showDividerAbove = idx === 0 || (prevTier !== null && prevTier !== tier);
            const tierLabel = tier === 'premium' ? 'Premium' : tier === 'mid' ? 'Mid' : 'Value';
            const widthPct = widthPctFor(row.revenue);
            const revColor = revenueClass(row.revenue);
            return (
              <React.Fragment key={row.asin || `${row.brand}-${row.price}-${idx}`}>
                {showDividerAbove && tierBoundaries && (
                  <div className="flex items-center gap-3 pt-2 pb-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{tierLabel}</span>
                    <span className="flex-1 h-px bg-slate-700/40" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openAmazon(row.asin)}
                  className="group flex items-center gap-3 px-4 py-2.5 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-600/70 transition-colors text-left"
                  style={{ width: `${widthPct}%` }}
                >
                  <div className="w-20 flex-shrink-0">
                    <span className="text-[18px] font-bold tabular-nums text-slate-100">{formatCurrency(row.price)}</span>
                  </div>
                  <div className="flex-shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-10 h-10 object-contain rounded-md border border-slate-700/60 bg-slate-900/40"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md border border-slate-700/60 bg-slate-900/40" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-slate-100 truncate">{row.brand}</span>
                      <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${STRENGTH_CHIP[row.strengthLabel]}`}>
                        {STRENGTH_TEXT[row.strengthLabel]}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{formatNumber(row.reviews)} reviews</span>
                      {row.rating !== null && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span>{row.rating.toFixed(1)}★</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-[16px] font-bold tabular-nums ${revColor}`}>
                      {formatCurrency(row.revenue)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">/mo</div>
                  </div>
                  <div className="flex-shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PriceMap;
