import { buildEnrichedRow, deriveFulfillment, deriveSizeTier, formatDimensions } from '@/lib/keepa/enrichedRow';
import type { EnrichedRow } from '@/lib/keepa/enrichedRow';
import type { HydratedRow } from './types';

/**
 * Extra keys Discovery layers onto the shared `keepa_lens_metrics` cache
 * payload, alongside the plain EnrichedRow fields. They exist because these
 * HydratedRow fields are computed from the raw Keepa `product` object (only
 * available on a fresh fetch), NOT from EnrichedRow itself — so without
 * persisting them here they are silently lost on every cache hit. This is
 * the same bug class first found (and fixed) for `discoveryLqs`; `title`
 * and `isFba` had the same defect and are fixed the same way here.
 *
 * Every field on HydratedRow was re-audited against this class of bug:
 *   asin           <- the cache key itself, never lost.
 *   brand          <- EnrichedRow.brand (persisted)
 *   imageUrl       <- EnrichedRow.imageUrl (persisted)
 *   category       <- EnrichedRow.rootCategory (persisted)
 *   bsr            <- EnrichedRow.bsr (persisted)
 *   price          <- EnrichedRow.price (persisted, cents -> dollars)
 *   rating         <- EnrichedRow.rating (persisted)
 *   reviews        <- EnrichedRow.reviews (persisted)
 *   monthlyUnits   <- EnrichedRow.monthlyUnits (persisted)
 *   monthlyRevenue <- EnrichedRow.monthlyRevenue (persisted, cents -> dollars)
 *   parentUnits    <- EnrichedRow.parentMonthlyUnits (persisted)
 *   parentRevenue  <- EnrichedRow.parentMonthlyRevenue (persisted, cents -> dollars)
 *   title          <- product.title directly (NOT in EnrichedRow) -> discoveryTitle
 *   isFba          <- deriveFulfillment(product) directly (NOT in EnrichedRow) -> discoveryIsFba
 *   lqs            <- computeLqsFromKeepaProduct(product) directly (NOT in EnrichedRow) -> discoveryLqs
 */
export interface DiscoveryCacheExtras {
  discoveryLqs?: number | null;
  discoveryTitle?: string | null;
  discoveryFulfillment?: 'AMZ' | 'FBA' | 'FBM' | null;
  /**
   * Image count is read off the raw Keepa product's imagesCSV, which a cache
   * hit does not have — so like title/isFba/lqs it must be persisted or the
   * column empties out on the second view of a row.
   */
  discoveryImageCount?: number | null;
}

export type DiscoveryCachePayload = EnrichedRow & DiscoveryCacheExtras;

function enrichedToHydrated(
  asin: string,
  enriched: EnrichedRow,
  extras: {
    title: string | null;
    fulfillment: 'AMZ' | 'FBA' | 'FBM' | null;
    lqs: number | null;
    imageCount: number | null;
  },
): HydratedRow {
  const weightLb = enriched.weightLb;
  const reviews = enriched.reviews;
  const units = enriched.monthlyUnits;
  return {
    asin,
    title: extras.title,
    brand: enriched.brand,
    imageUrl: enriched.imageUrl,
    category: enriched.rootCategory,
    bsr: enriched.bsr,
    // EnrichedRow.price is in CENTS; HydratedRow is in display units.
    price: enriched.price === null ? null : enriched.price / 100,
    rating: enriched.rating,
    reviews: enriched.reviews,
    monthlyUnits: enriched.monthlyUnits,
    // EnrichedRow revenue is monthlyUnits x avgPriceCents — CENTS, like price.
    monthlyRevenue: enriched.monthlyRevenue === null ? null : enriched.monthlyRevenue / 100,
    parentUnits: enriched.parentMonthlyUnits,
    parentRevenue:
      enriched.parentMonthlyRevenue === null ? null : enriched.parentMonthlyRevenue / 100,
    fulfillment: extras.fulfillment,
    lqs: extras.lqs,
    sizeTier: deriveSizeTier(weightLb, enriched.dimensions),
    weightLb,
    dimensions: formatDimensions(enriched.dimensions),
    listingAgeMonths: monthsSince(enriched.listingCreatedAt),
    variationCount: enriched.variationCount,
    imageCount: extras.imageCount,
    // Units per review. Reviews of 0 would divide to Infinity, so it stays
    // null — "unknown" rather than "infinitely good".
    salesToReviews:
      units !== null && reviews !== null && reviews > 0
        ? Math.round((units / reviews) * 100) / 100
        : null,
  };
}

/** Whole months between an ISO date and now; null when the date is unknown. */
function monthsSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const months = (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44);
  return months < 0 ? null : Math.round(months);
}

/**
 * Build the HydratedRow (+ the EnrichedRow to persist) for a freshly-fetched
 * Keepa product. `lqs` is passed in rather than recomputed here so the
 * caller can compute it once and reuse it for the cache payload.
 */
export function buildFreshRow(
  product: any,
  lqs: number | null,
): { row: HydratedRow; enriched: EnrichedRow } {
  const enriched = buildEnrichedRow(product);
  const title = typeof product?.title === 'string' ? product.title : null;
  const fulfillment = deriveFulfillment(product);
  const asin = typeof product?.asin === 'string' ? product.asin : '';
  const imagesCsv = typeof product?.imagesCSV === 'string' ? product.imagesCSV : '';
  const imageCount = imagesCsv ? imagesCsv.split(',').filter(Boolean).length : null;
  return {
    row: enrichedToHydrated(asin, enriched, { title, fulfillment, lqs, imageCount }),
    enriched,
  };
}

/**
 * Rebuild the HydratedRow shown on a cache hit, from the persisted payload
 * alone (no raw Keepa `product` is available at this point).
 */
export function rowFromCachePayload(asin: string, payload: DiscoveryCachePayload): HydratedRow {
  return enrichedToHydrated(asin, payload, {
    title: payload.discoveryTitle ?? null,
    fulfillment: payload.discoveryFulfillment ?? null,
    lqs: payload.discoveryLqs ?? null,
    imageCount: payload.discoveryImageCount ?? null,
  });
}

/**
 * Layer Discovery's cache-hit-only extras onto an EnrichedRow before it is
 * upserted into the shared cache table.
 */
export function withDiscoveryExtras(enriched: EnrichedRow, row: HydratedRow): DiscoveryCachePayload {
  return {
    ...enriched,
    discoveryLqs: row.lqs,
    discoveryTitle: row.title,
    discoveryFulfillment: row.fulfillment,
    discoveryImageCount: row.imageCount,
  };
}
