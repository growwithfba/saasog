import { buildEnrichedRow, deriveFulfillment } from '@/lib/keepa/enrichedRow';
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
 *   monthlyRevenue <- EnrichedRow.monthlyRevenue (persisted)
 *   parentUnits    <- EnrichedRow.parentMonthlyUnits (persisted)
 *   parentRevenue  <- EnrichedRow.parentMonthlyRevenue (persisted)
 *   title          <- product.title directly (NOT in EnrichedRow) -> discoveryTitle
 *   isFba          <- deriveFulfillment(product) directly (NOT in EnrichedRow) -> discoveryIsFba
 *   lqs            <- computeLqsFromKeepaProduct(product) directly (NOT in EnrichedRow) -> discoveryLqs
 */
export interface DiscoveryCacheExtras {
  discoveryLqs?: number | null;
  discoveryTitle?: string | null;
  discoveryIsFba?: boolean | null;
}

export type DiscoveryCachePayload = EnrichedRow & DiscoveryCacheExtras;

function enrichedToHydrated(
  asin: string,
  enriched: EnrichedRow,
  extras: { title: string | null; isFba: boolean | null; lqs: number | null },
): HydratedRow {
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
    monthlyRevenue: enriched.monthlyRevenue,
    parentUnits: enriched.parentMonthlyUnits,
    parentRevenue: enriched.parentMonthlyRevenue,
    isFba: extras.isFba,
    lqs: extras.lqs,
  };
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
  const isFba = fulfillment === null ? null : fulfillment === 'FBA';
  const asin = typeof product?.asin === 'string' ? product.asin : '';
  return { row: enrichedToHydrated(asin, enriched, { title, isFba, lqs }), enriched };
}

/**
 * Rebuild the HydratedRow shown on a cache hit, from the persisted payload
 * alone (no raw Keepa `product` is available at this point).
 */
export function rowFromCachePayload(asin: string, payload: DiscoveryCachePayload): HydratedRow {
  return enrichedToHydrated(asin, payload, {
    title: payload.discoveryTitle ?? null,
    isFba: payload.discoveryIsFba ?? null,
    lqs: payload.discoveryLqs ?? null,
  });
}

/**
 * Layer Discovery's cache-hit-only extras onto an EnrichedRow before it is
 * upserted into the shared cache table.
 */
export function withDiscoveryExtras(enriched: EnrichedRow, row: HydratedRow): DiscoveryCachePayload {
  return { ...enriched, discoveryLqs: row.lqs, discoveryTitle: row.title, discoveryIsFba: row.isFba };
}
