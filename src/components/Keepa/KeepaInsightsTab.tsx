import React from 'react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import SignalBadge from './SignalBadge';
import { Tooltip } from '../Offer/components/Tooltip';
import { formatCurrency } from '@/utils/formatters';

interface KeepaInsightsTabProps {
  analysis: KeepaAnalysisSnapshot;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
};

const formatCurrencyValue = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return formatCurrency(value);
};

const formatMonthList = (months?: number[] | null) => {
  if (!months?.length) return 'Not enough data';
  const unique = Array.from(new Set(months)).filter(month => month >= 1 && month <= 12);
  if (!unique.length) return 'Not enough data';
  const sorted = unique.sort((a, b) => a - b);
  return sorted.map(month => MONTH_LABELS[month - 1]).join(', ');
};

const getTopPromoMonths = (monthDistribution: Record<string, number>) => {
  const totals: Record<number, number> = {};
  Object.entries(monthDistribution).forEach(([monthKey, count]) => {
    const month = Number(monthKey.split('-')[1]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return;
    totals[month] = (totals[month] ?? 0) + count;
  });
  const sorted = Object.entries(totals)
    .sort((a, b) => {
      const diff = (b[1] ?? 0) - (a[1] ?? 0);
      return diff !== 0 ? diff : Number(a[0]) - Number(b[0]);
    })
    .slice(0, 2)
    .map(([month]) => MONTH_LABELS[Number(month) - 1]);
  return sorted;
};

type MetricType = 'seasonalityScore' | 'discountDepth' | 'demandVolatility' | 'oosTime';

const getMetricTone = (type: MetricType, value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'text-slate-400';
  switch (type) {
    case 'seasonalityScore':
      if (value >= 70) return 'text-rose-300';
      if (value >= 40) return 'text-amber-300';
      return 'text-emerald-300';
    case 'discountDepth':
      if (value >= 20) return 'text-rose-300';
      if (value >= 10) return 'text-amber-300';
      return 'text-emerald-300';
    case 'demandVolatility':
      if (value >= 60) return 'text-rose-300';
      if (value >= 30) return 'text-amber-300';
      return 'text-emerald-300';
    case 'oosTime':
      if (value > 10) return 'text-rose-300';
      if (value >= 2) return 'text-amber-300';
      return 'text-emerald-300';
    default:
      return 'text-slate-400';
  }
};

const KeepaInsightsTab: React.FC<KeepaInsightsTabProps> = ({ analysis }) => {
  const insights = analysis.computed.insights;
  const promos = analysis.computed.promos;
  const stockouts = analysis.computed.stockouts;
  const trends = analysis.computed.trends;
  const seasonalityTone =
    insights.seasonality === 'High'
      ? 'negative'
      : insights.seasonality === 'Medium'
      ? 'caution'
      : insights.seasonality === 'Low'
      ? 'positive'
      : 'neutral';
  const hasPeakMonths = Array.isArray(insights.peakMonths) && insights.peakMonths.length > 0;
  const peakMonthsText = formatMonthList(insights.peakMonths);
  const seasonalitySummary = hasPeakMonths
    ? insights.seasonality === 'High'
      ? 'Demand is strongest in these months and can drop significantly in the off-season.'
      : insights.seasonality === 'Medium'
      ? 'Demand peaks in these months, but remains active year-round.'
      : insights.seasonality === 'Low'
      ? 'Demand is fairly steady, with mild seasonal peaks.'
      : 'Not enough history to assess seasonality.'
    : 'Not enough history to identify clear peak months.';
  const typicalRangeText =
    Number.isFinite(trends.typicalPriceRange.min) && Number.isFinite(trends.typicalPriceRange.max)
      ? `${formatCurrencyValue(trends.typicalPriceRange.min)} - ${formatCurrencyValue(trends.typicalPriceRange.max)}`
      : 'N/A';
  const pricingSummary = Number.isFinite(insights.priceVolatilityPct)
    ? insights.pricingBehavior === 'Stable'
      ? `Prices usually move about ${formatPercent(
          insights.priceVolatilityPct
        )} month-to-month, and competitors tend to hold price consistently.`
      : insights.pricingBehavior === 'Moderate'
      ? `Prices usually move about ${formatPercent(insights.priceVolatilityPct)} month-to-month; expect periodic repricing.`
      : insights.pricingBehavior === 'Volatile'
      ? `Prices usually move about ${formatPercent(
          insights.priceVolatilityPct
        )} month-to-month; expect frequent repricing and margin swings.`
      : `Prices usually move about ${formatPercent(insights.priceVolatilityPct)} month-to-month.`
    : 'Not enough history to estimate typical price movement.';
  const promoMonths = getTopPromoMonths(promos.promoMonthDistribution);
  const discountSummary =
    promos.hasPromoData && Number.isFinite(promos.promoFrequencyPct)
      ? `Competitors run discounts on ~${formatPercent(promos.promoFrequencyPct)} of days${
          promoMonths.length ? `; most discounts happen in ${promoMonths.join(', ')}.` : '.'
        }`
      : 'Not enough discount history to identify frequency or timing patterns.';
  const demandSummary =
    insights.rankBehavior === 'Stable'
      ? 'Demand is relatively consistent, suggesting steadier sales.'
      : insights.rankBehavior === 'Unstable'
      ? 'Demand can spike and dip, so plan inventory carefully.'
      : 'Not enough history to assess demand volatility.';
  const stockoutSummary = (() => {
    if (stockouts.stockoutPressure === 'None detected') {
      return 'Supply looks consistent across competitors in this window.';
    }
    if (stockouts.stockoutPressure === 'Low') {
      return 'Minor supply gaps appear occasionally.';
    }
    if (stockouts.stockoutPressure === 'Medium') {
      return 'Supply gaps appear regularly; watch availability around peak months. If competitors go out of stock during peak demand, it can create opportunity.';
    }
    if (stockouts.stockoutPressure === 'High') {
      return 'Supply gaps are common; availability can swing during demand peaks. If competitors go out of stock during peak demand, it can create opportunity.';
    }
    return 'Not enough history to assess stockouts.';
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400 flex items-center gap-1">
            Seasonality
            <Tooltip content="Seasonality score (0-100) reflects how uneven demand is across the year. Higher scores mean more pronounced peaks and slower off-season months.">
              <span className="text-slate-500">ⓘ</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SignalBadge label={insights.seasonality} category="seasonality" toneOverride={seasonalityTone} />
            <span className={`text-xs ${getMetricTone('seasonalityScore', insights.seasonalityScore)}`}>
              Score {Number.isFinite(insights.seasonalityScore) ? insights.seasonalityScore : 'N/A'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Highest demand months:</span> {peakMonthsText}.{' '}
            {seasonalitySummary}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400 flex items-center gap-1">
            Pricing Behavior
            <Tooltip content="Typical price movement is the average month-to-month % change in median price over the selected timeframe.">
              <span className="text-slate-500">ⓘ</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SignalBadge label={insights.pricingBehavior} category="pricing" />
            <span className="text-xs text-slate-300">Typical range: {typicalRangeText}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Typical price movement.</span> {pricingSummary}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400 flex items-center gap-1">
            Discount Pressure
            <Tooltip content="We estimate the share of the timeframe when a competitor was running a coupon/deal (or inferred discount event). Typical discount reflects the average % drop during those periods.">
              <span className="text-slate-500">ⓘ</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SignalBadge label={insights.discountPressure} category="discount" />
            <span className={`text-xs ${getMetricTone('discountDepth', promos.avgPromoDropPct)}`}>
              Typical discount: {Number.isFinite(promos.avgPromoDropPct) ? `~${formatPercent(promos.avgPromoDropPct)} off` : 'N/A'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Discount activity.</span> {discountSummary}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400 flex items-center gap-1">
            Demand Stability
            <Tooltip content="Demand stability is estimated from historical BSR swings. More volatility suggests demand spikes rather than steady sales.">
              <span className="text-slate-500">ⓘ</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SignalBadge label={insights.rankBehavior} category="demand" />
            <span className={`text-xs ${getMetricTone('demandVolatility', insights.rankVolatilityPct)}`}>
              Volatility: {formatPercent(insights.rankVolatilityPct)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Demand volatility.</span> {demandSummary}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400 flex items-center gap-1">
            Stockout Pressure
            <Tooltip content="Meaningful = sustained out-of-stock periods above our threshold (e.g., >=2 consecutive days or >=1% of the timeframe). Short gaps can occur from reporting noise or brief inventory transitions.">
              <span className="text-slate-500">ⓘ</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SignalBadge label={stockouts.stockoutPressure} category="stockout" />
            <span className={`text-xs ${getMetricTone('oosTime', stockouts.oosTimePct)}`}>
              OOS time: {formatPercent(stockouts.oosTimePct)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Stockout signal.</span> {stockoutSummary}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="text-sm font-semibold text-white">Market Story</div>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{insights.marketStoryText}</p>
      </div>
    </div>
  );
};

export default KeepaInsightsTab;
