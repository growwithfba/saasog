import { bsrToMonthlyUnitsByCategory } from '@/lib/extension/bsrSalesCurve';
import type { DerivedFilterInput } from './derivedFilters';

/**
 * Translate a revenue window into a sales-rank window the provider can filter.
 *
 * WHY THIS EXISTS: revenue is not a provider field, so it used to be applied
 * only to rows we had already paid to fetch. With a $5k–$50k window that meant
 * hydrating 50 rows and rendering 1 — the filter worked, but the page looked
 * broken.
 *
 * WHY THIS IS SAFE, where the earlier attempt was not: the first idea was to
 * bound the provider's `monthlySold` field, which is Amazon's rounded "X+
 * bought" bucket — a different measurement from the curve-derived units we
 * display, so a bound from one applied to the other could silently exclude
 * matching products. This instead inverts OUR OWN curve, the same function
 * that produces the number on screen, and bounds the rank it consumes.
 *
 * It is still only a PRE-FILTER. `applyDerivedFilters` remains the authority on
 * what the user sees; this exists to stop us paying to hydrate rows that
 * cannot possibly qualify.
 */

/**
 * Displayed units come from the 30-day MEDIAN rank; the provider filters on the
 * 30-day MEAN. The window is widened by this factor in each direction to absorb
 * the difference.
 *
 * MEASURED, not guessed — 99 products in Arts/Crafts/Sewing, ratio of provider
 * mean to our median:
 *
 *   p50 1.02 · p05 0.90 · p95 1.31 · within 1.5x: 96% · within 2x: 97%
 *
 * 1.5x therefore covers 96% of products while still excluding the high-revenue
 * end that the ceiling is meant to remove. Going to 2x buys one extra point of
 * coverage and gives back most of the narrowing, because the remaining tail is
 * pathological (listings with sparse rank history reach 100x+) rather than
 * gradual — no achievable factor covers it.
 *
 * The residual risk is real and worth stating: a product whose mean and median
 * rank diverge by more than 1.5x can be excluded before we ever fetch it, so
 * the client-side filter never gets to judge it. That is the price of making
 * revenue usable at all — without this, a $5k-$50k window rendered 1 row of 50.
 */
export const RANK_WIDENING = 1.5;

/** Ranks below this are not meaningfully filterable. */
const MIN_RANK = 1;
const MAX_RANK = 3_000_000;

/**
 * Smallest rank whose curve value is at or below `units`.
 *
 * The curve is monotonically decreasing in rank (verified across bands), so a
 * binary search inverts it exactly. It is called with the same category input
 * the display path uses, so band-aware multipliers apply identically.
 */
export function rankForUnits(units: number, category: string | null): number | null {
  if (!Number.isFinite(units) || units <= 0) return null;
  let lo = MIN_RANK;
  let hi = MAX_RANK;
  let answer: number | null = null;
  for (let i = 0; i < 40 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const value = bsrToMonthlyUnitsByCategory(mid, category);
    if (value === null) {
      hi = mid - 1;
      continue;
    }
    if (value <= units) {
      answer = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return answer;
}

export interface RankBounds {
  min?: number;
  max?: number;
}

export interface RevenueBoundsInput {
  derived: DerivedFilterInput;
  /** Display-unit price window, needed to turn revenue into units. */
  priceMin?: number;
  priceMax?: number;
  /**
   * Category names to consider. The multiplier is category- and band-aware, so
   * the widest window across every candidate (plus the uncalibrated base curve)
   * is used — that keeps the result a superset whichever category a given
   * product actually resolves to.
   */
  categories?: (string | null)[];
}

/**
 * Rank window implied by a revenue window, or an empty object when one cannot
 * be derived — with no price ceiling there is nothing to divide revenue by, so
 * no bound is pushed and behaviour falls back to client-side filtering.
 */
export function revenueToRankBounds(input: RevenueBoundsInput): RankBounds {
  const { revenueMin, revenueMax } = input.derived;
  const priceMin = input.priceMin;
  const priceMax = input.priceMax;

  // Cheapest possible unit count that could still clear the revenue floor, and
  // the dearest that could still sit under the ceiling. Both deliberately
  // generous so the window never excludes a qualifying product.
  const unitsMin =
    revenueMin !== undefined && priceMax ? revenueMin / priceMax : undefined;
  const unitsMax =
    revenueMax !== undefined && priceMin ? revenueMax / priceMin : undefined;

  if (unitsMin === undefined && unitsMax === undefined) return {};

  const candidates: (string | null)[] =
    input.categories && input.categories.length > 0
      ? [...input.categories, null] // null = base curve, no multiplier
      : [null];

  const bounds: RankBounds = {};

  // More units means a better (lower) rank, so the unit ceiling drives the rank
  // floor and vice versa.
  if (unitsMax !== undefined) {
    const ranks = candidates
      .map((c) => rankForUnits(unitsMax, c))
      .filter((r): r is number => r !== null);
    if (ranks.length > 0) {
      bounds.min = Math.max(MIN_RANK, Math.floor(Math.min(...ranks) / RANK_WIDENING));
    }
  }

  if (unitsMin !== undefined) {
    const ranks = candidates
      .map((c) => rankForUnits(unitsMin, c))
      .filter((r): r is number => r !== null);
    if (ranks.length > 0) {
      bounds.max = Math.min(MAX_RANK, Math.ceil(Math.max(...ranks) * RANK_WIDENING));
    }
  }

  // A window that inverted itself would exclude everything — drop it rather
  // than send a filter that can only return nothing.
  if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
    return {};
  }

  return bounds;
}
