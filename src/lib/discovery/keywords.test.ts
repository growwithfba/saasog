import { describe, expect, it } from 'vitest';
import type { HydratedRow } from './types';
import { applyKeywordFilters, keywordFrequency, titleHasKeyword, tokenizeTitle } from './keywords';

function row(title: string | null, asin = 'B0TESTASIN'): HydratedRow {
  return {
    asin, title, brand: null, imageUrl: null, category: null, bsr: null,
    price: null, rating: null, reviews: null, monthlyUnits: null,
    monthlyRevenue: null, parentUnits: null, parentRevenue: null,
    fulfillment: null, lqs: null, sizeTier: null, weightLb: null,
    dimensions: null, listingAgeMonths: null, variationCount: null,
    imageCount: null, salesToReviews: null,
  };
}

describe('tokenizeTitle', () => {
  it('drops stopwords unless fillers are requested', () => {
    expect(tokenizeTitle('Bottle for the Kitchen')).toEqual(['bottle', 'kitchen']);
    expect(tokenizeTitle('Bottle for the Kitchen', true)).toEqual(['bottle', 'for', 'the', 'kitchen']);
  });

  it('keeps a hyphenated run whole', () => {
    expect(tokenizeTitle('2-Pack Steel')).toEqual(['2-pack', 'steel']);
  });

  it('emits a number-and-unit pair as one extra token', () => {
    expect(tokenizeTitle('3 Pack Bottles')).toEqual(['3', '3 pack', 'pack', 'bottles']);
  });

  it('keeps a lone digit but drops a lone letter', () => {
    expect(tokenizeTitle('X 5 Tool')).toEqual(['5', 'tool']);
  });
});

describe('keywordFrequency', () => {
  it('counts listings, not occurrences', () => {
    // "pasta" twice in one title is still one listing.
    const freq = keywordFrequency([row('Pasta Pasta Tool'), row('Pasta Spoon')]);
    expect(freq.find((f) => f.word === 'pasta')?.count).toBe(2);
  });

  it('orders by count, then alphabetically for a stable list', () => {
    const freq = keywordFrequency([row('beta alpha'), row('beta')]);
    expect(freq.map((f) => f.word)).toEqual(['beta', 'alpha']);
  });

  it('skips rows with no title', () => {
    expect(keywordFrequency([row(null), row('Steel')])).toEqual([{ word: 'steel', count: 1 }]);
  });
});

describe('titleHasKeyword', () => {
  it('matches whole tokens, not substrings', () => {
    expect(titleHasKeyword('Steel Bottle', 'steel')).toBe(true);
    // "tee" must not match inside "steel" — that would hide unrelated rows.
    expect(titleHasKeyword('Steel Bottle', 'tee')).toBe(false);
  });

  it('still matches a stopword, so one can be excluded', () => {
    expect(titleHasKeyword('Bottle for Kitchen', 'for')).toBe(true);
  });

  it('is false for a null title', () => {
    expect(titleHasKeyword(null, 'steel')).toBe(false);
  });
});

describe('applyKeywordFilters', () => {
  const rows = [
    row('Stainless Steel Pasta Tool', 'B0AAAAAAA1'),
    row('Wood Pasta Measurer', 'B0BBBBBBB2'),
    row('Steel Kitchen Spoon', 'B0CCCCCCC3'),
  ];

  it('returns rows untouched when nothing is chosen', () => {
    expect(applyKeywordFilters(rows, [], [])).toEqual(rows);
  });

  it('ANDs included keywords', () => {
    expect(applyKeywordFilters(rows, ['steel'], []).map((r) => r.asin))
      .toEqual(['B0AAAAAAA1', 'B0CCCCCCC3']);
    expect(applyKeywordFilters(rows, ['steel', 'pasta'], []).map((r) => r.asin))
      .toEqual(['B0AAAAAAA1']);
  });

  it('drops a row matching any excluded keyword', () => {
    expect(applyKeywordFilters(rows, [], ['steel']).map((r) => r.asin)).toEqual(['B0BBBBBBB2']);
  });

  it('applies exclusion even when the word is also included', () => {
    // Exclusion wins; otherwise a contradictory pair would silently keep rows.
    expect(applyKeywordFilters(rows, ['pasta'], ['pasta'])).toHaveLength(0);
  });
});
