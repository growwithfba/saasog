import React, { useMemo, useState } from 'react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import SignalBadge from './SignalBadge';
import { Tooltip } from '../Offer/components/Tooltip';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

interface KeepaCompareTabProps {
  analysis: KeepaAnalysisSnapshot;
}

type SortKey =
  | 'brand'
  | 'priceStability'
  | 'rankStability'
  | 'promo'
  | 'avgPrice'
  | 'avgBsr'
  | 'peakMonths'
  | 'trend';

type SortDirection = 'asc' | 'desc';
type SortConfig = { key: SortKey; direction: SortDirection } | null;
type MetricTone = 'good' | 'mid' | 'neutral' | 'bad' | 'missing';
type TrendSummary = 'Improving' | 'Stable' | 'Declining';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NA_LABEL = 'NA';
const MISSING_TOOLTIP = 'Insufficient data';

const METRIC_COLOR_CONFIG = {
  thresholds: {
    priceStability: { good: 90, neutral: 75 },
    demandStability: { good: 50, neutral: 30 },
    promoFrequency: { good: 2, neutral: 7 }
  },
  tones: {
    good: {
      text: 'text-emerald-200',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-400/30'
    },
    mid: {
      text: 'text-amber-200',
      bg: 'bg-amber-500/10',
      border: 'border-amber-400/30'
    },
    neutral: {
      text: 'text-slate-200',
      bg: 'bg-slate-800/50',
      border: 'border-slate-600/50'
    },
    bad: {
      text: 'text-rose-200',
      bg: 'bg-rose-500/10',
      border: 'border-rose-400/30'
    },
    missing: {
      text: 'text-slate-400',
      bg: 'bg-slate-900/40',
      border: 'border-slate-700/60'
    }
  }
};

const BASE_PILL_CLASSES = 'inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold';

const PRICE_HEAT_CONFIG = {
  rgb: [100, 116, 139],
  alphaMin: 0.05,
  alphaMax: 0.18
};

const BSR_HEAT_CONFIG = {
  goodRgb: [16, 185, 129],
  badRgb: [244, 63, 94],
  alphaMin: 0.06,
  alphaMax: 0.2
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const toNullableNumber = (value?: number | null) => (isFiniteNumber(value) ? value : null);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatPercentValue = (value: number) => `${Math.round(value)}%`;

const formatCurrencyCompactValue = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const formatNumberCompactValue = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
};

const formatBsrValue = (value: number) => `#${formatNumberCompactValue(value)}`;

const normalizeMonths = (months?: number[] | null) => {
  if (!Array.isArray(months)) return [];
  const unique = Array.from(new Set(months)).filter(month => month >= 1 && month <= 12);
  return unique.sort((a, b) => a - b);
};

const formatPeakMonths = (months?: number[] | null) => {
  const normalized = normalizeMonths(months);
  return normalized.length ? normalized.map(month => MONTH_LABELS[month - 1]).join(', ') : null;
};

const normalizeTrendLabel = (label?: string | null): TrendSummary | null => {
  const normalized = (label ?? '').toString().trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'improving') return 'Improving';
  if (normalized === 'flat' || normalized === 'stable') return 'Stable';
  if (normalized === 'declining') return 'Declining';
  return null;
};

const getTrendRank = (label?: string | null) => {
  const normalized = normalizeTrendLabel(label);
  if (!normalized) return null;
  if (normalized === 'Improving') return 3;
  if (normalized === 'Stable') return 2;
  if (normalized === 'Declining') return 1;
  return null;
};

const getToneClasses = (tone: MetricTone) => {
  const toneConfig = METRIC_COLOR_CONFIG.tones[tone];
  return `${toneConfig.text} ${toneConfig.bg} ${toneConfig.border} ${tone === 'missing' ? 'opacity-70' : ''}`;
};

const getToneForHigherIsBetter = (
  value: number | null,
  thresholds: { good: number; neutral: number }
): MetricTone => {
  if (!isFiniteNumber(value)) return 'missing';
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.neutral) return 'mid';
  return 'bad';
};

const getToneForLowerIsBetter = (
  value: number | null,
  thresholds: { good: number; neutral: number }
): MetricTone => {
  if (!isFiniteNumber(value)) return 'missing';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.neutral) return 'mid';
  return 'bad';
};

