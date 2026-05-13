/**
 * Keepa-everywhere hydration — single shared module every research +
 * vetting write path calls. Replaces SERP-DOM-sourced competitor fields
 * with values pulled directly from the Keepa /product endpoint.
 *
 * SERP DOM keeps ONE legitimate role: passing the per-ASIN `sponsored`
 * boolean into this function via `opts.sponsoredAsins`. Everything else
 * — title, brand, image, price, reviews, rating, BSR, FBA fee, weight,
 * dims, listing age, variations, fulfillment, LQS — comes from Keepa.
 *
 * When Keepa returns null/-1 for a field, the CanonicalCompetitor
 * reflects null. Display layer shows "N/A". Never falls back to SERP DOM.
 *
 * Locked plan: project_keepa_everywhere_sweep.md
 * Research note: docs/keepa-search-sponsored-research-2026-05-13.md
 */

import { withTracking, estimateKeepaCostUsd } from '@/utils/observability';
import {
  buildEnrichedRow,
  buildEmptyEnrichedRow,
  deriveFulfillment,
  deriveSizeTier,
  formatDimensions,
  KEEPA_FETCH_PARAMS,
  type EnrichedRow,
} from './enrichedRow';
import { computeLqsFromKeepaProduct, type LqsResult } from './listingQualityScore';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_DOMAIN_US = 1;
const MAX_ASINS_PER_REQUEST = 100;

/**
 * Canonical competitor record — the shape stored in
 * `submissions.submission_data.productData.competitors[]` and the
 * shape the /vetting/[asin] matrix expects.
 *
 * Field names mirror the prior `scrapedRowToCompetitor` output so the
 * read side doesn't need to change. Includes the `productWeight` +
 * `variations` aliases the matrix reads (Phase 5.4-O).
 */
export interface CanonicalCompetitor {
  asin: string;
  title: string | null;
  brand: string | null;
  image: string | null;

  // Pricing (USD, not cents)
  price: number | null;
  monthlyRevenue: number | null;
  monthlySales: number | null;
  parentRevenue: number | null;
  parentSales: number | null;

  // Reviews
  rating: number | null;
  reviews: number | null;

  // BSR (snapshot only — full smoothed data lives in keepaResults)
  bsr: number | null;

  // Listing meta
  dateFirstAvailable: string | null;
  fulfillment: 'AMZ' | 'FBA' | 'FBM' | null;
  weight: number | null;        // lb
  productWeight: number | null; // alias for matrix column key
  sizeTier: string | null;
  variationCount: number | null;
  variations: number | null;    // alias for matrix column key
  fbaFee: number | null;        // USD
  dimensions: string | null;    // "13.0 × 13.0 × 2.9 in"
  seller: string | null;
  sellerCountry: string | null;
  lqs: number | null;

  // Sponsored — passes through from SERP DOM via opts.sponsoredAsins.
  // Keepa cannot tell us this; sponsored placements are personalized
  // and dynamic. Null = unknown (extension didn't supply).
  sponsored: boolean | null;

  // Origin markers (preserved across refresh — set by caller)
  __lens_origin?: boolean;
  __lens_new?: boolean;
  __lens_added_at?: string;

  // Internal flags for diagnostics
  __keepa_hydrated_at: string;
  __keepa_data_quality: 'full' | 'limited';
}

export interface HydrateCompetitorsOptions {
  /** Pass-through sponsored flag map. Set by the extension SERP scrape. */
  sponsoredAsins?: Set<string> | Map<string, boolean>;
  /** User ID for observability tracking. */
  userId?: string | null;
}

/**
 * Convert cents → dollars with proper null handling.
 */
function centsToDollars(cents: number | null | undefined): number | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return null;
  return Math.round(cents) / 100;
}

/**
 * Pick the seller for display from the offers list.
 * Returns null if Keepa didn't return offers data — we don't fabricate
 * a value from anywhere else.
 */
function pickSeller(product: any): string | null {
  const offers = Array.isArray(product?.offers) ? product.offers : [];
  if (offers.length === 0) return null;
  // Prefer Amazon if it's an offer (most authoritative seller).
  const amazon = offers.find((o: any) => o?.isAmazon === true);
  if (amazon && typeof amazon.sellerId === 'string') return amazon.sellerId;
  // Otherwise the first FBA offer (likely Buy Box winner).
  const fba = offers.find((o: any) => o?.isFBA === true);
  if (fba && typeof fba.sellerId === 'string') return fba.sellerId;
  // Otherwise the first offer.
  const first = offers[0];
  if (first && typeof first.sellerId === 'string') return first.sellerId;
  return null;
}

