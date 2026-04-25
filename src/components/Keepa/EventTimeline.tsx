'use client';

import React, { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import {
  Rocket,
  Users,
  Percent,
  ArrowUpCircle,
  ArrowDownCircle,
  Star,
  PackageX
} from 'lucide-react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import type { MarketEvent, MarketEventType } from '@/lib/marketClimate/events';

interface EventTimelineProps {
  analysis: KeepaAnalysisSnapshot;
  removedAsins?: Set<string> | string[];
}

/* ----------------------------------------------------------------------------
 * Event visual taxonomy
 * --------------------------------------------------------------------------*/

type EventCategory = 'launch' | 'price' | 'rank' | 'reviews' | 'supply';

const EVENT_META: Record<
  MarketEventType,
  {
    category: EventCategory;
    label: string;
    color: string;          // hex for the dot / evidence line
    pillClass: string;      // tailwind pill class set for the detail header
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  LAUNCH: {
    category: 'launch',
    label: 'Launch',
    color: '#38bdf8',
    pillClass: 'bg-sky-500/15 text-sky-200 border-sky-500/40',
    Icon: Rocket
  },
  COMPETITOR_ENTRY: {
    category: 'launch',
    label: 'New sellers',
    color: '#a78bfa',
    pillClass: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
    Icon: Users
  },
  MAJOR_PROMO: {
    category: 'price',
    label: 'Promo',
    color: '#f59e0b',
    pillClass: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
    Icon: Percent
  },
  PROMO_CASCADE: {
    category: 'price',
    label: 'Market-wide promo',
    color: '#fb7185',
    pillClass: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
    Icon: Percent
  },
  RANK_BREAKOUT: {
    category: 'rank',
    label: 'Rank breakout',
    color: '#34d399',
    pillClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
    Icon: ArrowUpCircle
  },
  RANK_COLLAPSE: {
    category: 'rank',
    label: 'Rank collapse',
    color: '#ef4444',
    pillClass: 'bg-red-500/15 text-red-200 border-red-500/40',
    Icon: ArrowDownCircle
  },
  REVIEW_ACCELERATION: {
    category: 'reviews',
    label: 'Reviews accelerating',
    color: '#c084fc',
    pillClass: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40',
    Icon: Star
  },
  STOCKOUT: {
    category: 'supply',
    label: 'Stockout',
    color: '#fb923c',
    pillClass: 'bg-orange-500/15 text-orange-200 border-orange-500/40',
    Icon: PackageX
  }
};

const CATEGORY_CHIPS: Array<{ id: EventCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'launch', label: 'Launches' },
  { id: 'price', label: 'Price' },
  { id: 'rank', label: 'Rank' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'supply', label: 'Supply' }
];

/* ----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (timestamp?: number | null): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const d = new Date(timestamp);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

const formatDateRange = (start?: number, end?: number): string => {
  if (!start) return '';
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} → ${formatDate(end)}`;
};

const dotSizeFromImpact = (impactScore: number): number => {
  // Impact 0–100 → 7–15px diameter. Big, important events are visibly bigger.
  return Math.max(7, Math.min(15, 7 + Math.round(impactScore / 14)));
};

// Turn the numeric impact score into a plain-language severity tier.
// The tiers are the source of truth for the Low/Medium/High label
// and for the tooltip copy that explains what the tier means.
const impactTier = (score: number): { label: 'Low' | 'Medium' | 'High'; explainer: string } => {
  if (score >= 75) {
    return {
      label: 'High',
      explainer:
        "Big deal — changes the reading of this competitor or the market as a whole. Pay attention to this one."
    };
  }
  if (score >= 50) {
    return {
      label: 'Medium',
      explainer:
        "Noticeable event worth knowing about — not a game-changer, but shaped the recent chart."
    };
  }
  return {
    label: 'Low',
    explainer:
      "Small or short-lived event. Useful context but usually not enough to change a decision on its own."
  };
};

/**
 * Pack dots into 3 vertical lanes so overlapping timestamps don't collapse
 * into a visual blob. A dot moves to the next lane if it falls within
 * `collisionPct` of any dot already in the current lane.
 */
