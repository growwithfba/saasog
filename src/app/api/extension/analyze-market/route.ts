// =============================================================================
// POST /api/extension/analyze-market
// =============================================================================
// Replaces the Phase 5.4-A `/api/extension/vet-market` stub. Two modes:
//
//   create — fresh submissions row in pre-vet state (score: null,
//            status: null). Primary ASIN is auto-upserted into
//            research_products if not already there. The user vets the
//            market on BloomEngine when ready.
//
//   append — patches an existing submissions row's submission_data.
//            productData.competitors with new competitors (deduped by
//            ASIN). New rows are flagged __lens_new + __lens_added_at
//            so /submission/[id]'s adjusted view can highlight them.
//            For vetted markets (score IS NOT NULL), Phase 5.4-O appends
//            a new entry to submission_data.lensExpansions[] (one per
//            expansion event, append-only log) capturing the
//            preExpansionSnapshot so /vetting/[asin]'s recalc banner
//            can offer per-batch undo.
//
// Keepa-everywhere sweep (2026-05-13): the route NO LONGER reads
// title/brand/image/price/reviews/rating/BSR/etc. from the SERP-DOM
// `scrapedRows` payload. Those fields now come from Keepa via the
// shared `hydrateCompetitorsFromKeepa` module. The only thing we read
// from scrapedRows is the `sponsored` flag (per ASIN) — SERP DOM's
// one remaining legitimate role, since Keepa cannot detect sponsored
// placement (it's personalized/dynamic/auction-driven).
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free hits 403).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { checkCap } from '@/lib/subscription';
import { calculateMarketScore } from '@/utils/scoring';
import {
  corsPreflight,
  deriveEffectiveLensTier,
  extensionResponse,
  lensFeatures,
  resolveExtensionToken,
  withCors,
  type ResolvedExtensionToken,
} from '@/lib/extensionAuth';
import {
  hydrateCompetitorsFromKeepa,
  type CanonicalCompetitor,
} from '@/lib/keepa/hydrateCompetitor';

export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

// Sparse SERP-DOM row shape — we only read .asin and .sponsored. Everything
// else is ignored; Keepa is the source of truth for those fields.
type ScrapedRowSparse = {
  asin: string;
  sponsored?: boolean;
};

function normalizeAsins(input: unknown[]): string[] {
  return (input as unknown[])
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.toUpperCase())
    .filter((a) => ASIN_REGEX.test(a));
}

