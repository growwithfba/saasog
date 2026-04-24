'use client';

import React, { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
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
        <div className="relative h-20">
          {/* Month gridlines */}
          {monthTicks.map((tick, i) => {
            const left = percentFor(tick.timestamp);
            const isYearBoundary = new Date(tick.timestamp).getUTCMonth() === 0;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{ left: `${left}%` }}
              >
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
            return (
              <button
                key={`${ev.type}-${index}`}
                type="button"
                onClick={() =>
                  setSelectedEventIndex(isSelected ? null : index)
                }
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125 focus:outline-none"
                style={{
                  left: `${left}%`,
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
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-4 py-3 text-sm text-slate-400 mt-3">
          No events match the current filter. Try switching chips or clearing the competitor filter.
        </div>
      )}
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
  const priceOrReviewMetric = event.evidence.metric === 'reviewCount';
  const evidencePoints = useMemo(
    () =>
      event.evidence.dataPoints
        .filter(p => typeof p.value === 'number' && Number.isFinite(p.value))
        .map(p => ({ t: p.timestamp, v: p.value as number })),
    [event]
  );

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 px-5 py-4 mt-3">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3">
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
          <div className="text-xs text-slate-400">
            Impact <span className="text-slate-200 font-medium">{event.impactScore}</span>/100
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
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={evidencePoints}
              margin={{ top: 6, right: 8, left: 8, bottom: 2 }}
            >
              <XAxis dataKey="t" hide />
              <YAxis hide domain={['auto', 'auto']} reversed={event.evidence.metric === 'bsr'} />
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
          <div className="text-[10px] text-slate-500 mt-1">
            {event.evidence.metric === 'bsr'
              ? 'BSR — lower is better. Chart inverted so up = better rank.'
              : event.evidence.metric === 'price'
              ? 'Price over the event window.'
              : event.evidence.metric === 'reviewCount'
              ? 'Cumulative review count over the event window.'
              : event.evidence.metric === 'buyBoxShipping'
              ? 'Buy Box price (gaps mean no Buy Box winner — stockout).'
              : 'Offer count over the event window.'}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventTimeline;