const assignLane = (
  events: Array<{ ev: MarketEvent; index: number }>,
  percentFor: (ts: number) => number,
  collisionPct = 1.6
): Map<number, number> => {
  const lanes: Array<number[]> = [[], [], []];
  const map = new Map<number, number>();
  // Sort by timestamp so collisions resolve deterministically left→right.
  const sorted = [...events].sort((a, b) => a.ev.startTimestamp - b.ev.startTimestamp);
  for (const { ev, index } of sorted) {
    const x = percentFor(ev.startTimestamp);
    let placed = false;
    for (let lane = 0; lane < lanes.length; lane++) {
      const laneXs = lanes[lane];
      const conflict = laneXs.some(prev => Math.abs(prev - x) < collisionPct);
      if (!conflict) {
        lanes[lane].push(x);
        map.set(index, lane);
        placed = true;
        break;
      }
    }
    if (!placed) map.set(index, 0); // overflow: stack in lane 0
  }
  return map;
};

const normalizeAsinSet = (raw: EventTimelineProps['removedAsins']): Set<string> => {
  if (!raw) return new Set();
  const values = Array.isArray(raw) ? raw : Array.from(raw);
  return new Set(values.map(a => a.toUpperCase()));
};

/* ----------------------------------------------------------------------------
 * Component
 * --------------------------------------------------------------------------*/

