'use client';

import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';

interface AtAGlanceCardsProps {
  analysis: KeepaAnalysisSnapshot;
}

type ClimateVerdict =
  | 'Stable'
  | 'Climbing'
  | 'Declining'
  | 'Volatile'
  | 'Steady demand'
  | 'Seasonal swings'
  | 'Slowing'
  | 'Growing'
  | 'No strong pattern'
  | 'Unknown';

type CardTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';

type ClimateCard = {
  label: string;
  verdict: ClimateVerdict;
  explainer: string;
  sparkline: number[];
  tone: CardTone;
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const TONE_STYLES: Record<CardTone, { pill: string; line: string }> = {
  emerald: { pill: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40', line: '#34d399' },
  blue:    { pill: 'bg-sky-500/15 text-sky-200 border-sky-500/40',            line: '#38bdf8' },
  amber:   { pill: 'bg-amber-500/15 text-amber-200 border-amber-500/40',      line: '#f59e0b' },
  rose:    { pill: 'bg-rose-500/15 text-rose-200 border-rose-500/40',         line: '#fb7185' },
  slate:   { pill: 'bg-slate-700/40 text-slate-300 border-slate-600/60',      line: '#94a3b8' }
};

const formatPct = (value: number) => `${Math.abs(Math.round(value))}%`;

/**
 * Compute a linear trend direction over a numeric series by comparing the
 * mean of the first third vs the last third. Returns percentage change
 * (positive = later values are larger). Returns null for sparse series.
 */
const trendDirectionPct = (values: number[]): number | null => {
  const clean = values.filter(v => Number.isFinite(v));
  if (clean.length < 4) return null;
  const third = Math.max(1, Math.floor(clean.length / 3));
  const start = clean.slice(0, third);
  const end = clean.slice(clean.length - third);
  const startAvg = start.reduce((s, v) => s + v, 0) / start.length;
  const endAvg = end.reduce((s, v) => s + v, 0) / end.length;
  if (startAvg === 0) return null;
  return ((endAvg - startAvg) / Math.abs(startAvg)) * 100;
};

const pluralizeMonths = (months: number[]): string => {
  const names = months
    .filter(m => m >= 1 && m <= 12)
    .map(m => MONTH_LABELS[m - 1]);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

const buildPriceCard = (analysis: KeepaAnalysisSnapshot): ClimateCard => {
  const insights = analysis?.computed?.insights;
  const series = analysis?.computed?.trends?.marketSeries ?? [];
  const prices = series
    .map(p => p.price)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const trendPct = trendDirectionPct(prices);
  const behavior = insights?.pricingBehavior;

  let verdict: ClimateVerdict = 'Unknown';
  let tone: CardTone = 'slate';
  let explainer = 'Not enough price history to read the market climate yet.';

  if (behavior === 'Volatile') {
    verdict = 'Volatile';
    tone = 'rose';
    explainer = 'Prices swing often — tough to predict your selling price.';
  } else if (trendPct !== null && trendPct >= 5) {
    verdict = 'Climbing';
    tone = 'emerald';
    explainer = `Prices have drifted up about ${formatPct(trendPct)} — a market accepting higher price points.`;
  } else if (trendPct !== null && trendPct <= -5) {
    verdict = 'Declining';
    tone = 'amber';
    explainer = `Prices have drifted down about ${formatPct(trendPct)} — expect pressure on margins.`;
  } else if (behavior === 'Stable') {
    verdict = 'Stable';
    tone = 'blue';
    explainer = 'Prices have held within a tight range — predictable margins.';
  } else if (behavior === 'Moderate') {
    verdict = 'Stable';
    tone = 'blue';
    explainer = 'Prices move a bit but don’t swing wildly.';
  }

  return {
    label: 'Price Climate',
    verdict,
    explainer,
    sparkline: prices,
    tone
  };
};

const buildDemandCard = (analysis: KeepaAnalysisSnapshot): ClimateCard => {
  const insights = analysis?.computed?.insights;
  const series = analysis?.computed?.trends?.marketSeries ?? [];
  const bsrs = series
    .map(p => p.bsr)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  // Lower BSR = better rank = more demand. Flip the sign so "positive trend"
  // reads as "demand growing".
  const rawTrend = trendDirectionPct(bsrs);
  const demandTrend = rawTrend === null ? null : -rawTrend;
  const rank = insights?.rankBehavior;
  const seasonalityLevel = insights?.seasonality;

  let verdict: ClimateVerdict = 'Unknown';
  let tone: CardTone = 'slate';
  let explainer = 'Not enough rank history to read demand yet.';

  if (seasonalityLevel === 'High') {
    verdict = 'Seasonal swings';
    tone = 'amber';
    explainer = 'Demand moves a lot by season — plan inventory around peak months.';
  } else if (demandTrend !== null && demandTrend >= 10) {
    verdict = 'Growing';
    tone = 'emerald';
    explainer = `Rank has improved by about ${formatPct(demandTrend)} — the category is getting more traction.`;
  } else if (demandTrend !== null && demandTrend <= -10) {
    verdict = 'Slowing';
    tone = 'rose';
    explainer = `Rank has slipped by about ${formatPct(demandTrend)} — demand softening across the top.`;
  } else if (rank === 'Stable') {
    verdict = 'Steady demand';
    tone = 'blue';
    explainer = 'Rank has held steady — predictable, year-round demand.';
  } else if (rank === 'Unstable') {
    verdict = 'Seasonal swings';
    tone = 'amber';
    explainer = 'Rank bounces around — demand isn’t a flat line.';
  }

  // Sparkline: invert BSR so higher line = better demand visually.
  const maxBsr = Math.max(...bsrs, 1);
  const sparkline = bsrs.map(b => maxBsr - b);

  return {
    label: 'Demand Climate',
    verdict,
    explainer,
    sparkline,
    tone
  };
};

const buildSeasonalCard = (analysis: KeepaAnalysisSnapshot): ClimateCard => {
  const seasonality = analysis?.computed?.seasonality;
  const score = seasonality?.score ?? null;
  const peaks = seasonality?.peakMonths ?? [];

  let verdict: ClimateVerdict = 'No strong pattern';
  let tone: CardTone = 'slate';
  let explainer = 'Demand runs roughly year-round — no strong seasonal pattern.';
  const sparkline = (seasonality?.curve ?? [])
    .map(point => point.index)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (typeof score === 'number' && score >= 40 && peaks.length) {
    verdict = 'Seasonal swings';
    tone = 'amber';
    const peakLabel = pluralizeMonths(peaks);
    explainer = peakLabel
      ? `Peaks in ${peakLabel} — plan inventory to cover the surge.`
      : 'Clear peak months — plan inventory around them.';
  } else if (typeof score === 'number' && score >= 25 && peaks.length) {
    verdict = 'Seasonal swings';
    tone = 'blue';
    const peakLabel = pluralizeMonths(peaks);
    explainer = peakLabel
      ? `Mild lift in ${peakLabel} — worth noting but not make-or-break.`
      : 'Mild seasonal lift — notable but not dominant.';
  }

  return {
    label: 'Seasonal Peak',
    verdict,
    explainer,
    sparkline,
    tone
  };
};

const AtAGlanceCards: React.FC<AtAGlanceCardsProps> = ({ analysis }) => {
  const cards = useMemo(() => {
    if (!analysis?.computed) return [];
    return [
      buildPriceCard(analysis),
      buildDemandCard(analysis),
      buildSeasonalCard(analysis)
    ];
  }, [analysis]);

  if (!cards.length) return null;

  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
        At a Glance
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map(card => (
          <ClimateCardView key={card.label} card={card} />
        ))}
      </div>
    </div>
  );
};

const ClimateCardView: React.FC<{ card: ClimateCard }> = ({ card }) => {
  const toneStyles = TONE_STYLES[card.tone];
  const sparkData = useMemo(
    () => card.sparkline.map((value, index) => ({ index, value })),
    [card.sparkline]
  );

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {card.label}
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneStyles.pill}`}
        >
          {card.verdict}
        </span>
      </div>
      <div className="h-10 -mx-1">
        {sparkData.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={toneStyles.line}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            Not enough data
          </div>
        )}
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{card.explainer}</p>
    </div>
  );
};

export default AtAGlanceCards;
