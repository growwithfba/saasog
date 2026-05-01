// =============================================================================
// POST /api/extension/save-funnel
// =============================================================================
// Bulk-saves N selected ASINs from a Bloom Lens scrape into the user's
// research funnel (the existing research_products table — same store
// the BloomEngine dashboard /research page reads from).
//
// Phase 5.4-D — graduated from the 5.4-A stub.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free hits 403 with upgradeUrl).
//
// Request:
//   POST /api/extension/save-funnel
//   {
//     name: string,                  // user-supplied label, stored in extra_data
//     asins: string[],               // 10-char alphanumeric ASINs
//     scrapedRows: ScrapedRow[]      // mirror of MockRow used by the drawer
//   }
//
// Response 200:
//   {
//     ok: true,
//     addedCount: number,            // newly inserted research_products rows
//     skippedCount: number,          // ASINs already in the user's funnel
//     productIds: string[],          // newly inserted row IDs
//     viewUrl: '/research'           // where the user can see the result
//   }
//
// Response 401 / 403 / 400 / 500: unchanged from the Phase 5.4-A stub.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  deriveLensTier,
  extensionResponse,
  lensFeatures,
  resolveExtensionToken,
  withCors,
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
      .select('subscription_status, subscription_type')
      .eq('id', resolved.userId)
      .maybeSingle();

    const tier = deriveLensTier(
      profile?.subscription_status ?? null,
      profile?.subscription_type ?? null
    );
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

    // Index scraped rows by ASIN so we can attach scraped fields to
    // each insert without trusting the client's array order.
    const rowsByAsin = new Map<string, ScrapedRow>();
    for (const r of body.scrapedRows as ScrapedRow[]) {
      if (r && typeof r.asin === 'string') {
        rowsByAsin.set(r.asin.toUpperCase(), r);
      }
    }

    // Dedup: pull the user's existing research_products ASINs that
    // overlap with the request. Skip those — the existing add-asin
    // single-ASIN route 409s on dupes; bulk-save silently skips
    // because partial success is the expected UX (you select 8,
    // 3 already saved, 5 get added — that's a normal save).
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

    const nowIso = new Date().toISOString();
    const inserts = newAsins.map((asin) => {
      const row = rowsByAsin.get(asin) ?? ({ asin } as ScrapedRow);
      return {
        user_id: resolved.userId,
        asin,
        title: row.title ?? asin,
        // Lens scraper doesn't extract category from the SERP DOM, so
        // leave it null; the dashboard's category column will populate
        // when /api/extension/enrich brings in Keepa data.
        category: null,
        brand: row.brand ?? null,
        price: row.price ?? null,
        monthly_revenue: row.monthlyRevenue ?? null,
        monthly_units_sold: row.monthlyUnits ?? null,
        // Keys here MUST match what `src/components/Table.tsx`'s column
        // reader looks up (e.g. `reviews` not `review`, `weight` not
        // `weightLb`, snake_case for compound keys). The reader logic
        // is the source of truth — if you add a column to the funnel
        // table, mirror its key set here so Lens-saved rows populate.
        extra_data: {
          rating: row.rating ?? null,
          reviews: row.reviews ?? null,
          bsr: row.bsr ?? null,
          weight: row.weightLb ?? null,
          size_tier: row.sizeTier ?? null,
          variation_count: row.variationCount ?? null,
          image_url: row.image ?? null,
          // Lens-only fields kept under namespaced keys so the
          // dashboard's standard columns don't pick up synth values
          // by accident. They remain available for future tools or
          // analytics queries on Lens-origin rows.
          __lens_fba_fee: row.fbaFee ?? null,
          __lens_bsr_trend: row.bsrTrend ?? null,
          __lens_days_since_price_change: row.daysSincePriceChange ?? null,
          __lens_lqs: row.lqs ?? null,
          __lens_listing_created_at: row.listingCreatedAt ?? null,
          __lens_dimensions: row.dimensions ?? null,
          __lens_seller: row.seller ?? null,
          __lens_seller_country: row.sellerCountry ?? null,
          // Provenance — lets the dashboard surface "Saved from Bloom
          // Lens" and group by the user's chosen label later.
          __source: 'lens',
          __lens_save_label: name,
          __lens_saved_at: nowIso,
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
