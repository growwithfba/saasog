/**
 * Shared metric derivation for the vetting AI summary. Consumed by:
 *   - POST /api/vetting/generate-summary (owner-triggered fresh-vetting flow)
 *   - POST /api/submissions/[id]/lens-recalc (Phase 5.4-O recalc after Lens expansion)
 *
 * Both flows feed the same VettingSummaryMetrics shape into
 * generateVettingSummary (Sonnet 4.6) so the briefing remains coherent
 * across initial vetting and post-expansion recalcs.
 */
import { getVettingInsights } from '@/lib/vetting/insights';
import { calculateScore, getCompetitorStrength } from '@/utils/scoring';
import { type VettingSummaryMetrics } from '@/services/vettingSummary';

export function deriveSummaryMetrics(submission: any): VettingSummaryMetrics {
  const data = submission?.submission_data ?? {};
  const competitors: any[] = data?.productData?.competitors ?? [];
  const keepaResults: any[] = data?.keepaResults ?? [];
  const distributions = data?.productData?.distributions ?? {};

  const marketCap = competitors.reduce((sum, c) => sum + safeNum(c?.monthlyRevenue), 0);
  const competitorCount = competitors.length;
  const revenuePerCompetitor = competitorCount ? marketCap / competitorCount : 0;

  const totalReviews = competitors.reduce((s, c) => s + safeNum(c?.reviews), 0);

  const top5 = [...competitors]
    .sort((a, b) => safeNum(b?.monthlySales) - safeNum(a?.monthlySales))
    .slice(0, 5);

  const avgTop5Reviews = top5.length
    ? top5.reduce((s, c) => s + safeNum(c?.reviews), 0) / top5.length
    : undefined;
  const validRatings = top5.filter((c) => safeNum(c?.rating) > 0);
  const avgTop5Rating = validRatings.length
    ? validRatings.reduce((s, c) => s + safeNum(c?.rating), 0) / validRatings.length
    : undefined;
  const withAge = top5.filter((c) => c?.dateFirstAvailable);
  const avgTop5AgeMonths = withAge.length
    ? withAge.reduce((s, c) => s + ageMonths(c.dateFirstAvailable), 0) / withAge.length
    : undefined;

  const top5MarketSharePct = top5.reduce((s, c) => s + safeNum(c?.marketShare), 0);
  const top5ReviewSharePct =
    totalReviews > 0
      ? (top5.reduce((s, c) => s + safeNum(c?.reviews), 0) / totalReviews) * 100
      : undefined;

  const bsrStabilities = keepaResults
    .map((r) => r?.analysis?.bsr?.stability)
    .filter((v): v is number => typeof v === 'number');
  const priceStabilities = keepaResults
    .map((r) => r?.analysis?.price?.stability)
    .filter((v): v is number => typeof v === 'number');
  const avgBsrStability = bsrStabilities.length
    ? bsrStabilities.reduce((s, v) => s + v, 0) / bsrStabilities.length
    : undefined;
  const avgPriceStability = priceStabilities.length
    ? priceStabilities.reduce((s, v) => s + v, 0) / priceStabilities.length
    : undefined;

  const strengthLabels = competitors
    .map((c) => {
      const score = parseFloat(String(calculateScore(c)));
      if (!Number.isFinite(score)) return null;
      return getCompetitorStrength(score).label;
    })
    .filter(Boolean) as Array<'STRONG' | 'DECENT' | 'WEAK'>;
  const competitorStrengthMix = {
    strong: strengthLabels.filter((l) => l === 'STRONG').length,
    decent: strengthLabels.filter((l) => l === 'DECENT').length,
    weak: strengthLabels.filter((l) => l === 'WEAK').length,
  };

  const fulfillment = distributions?.fulfillment ?? {};
  const age = distributions?.age ?? {};

  let priceRange: VettingSummaryMetrics['priceRange'];
  let concentration: VettingSummaryMetrics['concentration'];
  let redFlags: string[] | undefined;
  let greenFlags: string[] | undefined;
  try {
    const { insights } = getVettingInsights({ competitors });
    const p = insights.distributions?.price;
    if (p) {
      priceRange = { min: p.min, max: p.max, median: p.median };
    }
    concentration = {
      top1Share: insights.concentration?.top1Share,
      top3Share: insights.concentration?.top3Share,
      top5Share: insights.concentration?.top5Share,
    };
    redFlags = insights.flags?.red?.map((f) => f.title).filter(Boolean);
    greenFlags = insights.flags?.green?.map((f) => f.title).filter(Boolean);
  } catch (e) {
    console.warn('[deriveSummaryMetrics] getVettingInsights threw:', e);
  }

  const marketScoreObj = data?.marketScore ?? {};
  const score = numberOr(marketScoreObj?.score, submission?.score, 0);
  const status = stringOr(marketScoreObj?.status, submission?.status, 'Assessment Unavailable');

  return {
    score,
    status,
    competitorCount,
    marketCapUsd: marketCap,
    revenuePerCompetitor,
    top5MarketSharePct,
    top5ReviewSharePct,
    concentration,
    avgTop5Reviews,
    avgTop5Rating,
    avgTop5AgeMonths,
    avgBsrStability,
    avgPriceStability,
    competitorStrengthMix,
    fulfillmentSplit: {
      fba: safeNum(fulfillment.fba),
      fbm: safeNum(fulfillment.fbm),
      amazon: safeNum(fulfillment.amazon),
    },
    ageCohorts: {
      new: safeNum(age.new),
      growing: safeNum(age.growing),
      established: safeNum(age.established),
      mature: safeNum(age.mature),
    },
    priceRange,
    redFlags,
    greenFlags,
  };
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numberOr(...candidates: unknown[]): number {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function stringOr(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return '';
}

function ageMonths(dateFirstAvailable: string | undefined): number {
  if (!dateFirstAvailable) return 0;
  const d = new Date(dateFirstAvailable);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30));
}
