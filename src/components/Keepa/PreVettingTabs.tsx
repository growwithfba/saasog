'use client';

import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  ReferenceDot,
  Tooltip as RechartsTooltip
} from 'recharts';
import {
  ChevronDown,
  ChevronRight,
  Rocket,
  DollarSign,
  TrendingUp,
  Check,
  Flag,
  Activity,
  Zap,
  ExternalLink,
  Clock
} from 'lucide-react';
import { Tooltip as InfoTooltip } from '../Offer/components/Tooltip';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import type {
  CompetitorProfile,
  CompetitorProfileSet
} from '@/lib/marketClimate/competitorProfile';
import type {
  PreVettingNarration,
  PreVettingCompetitorNarrative
} from '@/services/marketClimateNarration';
import type {
  KeepaPoint,
  NormalizedKeepaCompetitor
} from '@/lib/keepa/normalize';

interface PreVettingTabsProps {
  analysis: KeepaAnalysisSnapshot;
  removedAsins?: Set<string> | string[];
}

type LensId = 'launch' | 'price-supply' | 'rank';

const TABS: Array<{
  id: LensId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'price-supply', label: 'Price & Supply', Icon: DollarSign },
  { id: 'rank', label: 'Rank', Icon: TrendingUp },
  { id: 'launch', label: 'Launches', Icon: Rocket }
];

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
};

const formatBsr = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `#${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `#${(value / 1_000).toFixed(0)}K`;
  return `#${Math.round(value)}`;
};

const formatDays = (days: number | null | undefined): string => {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  if (days >= 365) {
    const years = days / 365;
    // Drop a trailing ".0" — show "14 years", not "14.0 years".
    const rounded = Math.round(years * 10) / 10;
    const str = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return `${str} ${rounded === 1 ? 'year' : 'years'}`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  const d = Math.round(days);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
};

const formatLaunchDate = (timestamp: number | null | undefined): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const normalizeAsinSet = (raw: PreVettingTabsProps['removedAsins']): Set<string> => {
  if (!raw) return new Set();
  const values = Array.isArray(raw) ? raw : Array.from(raw);
  return new Set(values.map(a => a.toUpperCase()));
};

/* ----------------------------------------------------------------------------
 * Badge system — per-lens chips with green / sky / amber / rose tones,
 * matching the rest of the page.
 * --------------------------------------------------------------------------*/

type BadgeTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'violet';

interface Badge {
  label: string;
  tone: BadgeTone;
  icon?: 'check' | 'flag' | 'activity' | 'zap';
  tooltip?: string;
}

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  sky:     'bg-sky-500/15 text-sky-200 border-sky-500/40',
  amber:   'bg-amber-500/15 text-amber-200 border-amber-500/40',
  rose:    'bg-rose-500/15 text-rose-200 border-rose-500/40',
  slate:   'bg-slate-700/30 text-slate-300 border-slate-600/50',
  violet:  'bg-violet-500/15 text-violet-200 border-violet-500/40'
};

const BADGE_ICON: Record<NonNullable<Badge['icon']>, React.ComponentType<{ className?: string }>> = {
  check: Check,
  flag: Flag,
  activity: Activity,
  zap: Zap
};

const BADGE_LINE_COLOR: Record<BadgeTone, string> = {
  emerald: '#34d399',
  sky: '#38bdf8',
  amber: '#f59e0b',
  rose: '#fb7185',
  slate: '#94a3b8',
  violet: '#a78bfa'
};

const launchBadges = (c: CompetitorProfile): Badge[] => {
  // For launches outside our analysis window we can't see the launch ramp,
  // so traction-style badges don't apply. Surface that with a neutral
  // "Established" pill instead — it tells the reader the listing is old
  // enough that we can't speak to its launch behavior.
  const badges: Badge[] = [];
  if (!c.launch.isWithinAnalysisWindow && c.launch.launchDate !== null) {
    badges.push({
      label: 'Established',
      tone: 'sky',
      tooltip: 'Listing predates our analysis window — we can only speak to its current state, not how it launched.'
    });
    return badges;
  }
  if (c.launch.daysToTraction !== null) {
    if (c.launch.daysToTraction <= 60) {
      badges.push({
        label: 'Quick traction',
        tone: 'emerald',
        icon: 'check',
        tooltip: 'Hit category-median rank within ~2 months of launch'
      });
    } else if (c.launch.daysToTraction >= 150) {
      badges.push({
        label: 'Slow traction',
        tone: 'rose',
        icon: 'flag',
        tooltip: 'Took 5+ months to gain traction — the bar to break in is high here'
      });
    }
  }
  return badges;
};

