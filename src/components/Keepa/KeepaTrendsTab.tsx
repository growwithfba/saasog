import React, { useMemo, useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Label
} from 'recharts';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import SignalBadge from './SignalBadge';

interface KeepaTrendsTabProps {
  analysis: KeepaAnalysisSnapshot;
}

type TrendRow = {
  month: string;
  [key: string]: number | string | undefined;
};

type MetricView = 'both' | 'price' | 'bsr';

type SeriesConfig = {
  key: string;
  label: string;
  entityKey: string;
  entityLabel: string;
  metric: 'price' | 'bsr';
  color: string;
  strokeWidth: number;
  dashed?: boolean;
};

const formatCurrencyCompact = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const formatNumberCompact = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
};

const formatCurrencyTick = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
};

const formatBsrTick = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `#${formatNumberCompact(value)}`;
};

const formatNumberFull = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const formatCurrencyFull = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `$${value.toFixed(2)}`;
};

const formatMonthLabel = (monthKey?: string | null) => {
  if (!monthKey) return 'Not enough history';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${labels[month - 1]} ${year}`;
};

const formatMonthAxisLabel = (monthKey?: string | null) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
};

const getNextMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
};

const sliceToMonths = (series: Array<{ month: string }>, rangeMonths: 12 | 24) => {
  if (series.length <= rangeMonths) return series;
  return series.slice(series.length - rangeMonths);
};

const MARKET_PRICE_KEY = 'marketPrice';
const MARKET_BSR_KEY = 'marketBsr';
const BASE_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa'];
const AVG_LINE_COLOR = '#94a3b8';
const PROMO_FILL = 'rgba(34, 197, 94, 0.08)';
const PROMO_STROKE = 'rgba(34, 197, 94, 0.15)';

type EntityConfig = {
  key: string;
  label: string;
  priceKey: string;
  bsrKey: string;
  color: string;
};

type LegendItemConfig = {
  key: string;
  label: string;
  color: string;
  style: 'solid' | 'dashed' | 'fill';
};

const LegendItem: React.FC<LegendItemConfig> = ({ label, color, style }) => (
  <div className="flex items-center gap-2">
    <span
      className="inline-block h-2.5 w-6 rounded"
      style={{
        borderTopWidth: style === 'fill' ? 0 : 2,
        borderTopStyle: style === 'fill' ? 'solid' : style === 'dashed' ? 'dashed' : 'solid',
        borderTopColor: style === 'fill' ? 'transparent' : color,
        backgroundColor: style === 'fill' ? PROMO_FILL : undefined,
        boxShadow: style === 'fill' ? `inset 0 0 0 1px ${PROMO_STROKE}` : undefined
      }}
    />
    <span>{label}</span>
  </div>
);

const KeepaTrendsTab: React.FC<KeepaTrendsTabProps> = ({ analysis }) => {
  const [rangeMonths, setRangeMonths] = useState<12 | 24>(24);
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [showMarket, setShowMarket] = useState(true);
  const [metricView, setMetricView] = useState<MetricView>('both');
  const [showLimitNotice, setShowLimitNotice] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('keepa_trends_range');
    if (stored === '12' || stored === '24') {
      setRangeMonths(Number(stored) as 12 | 24);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('keepa_trends_range', String(rangeMonths));
  }, [rangeMonths]);

  useEffect(() => {
    if (!showLimitNotice) return undefined;
    const timeout = window.setTimeout(() => setShowLimitNotice(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [showLimitNotice]);

  const competitorOptions = useMemo(() => {
    return analysis.computed.competitors.map(item => ({
      value: item.asin,
      label: item.brand || item.title || item.asin,
      hasData: item.monthlySeries.some(point => Number.isFinite(point.price) || Number.isFinite(point.bsr))
    }));
  }, [analysis]);

  const marketSeries = useMemo(
    () => sliceToMonths(analysis.computed.trends.marketSeries, rangeMonths),
    [analysis, rangeMonths]
  );

  const selectedCompetitorDetails = useMemo(() => {
    return selectedCompetitors
      .map(asin => {
        const competitor = analysis.computed.competitors.find(item => item.asin === asin);
        if (!competitor) return null;
        const label = competitor.brand || competitor.title || competitor.asin;
        const hasData = competitor.monthlySeries.some(point => Number.isFinite(point.price) || Number.isFinite(point.bsr));
        if (!hasData) return null;
        return {
          asin,
          label,
          priceKey: `competitor_${asin}_price`,
          bsrKey: `competitor_${asin}_bsr`,
          series: sliceToMonths(competitor.monthlySeries, rangeMonths)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [analysis, rangeMonths, selectedCompetitors]);

  const mergedSeries = useMemo(() => {
    const merged = new Map<string, TrendRow>();
    if (showMarket) {
      marketSeries.forEach(item => {
        merged.set(item.month, { month: item.month, [MARKET_PRICE_KEY]: item.price, [MARKET_BSR_KEY]: item.bsr });
      });
    }
    selectedCompetitorDetails.forEach(detail => {
      detail.series.forEach(item => {
        const existing = merged.get(item.month) || { month: item.month };
        merged.set(item.month, {
          ...existing,
          [detail.priceKey]: item.price,
          [detail.bsrKey]: item.bsr
        });
      });
    });
    const rows = Array.from(merged.values()).sort((a, b) => a.month.localeCompare(b.month));
    return rows;
  }, [marketSeries, selectedCompetitorDetails, showMarket]);

  const marketAveragePrice = useMemo(() => {
    const values = marketSeries.map(item => item.price).filter((value): value is number => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [marketSeries]);

  const showPrice = metricView !== 'bsr';
  const showBsr = metricView !== 'price';

  const visiblePriceKeys = useMemo(() => {
    if (!showPrice) return [];
    const keys = selectedCompetitorDetails.map(item => item.priceKey);
    return showMarket ? [MARKET_PRICE_KEY, ...keys] : keys;
  }, [selectedCompetitorDetails, showMarket, showPrice]);

  const visibleBsrKeys = useMemo(() => {
    if (!showBsr) return [];
    const keys = selectedCompetitorDetails.map(item => item.bsrKey);
    return showMarket ? [MARKET_BSR_KEY, ...keys] : keys;
  }, [selectedCompetitorDetails, showBsr, showMarket]);

  const priceMax = useMemo(() => {
    if (!visiblePriceKeys.length) return null;
    const values = mergedSeries
      .flatMap(item => visiblePriceKeys.map(key => item[key]))
      .filter((value): value is number => Number.isFinite(value));
    return values.length ? Math.max(...values) : null;
  }, [mergedSeries, visiblePriceKeys]);

  const bsrMax = useMemo(() => {
    if (!visibleBsrKeys.length) return null;
    const values = mergedSeries
      .flatMap(item => visibleBsrKeys.map(key => item[key]))
      .filter((value): value is number => Number.isFinite(value));
    return values.length ? Math.max(...values) : null;
  }, [mergedSeries, visibleBsrKeys]);

  const priceDomain = priceMax ? [0, Math.ceil(priceMax * 1.1)] : undefined;
  const bsrDomain = bsrMax ? [0, Math.ceil(bsrMax * 1.1)] : undefined;

  const averagePriceForChart = useMemo(() => {
    if (!visiblePriceKeys.length) return null;
    const values = mergedSeries
      .flatMap(item => visiblePriceKeys.map(key => item[key]))
      .filter((value): value is number => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [mergedSeries, visiblePriceKeys]);

  const averageBsrForChart = useMemo(() => {
    if (!visibleBsrKeys.length) return null;
    const values = mergedSeries
      .flatMap(item => visibleBsrKeys.map(key => item[key]))
      .filter((value): value is number => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [mergedSeries, visibleBsrKeys]);

  const promoMonths = useMemo(() => {
    const monthKeys = new Set<string>();
    analysis.computed.trends.promoEvents.forEach(event => {
      const monthKey = new Date(event.start).toISOString().slice(0, 7);
      monthKeys.add(monthKey);
    });
    return Array.from(monthKeys);
  }, [analysis]);

  const promoMonthSet = useMemo(() => new Set(promoMonths), [promoMonths]);

  const entityList = useMemo(() => {
    const entities: Array<Omit<EntityConfig, 'color'>> = [];
    if (showMarket) {
      entities.push({
        key: 'market',
        label: 'Market',
        priceKey: MARKET_PRICE_KEY,
        bsrKey: MARKET_BSR_KEY
      });
    }
    selectedCompetitorDetails.forEach(detail => {
      entities.push({
        key: detail.asin,
        label: detail.label,
        priceKey: detail.priceKey,
        bsrKey: detail.bsrKey
      });
    });
    return entities.map((entity, index) => ({
      ...entity,
      color: BASE_COLORS[index]
    }));
  }, [selectedCompetitorDetails, showMarket]);

  const seriesConfigs = useMemo(() => {
    const configs: SeriesConfig[] = [];
    entityList.forEach(entity => {
      const isMarket = entity.key === 'market';
      if (showPrice) {
        configs.push({
          key: entity.priceKey,
          label: `${entity.label} Price`,
          entityKey: entity.key,
          entityLabel: entity.label,
          metric: 'price',
          color: entity.color,
          strokeWidth: isMarket ? 3 : 2.2
        });
      }
      if (showBsr) {
        configs.push({
          key: entity.bsrKey,
          label: `${entity.label} BSR`,
          entityKey: entity.key,
          entityLabel: entity.label,
          metric: 'bsr',
          color: entity.color,
          strokeWidth: isMarket ? 2.2 : 1.6,
          dashed: true
        });
      }
    });
    return configs;
  }, [entityList, showBsr, showPrice]);

  const seriesConfigMap = useMemo(
    () => new Map(seriesConfigs.map(config => [config.key, config])),
    [seriesConfigs]
  );

  const legendItems = useMemo(() => {
    const items: LegendItemConfig[] = [];
    entityList.forEach(entity => {
      if (showPrice) {
        items.push({
          key: `${entity.key}-price`,
          label: `${entity.label} Price`,
          color: entity.color,
          style: 'solid'
        });
      }
      if (showBsr) {
        items.push({
          key: `${entity.key}-bsr`,
          label: `${entity.label} BSR`,
          color: entity.color,
          style: 'dashed'
        });
      }
    });
    if (promoMonths.length) {
      items.push({
        key: 'promo-periods',
        label: 'Promo periods',
        color: PROMO_STROKE,
        style: 'fill'
      });
    }
    return items;
  }, [entityList, promoMonths.length, showBsr, showPrice]);

  const priceRangeWidthPct = useMemo(() => {
    const min = analysis.computed.trends.typicalPriceRange.min;
    const max = analysis.computed.trends.typicalPriceRange.max;
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(marketAveragePrice) || !marketAveragePrice) {
      return null;
    }
    return ((max - min) / marketAveragePrice) * 100;
  }, [analysis, marketAveragePrice]);

  const priceDropTone = useMemo(() => {
    const drop = analysis.computed.trends.largestPriceDrop.pct;
    if (!Number.isFinite(drop)) return 'text-slate-300';
    if ((drop as number) >= 25) return 'text-rose-300';
    if ((drop as number) >= 15) return 'text-amber-300';
    return 'text-emerald-300';
  }, [analysis]);

  const priceRangeTone = useMemo(() => {
    if (!Number.isFinite(priceRangeWidthPct)) return 'text-slate-300';
    if ((priceRangeWidthPct as number) >= 40) return 'text-rose-300';
    if ((priceRangeWidthPct as number) >= 20) return 'text-amber-300';
    return 'text-emerald-300';
  }, [priceRangeWidthPct]);

  const handleAddCompetitor = (asin: string) => {
    if (!asin) return;
    if (selectedCompetitors.includes(asin)) return;
    if (selectedCompetitors.length >= 2) {
      setShowLimitNotice(true);
      return;
    }
    setSelectedCompetitors(prev => [...prev, asin]);
  };

  const handleRemoveCompetitor = (asin: string) => {
    setSelectedCompetitors(prev => prev.filter(item => item !== asin));
  };

  const averageLabel = (value: number, metric: 'price' | 'bsr') => {
    return metric === 'price' ? `Avg ${formatCurrencyFull(value)}` : `Avg #${formatNumberFull(value)}`;
  };

  const renderAverageLabel = (text: string) =>
    ({ viewBox }: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
      if (!viewBox) return null;
      const paddingX = 6;
      const paddingY = 3;
      const textWidth = Math.max(40, text.length * 6.5);
      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = 16 + paddingY;
      const x = viewBox.x + viewBox.width + 8;
      const y = viewBox.y - rectHeight / 2;
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={rectWidth}
            height={rectHeight}
            rx={8}
            fill="rgba(15, 23, 42, 0.85)"
            stroke="rgba(148, 163, 184, 0.4)"
          />
          <text x={x + paddingX} y={y + rectHeight / 2 + 3} fill="#e2e8f0" fontSize="10">
            {text}
          </text>
        </g>
      );
    };

  const renderBsrAxisLabel = ({ viewBox }: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
    if (!viewBox) return null;
    const x = viewBox.x + viewBox.width + 12;
    const y = viewBox.y + viewBox.height / 2;
    return (
      <text x={x} y={y} textAnchor="start" fill="#94a3b8">
        <tspan x={x} dy="-0.4em">
          Best Seller Rank (BSR)
        </tspan>
        <tspan x={x} dy="1.2em" fontSize="10" fill="#64748b">
          Lower = better rank
        </tspan>
      </text>
    );
  };

  const marketColor = showMarket
    ? entityList.find(entity => entity.key === 'market')?.color ?? BASE_COLORS[0]
    : BASE_COLORS[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm text-slate-400">Compare with</div>
          <button
            type="button"
            onClick={() => setShowMarket(prev => !prev)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              showMarket
                ? 'bg-slate-900/40 text-slate-100'
                : 'border-slate-700/60 bg-slate-900/50 text-slate-300'
            }`}
            style={
              showMarket
                ? {
                    borderColor: `${marketColor}88`,
                    boxShadow: `0 0 12px ${marketColor}33`,
                    color: marketColor,
                    backgroundColor: 'rgba(15, 23, 42, 0.35)'
                  }
                : undefined
            }
          >
            Market {showMarket ? 'On' : 'Off'}
          </button>
          <select
            value=""
            onChange={event => handleAddCompetitor(event.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
          >
            <option value="">Add competitor…</option>
            {competitorOptions.map(option => (
              <option
                key={option.value}
                value={option.value}
                disabled={!option.hasData || selectedCompetitors.includes(option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          {selectedCompetitors.map(asin => {
            const competitor = competitorOptions.find(option => option.value === asin);
            const entityColor = entityList.find(entity => entity.key === asin)?.color;
            return (
              <button
                key={asin}
                type="button"
                onClick={() => handleRemoveCompetitor(asin)}
                className="rounded-full border px-3 py-1 text-xs text-slate-200 hover:border-slate-500/70"
                style={{
                  borderColor: entityColor ? `${entityColor}55` : 'rgba(148, 163, 184, 0.4)',
                  boxShadow: entityColor ? `0 0 12px ${entityColor}33` : undefined,
                  color: entityColor ?? undefined
                }}
              >
                {competitor?.label || asin} ×
              </button>
            );
          })}
          {showLimitNotice && (
            <span className="text-xs text-amber-300">Limit 2 competitors to keep chart readable.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-400">
            <span className="px-1">Metrics</span>
            {(['price', 'bsr', 'both'] as MetricView[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setMetricView(option)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  metricView === option
                    ? 'bg-slate-700/60 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {option === 'price' ? 'Price' : option === 'bsr' ? 'BSR' : 'Both'}
              </button>
            ))}
          </div>
          {[12, 24].map(months => (
            <button
              key={months}
              type="button"
              onClick={() => setRangeMonths(months as 12 | 24)}
              className={`rounded-full border px-4 py-1 text-xs font-medium ${
                rangeMonths === months
                  ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                  : 'border-slate-700/60 bg-slate-900/40 text-slate-400'
              }`}
            >
              {months === 12 ? '12 months' : '2 years'}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        {mergedSeries.length ? (
          <div className="h-[360px] md:h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergedSeries} margin={{ top: 12, right: 36, left: 12, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  dataKey="month"
                  stroke="#94a3b8"
                  tickFormatter={(value: string) => formatMonthAxisLabel(value)}
                  minTickGap={20}
                >
                  <Label value="Date" position="insideBottom" offset={-6} fill="#94a3b8" />
                </XAxis>
                {priceDomain && showPrice && (
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value: number) => formatCurrencyTick(value)}
                    stroke="#94a3b8"
                    domain={priceDomain ?? ['auto', 'auto']}
                    width={60}
                  >
                    <Label value="Price ($)" angle={-90} position="insideLeft" fill="#94a3b8" />
                  </YAxis>
                )}
                {bsrDomain && showBsr && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value: number) => formatBsrTick(value)}
                    stroke="#94a3b8"
                    domain={bsrDomain ?? ['auto', 'auto']}
                    width={70}
                  >
                    <Label content={renderBsrAxisLabel} position="right" />
                  </YAxis>
                )}
                {promoMonths.map(month => (
                  <ReferenceArea
                    key={month}
                    x1={month}
                    x2={getNextMonthKey(month)}
                    yAxisId={showPrice ? 'left' : 'right'}
                    fill={PROMO_FILL}
                    stroke={PROMO_STROKE}
                  />
                ))}
                {showPrice && averagePriceForChart !== null && (
                  <ReferenceLine
                    yAxisId="left"
                    y={averagePriceForChart}
                    stroke={AVG_LINE_COLOR}
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                    label={renderAverageLabel(averageLabel(averagePriceForChart, 'price'))}
                  />
                )}
                {showBsr && averageBsrForChart !== null && (
                  <ReferenceLine
                    yAxisId="right"
                    y={averageBsrForChart}
                    stroke={AVG_LINE_COLOR}
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                    label={renderAverageLabel(averageLabel(averageBsrForChart, 'bsr'))}
                  />
                )}
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const payloadMap = new Map<string, number>();
                    payload.forEach(entry => {
                      if (!seriesConfigMap.has(String(entry.dataKey))) return;
                      if (!Number.isFinite(entry.value as number)) return;
                      payloadMap.set(String(entry.dataKey), entry.value as number);
                    });
                    return (
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/90 px-3 py-2 text-xs text-slate-200">
                        <div className="text-slate-400">{formatMonthLabel(String(label))}</div>
                        <div className="mt-2 space-y-1">
                          {entityList.map(entity => {
                            const priceValue = payloadMap.get(entity.priceKey);
                            const bsrValue = payloadMap.get(entity.bsrKey);
                            if (showPrice && !Number.isFinite(priceValue) && showBsr && !Number.isFinite(bsrValue)) {
                              return null;
                            }
                            if (!showPrice && showBsr && !Number.isFinite(bsrValue)) {
                              return null;
                            }
                            if (showPrice && !showBsr && !Number.isFinite(priceValue)) {
                              return null;
                            }
                            return (
                              <div key={entity.key} className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entity.color }} />
                                <div>
                                  {entity.label}:{' '}
                                  {showPrice && Number.isFinite(priceValue)
                                    ? formatCurrencyFull(priceValue as number)
                                    : null}
                                  {showPrice && showBsr && Number.isFinite(priceValue) && Number.isFinite(bsrValue) ? ' | ' : null}
                                  {showBsr && Number.isFinite(bsrValue) ? `#${formatNumberFull(bsrValue as number)}` : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {promoMonthSet.has(String(label)) && <div className="mt-2 text-emerald-300">Promo period</div>}
                      </div>
                    );
                  }}
                />
                {seriesConfigs.map(config => (
                  <Line
                    key={config.key}
                    type="monotone"
                    dataKey={config.key}
                    yAxisId={config.metric === 'price' ? 'left' : 'right'}
                    stroke={config.color}
                    strokeWidth={config.strokeWidth}
                    dot={false}
                    strokeDasharray={config.dashed ? '4 2' : undefined}
                    isAnimationActive={false}
                    name={config.label}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            Not enough history to render price or BSR trends.
          </div>
        )}
      </div>

      {legendItems.length ? (
        <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-300">
          {legendItems.map(item => {
            const { key, ...props } = item;
            return <LegendItem key={key} {...props} />;
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Typical price range</div>
          <div className={`mt-2 text-lg font-semibold ${priceRangeTone}`}>
            {formatCurrencyCompact(analysis.computed.trends.typicalPriceRange.min)} –{' '}
            {formatCurrencyCompact(analysis.computed.trends.typicalPriceRange.max)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Largest price drop</div>
          <div className={`mt-2 text-lg font-semibold ${priceDropTone}`}>
            {analysis.computed.trends.largestPriceDrop.pct
              ? `${analysis.computed.trends.largestPriceDrop.pct}%`
              : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {formatMonthLabel(analysis.computed.trends.largestPriceDrop.month)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Demand Stability</div>
          <div className="mt-2 text-lg font-semibold text-white">
            <SignalBadge label={analysis.computed.trends.rankVolatilityCategory} category="demand" />
          </div>
          <div className="mt-1 text-xs text-slate-400">Based on monthly BSR movement (historical)</div>
        </div>
      </div>
    </div>
  );
};

export default KeepaTrendsTab;
