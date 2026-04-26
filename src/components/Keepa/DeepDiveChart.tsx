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
  ReferenceLine,
  Customized,
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
// Market avg uses a vibrant sky-cyan to draw the eye as the visual anchor.
// Competitor lines are rendered at lower opacity (and BSR at lower opacity
// still) so they recede behind the Market baseline by default.
const MARKET_LINE_COLOR = '#22d3ee';
const COMPETITOR_PRICE_OPACITY = 0.85;
const COMPETITOR_BSR_OPACITY = 0.5;

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

/**
 * Build x-axis ticks + a formatter chosen to keep "year vs day" unambiguous.
 *
 * Day-level ticks for ≤90 day spans: "Mar 16" — paired with the period stamp
 * above the chart to anchor the year. Month-level ticks for 90–730 day spans:
 * "Mar '26" with an apostrophe so it can't be mistaken for a day. Year-level
 * ticks above 2 years: "2024" — clearly a year.
 */
const buildAxisTicks = (start: number, end: number): { ticks: number[]; formatter: (ts: number) => string } => {
  const spanDays = (end - start) / DAY_MS;
  const ticks: number[] = [];
  const dayFormatter = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthYearFormatter = (ts: number) => {
    const d = new Date(ts);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return `${month} '${String(d.getFullYear()).slice(-2)}`;
  };
  const yearFormatter = (ts: number) => String(new Date(ts).getFullYear());

  if (spanDays <= 14) {
    for (let t = start; t <= end; t += DAY_MS) ticks.push(t);
    return { ticks, formatter: dayFormatter };
  }
  if (spanDays <= 90) {
    const step = 7 * DAY_MS;
    for (let t = start; t <= end; t += step) ticks.push(t);
    return { ticks, formatter: dayFormatter };
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
    return { ticks, formatter: monthYearFormatter };
  }
  // Multi-year span: tick at the start of each year.
  const cursor = new Date(start);
  cursor.setMonth(0, 1);
  cursor.setHours(0, 0, 0, 0);
  if (cursor.getTime() < start) cursor.setFullYear(cursor.getFullYear() + 1);
  while (cursor.getTime() <= end) {
    ticks.push(cursor.getTime());
    cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return { ticks, formatter: yearFormatter };
};

const formatPeriodStamp = (start: number, end: number): string => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const fmtFull = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const spanDays = (end - start) / DAY_MS;
  let span: string;
  if (spanDays < 60) span = `${Math.round(spanDays)} days`;
  else if (spanDays < 365) span = `${Math.round(spanDays / 30)} months`;
  else {
    const years = spanDays / 365;
    const rounded = Math.round(years * 10) / 10;
    span = `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${rounded === 1 ? 'year' : 'years'}`;
  }
  return `${fmtFull(startDate)} – ${fmtFull(endDate)} · ${span}`;
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
}

