import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const KEEPA_BASE_URL = 'https://api.keepa.com';
// Refresh image URLs older than this. Image filenames on Amazon's CDN
// rarely change for a stable listing, so a long TTL keeps Keepa-token
// usage minimal even for users who revisit a vetting daily.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ASINS_PER_REQUEST = 100;

const getServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role env vars missing.');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false }
  });
};

const sanitizeAsin = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return cleaned.length === 10 ? cleaned : null;
};

// Keepa returns images as an array of `{ l, m, lH, lW, mH, mW }`. We use
// the `m` variant (~500px on the long side) for thumbnails and fall back to
// `l` if missing.
const buildImageUrl = (images: unknown): string | null => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!first || typeof first !== 'object') return null;
  const filename =
    typeof (first as any).m === 'string' && (first as any).m.length > 0
      ? (first as any).m
      : typeof (first as any).l === 'string' && (first as any).l.length > 0
      ? (first as any).l
      : null;
  return filename ? `https://m.media-amazon.com/images/I/${filename}` : null;
};

interface KeepaImageResponse {
  asin: string;
  image_url: string | null;
}

const fetchFromKeepa = async (apiKey: string, asins: string[], domain: number): Promise<KeepaImageResponse[]> => {
  if (!asins.length) return [];
  // Minimal product call: no &stats, no &history, no &buybox. Just enough
  // to populate the `images` array on the response. Costs ~1 token per ASIN.
  const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=${domain}&asin=${asins.join(',')}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error('Keepa listing-images fetch failed', response.status, await response.text().catch(() => ''));
    return asins.map(asin => ({ asin, image_url: null }));
  }
  const data = await response.json().catch(() => null);
  const products: any[] = Array.isArray(data?.products) ? data.products : [];
  const byAsin = new Map<string, any>();
  for (const p of products) {
    if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);
  }
  return asins.map(asin => {
    const product = byAsin.get(asin);
    return {
      asin,
      image_url: product ? buildImageUrl(product.images) : null
    };
  });
};

export async function POST(request: Request) {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: 'KEEPA_API_KEY_MISSING', message: 'Keepa API key missing.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_JSON', message: 'Invalid JSON body.' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rawAsins: unknown[] = Array.isArray(body?.asins) ? body.asins : [];
  const domain = Number(body?.domain ?? 1);
  const asins = Array.from(
    new Set(
      rawAsins
        .map(sanitizeAsin)
        .filter((a): a is string => Boolean(a))
    )
  ).slice(0, MAX_ASINS_PER_REQUEST);
  if (asins.length === 0) {
    return NextResponse.json(
      { images: {} },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = getServiceClient();

  // Look up the cache for every requested ASIN in one query.
  const { data: cached } = await supabase
    .from('keepa_listing_images')
    .select('asin, image_url, fetched_at')
    .in('asin', asins);

  const now = Date.now();
  const cacheByAsin = new Map<string, { image_url: string | null; fresh: boolean }>();
  for (const row of cached || []) {
    const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
    cacheByAsin.set(row.asin, {
      image_url: row.image_url,
      fresh: now - fetchedAt < CACHE_TTL_MS
    });
  }

  // ASINs to fetch: anything not in cache, or stale.
  const toFetch = asins.filter(asin => {
    const entry = cacheByAsin.get(asin);
    return !entry || !entry.fresh;
  });

  let fresh: KeepaImageResponse[] = [];
  if (toFetch.length > 0) {
    fresh = await fetchFromKeepa(apiKey, toFetch, domain);
    // Upsert all results — null image URLs are stored too so we don't
    // re-hit Keepa for products it can't find images for.
    if (fresh.length > 0) {
      const upsertRows = fresh.map(item => ({
        asin: item.asin,
        image_url: item.image_url,
        fetched_at: new Date().toISOString()
      }));
      const { error: upsertError } = await supabase
        .from('keepa_listing_images')
        .upsert(upsertRows, { onConflict: 'asin' });
      if (upsertError) {
        console.error('Failed to upsert keepa_listing_images', upsertError);
      }
    }
  }

  // Build the response map: prefer fresh fetches over cache.
  const result: Record<string, string | null> = {};
  for (const asin of asins) {
    const freshEntry = fresh.find(f => f.asin === asin);
    if (freshEntry) {
      result[asin] = freshEntry.image_url;
    } else {
      result[asin] = cacheByAsin.get(asin)?.image_url ?? null;
    }
  }

  return NextResponse.json(
    { images: result },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