const priceSupplyBadges = (c: CompetitorProfile): Badge[] => {
  // Only flag the noteworthy. Zero stockouts is the expected baseline and
  // gets celebrated through the color-coded stat strip; pinning a green
  // pill on every card creates noise. Same logic for "lazy pricer" — the
  // absence of frequent sales is the default reading.
  const badges: Badge[] = [];

  if (c.priceSupply.stockoutCount >= 3 || (c.priceSupply.longestStockoutDays ?? 0) > 30) {
    badges.push({
      label: `Frequent stockouts`,
      tone: 'emerald',
      icon: 'check',
      tooltip: `${c.priceSupply.stockoutCount} stockouts in window, longest ~${c.priceSupply.longestStockoutDays ?? 0} days. Real opportunity — this incumbent struggles to stay stocked.`
    });
  } else if (c.priceSupply.stockoutCount > 0) {
    badges.push({
      label: `${c.priceSupply.stockoutCount} stockout${c.priceSupply.stockoutCount > 1 ? 's' : ''}`,
      tone: 'amber',
      tooltip: 'Some supply gaps in the window — partial opening for a new entrant.'
    });
  }

  if (c.priceSupply.priceActivityLevel === 'active') {
    badges.push({
      label: 'Frequent sales',
      tone: 'amber',
      icon: 'activity',
      tooltip: 'Adjusts price often — expect them to react quickly with discounts if you compete here'
    });
  }

  return badges;
};

const rankBadges = (c: CompetitorProfile): Badge[] => {
  // The year-average and current BSR stats are color-coded on the right
  // side of the row, which already does the heavy lifting. The only thing
  // worth surfacing as a pill is volatility — it's the one rank signal
  // that the stats alone don't reveal.
  const badges: Badge[] = [];
  if (c.rank.volatilityPct !== null && c.rank.volatilityPct >= 60) {
    badges.push({
      label: 'Volatile',
      tone: 'amber',
      tooltip: `Rank swings a lot — coefficient of variation ~${c.rank.volatilityPct}%. Sales day-to-day are unpredictable.`
    });
  }
  return badges;
};

const badgesForLens = (lens: LensId, c: CompetitorProfile): Badge[] => {
  if (lens === 'launch') return launchBadges(c);
  if (lens === 'price-supply') return priceSupplyBadges(c);
  return rankBadges(c);
};

/* ----------------------------------------------------------------------------
 * Color tone for stat values in the row strip
 * --------------------------------------------------------------------------*/

const statToneClass: Record<BadgeTone, string> = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  slate: 'text-slate-200',
  violet: 'text-violet-300'
};

const toneForBsr = (bsr: number | null | undefined): BadgeTone => {
  // Match the vetting page's BSR thresholds exactly so the color story is
  // consistent across the two views: ≤20k = strong, ≤50k = moderate, else
  // weak. See ProductVettingResults.tsx — the bsr driver tones.
  if (bsr === null || bsr === undefined || !Number.isFinite(bsr)) return 'slate';
  if (bsr <= 20_000) return 'emerald';
  if (bsr <= 50_000) return 'amber';
  return 'rose';
};


/* ----------------------------------------------------------------------------
 * Sparkline — small, no axes, color = lens-specific tone.
 * Wrapped in a hover popover that renders a larger, labeled chart at the
 * document body level so it isn't clipped by parent overflow.
 * --------------------------------------------------------------------------*/

type SparkLabel = 'BSR' | 'Buy Box price' | 'Price';
type MetricKind = 'bsr' | 'price';

interface SparkSpec {
  points: KeepaPoint[];
  tone: BadgeTone;
  metric: MetricKind;
  title: string;
}

const formatPopoverValue = (n: number, kind: MetricKind): string => {
  if (!Number.isFinite(n)) return '';
  if (kind === 'price') return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
  if (Math.abs(n) >= 1_000_000) return `#${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `#${(n / 1_000).toFixed(0)}K`;
  return `#${Math.round(n)}`;
};

const formatPopoverDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface StockoutWindow { start: number; end: number; }
interface StockoutMarker { t: number; v: number; kind: 'drop' | 'recovery'; }

