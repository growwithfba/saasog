import type { DiscoveryFilters, RangeValue } from './types';
import type { DerivedFilterInput } from './derivedFilters';

/**
 * One-click ways to tighten a search that returned more than can be reviewed.
 *
 * Each option knows how to make its own filter stricter, so a user can keep
 * clicking until the match count drops into range instead of guessing which
 * number to type. Options are offered only where they would actually change
 * something, and ordered by how much they typically cut — an unset filter is
 * a bigger lever than one that is merely wide.
 *
 * Every rule is idempotent in the sense that matters: applying it always
 * produces a strictly tighter filter, so repeated clicks converge rather than
 * oscillating between two states.
 */

export interface NarrowOption {
  id: string;
  /** Button text, e.g. "Narrow BSR". */
  label: string;
  /** What it will do this click, in the user's terms. */
  detail: string;
  apply: (state: NarrowState) => NarrowState;
}

export interface NarrowState {
  filters: DiscoveryFilters;
  derived: DerivedFilterInput;
}

const asRange = (v: unknown): RangeValue | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as RangeValue) : undefined;

const fmt = (n: number) => n.toLocaleString('en-US');
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Pull a range's max toward its min by a quarter of the span. */
function tightenMax(range: RangeValue, floor: number): number {
  const min = range.min ?? floor;
  const max = range.max ?? min * 4;
  return Math.max(min + 1, Math.round(max - (max - min) * 0.35));
}

/** Push a range's min up toward its max by a quarter of the span. */
function tightenMin(range: RangeValue, ceiling: number): number {
  const min = range.min ?? 0;
  const max = range.max ?? ceiling;
  return Math.min(max - 1, Math.round(min + (max - min) * 0.35));
}

export function buildNarrowOptions(state: NarrowState): NarrowOption[] {
  const { filters, derived } = state;
  const options: NarrowOption[] = [];

  const bsr = asRange(filters.bsr);
  const price = asRange(filters.price);
  const reviews = asRange(filters.reviewCount);
  const units = asRange(filters.monthlyUnits);
  const variations = asRange(filters.variationCount);

  // --- Unset filters first: adding one cuts far more than tightening one ---

  // No category option here: a search cannot run without one, so it can never
  // be the thing making a result set too wide.

  if (!price) {
    options.push({
      id: 'price',
      label: 'Add a price range',
      detail: 'Start at $20–$70',
      apply: (s) => ({ ...s, filters: { ...s.filters, price: { min: 20, max: 70 } } }),
    });
  }

  if (!reviews) {
    options.push({
      id: 'reviews',
      label: 'Cap reviews',
      detail: 'Under 1,000 keeps you out of markets already owned',
      apply: (s) => ({ ...s, filters: { ...s.filters, reviewCount: { max: 1000 } } }),
    });
  }

  if (!bsr) {
    options.push({
      id: 'bsr',
      label: 'Add a BSR range',
      detail: 'Under 50,000 means proven sales volume',
      apply: (s) => ({ ...s, filters: { ...s.filters, bsr: { min: 1, max: 50000 } } }),
    });
  }

  // --- Then tighten what is already set ---

  if (bsr && (bsr.max ?? 0) > 1) {
    const next = tightenMax(bsr, 1);
    options.push({
      id: 'bsr-tighten',
      label: 'Narrow BSR',
      detail: `Top ${fmt(next)} instead of ${fmt(bsr.max ?? 0)}`,
      apply: (s) => ({ ...s, filters: { ...s.filters, bsr: { ...bsr, max: next } } }),
    });
  }

  if (derived.revenueMin !== undefined || derived.revenueMax !== undefined) {
    const min = derived.revenueMin ?? 0;
    const max = derived.revenueMax ?? min * 4;
    const nextMax = Math.max(min + 1, Math.round(max - (max - min) * 0.35));
    options.push({
      id: 'revenue',
      label: 'Narrow revenue',
      detail: `${money(min)}–${money(nextMax)} instead of ${money(min)}–${money(max)}`,
      apply: (s) => ({ ...s, derived: { ...s.derived, revenueMin: min, revenueMax: nextMax } }),
    });
  } else {
    options.push({
      id: 'revenue-add',
      label: 'Add a revenue range',
      detail: 'Start at $5,000–$15,000 a month',
      apply: (s) => ({ ...s, derived: { ...s.derived, revenueMin: 5000, revenueMax: 15000 } }),
    });
  }

  if (price && (price.min !== undefined || price.max !== undefined)) {
    const next = tightenMax(price, 1);
    if (next > (price.min ?? 1)) {
      const revenueSet = derived.revenueMin !== undefined || derived.revenueMax !== undefined;
      const option: NarrowOption = {
        id: 'price-tighten',
        label: 'Narrow price',
        detail: revenueSet
          ? `${money(price.min ?? 0)}–${money(next)} — the most effective way to sharpen a revenue filter`
          : `${money(price.min ?? 0)}–${money(next)} instead of ${money(price.min ?? 0)}–${money(price.max ?? 0)}`,
        apply: (s) => ({ ...s, filters: { ...s.filters, price: { ...price, max: next } } }),
      };
      // Revenue is price x units. A wide price range means the unit bound has
      // to assume the cheapest price, so it admits products that are far over
      // the revenue ceiling. Tightening price is what collapses that — it
      // matters more here than any other filter, so it leads.
      if (revenueSet) options.unshift(option);
      else options.push(option);
    }
  }

  if (reviews && (reviews.max ?? 0) > 1) {
    const next = tightenMax(reviews, 0);
    options.push({
      id: 'reviews-tighten',
      label: 'Narrow reviews',
      detail: `Under ${fmt(next)} instead of ${fmt(reviews.max ?? 0)}`,
      apply: (s) => ({ ...s, filters: { ...s.filters, reviewCount: { ...reviews, max: next } } }),
    });
  }

  if (units) {
    const next = tightenMin(units, 5000);
    options.push({
      id: 'units-tighten',
      label: 'Narrow monthly units',
      detail: `At least ${fmt(next)} instead of ${fmt(units.min ?? 0)}`,
      apply: (s) => ({ ...s, filters: { ...s.filters, monthlyUnits: { ...units, min: next } } }),
    });
  } else {
    options.push({
      id: 'units-add',
      label: 'Add monthly units',
      detail: 'At least 100 a month means real demand',
      apply: (s) => ({ ...s, filters: { ...s.filters, monthlyUnits: { min: 100 } } }),
    });
  }

  if (!variations) {
    options.push({
      id: 'variations-add',
      label: 'Limit variations',
      detail: 'Fewer than 5 keeps you away from sprawling listings',
      apply: (s) => ({ ...s, filters: { ...s.filters, variationCount: { max: 5 } } }),
    });
  } else if ((variations.max ?? 0) > 1) {
    const next = Math.max(1, Math.round((variations.max ?? 5) * 0.6));
    options.push({
      id: 'variations-tighten',
      label: 'Narrow variations',
      detail: `Under ${fmt(next)} instead of ${fmt(variations.max ?? 0)}`,
      apply: (s) => ({ ...s, filters: { ...s.filters, variationCount: { ...variations, max: next } } }),
    });
  }

  return options;
}