const EventTimeline: React.FC<EventTimelineProps> = ({ analysis, removedAsins }) => {
  const events: MarketEvent[] = analysis?.computed?.events ?? [];
  const windowMonths = analysis?.computed?.windowMonths ?? 12;

  const [filterCategory, setFilterCategory] = useState<EventCategory | 'all'>('all');
  const [filterAsin, setFilterAsin] = useState<string>('all');
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  const removedSet = useMemo(() => normalizeAsinSet(removedAsins), [removedAsins]);

  // Competitor list for the dropdown — derived from events themselves so the
  // menu only shows competitors that actually have events.
  const competitorOptions = useMemo(() => {
    const byAsin = new Map<string, { asin: string; label: string }>();
    for (const ev of events) {
      if (ev.asin === 'MARKET') continue;
      const asin = ev.asin.toUpperCase();
      if (removedSet.has(asin)) continue;
      if (!byAsin.has(asin)) {
        byAsin.set(asin, { asin, label: ev.brand || ev.asin });
      }
    }
    return Array.from(byAsin.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [events, removedSet]);

  // Timeline axis — anchor bounds to (a) the analysis window, (b) the earliest
  // event, and (c) now. This keeps the axis steady as filters change.
  const { minTs, maxTs } = useMemo(() => {
    const now = Date.now();
    const windowStart = now - windowMonths * 30 * DAY_MS;
    const eventTimestamps = events.map(e => e.startTimestamp).filter(t => Number.isFinite(t));
    const earliest = eventTimestamps.length ? Math.min(...eventTimestamps) : windowStart;
    return {
      minTs: Math.min(earliest, windowStart),
      maxTs: now
    };
  }, [events, windowMonths]);

  const filtered = useMemo(() => {
    return events
      .map((ev, index) => ({ ev, index }))
      .filter(({ ev }) => {
        if (removedSet.has(ev.asin.toUpperCase()) && ev.asin !== 'MARKET') return false;
        if (filterCategory !== 'all' && EVENT_META[ev.type].category !== filterCategory) return false;
        if (filterAsin !== 'all' && ev.asin !== filterAsin) return false;
        return true;
      });
  }, [events, filterCategory, filterAsin, removedSet]);

  // Clear the selected event if filters knocked it out of the visible set.
  const selectedStillVisible =
    selectedEventIndex !== null &&
    filtered.some(item => item.index === selectedEventIndex);
  const effectiveSelected = selectedStillVisible ? selectedEventIndex : null;

  // Month gridlines — one per month across the axis.
  const monthTicks = useMemo(() => {
    const ticks: Array<{ timestamp: number; label: string }> = [];
    const start = new Date(minTs);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    let cursor = start.getTime();
    while (cursor <= maxTs) {
      const d = new Date(cursor);
      ticks.push({
        timestamp: cursor,
        label: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
      cursor = d.getTime();
    }
    return ticks;
  }, [minTs, maxTs]);

  if (!events.length) return null;

  const axisRange = Math.max(1, maxTs - minTs);
  const percentFor = (timestamp: number) =>
    Math.max(0, Math.min(100, ((timestamp - minTs) / axisRange) * 100));

  const selectedEvent = effectiveSelected !== null ? events[effectiveSelected] : null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          What happened, when
        </div>
        <div className="text-xs text-slate-400">
          {filtered.length} event{filtered.length === 1 ? '' : 's'} shown
        </div>
      </div>

      {/* Filter chips + competitor dropdown */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {CATEGORY_CHIPS.map(chip => {
          const active = filterCategory === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilterCategory(chip.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-slate-500/60'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
        {competitorOptions.length > 1 && (
          <select
            value={filterAsin}
            onChange={e => setFilterAsin(e.target.value)}
            className="ml-2 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-200"
          >
            <option value="all">All competitors</option>
            {competitorOptions.map(opt => (
              <option key={opt.asin} value={opt.asin}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Timeline bar */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-5 pt-5 pb-3">
        <TimelineBar
          filtered={filtered}
          percentFor={percentFor}
          monthTicks={monthTicks}
          effectiveSelected={effectiveSelected}
          setSelectedEventIndex={setSelectedEventIndex}
        />
        {/* Axis labels — every 3rd month + year boundaries */}
        <div className="relative h-4 mt-1 text-[10px] text-slate-500">
          {monthTicks.map((tick, i) => {
            const date = new Date(tick.timestamp);
            const isYearBoundary = date.getUTCMonth() === 0;
            const isQuarter = date.getUTCMonth() % 3 === 0;
            if (!isYearBoundary && !isQuarter) return null;
            return (
              <div
                key={i}
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${percentFor(tick.timestamp)}%` }}
              >
                {tick.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected event detail card */}
      {selectedEvent && (
        <SelectedEventCard
          event={selectedEvent}
          onClose={() => setSelectedEventIndex(null)}
        />
      )}

      {/* Empty state when filters leave no events */}
      {filtered.length === 0 && (
        <EmptyStateMessage
          category={filterCategory}
          hasAnyEvents={events.length > 0}
        />
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Timeline bar
 * --------------------------------------------------------------------------*/

const TimelineBar: React.FC<{
  filtered: Array<{ ev: MarketEvent; index: number }>;
  percentFor: (ts: number) => number;
  monthTicks: Array<{ timestamp: number; label: string }>;
  effectiveSelected: number | null;
  setSelectedEventIndex: (idx: number | null) => void;
}> = ({ filtered, percentFor, monthTicks, effectiveSelected, setSelectedEventIndex }) => {
  const laneMap = useMemo(() => assignLane(filtered, percentFor), [filtered, percentFor]);
  // Lane positions as percentage of the bar's height. Lane 1 is the
  // centerline; lanes 0 and 2 sit above/below it.
  const LANE_Y_PCT = [30, 50, 70];

  return (
    <>
      <div className="relative h-24">
        {/* Month gridlines */}
        {monthTicks.map((tick, i) => {
          const left = percentFor(tick.timestamp);
          const isYearBoundary = new Date(tick.timestamp).getUTCMonth() === 0;
          return (
            <div key={i} className="absolute top-0 bottom-0" style={{ left: `${left}%` }}>
              <div
                className={`w-px h-full ${
                  isYearBoundary ? 'bg-slate-600/50' : 'bg-slate-700/30'
                }`}
              />
            </div>
          );
        })}
        {/* Centerline */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-slate-700/60" />
        {/* Event dots */}
        {filtered.map(({ ev, index }) => {
          const meta = EVENT_META[ev.type];
          const left = percentFor(ev.startTimestamp);
          const size = dotSizeFromImpact(ev.impactScore);
          const isSelected = effectiveSelected === index;
          const lane = laneMap.get(index) ?? 1;
          const top = LANE_Y_PCT[Math.min(lane, LANE_Y_PCT.length - 1)];
          return (
            <button
              key={`${ev.type}-${index}`}
              type="button"
              onClick={() => setSelectedEventIndex(isSelected ? null : index)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125 focus:outline-none"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: meta.color,
                boxShadow: isSelected
                  ? `0 0 0 3px ${meta.color}40, 0 0 12px ${meta.color}80`
                  : `0 0 4px ${meta.color}60`,
                zIndex: isSelected ? 20 : 10
              }}
              title={`${meta.label} · ${ev.brand || ev.asin} · ${formatDate(ev.startTimestamp)}`}
              aria-label={`${meta.label} event on ${formatDate(ev.startTimestamp)}`}
            />
          );
        })}
      </div>
    </>
  );
};

const EmptyStateMessage: React.FC<{
  category: EventCategory | 'all';
  hasAnyEvents: boolean;
}> = ({ category, hasAnyEvents }) => {
  // Turn "no events" from a failure signal into a readable market signal —
  // an empty category usually means that kind of behavior didn't happen.
  const copy: Record<EventCategory | 'all', string> = {
    all: hasAnyEvents
      ? 'No events match the current filter. Try switching chips or clearing the competitor filter.'
      : "Nothing notable happened in this window — prices held, rank stayed steady, no major supply disruptions.",
    launch:
      "No competitors launched inside the analysis window — everyone showing up here has been on the market for a while.",
    price:
      "No meaningful promo events detected. Competitors didn't drop price 10%+ for multiple days running during the window.",
    rank:
      "No big rank swings — the top 5 held roughly steady positions without doubling or halving their Best Sellers Rank.",
    reviews:
      "Review pace has been steady — no competitor saw a burst of new reviews that would indicate a viral moment or external push.",
    supply:
      'No competitor went out of stock during the analysis window. Supply has been steady across the top 5.'
  };
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-4 py-3 text-sm text-slate-400 mt-3">
      {copy[category]}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Selected event card
 * --------------------------------------------------------------------------*/

const SelectedEventCard: React.FC<{
  event: MarketEvent;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const meta = EVENT_META[event.type];
  const EvIcon = meta.Icon;
  const tier = impactTier(event.impactScore);
  const evidencePoints = useMemo(
    () =>
      event.evidence.dataPoints
        .filter(p => typeof p.value === 'number' && Number.isFinite(p.value))
        .map(p => ({ t: p.timestamp, v: p.value as number })),
    [event]
  );

  const metric = event.evidence.metric;
  const isBsr = metric === 'bsr';
  const isMoney = metric === 'price' || metric === 'buyBoxShipping';
  const axisLabel =
    metric === 'bsr' ? 'Best Sellers Rank (lower = better)' :
    metric === 'price' ? 'Price ($)' :
    metric === 'buyBoxShipping' ? 'Buy Box price ($)' :
    metric === 'reviewCount' ? 'Total reviews' :
    'New offer count';

  const formatAxisValue = (n: number) => {
    if (!Number.isFinite(n)) return '';
    if (isMoney) return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
    if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(0)}K`;
    return Math.round(n).toLocaleString();
  };

  const formatTooltipTs = (ts: number) => {
    const d = new Date(ts);
    return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 px-5 py-4 mt-3">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.pillClass}`}
          >
            <EvIcon className="w-3 h-3" />
            {meta.label}
          </span>
          <div className="text-sm text-slate-200 font-medium">
            {event.asin === 'MARKET' ? 'Market-wide' : event.brand || event.asin}
          </div>
          <div className="text-xs text-slate-400">
            {formatDateRange(event.startTimestamp, event.endTimestamp)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-xs text-slate-400 cursor-help"
            title={`${tier.explainer} (Internal score ${event.impactScore}/100, based on magnitude, duration, and recency.)`}
          >
            <span className="text-slate-500 mr-1">Impact:</span>
            <span className="text-slate-200 font-semibold">{tier.label}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            Close
          </button>
        </div>
      </div>

      {event.description && (
        <p className="text-sm text-slate-300 leading-relaxed mb-3">{event.description}</p>
      )}

      {evidencePoints.length >= 2 && (
        <div>
          <div className="flex items-end justify-between text-[10px] text-slate-500 mb-1">
            <span>{axisLabel}</span>
            <span className="text-slate-600">Hover the line for exact values</span>
          </div>
          <div className="h-28 bg-slate-900/30 rounded-md border border-slate-800/60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evidencePoints} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                <XAxis
                  dataKey="t"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={ts => {
                    const d = new Date(ts);
                    return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}`;
                  }}
                  stroke="#475569"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={formatAxisValue}
                  stroke="#475569"
                  axisLine={false}
                  tickLine={false}
                  width={50}
                  reversed={isBsr}
                  domain={['auto', 'auto']}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(51, 65, 85, 0.6)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#e2e8f0'
                  }}
                  labelFormatter={(value: any) => formatTooltipTs(Number(value))}
                  formatter={(value: any) => [formatAxisValue(Number(value)), axisLabel]}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={meta.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {isBsr && (
            <div className="text-[10px] text-slate-500 mt-1">
              Y-axis inverted so an upward line reads as "rank is improving."
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EventTimeline;
