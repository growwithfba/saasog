// =============================================================================
// POST /api/extension/save-funnel
// =============================================================================
// Bulk-saves N selected ASINs from a Bloom Lens scrape into the user's
// research funnel (research_products table).
//
// Keepa-everywhere sweep (2026-05-13): scraped-row fields are no longer
// trusted as values. Every row is hydrated server-side from Keepa via
// the shared `hydrateCompetitorsFromKeepa` module. The only thing we
// read from the SERP-DOM payload is the per-ASIN `sponsored` flag
// (Keepa cannot detect sponsored placement).
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free hits 403 with upgradeUrl).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  deriveEffectiveLensTier,
  extensionResponse,
  lensFeatures,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';
import { hydrateCompetitorsFromKeepa } from '@/lib/keepa/hydrateCompetitor';

export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

type ScrapedRowSparse = {
  asin: string;
  sponsored?: boolean;
};

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
    if (!lensFeatures(tier).canSaveFunnel) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Save to Funnel requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    if (
      !body ||
      typeof body.name !== 'string' ||
      !Array.isArray(body.asins) ||
      !Array.isArray(body.scrapedRows)
    ) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    const name = body.name.trim().slice(0, 200);
    const requestedAsins = (body.asins as unknown[])
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.toUpperCase())
      .filter((a) => ASIN_REGEX.test(a));

    if (requestedAsins.length === 0) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'No valid ASINs in request' }, { status: 400 })
      );
    }

    const sponsoredMap = buildSponsoredMap(body.scrapedRows);

    // Dedup against existing rows.
    const { data: existingRows, error: existingErr } = await supabaseAdmin
      .from('research_products')
      .select('asin')
      .eq('user_id', resolved.userId)
      .in('asin', requestedAsins);

    if (existingErr) {
      console.error('save-funnel dedup query failed:', existingErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    const existingSet = new Set((existingRows ?? []).map((r) => r.asin));
    const newAsins = requestedAsins.filter((a) => !existingSet.has(a));

    if (newAsins.length === 0) {
      return extensionResponse(
        request,
        {
          ok: true,
          addedCount: 0,
          skippedCount: requestedAsins.length,
          productIds: [],
          viewUrl: '/research',
        },
        resolved
      );
    }

    // Hydrate the new ASINs from Keepa.
    const hydrated = await hydrateCompetitorsFromKeepa(newAsins, {
      sponsoredAsins: sponsoredMap,
      userId: resolved.userId,
    });

    const nowIso = new Date().toISOString();
    const inserts = newAsins.map((asin) => {
      const c = hydrated.get(asin);
      return {
        user_id: resolved.userId,
        asin,
        title: c?.title ?? asin,
        // Category lookup deferred — Keepa /product returns categoryTree
        // but storing the top-level alone (matches the prior behavior).
        category: null,
        brand: c?.brand ?? null,
        price: c?.price ?? null,
        monthly_revenue: c?.monthlyRevenue ?? null,
        monthly_units_sold: c?.monthlySales ?? null,
        extra_data: {
          rating: c?.rating ?? null,
          reviews: c?.reviews ?? null,
          bsr: c?.bsr ?? null,
          weight: c?.weight ?? null,
          size_tier: c?.sizeTier ?? null,
          variation_count: c?.variationCount ?? null,
          image_url: c?.image ?? null,
          // Lens-only namespaced fields kept for analytics provenance.
          // Values now sourced from Keepa via the shared hydration module.
          __lens_fba_fee: c?.fbaFee ?? null,
          __lens_lqs: c?.lqs ?? null,
          __lens_listing_created_at: c?.dateFirstAvailable ?? null,
          __lens_dimensions: c?.dimensions ?? null,
          __lens_seller: c?.seller ?? null,
          __lens_seller_country: c?.sellerCountry ?? null,
          __lens_sponsored: c?.sponsored ?? null,
          __source: 'lens',
          __lens_save_label: name,
          __lens_saved_at: nowIso,
          __keepa_hydrated: true,
          __keepa_data_quality: c?.__keepa_data_quality ?? null,
        },
        updated_at: nowIso,
      };
    });

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('research_products')
      .insert(inserts)
      .select('id');

    if (insertErr) {
      console.error('save-funnel insert failed:', insertErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    return extensionResponse(
      request,
      {
        ok: true,
        addedCount: created?.length ?? 0,
        skippedCount: existingSet.size,
        productIds: (created ?? []).map((r) => r.id),
        viewUrl: '/research',
      },
      resolved
    );
  } catch (err) {
    console.error('extension/save-funnel crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
