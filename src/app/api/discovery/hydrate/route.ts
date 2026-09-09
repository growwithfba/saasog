import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildEnrichedRow, deriveFulfillment } from '@/lib/keepa/enrichedRow';
import type { EnrichedRow } from '@/lib/keepa/enrichedRow';
// enrichedRow.ts imports CURVE_VERSION from bsrSalesCurve but does not
// re-export it (unlike buildEnrichedRow/deriveFulfillment). Mirror the
// import path /api/extension/enrich/route.ts already uses for the same
// constant rather than modifying the shared enrichedRow module.
import { CURVE_VERSION } from '@/lib/extension/bsrSalesCurve';
import { computeLqsFromKeepaProduct } from '@/lib/keepa/listingQualityScore';
import type { HydratedRow } from '@/lib/discovery/types';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/** One visible page. Keeps a page of browsing at ~25 tokens. */
const MAX_ASINS_PER_REQUEST = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;

function toRow(product: any): HydratedRow {
  // buildEnrichedRow is the app's single calculator for sales/revenue. It
  // applies the corpus-calibrated BSR curve and per-category band multipliers,
  // prefers Buy Box price over New, and derives parent-level units from the
  // product's own BSR — so Parent Sales/Revenue cost no extra tokens.
  //
  // Do NOT read product.monthlySold directly here. That is Amazon's "X+ bought
  // in past month" bucket: it is a ROUND number and displaying it violates the
  // rule that calculated metrics must be smooth and BSR-curve driven. Keepa's
  // bucket is an input to the curve, never a display value.
  //
  // No `siblings` are passed: fetching every sibling would cost several tokens
  // per row. buildEnrichedRow falls back to an equal split across
  // min(variationCount, 5) for the child figure, which is the documented
  // behaviour when siblings are unavailable.
  const enriched = buildEnrichedRow(product);
  return enrichedToHydrated(product?.asin ?? '', enriched, product);
}

/**
 * Project an EnrichedRow (the shape stored in the shared cache) onto the
 * display-unit HydratedRow the Discovery grid renders. `product` is only
 * available on a fresh fetch; on a cache hit we render without it.
 */
function enrichedToHydrated(asin: string, enriched: EnrichedRow, product?: any): HydratedRow {
  return {
    asin,
    title: product?.title ?? null,
    brand: enriched.brand,
    imageUrl: enriched.imageUrl,
    category: enriched.rootCategory,
    bsr: enriched.bsr,
    // EnrichedRow.price is in CENTS; HydratedRow is in display units.
    price: enriched.price === null ? null : enriched.price / 100,
    rating: enriched.rating,
    reviews: enriched.reviews,
    monthlyUnits: enriched.monthlyUnits,
    monthlyRevenue: enriched.monthlyRevenue,
    parentUnits: enriched.parentMonthlyUnits,
    parentRevenue: enriched.parentMonthlyRevenue,
    isFba: product ? deriveFulfillment(product) === 'FBA' : null,
    // computeLqsFromKeepaProduct returns null on a missing product (cache-hit
    // path, no raw payload available) as well as on a too-sparse listing —
    // both correctly render as the em-dash, never 0.
    lqs: computeLqsFromKeepaProduct(product)?.score ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Sanitize + dedupe BEFORE any use: these values are concatenated
    // straight into the provider query string below (misses.join(',')), so
    // an unvalidated entry could inject extra provider params (e.g.
    // '&buybox=1&offers=20') and defeat the 1-token-per-ASIN cost guarantee.
    // Mirrors the sibling route's ASIN sanitization pattern.
    const requested: string[] = Array.isArray(body?.asins)
      ? Array.from(
          new Set(
            (body.asins as unknown[])
              .filter((a): a is string => typeof a === 'string')
              .map((a) => a.replace(/[^A-Z0-9]/gi, '').toUpperCase())
              .filter((a) => ASIN_REGEX.test(a)),
          ),
        ).slice(0, MAX_ASINS_PER_REQUEST)
      : [];
    if (requested.length === 0) {
      return NextResponse.json({ success: true, rows: [] });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // The cache is a system table with RLS and no policies — service role only.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: cached } = await admin
      .from('keepa_lens_metrics')
      .select('asin, payload')
      .in('asin', requested)
      .gt('cache_until', new Date().toISOString());

    // Accept BOTH depths: a Bloom Lens 'full' row is strictly better than the
    // lean one we would fetch. Only the curve version has to match.
    const byAsin = new Map<string, HydratedRow>();
    for (const row of cached ?? []) {
      const payload = (row as any).payload as EnrichedRow | undefined;
      if (payload?.curveVersion === CURVE_VERSION) {
        byAsin.set((row as any).asin, enrichedToHydrated((row as any).asin, payload));
      }
    }

    const misses = requested.filter((a) => !byAsin.has(a));

    if (misses.length > 0) {
      const apiKey = process.env.KEEPA_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ success: false, error: 'Lookup is unavailable.' }, { status: 500 });
      }

      // stats=180&history=1&aplus=1 costs exactly 1 token per ASIN. Adding
      // rating=1 doubles it and buybox+offers takes it to 6 — never add them here.
      const url =
        `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1` +
        `&asin=${misses.join(',')}&stats=180&history=1&aplus=1`;

      const res = await fetch(url);
      const data = await res.json();

      if (data?.error) {
        console.error('[discovery/hydrate] provider error', data.error);
        return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 502 });
      }

      const cacheUntil = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      const upserts: any[] = [];
      const enrichedByAsin = new Map<string, EnrichedRow>();

      for (const product of data?.products ?? []) {
        if (!product?.asin) continue;
        enrichedByAsin.set(product.asin, buildEnrichedRow(product));
        const row = toRow(product);
        if (!row.asin) continue;
        byAsin.set(row.asin, row);
        upserts.push({
          asin: row.asin,
          // Same shape Bloom Lens stores — see the shared-cache hazard above.
          payload: enrichedByAsin.get(row.asin),
          data_quality: row.bsr === null ? 'limited' : 'full',
          fetch_depth: 'lean',
          computed_at: new Date().toISOString(),
          cache_until: cacheUntil,
        });
      }

      if (upserts.length > 0) {
        const { error: upsertError } = await admin
          .from('keepa_lens_metrics')
          .upsert(upserts, { onConflict: 'asin' });
        if (upsertError) console.error('[discovery/hydrate] cache write failed', upsertError);
      }
    }

    // Preserve the caller's ordering — it is the sorted search order.
    const rows = requested.map((a) => byAsin.get(a)).filter(Boolean) as HydratedRow[];
    return NextResponse.json({ success: true, rows });
  } catch (err) {
    console.error('[discovery/hydrate] unexpected', err);
    return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 500 });
  }
}
