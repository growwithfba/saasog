import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Label
} from 'recharts';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import SignalBadge from './SignalBadge';

interface KeepaStockPromoTabProps {
  analysis: KeepaAnalysisSnapshot;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROMO_DESCRIPTION =
  'Tracks how often top competitors run promotions and how deep discounts typically are. Frequent or deep promos can signal price pressure in this market.';
const PROMO_TOOLTIP_NOTE =
  'Promo events = price drops or coupon/discount periods detected across the top competitors.';
const PROMO_HELP_POINTS = [
  'What counts as a promo? Price drops, coupons, Lightning Deals, or other visible discount periods detected in historical pricing.',
  'Low promo activity usually means stable pricing and less price competition.',
  'Frequent or deep promos can signal a more aggressive market and tighter margins.'
];
const STOCKOUTS_DESCRIPTION = 'Tracks meaningful periods where competitors were frequently out of stock.';
const STOCKOUTS_TIP = 'Tip: Stockouts are more common in seasonal or supply-constrained markets.';

const PROMO_METRIC_THRESHOLDS = {
  promoFrequencyPct: { goodMax: 2, neutralMax: 7 },
  avgPromoDropPct: { goodMax: 10, neutralMax: 20 }
} as const;

const PROMO_TONE_STYLES = {
  good: { text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  neutral: { text: 'text-slate-200', bg: 'bg-slate-500/15' },
  bad: { text: 'text-rose-300', bg: 'bg-rose-500/10' },
  missing: { text: 'text-slate-400', bg: 'bg-slate-500/5' }
} as const;

type PromoMetricTone = keyof typeof PROMO_TONE_STYLES;

type PromoChartDatum = {
  name: string;
  value: number;
  monthIndex: number;
  monthKey: string;
  monthLabel: string;
};

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
};

const formatCount = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const formatPromoMonthLabel = (monthKey?: string | null) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
};

const getPromoMetricTone = (
  value: number | null | undefined,
  thresholds: { goodMax: number; neutralMax: number }
): PromoMetricTone => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'missing';
  if (value <= thresholds.goodMax) return 'good';
  if (value <= thresholds.neutralMax) return 'neutral';
  return 'bad';
};

const getPromoPressureLabel = (frequencyTone: PromoMetricTone, dropTone: PromoMetricTone) => {
  if (frequencyTone === 'missing' && dropTone === 'missing') return 'N/A';
  if (frequencyTone === 'missing') {
    return dropTone === 'bad' ? 'High' : dropTone === 'neutral' ? 'Medium' : 'Low';
  }
  if (dropTone === 'missing') {
    return frequencyTone === 'bad' ? 'High' : frequencyTone === 'neutral' ? 'Medium' : 'Low';
  }
  if (frequencyTone === 'bad' || dropTone === 'bad') return 'High';
  if (frequencyTone === 'neutral' && dropTone === 'neutral') return 'Medium';
  return 'Low';
};

const renderPromoYAxisLabel = ({
  viewBox
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
}) => {
  if (!viewBox) return null;
  const x = viewBox.x - 12;
  const y = viewBox.y + viewBox.height / 2;
  return (
    <text x={x} y={y} textAnchor="middle" fill="#94a3b8" transform={`rotate(-90, ${x}, ${y})`}>
      Promo events (count)
    </text>
  );
};

const renderPromoXAxisLabel = ({
  viewBox
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
}) => {
  if (!viewBox) return null;
  const x = viewBox.x + viewBox.width / 2;
  const y = viewBox.y + viewBox.height + 24;
  return (
    <text x={x} y={y} textAnchor="middle" fill="#94a3b8">
      Month
    </text>
  );
};

const LAST_12_MONTHS = 12;

