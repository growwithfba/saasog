import type { HydratedRow } from './types';

/**
 * The chip row above the results.
 *
 * Deliberately narrow: every predicate reads a field that exists at the lean
 * hydration depth Discovery already pays for (stats/history/aplus/rating), so
 * a chip never costs a token. Fulfillment-based chips are the notable absence
 * — `fulfillment` only arrives with `buybox=1&offers=20`, which would triple
 * the cost of every search.
 *
 * Thresholds are lifted from the presets rather than invented, so the chips
 * and the saved setups describe the same thing. See `presets.ts`.
 */

/** Listing Quality is scored out of 10. At or below this reads as beatable. */
export const WEAK_LISTING_MAX_LQS = 5;

/** From the Low-Review Openings preset — "room to rank". */
export const LOW_REVIEW_MAX = 200;

/** From the Weak Competition preset — the course's "bad ratings = gold". */
export const WEAK_RATING_MIN = 3;
export const WEAK_RATING_MAX = 4;

export type QuickFilterId =
  | 'all'
  | 'inFunnel'
  | 'lowReviews'
  | 'weakRatings'
  | 'singleVariation'
  | 'weakListing';

export interface QuickFilterDef {
  id: QuickFilterId;
  label: string;
  /** Shown on hover; says what the chip actually selects. */
  note: string;
  /** `saved` is the set of ASINs already in the user's funnel. */
  test: (row: HydratedRow, saved: ReadonlySet<string>) => boolean;
}

export const QUICK_FILTERS: QuickFilterDef[] = [
  {
    id: 'all',
    label: 'All',
    note: 'Every product this search returned',
    test: () => true,
  },
  {
    id: 'inFunnel',
    label: 'In Funnel',
    note: 'Products you have already saved to your funnel',
    test: (row, saved) => saved.has(row.asin),
  },
  {
    id: 'lowReviews',
    label: `Under ${LOW_REVIEW_MAX} Reviews`,
    note: `Fewer than ${LOW_REVIEW_MAX} reviews on the listing — room to rank`,
    test: (row) => row.reviews !== null && row.reviews < LOW_REVIEW_MAX,
  },
  {
    id: 'weakRatings',
    label: `Rated ${WEAK_RATING_MIN}–${WEAK_RATING_MAX} Stars`,
    note: 'Competitors customers are unhappy with',
    test: (row) =>
      row.rating !== null && row.rating >= WEAK_RATING_MIN && row.rating <= WEAK_RATING_MAX,
  },
  {
    id: 'singleVariation',
    label: 'Single Variation',
    note: 'No sprawling colour or size family behind the listing',
    test: (row) => row.variationCount !== null && row.variationCount <= 1,
  },
  {
    id: 'weakListing',
    label: 'Weak Listing',
    note: `Listing Quality of ${WEAK_LISTING_MAX_LQS} or lower out of 10 — beatable on presentation`,
    test: (row) => row.lqs !== null && row.lqs <= WEAK_LISTING_MAX_LQS,
  },
];

export function getQuickFilter(id: QuickFilterId): QuickFilterDef {
  const def = QUICK_FILTERS.find((f) => f.id === id);
  // The id is a closed union, so a miss means the registry lost an entry.
  if (!def) throw new Error(`Unknown quick filter: ${id}`);
  return def;
}

/** Applies one chip. `all` is the identity, not a special case at the call site. */
export function applyQuickFilter(
  rows: HydratedRow[],
  id: QuickFilterId,
  saved: ReadonlySet<string>,
): HydratedRow[] {
  if (id === 'all') return rows;
  const { test } = getQuickFilter(id);
  return rows.filter((row) => test(row, saved));
}

/** Row count per chip, for the badge beside each label. */
export function quickFilterCounts(
  rows: HydratedRow[],
  saved: ReadonlySet<string>,
): Record<QuickFilterId, number> {
  const counts = {} as Record<QuickFilterId, number>;
  for (const def of QUICK_FILTERS) {
    counts[def.id] = def.id === 'all' ? rows.length : rows.filter((r) => def.test(r, saved)).length;
  }
  return counts;
}
