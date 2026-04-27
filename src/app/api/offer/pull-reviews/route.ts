/**
 * Phase 2.5 — POST /api/offer/pull-reviews
 *
 * Body: { productId: string, deepPull?: boolean }
 *
 * Flow:
 *   1. Authenticate, scope all DB reads through the user's JWT.
 *   2. Look up the research product for `productId` (primary ASIN).
 *   3. Find the most recent vetting submission linked to this research
 *      product and extract its competitor list (by monthlyRevenue desc).
 *   4. Rate-limit: max 10 "pull events" per user per day
 *      (deepPull counts as 2). Counted against usage_events.
 *   5. Select top 7 ASINs (12 on deepPull). Always include the primary.
 *   6. Pull SerpAPI amazon_product data for each in parallel. Partial
 *      failures are tolerated — a bad competitor doesn't kill the pull.
 *   7. Aggregate into text blocks: Amazon summaries + insight tags +
 *      review bodies. Feed to the existing Phase 2.2 parallel
 *      Sonnet/Haiku pipeline.
 *   8. Transform into `reviewInsights` via the shared builder (matches
 *      the shape the manual-CSV path produces) and upsert into
 *      offer_products.
 *   9. Return the insights + reviews + provenance metadata.
 *
 * Not in this route yet (future phases):
 *   - Per-ASIN caching (skipped for V9; 10/day cap is the cost control)
 *   - Rainforest / Bright Data fallback (SerpAPI primary is sufficient
 *     for V9 per the phase-2.4 decision doc update on 2026-04-22)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { withTracking } from '@/utils/observability';
import {
  fetchProductData,
  type ProductDataResult,
} from '@/services/reviews/serpApiService';
import { generateReviewAnalysisFromBlocks } from '@/services/analyzeAnthropic';
import { buildReviewInsights } from '@/services/reviews/insightBuilder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_ASIN_COUNT = 7;
const DEEP_ASIN_COUNT = 12;
const DAILY_PULL_CAP = 10; // deep pull counts as 2
const SERPAPI_COST_PER_CALL_USD = 0.015; // Developer tier: $75 / 5000 searches
const PULL_OPERATION = 'reviews_pull_multi';

function badJson(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const productId: string | undefined = body?.productId;
    const deepPull: boolean = Boolean(body?.deepPull);
    if (!productId) return badJson('productId is required', 400);

    // --- Auth (JWT-in-header pattern, same as the rest of the offer routes) ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supa = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();

    const { data: { user }, error: authError } = await supa.auth.getUser();
    if (authError || !user) return badJson('Unauthorized. Please log in.', 401);

    // --- Rate limit: count today's pull-batch events for this user ---
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todaysPulls, error: rateErr } = await supabaseAdmin
      .from('usage_events')
      .select('id, metadata')
      .eq('user_id', user.id)
      .eq('operation', PULL_OPERATION)
      .eq('status', 'ok')
      .gte('created_at', todayStart.toISOString());
    if (rateErr) {
      console.error('[pull-reviews] rate-limit query failed (soft-fail, allowing pull):', rateErr);
    }
    const pullsToday = (todaysPulls || []).reduce((sum, row: any) => {
      const weight = Number(row?.metadata?.pullWeight) || 1;
      return sum + weight;
    }, 0);
    const weight = deepPull ? 2 : 1;
    if (pullsToday + weight > DAILY_PULL_CAP) {
      return NextResponse.json(
        {
          success: false,
          error: `You've reached today's review-pull limit (${DAILY_PULL_CAP}/day). Try again tomorrow or upload reviews manually.`,
          rateLimit: { used: pullsToday, capacity: DAILY_PULL_CAP, resetAtUtc: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString() },
        },
        { status: 429 }
      );
    }

    // --- Find the primary ASIN for this product ---
    const { data: researchProduct, error: rpErr } = await supa
      .from('research_products')
      .select('id, asin, title')
      .eq('id', productId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (rpErr) console.error('[pull-reviews] research_products lookup failed:', rpErr);

    const primaryAsin: string | null = researchProduct?.asin || null;
    const primaryTitle: string | null = researchProduct?.title || null;

    // --- Find the most recent vetting submission linked to this research product ---
    const { data: submissions, error: subErr } = await supa
      .from('submissions')
      .select('id, submission_data, created_at')
      .eq('user_id', user.id)
      .eq('research_products_id', productId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (subErr) console.error('[pull-reviews] submissions lookup failed:', subErr);

    const competitors: any[] =
      submissions?.[0]?.submission_data?.productData?.competitors ||
      [];

    // --- Select target ASINs ---
    const cap = deepPull ? DEEP_ASIN_COUNT : DEFAULT_ASIN_COUNT;
    const ranked: Array<{ asin: string; revenue: number }> = competitors
      .map((c: any) => ({
        asin: (c?.asin || '').toString().trim().toUpperCase(),
        revenue: Number(c?.monthlyRevenue) || 0,
      }))
      .filter((c) => /^[A-Z0-9]{10}$/.test(c.asin))
      .sort((a, b) => b.revenue - a.revenue);

    const asins: string[] = [];
    if (primaryAsin && /^[A-Z0-9]{10}$/i.test(primaryAsin)) {
      asins.push(primaryAsin.toUpperCase());
    }
    for (const c of ranked) {
      if (asins.length >= cap) break;
      if (!asins.includes(c.asin)) asins.push(c.asin);
    }
    if (asins.length === 0) {
      return badJson(
        'No valid ASINs found for this product. Vet the product first or upload reviews manually.',
        400
      );
    }

    // --- Pull SerpAPI data in parallel, each call instrumented through withTracking ---
    const settled = await Promise.allSettled(
      asins.map((asin) =>
        withTracking<ProductDataResult>(
          {
            userId: user.id,
            provider: 'serpapi',
            operation: 'reviews_pull_single',
            metadata: { asin, productId },
            extractUsage: () => ({ costUsd: SERPAPI_COST_PER_CALL_USD }),
          },
          () => fetchProductData(asin)
        )
      )
    );

    const results: ProductDataResult[] = [];
    const failures: Array<{ asin: string; error: string }> = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') results.push(s.value);
      else failures.push({ asin: asins[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    });

    if (results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'All SerpAPI pulls failed. The ASINs may not exist, or SerpAPI is temporarily unavailable.',
          failures,
        },
        { status: 502 }
      );
    }

    // --- Build review blocks for the analyze pipeline ---
    const { blocks, reviewRecords, reviewCounts } = buildAnalysisBlocks(results);

    // --- Run the existing Phase 2.2 parallel Sonnet/Haiku analysis ---
    const analysis = await generateReviewAnalysisFromBlocks(blocks, { userId: user.id });

    const totalReviewCount = reviewRecords.length;
    const reviewInsights = buildReviewInsights(analysis, { reviewCounts, totalReviewCount });

    // --- Persist reviews + insights to offer_products (upsert on product_id) ---
    const { error: upsertErr } = await supa
      .from('offer_products')
      .upsert(
        {
          product_id: productId,
          asin: primaryAsin,
          reviews: reviewRecords,
          insights: reviewInsights,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );
    if (upsertErr) {
      console.error('[pull-reviews] offer_products upsert failed:', upsertErr);
      // Analysis succeeded — don't fail the response, just surface the miss.
    }

    // --- Log the batch-level pull event (used by the rate limiter) ---
    try {
      await supabaseAdmin.from('usage_events').insert({
        user_id: user.id,
        provider: 'serpapi',
        model: null,
        operation: PULL_OPERATION,
        status: 'ok',
        tokens_in: null,
        tokens_out: null,
        cost_usd: SERPAPI_COST_PER_CALL_USD * asins.length,
        latency_ms: null,
        metadata: {
          productId,
          primaryAsin,
          asinCount: asins.length,
          asinsPulled: results.map((r) => r.asin),
          asinsFailed: failures.map((f) => f.asin),
          deepPull,
          pullWeight: weight,
          totalReviewsAnalyzed: totalReviewCount,
        },
      });
    } catch (e) {
      console.error('[pull-reviews] batch usage_event insert failed:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        reviewInsights,
        reviews: reviewRecords,
        reviewsStored: totalReviewCount,
        totalStoredCount: totalReviewCount,
        capReached: false,
      },
      provenance: {
        primaryAsin,
        primaryTitle,
        asinsPulled: results.map((r) => ({ asin: r.asin, title: r.productTitle, reviewCount: r.reviews.length })),
        asinsFailed: failures,
        deepPull,
        pullWeight: weight,
        pullsUsedToday: pullsToday + weight,
        pullsRemainingToday: Math.max(0, DAILY_PULL_CAP - (pullsToday + weight)),
      },
    });
  } catch (err) {
    console.error('[pull-reviews] unexpected error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error',
      },
      { status: 500 }
    );
  }
}

/**
 * Build the analysis input for the Phase 2.2 `generateReviewAnalysisFromBlocks`
 * pipeline from the multi-ASIN SerpAPI payload. Two meta-blocks are emitted
 * (aggregated Amazon summaries + deduped insight tags) followed by one
 * rating-prefixed block per individual review. Also returns the flat
 * review record list we'll persist to offer_products.reviews and the
 * review-sentiment counts used by the insights builder.
 */
