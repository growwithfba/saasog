// =============================================================================
// GET /api/extension/funnel-asins
// =============================================================================
// Powers the "From your funnel" section of the primary-ASIN combobox in
// the Lens drawer's Analyze Market modal. Returns every research_products
// row for the signed-in user — minimal columns the picker needs.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free has canVetMarket=false and never sees this).
//
// Response 200:
//   {
//     ok: true,
//     asins: [
//       {
//         asin: string,
//         title: string,
//         brand: string | null,
//         imageUrl: string | null
//       }, ...
//     ]
//   }

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

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 405 });
}

export async function GET(request: NextRequest) {
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
    if (!lensFeatures(tier).canVetMarket) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Analyze Market requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
        )
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from('research_products')
      .select('asin, title, display_name, brand, extra_data, created_at')
      .eq('user_id', resolved.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('extension/funnel-asins query failed:', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    // Pull cached Keepa thumbnails for any ASIN in the funnel. The
    // /api/keepa/listing-images cache is populated whenever the user
    // views /research, so most funnel rows will be hot. We only read
    // the cache here — never trigger a fresh Keepa fetch from this
    // endpoint (would burn rate-limit tokens on every modal open).
    const allAsins = (rows ?? []).map((r) => r.asin);
    const imageByAsin = new Map<string, string | null>();
    if (allAsins.length > 0) {
      const { data: imageRows } = await supabaseAdmin
        .from('keepa_listing_images')
        .select('asin, image_url')
        .in('asin', allAsins);
      for (const ir of imageRows ?? []) {
        if (ir.image_url) imageByAsin.set(ir.asin, ir.image_url);
      }
    }

    const asins = (rows ?? []).map((r) => ({
      asin: r.asin,
      // display_name is the user-edited label from /research; fall back
      // to the original scraped/Keepa title.
      title: r.display_name || r.title || r.asin,
      brand: r.brand ?? null,
      // Prefer the Keepa cache (high reliability), then any image_url
      // saved into extra_data by Lens save-funnel. Null shows the
      // combobox placeholder — better than a broken-image attempt.
      imageUrl: imageByAsin.get(r.asin) ?? r.extra_data?.image_url ?? null,
    }));

    return extensionResponse(request, { ok: true, asins }, resolved);
  } catch (err) {
    console.error('extension/funnel-asins crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