const getLast12MonthKeys = (): string[] => {
  const keys: string[] = [];
  const now = new Date();
  for (let i = LAST_12_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return keys;
};

const KeepaStockPromoTab: React.FC<KeepaStockPromoTabProps> = ({ analysis }) => {
  const promoData = useMemo(() => {
    const distribution = analysis.computed.promos.promoMonthDistribution;
    const last12Keys = getLast12MonthKeys();
    return last12Keys.map((monthKey, index) => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthIndex = month - 1;
      const monthLabel = formatPromoMonthLabel(monthKey);
      const count = distribution[monthKey] ?? 0;
      return {
        name: MONTH_LABELS[monthIndex],
        value: count,
        monthIndex: index,
        monthKey,
        monthLabel
      };
    });
  }, [analysis]);

  const hasStockouts = analysis.computed.stockouts.hasMeaningfulStockouts;
  const stockoutPressure = analysis.computed.stockouts.stockoutPressure;
  const promoFrequencyPct = analysis.computed.promos.promoFrequencyPct;
  const avgPromoDropPct = analysis.computed.promos.avgPromoDropPct;
  const promoFrequencyTone = getPromoMetricTone(promoFrequencyPct, PROMO_METRIC_THRESHOLDS.promoFrequencyPct);
  const promoDropTone = getPromoMetricTone(avgPromoDropPct, PROMO_METRIC_THRESHOLDS.avgPromoDropPct);
  const promoPressureLabel = getPromoPressureLabel(promoFrequencyTone, promoDropTone);
  const promoFrequencyStyle = PROMO_TONE_STYLES[promoFrequencyTone];
  const promoDropStyle = PROMO_TONE_STYLES[promoDropTone];
  const promoInterpretation = analysis.computed.promos.hasPromoData
    ? analysis.computed.promos.interpretation
    : 'Insufficient data to interpret promo behavior.';
  const stockoutBadgeLabel =
    hasStockouts && stockoutPressure === 'High' ? 'Opportunity' : stockoutPressure ?? 'N/A';
  const stockoutBadgeTone = hasStockouts
    ? stockoutPressure === 'High'
      ? 'positive'
      : stockoutPressure === 'Medium'
        ? 'caution'
        : stockoutPressure === 'Low'
          ? 'neutral'
          : undefined
    : 'positive';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-3 space-y-1">
          <div className="text-sm font-semibold text-white">Promotions</div>
          <div className="text-xs text-slate-400">{PROMO_DESCRIPTION}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
            <div className="text-xs text-slate-400">Promo Frequency</div>
            <div className="mt-2 text-lg font-semibold text-white">
              <span
                className={`inline-flex rounded-md px-2 py-0.5 ${promoFrequencyStyle.bg} ${promoFrequencyStyle.text}`}
                title={promoFrequencyTone === 'missing' ? 'Insufficient data' : undefined}
              >
                {formatPercent(promoFrequencyPct)}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
            <div className="text-xs text-slate-400">Average Promo Drop</div>
            <div className="mt-2 text-lg font-semibold text-white">
              <span
                className={`inline-flex rounded-md px-2 py-0.5 ${promoDropStyle.bg} ${promoDropStyle.text}`}
                title={promoDropTone === 'missing' ? 'Insufficient data' : undefined}
              >
                {formatPercent(avgPromoDropPct)}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
            <div className="text-xs text-slate-400">Interpretation</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
              <SignalBadge label={promoPressureLabel} category="discount" />
              <span>{promoInterpretation}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3 text-xs text-slate-400">
            <div className="text-slate-200">What this means</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {PROMO_HELP_POINTS.map(point => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4">
          {promoData.length ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Monthly promo activity — last 12 months (top competitors)</div>
              <div className="min-h-[340px] h-[340px] md:h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={promoData} margin={{ top: 16, right: 12, left: 12, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                    <XAxis dataKey="name" stroke="#94a3b8" tickMargin={8}>
                      <Label content={renderPromoXAxisLabel} position="insideBottom" />
                    </XAxis>
                    <YAxis stroke="#94a3b8" tickMargin={8} tickFormatter={(value: number) => formatCount(value)}>
                      <Label content={renderPromoYAxisLabel} />
                    </YAxis>
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 23, 42, 0.35)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const entry = payload[0];
                        const datum = entry.payload as PromoChartDatum;
                        const count = Number.isFinite(entry.value as number) ? (entry.value as number) : null;
                        return (
                          <div className="max-w-[240px] rounded-lg border border-slate-700/60 bg-slate-900/90 px-3 py-2 text-xs text-slate-200">
                            <div className="text-slate-400">{datum.monthLabel || datum.name}</div>
                            <div className="mt-2 text-sm text-slate-100">
                              Promo events detected:{' '}
                              <span className="font-semibold text-emerald-200">{formatCount(count)}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400 leading-snug whitespace-normal">
                              {PROMO_TOOLTIP_NOTE}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              Not enough promo data to detect discounts reliably.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-3 space-y-1">
          <div className="text-sm font-semibold text-white">Stockouts</div>
          <div className="text-xs text-slate-400">{STOCKOUTS_DESCRIPTION}</div>
        </div>
        {hasStockouts ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Avg OOS Time</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {formatPercent(analysis.computed.stockouts.oosTimePct)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">OOS Event Count</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {analysis.computed.stockouts.oosEventCount ?? 'N/A'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Stockout Pressure</div>
              <div className="mt-2 text-lg font-semibold text-white">
                <SignalBadge label={stockoutBadgeLabel} category="stockout" toneOverride={stockoutBadgeTone} />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <SignalBadge label="None detected" category="stockout" toneOverride={stockoutBadgeTone} />
              <span>No significant competitor stockouts were detected during this period.</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">{STOCKOUTS_TIP}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KeepaStockPromoTab;
