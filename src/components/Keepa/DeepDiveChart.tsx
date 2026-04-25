import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  Legend
} from 'recharts';
import { Eye, EyeOff } from 'lucide-react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import type {
  NormalizedKeepaCompetitor,
  KeepaPoint,
  NormalizedKeepaSnapshot
} from '@/lib/keepa/normalize';

/**
 * Deep-Dive Chart
 *
 * Per-day price + BSR overlay across the top competitors. Replaces the
 * monthly-bucket KeepaTrendsTab. Modeled on Keepa's range selector — pick a
 * preset (1W, 1M, 3M, 6M, 1Y, 2Y, All) or click-and-drag inside the chart
 * to zoom into an arbitrary window. Default state is Market-average only;
 * competitor lines are opt-in toggles to keep the canvas legible.
 *
 * Stockouts in buyBoxShipping render as line breaks plus subtle red
 * reference areas, matching the Pre-Vetting Reports convention.
 */

interface DeepDiveChartProps {
  analysis: KeepaAnalysisSnapshot;
  removedAsins?: Set<string> | string[];
}

type RangeKey = '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | 'All';
type MetricView = 'both' | 'price' | 'bsr';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '2Y', label: '2Y', days: 730 },
  { key: 'All', label: 'All', days: null }
];

const COMPETITOR_COLORS = ['#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185'];
const MARKET_PRICE_COLOR = '#38bdf8';
const MARKET_BSR_COLOR = '#94a3b8';
const STOCKOUT_FILL = '#fb7185';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatPriceTick = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
};

const formatBsrTick = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1_000_000) return `#${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `#${(value / 1000).toFixed(0)}K`;
  return `#${Math.round(value)}`;
};

