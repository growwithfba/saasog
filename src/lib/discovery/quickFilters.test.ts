import { describe, expect, it } from 'vitest';
import type { HydratedRow } from './types';
import {
  QUICK_FILTERS,
  applyQuickFilter,
  quickFilterCounts,
  WEAK_LISTING_MAX_LQS,
  LOW_REVIEW_MAX,
} from './quickFilters';

function row(overrides: Partial<HydratedRow> = {}): HydratedRow {
  return {
    asin: 'B0TESTASIN',
    title: 'Test Product',
    brand: null,
    imageUrl: null,
    category: null,
    bsr: null,
    price: null,
    rating: null,
    reviews: null,
    monthlyUnits: null,
    monthlyRevenue: null,
    parentUnits: null,
    parentRevenue: null,
    fulfillment: null,
    lqs: null,
    sizeTier: null,
    weightLb: null,
    dimensions: null,
    listingAgeMonths: null,
    variationCount: null,
    imageCount: null,
    salesToReviews: null,
    ...overrides,
  };
}

const NONE: ReadonlySet<string> = new Set();

describe('quickFilters — a null field never counts as a match', () => {
  // Lean hydration leaves plenty of fields null. Treating null as 0 would put
  // every unhydrated row into Weak Listing and Under-200-Reviews at once.
  it.each(QUICK_FILTERS.filter((f) => f.id !== 'all' && f.id !== 'inFunnel'))(
    '$id excludes an all-null row',
    (def) => {
      expect(def.test(row(), NONE)).toBe(false);
    },
  );
});

describe('quickFilters — boundaries match the presets they came from', () => {
  it('treats the low-review ceiling as exclusive', () => {
    expect(applyQuickFilter([row({ reviews: LOW_REVIEW_MAX - 1 })], 'lowReviews', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ reviews: LOW_REVIEW_MAX })], 'lowReviews', NONE)).toHaveLength(0);
  });

  it('includes both ends of the 3-4 star band', () => {
    expect(applyQuickFilter([row({ rating: 3 })], 'weakRatings', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ rating: 4 })], 'weakRatings', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ rating: 4.1 })], 'weakRatings', NONE)).toHaveLength(0);
    expect(applyQuickFilter([row({ rating: 2.9 })], 'weakRatings', NONE)).toHaveLength(0);
  });

  it('counts a genuine zero LQS as weak, not as missing', () => {
    expect(applyQuickFilter([row({ lqs: 0 })], 'weakListing', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ lqs: WEAK_LISTING_MAX_LQS })], 'weakListing', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ lqs: WEAK_LISTING_MAX_LQS + 1 })], 'weakListing', NONE)).toHaveLength(0);
  });

  it('treats a single-variation listing and a variation-less one alike', () => {
    expect(applyQuickFilter([row({ variationCount: 1 })], 'singleVariation', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ variationCount: 0 })], 'singleVariation', NONE)).toHaveLength(1);
    expect(applyQuickFilter([row({ variationCount: 2 })], 'singleVariation', NONE)).toHaveLength(0);
  });
});

describe('quickFilters — funnel membership', () => {
  it('selects only rows in the saved set', () => {
    const rows = [row({ asin: 'B0SAVED111' }), row({ asin: 'B0UNSAVED1' })];
    const saved = new Set(['B0SAVED111']);
    expect(applyQuickFilter(rows, 'inFunnel', saved).map((r) => r.asin)).toEqual(['B0SAVED111']);
  });
});

describe('quickFilters — all', () => {
  it('returns the rows untouched', () => {
    const rows = [row({ asin: 'B0AAAAAAA1' }), row({ asin: 'B0BBBBBBB2' })];
    expect(applyQuickFilter(rows, 'all', NONE)).toEqual(rows);
  });

  it('counts every chip against the same row set', () => {
    const rows = [
      row({ asin: 'B0AAAAAAA1', reviews: 10, rating: 3.5, lqs: 2, variationCount: 1 }),
      row({ asin: 'B0BBBBBBB2', reviews: 900, rating: 4.8, lqs: 9, variationCount: 6 }),
    ];
    const counts = quickFilterCounts(rows, new Set(['B0AAAAAAA1']));
    expect(counts.all).toBe(2);
    expect(counts.inFunnel).toBe(1);
    expect(counts.lowReviews).toBe(1);
    expect(counts.weakRatings).toBe(1);
    expect(counts.singleVariation).toBe(1);
    expect(counts.weakListing).toBe(1);
  });
});
