/**
 * Phase 2.3 — POST /api/vetting/generate-summary
 *
 * Body: { submissionId: string, force?: boolean }
 *
 * Flow:
 *   1. Authenticate, verify the caller owns the submission.
 *   2. If ai_summary already exists and !force → return cached.
 *   3. Derive a compact metrics object from submission_data.
 *   4. Call generateVettingSummary (Sonnet 4.6 via runAnthropic).
 *   5. Persist to submissions.ai_summary. Return the summary.
 *
 * Public viewers DO NOT hit this route. The public share page reads
 * ai_summary from /api/analyze/[id] and falls through to the legacy
 * mad-libs string if it's null. Generation is owner-triggered only —
 * keeps token spend bounded and removes the unauth'd-spend attack
 * surface.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { getVettingInsights } from '@/lib/vetting/insights';
import { calculateScore, getCompetitorStrength } from '@/utils/scoring';
import {
  generateVettingSummary,
  type VettingSummaryMetrics,
} from '@/services/vettingSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const submissionId: string | undefined = body?.submissionId;
    const force: boolean = Boolean(body?.force);

    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'submissionId is required' },
        { status: 400 }
      );
    }

    // --- Auth: build a Supabase client scoped to the caller's JWT ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supa = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supa.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // --- Load the submission. RLS will reject non-owners. ---
    const { data: submission, error: fetchError } = await supa
      .from('submissions')
      .select('id, user_id, score, status, submission_data, ai_summary')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    if (submission.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Serve cached unless force=true.
    if (!force && submission.ai_summary) {
      return NextResponse.json({ success: true, summary: submission.ai_summary, cached: true });
    }

    // --- Derive metrics from submission_data ---
    const metrics = deriveMetrics(submission);

    // --- Call Anthropic ---
    const summary = await generateVettingSummary({
      metrics,
      userId: user.id,
      submissionId,
    });

    // --- Persist ---
    const { error: updateError } = await supa
      .from('submissions')
      .update({ ai_summary: summary })
      .eq('id', submissionId)
      .eq('user_id', user.id);

    if (updateError) {
      // Generation succeeded but persistence failed — return the summary
      // anyway so the UI doesn't degrade; log the persistence miss so we
      // can chase it in usage_events / logs.
      console.error('[vetting/generate-summary] update failed:', updateError);
    }

    return NextResponse.json({ success: true, summary, cached: false });
  } catch (err) {
    console.error('[vetting/generate-summary] failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to generate summary',
      },
      { status: 500 }
    );
  }
}

// ============================================================
// Metric derivation — pulls a compact analytic payload out of
// the stored submission_data blob for the model to ground on.
// ============================================================

function deriveMetrics(submission: any): VettingSummaryMetrics {
  const data = submission?.submission_data ?? {};
  const competitors: any[] = data?.productData?.competitors ?? [];
  const keepaResults: any[] = data?.keepaResults ?? [];
  const distributions = data?.productData?.distributions ?? {};

  // --- Totals ---
  const marketCap = competitors.reduce(
    (sum, c) => sum + safeNum(c?.monthlyRevenue),
    0
  );
  const competitorCount = competitors.length;
  const revenuePerCompetitor = competitorCount ? marketCap / competitorCount : 0;

  const totalReviews = competitors.reduce((s, c) => s + safeNum(c?.reviews), 0);

  // --- Top-5 by monthly sales ---
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

  const top5MarketSharePct = top5.reduce(
    (s, c) => s + safeNum(c?.marketShare),
    0
  );
  const top5ReviewSharePct = totalReviews > 0
    ? (top5.reduce((s, c) => s + safeNum(c?.reviews), 0) / totalReviews) * 100
    : undefined;

  // --- Keepa stability ---
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

  // --- Competitor strength mix ---
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

  // --- Fulfillment + age cohort %s (already as 0-100 in the stored distributions) ---
  const fulfillment = distributions?.fulfillment ?? {};
  const age = distributions?.age ?? {};

  // --- Price range via getVettingInsights() ---
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
    // Insights derivation is best-effort — model can still summarize on
    // the primary metrics without the flag titles.
    console.warn('[vetting/generate-summary] getVettingInsights threw:', e);
  }

  // --- Score + status ---
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

// ============================================================

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
