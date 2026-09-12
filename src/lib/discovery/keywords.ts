import type { HydratedRow } from './types';

/**
 * Keyword frequency over the loaded result titles.
 *
 * The tokenizer is ported from the Lens drawer so the same search produces the
 * same chips on both surfaces. Counts are DOCUMENT frequency — how many
 * listings contain the word, not how many times it occurs — because the chip
 * drives "keep these rows / drop those rows", and a word repeated twice in one
 * title must not imply two listings.
 */

/**
 * English common words plus a couple that appear in nearly every Amazon title
 * without being informative. Deliberately lean: Amazon-specific filler like
 * "pack" or "set" stays in, because that is exactly the kind of modifier a
 * seller wants to spot in a market.
 */
const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'with', 'in', 'on',
  'at', 'to', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'you', 'your', 'we', 'our', 'they',
  'their', 'his', 'her', 'him', 'them', 'what', 'which', 'who', 'when',
  'where', 'why', 'how', 'so', 'if', 'than', 'then', 'into', 'over',
  'no', 'not', 'all', 'any', 'each', 'every', 'some', 'most', 'more',
  'such', 'only', 'just', 'also', 'too', 'very', 'much',
  'amazon', 'com',
]);

/**
 * Quantity and unit words. A number followed by one of these is emitted as a
 * single token ("3 pack", "12 oz") so pack sizes surface as one chip rather
 * than splitting into a meaningless bare number.
 */
const UNIT_TOKENS = new Set<string>([
  'pack', 'packs', 'set', 'sets', 'count', 'ct', 'pc', 'pcs', 'piece', 'pieces',
  'oz', 'ounce', 'ounces', 'fl', 'lb', 'lbs', 'pound', 'pounds',
  'kg', 'g', 'gram', 'grams', 'mg',
  'ml', 'cl', 'l', 'liter', 'liters', 'litre',
  'gal', 'gallon', 'gallons',
  'ft', 'feet', 'foot', 'inch', 'inches', 'in', 'cm', 'mm', 'm', 'yd', 'yard',
  'qt', 'quart', 'pt', 'pint',
  'tier', 'tiers', 'shelf', 'shelves', 'drawer', 'drawers',
  'cup', 'cups', 'bottle', 'bottles', 'tablet', 'tablets', 'capsule', 'capsules',
  'serving', 'servings', 'day', 'days', 'month', 'months', 'year', 'years',
  'minute', 'minutes', 'hour', 'hours',
]);

export interface KeywordCount {
  word: string;
  /** Number of listings whose title contains this token. */
  count: number;
}

/**
 * Splits a title into normalised tokens.
 *
 * Numbers are kept so quantity patterns are visible. A hyphenated run stays
 * whole, so "2-pack" is one token rather than a stray "2".
 */
export function tokenizeTitle(title: string, includeFillers = false): string[] {
  const out: string[] = [];
  const matches = title.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  for (let i = 0; i < matches.length; i++) {
    const token = matches[i];
    const isNumber = /^[0-9]+$/.test(token);
    // A single letter is noise; a single digit is a pack size.
    if (token.length < 2 && !isNumber) continue;
    if (!includeFillers && STOPWORDS.has(token)) continue;
    out.push(token);
    const next = matches[i + 1];
    if (isNumber && next && UNIT_TOKENS.has(next)) out.push(`${token} ${next}`);
  }
  return out;
}

/** Frequency table over the given rows, most common first. */
export function keywordFrequency(rows: HydratedRow[], includeFillers = false): KeywordCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.title) continue;
    // Per-row Set: a title repeating a word must still count as one listing.
    for (const token of new Set(tokenizeTitle(row.title, includeFillers))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    // Alphabetical within a count, so the list is stable between renders
    // instead of reshuffling equal-frequency chips on every keystroke.
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** True when the title contains the keyword as a whole token. */
export function titleHasKeyword(title: string | null, keyword: string): boolean {
  if (!title) return false;
  // Fillers included: an excluded stopword must still be matchable.
  return tokenizeTitle(title, true).includes(keyword);
}

/**
 * Narrows rows by the chosen keywords.
 *
 * Included keywords are AND-ed: picking two means "listings that have both",
 * which is what makes successive picks feel like drilling in. Excluded
 * keywords drop a row if ANY of them appear.
 */
export function applyKeywordFilters(
  rows: HydratedRow[],
  included: readonly string[],
  excluded: readonly string[],
): HydratedRow[] {
  if (included.length === 0 && excluded.length === 0) return rows;
  return rows.filter((row) => {
    for (const word of excluded) if (titleHasKeyword(row.title, word)) return false;
    for (const word of included) if (!titleHasKeyword(row.title, word)) return false;
    return true;
  });
}