const DeepDiveChart: React.FC<DeepDiveChartProps> = ({ analysis, removedAsins }) => {
  const normalized = analysis?.normalized as NormalizedKeepaSnapshot | undefined | null;
  const [rangeKey, setRangeKey] = useState<RangeKey>('1Y');
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
        series: c
      }));
  }, [normalized, removedSet]);

  // Per-competitor "first valid timestamp" — defined as the earliest BSR data
  // point. The BSR series is the cleanest signal of when a listing actually
  // started selling; price/buyBoxShipping series can be contaminated by
  // phantom pre-launch values (Keepa epoch noise from inactive series).
  const competitorEarliestTs = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of competitors) {
      const firstBsr = c.series.series.bsr.find(p => p.value !== null && Number.isFinite(p.value));
      if (firstBsr) map.set(c.asin, firstBsr.timestamp);
    }
    return map;
  }, [competitors]);

  // Build the unified timestamp grid + chart rows. Pre-launch timestamps for
  // each competitor are nulled out so the contaminated $80K phantom price
  // points don't render.
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
        const earliest = competitorEarliestTs.get(c.asin);
        if (earliest !== undefined && ts < earliest) {
          // This competitor wasn't tracked yet — skip.
          row[c.priceKey] = null;
          row[c.bsrKey] = null;
          continue;
        }
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
    // Trim leading rows where every series is null (i.e., before any
    // competitor was tracked).
    let firstNonEmpty = 0;
    while (firstNonEmpty < rows.length) {
      const r = rows[firstNonEmpty];
      const hasAny = Object.entries(r).some(([k, v]) => k !== 't' && v !== null);
      if (hasAny) break;
      firstNonEmpty++;
    }
    const trimmed = firstNonEmpty > 0 ? rows.slice(firstNonEmpty) : rows;
    return {
      rows: trimmed,
      fullStart: trimmed[0]?.t ?? sorted[0],
      fullEnd: trimmed[trimmed.length - 1]?.t ?? sorted[sorted.length - 1]
    };
  }, [competitors, competitorEarliestTs]);

  // Compute the earliest data point across visible series only, anchored to
  // each competitor's BSR-derived "earliest valid" timestamp so we don't
  // include phantom pre-launch price values.
  const visibleRange = useMemo(() => {
    let start = Infinity;
    let end = -Infinity;
    for (const c of competitors) {
      if (!selectedAsins.has(c.asin)) continue;
      const earliest = competitorEarliestTs.get(c.asin);
      if (earliest !== undefined) start = Math.min(start, earliest);
      const lastBsr = c.series.series.bsr[c.series.series.bsr.length - 1]?.timestamp;
      if (lastBsr !== undefined) end = Math.max(end, lastBsr);
    }
    if (showMarket) {
      if (fullChartData.fullStart) start = Math.min(start, fullChartData.fullStart);
      if (fullChartData.fullEnd) end = Math.max(end, fullChartData.fullEnd);
    }
    if (start === Infinity || end === -Infinity) {
      return { start: fullChartData.fullStart, end: fullChartData.fullEnd };
    }
    return { start, end };
  }, [competitors, selectedAsins, showMarket, fullChartData, competitorEarliestTs]);

  // Resolve the active display window: zoom range overrides everything; otherwise the
  // selected range preset; "All" falls back to the visible-series extent.
  const displayRange = useMemo(() => {
    if (zoomRange) return zoomRange;
    const opt = RANGE_OPTIONS.find(o => o.key === rangeKey);
    if (!opt || opt.days === null) {
      return visibleRange;
    }
    const end = visibleRange.end || Date.now();
    const start = Math.max(end - opt.days * DAY_MS, visibleRange.start);
    return { start, end };
  }, [zoomRange, rangeKey, visibleRange]);

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

  // The set of column keys actually being plotted right now. Used to scope
  // both the y-axis domain calc and the average-label rendering — neither
  // should be influenced by hidden competitors.
  const visibleColumns = useMemo(() => {
    const set = new Set<string>();
    if (showMarket) {
      set.add('marketPrice');
      set.add('marketBsr');
    }
    for (const c of competitors) {
      if (selectedAsins.has(c.asin)) {
        set.add(c.priceKey);
        set.add(c.bsrKey);
      }
    }
    return set;
  }, [competitors, selectedAsins, showMarket]);

  // Y-axis domains. Strategy: include only data from currently-visible series
  // (toggling SONGMICS off shouldn't keep its 400K-BSR outlier in the axis
  // calc) and add light padding above/below so lines never touch the rails.
  // Switch BSR to log scale when the visible spread is wide enough to make
  // linear scaling flatten the lower numbers — keeps a 10K-rank competitor
  // distinguishable from a 1M one.
  const { priceDomain, bsrDomain, bsrUseLog } = useMemo(() => {
    const prices: number[] = [];
    const bsrs: number[] = [];
    for (const r of visibleRows) {
      for (const [k, v] of Object.entries(r)) {
        if (k === 't' || v === null || !Number.isFinite(v)) continue;
        if (!visibleColumns.has(k)) continue;
        if (k.endsWith('Price') || k.endsWith('_price')) prices.push(v as number);
        if (k.endsWith('Bsr') || k.endsWith('_bsr')) bsrs.push(v as number);
      }
    }
    const pMin = prices.length ? Math.min(...prices) : 0;
    const pMax = prices.length ? Math.max(...prices) : 1;
    const priceRange = Math.max(pMax - pMin, 1);
    const priceLow = Math.max(0, pMin - priceRange * 0.08);
    const priceHigh = pMax + priceRange * 0.08;

    const bMin = bsrs.length ? Math.min(...bsrs) : 1;
    const bMax = bsrs.length ? Math.max(...bsrs) : 100;
    const useLog = bsrs.length > 0 && bMin > 0 && bMax / Math.max(bMin, 1) >= 10;
    const bsrLow = useLog ? Math.max(1, bMin * 0.7) : Math.max(0, bMin - (bMax - bMin) * 0.08);
    const bsrHigh = useLog ? bMax * 1.4 : bMax + (bMax - bMin) * 0.08;

    return {
      priceDomain: [priceLow, priceHigh] as [number, number],
      bsrDomain: [bsrLow, bsrHigh] as [number, number],
      bsrUseLog: useLog
    };
  }, [visibleRows]);

  // Per-series averages for the subtle on-axis markers. One entry per
  // currently-visible line — Market avg is included whenever showMarket is on.
  const visibleAverages = useMemo(() => {
    const out: Array<{ key: string; label: string; color: string; opacity: number; metric: 'price' | 'bsr'; value: number }> = [];
    const accum = new Map<string, { sum: number; n: number }>();
    for (const r of visibleRows) {
      for (const [k, v] of Object.entries(r)) {
        if (k === 't' || v === null || !Number.isFinite(v)) continue;
        const cur = accum.get(k) ?? { sum: 0, n: 0 };
        cur.sum += v as number;
        cur.n += 1;
        accum.set(k, cur);
      }
    }
    const meanFor = (k: string): number | null => {
      const a = accum.get(k);
      return a && a.n > 0 ? a.sum / a.n : null;
    };
    if (showMarket) {
      const mp = meanFor('marketPrice');
      if (mp !== null) out.push({ key: 'avg_marketPrice', label: 'Market', color: MARKET_LINE_COLOR, opacity: 0.35, metric: 'price', value: mp });
      const mb = meanFor('marketBsr');
      if (mb !== null) out.push({ key: 'avg_marketBsr', label: 'Market', color: MARKET_LINE_COLOR, opacity: 0.35, metric: 'bsr', value: mb });
    }
    for (const c of competitors) {
      if (!selectedAsins.has(c.asin)) continue;
      const p = meanFor(c.priceKey);
      if (p !== null) out.push({ key: `avg_${c.asin}_price`, label: c.label, color: c.color, opacity: 0.3, metric: 'price', value: p });
      const b = meanFor(c.bsrKey);
      if (b !== null) out.push({ key: `avg_${c.asin}_bsr`, label: c.label, color: c.color, opacity: 0.22, metric: 'bsr', value: b });
    }
    return out;
  }, [visibleRows, competitors, selectedAsins, showMarket]);

  // Stockouts are conveyed implicitly by gaps in the buy-box price line —
  // explicit red overlays were noisy and misleading on BSR-only views (a
  // listing can keep selling well during a "no buy box" event when third-
  // party offers are still moving units). Drop them.

  // Click-drag zoom: capture the start on mouseDown, the end on mouseMove,
  // commit the zoom on mouseUp (if the drag range is meaningful — at least
  // 2% of the visible span to avoid accidental clicks). We coalesce
  // mouseMove updates into a single requestAnimationFrame so React doesn't
  // re-render the whole chart on every pixel of mouse motion — keeps the
  // drag feel smooth on long ranges with thousands of points.
  const dragRafRef = useRef<number | null>(null);
  const pendingDragEndRef = useRef<number | null>(null);
  const handleMouseDown = (e: any) => {
    if (!e?.activeLabel) return;
    setDragSelection({ start: e.activeLabel, end: null });
  };
  const handleMouseMove = (e: any) => {
    if (dragSelection.start === null || !e?.activeLabel) return;
    pendingDragEndRef.current = e.activeLabel;
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      const next = pendingDragEndRef.current;
      if (next !== null) {
        setDragSelection(prev => ({ ...prev, end: next }));
      }
    });
  };
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
    };
  }, []);
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
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
          <div>
            <span className="uppercase tracking-wide text-slate-500">Period</span>{' '}
            <span className="text-slate-200">
              {displayRange.start && displayRange.end
                ? formatPeriodStamp(displayRange.start, displayRange.end)
                : '—'}
            </span>
          </div>
          <div className="text-slate-500">Drag inside the chart to zoom · Click a range button to reset</div>
        </div>
        <div className="h-[420px] select-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleRows}
              margin={{ top: 6, right: 8, left: 8, bottom: 14 }}
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
                  domain={priceDomain}
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
                  domain={bsrDomain}
                  scale={bsrUseLog ? 'log' : 'auto'}
                />
              )}
              <RechartsTooltip
                cursor={{ stroke: 'rgba(148, 163, 184, 0.35)', strokeDasharray: '3 3', strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(51, 65, 85, 0.6)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: '#e2e8f0',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{ color: '#cbd5e1', marginBottom: 4 }}>
                        {formatTooltipDate(Number(label))}
                      </div>
                      {payload
                        .filter(p => p.value !== null && p.value !== undefined)
                        .map((p, i) => {
                          const name = String(p.name ?? '');
                          const isPrice = name.toLowerCase().includes('price');
                          const value =
                            isPrice
                              ? `$${Number(p.value).toFixed(2)}`
                              : `#${Math.round(Number(p.value)).toLocaleString()}`;
                          // Match the chart's vibrant-vs-subdued language:
                          // price = full color, BSR = same color at lower opacity.
                          const isMarket = name.startsWith('Market');
                          const opacity = isPrice
                            ? isMarket ? 0.95 : COMPETITOR_PRICE_OPACITY
                            : isMarket ? 0.55 : COMPETITOR_BSR_OPACITY;
                          return (
                            <div key={i} style={{ color: p.color as string, opacity, lineHeight: 1.4 }}>
                              {name}: <span style={{ fontWeight: 600 }}>{value}</span>
                            </div>
                          );
                        })}
                    </div>
                  );
                }}
              />
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
              {/* Per-series averages — dashed reference line across the plot
                  area. Labels live outside the plot via the Customized
                  component below so they don't crowd the data. Skip metrics
                  whose axis isn't currently rendered (price-only / BSR-only
                  views) — referencing a missing yAxisId throws in recharts. */}
              {visibleAverages
                .filter(avg => (avg.metric === 'price' ? showPrice : showBsr))
                .map(avg => (
                  <ReferenceLine
                    key={avg.key}
                    yAxisId={avg.metric}
                    y={avg.value}
                    stroke={avg.color}
                    strokeOpacity={avg.opacity}
                    strokeDasharray="2 4"
                    ifOverflow="extendDomain"
                  />
                ))}
              {/* Average labels rendered in the y-axis tick column itself
                  (right-aligned in the price axis area on the left,
                  left-aligned in the BSR axis area on the right). Tight
                  margins keep the plot wide; labels are color-matched to
                  each visible series so they read distinctly from the
                  regular slate axis ticks even when sharing the column. */}
              <Customized
                component={(chartProps: any) => {
                  const yMap = chartProps?.yAxisMap as Record<string, any> | undefined;
                  if (!yMap) return null;
                  const priceAxis = Object.values(yMap).find((a: any) => a.yAxisId === 'price');
                  const bsrAxis = Object.values(yMap).find((a: any) => a.yAxisId === 'bsr');
                  // Track placed-label y positions per side so we can nudge
                  // overlapping ones a few pixels apart instead of stacking.
                  const placed: Record<'price' | 'bsr', number[]> = { price: [], bsr: [] };
                  const minGapPx = 11;
                  return (
                    <g>
                      {visibleAverages.map(avg => {
                        // Skip if the axis for this metric isn't rendered.
                        if (avg.metric === 'price' && !showPrice) return null;
                        if (avg.metric === 'bsr' && !showBsr) return null;
                        const axis: any = avg.metric === 'price' ? priceAxis : bsrAxis;
                        if (!axis || typeof axis.scale !== 'function') return null;
                        const rawY = axis.scale(avg.value);
                        if (!Number.isFinite(rawY)) return null;
                        let y = rawY;
                        for (const usedY of placed[avg.metric]) {
                          if (Math.abs(y - usedY) < minGapPx) y = usedY + minGapPx;
                        }
                        placed[avg.metric].push(y);
                        // Position labels in the y-axis tick column. The
                        // tight margins keep the plot width maximized;
                        // color-coding distinguishes avg labels from the
                        // regular slate axis ticks.
                        const x = avg.metric === 'price'
                          ? axis.x + axis.width - 4
                          : axis.x + 4;
                        const anchor = avg.metric === 'price' ? 'end' : 'start';
                        const text = avg.metric === 'price'
                          ? `$${avg.value.toFixed(2)}`
                          : formatBsrTick(avg.value);
                        return (
                          <text
                            key={`avg_label_${avg.key}`}
                            x={x}
                            y={y}
                            fill={avg.color}
                            fillOpacity={Math.min(0.95, avg.opacity * 2.6)}
                            fontSize={9}
                            fontWeight={600}
                            textAnchor={anchor}
                            dominantBaseline="middle"
                          >
                            {text}
                          </text>
                        );
                      })}
                    </g>
                  );
                }}
              />
              {showMarket && showPrice && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="marketPrice"
                  name="Market price"
                  stroke={MARKET_LINE_COLOR}
                  strokeOpacity={0.95}
                  strokeWidth={2}
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
                  stroke={MARKET_LINE_COLOR}
                  strokeOpacity={0.6}
                  strokeWidth={1.75}
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
                        strokeOpacity={COMPETITOR_PRICE_OPACITY}
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
                        strokeOpacity={COMPETITOR_BSR_OPACITY}
                        strokeWidth={1.25}
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
      </div>
    </div>
  );
};

export default DeepDiveChart;
