import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import generateReviewAnalysisJSON from '@/services/analyzeAnthropic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StoredReview {
  title?: string;
  body?: string;
  rating?: number | string;
}

const ALLOWED_SSP_CATEGORIES = new Set(['Quantity', 'Functionality', 'Quality', 'Aesthetic', 'Bundle']);

function clampSeverity(value: any): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return n as 1 | 2 | 3 | 4 | 5;
}

function sanitizeQuotes(quotes: any): string[] {
  if (!Array.isArray(quotes)) return [];
  return quotes
    .map(q => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Build ONLY the new structured fields from an Anthropic analysis. Legacy
 * string fields (topLikes, topDislikes, etc.) are intentionally NOT touched
 * so the SSP Builder — which still reads them — keeps working unchanged on
 * upgraded offers.
 */
function buildStructuredInsights(analysis: any, totalReviewCount: number) {
  const praiseClusters = Array.isArray(analysis?.praise_clusters) ? analysis.praise_clusters : [];
  const painClusters = Array.isArray(analysis?.pain_clusters) ? analysis.pain_clusters : [];
  const summaryStats = analysis?.summary_stats || {};
  const importantInsights = analysis?.important_insights || null;

  // --- sentiment percentages --------------------------------------------
  const pickPct = (rawPct: any, count: number | undefined): number | undefined => {
    const direct = Number(rawPct);
    if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
    if (typeof count === 'number' && totalReviewCount > 0) {
      return Math.round((count / totalReviewCount) * 100);
    }
    return undefined;
  };
  const positiveCount = Number.isFinite(Number(summaryStats.positive_review_count)) ? Number(summaryStats.positive_review_count) : undefined;
  const neutralCount = Number.isFinite(Number(summaryStats.neutral_review_count)) ? Number(summaryStats.neutral_review_count) : undefined;
  const negativeCount = Number.isFinite(Number(summaryStats.negative_review_count)) ? Number(summaryStats.negative_review_count) : undefined;
  let positivePercent = pickPct(summaryStats.positive_percentage, positiveCount);
  let neutralPercent = pickPct(summaryStats.neutral_percentage, neutralCount);
  let negativePercent = pickPct(summaryStats.negative_percentage, negativeCount);
  const anyPct = [positivePercent, neutralPercent, negativePercent].some(v => typeof v === 'number');
  if (anyPct) {
    positivePercent = positivePercent ?? 0;
    neutralPercent = neutralPercent ?? 0;
    negativePercent = negativePercent ?? 0;
    const sumPct = positivePercent + neutralPercent + negativePercent;
    if (sumPct > 0 && sumPct !== 100) {
      const drift = 100 - sumPct;
      const max = Math.max(positivePercent, neutralPercent, negativePercent);
      if (max === positivePercent) positivePercent += drift;
      else if (max === neutralPercent) neutralPercent += drift;
      else negativePercent += drift;
    }
  }

  // --- major complaints --------------------------------------------------
  const majorComplaints = painClusters
    .map((cluster: any) => {
      const complaintText = [cluster?.theme, cluster?.insight]
        .map((s: any) => (s ? s.toString().trim() : ''))
        .filter(Boolean)
        .join(' — ');
      const rawCategory = cluster?.ssp_category ? cluster.ssp_category.toString().trim() : '';
      const sspCategory = ALLOWED_SSP_CATEGORIES.has(rawCategory) ? rawCategory : 'Functionality';
      const opportunity = cluster?.opportunity
        ? cluster.opportunity.toString().trim()
        : (cluster?.seller_angle ? cluster.seller_angle.toString().trim() : '');
      const n = Number(cluster?.mention_percentage);
      const mentionPercent = Number.isFinite(n) ? Math.round(n) : 0;
      return {
        complaint: complaintText || (cluster?.insight ? cluster.insight.toString().trim() : ''),
        opportunity,
        sspCategory,
        severity: clampSeverity(cluster?.severity),
        mentionPercent,
        exampleQuotes: sanitizeQuotes(cluster?.example_quotes),
      };
    })
    .filter((c: any) => c.complaint)
    .sort((a: any, b: any) => b.severity - a.severity || b.mentionPercent - a.mentionPercent)
    .slice(0, 6);

  // --- what's working ----------------------------------------------------
  const whatIsWorking = praiseClusters
    .map((cluster: any) => {
      const theme = cluster?.theme ? cluster.theme.toString().trim() : '';
      const insight = cluster?.insight ? cluster.insight.toString().trim() : '';
      if (theme && insight) return `${theme} — ${insight}`;
      return theme || insight;
    })
    .filter(Boolean)
    .slice(0, 5);

  // --- top themes --------------------------------------------------------
  const toThemeChip = (cluster: any, sentiment: 'positive' | 'negative') => {
    const label = cluster?.theme ? cluster.theme.toString().trim() : '';
    const n = Number(cluster?.mention_percentage);
    const mentionPercent = Number.isFinite(n) ? Math.round(n) : 0;
    return label ? { label, mentionPercent, sentiment } : null;
  };
  const topThemes = [
    ...painClusters.map((c: any) => toThemeChip(c, 'negative')),
    ...praiseClusters.map((c: any) => toThemeChip(c, 'positive')),
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => (b as any).mentionPercent - (a as any).mentionPercent)
    .slice(0, 6);

  // --- market snapshot ---------------------------------------------------
  const verdictText =
    (analysis?.market_verdict?.toString().trim()) ||
    (importantInsights?.sentiment_summary?.toString().trim()) ||
    '';
  const negativeThemePercent = painClusters.length
    ? Math.min(100, Math.round(
        painClusters.reduce((sum: number, c: any) => {
          const n = Number(c?.mention_percentage);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0) / painClusters.length
      ))
    : undefined;
  const marketSnapshot = {
    verdict: verdictText,
    reviewCount: totalReviewCount || 0,
    negativeThemePercent,
    positivePercent,
    neutralPercent,
    negativePercent,
  };

  return {
    marketSnapshot,
    topThemes,
    majorComplaints,
    whatIsWorking,
    // Return derived counts too — used if the caller wants to overwrite
    // stale legacy counts on the insights row.
    totalReviewCount: totalReviewCount || 0,
    positiveReviewCount: positiveCount,
    neutralReviewCount: neutralCount,
    negativeReviewCount: negativeCount,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    const serverSupabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const productId: string | undefined = body?.productId;
    if (!productId) {
      return NextResponse.json({ success: false, error: 'Missing productId' }, { status: 400 });
    }

    // Fetch the stored reviews + existing insights for this offer.
    // .maybeSingle() — a missing row is the expected state for products
    // that haven't had any reviews uploaded yet, not an error worth
    // emailing about.
    const { data: offer, error: fetchError } = await serverSupabase
      .from('offer_products')
      .select('reviews, insights, user_id')
      .eq('product_id', productId)
      .maybeSingle();

    if (fetchError) {
      // Real DB error — log and 500. Missing row is handled below.
      console.error('[upgrade-insights] fetch error:', fetchError);
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
    }
    if (!offer) {
      // No offer row yet — return a 200 with a "nothing to upgrade"
      // signal. The client should hide the upgrade button in this state
      // anyway; this prevents the Vercel runtime-error email if it
      // slips through.
      return NextResponse.json(
        { success: false, reason: 'no_offer_yet' },
        { status: 200 }
      );
    }
    if (offer.user_id && offer.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const storedReviews: StoredReview[] = Array.isArray(offer.reviews) ? offer.reviews : [];
    if (storedReviews.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No stored reviews to upgrade from. Please use Add More Reviews to upload.'
        },
        { status: 409 }
      );
    }

    // Re-run analysis on the stored reviews using the new pipeline.
    const analysis = await generateReviewAnalysisJSON(
      storedReviews.map(r => ({
        title: r.title,
        body: r.body,
        rating: r.rating
      })),
      { userId: user.id }
    );

    const structured = buildStructuredInsights(analysis, storedReviews.length);
    const existingInsights = (offer.insights && typeof offer.insights === 'object') ? offer.insights : {};
    const mergedInsights = {
      ...existingInsights,
      marketSnapshot: structured.marketSnapshot,
      topThemes: structured.topThemes,
      majorComplaints: structured.majorComplaints,
      whatIsWorking: structured.whatIsWorking,
      totalReviewCount: structured.totalReviewCount,
      // Only overwrite counts when the fresh analysis produced them.
      ...(typeof structured.positiveReviewCount === 'number' ? { positiveReviewCount: structured.positiveReviewCount } : {}),
      ...(typeof structured.neutralReviewCount === 'number' ? { neutralReviewCount: structured.neutralReviewCount } : {}),
      ...(typeof structured.negativeReviewCount === 'number' ? { negativeReviewCount: structured.negativeReviewCount } : {}),
    };

    const { error: updateError } = await serverSupabase
      .from('offer_products')
      .update({ insights: mergedInsights, updated_at: new Date().toISOString() })
      .eq('product_id', productId);

    if (updateError) {
      console.error('[upgrade-insights] update error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to save upgraded insights' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { reviewInsights: mergedInsights } });
  } catch (e) {
    console.error('[upgrade-insights] failed:', e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : 'Upgrade failed',
        __debug: e instanceof Error ? { name: e.name, stack: e.stack } : { raw: String(e) },
      },
      { status: 500 }
    );
  }
}
