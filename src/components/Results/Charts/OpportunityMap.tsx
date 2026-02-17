import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { calculateScore, getCompetitorStrength, safeParseNumber } from '@/utils/scoring';

type OpportunityMapProps = {
  competitors: any[];
};

type OpportunityPoint = {
  xJitter: number;
  price: number;
  revenue: number;
  r: number;
  reviews: number;
  brand: string;
  asin: string;
  score: number;
  strengthLabel: 'STRONG' | 'DECENT' | 'WEAK';
  fill: string;
  stroke: string;
};

const strengthPalette: Record<OpportunityPoint['strengthLabel'], { fill: string; stroke: string }> = {
  STRONG: { fill: '#f87171', stroke: '#fca5a5' },
  DECENT: { fill: '#fbbf24', stroke: '#fcd34d' },
  WEAK: { fill: '#34d399', stroke: '#6ee7b7' }
};

const clamp = (min: number, max: number, value: number) => Math.min(max, Math.max(min, value));

const quantile = (values: number[], pct: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * pct;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const median = (values: number[]) => quantile(values, 0.5);

const deterministicJitter = (asin: string, magnitude = 0.4) => {
  if (!asin) return 0;
  let hash = 0;
  for (let i = 0; i < asin.length; i += 1) {
    hash = (hash * 31 + asin.charCodeAt(i)) % 1000;
  }
  const normalized = (hash % 100) / 100;
  return (normalized * 2 - 1) * magnitude;
};

const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) return '$0.00';
  return formatCurrency(value);
};

const formatRevenueTick = (value: number) => {
  if (!Number.isFinite(value)) return '$0';
  if (value >= 1000) {
    const scaled = value / 1000;
    const fixed = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1);
    return `$${fixed}k`;
  }
  return `$${Math.round(value)}`;
};

const roundUpToDot99 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const base = Math.floor(value);
  const candidate = base + 0.99;
  return value <= candidate ? candidate : base + 1.99;
};

const formatPriceTick = (value: number) => formatPrice(roundUpToDot99(value));