// Build the sponsored-flag map from the SERP-DOM payload. The extension
// scrapes sponsored from the SERP card; we pass it through to the
// canonical competitor record. Missing/undefined → null (not false), so
// the UI can distinguish "definitely organic" from "unknown."
function buildSponsoredMap(rows: unknown[]): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as ScrapedRowSparse;
    if (typeof row.asin !== 'string') continue;
    const asin = row.asin.toUpperCase();
    if (!ASIN_REGEX.test(asin)) continue;
    if (typeof row.sponsored === 'boolean') {
      m.set(asin, row.sponsored);
    }
  }
  return m;
}

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 405 });
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveExtensionToken(request);
    if (!resolved) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tier, subscription_status, trial_ends_at')
      .eq('id', resolved.userId)
      .maybeSingle();

    const tier = deriveEffectiveLensTier(profile ?? null);
    if (!lensFeatures(tier).canVetMarket) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Analyze Market requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body || (body.mode !== 'create' && body.mode !== 'append')) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Invalid mode — expected "create" or "append"' },
          { status: 400 }
        )
      );
    }

    if (!Array.isArray(body.asins) || !Array.isArray(body.scrapedRows)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    const requestedAsins = normalizeAsins(body.asins);
    if (requestedAsins.length === 0) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'No valid ASINs in request' }, { status: 400 })
      );
    }

    // The ONLY thing we read from SERP DOM rows is the sponsored flag.
    const sponsoredMap = buildSponsoredMap(body.scrapedRows);
    const nowIso = new Date().toISOString();

    if (body.mode === 'create') {
      return await handleCreate(request, resolved, body, requestedAsins, sponsoredMap, nowIso);
    }
    return await handleAppend(request, resolved, body, requestedAsins, sponsoredMap, nowIso);
  } catch (err) {
    console.error('extension/analyze-market crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}

// -----------------------------------------------------------------------------
// Mode handlers
// -----------------------------------------------------------------------------

async function handleCreate(
  request: NextRequest,
  resolved: ResolvedExtensionToken,
  body: any,
  requestedAsins: string[],
  sponsoredMap: Map<string, boolean>,
  nowIso: string
) {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const primaryAsinRaw = typeof body.primaryAsin === 'string' ? body.primaryAsin.toUpperCase() : '';

  if (!name) {
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Market name is required' }, { status: 400 })
    );
  }
  if (!ASIN_REGEX.test(primaryAsinRaw)) {
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Invalid primary ASIN' }, { status: 400 })
    );
  }

  // Vetting cap check (Phase 5.4-M, unchanged).
  const cap = await checkCap(supabaseAdmin, resolved.userId, 'vetting');
  if (!cap.allowed) {
    console.log('analyze-market: vetting cap reached for user', {
      userId: resolved.userId,
      used: cap.used,
      limit: cap.limit,
      tier: cap.state.effectiveTier,
    });
    return withCors(
      request,
      NextResponse.json(
        {
          ok: false,
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
        { status: 402 },
      ),
    );
  }

  // Hydrate every ASIN from Keepa in one batched call (primary + competitors
  // together). The shared module returns canonical competitor records with
  // sponsored flags merged in from the SERP-DOM map.
  const allAsins = Array.from(new Set([primaryAsinRaw, ...requestedAsins]));
  const hydrated = await hydrateCompetitorsFromKeepa(allAsins, {
    sponsoredAsins: sponsoredMap,
    userId: resolved.userId,
  });

  const primaryRecord = hydrated.get(primaryAsinRaw);

  // Look up an existing research_products row for the primary ASIN.
  // If none, insert one using Keepa-sourced fields (no SERP fallbacks).
  let researchProductId: string | null = null;
  let primaryAsinAddedToFunnel = false;

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('research_products')
    .select('id')
    .eq('user_id', resolved.userId)
    .eq('asin', primaryAsinRaw)
    .maybeSingle();

  if (lookupErr) {
    console.error('analyze-market primary lookup failed:', lookupErr);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    );
  }

  if (existing) {
    researchProductId = existing.id;
    await supabaseAdmin
      .from('research_products')
      .update({ display_name: name, is_vetted: true, updated_at: nowIso })
      .eq('id', existing.id)
      .eq('user_id', resolved.userId);
  } else {
    const titleForInsert =
      (typeof body.primaryAsinTitle === 'string' && body.primaryAsinTitle.trim()) ||
      primaryRecord?.title ||
      primaryAsinRaw;
    const brandForInsert =
      (typeof body.primaryAsinBrand === 'string' && body.primaryAsinBrand.trim()) ||
      primaryRecord?.brand ||
      null;
    const imageForInsert =
      (typeof body.primaryAsinImage === 'string' && body.primaryAsinImage.trim()) ||
      primaryRecord?.image ||
      null;

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('research_products')
      .insert({
        user_id: resolved.userId,
        asin: primaryAsinRaw,
        title: titleForInsert,
        display_name: name,
        category: null,
        brand: brandForInsert,
        price: primaryRecord?.price ?? null,
        monthly_revenue: primaryRecord?.monthlyRevenue ?? null,
        monthly_units_sold: primaryRecord?.monthlySales ?? null,
        is_vetted: true,
        extra_data: {
          rating: primaryRecord?.rating ?? null,
          reviews: primaryRecord?.reviews ?? null,
          bsr: primaryRecord?.bsr ?? null,
          image_url: imageForInsert,
          __source: 'lens',
          __lens_origin: 'analyze-market-primary',
          __lens_saved_at: nowIso,
          __keepa_data_quality: primaryRecord?.__keepa_data_quality ?? null,
        },
        updated_at: nowIso,
      })
      .select('id')
      .single();

    if (insertErr || !created) {
      console.error('analyze-market primary insert failed:', insertErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }
    researchProductId = created.id;
    primaryAsinAddedToFunnel = true;
  }

  // Build the competitor list from the Keepa hydration map. None are
  // flagged __lens_new on create — they're the founding set.
  const competitors: CanonicalCompetitor[] = requestedAsins
    .map((asin) => hydrated.get(asin))
    .filter((c): c is CanonicalCompetitor => Boolean(c))
    .map((c) => ({ ...c, __lens_origin: true }));

  const totalRevenue = competitors.reduce(
    (sum, c) => sum + (typeof c.monthlyRevenue === 'number' ? c.monthlyRevenue : 0),
    0
  );

  const initialMarketScore = competitors.length > 0
    ? calculateMarketScore(competitors as any[], [])
    : null;

  const submissionPayload = {
    user_id: resolved.userId,
    title: name,
    product_name: name,
    score: initialMarketScore?.score ?? null,
    status: initialMarketScore?.status ?? null,
    research_products_id: researchProductId,
    submission_data: {
      productData: { competitors },
      keepaResults: [],
      marketScore: initialMarketScore,
      createdAt: nowIso,
      __lens_origin: true,
      __lens_primary_asin: primaryAsinRaw,
      // Keepa-everywhere sweep marker — tells consumers this submission's
      // competitors were hydrated server-side from Keepa, not SERP-DOM.
      __keepa_hydrated: true,
      __keepa_hydrated_at: nowIso,
    },
    metrics: {
      totalCompetitors: competitors.length,
      totalMarketCap: totalRevenue,
      revenuePerCompetitor: competitors.length > 0 ? totalRevenue / competitors.length : 0,
    },
  };

  const { data: inserted, error: subInsertErr } = await supabaseAdmin
    .from('submissions')
    .insert(submissionPayload)
    .select('id')
    .single();

  if (subInsertErr || !inserted) {
    console.error('analyze-market submission insert failed:', subInsertErr);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    );
  }

  return extensionResponse(
    request,
    {
      ok: true,
      marketId: inserted.id,
      mode: 'create',
      viewUrl: `/vetting/${primaryAsinRaw}`,
      addedCount: competitors.length,
      skippedCount: 0,
      primaryAsinAddedToFunnel,
    },
    resolved
  );
}