function buildAnalysisBlocks(results: ProductDataResult[]): {
  blocks: string[];
  reviewRecords: Array<{ title: string; body: string; rating: number | string }>;
  reviewCounts: { total: number; positive: number; neutral: number; negative: number };
} {
  const blocks: string[] = [];

  // Meta-block 1: Amazon's "Customers say" summaries across the competitive slate.
  const summaryLines = results
    .filter((r) => !!r.amazonSummary)
    .map((r) => `- ${r.productTitle ? r.productTitle.slice(0, 80) : r.asin}: "${r.amazonSummary}"`);
  if (summaryLines.length > 0) {
    blocks.push(
      [
        `Amazon's "Customers say" editorial summaries across ${summaryLines.length} competing products:`,
        '',
        ...summaryLines,
      ].join('\n')
    );
  }

  // Meta-block 2: deduped insight tags Amazon has extracted across the set.
  const insightSet = new Set<string>();
  for (const r of results) {
    if (r.amazonInsights) {
      for (const tag of r.amazonInsights) insightSet.add(tag);
    }
  }
  if (insightSet.size > 0) {
    blocks.push(
      [
        `Amazon-extracted topic tags across the competitive set:`,
        '',
        ...Array.from(insightSet).map((t) => `- ${t}`),
      ].join('\n')
    );
  }

  // Individual review blocks + persistence records.
  const reviewRecords: Array<{ title: string; body: string; rating: number | string }> = [];
  const reviewCounts = { total: 0, positive: 0, neutral: 0, negative: 0 };

  for (const r of results) {
    for (const review of r.reviews) {
      const lines: string[] = [];
      if (review.rating) lines.push(`${review.rating} out of 5 stars`);
      if (review.title) lines.push(review.title);
      lines.push(review.body);
      blocks.push(lines.join('\n'));

      reviewRecords.push({
        title: review.title || '',
        body: review.body,
        rating: review.rating || 0,
      });
      reviewCounts.total += 1;
      const rating = Number(review.rating);
      if (rating >= 4) reviewCounts.positive += 1;
      else if (rating === 3) reviewCounts.neutral += 1;
      else if (rating > 0) reviewCounts.negative += 1;
    }
  }

  return { blocks, reviewRecords, reviewCounts };
}
