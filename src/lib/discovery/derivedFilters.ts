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
  /** Dollars per month. */
  revenueMin?: number;
  revenueMax?: number;
  /** Dollars. Needed for the implied-bounds trick to be useful. */
  priceMin?: number;
  priceMax?: number;
  salesToReviewsMin?: number;
  salesToReviewsMax?: number;
  excludeBrands?: string[];
  excludeTitleKeywords?: string[];
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

export function applyDerivedFilters(rows: HydratedRow[], input: DerivedFilterInput): HydratedRow[] {
  const excludeBrands = (input.excludeBrands ?? []).map((b) => b.toLowerCase());
  const excludeKeywords = (input.excludeTitleKeywords ?? []).map((k) => k.toLowerCase());

  return rows.filter((row) => {
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
