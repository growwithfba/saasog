import { describe, expect, it } from 'vitest';
import type { HydratedRow } from './types';
import { searchRows } from './resultSearch';

function row(overrides: Partial<HydratedRow> = {}): HydratedRow {
  return {
    asin: 'B0TESTASIN', title: null, brand: null, imageUrl: null, category: null,
    bsr: null, price: null, rating: null, reviews: null, monthlyUnits: null,
    monthlyRevenue: null, parentUnits: null, parentRevenue: null, fulfillment: null,
    lqs: null, sizeTier: null, weightLb: null, dimensions: null,
    listingAgeMonths: null, variationCount: null, imageCount: null,
    salesToReviews: null, ...overrides,
  };
}

const ROWS = [
  row({ asin: 'B0AAAAAAA1', brand: 'GlikCeil', title: 'Wood Spaghetti Pasta Measurer Tool' }),
  row({ asin: 'B0BBBBBBB2', brand: 'YAMHOHO', title: 'Stainless Steel Water Bottle' }),
  row({ asin: 'B0CCCCCCC3', brand: null, title: null }),
];

describe('searchRows', () => {
  it('returns every row for an empty or whitespace query', () => {
    expect(searchRows(ROWS, '')).toEqual(ROWS);
    expect(searchRows(ROWS, '   ')).toEqual(ROWS);
  });

  it('matches on ASIN, brand and title alike', () => {
    expect(searchRows(ROWS, 'B0BBBBBBB2').map((r) => r.asin)).toEqual(['B0BBBBBBB2']);
    expect(searchRows(ROWS, 'glikceil').map((r) => r.asin)).toEqual(['B0AAAAAAA1']);
    expect(searchRows(ROWS, 'spaghetti').map((r) => r.asin)).toEqual(['B0AAAAAAA1']);
  });

  it('ignores case', () => {
    expect(searchRows(ROWS, 'STAINLESS')).toHaveLength(1);
  });

  it('requires every term but not their order', () => {
    expect(searchRows(ROWS, 'steel bottle').map((r) => r.asin)).toEqual(['B0BBBBBBB2']);
    expect(searchRows(ROWS, 'bottle steel').map((r) => r.asin)).toEqual(['B0BBBBBBB2']);
    expect(searchRows(ROWS, 'steel spaghetti')).toHaveLength(0);
  });

  it('does not throw on a row with no brand or title', () => {
    // Lean hydration can leave both null; a naive join would crash here.
    expect(searchRows(ROWS, 'B0CCCCCCC3').map((r) => r.asin)).toEqual(['B0CCCCCCC3']);
  });
});