/**
 * Map a single Keepa product + EnrichedRow → CanonicalCompetitor.
 *
 * Exported so callers can also use it after their own Keepa fetch
 * (e.g. the refresh-market-data endpoint reuses an existing /product
 * response without re-fetching).
 */
export function mapKeepaProductToCompetitor(
  asin: string,
  product: any,
  enriched: EnrichedRow,
  opts: { sponsored: boolean | null } = { sponsored: null },
): CanonicalCompetitor {
  const lqs = product ? computeLqsFromKeepaProduct(product) : null;
  const sponsored = opts.sponsored;

  return {
    asin,
    title: typeof product?.title === 'string' ? product.title : null,
    brand: enriched.brand,
    image: enriched.imageUrl,

    price: centsToDollars(enriched.price),
    monthlyRevenue: centsToDollars(enriched.monthlyRevenue),
    monthlySales: enriched.monthlyUnits,
    parentRevenue: centsToDollars(enriched.parentMonthlyRevenue),
    parentSales: enriched.parentMonthlyUnits,

    rating: enriched.rating,
    reviews: enriched.reviews,

    bsr: enriched.bsr,

    dateFirstAvailable: enriched.listingCreatedAt,
    fulfillment: deriveFulfillment(product),
    weight: enriched.weightLb,
    productWeight: enriched.weightLb,
    sizeTier: deriveSizeTier(enriched.weightLb, enriched.dimensions),
    variationCount: enriched.variationCount,
    variations: enriched.variationCount,
    fbaFee: centsToDollars(product?.fbaFees?.pickAndPackFee ?? null),
    dimensions: formatDimensions(enriched.dimensions),
    // Seller name lookup via /seller endpoint deferred — store the ID
    // for now. The UI shows null gracefully.
    seller: pickSeller(product),
    sellerCountry: null,
    lqs: lqs?.score ?? null,

    sponsored,

    __keepa_hydrated_at: new Date().toISOString(),
    __keepa_data_quality: enriched.dataQuality,
  };
}

/**
 * Hydrate competitor records for a list of ASINs from Keepa.
 *
 * Batches up to 100 ASINs per Keepa /product call. Returns a Map keyed
 * by ASIN. ASINs Keepa couldn't return (e.g. invalid, deactivated)
 * appear in the map with `__keepa_data_quality: 'limited'` and null
 * fields — caller decides whether to keep or drop.
 */
