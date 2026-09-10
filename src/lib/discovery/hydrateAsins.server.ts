import type { SupabaseClient } from '@supabase/supabase-js';
import { CURVE_VERSION } from '@/lib/extension/bsrSalesCurve';
import { computeLqsFromKeepaProduct } from '@/lib/keepa/listingQualityScore';
import type { HydratedRow } from './types';
import {
  buildFreshRow,
  rowFromCachePayload,
  withDiscoveryExtras,
  type DiscoveryCachePayload,
} from './hydrateRow';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const ASIN_REGEX = /^[A-Z0-9]{10}$/;

/**
 * Normalise, validate and de-duplicate caller-supplied ASINs.
 *
 * The result is interpolated into a provider URL, so this must run before any
 * use: an entry containing '&' would otherwise append provider parameters and
 * change what we pay per row. Stripping non-alphanumerics makes such a value
 * longer than 10 characters, so the regex rejects it outright rather than
 * truncating it into something that looks valid.
 */
export function sanitizeAsins(input: unknown, cap: number): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.replace(/[^A-Z0-9]/gi, '').toUpperCase())
        .filter((a) => ASIN_REGEX.test(a)),
    ),
  ).slice(0, cap);
}

export interface HydrateResult {
  /** Keyed by ASIN. Callers re-impose their own ordering. */
  rows: Map<string, HydratedRow>;
  /** Set when the provider failed; callers should surface a generic message. */
  failed?: boolean;
}

/**
 * Resolve display rows for a set of ASINs, cache first.
 *
 * Shared by /api/discovery/hydrate (the results grid) and
 * /api/discovery/variations (a row's sibling ASINs) so there is exactly one
 * place that decides what a Discovery row costs and how it is cached.
 *
 * Cost: cached rows are free; each miss is 2 provider tokens. `rating=1` is
 * required — without it the provider returns -1 for both the rating and the
 * review count, so those columns render empty. buybox/offers would take this
 * to 6 tokens and nothing displayed needs them.
 *
 * `admin` must be the service-role client: keepa_lens_metrics has RLS enabled
 * with no policies, and is shared with the Chrome extension.
 */
export async function hydrateAsins(
  admin: SupabaseClient,
  asins: string[],
): Promise<HydrateResult> {
  const rows = new Map<string, HydratedRow>();
  if (asins.length === 0) return { rows };

  const { data: cached } = await admin
    .from('keepa_lens_metrics')
    .select('asin, payload')
    .in('asin', asins)
    .gt('cache_until', new Date().toISOString());

  // Accept BOTH fetch depths: an extension-written 'full' row is strictly
  // better than the lean one we would fetch. Only the curve version must match.
  for (const row of cached ?? []) {
    const payload = (row as any).payload as DiscoveryCachePayload | undefined;
    if (payload?.curveVersion === CURVE_VERSION) {
      rows.set((row as any).asin, rowFromCachePayload((row as any).asin, payload));
    }
  }

  const misses = asins.filter((a) => !rows.has(a));
  if (misses.length === 0) return { rows };

  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return { rows, failed: true };

  const url =
    `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1` +
    `&asin=${misses.join(',')}&stats=180&history=1&aplus=1&rating=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (data?.error) {
    console.error('[discovery/hydrateAsins] provider error', data.error);
    return { rows, failed: true };
  }

  const cacheUntil = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  const upserts: any[] = [];

  for (const product of data?.products ?? []) {
    if (!product?.asin) continue;
    // Computed once and reused for both the response row and the cache
    // payload, so the scorer never runs twice per product.
    const lqsScore = computeLqsFromKeepaProduct(product)?.score ?? null;
    const { row, enriched } = buildFreshRow(product, lqsScore);
    if (!row.asin) continue;
    rows.set(row.asin, row);
    upserts.push({
      asin: row.asin,
      // Same shape the extension stores, plus Discovery's extra keys — a cache
      // hit has no raw product to recompute title/FBA/LQS from. The extension
      // reads named fields and ignores unknown ones, so this is safe for its
      // rows too.
      payload: withDiscoveryExtras(enriched, row),
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
    if (upsertError) console.error('[discovery/hydrateAsins] cache write failed', upsertError);
  }

  return { rows };
}
