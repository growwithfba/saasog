import type { HydratedRow } from './types';

/**
 * Filters the data provider cannot run natively. Revenue is the important
 * one: there is no revenue field, but revenue = price x units and BOTH are
 * filterable, so a revenue window plus a price window implies a unit window
 * we CAN push server-side. The implied window is deliberately wider than the
 * true result set — it is a superset, never a filter that hides valid
 * products.
 */
export interface DerivedFilterInput {
  /** Dollars per month, tested against the whole product family. */
  revenueMin?: number;
  revenueMax?: number;
  /** Dollars per month, tested against this listing alone. */
  asinRevenueMin?: number;
  asinRevenueMax?: number;
  /** Units per month, tested against the whole product family. */
  parentUnitsMin?: number;
  parentUnitsMax?: number;
  /** Dollars. Needed for the implied-bounds trick to be useful. */
  priceMin?: number;
  priceMax?: number;
  salesToReviewsMin?: number;
  salesToReviewsMax?: number;
  excludeBrands?: string[];
  excludeTitleKeywords?: string[];
  /**
   * Amazon size tiers to keep. Empty or absent means no size filter.
   *
   * Client-side because the provider has no size-tier field — the probe found
   * only raw packageLength/Width/Height in millimetres. A tier is a function of
   * dimensions AND weight together, and selecting several tiers is an OR the
   * provider's selection JSON cannot express, so the honest place to test it is
   * here, against the tier we already compute for the Shipping Size column.
   */
  sizeTiers?: string[];
}

/**
 * NOT CURRENTLY WIRED, deliberately.
 *
 * These bounds would be pushed to the provider's `monthlySold` field, which is
 * Amazon's rounded "X+ bought in past month" bucket. Our exact revenue test runs
 * against BSR-curve-derived units instead (see enrichedRow.ts `unitsSource`).
 * Those are different measurements, so a bound derived from one and applied to
 * the other can silently EXCLUDE products that genuinely match the revenue
 * filter — the one failure mode this whole design is meant to prevent.
 *
 * Re-wire only once the divergence between the bucket field and the curve has
 * been measured, and only with a widening margin justified by that measurement.
 */
export function impliedUnitBounds(input: DerivedFilterInput): { min?: number; max?: number } {
  const bounds: { min?: number; max?: number } = {};

  // Cheapest possible price => most units needed to clear the revenue floor.
  // We divide by the MAX price to get the LOWEST unit count that could
  // possibly reach revenueMin, so we never exclude a valid row.
  if (input.revenueMin !== undefined && input.priceMax) {
    bounds.min = Math.ceil(input.revenueMin / input.priceMax);
  }
  if (input.revenueMax !== undefined && input.priceMin) {
    bounds.max = Math.floor(input.revenueMax / input.priceMin);
  }
  return bounds;
}

export function applyDerivedFilters<T extends HydratedRow>(rows: T[], input: DerivedFilterInput): T[] {
  const excludeBrands = (input.excludeBrands ?? []).map((b) => b.toLowerCase());
  const excludeKeywords = (input.excludeTitleKeywords ?? []).map((k) => k.toLowerCase());

  const sizeTiers = new Set(input.sizeTiers ?? []);

  return rows.filter((row) => {
    // A row with no tier has no dimensions or weight to judge, so it fails an
    // explicit size test rather than slipping through it.
    if (sizeTiers.size > 0 && (row.sizeTier === null || !sizeTiers.has(row.sizeTier))) return false;

    // Missing data is not a failed test — show what the data source returned
    // rather than silently dropping rows for being incomplete.
    // Filter the SAME figure the table shows. parentRevenue is the BSR-curve
    // measurement for the whole product family; monthlyRevenue is that divided
    // by min(variationCount, 5), which is an estimate. Testing one while
    // displaying the other would silently reject rows for a number the user
    // never saw. Falls back for rows with no parent figure at all.
    const productRevenue = row.parentRevenue ?? row.monthlyRevenue;
    if (productRevenue !== null) {
      if (input.revenueMin !== undefined && productRevenue < input.revenueMin) return false;
      if (input.revenueMax !== undefined && productRevenue > input.revenueMax) return false;
    }

    // The ASIN-level figure is the parent split across the variation family, so
    // it is an estimate. Kept as its own filter rather than folded into the
    // one above, because bounding an estimate and bounding a measurement are
    // different intents and the user should be able to say which they mean.
    if (row.monthlyRevenue !== null) {
      if (input.asinRevenueMin !== undefined && row.monthlyRevenue < input.asinRevenueMin) return false;
      if (input.asinRevenueMax !== undefined && row.monthlyRevenue > input.asinRevenueMax) return false;
    }

    const productUnits = row.parentUnits ?? row.monthlyUnits;
    if (productUnits !== null) {
      if (input.parentUnitsMin !== undefined && productUnits < input.parentUnitsMin) return false;
      if (input.parentUnitsMax !== undefined && productUnits > input.parentUnitsMax) return false;
    }

    if (row.monthlyUnits !== null && row.reviews !== null && row.reviews > 0) {
      const ratio = row.monthlyUnits / row.reviews;
      if (input.salesToReviewsMin !== undefined && ratio < input.salesToReviewsMin) return false;
      if (input.salesToReviewsMax !== undefined && ratio > input.salesToReviewsMax) return false;
    }

    if (excludeBrands.length && row.brand && excludeBrands.includes(row.brand.toLowerCase())) return false;

    if (excludeKeywords.length && row.title) {
      const title = row.title.toLowerCase();
      if (excludeKeywords.some((k) => title.includes(k))) return false;
    }

    return true;
  });
}