const getNormalizedValue = (value: number | null, min: number | null, max: number | null, fallback = 0.5) => {
  if (!isFiniteNumber(value) || !isFiniteNumber(min) || !isFiniteNumber(max) || min === max) return fallback;
  return clamp((value - min) / (max - min), 0, 1);
};

const toRgba = (rgb: number[], alpha: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
const interpolateRgb = (start: number[], end: number[], t: number) =>
  start.map((channel, index) => Math.round(channel + (end[index] - channel) * t));

const getPriceHeatStyle = (value: number | null, range: { min: number | null; max: number | null }) => {
  if (!isFiniteNumber(value)) return undefined;
  const normalized = getNormalizedValue(value, range.min, range.max);
  const alpha = PRICE_HEAT_CONFIG.alphaMin + normalized * (PRICE_HEAT_CONFIG.alphaMax - PRICE_HEAT_CONFIG.alphaMin);
  return { backgroundColor: toRgba(PRICE_HEAT_CONFIG.rgb, alpha) };
};

const getBsrHeat = (value: number | null, range: { min: number | null; max: number | null }) => {
  if (!isFiniteNumber(value)) return { style: undefined, tone: 'missing' as MetricTone };
  const normalized = getNormalizedValue(value, range.min, range.max);
  const alpha = BSR_HEAT_CONFIG.alphaMin + normalized * (BSR_HEAT_CONFIG.alphaMax - BSR_HEAT_CONFIG.alphaMin);
  const color = interpolateRgb(BSR_HEAT_CONFIG.goodRgb, BSR_HEAT_CONFIG.badRgb, normalized);
  const tone = normalized <= 0.33 ? 'good' : normalized >= 0.66 ? 'bad' : 'neutral';
  return { style: { backgroundColor: toRgba(color, alpha) }, tone };
};

const compareNullableNumbers = (a: number | null, b: number | null, direction: SortDirection) => {
  if (!isFiniteNumber(a) && !isFiniteNumber(b)) return 0;
  if (!isFiniteNumber(a)) return 1;
  if (!isFiniteNumber(b)) return -1;
  const diff = a - b;
  return direction === 'asc' ? diff : -diff;
};

const compareNullableStrings = (a: string | null, b: string | null, direction: SortDirection) => {
  const aValue = a?.toString().trim() ?? '';
  const bValue = b?.toString().trim() ?? '';
  const aMissing = !aValue;
  const bMissing = !bValue;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const diff = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? diff : -diff;
};

const getPeakSortKey = (months?: number[] | null) => {
  const normalized = normalizeMonths(months);
  if (!normalized.length) return null;
  return { count: normalized.length, earliest: normalized[0] };
};

const comparePeakMonths = (aMonths: number[] | null | undefined, bMonths: number[] | null | undefined, direction: SortDirection) => {
  const aKey = getPeakSortKey(aMonths);
  const bKey = getPeakSortKey(bMonths);
  if (!aKey && !bKey) return 0;
  if (!aKey) return 1;
  if (!bKey) return -1;
  if (aKey.count !== bKey.count) {
    return direction === 'asc' ? aKey.count - bKey.count : bKey.count - aKey.count;
  }
  return aKey.earliest - bKey.earliest;
};

interface ColumnHeaderProps {
  label: string;
  tooltip: React.ReactNode;
  sortKey: SortKey;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
}

const SortIndicator: React.FC<{ direction: SortDirection | null; isActive: boolean }> = ({
  direction,
  isActive
}) => {
  if (!isActive) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500/40" />;
  return direction === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5 text-slate-200" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-slate-200" />
  );
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, tooltip, sortKey, sortConfig, onSort }) => {
  const isActive = sortConfig?.key === sortKey;
  const direction = isActive ? sortConfig?.direction ?? null : null;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex w-full items-center justify-between gap-2 text-left"
    >
      <span className="flex items-center gap-1">
        <span>{label}</span>
        <span
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
        >
          <Tooltip content={tooltip as string}>
            <span className="text-slate-500">ⓘ</span>
          </Tooltip>
        </span>
      </span>
      <SortIndicator direction={direction} isActive={isActive} />
    </button>
  );
};

