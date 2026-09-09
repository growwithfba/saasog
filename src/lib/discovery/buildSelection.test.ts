import { describe, expect, it } from 'vitest';
import { buildSelection, UnknownFilterError } from './buildSelection';

describe('buildSelection — unknown keys', () => {
  it('throws on a filter id that is not in the schema', () => {
    expect(() => buildSelection({ notARealFilter: { min: 1 } })).toThrow(UnknownFilterError);
  });

  it('throws on the imagesCount typo rather than passing it to Keepa', () => {
    // Keepa would accept this silently and return the entire catalog.
    expect(() => buildSelection({ imagesCount: { min: 5 } })).toThrow(UnknownFilterError);
  });

  it('names the offending filter in the error message', () => {
    expect(() => buildSelection({ bogus: true })).toThrow(/bogus/);
  });

  it('throws on an unknown filter id even when its value is undefined', () => {
    expect(() => buildSelection({ totallyBogusKey: undefined as any })).toThrow(UnknownFilterError);
  });

  it('throws on an unknown filter id even when its value is null', () => {
    expect(() => buildSelection({ totallyBogusKey: null as any })).toThrow(UnknownFilterError);
  });
});

describe('buildSelection — range conversion', () => {
  it('emits _gte/_lte using the Keepa key, not the filter id', () => {
    const sel = buildSelection({ bsr: { min: 1, max: 50000 } });
    expect(sel).toMatchObject({ current_SALES_gte: 1, current_SALES_lte: 50000 });
    expect(sel).not.toHaveProperty('bsr_gte');
  });

  it('converts dollars to cents', () => {
    expect(buildSelection({ price: { min: 20, max: 70 } })).toMatchObject({
      current_NEW_gte: 2000,
      current_NEW_lte: 7000,
    });
  });

  it('converts star rating to tenths', () => {
    expect(buildSelection({ rating: { min: 3, max: 4 } })).toMatchObject({
      current_RATING_gte: 30,
      current_RATING_lte: 40,
    });
  });

  it('omits an absent bound instead of emitting undefined', () => {
    const sel = buildSelection({ reviewCount: { max: 1000 } });
    expect(sel).toHaveProperty('current_COUNT_REVIEWS_lte', 1000);
    expect(sel).not.toHaveProperty('current_COUNT_REVIEWS_gte');
  });

  it('inverts listing age: a MAX age becomes a MIN timestamp', () => {
    const sel = buildSelection({ listingAge: { max: 12 } }) as Record<string, number>;
    expect(sel).toHaveProperty('listedSince_gte');
    expect(sel).not.toHaveProperty('listedSince_lte');
  });

  it('inverts listing age with both bounds: gte is older than lte', () => {
    const sel = buildSelection({ listingAge: { min: 3, max: 12 } }) as Record<string, number>;
    expect(sel.listedSince_gte).toBeLessThan(sel.listedSince_lte);
  });
});

describe('buildSelection — non-range kinds', () => {
  it('passes text straight through', () => {
    expect(buildSelection({ titleKeywords: 'bead loom' })).toMatchObject({ title: 'bead loom' });
  });

  it('passes a text list through as an array', () => {
    expect(buildSelection({ brand: ['darice'] })).toMatchObject({ brand: ['darice'] });
  });

  it('passes booleans through', () => {
    expect(buildSelection({ fbaOnly: true })).toMatchObject({ buyBoxIsFBA: true });
  });

  it('omits a false boolean entirely — false must not filter', () => {
    expect(buildSelection({ fbaOnly: false })).not.toHaveProperty('buyBoxIsFBA');
  });

  it('maps category ids to numbers under the provider key', () => {
    expect(buildSelection({ category: ['12345', '6789'] })).toMatchObject({
      categories_include: [12345, 6789],
    });
  });
});

describe('buildSelection — paging', () => {
  it('defaults to perPage 50 page 0', () => {
    expect(buildSelection({})).toMatchObject({ perPage: 50, page: 0 });
  });

  it('rejects perPage below Keepa minimum of 50', () => {
    expect(() => buildSelection({}, { perPage: 25 })).toThrow(/perPage/);
  });

  it('rejects page x perPage at or beyond the 10000 ceiling', () => {
    expect(() => buildSelection({}, { perPage: 50, page: 200 })).toThrow(/10000/);
  });

  it('allows the last legal page', () => {
    expect(buildSelection({}, { perPage: 50, page: 199 })).toMatchObject({ page: 199 });
  });

  it('emits sort in Keepa tuple form using the Keepa key', () => {
    expect(buildSelection({}, { sort: ['bsr', 'asc'] })).toMatchObject({
      sort: [['current_SALES', 'asc']],
    });
  });

  it('throws when sorting by an unknown filter id', () => {
    expect(() => buildSelection({}, { sort: ['nope', 'asc'] })).toThrow(UnknownFilterError);
  });
});
