import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { KeepaSignalsMarketSummary } from './KeepaTypes';

interface CompetitorRow {
  asin: string;
  title?: string;
  brand?: string;
  monthlyRevenue?: number;
  keepa?: any;
}

interface KeepaSummaryTabProps {
  competitors: CompetitorRow[];
  marketSignals: KeepaSignalsMarketSummary;
}

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

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isValidNumber = (value?: number | null): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

const getSeasonalityLabel = (score?: number | null) => {
  if (!isValidNumber(score)) return 'N/A';
  return score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';
};

const getVolatilityLabel = (volatility?: number | null) => {
  if (!isValidNumber(volatility)) return 'N/A';
  return volatility <= 8 ? 'Stable' : volatility <= 15 ? 'Moderate' : 'Volatile';
};

const getStabilityLabel = (stability?: number | null) => {
  if (!isValidNumber(stability)) return 'N/A';
  return stability >= 0.75 ? 'Stable' : stability >= 0.55 ? 'Moderate' : 'Unstable';
};

const getStockoutLabel = (oosPercent?: number | null) => {
  if (!isValidNumber(oosPercent)) return 'N/A';
  return oosPercent >= 15 ? 'High' : oosPercent >= 7 ? 'Medium' : 'Low';
};

const buildSparkline = (series: Array<{ timestamp: number; value: number | null }>, maxPoints = 30) => {
  if (!series?.length) return [];
  const filtered = series.filter(point => Number.isFinite(point.value));
  if (!filtered.length) return [];
  const step = Math.ceil(filtered.length / maxPoints);
  return filtered.filter((_, index) => index % step === 0) as Array<{ timestamp: number; value: number }>;
};

const MiniSparkline: React.FC<{ data: Array<{ timestamp: number; value: number }>; stroke: string }> = ({
  data,
  stroke
}) => (
  <div className="h-12 w-24">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Tooltip
          contentStyle={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            fontSize: 12,
            maxWidth: 180
          }}
          labelFormatter={() => ''}
          formatter={(value: number) => [formatNumberCompact(value), '']}
        />
        <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const KeepaSummaryTab: React.FC<KeepaSummaryTabProps> = ({ competitors, marketSignals }) => {
  const averagePriceVolatility = (() => {
    const values = competitors
      .map(comp => comp.keepa?.signals?.price?.volatilityPct)
      .filter(isValidNumber);
    return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
  })();

  const averageBsrStability = (() => {
    const values = competitors
      .map(comp => comp.keepa?.signals?.bsr?.stabilityScore)
      .filter(isValidNumber);
    return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
  })();

  const averageOosPercent = (() => {
    const values = competitors
      .map(comp => comp.keepa?.signals?.stock?.oosPercent)
      .filter(isValidNumber);
    return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400">Seasonality</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">
              {getSeasonalityLabel(marketSignals.seasonalityScore)}
            </span>
            <span className="text-xs text-slate-400">
              Score {isValidNumber(marketSignals.seasonalityScore) ? marketSignals.seasonalityScore : 'N/A'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Peak months:{' '}
            {marketSignals.peakMonths?.length
              ? marketSignals.peakMonths.map(month => MONTH_LABELS[month - 1]).join(', ')
              : 'N/A'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400">Price Volatility</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">
              {getVolatilityLabel(averagePriceVolatility)}
            </span>
            <span className="text-xs text-slate-400">{formatPercent(averagePriceVolatility)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Avg change: {formatPercent(averagePriceVolatility)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400">Rank Stability</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">
              {getStabilityLabel(averageBsrStability)}
            </span>
            <span className="text-xs text-slate-400">
              {isValidNumber(averageBsrStability) ? `${Math.round(averageBsrStability * 100)}%` : 'N/A'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Avg stability across top 5
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400">Stockout Risk</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">
              {getStockoutLabel(averageOosPercent)}
            </span>
            <span className="text-xs text-slate-400">{formatPercent(averageOosPercent)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Avg OOS time across top 5
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40">
        <div className="border-b border-slate-700/60 px-4 py-3 text-sm font-semibold text-white">
          Top Competitor Signals
        </div>
        <div className="divide-y divide-slate-800/70">
          {competitors.map((competitor, index) => {
            const keepa = competitor.keepa;
            const priceSignals = keepa?.signals?.price;
            const bsrSignals = keepa?.signals?.bsr;
            const stockSignals = keepa?.signals?.stock;
            const priceFallback =
              keepa?.productData?.prices
                ?.filter((point: any) => Number.isFinite(point.value))
                .map((point: any) => ({
                  ...point,
                  value: point.value / 100
                })) || [];
            const priceSeries = buildSparkline(
              keepa?.series?.buyBoxPrice ||
                keepa?.series?.newPrice ||
                keepa?.series?.amazonPrice ||
                priceFallback
            );
            const bsrSeries = buildSparkline(keepa?.series?.bsr || keepa?.productData?.bsr || []);
            const badges = [
              isValidNumber(priceSignals?.promoFrequencyPct) && priceSignals.promoFrequencyPct >= 15
                ? 'Frequent promos'
                : null,
              isValidNumber(stockSignals?.oosPercent) && stockSignals.oosPercent >= 12
                ? 'High stockout risk'
                : null,
              isValidNumber(keepa?.signals?.seasonality?.score) &&
              keepa.signals.seasonality.score >= 60
                ? 'Strong seasonality'
                : null,
              isValidNumber(bsrSignals?.stabilityScore) && bsrSignals.stabilityScore <= 0.5
                ? 'Unstable rank'
                : null,
              isValidNumber(priceSignals?.volatilityPct) && priceSignals.volatilityPct >= 15
                ? 'Volatile pricing'
                : null
            ].filter(Boolean) as string[];
            const primaryBadges = badges.slice(0, 2);
            const hasSeries = priceSeries.length >= 2 || bsrSeries.length >= 2;

            return (
              <div key={`${competitor.asin}-${index}`} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-[160px] flex-1">
                    <div className="text-sm font-semibold text-white">
                      {competitor.brand || keepa?.brand || competitor.title || 'Unknown Brand'}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{competitor.title}</div>
                  </div>
                  <div className="text-sm text-slate-300">
                    <div className="text-xs text-slate-400">Current Price</div>
                    <div className="font-semibold text-white">
                      {formatCurrencyCompact(priceSignals?.current)}
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    <div className="text-xs text-slate-400">Current BSR</div>
                    <div className="font-semibold text-white">
                      {(() => {
                        const formatted = formatNumberCompact(bsrSignals?.current);
                        return formatted === 'N/A' ? 'N/A' : `#${formatted}`;
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {primaryBadges.length ? (
                      primaryBadges.map(badge => (
                        <span
                          key={`${competitor.asin}-${badge}`}
                          className="rounded-full border border-slate-700/60 bg-slate-800/40 px-2 py-1 text-xs text-slate-200"
                        >
                          {badge}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        {hasSeries ? 'No strong signals' : 'Not enough history'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {priceSeries.length >= 2 ? (
                      <MiniSparkline data={priceSeries} stroke="#38bdf8" />
                    ) : (
                      <span className="text-xs text-slate-500">No price series</span>
                    )}
                    {bsrSeries.length >= 2 ? (
                      <MiniSparkline data={bsrSeries} stroke="#a78bfa" />
                    ) : (
                      <span className="text-xs text-slate-500">No BSR series</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KeepaSummaryTab;
