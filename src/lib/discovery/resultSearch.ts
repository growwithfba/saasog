import type { HydratedRow } from './types';

/**
 * The instant search over already-loaded results.
 *
 * Purely client-side and deliberately dumb: it narrows the rows in memory and
 * never re-queries Keepa. That is the whole point — the grid above costs tokens
 * and a round trip, this costs neither, so a user can sift 250 rows freely.
 *
 * Matches ASIN, brand and title, because those are the three things someone
 * types when they are looking for something they already saw.
 */
export function searchRows(rows: HydratedRow[], query: string): HydratedRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  // Every term must appear somewhere, so "steel bottle" finds a stainless
  // steel water bottle regardless of the order the words fall in the title.
  const terms = needle.split(/\s+/);
  return rows.filter((row) => {
    const haystack = [row.asin, row.brand, row.title]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