const OpportunityMap: React.FC<OpportunityMapProps> = ({ competitors }) => {
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'decent' | 'weak'>('all');
  const [revenueTierFilter, setRevenueTierFilter] = useState<'all' | 'leaders' | 'mid' | 'tail'>('all');
  const [fitToData, setFitToData] = useState(true);
  const [selectedAsin, setSelectedAsin] = useState<string | null>(null);
  const [selectedTooltipPosition, setSelectedTooltipPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [hoveredAsin, setHoveredAsin] = useState<string | null>(null);

  const strengthFilteredCompetitors = useMemo(() => {
    if (strengthFilter === 'all') return competitors || [];
    return (competitors || []).filter((competitor) => {
      const score = parseFloat(calculateScore(competitor));
      if (!Number.isFinite(score)) return false;
      const label = getCompetitorStrength(score).label.toLowerCase();
      return label === strengthFilter;
    });
  }, [competitors, strengthFilter]);

  const revenueThresholds = useMemo(() => {
    const revenues = strengthFilteredCompetitors
      .map((competitor) => safeParseNumber(competitor?.monthlyRevenue))
      .filter((value) => Number.isFinite(value));

    return {
      leaders: quantile(revenues, 0.8),
      tail: quantile(revenues, 0.4)
    };
  }, [strengthFilteredCompetitors]);

  const filteredCompetitors = useMemo(() => {
    if (revenueTierFilter === 'all') return strengthFilteredCompetitors;
    return strengthFilteredCompetitors.filter((competitor) => {
      const revenue = safeParseNumber(competitor?.monthlyRevenue);
      if (!Number.isFinite(revenue)) return false;
      if (revenueTierFilter === 'leaders') return revenue >= revenueThresholds.leaders;
      if (revenueTierFilter === 'tail') return revenue <= revenueThresholds.tail;
      return revenue > revenueThresholds.tail && revenue < revenueThresholds.leaders;
    });
  }, [revenueTierFilter, revenueThresholds, strengthFilteredCompetitors]);

  const medianStats = useMemo(() => {
    const prices = filteredCompetitors
      .map((competitor) => safeParseNumber(competitor?.price))
      .filter((value) => value > 0);
    const revenues = filteredCompetitors
      .map((competitor) => safeParseNumber(competitor?.monthlyRevenue))
      .filter((value) => value >= 0);
    const reviews = filteredCompetitors
      .map((competitor) => safeParseNumber(competitor?.reviews))
      .filter((value) => value >= 0);

    return {
      medianPrice: prices.length ? median(prices) : 0,
      medianRevenue: revenues.length ? median(revenues) : 0,
      medianReviews: reviews.length ? median(reviews) : 0
    };
  }, [filteredCompetitors]);

  const points = useMemo<OpportunityPoint[]>(() => {
    return filteredCompetitors
      .map((competitor) => {
        const price = safeParseNumber(competitor?.price);
        const revenue = safeParseNumber(competitor?.monthlyRevenue);
        if (price <= 0 || revenue < 0) return null;

        const reviews = safeParseNumber(competitor?.reviews);
        const score = parseFloat(calculateScore(competitor));
        const safeScore = Number.isFinite(score) ? score : 0;
        const strength = getCompetitorStrength(safeScore);
        const minR = 4;
        const maxR = 16;
        const radius = clamp(minR, maxR, minR + Math.sqrt(Math.max(reviews, 0)) * 0.4);
        const palette = strengthPalette[strength.label];
        const asin = competitor?.asin || '';

        return {
          xJitter: price + deterministicJitter(asin, 0.4),
          price,
          revenue,
          r: radius,
          reviews,
          brand: competitor?.brand || 'Unknown Brand',
          asin,
          score: safeScore,
          strengthLabel: strength.label,
          fill: palette.fill,
          stroke: palette.stroke
        };
      })
      .filter((point): point is OpportunityPoint => Boolean(point));
  }, [filteredCompetitors]);

  const axisDomains = useMemo(() => {
    const fullPrices = (competitors || [])
      .map((competitor) => safeParseNumber(competitor?.price))
      .filter((value) => value > 0);
    const fullRevenues = (competitors || [])
      .map((competitor) => safeParseNumber(competitor?.monthlyRevenue))
      .filter((value) => value >= 0);
    const visiblePrices = points.map((point) => point.price).filter((value) => value > 0);
    const visibleRevenues = points.map((point) => point.revenue).filter((value) => value >= 0);

    const buildFitDomain = (values: number[], minPad: number) => {
      if (values.length < 2) return null;
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      if (minValue === maxValue) {
        return [Math.max(0, minValue - minPad), maxValue + minPad] as [number, number];
      }
      const range = maxValue - minValue;
      const pad = Math.max(minPad, range * 0.08);
      return [Math.max(0, minValue - pad), maxValue + pad] as [number, number];
    };

    const buildRevenueDomain = (values: number[]) => {
      if (values.length < 2) return null;
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      const range = maxValue - minValue;
      const pad = range * 0.1;
      const maxWithPad = maxValue + pad;
      return [0, maxWithPad] as [number, number];
    };

    const fullX = buildFitDomain(fullPrices, 1) ?? [0, 60];
    const fullY = buildRevenueDomain(fullRevenues) ?? [0, 20000];
    const fitX = buildFitDomain(visiblePrices, 1) ?? fullX;
    const fitY = buildRevenueDomain(visibleRevenues) ?? fullY;

    return { fullX, fullY, fitX, fitY };
  }, [competitors, points]);

  const activeDomains = fitToData
    ? { x: axisDomains.fitX, y: axisDomains.fitY }
    : { x: axisDomains.fullX, y: axisDomains.fullY };

  const selectedPoint = useMemo(() => {
    if (!selectedAsin) return null;
    return points.find((point) => point.asin === selectedAsin) ?? null;
  }, [points, selectedAsin]);

  useEffect(() => {
    if (selectedAsin && !selectedPoint) {
      setSelectedAsin(null);
      setSelectedTooltipPosition(null);
    }
  }, [selectedAsin, selectedPoint]);

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
          const strengthClasses: Record<string, string> = {
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
                  ? (strengthClasses[option.key] || 'bg-slate-700/60 text-slate-100 border-slate-500/60')
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
              onClick={() =>
                setRevenueTierFilter(option.key as 'all' | 'leaders' | 'mid' | 'tail')
              }
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
        <span className="text-slate-500 text-xs">|</span>
        <span className="text-xs text-slate-500">Axis range</span>
        {[
          { key: 'fit', label: 'Fit to data', value: true },
          { key: 'full', label: 'Full range', value: false }
        ].map((option) => {
          const isActive = fitToData === option.value;
          return (
            <button
              key={`range-${option.key}`}
              type="button"
              onClick={() => setFitToData(option.value)}
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
      <div className="flex">
        <div className="flex items-center pr-3 text-xs text-slate-400">
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            Monthly revenue
          </span>
        </div>
        <div className="flex-1">
          <div className="relative h-[420px]">
            {points.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No valid price or revenue data to plot.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 28, bottom: 44, left: 52 }}
                  onClick={() => {
                    setSelectedAsin(null);
                    setSelectedTooltipPosition(null);
                    setHoveredAsin(null);
                  }}
                  onMouseLeave={() => setHoveredAsin(null)}
                >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
              <XAxis
                type="number"
                dataKey="xJitter"
                name="Price"
                domain={activeDomains.x}
                tickCount={5}
                tickFormatter={formatPriceTick}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickMargin={12}
                angle={-20}
                textAnchor="end"
                axisLine={{ stroke: 'rgba(148, 163, 184, 0.3)' }}
              />
              <YAxis
                type="number"
                dataKey="revenue"
                name="Monthly Revenue"
                domain={activeDomains.y}
                tickCount={5}
                tickFormatter={formatRevenueTick}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickMargin={12}
                axisLine={{ stroke: 'rgba(148, 163, 184, 0.3)' }}
              />
              {Number.isFinite(medianStats.medianPrice) && medianStats.medianPrice > 0 && (
                <ReferenceLine
                  x={medianStats.medianPrice}
                  stroke="rgba(148, 163, 184, 0.5)"
                  strokeDasharray="4 4"
                />
              )}
              {Number.isFinite(medianStats.medianRevenue) && medianStats.medianRevenue > 0 && (
                <ReferenceLine
                  y={medianStats.medianRevenue}
                  stroke="rgba(148, 163, 184, 0.5)"
                  strokeDasharray="4 4"
                />
              )}
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                active={Boolean(selectedAsin) || undefined}
                position={selectedTooltipPosition || undefined}
                content={({ active, payload }) => {
                  const tooltipData = selectedPoint ?? (payload?.[0]?.payload as OpportunityPoint | undefined);
                  if (!tooltipData || (!active && !selectedAsin)) return null;
                  const strengthLabel = tooltipData.strengthLabel.toLowerCase();
                  const strengthText = strengthLabel.charAt(0).toUpperCase() + strengthLabel.slice(1);
                  return (
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-xl">
                      <p className="text-gray-900 dark:text-slate-200 font-medium mb-1">
                        {tooltipData.brand}
                      </p>
                      {tooltipData.asin && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          {tooltipData.asin}
                        </p>
                      )}
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Revenue</span>
                          <span className="text-emerald-500 dark:text-emerald-400 font-semibold">
                            {formatCurrency(tooltipData.revenue)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Price</span>
                          <span className="text-slate-900 dark:text-slate-200 font-medium">
                            {formatPrice(tooltipData.price)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Reviews</span>
                          <span className="text-slate-900 dark:text-slate-200 font-medium">
                            {formatNumber(tooltipData.reviews)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Competitor score</span>
                          <span className="text-slate-900 dark:text-slate-200 font-medium">
                            {tooltipData.score.toFixed(1)}% ({strengthText})
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
                  const isSelected = selectedAsin && payload?.asin === selectedAsin;
                  const isHovered = hoveredAsin && payload?.asin === hoveredAsin;
                  const fillOpacity = isHovered ? 0.9 : 0.75;
                  const handleClick = (event: React.MouseEvent<SVGGElement, MouseEvent>) => {
                    event.stopPropagation();
                    if (payload?.asin) {
                      if (selectedAsin === payload.asin) {
                        if (typeof window !== 'undefined') {
                          window.open(
                            `https://www.amazon.com/dp/${payload.asin}`,
                            '_blank',
                            'noopener,noreferrer'
                          );
                        }
                        return;
                      }
                      setSelectedAsin(payload.asin);
                      setSelectedTooltipPosition({ x: cx, y: cy });
                    }
                  };
                  return (
                    <g
                      onClick={handleClick}
                      onMouseEnter={() => payload?.asin && setHoveredAsin(payload.asin)}
                      onMouseLeave={() => setHoveredAsin(null)}
                      style={{ cursor: payload?.asin ? 'pointer' : 'default' }}
                    >
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={payload.r + 3}
                          fill="none"
                          stroke={payload.stroke}
                          strokeWidth={1.5}
                          opacity={0.85}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={payload.r}
                        fill={payload.fill}
                        fillOpacity={fillOpacity}
                        stroke={payload.stroke}
                        strokeWidth={isHovered && !isSelected ? 1.25 : 1}
                      />
                    </g>
                  );
                }}
              />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="pt-2 text-center text-xs text-slate-400">Price</div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityMap;
