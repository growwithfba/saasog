/**
 * Phase 5.4-O — POST /api/submissions/[id]/lens-recalc
 *
 * Inline recalc trigger for vetted markets that have one or more
 * unresolved BloomLens expansions (entries in submission_data.lensExpansions
 * with scoreAfter still null). Replaces the closed-PR-#28 redirect
 * approach (-> /submission/[id]?triggerRecalc=1) with a server-side
 * endpoint that runs entirely under /vetting/[asin]'s URL.
 *
 * Flow:
 *   1. Bearer auth → resolve userId.
 *   2. Load submission + RLS check.
 *   3. Validate at least one unresolved expansion exists.
 *   4. checkCap('vetting') → 402 if exceeded.
 *   5. Fetch Keepa for the union of (newly-added ASINs across unresolved
 *      expansions) ∪ (top-5 by revenue across the full competitor set).
 *      Backfill category / productWeight / variations / brand on the
 *      newly-added competitors so the matrix stops showing — for fields
 *      we can recover. (PDP-only fields like fulfillment, sellerCount,
 *      activeSellers, soldBy stay null — UI tooltips ship in PR B.)
 *   6. Recompute marketShares + distributions + marketScore.
 *   7. Regen ai_summary via generateVettingSummary.
 *   8. Persist: row columns (score, status, metrics, ai_summary) +
 *      submission_data (productData.competitors, marketScore,
 *      keepaResults, distributions, lensExpansions[] resolved + ack'd,
 *      legacy __lens_pending_recalc cleared).
 *   9. Insert usage_events row with operation='vetting_recalc' so cap.ts
 *      counts the recalc against the user's vetting cap.
 *  10. Return updated submission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { checkCap } from '@/lib/subscription';
import { calculateMarketScore } from '@/utils/scoring';
import { keepaService } from '@/services/keepaService';
import { generateVettingSummary } from '@/services/vettingSummary';
import { deriveSummaryMetrics } from '@/lib/vetting/deriveSummaryMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const KEEPA_BASE_URL = 'https://api.keepa.com';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const submissionId = params.id;
    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'Submission ID is required' },
        { status: 400 }
      );
    }

    // --- Auth ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // --- Load submission ---
    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const submissionData = (submission.submission_data ?? {}) as any;
    const expansions: any[] = Array.isArray(submissionData.lensExpansions)
      ? submissionData.lensExpansions
      : [];
    const unresolvedExpansions = expansions.filter((e) => e?.scoreAfter == null);

    if (unresolvedExpansions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No pending Lens expansion to recalc' },
        { status: 400 }
      );
    }

    // --- Cap check (Phase 5.4-O — closes the "spam append → recalc"
    // workaround: each recalc consumes a vetting slot via the
    // usage_events insert at the end of this handler). ---
    const cap = await checkCap(supabase, userId, 'vetting');
    if (!cap.allowed) {
      console.log('lens-recalc: vetting cap reached for user', {
        userId,
        used: cap.used,
        limit: cap.limit,
        tier: cap.state.effectiveTier,
      });
      return NextResponse.json(
        {
          success: false,
          error: `You've used all ${cap.limit} vettings on the Core plan this period. Upgrade to Pro for unlimited vettings.`,
          cap: {
            action: 'vetting',
            used: cap.used,
            limit: cap.limit,
            remaining: cap.remaining,
            tier: cap.state.tier,
            effectiveTier: cap.state.effectiveTier,
          },
        },
        { status: 402 }
      );
    }

    // --- Build the Keepa fetch list ---
    const competitors: any[] = Array.isArray(submissionData?.productData?.competitors)
      ? submissionData.productData.competitors
      : [];

    const newlyAddedAsinsSet = new Set<string>();
    for (const e of unresolvedExpansions) {
      for (const a of Array.isArray(e?.addedAsins) ? e.addedAsins : []) {
        if (typeof a === 'string' && ASIN_REGEX.test(a)) newlyAddedAsinsSet.add(a);
      }
    }
    const newlyAddedAsins = Array.from(newlyAddedAsinsSet);

    const top5Asins = [...competitors]
      .sort((a, b) => (Number(b?.monthlyRevenue) || 0) - (Number(a?.monthlyRevenue) || 0))
      .slice(0, 5)
      .map((c) => (typeof c?.asin === 'string' ? c.asin.toUpperCase() : ''))
      .filter((a) => ASIN_REGEX.test(a));

    const fetchAsinsSet = new Set<string>([...newlyAddedAsins, ...top5Asins]);
    const fetchAsins = Array.from(fetchAsinsSet);

    // --- Fetch raw Keepa products for backfill + scoring in one shot. ---
    const rawProducts = await fetchKeepaRaw(fetchAsins);
    const rawByAsin = new Map<string, any>();
    for (const p of rawProducts) {
      if (p?.asin) rawByAsin.set(String(p.asin).toUpperCase(), p);
    }

    // --- Backfill newly-added competitors (category/productWeight/
    // variations/brand) from raw Keepa. PDP-only fields stay null. ---
    const backfilledCompetitors = competitors.map((c) => {
      const asin = typeof c?.asin === 'string' ? c.asin.toUpperCase() : '';
      if (!asin || !newlyAddedAsinsSet.has(asin)) return c;
      const raw = rawByAsin.get(asin);
      if (!raw) return c;
      return {
        ...c,
        category: c?.category ?? rootCategoryFromKeepa(raw),
        productWeight: c?.productWeight ?? keepaWeightToLbs(raw?.packageWeight) ?? c?.weight ?? null,
        weight: c?.weight ?? keepaWeightToLbs(raw?.packageWeight) ?? null,
        variations: c?.variations ?? countKeepaVariations(raw),
        variationCount: c?.variationCount ?? countKeepaVariations(raw),
        brand: c?.brand ?? (typeof raw?.brand === 'string' ? raw.brand : null),
      };
    });

    // --- Recompute market-level metrics. ---
    const newMarketCap = backfilledCompetitors.reduce(
      (sum, c) => sum + safeNum(c?.monthlyRevenue),
      0
    );
    const newRevenuePerCompetitor =
      backfilledCompetitors.length > 0 ? newMarketCap / backfilledCompetitors.length : 0;
    const competitorsWithShares = backfilledCompetitors.map((c) => ({
      ...c,
      marketShare: newMarketCap > 0 ? (safeNum(c?.monthlyRevenue) / newMarketCap) * 100 : 0,
    }));
    const newDistributions = calculateDistributions(competitorsWithShares);

    // --- Build keepaResults from top-5's raw products via the legacy
    // transform (calculateMarketScore reads .analysis.bsr/.analysis.price
    // shape from this format). ---
    const top5Raw = top5Asins
      .map((a) => rawByAsin.get(a))
      .filter((p): p is any => Boolean(p));
    let newKeepaResults: any[] = [];
    try {
      newKeepaResults = top5Raw.length > 0 ? keepaService.transformKeepaData(top5Raw) : [];
    } catch (err) {
      console.warn('[lens-recalc] keepaService.transformKeepaData threw:', err);
      newKeepaResults = [];
    }

    const newMarketScore = calculateMarketScore(competitorsWithShares, newKeepaResults);

    const newMetrics = {
      totalCompetitors: competitorsWithShares.length,
      totalMarketCap: newMarketCap,
      revenuePerCompetitor: newRevenuePerCompetitor,
      competitorCount: competitorsWithShares.length,
      calculatedAt: new Date().toISOString(),
    };

    // --- Build the persisted submission_data first so the AI summary
    // derivation reads the post-recalc state. ---
    const nowIso = new Date().toISOString();
    const updatedExpansions = expansions.map((e) =>
      e?.scoreAfter == null
        ? {
            ...e,
            scoreAfter: newMarketScore.score,
            scoreBefore:
              typeof e?.scoreBefore === 'number'
                ? e.scoreBefore
                : (e?.preExpansionSnapshot?.score ?? null),
            acknowledged: true,
            recalcedAt: nowIso,
          }
        : e
    );

    const nextSubmissionData = {
      ...submissionData,
      productData: {
        ...(submissionData.productData ?? {}),
        competitors: competitorsWithShares,
        distributions: newDistributions,
      },
      keepaResults: newKeepaResults,
      marketScore: newMarketScore,
      metrics: newMetrics,
      lensExpansions: updatedExpansions,
      // Legacy flag — analyze-market still dual-writes it for one cycle.
      // Clearing it here keeps any old client surfaces from re-prompting.
      __lens_pending_recalc: false,
      updatedAt: nowIso,
    };

    // --- Regen AI summary against the post-recalc state. ---
    let newAiSummary: any = submission.ai_summary ?? null;
    try {
      newAiSummary = await generateVettingSummary({
        metrics: deriveSummaryMetrics({
          submission_data: nextSubmissionData,
          score: newMarketScore.score,
          status: newMarketScore.status,
        }),
        userId,
        submissionId,
      });
    } catch (err) {
      // AI-summary regen is best-effort — keep the prior summary so the
      // UI doesn't go blank if Anthropic is briefly unavailable.
      console.warn('[lens-recalc] generateVettingSummary failed:', err);
    }

    // --- Persist everything in one update. ---
    const { data: updated, error: updateError } = await supabase
      .from('submissions')
      .update({
        score: newMarketScore.score,
        status: newMarketScore.status,
        metrics: newMetrics,
        ai_summary: newAiSummary,
        submission_data: nextSubmissionData,
      })
      .eq('id', submissionId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[lens-recalc] update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to persist recalc' },
        { status: 500 }
      );
    }

    // --- Record the usage_event so cap.ts counts this recalc against
    // the user's vetting cap on subsequent checkCap calls. Best-effort
    // — the recalc itself already succeeded; failure here just means
    // the user gets a free recalc this once. ---
    void supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      provider: 'extension',
      operation: 'vetting_recalc',
      status: 'ok',
      metadata: {
        submissionId,
        addedAsins: newlyAddedAsins,
        scoreBefore: unresolvedExpansions[0]?.scoreBefore ?? null,
        scoreAfter: newMarketScore.score,
        ts: nowIso,
      },
    });

    return NextResponse.json({ success: true, submission: updated });
  } catch (err) {
    console.error('[lens-recalc] crashed:', err);
    return NextResponse.json(
      { success: false, error: 'Unexpected error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchKeepaRaw(asins: string[]): Promise<any[]> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey || asins.length === 0) return [];
  try {
    const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1&asin=${asins.join(',')}&stats=180&history=1`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[lens-recalc] Keepa fetch non-ok status:', response.status);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data?.products) ? data.products : [];
  } catch (err) {
    console.warn('[lens-recalc] Keepa fetch threw:', err);
    return [];
  }
}

function rootCategoryFromKeepa(product: any): string | null {
  const tree: Array<{ catId: number; name: string }> = product?.categoryTree || [];
  if (!Array.isArray(tree) || tree.length === 0) return null;
  const first = tree[0];
  return typeof first?.name === 'string' && first.name.length > 0 ? first.name : null;
}

function keepaWeightToLbs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  // Keepa stores weight in hundredths of a gram.
  const grams = value / 10;
  const pounds = grams / 453.59237;
  return Math.round(pounds * 1000) / 1000;
}

function countKeepaVariations(product: any): number | null {
  if (Array.isArray(product?.variations)) return product.variations.length;
  if (typeof product?.variationCSV === 'string' && product.variationCSV.length > 0) {
    return product.variationCSV.split(',').filter(Boolean).length;
  }
  return null;
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calculateAgeFromDate(dateFirstAvailable: string | undefined): number {
  if (!dateFirstAvailable) return 0;
  const first = new Date(dateFirstAvailable);
  if (Number.isNaN(first.getTime())) return 0;
  const diff = Math.abs(Date.now() - first.getTime());
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
}

function calculateDistributions(competitors: any[]) {
  const total = competitors.length || 1;
  const ageRanges = { new: 0, growing: 0, established: 0, mature: 0, na: 0 };
  const fulfillmentRanges = { fba: 0, fbm: 0, amazon: 0, na: 0 };

  if (competitors?.length) {
    competitors.forEach((c) => {
      let age = c?.age;
      if (!age && c?.dateFirstAvailable) age = calculateAgeFromDate(c.dateFirstAvailable);
      if (age <= 6) ageRanges.new++;
      else if (age <= 12) ageRanges.growing++;
      else if (age <= 24) ageRanges.established++;
      else if (age > 24) ageRanges.mature++;
      else ageRanges.na++;
    });
    competitors.forEach((c) => {
      const method = String(c?.fulfillment ?? '').toLowerCase();
      if (method.includes('fba')) fulfillmentRanges.fba++;
      else if (method.includes('fbm')) fulfillmentRanges.fbm++;
      else if (method.includes('amazon')) fulfillmentRanges.amazon++;
      else fulfillmentRanges.na++;
    });
  }

  const pct = (ranges: Record<string, number>) =>
    Object.entries(ranges).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: (Number(v) / total) * 100 }),
      {} as Record<string, number>
    );

  return { age: pct(ageRanges), fulfillment: pct(fulfillmentRanges) };
}
