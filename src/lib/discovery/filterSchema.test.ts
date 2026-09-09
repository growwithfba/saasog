import { describe, expect, it } from 'vitest';
import {
  FILTER_DEFS,
  getFilterDef,
  monthsAgoToKeepaMinutes,
} from './filterSchema';

describe('FILTER_DEFS', () => {
  it('has unique ids', () => {
    const ids = FILTER_DEFS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses imageCount, never the silently-ignored imagesCount', () => {
    const keys = FILTER_DEFS.map((f) => f.keepaKey);
    expect(keys).toContain('imageCount');
    expect(keys).not.toContain('imagesCount');
  });

  it('does not expose filters Keepa cannot run', () => {
    const keys = FILTER_DEFS.map((f) => f.keepaKey);
    for (const banned of ['returnRate', 'revenue', 'sellerCountry', 'categories_exclude']) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe('unit conversion', () => {
  it('converts dollars to cents', () => {
    expect(getFilterDef('price')!.toKeepa!(20)).toBe(2000);
  });

  it('round-trips dollars', () => {
    const def = getFilterDef('price')!;
    expect(def.fromKeepa!(def.toKeepa!(20))).toBe(20);
  });

  it('converts star rating to Keepa tenths', () => {
    expect(getFilterDef('rating')!.toKeepa!(4.5)).toBe(45);
  });

  it('round-trips star rating', () => {
    const def = getFilterDef('rating')!;
    expect(def.fromKeepa!(def.toKeepa!(4.5))).toBe(4.5);
  });

  it('converts pounds to grams', () => {
    expect(getFilterDef('weight')!.toKeepa!(1)).toBe(454);
  });

  it('converts inches to millimetres', () => {
    expect(getFilterDef('longestSide')!.toKeepa!(10)).toBe(254);
  });
});

describe('monthsAgoToKeepaMinutes', () => {
  const NOW = Date.UTC(2026, 8, 9);

  it('is monotonically decreasing as months increase', () => {
    expect(monthsAgoToKeepaMinutes(6, NOW)).toBeGreaterThan(
      monthsAgoToKeepaMinutes(24, NOW),
    );
  });

  it('produces a positive Keepa-epoch minute count for recent dates', () => {
    expect(monthsAgoToKeepaMinutes(1, NOW)).toBeGreaterThan(0);
  });
});

describe('listing age inverts its range', () => {
  it('is marked invertRange, because a MAX age is a MIN timestamp', () => {
    expect(getFilterDef('listingAge')!.invertRange).toBe(true);
  });
});
