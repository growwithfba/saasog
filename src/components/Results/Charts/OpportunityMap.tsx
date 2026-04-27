'use client';

import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { calculateScore, getCompetitorStrength, safeParseNumber } from '@/utils/scoring';

type OpportunityMapProps = {
  competitors: any[];
  imageUrlByAsin?: Map<string, string | null>;
};

type PricePoint = {
  asin: string;
  brand: string;
  price: number;
  revenue: number;
  reviews: number;
  rating: number | null;
  score: number;
  strengthLabel: 'STRONG' | 'DECENT' | 'WEAK';
};

const STRENGTH_TONE: Record<PricePoint['strengthLabel'], { stripe: string; chip: string; text: string }> = {
  STRONG: {
    stripe: 'bg-red-500',
    chip: 'bg-red-500/15 text-red-300 border-red-500/40',
    text: 'Strong'
  },
  DECENT: {
    stripe: 'bg-amber-500',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    text: 'Decent'
  },
  WEAK: {
    stripe: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    text: 'Weak'
  }
};

const quantile = (values: number[], pct: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * pct;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const pickTickStep = (range: number) => {
  if (range <= 0) return 1;
  if (range <= 10) return 1;
  if (range <= 25) return 5;
  if (range <= 60) return 10;
  if (range <= 120) return 20;
  if (range <= 300) return 50;
  return 100;
};

const buildPriceTicks = (min: number, max: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [Math.max(0, Math.floor(min || 0))];
  }
  const step = pickTickStep(max - min);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + 0.001; v += step) {
    ticks.push(Math.round(v));
  }
  return ticks;
};

const openAmazon = (asin: string) => {
  if (!asin || typeof window === 'undefined') return;
  window.open(`https://www.amazon.com/dp/${asin}`, '_blank', 'noopener,noreferrer');
};