const Sparkline: React.FC<{ spec: SparkSpec }> = ({ spec }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Walk the source points to detect stockout windows (runs of `-1`) and
  // collect the drop / recovery boundary points (last value before the
  // stockout, first value after) so we can mark them with small red dots
  // in the popover. The -1 values themselves get replaced with `null` so
  // the line breaks instead of diving — a visible drop to zero would
  // read as a price crash, not a stockout.
  const { rawData, stockoutWindows, stockoutMarkers } = useMemo(() => {
    const data: Array<{ t: number; v: number | null }> = [];
    const windows: StockoutWindow[] = [];
    const markers: StockoutMarker[] = [];
    let runStart: number | null = null;
    let runEnd: number | null = null;
    let lastFinite: { t: number; v: number } | null = null;
    let pendingDrop: { t: number; v: number } | null = null;
    for (const p of spec.points) {
      const isOut = p.value === -1;
      if (isOut) {
        if (runStart === null) {
          runStart = p.timestamp;
          // The previous finite value is the "drop" — last seen price
          // before the line goes blank.
          if (lastFinite) pendingDrop = lastFinite;
        }
        runEnd = p.timestamp;
        data.push({ t: p.timestamp, v: null });
        continue;
      }
      if (runStart !== null && runEnd !== null) {
        windows.push({ start: runStart, end: p.timestamp });
        if (pendingDrop) {
          markers.push({ t: pendingDrop.t, v: pendingDrop.v, kind: 'drop' });
          pendingDrop = null;
        }
        if (typeof p.value === 'number' && Number.isFinite(p.value)) {
          markers.push({ t: p.timestamp, v: p.value, kind: 'recovery' });
        }
        runStart = null;
        runEnd = null;
      }
      if (typeof p.value === 'number' && Number.isFinite(p.value)) {
        data.push({ t: p.timestamp, v: p.value });
        lastFinite = { t: p.timestamp, v: p.value };
      }
    }
    if (runStart !== null && runEnd !== null) {
      // Ongoing stockout — extend to the last seen timestamp; only the
      // drop marker is meaningful (no recovery yet).
      windows.push({ start: runStart, end: runEnd });
      if (pendingDrop) markers.push({ t: pendingDrop.t, v: pendingDrop.v, kind: 'drop' });
    }
    return { rawData: data, stockoutWindows: windows, stockoutMarkers: markers };
  }, [spec.points]);

  // Lines on the small sparkline use the same null-broken series so a
  // stockout shows as a visual gap rather than a dive.
  const sparkData = rawData;

  useLayoutEffect(() => {
    if (!hovered) {
      setPosition(null);
      return;
    }
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 360;
    const popoverHeight = 200;
    const margin = 12;
    let left = rect.right - popoverWidth;
    if (left < margin) left = margin;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    let top = rect.top - popoverHeight - margin;
    if (top < margin) top = rect.bottom + margin;
    setPosition({ top, left });
  }, [hovered]);

  if (sparkData.length < 2) {
    return <div className="h-6 w-20" />;
  }

  const lineColor = BADGE_LINE_COLOR[spec.tone];

  return (
    <div
      ref={triggerRef}
      className="h-6 w-20 cursor-zoom-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {hovered &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <SparkPopover
            data={rawData}
            metric={spec.metric}
            title={spec.title}
            color={lineColor}
            top={position.top}
            left={position.left}
            stockoutWindows={stockoutWindows}
            stockoutMarkers={stockoutMarkers}
          />,
          document.body
        )}
    </div>
  );
};

