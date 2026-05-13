// =============================================================================
// POST /api/extension/enrich
// =============================================================================
// Per-ASIN enrichment for the Bloom Lens drawer's "heavy" columns. Replaces
// the synth-derived BSR/units/revenue/etc. with real, multi-point-smoothed
// values from Keepa's csv[3] (sales-rank time series).
//
// Phase 5.4-F. See bloom-lens-extension/research/phase-5.4-F-keepa-probe.md
// for the data-quality findings that drove the multi-point smoothing.
//
// Auth: Authorization: Bearer <ext_token> (mirror save-funnel pattern)
//
// Request:
//   POST /api/extension/enrich
//   { "asins": ["B0D2KZXT8R", ...] }   // max 100, deduped, uppercased
//
// Response 200:
//   {
//     "ok": true,
//     "enriched": {
//       "<ASIN>": {
//         "bsr": number | null,                // current snapshot
//         "bsr30dMedian": number | null,       // smoothed headline
//         "bsrVolatility": number | null,      // coefficient of variation
//         "bsrTrendPct": number | null,        // 30d → today % change
//         "monthlyUnits": number | null,       // derived via BSR curve
//         "monthlyRevenue": number | null,     // units × 30d-avg price (cents)
//         "price": number | null,              // current price, cents
//         "weightLb": number | null,
//         "dimensions": { l: number, w: number, h: number } | null,
//         "listingCreatedAt": string | null,   // ISO yyyy-mm-dd
//         "variationCount": number | null,
//         "rating": number | null,             // 0–5
//         "reviews": number | null,
//         "imageUrl": string | null,
//         "brand": string | null,
//         "dataQuality": "full" | "limited",
//         "curveVersion": string
//       }
//     }
//   }

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';
import { CURVE_VERSION } from '@/lib/extension/bsrSalesCurve';
import {
  buildEnrichedRow,
  buildEmptyEnrichedRow,
  type EnrichedRow,
} from '@/lib/keepa/enrichedRow';

export const dynamic = 'force-dynamic';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_DOMAIN_US = 1;
const MAX_ASINS_PER_REQUEST = 100;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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

    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
      console.error('POST extension/enrich: KEEPA_API_KEY is not configured');
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Enrichment is not configured' },
          { status: 500 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body || !Array.isArray(body.asins)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    // Sanitize, dedupe, cap.
    const asins = Array.from(
      new Set(
        (body.asins as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.toUpperCase())
          .filter((a) => ASIN_REGEX.test(a))
      )
    ).slice(0, MAX_ASINS_PER_REQUEST);

    if (asins.length === 0) {
      return extensionResponse(request, { ok: true, enriched: {} }, resolved);
    }

    // Cache lookup. We pull every requested ASIN in one query; the route
    // decides per-row whether to use cache or fetch fresh.
    const { data: cached } = await supabaseAdmin
      .from('keepa_lens_metrics')
      .select('asin, payload, data_quality, cache_until')
      .in('asin', asins);

    const now = Date.now();
    const enriched: Record<string, EnrichedRow> = {};
    const cacheHits: string[] = [];
    const toFetch: string[] = [];

    for (const asin of asins) {
      const row = cached?.find((c) => c.asin === asin);
      const payload = row?.payload as EnrichedRow | undefined;
      const fresh = !!(row && row.cache_until && new Date(row.cache_until).getTime() > now);
      const versionMatch = payload?.curveVersion === CURVE_VERSION;
      if (fresh && versionMatch) {
        // Fresh AND built against the current curve — use as-is.
        enriched[asin] = payload!;
        cacheHits.push(asin);
      } else {
        // Stale by TTL OR built against an older curve. Refetch.
        toFetch.push(asin);
      }
    }

    // Single batched call to Keepa for all misses. Empty toFetch → skip.
    if (toFetch.length > 0) {
      // Keepa-everywhere sweep — add &rating=1 (reviews + rating) and
      // &buybox=1 (Buy Box price). Without rating=1, cur[16]/cur[17]
      // are always -1 and keepa_lens_metrics cache rows had null
      // reviews even for known top-sellers. Buy Box (cur[18]) is what
      // the customer actually pays so it's the right revenue input.
      const url =
        `${KEEPA_BASE_URL}/product` +
        `?key=${apiKey}` +
        `&domain=${KEEPA_DOMAIN_US}` +
        `&asin=${toFetch.join(',')}` +
        `&stats=180` +
        `&history=1` +
        `&rating=1` +
        `&buybox=1`;

      const t0 = Date.now();
      const res = await fetch(url);
      const elapsedMs = Date.now() - t0;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Keepa enrich fetch failed', res.status, errText.slice(0, 300));
        // Don't fail the whole request — return what we have from cache,
        // and mark unfetched ASINs as missing so the client can retry.
        return extensionResponse(request, { ok: true, enriched }, resolved);
      }

      const data: any = await res.json();
      const products: any[] = Array.isArray(data?.products) ? data.products : [];
      const byAsin = new Map<string, any>();
      for (const p of products) {
        if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);
      }

      console.log(
        `POST extension/enrich: keepa fetch ${toFetch.length} ASINs in ${elapsedMs}ms ` +
          `(processing=${data.processingTimeInMs}ms, tokensConsumed=${data.tokensConsumed}, tokensLeft=${data.tokensLeft})`
      );

      // Build payloads + upsert into cache.
      const upsertRows: Array<{
        asin: string;
        payload: EnrichedRow;
        data_quality: 'full' | 'limited';
        computed_at: string;
        cache_until: string;
      }> = [];
      const nowIso = new Date().toISOString();
      const cacheUntilIso = new Date(now + CACHE_TTL_MS).toISOString();

      for (const asin of toFetch) {
        const product = byAsin.get(asin);
        const row = product ? buildEnrichedRow(product) : buildEmptyEnrichedRow();
        enriched[asin] = row;
        upsertRows.push({
          asin,
          payload: row,
          data_quality: row.dataQuality,
          computed_at: nowIso,
          cache_until: cacheUntilIso,
        });
      }

      if (upsertRows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('keepa_lens_metrics')
          .upsert(upsertRows, { onConflict: 'asin' });
        if (upsertError) {
          console.error('Failed to upsert keepa_lens_metrics', upsertError);
          // Don't fail the response — the data is good, just not cached.
        }
      }
    }

    return extensionResponse(
      request,
      { ok: true, enriched, cacheHits: cacheHits.length, fetched: toFetch.length },
      resolved
    );
  } catch (err) {
    console.error('POST extension/enrich: unexpected error', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    );
  }
}