const formatTooltipDate = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const buildAxisTicks = (start: number, end: number): { ticks: number[]; formatter: (ts: number) => string } => {
  const spanDays = (end - start) / DAY_MS;
  const ticks: number[] = [];
  if (spanDays <= 14) {
    for (let t = start; t <= end; t += DAY_MS) ticks.push(t);
    return {
      ticks,
      formatter: ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  }
  if (spanDays <= 90) {
    const step = 7 * DAY_MS;
    for (let t = start; t <= end; t += step) ticks.push(t);
    return {
      ticks,
      formatter: ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  }
  if (spanDays <= 730) {
    const cursor = new Date(start);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    if (cursor.getTime() < start) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() <= end) {
      ticks.push(cursor.getTime());
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return {
      ticks,
      formatter: ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    };
  }
  // Quarterly for very long spans.
  const cursor = new Date(start);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
  if (cursor.getTime() < start) cursor.setMonth(cursor.getMonth() + 3);
  while (cursor.getTime() <= end) {
    ticks.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 3);
  }
  return {
    ticks,
    formatter: ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  };
};

const normalizeAsinSet = (raw: DeepDiveChartProps['removedAsins']): Set<string> => {
  if (!raw) return new Set();
  const arr = Array.isArray(raw) ? raw : Array.from(raw);
  return new Set(arr.map(a => a.toUpperCase()));
};

/** Last finite value at or before timestamp ts (forward-fill semantics). */
const lookupAtOrBefore = (
  series: KeepaPoint[],
  ts: number,
  excludeStockouts = false
): number | null => {
  // Series is sorted ascending. Walk to the largest timestamp ≤ ts.
  let result: number | null = null;
  for (const point of series) {
    if (point.timestamp > ts) break;
    const v = point.value;
    if (v === null) continue;
    if (excludeStockouts && v === -1) continue;
    if (Number.isFinite(v)) result = v;
  }
  return result;
};

interface CompetitorEntry {
  asin: string;
  label: string;
  color: string;
  priceKey: string;
  bsrKey: string;
  series: NormalizedKeepaCompetitor;
  stockoutWindows: Array<{ start: number; end: number }>;
}

const detectStockoutWindows = (series: KeepaPoint[]): Array<{ start: number; end: number }> => {
  const windows: Array<{ start: number; end: number }> = [];
  let runStart: number | null = null;
  for (const p of series) {
    if (p.value === -1) {
      if (runStart === null) runStart = p.timestamp;
    } else if (p.value !== null && runStart !== null) {
      windows.push({ start: runStart, end: p.timestamp });
      runStart = null;
    }
  }
  if (runStart !== null) {
    const last = series[series.length - 1]?.timestamp ?? runStart;
    windows.push({ start: runStart, end: last });
  }
  return windows;
};

const DeepDiveChart: React.FC<DeepDiveChartProps> = ({ analysis, removedAsins }) => {
  const normalized = analysis?.normalized as NormalizedKeepaSnapshot | undefined | null;
  const [rangeKey, setRangeKey] = useState<RangeKey>('All');
  const [metricView, setMetricView] = useState<MetricView>('both');
  const [showMarket, setShowMarket] = useState(true);
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [dragSelection, setDragSelection] = useState<{ start: number | null; end: number | null }>({
    start: null,
    end: null
  });

  const removedSet = useMemo(() => normalizeAsinSet(removedAsins), [removedAsins]);

  // Build the per-competitor entry list. Filter out removed competitors.
  const competitors = useMemo<CompetitorEntry[]>(() => {
    const all = normalized?.competitors ?? [];
    return all
      .filter(c => c.asin && !removedSet.has(c.asin.toUpperCase()))
      .slice(0, 5)
      .map((c, i) => ({
        asin: c.asin,
        label: c.brand || c.title || c.asin,
        color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
        priceKey: `${c.asin}_price`,
        bsrKey: `${c.asin}_bsr`,
        series: c,
        stockoutWindows: detectStockoutWindows(c.series.buyBoxShipping)
      }));
  }, [normalized, removedSet]);

  // Build the unified timestamp grid + chart rows.
  const fullChartData = useMemo(() => {
    if (!competitors.length) return { rows: [] as Array<Record<string, number | null>>, fullStart: 0, fullEnd: 0 };
    const tsSet = new Set<number>();
    for (const c of competitors) {
      for (const p of c.series.series.price) tsSet.add(p.timestamp);
      for (const p of c.series.series.bsr) tsSet.add(p.timestamp);
      for (const p of c.series.series.buyBoxShipping) tsSet.add(p.timestamp);
    }
    const sorted = Array.from(tsSet).sort((a, b) => a - b);
    if (!sorted.length) return { rows: [], fullStart: 0, fullEnd: 0 };

    const rows: Array<Record<string, number | null>> = [];
    for (const ts of sorted) {
      const row: Record<string, number | null> = { t: ts };
      const pricePoints: number[] = [];
      const bsrPoints: number[] = [];
      for (const c of competitors) {
        // Use buyBoxShipping for price when available (it's the source of truth
        // for what shoppers see). Skip -1 stockout sentinels — they should
        // render as gaps, not low-price drops.
        const bb = c.series.series.buyBoxShipping;
        const buyBoxValue = lookupAtOrBefore(bb, ts, true);
        const priceValue =
          buyBoxValue !== null ? buyBoxValue : lookupAtOrBefore(c.series.series.price, ts, false);
        const bsrValue = lookupAtOrBefore(c.series.series.bsr, ts, false);
        row[c.priceKey] = priceValue;
        row[c.bsrKey] = bsrValue;
        if (priceValue !== null && Number.isFinite(priceValue)) pricePoints.push(priceValue);
        if (bsrValue !== null && Number.isFinite(bsrValue)) bsrPoints.push(bsrValue);
      }
      row.marketPrice = pricePoints.length
        ? pricePoints.reduce((s, v) => s + v, 0) / pricePoints.length
        : null;
      row.marketBsr = bsrPoints.length
        ? bsrPoints.reduce((s, v) => s + v, 0) / bsrPoints.length
        : null;
      rows.push(row);
    }
    return { rows, fullStart: sorted[0], fullEnd: sorted[sorted.length - 1] };
  }, [competitors]);

  // Resolve the active display window: zoom range overrides everything; otherwise the
  // selected range preset; "All" falls back to the full data span.
  const displayRange = useMemo(() => {
    if (zoomRange) return zoomRange;
    const opt = RANGE_OPTIONS.find(o => o.key === rangeKey);
    if (!opt || opt.days === null) {
      return { start: fullChartData.fullStart, end: fullChartData.fullEnd };
    }
    const end = fullChartData.fullEnd || Date.now();
    const start = Math.max(end - opt.days * DAY_MS, fullChartData.fullStart);
    return { start, end };
  }, [zoomRange, rangeKey, fullChartData]);

  const visibleRows = useMemo(() => {
    return fullChartData.rows.filter(r => {
      const t = r.t as number;
      return t >= displayRange.start && t <= displayRange.end;
    });
  }, [fullChartData.rows, displayRange]);

  const axisTicks = useMemo(
    () => buildAxisTicks(displayRange.start, displayRange.end),
    [displayRange]
  );

  const visibleStockoutWindows = useMemo(() => {
    // Only render stockout overlays for competitors whose lines are toggled on
    // — otherwise the chart would still show red bars from invisible series.
    const out: Array<{ start: number; end: number; color: string }> = [];
    for (const c of competitors) {
      if (!selectedAsins.has(c.asin)) continue;
      for (const w of c.stockoutWindows) {
        if (w.end < displayRange.start || w.start > displayRange.end) continue;
        out.push({
          start: Math.max(w.start, displayRange.start),
          end: Math.min(w.end, displayRange.end),
          color: STOCKOUT_FILL
        });
      }
    }
    return out;
  }, [competitors, selectedAsins, displayRange]);

  // Click-drag zoom: capture the start on mouseDown, the end on mouseMove,
  // commit the zoom on mouseUp (if the drag range is meaningful — at least
  // 2% of the visible span to avoid accidental clicks).
  const handleMouseDown = (e: any) => {
    if (!e?.activeLabel) return;
    setDragSelection({ start: e.activeLabel, end: null });
  };
  const handleMouseMove = (e: any) => {
    if (dragSelection.start === null || !e?.activeLabel) return;
    setDragSelection(prev => ({ ...prev, end: e.activeLabel }));
  };
  const handleMouseUp = () => {
    if (dragSelection.start === null || dragSelection.end === null) {
      setDragSelection({ start: null, end: null });
      return;
    }
    const a = Math.min(dragSelection.start, dragSelection.end);
    const b = Math.max(dragSelection.start, dragSelection.end);
    const span = displayRange.end - displayRange.start;
    if (b - a < span * 0.02) {
      setDragSelection({ start: null, end: null });
      return;
    }
    setZoomRange({ start: a, end: b });
    setDragSelection({ start: null, end: null });
  };

  const applyRange = (key: RangeKey) => {
    setRangeKey(key);
    setZoomRange(null);
    setDragSelection({ start: null, end: null });
  };

  const toggleCompetitor = (asin: string) => {
    setSelectedAsins(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  if (!normalized || !competitors.length) {
    return (
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-6 text-sm text-slate-300">
        Deep-dive data not available for this market. Refresh Market Climate to populate.
      </div>
    );
  }

  const showPrice = metricView === 'both' || metricView === 'price';
  const showBsr = metricView === 'both' || metricView === 'bsr';

  return (
    <div className="space-y-3">
      {/* Range presets + metric toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => applyRange(opt.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                rangeKey === opt.key && !zoomRange
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-500/50'
                  : 'border border-slate-700/60 text-slate-300 hover:border-slate-500/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {zoomRange && (
            <button
              type="button"
              onClick={() => applyRange(rangeKey)}
              className="ml-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70"
            >
              Reset zoom
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 uppercase tracking-wide">Show</span>
          {(['both', 'price', 'bsr'] as MetricView[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMetricView(m)}
              className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                metricView === m
                  ? 'bg-slate-700/60 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'both' ? 'Both' : m === 'price' ? 'Price' : 'BSR'}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle row — Market avg + per-competitor */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setShowMarket(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors ${
            showMarket
              ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
              : 'border-slate-700/60 text-slate-400 hover:border-slate-500/60'
          }`}
        >
          {showMarket ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Market avg
        </button>
        {competitors.map(c => {
          const on = selectedAsins.has(c.asin);
          return (
            <button
              key={c.asin}
              type="button"
              onClick={() => toggleCompetitor(c.asin)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors ${
                on ? 'text-slate-100' : 'border-slate-700/60 text-slate-400 hover:border-slate-500/60'
              }`}
              style={
                on
                  ? {
                      borderColor: c.color,
                      backgroundColor: `${c.color}26`,
                      color: c.color
                    }
                  : undefined
              }
            >
              {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 pt-4 pb-2">
        <div className="h-[420px] select-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleRows}
              margin={{ top: 6, right: 56, left: 4, bottom: 14 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <CartesianGrid stroke="rgba(71, 85, 105, 0.25)" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[displayRange.start, displayRange.end]}
                ticks={axisTicks.ticks}
                tickFormatter={axisTicks.formatter}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                stroke="#475569"
                axisLine={{ stroke: '#475569' }}
                tickLine={{ stroke: '#475569' }}
                minTickGap={32}
              />
              {showPrice && (
                <YAxis
                  yAxisId="price"
                  orientation="left"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatPriceTick}
                  stroke="#475569"
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                />
              )}
              {showBsr && (
                <YAxis
                  yAxisId="bsr"
                  orientation="right"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatBsrTick}
                  stroke="#475569"
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                />
              )}
              <RechartsTooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#e2e8f0'
                }}
                labelFormatter={(value: any) => formatTooltipDate(Number(value))}
                formatter={(value: any, name: string) => {
                  const num = Number(value);
                  if (!Number.isFinite(num)) return ['—', name];
                  if (name.includes('Price') || name === 'Market price') {
                    return [`$${num.toFixed(2)}`, name];
                  }
                  return [`#${Math.round(num).toLocaleString()}`, name];
                }}
              />
              {/* Stockout overlays for visible competitors */}
              {visibleStockoutWindows.map((w, i) => (
                <ReferenceArea
                  key={`stockout_${i}`}
                  x1={w.start}
                  x2={w.end}
                  yAxisId={showPrice ? 'price' : 'bsr'}
                  stroke={w.color}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  fill={w.color}
                  fillOpacity={0.06}
                />
              ))}
              {/* Click-drag selection visual feedback */}
              {dragSelection.start !== null && dragSelection.end !== null && (
                <ReferenceArea
                  x1={Math.min(dragSelection.start, dragSelection.end)}
                  x2={Math.max(dragSelection.start, dragSelection.end)}
                  yAxisId={showPrice ? 'price' : 'bsr'}
                  stroke="#38bdf8"
                  strokeOpacity={0.6}
                  fill="#38bdf8"
                  fillOpacity={0.08}
                />
              )}
              {/* Lines */}
              {showMarket && showPrice && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="marketPrice"
                  name="Market price"
                  stroke={MARKET_PRICE_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {showMarket && showBsr && (
                <Line
                  yAxisId="bsr"
                  type="monotone"
                  dataKey="marketBsr"
                  name="Market BSR"
                  stroke={MARKET_BSR_COLOR}
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {competitors.map(c => {
                if (!selectedAsins.has(c.asin)) return null;
                return (
                  <React.Fragment key={c.asin}>
                    {showPrice && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey={c.priceKey}
                        name={`${c.label} price`}
                        stroke={c.color}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    )}
                    {showBsr && (
                      <Line
                        yAxisId="bsr"
                        type="monotone"
                        dataKey={c.bsrKey}
                        name={`${c.label} BSR`}
                        stroke={c.color}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
          <div>Drag inside the chart to zoom into any window. Click a range button to reset.</div>
          {visibleStockoutWindows.length > 0 && (
            <div>
              <span className="text-rose-400/80">Red bands</span> = stockouts for the selected competitor
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeepDiveChart;