export async function hydrateCompetitorsFromKeepa(
  asins: string[],
  opts: HydrateCompetitorsOptions = {},
): Promise<Map<string, CanonicalCompetitor>> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY is not configured');

  const cleaned = Array.from(new Set(asins.map((a) => a.toUpperCase()))).filter((a) =>
    /^[A-Z0-9]{10}$/.test(a),
  );

  const result = new Map<string, CanonicalCompetitor>();
  if (cleaned.length === 0) return result;

  const sponsoredLookup = (asin: string): boolean | null => {
    if (!opts.sponsoredAsins) return null;
    if (opts.sponsoredAsins instanceof Set) {
      return opts.sponsoredAsins.has(asin);
    }
    return opts.sponsoredAsins.get(asin) ?? null;
  };

  // Chunk into batches of 100 (Keepa's per-call cap).
  const chunks: string[][] = [];
  for (let i = 0; i < cleaned.length; i += MAX_ASINS_PER_REQUEST) {
    chunks.push(cleaned.slice(i, i + MAX_ASINS_PER_REQUEST));
  }

  for (const chunk of chunks) {
    await withTracking<void>(
      {
        userId: opts.userId ?? null,
        provider: 'keepa',
        operation: 'hydrate_competitors',
        model: 'keepa-product-v1',
        metadata: { asinCount: chunk.length },
        extractUsage: () => ({ costUsd: estimateKeepaCostUsd(chunk.length * 3) }),
      },
      async () => {
        const url =
          `${KEEPA_BASE_URL}/product` +
          `?key=${apiKey}` +
          `&domain=${KEEPA_DOMAIN_US}` +
          `&asin=${chunk.join(',')}` +
          `&${KEEPA_FETCH_PARAMS}`;

        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Keepa ${res.status}: ${text.slice(0, 200)}`);
        }
        const data: any = await res.json();
        const products: any[] = Array.isArray(data?.products) ? data.products : [];
        const byAsin = new Map<string, any>();
        for (const p of products) {
          if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);
        }

        // BSR-tracked-category resolution. Keepa's categoryTree[0] is
        // sometimes the marketplace-listing category rather than the
        // category whose BSR is actually returned (example caught
        // 2026-05-13: B0095UVKRI lists under "Health & Household" but
        // BSR is ranked under "Automotive"). The wrong category drives
        // the wrong BSR-curve multiplier, which produces wrong monthly
        // units / revenue estimates.
        //
        // When salesRankReference points to a catId NOT in categoryTree,
        // resolve the correct path via a single Keepa /category call (cheap
        // — one token regardless of how many catIds we batch).
        const catIdsToResolve = new Set<number>();
        const productBsrCatId = new Map<string, number>();
        for (const [asin, product] of byAsin) {
          const treeCatIds: number[] = (Array.isArray(product?.categoryTree) ? product.categoryTree : [])
            .map((c: any) => c?.catId)
            .filter((id: any) => typeof id === 'number');
          const bsrCatId =
            typeof product?.salesRankReference === 'number' && product.salesRankReference > 0
              ? product.salesRankReference
              : null;
          if (bsrCatId != null && !treeCatIds.includes(bsrCatId)) {
            catIdsToResolve.add(bsrCatId);
            productBsrCatId.set(asin, bsrCatId);
          }
        }

        const catPathByCatId = new Map<number, string[]>();
        if (catIdsToResolve.size > 0) {
          try {
            const catUrl =
              `${KEEPA_BASE_URL}/category` +
              `?key=${apiKey}` +
              `&domain=${KEEPA_DOMAIN_US}` +
              `&category=${Array.from(catIdsToResolve).join(',')}` +
              `&parents=1`;
            const catRes = await fetch(catUrl);
            if (catRes.ok) {
              const catData: any = await catRes.json();
              const cats = catData?.categories || {};
              for (const startId of catIdsToResolve) {
                const path: string[] = [];
                const visited = new Set<number>();
                let currentId: number | null = startId;
                while (currentId != null && !visited.has(currentId)) {
                  visited.add(currentId);
                  const node: any = cats[String(currentId)];
                  if (!node) break;
                  if (typeof node.name === 'string' && node.name) {
                    path.unshift(node.name);
                  }
                  currentId =
                    typeof node.parent === 'number' && node.parent !== 0
                      ? node.parent
                      : null;
                }
                if (path.length > 0) catPathByCatId.set(startId, path);
              }
            } else {
              console.warn(
                `Keepa /category returned ${catRes.status}; falling back to categoryTree paths`,
              );
            }
          } catch (err) {
            console.warn('Keepa /category resolution failed; falling back to categoryTree', err);
          }
        }

        for (const asin of chunk) {
          const product = byAsin.get(asin);
          const bsrCatId = productBsrCatId.get(asin);
          const bsrCategoryPath =
            bsrCatId != null ? (catPathByCatId.get(bsrCatId) ?? null) : null;
          const enriched = product
            ? buildEnrichedRow(product, { bsrCategoryPath })
            : buildEmptyEnrichedRow();
          const sponsored = sponsoredLookup(asin);
          result.set(asin, mapKeepaProductToCompetitor(asin, product, enriched, { sponsored }));
        }
      },
    );
  }

  return result;
}

/**
 * Single-ASIN convenience wrapper. Returns null on failure rather than
 * throwing — useful for add-asin paths where one bad ASIN shouldn't
 * fail the whole request.
 */
export async function hydrateSingleCompetitor(
  asin: string,
  opts: HydrateCompetitorsOptions = {},
): Promise<CanonicalCompetitor | null> {
  try {
    const result = await hydrateCompetitorsFromKeepa([asin], opts);
    return result.get(asin.toUpperCase()) ?? null;
  } catch (err) {
    console.error('hydrateSingleCompetitor failed', { asin, err });
    return null;
  }
}
