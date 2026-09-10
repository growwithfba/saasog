import { describe, expect, it } from 'vitest';
import { applyDerivedFilters, impliedUnitBounds } from './derivedFilters';
import type { HydratedRow } from './types';

const row = (over: Partial<HydratedRow>): HydratedRow => ({
  asin: 'A', title: 'Bead Loom Kit', brand: 'Darice', imageUrl: null, category: null,
  bsr: 1000, price: 30, rating: 4.2, reviews: 100, monthlyUnits: 200,
  monthlyRevenue: 6000, parentUnits: null, parentRevenue: null, isFba: true, lqs: null,
  ...over,
});

describe('impliedUnitBounds', () => {
  it('derives a unit floor from a revenue floor and the max price', () => {
    // $5000/mo at no more than $70 each requires at least ceil(5000/70) = 72 units.
    expect(impliedUnitBounds({ revenueMin: 5000, priceMax: 70 }).min).toBe(72);
  });

  it('derives a unit ceiling from a revenue ceiling and the min price', () => {
    expect(impliedUnitBounds({ revenueMax: 15000, priceMin: 20 }).max).toBe(750);
  });

  it('returns no floor when there is no price ceiling to divide by', () => {
    expect(impliedUnitBounds({ revenueMin: 5000 }).min).toBeUndefined();
  });

  it('never excludes a row that passes the exact revenue test', () => {
    // Property check: for every (price, units) inside the price window,
    // passing exact revenue implies passing the implied unit bound.
    const input = { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 };
    const bounds = impliedUnitBounds(input);
    for (let price = 20; price <= 70; price += 1) {
      for (let units = 1; units <= 1200; units += 1) {
        const revenue = price * units;
        const passesExact = revenue >= 5000 && revenue <= 15000;
        if (!passesExact) continue;
        expect(units).toBeGreaterThanOrEqual(bounds.min!);
        expect(units).toBeLessThanOrEqual(bounds.max!);
      }
    }
  });
});

describe('applyDerivedFilters', () => {
  it('keeps rows inside the revenue window', () => {
    const rows = [row({ asin: 'IN', monthlyRevenue: 8000 }), row({ asin: 'OUT', monthlyRevenue: 500 })];
    const kept = applyDerivedFilters(rows, { revenueMin: 5000, revenueMax: 15000 });
    expect(kept.map((r) => r.asin)).toEqual(['IN']);
  });

  it('excludes brands case-insensitively', () => {
    const rows = [row({ asin: 'KEEP', brand: 'Other' }), row({ asin: 'DROP', brand: 'Darice' })];
    expect(applyDerivedFilters(rows, { excludeBrands: ['darice'] }).map((r) => r.asin)).toEqual(['KEEP']);
  });

  it('excludes title keywords case-insensitively', () => {
    const rows = [row({ asin: 'KEEP', title: 'Pottery Wheel' }), row({ asin: 'DROP', title: 'Bead Loom Kit' })];
    expect(applyDerivedFilters(rows, { excludeTitleKeywords: ['BEAD'] }).map((r) => r.asin)).toEqual(['KEEP']);
  });

  it('filters on sales-to-reviews ratio', () => {
    const rows = [
      row({ asin: 'HIGH', monthlyUnits: 200, reviews: 10 }), // ratio 20
      row({ asin: 'LOW', monthlyUnits: 10, reviews: 100 }),  // ratio 0.1
    ];
    expect(applyDerivedFilters(rows, { salesToReviewsMin: 5 }).map((r) => r.asin)).toEqual(['HIGH']);
  });

  it('keeps rows with missing data rather than silently dropping them', () => {
    // Consistent with the no-band-aids rule: absent data is not a failed test.
    const rows = [row({ asin: 'NULLREV', monthlyRevenue: null })];
    expect(applyDerivedFilters(rows, { revenueMin: 5000 }).map((r) => r.asin)).toEqual(['NULLREV']);
  });

  it('returns every row when no derived filter is set', () => {
    const rows = [row({ asin: 'A' }), row({ asin: 'B' })];
    expect(applyDerivedFilters(rows, {})).toHaveLength(2);
  });
});