const KeepaCompareTab: React.FC<KeepaCompareTabProps> = ({ analysis }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const rowsWithIndex = useMemo(
    () => analysis.computed.competitors.map((row, index) => ({ ...row, _index: index })),
    [analysis]
  );

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rowsWithIndex;
    const { key, direction } = sortConfig;
    return [...rowsWithIndex].sort((a, b) => {
      let diff = 0;
      switch (key) {
        case 'brand': {
          const aValue = (a.brand || a.title || a.asin || '').toString().trim() || null;
          const bValue = (b.brand || b.title || b.asin || '').toString().trim() || null;
          diff = compareNullableStrings(aValue, bValue, direction);
          break;
        }
        case 'priceStability':
          diff = compareNullableNumbers(toNullableNumber(a.priceStabilityPct), toNullableNumber(b.priceStabilityPct), direction);
          break;
        case 'rankStability':
          diff = compareNullableNumbers(toNullableNumber(a.rankStabilityPct), toNullableNumber(b.rankStabilityPct), direction);
          break;
        case 'promo':
          diff = compareNullableNumbers(toNullableNumber(a.promoFrequencyPct), toNullableNumber(b.promoFrequencyPct), direction);
          break;
        case 'avgPrice':
          diff = compareNullableNumbers(toNullableNumber(a.avgHistoricalPrice), toNullableNumber(b.avgHistoricalPrice), direction);
          break;
        case 'avgBsr':
          diff = compareNullableNumbers(toNullableNumber(a.avgHistoricalBsr), toNullableNumber(b.avgHistoricalBsr), direction);
          break;
        case 'peakMonths':
          diff = comparePeakMonths(a.peakMonths, b.peakMonths, direction);
          break;
        case 'trend':
          diff = compareNullableNumbers(getTrendRank(a.trend), getTrendRank(b.trend), direction);
          break;
        default:
          diff = 0;
      }
      if (diff !== 0) return diff;
      return a._index - b._index;
    });
  }, [rowsWithIndex, sortConfig]);

  const summary = useMemo(() => {
    const priceStabilityValues: number[] = [];
    const demandStabilityValues: number[] = [];
    const promoFrequencyValues: number[] = [];
    const avgPriceValues: number[] = [];
    const avgBsrValues: number[] = [];
    const monthCounts = new Map<number, number>();
    const trendCounts: Record<TrendSummary, number> = {
      Improving: 0,
      Stable: 0,
      Declining: 0
    };

    sortedRows.forEach(row => {
      const priceStability = toNullableNumber(row.priceStabilityPct);
      const demandStability = toNullableNumber(row.rankStabilityPct);
      const promoFrequency = toNullableNumber(row.promoFrequencyPct);
      const avgPrice = toNullableNumber(row.avgHistoricalPrice);
      const avgBsr = toNullableNumber(row.avgHistoricalBsr);

      if (isFiniteNumber(priceStability)) priceStabilityValues.push(priceStability);
      if (isFiniteNumber(demandStability)) demandStabilityValues.push(demandStability);
      if (isFiniteNumber(promoFrequency)) promoFrequencyValues.push(promoFrequency);
      if (isFiniteNumber(avgPrice)) avgPriceValues.push(avgPrice);
      if (isFiniteNumber(avgBsr)) avgBsrValues.push(avgBsr);

      const months = normalizeMonths(row.peakMonths);
      months.forEach(month => {
        monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
      });

      const trend = normalizeTrendLabel(row.trend);
      if (trend) trendCounts[trend] += 1;
    });

    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

    const avgPriceRange = {
      min: avgPriceValues.length ? Math.min(...avgPriceValues) : null,
      max: avgPriceValues.length ? Math.max(...avgPriceValues) : null
    };

    const avgBsrRange = {
      min: avgBsrValues.length ? Math.min(...avgBsrValues) : null,
      max: avgBsrValues.length ? Math.max(...avgBsrValues) : null
    };

    const peakMonths = Array.from(monthCounts.entries())
      .sort((a, b) => {
        const diff = b[1] - a[1];
        return diff !== 0 ? diff : a[0] - b[0];
      })
      .slice(0, 3)
      .map(([month]) => MONTH_LABELS[month - 1]);

    const peakMonthsSummary = peakMonths.length ? `Most common: ${peakMonths.join(', ')}` : '—';

    const trendEntries = Object.entries(trendCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    const majorityTrend =
      trendEntries.length && (trendEntries.length === 1 || trendEntries[0][1] > trendEntries[1][1])
        ? (trendEntries[0][0] as TrendSummary)
        : null;

    return {
      averages: {
        priceStability: average(priceStabilityValues),
        demandStability: average(demandStabilityValues),
        promoFrequency: average(promoFrequencyValues),
        avgPrice: average(avgPriceValues),
        avgBsr: average(avgBsrValues)
      },
      ranges: {
        price: avgPriceRange,
        bsr: avgBsrRange
      },
      peakMonthsSummary,
      majorityTrend
    };
  }, [sortedRows]);

  const toggleSort = (key: SortKey) => {
    setSortConfig(current => {
      if (!current || current.key !== key) return { key, direction: 'desc' };
      if (current.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  const renderMissingPill = () => (
    <Tooltip content={MISSING_TOOLTIP}>
      <span className={`${BASE_PILL_CLASSES} ${getToneClasses('missing')}`}>{NA_LABEL}</span>
    </Tooltip>
  );

  const renderMetricPill = ({
    value,
    formatValue,
    tone,
    style
  }: {
    value: number | null;
    formatValue: (value: number) => string;
    tone: MetricTone;
    style?: React.CSSProperties;
  }) => {
    if (!isFiniteNumber(value)) return renderMissingPill();
    return (
      <span className={`${BASE_PILL_CLASSES} ${getToneClasses(tone)}`} style={style}>
        {formatValue(value)}
      </span>
    );
  };

  const renderPeakMonthsCell = (months?: number[] | null) => {
    const formatted = formatPeakMonths(months);
    return formatted ? <span className="text-slate-200">{formatted}</span> : renderMissingPill();
  };

  const columnTooltips: Record<SortKey, React.ReactNode> = {
    brand: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Competitor brand + listing (ASIN).</li>
        <li>Used to compare market behavior among top competitors.</li>
        <li>NA if listing metadata is missing.</li>
      </ul>
    ),
    priceStability: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Measures how consistent the competitor's price has been over the selected window.</li>
        <li>Higher = fewer price swings (generally better).</li>
        <li>NA if not enough price history or missing segments of data.</li>
      </ul>
    ),
    rankStability: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Estimates how consistent demand has been over time using BSR behavior.</li>
        <li>Higher = more consistent demand; lower = more volatile or spiky.</li>
        <li>NA if not enough BSR history, too many missing points, or listing too new.</li>
      </ul>
    ),
    promo: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Share of time the competitor ran promotions/discounts.</li>
        <li>Lower = fewer promotions (generally better).</li>
        <li>0% means enough data and detected zero promos.</li>
        <li>NA means insufficient promo signal/history.</li>
      </ul>
    ),
    avgPrice: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Average price over the selected historical window.</li>
        <li>Used for comparison; not inherently good or bad.</li>
        <li>NA if insufficient price history.</li>
      </ul>
    ),
    avgBsr: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Average Best Seller Rank over the selected window.</li>
        <li>Lower BSR = better sales performance.</li>
        <li>NA if no reliable BSR history.</li>
      </ul>
    ),
    peakMonths: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Months where demand historically peaks based on observed BSR behavior.</li>
        <li>NA if not enough history to identify peaks.</li>
      </ul>
    ),
    trend: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Overall directional trend based on price and demand time series.</li>
        <li>Improving = stronger trend; Stable = flat; Declining = weakening.</li>
        <li>NA if trend cannot be determined from history.</li>
      </ul>
    )
  };

  const summaryPriceHeatStyle = getPriceHeatStyle(summary.averages.avgPrice, summary.ranges.price);
  const summaryBsrHeat = getBsrHeat(summary.averages.avgBsr, summary.ranges.bsr);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-700/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'brand' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Brand / ASIN" tooltip={columnTooltips.brand} sortKey="brand" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'priceStability' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Price Stability %" tooltip={columnTooltips.priceStability} sortKey="priceStability" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'rankStability' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Demand Stability %" tooltip={columnTooltips.rankStability} sortKey="rankStability" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'promo' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Promo Freq %" tooltip={columnTooltips.promo} sortKey="promo" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'avgPrice' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Avg Historical Price" tooltip={columnTooltips.avgPrice} sortKey="avgPrice" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'avgBsr' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Avg Historical BSR" tooltip={columnTooltips.avgBsr} sortKey="avgBsr" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'peakMonths' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Peak Months" tooltip={columnTooltips.peakMonths} sortKey="peakMonths" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
            <th className="px-4 py-3 text-left" aria-sort={sortConfig?.key === 'trend' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <ColumnHeader label="Trend" tooltip={columnTooltips.trend} sortKey="trend" sortConfig={sortConfig} onSort={toggleSort} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {sortedRows.map(row => {
            const priceStability = toNullableNumber(row.priceStabilityPct);
            const demandStability = toNullableNumber(row.rankStabilityPct);
            const promoFrequency = toNullableNumber(row.promoFrequencyPct);
            const avgPrice = toNullableNumber(row.avgHistoricalPrice);
            const avgBsr = toNullableNumber(row.avgHistoricalBsr);
            const priceTone = getToneForHigherIsBetter(priceStability, METRIC_COLOR_CONFIG.thresholds.priceStability);
            const demandTone = getToneForHigherIsBetter(demandStability, METRIC_COLOR_CONFIG.thresholds.demandStability);
            const promoTone = getToneForLowerIsBetter(promoFrequency, METRIC_COLOR_CONFIG.thresholds.promoFrequency);
            const priceHeatStyle = getPriceHeatStyle(avgPrice, summary.ranges.price);
            const bsrHeat = getBsrHeat(avgBsr, summary.ranges.bsr);
            const trendLabel = normalizeTrendLabel(row.trend);

            return (
              <tr key={row.asin} className="text-slate-200">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{row.brand || row.title || row.asin || NA_LABEL}</div>
                  <div className="text-xs text-slate-500 truncate max-w-[240px]">{row.title || row.asin || NA_LABEL}</div>
                </td>
                <td className="px-4 py-3">
                  {renderMetricPill({ value: priceStability, formatValue: formatPercentValue, tone: priceTone })}
                </td>
                <td className="px-4 py-3">
                  {renderMetricPill({ value: demandStability, formatValue: formatPercentValue, tone: demandTone })}
                </td>
                <td className="px-4 py-3">
                  {renderMetricPill({ value: promoFrequency, formatValue: formatPercentValue, tone: promoTone })}
                </td>
                <td className="px-4 py-3">
                  {renderMetricPill({
                    value: avgPrice,
                    formatValue: formatCurrencyCompactValue,
                    tone: 'neutral',
                    style: priceHeatStyle
                  })}
                </td>
                <td className="px-4 py-3">
                  {renderMetricPill({
                    value: avgBsr,
                    formatValue: formatBsrValue,
                    tone: bsrHeat.tone as MetricTone,
                    style: bsrHeat.style
                  })}
                </td>
                <td className="px-4 py-3">{renderPeakMonthsCell(row.peakMonths)}</td>
                <td className="px-4 py-3">
                  {trendLabel ? <SignalBadge label={row.trend} category="trend" compact /> : renderMissingPill()}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-900/80">
          <tr className="sticky bottom-0 z-10 border-t-2 border-slate-600/70 text-slate-100 backdrop-blur">
            <td className="px-4 py-3 text-sm font-bold text-white">Averages (Shown)</td>
            <td className="px-4 py-3">
              {renderMetricPill({
                value: summary.averages.priceStability,
                formatValue: formatPercentValue,
                tone: getToneForHigherIsBetter(summary.averages.priceStability, METRIC_COLOR_CONFIG.thresholds.priceStability)
              })}
            </td>
            <td className="px-4 py-3">
              {renderMetricPill({
                value: summary.averages.demandStability,
                formatValue: formatPercentValue,
                tone: getToneForHigherIsBetter(summary.averages.demandStability, METRIC_COLOR_CONFIG.thresholds.demandStability)
              })}
            </td>
            <td className="px-4 py-3">
              {renderMetricPill({
                value: summary.averages.promoFrequency,
                formatValue: formatPercentValue,
                tone: getToneForLowerIsBetter(summary.averages.promoFrequency, METRIC_COLOR_CONFIG.thresholds.promoFrequency)
              })}
            </td>
            <td className="px-4 py-3">
              {renderMetricPill({
                value: summary.averages.avgPrice,
                formatValue: formatCurrencyCompactValue,
                tone: 'neutral',
                style: summaryPriceHeatStyle
              })}
            </td>
            <td className="px-4 py-3">
              {renderMetricPill({
                value: summary.averages.avgBsr,
                formatValue: formatBsrValue,
                tone: summaryBsrHeat.tone as MetricTone,
                style: summaryBsrHeat.style
              })}
            </td>
            <td className="px-4 py-3 text-slate-300">{summary.peakMonthsSummary}</td>
            <td className="px-4 py-3">
              {summary.majorityTrend ? (
                <SignalBadge label={summary.majorityTrend} category="trend" compact />
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default KeepaCompareTab;