const SparkPopover: React.FC<{
  data: Array<{ t: number; v: number | null }>;
  metric: MetricKind;
  title: string;
  color: string;
  top: number;
  left: number;
  stockoutWindows: StockoutWindow[];
  stockoutMarkers: StockoutMarker[];
}> = ({ data, metric, title, color, top, left, stockoutWindows, stockoutMarkers }) => {
  const isBsr = metric === 'bsr';
  // Build deduplicated month-start ticks across the data range. Recharts'
  // default tick selection picks data-point timestamps, which can land
  // multiple consecutive points in the same month (e.g. "Nov Nov Dec Dec").
  // Explicit month-start ticks guarantee one label per calendar month.
  const { ticks, sameYear, spanDays } = useMemo(() => {
    if (data.length < 2) return { ticks: [] as number[], sameYear: true, spanDays: 0 };
    const first = data[0].t;
    const last = data[data.length - 1].t;
    const span = (last - first) / (24 * 60 * 60 * 1000);
    const firstYear = new Date(first).getFullYear();
    const lastYear = new Date(last).getFullYear();
    const out: number[] = [];
    if (span <= 60) {
      // Weekly ticks anchored to the first data point.
      const stepMs = 7 * 24 * 60 * 60 * 1000;
      for (let t = first; t <= last; t += stepMs) out.push(t);
    } else if (span <= 180) {
      // Bi-weekly ticks — gives ~6–12 labels for a 60–180 day span.
      const stepMs = 14 * 24 * 60 * 60 * 1000;
      for (let t = first; t <= last; t += stepMs) out.push(t);
    } else if (span <= 730) {
      // Monthly ticks anchored to the first of each month.
      const cursor = new Date(first);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      if (cursor.getTime() < first) cursor.setMonth(cursor.getMonth() + 1);
      while (cursor.getTime() <= last) {
        out.push(cursor.getTime());
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      // Quarterly ticks for very long spans (lifetime BSR, established listings).
      const cursor = new Date(first);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
      if (cursor.getTime() < first) cursor.setMonth(cursor.getMonth() + 3);
      while (cursor.getTime() <= last) {
        out.push(cursor.getTime());
        cursor.setMonth(cursor.getMonth() + 3);
      }
    }
    return { ticks: out, sameYear: firstYear === lastYear, spanDays: span };
  }, [data]);
  const formatTick = (ts: number) => {
    const d = new Date(ts);
    if (spanDays <= 180) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return sameYear
      ? d.toLocaleDateString('en-US', { month: 'short' })
      : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Period stamp for the popover footer — disambiguates the actual data
  // range. Format adapts to span length so short windows show day-level
  // detail while year-plus windows compress to month/year.
  const periodStamp = useMemo(() => {
    if (data.length < 2) return '';
    const first = new Date(data[0].t);
    const last = new Date(data[data.length - 1].t);
    const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const range = spanDays <= 180 ? `${fmtShort(first)} – ${fmtShort(last)}` : `${fmtMonth(first)} – ${fmtMonth(last)}`;
    let span: string;
    if (spanDays < 60) span = `${Math.round(spanDays)} days`;
    else if (spanDays < 365) span = `${Math.round(spanDays / 30)} months`;
    else {
      const years = spanDays / 365;
      const rounded = Math.round(years * 10) / 10;
      span = `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${rounded === 1 ? 'year' : 'years'}`;
    }
    return `${range} · ${span}`;
  }, [data, spanDays]);

  return (
    <div
      style={{ top, left, width: 360 }}
      className="fixed z-[9999] rounded-xl border border-slate-700/70 bg-slate-900/95 backdrop-blur-md shadow-2xl px-3 py-2 pointer-events-none"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-slate-300 font-semibold">{title}</div>
        <div className="text-[10px] text-slate-500">
          {isBsr ? 'Lower = better' : 'Over time'}
        </div>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, left: 8, bottom: 4 }}>
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={formatTick}
              stroke="#475569"
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={n => formatPopoverValue(n, metric)}
              stroke="#475569"
              axisLine={false}
              tickLine={false}
              width={48}
              domain={['auto', 'auto']}
              // Explicit standard orientation: low values at the bottom,
              // high at the top. For BSR (lower = better rank) the line
              // visually drops as a competitor improves — counter-
              // intuitive at first glance, but the "lower is better"
              // caption underneath the chart frames it. This matches
              // how the small inline sparkline renders by default, so
              // they read consistently.
              reversed={false}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: 6,
                fontSize: 11,
                color: '#e2e8f0'
              }}
              labelFormatter={(value: any) => formatPopoverDate(Number(value))}
              formatter={(value: any) => [formatPopoverValue(Number(value), metric), title]}
            />
            {/* Stockout markers — small rose dots at the line's drop and
                recovery points. The full-height ReferenceArea stripe was
                visually intrusive; the dots flag the boundaries without
                obscuring the chart. The line itself already breaks
                between drop and recovery (see the null-broken series
                upstream), so the gap reads as the stockout duration. */}
            {stockoutMarkers.map((m, i) => (
              <ReferenceDot
                key={`stockout-${i}`}
                x={m.t}
                y={m.v}
                r={3}
                fill="#fb7185"
                stroke="#fb7185"
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {periodStamp && (
        <div className="mt-1 text-[10px] text-slate-500 text-right">{periodStamp}</div>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Component
 * --------------------------------------------------------------------------*/

const PreVettingTabs: React.FC<PreVettingTabsProps> = ({ analysis, removedAsins }) => {
  const [activeTab, setActiveTab] = useState<LensId>('price-supply');
  const [expandedAsins, setExpandedAsins] = useState<Set<string>>(new Set());

  const profileSet = analysis?.computed?.competitorProfiles as CompetitorProfileSet | undefined;
  const narration = analysis?.computed?.narration?.preVetting as PreVettingNarration | undefined;
  const removedSet = useMemo(() => normalizeAsinSet(removedAsins), [removedAsins]);

  // Look up the daily series per competitor so we can render sparklines.
  // analysis.normalized is null for old cached rows pre-2.8b — sparklines
  // gracefully no-op in that case.
  const seriesByAsin = useMemo(() => {
    const map = new Map<string, NormalizedKeepaCompetitor>();
    const competitors = analysis?.normalized?.competitors;
    if (Array.isArray(competitors)) {
      for (const competitor of competitors) {
        if (competitor?.asin) map.set(competitor.asin, competitor);
      }
    }
    return map;
  }, [analysis]);

  if (!profileSet || !profileSet.competitors.length) return null;

  const competitors = profileSet.competitors.filter(
    c => !removedSet.has(c.asin.toUpperCase())
  );

  const narrativeByAsin = new Map<string, PreVettingCompetitorNarrative>();
  if (narration?.competitors) {
    for (const entry of narration.competitors) narrativeByAsin.set(entry.asin, entry);
  }

  const toggleAsin = (asin: string) => {
    setExpandedAsins(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Competitor Snapshots
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 mb-4">
        {TABS.map(tab => {
          const TabIcon = tab.Icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-slate-500/60'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Column headers (only on lenses where row stats are uniform). */}
      <ColumnHeaders activeTab={activeTab} />

      {/* Per-competitor cards */}
      <div className="space-y-2 mb-4">
        {competitors.map(competitor => {
          const narrative = narrativeByAsin.get(competitor.asin);
          const expanded = expandedAsins.has(competitor.asin);
          return (
            <CompetitorCard
              key={competitor.asin}
              activeTab={activeTab}
              competitor={competitor}
              narrative={narrative}
              series={seriesByAsin.get(competitor.asin)}
              expanded={expanded}
              onToggle={() => toggleAsin(competitor.asin)}
            />
          );
        })}
      </div>

      {/* Big-picture synthesis */}
      <BigPictureBox
        activeTab={activeTab}
        profileSet={profileSet}
        narration={narration}
      />
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Per-competitor card — collapsed by default
 * --------------------------------------------------------------------------*/

const CompetitorCard: React.FC<{
  activeTab: LensId;
  competitor: CompetitorProfile;
  narrative?: PreVettingCompetitorNarrative;
  series?: NormalizedKeepaCompetitor;
  expanded: boolean;
  onToggle: () => void;
}> = ({ activeTab, competitor, narrative, series, expanded, onToggle }) => {
  const headline = narrative?.headline || buildFallbackHeadline(competitor, activeTab);
  const longText = expandedNarrative(activeTab, competitor, narrative);
  const stats = lensStats(activeTab, competitor);
  const badges = badgesForLens(activeTab, competitor);
  const spark = sparkForLens(activeTab, competitor, series);

  const amazonUrl = `https://www.amazon.com/dp/${competitor.asin}`;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-900/60 transition-colors cursor-pointer rounded-xl"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        )}
        <CompetitorThumbnail imageUrl={series?.imageUrl ?? null} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div className="text-sm text-slate-100 font-semibold">
                {competitor.brand || competitor.asin}
              </div>
              <a
                href={amazonUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-slate-500 hover:text-blue-300 transition-colors"
                title="Open on Amazon"
                aria-label="Open on Amazon"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {badges.map((badge, i) => (
                <BadgePill key={i} badge={badge} />
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-200 shrink-0">
              {COLUMN_HEADERS_BY_LENS[activeTab].sparkLabel !== null && (
                <div className="w-20 flex justify-end">
                  {spark ? (
                    <Sparkline spec={spark} />
                  ) : (
                    // Established listings can come back with no last-12mo
                    // sparkline data (Keepa series may be sparse for very
                    // old products). An empty column read as "broken" —
                    // surface a tenure pill instead so the row still
                    // anchors against something. The full launch date is
                    // already in the right-side stats; this is a glance-
                    // value cue.
                    <TenurePill competitor={competitor} />
                  )}
                </div>
              )}
              {stats.map((stat, i) => (
                <div key={i} className="w-[96px] text-right">
                  <span className={`font-semibold ${statToneClass[stat.tone ?? 'slate']}`}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-300 mt-1 leading-relaxed">{headline}</div>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-700/40">
          <p className="text-sm text-slate-200 leading-relaxed">{longText}</p>
        </div>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Card thumbnail with hover-zoom popover (rendered at body level so the
 * preview isn't clipped by parent containers).
 * --------------------------------------------------------------------------*/

const CompetitorThumbnail: React.FC<{ imageUrl: string | null }> = ({ imageUrl }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered || !imageUrl) {
      setPosition(null);
      return;
    }
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const previewSize = 240;
    const margin = 12;
    let left = rect.right + margin;
    if (left + previewSize > window.innerWidth - margin) {
      left = rect.left - previewSize - margin;
    }
    let top = rect.top + rect.height / 2 - previewSize / 2;
    if (top < margin) top = margin;
    if (top + previewSize > window.innerHeight - margin) {
      top = window.innerHeight - previewSize - margin;
    }
    setPosition({ top, left });
  }, [hovered, imageUrl]);

  if (!imageUrl) {
    return <div className="w-12 h-12 rounded-md bg-slate-800/60 border border-slate-700/60 shrink-0" />;
  }

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={e => e.stopPropagation()}
      className="shrink-0"
    >
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="w-12 h-12 rounded-md object-contain bg-white/5 border border-slate-700/60 cursor-zoom-in"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      {hovered && position && typeof document !== 'undefined' && createPortal(
        <div
          style={{ top: position.top, left: position.left, width: 240, height: 240 }}
          className="fixed z-[9999] rounded-xl border border-slate-700/70 bg-slate-900/95 backdrop-blur-md shadow-2xl p-2 pointer-events-none"
        >
          <img src={imageUrl} alt="" className="w-full h-full object-contain rounded-md bg-white/5" />
        </div>,
        document.body
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Column headers (right-aligned strip above the cards). All non-tenure
 * metrics are on a 12-month window — the headers carry the period
 * explicitly so each row's pill label can stay terse (e.g. "Avg" instead
 * of "Year avg"). Launches gets no sparkline column — for established
 * listings the launch ramp data is mostly empty, and even when present
 * the 120-day-post-launch view isn't intuitive. The QUICK / SLOW
 * TRACTION badge does the at-a-glance work.
 * --------------------------------------------------------------------------*/

interface LensHeaders {
  sparkLabel: string | null;
  statLabels: string[];
}

const COLUMN_HEADERS_BY_LENS: Record<LensId, LensHeaders> = {
  launch: { sparkLabel: null, statLabels: ['Launched', 'On Amazon'] },
  'price-supply': {
    sparkLabel: 'Trend · Last 12mo',
    statLabels: ['Buy Box Avg · Last 12mo', 'Buy Box Now']
  },
  rank: {
    sparkLabel: 'Trend · Last 12mo',
    statLabels: ['Avg BSR · Last 12mo', 'Current BSR']
  }
};

const ColumnHeaders: React.FC<{ activeTab: LensId }> = ({ activeTab }) => {
  const headers = COLUMN_HEADERS_BY_LENS[activeTab];
  return (
    <div className="px-4 mb-1 flex justify-end">
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-500">
        {headers.sparkLabel !== null && (
          <div className="w-20 text-right">{headers.sparkLabel}</div>
        )}
        {headers.statLabels.map((label, i) => (
          <div key={i} className="w-[96px] text-right">{label}</div>
        ))}
      </div>
    </div>
  );
};

/**
 * Tiny tenure indicator that sits in the sparkline column for any row
 * where we don't have enough series data to plot a chart. Shows
 * "{N}y" / "{M}mo" + an Established framing on hover. Intentionally
 * matches the sparkline column's w-20 footprint so layout stays
 * consistent.
 */
const TenurePill: React.FC<{ competitor: CompetitorProfile }> = ({ competitor }) => {
  const days = competitor.launch.daysOnMarket;
  if (!days || !Number.isFinite(days)) {
    return <div className="h-6 w-20" />;
  }
  const established = !competitor.launch.isWithinAnalysisWindow;
  const compact =
    days >= 365
      ? `${Math.round((days / 365) * 10) / 10}y`
      : days >= 30
        ? `${Math.round(days / 30)}mo`
        : `${Math.round(days)}d`;
  const tooltip = established
    ? `Listed ~${formatDays(days)} ago — chart history is too sparse to plot a 12-month trend, but the listing has weathered the category.`
    : `Listed ~${formatDays(days)} ago — too little data in the last 12 months to plot a trend.`;
  return (
    <InfoTooltip content={tooltip}>
      <div
        className={`h-6 w-20 inline-flex items-center justify-end gap-1 px-2 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${
          established
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
            : 'border-slate-700/60 bg-slate-800/40 text-slate-300'
        }`}
        aria-label={tooltip}
      >
        <Clock className="w-3 h-3" />
        {compact}
      </div>
    </InfoTooltip>
  );
};

const BadgePill: React.FC<{ badge: Badge }> = ({ badge }) => {
  const Icon = badge.icon ? BADGE_ICON[badge.icon] : null;
  return (
    <InfoTooltip content={badge.tooltip ?? badge.label}>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE_TONE_CLASS[badge.tone]}`}
      >
        {Icon && <Icon className="w-3 h-3" />}
        {badge.label}
      </span>
    </InfoTooltip>
  );
};

/* ----------------------------------------------------------------------------
 * Big-picture synthesis box
 * --------------------------------------------------------------------------*/

const BigPictureBox: React.FC<{
  activeTab: LensId;
  profileSet: CompetitorProfileSet;
  narration?: PreVettingNarration;
}> = ({ activeTab, profileSet, narration }) => {
  const aiText =
    activeTab === 'launch'
      ? narration?.bigPicture.launchPicture
      : activeTab === 'price-supply'
      ? narration?.bigPicture.pricePicture
      : narration?.bigPicture.rankPicture;

  const fallbackText =
    activeTab === 'launch'
      ? buildLaunchBigPictureFallback(profileSet)
      : activeTab === 'price-supply'
      ? buildPriceBigPictureFallback(profileSet)
      : buildRankBigPictureFallback(profileSet);

  const text = aiText || fallbackText;
  if (!text) return null;

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-sky-300/80 mb-1">
        Big picture
      </div>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Fallback narratives (used when AI narration is missing)
 * --------------------------------------------------------------------------*/

const buildFallbackHeadline = (c: CompetitorProfile, lens: LensId): string => {
  // Headline = insight, not measurement. The right-side stat columns and
  // pills already carry the numbers, so the headline must add a *read* on
  // those numbers — what they mean for a new seller — not restate them.
  if (lens === 'launch') {
    if (!c.launch.isWithinAnalysisWindow) {
      return 'Predates the analysis window — no launch ramp data, but their current presence speaks for itself.';
    }
    const traction = c.launch.daysToTraction;
    if (c.launch.launchedOnSale && traction !== null && traction <= 60) {
      return 'Aggressive launch — used a discounted entry and converted into traction within two months.';
    }
    if (c.launch.launchedOnSale) {
      return 'Came in with an advertised launch sale — pricing was their lever to get noticed.';
    }
    if (traction !== null && traction <= 60) return 'Quickly accepted by the category — needed only a couple of months to find traction.';
    if (traction !== null && traction >= 150) return 'Slow ramp — took five-plus months to find traction, suggesting the category is hard to break into.';
    if (traction !== null) return 'Moderate ramp — needed three to four months to gain traction.';
    return 'Still finding their pace — limited traction data so far.';
  }
  if (lens === 'price-supply') {
    const stockoutCount = c.priceSupply.stockoutCount;
    const longest = c.priceSupply.longestStockoutDays ?? 0;
    if (stockoutCount >= 3 || longest > 30) {
      return 'Recurring supply gaps signal weak inventory discipline — a real opening for a steadier seller.';
    }
    if (stockoutCount > 0) {
      return 'Mostly steady supply with the occasional gap — not a chronic problem.';
    }
    if (c.priceSupply.priceActivityLevel === 'active') {
      return 'Defensive operator — keeps inventory steady and adjusts price often. Expect them to react to undercutting.';
    }
    if (c.priceSupply.priceActivityLevel === 'lazy') {
      return 'Set-and-forget pricer with reliable supply — slow to respond to competitive moves.';
    }
    return 'Steady supply with measured price activity.';
  }
  // rank
  const cmp = c.rank.currentVsYearAverage;
  const volatile = c.rank.volatilityPct !== null && c.rank.volatilityPct >= 60;
  if (volatile && cmp === 'much-better-than-average') {
    return 'Currently riding a strong stretch, but rank is volatile — sales can swing back fast.';
  }
  if (volatile) return 'Highly volatile rank — sales day-to-day are unpredictable.';
  if (cmp === 'much-better-than-average') return 'In their best rank stretch we have on file.';
  if (cmp === 'much-worse-than-average') return 'In a rough patch — well below their year average.';
  if (cmp === 'better-than-average') return 'Trending better than their year-average pace.';
  if (cmp === 'worse-than-average') return 'Slipping below their year-average pace.';
  if (cmp === 'about-average') return 'Rank holding consistent across the window — predictable performer.';
  return 'Rank trajectory is unclear from the available data.';
};

const expandedNarrative = (
  lens: LensId,
  competitor: CompetitorProfile,
  narrative?: PreVettingCompetitorNarrative
): string => {
  if (narrative) {
    if (lens === 'launch' && narrative.launchNarrative) return narrative.launchNarrative;
    if (lens === 'price-supply' && narrative.priceSupplyNarrative) return narrative.priceSupplyNarrative;
    if (lens === 'rank' && narrative.rankNarrative) return narrative.rankNarrative;
  }
  return buildFactsOnlyNarrative(lens, competitor);
};

const buildFactsOnlyNarrative = (lens: LensId, c: CompetitorProfile): string => {
  // Expanded view = additive detail. Don't repeat the stat columns or the
  // headline. Each line should expose a number the user can't already see
  // in the collapsed row.
  if (lens === 'launch') {
    const parts: string[] = [];
    if (c.launch.launchedOnSale && c.launch.launchListPrice && c.launch.launchBuyBoxPrice && c.launch.launchDiscountPct !== null) {
      parts.push(
        `Launch price ${formatCurrency(c.launch.launchBuyBoxPrice)} against a ${formatCurrency(c.launch.launchListPrice)} list price — a ${Math.round(c.launch.launchDiscountPct)}% advertised discount.`
      );
    }
    if (c.launch.daysToFirstSale !== null && c.launch.isWithinAnalysisWindow) {
      parts.push(`First confirmed sale within ${formatDays(c.launch.daysToFirstSale)} of listing.`);
    }
    if (!c.launch.isWithinAnalysisWindow && c.launch.launchDate !== null) {
      parts.push(
        `Tracked since ${formatLaunchDate(c.launch.launchDate)} — we only have the most recent 12 months of detail, but their long tenure tells you they have weathered the category.`
      );
    }
    return parts.length ? parts.join(' ') : 'No additional launch detail beyond what is shown above.';
  }
  if (lens === 'price-supply') {
    const parts: string[] = [];
    if (c.priceSupply.priceFloor !== null && c.priceSupply.priceCeiling !== null) {
      parts.push(
        `Trading range over the past 12 months: ${formatCurrency(c.priceSupply.priceFloor)}–${formatCurrency(c.priceSupply.priceCeiling)}.`
      );
    }
    if (c.priceSupply.priceChangesPerMonth !== null) {
      parts.push(
        `Adjusts the buy-box price about ${c.priceSupply.priceChangesPerMonth.toFixed(1)} times per month on average.`
      );
    }
    if (c.priceSupply.stockoutCount > 0 && c.priceSupply.longestStockoutDays !== null) {
      const days = c.priceSupply.totalStockoutDays;
      parts.push(
        `Cumulative ${days} days out of stock in the window; longest single stockout ran ${c.priceSupply.longestStockoutDays} days.`
      );
      if (c.priceSupply.daysSinceLastStockout !== null) {
        parts.push(`Most recent stockout ended ${c.priceSupply.daysSinceLastStockout} days ago.`);
      }
    }
    return parts.length ? parts.join(' ') : 'No additional price or supply detail beyond what is shown above.';
  }
  // rank
  const parts: string[] = [];
  if (c.rank.bsrFloor !== null && c.rank.bsrCeiling !== null) {
    parts.push(
      `Best rank seen: ${formatBsr(c.rank.bsrFloor)}. Worst: ${formatBsr(c.rank.bsrCeiling)}.`
    );
  }
  if (c.rank.bsrAvg30d !== null && c.rank.bsrAvg90d !== null) {
    parts.push(
      `Recent trend — 30-day average ${formatBsr(c.rank.bsrAvg30d)}, 90-day average ${formatBsr(c.rank.bsrAvg90d)}.`
    );
  }
  if (c.rank.volatilityPct !== null) {
    const interp =
      c.rank.volatilityPct >= 60
        ? 'wide swings — expect lumpy day-to-day sales'
        : c.rank.volatilityPct >= 30
        ? 'moderate movement'
        : 'tight, predictable rank';
    parts.push(`Rank volatility ~${Math.round(c.rank.volatilityPct)}% (${interp}).`);
  }
  return parts.length ? parts.join(' ') : 'No additional rank detail beyond what is shown above.';
};

const lensStats = (
  lens: LensId,
  c: CompetitorProfile
): Array<{ label: string; value: string; tone?: BadgeTone }> => {
  if (lens === 'launch') {
    // Uniform columns across all rows. Time-to-traction is conveyed via the
    // QUICK / SLOW TRACTION badge and the headline; "On Amazon" tenure is
    // the most useful single number to anchor on for both new and
    // established listings.
    const established = !c.launch.isWithinAnalysisWindow;
    return [
      { label: 'Launched', value: formatLaunchDate(c.launch.launchDate) },
      {
        label: 'On Amazon',
        value: formatDays(c.launch.daysOnMarket),
        tone: established ? 'sky' : 'slate'
      }
    ];
  }
  if (lens === 'price-supply') {
    // Buy-box average is more decision-relevant for pricing strategy than
    // the stockout count — moved here. Stockouts still surface via the
    // pill next to the brand name.
    return [
      { label: 'Buy box avg', value: formatCurrency(c.priceSupply.buyBoxAverage) },
      { label: 'Buy box now', value: formatCurrency(c.priceSupply.currentBuyBox) }
    ];
  }
  // Column header carries "Last 12mo" / "Current BSR" — keep pill
  // labels terse here so they don't restate the period.
  return [
    {
      label: 'Avg',
      value: formatBsr(c.rank.bsrAvg365d),
      tone: toneForBsr(c.rank.bsrAvg365d)
    },
    {
      label: 'Current',
      value: formatBsr(c.rank.bsrCurrent),
      tone: toneForBsr(c.rank.bsrCurrent)
    }
  ];
};

/**
 * Per-lens sparkline spec. Returns null when the source series is empty
 * so the row collapses cleanly. All non-launch lenses are filtered to the
 * past 12 months so charts and stats share one consistent window.
 */
const last12Months = <T extends { timestamp: number }>(points: T[]): T[] => {
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  return points.filter(p => p.timestamp >= cutoff);
};
const sparkForLens = (
  lens: LensId,
  c: CompetitorProfile,
  series?: NormalizedKeepaCompetitor
): SparkSpec | null => {
  if (!series) return null;
  if (lens === 'launch') {
    // No sparkline on Launches — see the rationale in COLUMN_HEADERS_BY_LENS.
    return null;
  }
  if (lens === 'price-supply') {
    const bb = last12Months(series.series.buyBoxShipping);
    const pr = last12Months(series.series.price);
    return {
      points: bb.length >= 5 ? bb : pr,
      tone: 'amber',
      metric: 'price',
      title: 'Buy Box price — last 12 months'
    };
  }
  return {
    points: last12Months(series.series.bsr),
    tone: toneForBsr(c.rank.bsrAvg365d),
    metric: 'bsr',
    title: 'BSR — last 12 months'
  };
};

const buildLaunchBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.launch;
  if (bp.countOver12mo >= 2) {
    return `${bp.countOver12mo} of the top ${set.competitors.length} launched within the past 12 months — this market is open to newcomers.`;
  }
  if (bp.countOver12mo === 1) {
    return `Only 1 of the top ${set.competitors.length} launched in the past 12 months — newcomers can break in but it's harder.`;
  }
  return `No top-${set.competitors.length} competitor has launched in the past 12 months — the leaders here are well-established.`;
};

const buildPriceBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.priceSupply;
  const stockoutsText =
    bp.totalStockoutEvents === 0
      ? 'No stockouts across the top competitors — supply has been steady.'
      : `${bp.totalStockoutEvents} stockout event${bp.totalStockoutEvents > 1 ? 's' : ''} totaling ~${bp.totalStockoutDays} days across all competitors.`;
  const activityText =
    bp.activeSellerCount > 0
      ? `${bp.activeSellerCount} of ${set.competitors.length} competitors actively manage price; expect frequent undercutting.`
      : `Pricing has been quiet — competitors aren't adjusting often.`;
  return `${activityText} ${stockoutsText}`;
};

const buildRankBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.rank;
  if (bp.avgYearlyBsr === null) return 'Limited rank data across competitors.';
  // Demand strength = how strong the category sells overall (BSR floor).
  // Rank consistency = how lumpy day-to-day sales are. Two different axes —
  // never collapse them. Prior version said "Demand is {bsrConsistency}"
  // which produced "Demand is mixed" on markets with strong year-average
  // BSRs. The wording must reflect demandStrength for the demand call.
  const demandLabel: Record<typeof bp.demandStrength, string> = {
    strong: 'Demand is strong',
    moderate: 'Demand is moderate',
    weak: 'Demand is thin',
    unknown: 'Demand quality is unclear from the available data'
  };
  const consistencyLabel: Record<typeof bp.bsrConsistency, string> = {
    consistent: 'and rank holds steady day-to-day',
    mixed: 'though day-to-day rank swings noticeably',
    'highly-volatile': 'with very lumpy day-to-day rank movement',
    unknown: ''
  };
  const tail = consistencyLabel[bp.bsrConsistency] ? `, ${consistencyLabel[bp.bsrConsistency]}` : '';
  return `Top competitors average ${formatBsr(bp.avgYearlyBsr)} BSR over the year — the strongest sustained rank seen was ${formatBsr(bp.bestYearlyBsr)}, the worst ${formatBsr(bp.worstYearlyBsr)}. ${demandLabel[bp.demandStrength]}${tail}.`;
};

export default PreVettingTabs;