async function handleAppend(
  request: NextRequest,
  resolved: ResolvedExtensionToken,
  body: any,
  requestedAsins: string[],
  sponsoredMap: Map<string, boolean>,
  nowIso: string
) {
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : '';
  if (!submissionId) {
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'submissionId required' }, { status: 400 })
    );
  }

  const { data: submission, error: fetchErr } = await supabaseAdmin
    .from('submissions')
    .select('id, user_id, score, status, metrics, ai_summary, submission_data, research_products_id')
    .eq('id', submissionId)
    .eq('user_id', resolved.userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('analyze-market submission fetch failed:', fetchErr);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    );
  }
  if (!submission) {
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 })
    );
  }

  const submissionData = (submission.submission_data ?? {}) as any;
  const productData = (submissionData.productData ?? {}) as any;
  const existingCompetitors: any[] = Array.isArray(productData.competitors)
    ? productData.competitors
    : [];

  const existingAsinSet = new Set(
    existingCompetitors
      .map((c) => (typeof c?.asin === 'string' ? c.asin.toUpperCase() : null))
      .filter((a): a is string => Boolean(a))
  );

  // Filter to only ASINs we don't already have stored.
  const asinsToAdd = requestedAsins.filter((a) => !existingAsinSet.has(a));
  let skippedCount = requestedAsins.length - asinsToAdd.length;

  // Hydrate the new ASINs from Keepa.
  const hydrated = asinsToAdd.length > 0
    ? await hydrateCompetitorsFromKeepa(asinsToAdd, {
        sponsoredAsins: sponsoredMap,
        userId: resolved.userId,
      })
    : new Map<string, CanonicalCompetitor>();

  const newCompetitors: CanonicalCompetitor[] = [];
  for (const asin of asinsToAdd) {
    const record = hydrated.get(asin);
    if (!record) continue;
    newCompetitors.push({
      ...record,
      __lens_origin: true,
      __lens_new: true,
      __lens_added_at: nowIso,
    });
  }

  const viewUrl = await resolveSubmissionViewUrl(submission);

  if (newCompetitors.length === 0) {
    const existingExpansionsForReply: any[] = Array.isArray(submissionData.lensExpansions)
      ? submissionData.lensExpansions
      : [];
    const pendingRecalc =
      existingExpansionsForReply.some((e: any) => e?.scoreAfter == null) ||
      Boolean(submissionData.__lens_pending_recalc);
    return extensionResponse(
      request,
      {
        ok: true,
        marketId: submission.id,
        mode: 'append',
        viewUrl,
        addedCount: 0,
        skippedCount,
        pendingRecalc,
      },
      resolved
    );
  }

  const updatedCompetitors = [...existingCompetitors, ...newCompetitors];
  const isVetted = typeof submission.score === 'number';

  const existingExpansions: any[] = Array.isArray(submissionData.lensExpansions)
    ? submissionData.lensExpansions
    : [];

  const newExpansionEntry = isVetted
    ? {
        id: nowIso,
        addedAsins: newCompetitors.map((c) => c.asin),
        addedAt: nowIso,
        source: 'bloom-lens',
        scoreBefore: typeof submission.score === 'number' ? submission.score : null,
        scoreAfter: null,
        acknowledged: false,
        preExpansionSnapshot: {
          productData: productData ?? {},
          keepaResults: submissionData.keepaResults ?? [],
          marketScore: submissionData.marketScore ?? {},
          metrics: submission.metrics ?? {},
          score: submission.score ?? null,
          status: submission.status ?? null,
          aiSummary: submission.ai_summary ?? null,
          snapshotAt: nowIso,
        },
      }
    : null;

  const updatedSubmissionData = {
    ...submissionData,
    productData: {
      ...productData,
      competitors: updatedCompetitors,
    },
    __lens_origin: true,
    __lens_last_appended_at: nowIso,
    __keepa_hydrated: true,
    ...(newExpansionEntry
      ? { lensExpansions: [...existingExpansions, newExpansionEntry] }
      : {}),
  };

  const totalRevenue = updatedCompetitors.reduce(
    (sum: number, c: any) => sum + (typeof c.monthlyRevenue === 'number' ? c.monthlyRevenue : 0),
    0
  );

  const { error: updateErr } = await supabaseAdmin
    .from('submissions')
    .update({
      submission_data: updatedSubmissionData,
      metrics: {
        totalCompetitors: updatedCompetitors.length,
        totalMarketCap: totalRevenue,
        revenuePerCompetitor:
          updatedCompetitors.length > 0 ? totalRevenue / updatedCompetitors.length : 0,
      },
      updated_at: nowIso,
    })
    .eq('id', submission.id)
    .eq('user_id', resolved.userId);

  if (updateErr) {
    console.error('analyze-market submission update failed:', updateErr);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    );
  }

  return extensionResponse(
    request,
    {
      ok: true,
      marketId: submission.id,
      mode: 'append',
      viewUrl,
      addedCount: newCompetitors.length,
      skippedCount,
      pendingRecalc: isVetted,
    },
    resolved
  );
}

async function resolveSubmissionViewUrl(submission: {
  id: string;
  research_products_id: string | null;
}): Promise<string> {
  if (!submission.research_products_id) return `/submission/${submission.id}`;
  const { data } = await supabaseAdmin
    .from('research_products')
    .select('asin')
    .eq('id', submission.research_products_id)
    .maybeSingle();
  if (!data?.asin) return `/submission/${submission.id}`;
  return `/vetting/${data.asin}`;
}
