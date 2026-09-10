import { getFilterDef } from './filterSchema';
import type { DiscoveryFilters, RangeValue } from './types';

/**
 * Thrown when a filter id is not in FILTER_DEFS.
 *
 * This is the single most important guard in Discovery. The product-database
 * provider SILENTLY IGNORES unknown `selection` keys — it returns HTTP 200,
 * charges the full token cost, and hands back the entire 12.7M-product
 * catalog. A typo would therefore look exactly like a successful,
 * correctly-filtered search.
 */
export class UnknownFilterError extends Error {
  constructor(id: string) {
    super(
      `Unknown Discovery filter "${id}". Filter ids must exist in FILTER_DEFS ` +
        `(src/lib/discovery/filterSchema.ts). The provider silently ignores ` +
        `unknown keys and would return the entire catalog.`,
    );
    this.name = 'UnknownFilterError';
  }
}

export interface SelectionOptions {
  page?: number;
  perPage?: number;
  /**
   * [filterId, direction] — the filter id, not the provider key. Typed as
   * `unknown` because it arrives straight off a request body: a caller can
   * send anything (a number, a 1-element array, a bad direction string),
   * and destructuring a non-iterable throws before buildSelection gets a
   * chance to validate it. See the runtime check below.
   */
  sort?: unknown;
}

/** Provider limits, from the probe. */
const MIN_PER_PAGE = 50;
const MAX_DEPTH = 10000;

const isRange = (v: unknown): v is RangeValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function buildSelection(
  filters: DiscoveryFilters,
  opts: SelectionOptions = {},
): Record<string, unknown> {
  const { page = 0, perPage = MIN_PER_PAGE, sort } = opts;

  if (perPage < MIN_PER_PAGE) {
    throw new Error(`perPage must be at least ${MIN_PER_PAGE} (provider minimum), got ${perPage}`);
  }
  if (page * perPage >= MAX_DEPTH) {
    throw new Error(
      `page x perPage must be below ${MAX_DEPTH} (provider ceiling); got ${page} x ${perPage}`,
    );
  }

  const selection: Record<string, unknown> = {
    productType: [0, 1],
    // One row per product family. Without this the provider returns every
    // child variation separately, so a page of 25 could be ten colours of the
    // same paint. Verified against the live API: with it, 20 results had 20
    // distinct parentAsins; without it, adjacent siblings filled the list.
    // Costs nothing — the query is flat-rate either way.
    singleVariation: true,
    perPage,
    page,
  };

  for (const [id, value] of Object.entries(filters)) {
    const def = getFilterDef(id);
    if (!def) throw new UnknownFilterError(id);

    if (value === undefined || value === null) continue;

    if (def.kind === 'range') {
      if (!isRange(value)) continue;
      const convert = def.toKeepa ?? ((n: number) => n);
      // invertRange: a MAX display value becomes a MIN provider value, because
      // the conversion is order-reversing (age in months -> timestamp).
      const lowKey = def.invertRange ? 'max' : 'min';
      const highKey = def.invertRange ? 'min' : 'max';

      const low = value[lowKey as keyof RangeValue];
      const high = value[highKey as keyof RangeValue];

      if (typeof low === 'number') selection[`${def.keepaKey}_gte`] = convert(low);
      if (typeof high === 'number') selection[`${def.keepaKey}_lte`] = convert(high);
      continue;
    }

    if (def.kind === 'category') {
      if (Array.isArray(value) && value.length > 0) {
        selection[def.keepaKey] = value.map((v) => Number(v));
      }
      continue;
    }

    if (def.kind === 'boolean') {
      // Only a true boolean filters. `false` means "don't care", not
      // "must be false" — emitting it would silently exclude every FBA row.
      if (value === true) selection[def.keepaKey] = true;
      continue;
    }

    if (def.kind === 'textList') {
      if (Array.isArray(value) && value.length > 0) selection[def.keepaKey] = value;
      continue;
    }

    if (def.kind === 'text') {
      if (typeof value === 'string' && value.trim().length > 0) {
        selection[def.keepaKey] = value.trim();
      }
    }
  }

  if (sort !== undefined) {
    // Validate BEFORE destructuring: a non-iterable `sort` (e.g. a number)
    // throws inside `const [sortId, direction] = sort` and that throw
    // surfaces as an uncaught 500, not the 400 callers should get for a
    // bad request body.
    if (
      !Array.isArray(sort) ||
      sort.length !== 2 ||
      typeof sort[0] !== 'string' ||
      (sort[1] !== 'asc' && sort[1] !== 'desc')
    ) {
      throw new Error('Invalid sort: expected [filterId, "asc" | "desc"].');
    }
    const [sortId, direction] = sort as [string, 'asc' | 'desc'];
    const sortDef = getFilterDef(sortId);
    if (!sortDef) throw new UnknownFilterError(sortId);
    selection.sort = [[sortDef.keepaKey, direction]];
  }

  return selection;
}