const OpportunityMap: React.FC<OpportunityMapProps> = ({ competitors, imageUrlByAsin }) => {
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'decent' | 'weak'>('all');
  const [revenueTierFilter, setRevenueTierFilter] = useState<'all' | 'leaders' | 'mid' | 'tail'>('all');

  const strengthFilteredCompetitors = useMemo(() => {
    if (strengthFilter === 'all') return competitors || [];
    return (competitors || []).filter((competitor) => {
      const score = parseFloat(calculateScore(competitor));
      if (!Number.isFinite(score)) return false;
      return getCompetitorStrength(score).label.toLowerCase() === strengthFilter;
    });
  }, [competitors, strengthFilter]);

  const revenueThresholds = useMemo(() => {
    const revenues = strengthFilteredCompetitors
      .map((c) => safeParseNumber(c?.monthlyRevenue))
      .filter((v) => Number.isFinite(v));
    return {
      leaders: quantile(revenues, 0.8),
      tail: quantile(revenues, 0.4)
    };
  }, [strengthFilteredCompetitors]);

  const filteredCompetitors = useMemo(() => {
    if (revenueTierFilter === 'all') return strengthFilteredCompetitors;
    return strengthFilteredCompetitors.filter((c) => {
      const r = safeParseNumber(c?.monthlyRevenue);
      if (!Number.isFinite(r)) return false;
      if (revenueTierFilter === 'leaders') return r >= revenueThresholds.leaders;
      if (revenueTierFilter === 'tail') return r <= revenueThresholds.tail;
      return r > revenueThresholds.tail && r < revenueThresholds.leaders;
    });
  }, [revenueTierFilter, revenueThresholds, strengthFilteredCompetitors]);

  const points = useMemo<PricePoint[]>(() => {
    return filteredCompetitors
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
          price,
          revenue: Number.isFinite(revenue) ? revenue : 0,
          reviews: Number.isFinite(reviews) ? reviews : 0,
          rating: rating > 0 && rating <= 5 ? rating : null,
          score: safeScore,
          strengthLabel: getCompetitorStrength(safeScore).label
        } as PricePoint;
      })
      .filter((p): p is PricePoint => Boolean(p))
      .sort((a, b) => b.price - a.price);
  }, [filteredCompetitors]);

  // Lay each row out at a y-position proportional to its price. Rows
  // are 64px tall; the track expands so even tightly-clustered prices
  // get readable spacing without forcing huge dead space when one
  // outlier sits far above the pack.
  const layout = useMemo(() => {
    if (points.length === 0) {
      return { rows: [] as Array<PricePoint & { top: number }>, ticks: [] as number[], height: 0, minPrice: 0, maxPrice: 0 };
    }
    const minPrice = Math.min(...points.map((p) => p.price));
    const maxPrice = Math.max(...points.map((p) => p.price));
    const range = Math.max(0.01, maxPrice - minPrice);
    const rowHeight = 72;
    const minGap = 8;
    const idealHeight = Math.max(360, points.length * (rowHeight + 16));
    const height = idealHeight;
    const usable = Math.max(0, height - rowHeight);
    const yForPrice = (price: number) => ((maxPrice - price) / range) * usable;

    // Greedy collision push-down: keep rows from overlapping when prices
    // bunch up. Walk top→bottom in price-desc order; each row's top is
    // max(idealTop, prevTop + rowHeight + minGap).
    const rows: Array<PricePoint & { top: number }> = [];
    let prevBottom = -minGap;
    for (const point of points) {
      const ideal = yForPrice(point.price);
      const top = Math.max(ideal, prevBottom + minGap);
      rows.push({ ...point, top });
      prevBottom = top + rowHeight;
    }
    const finalHeight = Math.max(height, prevBottom + 4);
    return {
      rows,
      ticks: buildPriceTicks(minPrice, maxPrice),
      height: finalHeight,
      minPrice,
      maxPrice
    };
  }, [points]);

  const tickYForPrice = (price: number) => {
    const range = Math.max(0.01, layout.maxPrice - layout.minPrice);
    const usable = Math.max(0, layout.height - 72);
    return ((layout.maxPrice - price) / range) * usable;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
        <span className="text-slate-500 text-xs">|</span>
        {[
          { key: 'all', label: 'All' },
          { key: 'leaders', label: 'Leaders' },
          { key: 'mid', label: 'Mid' },
          { key: 'tail', label: 'Tail' }
        ].map((option) => {
          const isActive = revenueTierFilter === option.key;
          return (
            <button
              key={`tier-${option.key}`}
              type="button"
              onClick={() => setRevenueTierFilter(option.key as 'all' | 'leaders' | 'mid' | 'tail')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-slate-700/60 text-slate-100 border-slate-500/60'
                  : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {layout.rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-900/30 text-sm text-slate-400">
          No competitors match the current filters.
        </div>
      ) : (
        <div className="flex">
          {/* Price tick column */}
          <div
            className="relative w-16 shrink-0 border-r border-slate-700/40"
            style={{ height: layout.height }}
          >
            {layout.ticks.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-2 flex items-center justify-end gap-2"
                style={{ top: tickYForPrice(tick) }}
              >
                <span className="text-[11px] font-mono tabular-nums text-slate-500">${tick}</span>
                <span className="block h-px w-2 bg-slate-700/60" />
              </div>
            ))}
          </div>

          {/* Competitor cards docked at their price */}
          <div className="relative flex-1" style={{ height: layout.height }}>
            {layout.rows.map((row) => {
              const tone = STRENGTH_TONE[row.strengthLabel];
              const thumb = imageUrlByAsin?.get(String(row.asin || '').toUpperCase());
              return (
                <button
                  key={row.asin || `${row.brand}-${row.price}`}
                  type="button"
                  onClick={() => openAmazon(row.asin)}
                  className="absolute left-3 right-0 group flex items-stretch gap-3 rounded-lg border border-slate-700/50 bg-slate-800/60 hover:bg-slate-800/80 hover:border-slate-600/70 transition-colors text-left"
                  style={{ top: row.top, height: 64 }}
                >
                  <span className={`block w-1 rounded-l-lg ${tone.stripe}`} aria-hidden />
                  <div className="flex-shrink-0 self-center">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-12 h-12 object-contain rounded-md border border-slate-700/60 bg-slate-900/40"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md border border-slate-700/60 bg-slate-900/40" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 self-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-slate-100 truncate">{row.brand}</span>
                      <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${tone.chip}`}>
                        {tone.text}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-400">
                      <span className="font-mono tabular-nums text-slate-200">{formatCurrency(row.price)}</span>
                      <span className="text-slate-600">·</span>
                      <span><span className="text-emerald-400 font-medium">{formatCurrency(row.revenue)}</span>/mo</span>
                      <span className="text-slate-600">·</span>
                      <span>{formatNumber(row.reviews)} reviews</span>
                      {row.rating !== null && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span>{row.rating.toFixed(1)}★</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="self-center pr-3 text-slate-500 group-hover:text-slate-300 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default OpportunityMap;