/**
 * Filter ids that describe ONE variation rather than the whole product family.
 *
 * Discovery de-duplicates results to one row per family, so these are the
 * filters where "which specific ASIN matched?" is a real question — a family
 * can contain a $9 sample and a $60 bulk pack, and only some of its children
 * will satisfy a price or review bound. Setting any of them is what makes the
 * per-ASIN breakdown worth showing (and worth paying to fetch).
 *
 * Category, listing age and the shipping filters are excluded deliberately:
 * they are effectively constant across a family, so a breakdown would only
 * ever restate the parent row.
 */
export const ASIN_LEVEL_FILTER_IDS = [
  'price',
  'reviewCount',
  'rating',
  'monthlyUnits',
  'bsr',
  'imageCount',
] as const;

/** True when the user has set at least one filter that can differ per variation. */
export function hasAsinLevelFilters(
  filters: Record<string, unknown>,
  derived: DerivedFilterInput,
): boolean {
  const anyFilter = ASIN_LEVEL_FILTER_IDS.some((id) => filters[id] !== undefined);
  const anyDerived =
    derived.salesToReviewsMin !== undefined ||
    derived.salesToReviewsMax !== undefined ||
    (derived.excludeTitleKeywords?.length ?? 0) > 0;
  return anyFilter || anyDerived;
}

/**
 * Which of a family's variations satisfy the filters the user actually set.
 *
 * Reuses applyDerivedFilters for the derived side, then re-applies the
 * schema-backed ASIN-level bounds — the provider applied those when choosing
 * the family, but never per sibling, so an unmatched sibling would otherwise
 * appear to qualify.
 */
export function matchingVariations<T extends HydratedRow>(
  rows: T[],
  filters: Record<string, unknown>,
  derived: DerivedFilterInput,
): T[] {
  const withinRange = (value: number | null, bound: unknown): boolean => {
    // Missing data keeps the row — same rule as applyDerivedFilters.
    if (value === null || typeof bound !== 'object' || bound === null) return true;
    const { min, max } = bound as { min?: number; max?: number };
    if (typeof min === 'number' && value < min) return false;
    if (typeof max === 'number' && value > max) return false;
    return true;
  };

  return applyDerivedFilters(rows, derived).filter(
    (row) =>
      withinRange(row.price, filters.price) &&
      withinRange(row.reviews, filters.reviewCount) &&
      withinRange(row.rating, filters.rating) &&
      withinRange(row.monthlyUnits, filters.monthlyUnits) &&
      withinRange(row.bsr, filters.bsr),
  );
}

/** True when any filter is set that can only be judged after hydration. */
export function hasDerivedFilters(derived: DerivedFilterInput): boolean {
  return (
    derived.revenueMin !== undefined ||
    derived.revenueMax !== undefined ||
    derived.salesToReviewsMin !== undefined ||
    derived.salesToReviewsMax !== undefined ||
    (derived.excludeBrands?.length ?? 0) > 0 ||
    (derived.excludeTitleKeywords?.length ?? 0) > 0
  );
}

/**
 * Narrow rows by fulfillment channel.
 *
 * Most selections are pushed to the provider by buildSelection. The two that
 * cannot be — AMZ combined with exactly one of FBA/FBM — reach here instead,
 * because expressing half of an OR server-side would drop rows the user asked
 * for. Rows whose channel is unknown are kept, consistent with every other
 * filter here.
 */
export function applyFulfillmentFilter<T extends { fulfillment: 'AMZ' | 'FBA' | 'FBM' | null }>(
  rows: T[],
  selected: string[] | undefined,
): T[] {
  if (!selected || selected.length === 0 || selected.length === 3) return rows;
  return rows.filter((r) => r.fulfillment === null || selected.includes(r.fulfillment));
}

/**
 * The size tiers a user can filter by, in Amazon's own order.
 *
 * Mirrors `deriveSizeTier` exactly — if that gains a tier, this must too, or
 * the new tier becomes unfilterable while still showing in the column.
 */
export const SIZE_TIERS = [
  'Small Standard',
  'Large Standard',
  'Large Bulky',
  'Extra-Large (0-50 lb)',
  'Extra-Large (50-70 lb)',
  'Extra-Large (70-150 lb)',
  'Extra-Large (150+ lb)',
] as const;
