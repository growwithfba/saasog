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
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free hits 403).
//
// Request:
//   POST /api/extension/analyze-market
//   { mode: 'create',
//     name: string,                       // user-supplied market name
//     primaryAsin: string,                // 10-char ASIN
//     primaryAsinTitle?: string,          // for research_products auto-upsert
//     primaryAsinBrand?: string | null,
//     primaryAsinImage?: string | null,
//     asins: string[],                    // selected competitor ASINs
//     scrapedRows: ScrapedRow[]           // mirror of MockRow
//   }
//
//   POST /api/extension/analyze-market
//   { mode: 'append',
//     submissionId: string,
//     asins: string[],
//     scrapedRows: ScrapedRow[]
//   }
//
// Response 200 (create):
//   { ok: true, marketId, mode: 'create', viewUrl: '/submission/<id>',
//     addedCount, skippedCount: 0, primaryAsinAddedToFunnel: boolean }
//
// Response 200 (append):
//   { ok: true, marketId, mode: 'append', viewUrl: '/submission/<id>',
//     addedCount, skippedCount, pendingRecalc: boolean }
//
// Response 401 / 403 / 400 / 500: standard.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { checkCap } from '@/lib/subscription';
import { calculateMarketScore } from '@/utils/scoring';
import { isReviewCountInflated } from '@/lib/competitorDataQuality';
import {
  corsPreflight,
  deriveEffectiveLensTier,
  extensionResponse,
  lensFeatures,
  resolveExtensionToken,
  withCors,
  type ResolvedExtensionToken,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

type ScrapedRow = {
  asin: string;
  title?: string | null;
  brand?: string | null;
  price?: number | null;
  monthlyRevenue?: number | null;
  monthlyUnits?: number | null;
  rating?: number | null;
  reviews?: number | null;
  image?: string | null;
  bsr?: number | null;
  weightLb?: number | null;
  sizeTier?: string | null;
  variationCount?: number | null;
  fbaFee?: number | null;
  bsrTrend?: number | null;
  daysSincePriceChange?: number | null;
  lqs?: number | null;
  listingCreatedAt?: string | null;
  dimensions?: string | null;
  seller?: string | null;
  sellerCountry?: string | null;
};

// Maps a Lens-scraped SERP row into the competitor shape that
// scoring.ts/calculateMarketScore + the submission detail page expect.
// Lens doesn't surface fulfillment / dateFirstAvailable depth — those
// gaps fill in when the user runs Keepa enrichment on BloomEngine.
//
// Phase 5.4-O — also write `productWeight` and `variations` aliases so
// the matrix on /vetting/[asin] reads them (column keys are
// `productWeight` and `variations`, but Lens scrape gives us
// `weightLb` and `variationCount`). Without the aliases these cells
// rendered `—` even though we had the data, which surfaced as Dave's
// "missing matrix columns" testing feedback.
function scrapedRowToCompetitor(row: ScrapedRow, opts: { isNew: boolean; addedAt: string }) {
  // Detect rows whose displayed review count is inconsistent with the
  // rest of the listing data (variation-family aggregation on SERP,
  // catalog-content edits, etc.). Tag `dataQuality: 'limited'` so the
  // vetting page can dash the affected cells and skip them from share-%
  // denominators. See src/lib/competitorDataQuality.ts for the gate.
  const baseCompetitor = {
    asin: row.asin,
    title: row.title ?? row.asin,
    brand: row.brand ?? null,
    price: row.price ?? null,
    monthlyRevenue: row.monthlyRevenue ?? null,
    monthlySales: row.monthlyUnits ?? null,
    rating: row.rating ?? null,
    reviews: row.reviews ?? null,
    bsr: row.bsr ?? null,
    image: row.image ?? null,
    dateFirstAvailable: row.listingCreatedAt ?? null,
    fulfillment: null,
    weight: row.weightLb ?? null,
    productWeight: row.weightLb ?? null,
    sizeTier: row.sizeTier ?? null,
    variationCount: row.variationCount ?? null,
    variations: row.variationCount ?? null,
    fbaFee: row.fbaFee ?? null,
    dimensions: row.dimensions ?? null,
    seller: row.seller ?? null,
    sellerCountry: row.sellerCountry ?? null,
    __lens_origin: true,
    ...(opts.isNew ? { __lens_new: true, __lens_added_at: opts.addedAt } : {}),
  };
  const dataQuality = isReviewCountInflated(baseCompetitor) ? 'limited' : undefined;
  return dataQuality ? { ...baseCompetitor, dataQuality } : baseCompetitor;
}

function indexScrapedByAsin(rows: ScrapedRow[]): Map<string, ScrapedRow> {
  const m = new Map<string, ScrapedRow>();
  for (const r of rows) {
    if (r && typeof r.asin === 'string') m.set(r.asin.toUpperCase(), r);
  }
  return m;
}

function normalizeAsins(input: unknown[]): string[] {
  return (input as unknown[])
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.toUpperCase())
    .filter((a) => ASIN_REGEX.test(a));
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

    const scrapedByAsin = indexScrapedByAsin(body.scrapedRows as ScrapedRow[]);
    const nowIso = new Date().toISOString();

    if (body.mode === 'create') {
      return await handleCreate(request, resolved, body, requestedAsins, scrapedByAsin, nowIso);
    }
    return await handleAppend(request, resolved, body, requestedAsins, scrapedByAsin, nowIso);
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
  scrapedByAsin: Map<string, ScrapedRow>,
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

  // Phase 5.4-M: vetting cap check on the extension handoff path.
  // Mirrors /api/analyze gating so the cap is enforced regardless of
  // whether the user came in via CSV upload or the Chrome Extension's
  // Analyze Market flow. Only 'create' mode is gated — 'append' updates
  // an existing submission and doesn't count.
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

  // Look up an existing research_products row for the primary ASIN.
  // If none, insert one — keeps the funnel coherent so the dashboard
  // can navigate from the submission to its primary product page.
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
    // Set display_name to the market name on the existing primary
    // ASIN's row. The user just typed a name for THIS market and
    // that's what should drive the in-app /vetting/<asin> header
    // (which reads research_products.display_name first via
    // getProductDisplayName). If they want the product's original
    // title back, the pencil icon on the header lets them rename.
    // is_vetted=true so the /vetting list PROGRESS column shows the
    // vetted-stage badge (since analyze-market now auto-scores below).
    await supabaseAdmin
      .from('research_products')
      .update({ display_name: name, is_vetted: true, updated_at: nowIso })
      .eq('id', existing.id)
      .eq('user_id', resolved.userId);
  } else {
    // Auto-insert. Prefer fields the client passed (when the primary
    // ASIN came from the picker's "selected competitors" or "manual"
    // sources we may have richer data); fall back to whatever the
    // scraped row has.
    const scraped = scrapedByAsin.get(primaryAsinRaw);
    const titleForInsert =
      (typeof body.primaryAsinTitle === 'string' && body.primaryAsinTitle.trim()) ||
      scraped?.title ||
      primaryAsinRaw;
    const brandForInsert =
      (typeof body.primaryAsinBrand === 'string' && body.primaryAsinBrand.trim()) ||
      scraped?.brand ||
      null;
    const imageForInsert =
      (typeof body.primaryAsinImage === 'string' && body.primaryAsinImage.trim()) ||
      scraped?.image ||
      null;

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('research_products')
      .insert({
        user_id: resolved.userId,
        asin: primaryAsinRaw,
        title: titleForInsert,
        // display_name = the market name so the in-app vetting
        // header surfaces what the user typed (matches the existing-
        // row branch above).
        display_name: name,
        category: null,
        brand: brandForInsert,
        price: scraped?.price ?? null,
        monthly_revenue: scraped?.monthlyRevenue ?? null,
        monthly_units_sold: scraped?.monthlyUnits ?? null,
        // Mark as vetted so the /vetting list PROGRESS column shows the
        // vetted-stage badge for this market — analyze-market now
        // auto-scores the submission below, so it IS vetted.
        is_vetted: true,
        extra_data: {
          rating: scraped?.rating ?? null,
          reviews: scraped?.reviews ?? null,
          bsr: scraped?.bsr ?? null,
          image_url: imageForInsert,
          __source: 'lens',
          __lens_origin: 'analyze-market-primary',
          __lens_saved_at: nowIso,
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

  // Build the initial competitor list. None are flagged __lens_new on
  // create — they're the founding set, not arrivals against a baseline.
  const competitors = requestedAsins
    .map((asin) => scrapedByAsin.get(asin))
    .filter((r): r is ScrapedRow => Boolean(r))
    .map((r) => scrapedRowToCompetitor(r, { isNew: false, addedAt: nowIso }));

  const totalRevenue = competitors.reduce(
    (sum, c) => sum + (typeof c.monthlyRevenue === 'number' ? c.monthlyRevenue : 0),
    0
  );

  // Auto-score on create so the /vetting dashboard list shows a real
  // score and PASS/RISKY/FAIL pill instead of "0% / N/A". calculateMarketScore
  // accepts an empty keepaResults array — the score will be computed from
  // competitor metadata only (no BSR/price stability factor). When the user
  // later runs Recalculate via the BloomLens recalc banner, lens-recalc
  // fetches Keepa and recomputes a higher-fidelity score.
  const initialMarketScore = competitors.length > 0
    ? calculateMarketScore(competitors, [])
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
      // Intentionally NOT setting __lens_pending_recalc here. The vetting
      // page surfaces that flag via the "New competitors detected —
      // competitors were added from BloomLens since this market was last
      // vetted" banner, which is wrong copy for a brand-new market (there
      // is no "last vetted" baseline). The expansion path below still
      // appends to lensExpansions[] when competitors are added to an
      // existing market — that's the case the banner is designed for.
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
      // /vetting/[asin] is the in-app result page (PageShell with
      // NavBar). /submission/[id] is the public-share view — wrong
      // surface for the user opening from Lens.
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
  scrapedByAsin: Map<string, ScrapedRow>,
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

  const newCompetitors: any[] = [];
  let skippedCount = 0;
  for (const asin of requestedAsins) {
    if (existingAsinSet.has(asin)) {
      skippedCount += 1;
      continue;
    }
    const scraped = scrapedByAsin.get(asin);
    if (!scraped) continue;
    newCompetitors.push(scrapedRowToCompetitor(scraped, { isNew: true, addedAt: nowIso }));
  }

  // Resolve the primary ASIN so we can deep-link to the in-app
  // /vetting/[asin] route. Existing submissions always carry a
  // research_products_id; if missing for some legacy row, fall back to
  // /submission/[id] which still renders (just without the in-app nav).
  const viewUrl = await resolveSubmissionViewUrl(submission);

  if (newCompetitors.length === 0) {
    // Phase 5.4-O — pendingRecalc now reflects the lensExpansions log
    // (any entry with scoreAfter still null), with a fallback read of
    // the legacy __lens_pending_recalc flag for rows created before
    // 5.4-O landed. Response shape unchanged so the extension client
    // doesn't need a re-deploy.
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

  // Phase 5.4-O — append a lensExpansions entry on vetted markets.
  // The append-only log is what /vetting/[asin] reads to render the
  // recalc banner + per-batch undo. Snapshot is captured BEFORE the
  // merge so undo can restore the pre-this-batch competitor set
  // without disturbing earlier expansions or any existing manual
  // adjustment.
  const existingExpansions: any[] = Array.isArray(submissionData.lensExpansions)
    ? submissionData.lensExpansions
    : [];

  const newExpansionEntry = isVetted
    ? {
        id: nowIso,
        addedAsins: newCompetitors.map((c: any) => c.asin),
        addedAt: nowIso,
        source: 'bloom-lens',
        // Pre-this-expansion score; submission.score doesn't change
        // until a recalc fires, so the row's current value IS the
        // correct baseline. scoreAfter stays null until recalc.
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
    ...(newExpansionEntry
      ? { lensExpansions: [...existingExpansions, newExpansionEntry] }
      : {}),
  };
  // Legacy __lens_pending_recalc was dual-written in PR A for safety
  // while the lensExpansions-based UI was in flight. PR B reads
  // lensExpansions only — no consumer remains for the legacy flag, so
  // we drop the write. Existing rows that still have the flag set
  // unchanged (lensExpansions presence supersedes it).

  const totalRevenue = updatedCompetitors.reduce(
    (sum, c) => sum + (typeof c.monthlyRevenue === 'number' ? c.monthlyRevenue : 0),
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
