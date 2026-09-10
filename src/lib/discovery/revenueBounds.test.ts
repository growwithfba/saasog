import { describe, expect, it } from 'vitest';
import { rankForUnits, revenueToRankBounds, RANK_WIDENING, type UnitsCurve } from './revenueBounds';

const CAT = 'Arts, Crafts & Sewing';

/**
 * Stand-in for the real sales-rank curve. Monotonically decreasing like the
 * real one, with a per-category multiplier so the widest-window behaviour is
 * exercised. The real curve lazily require()s a table the test runner cannot
 * resolve; the arithmetic under test here is the inversion, not the curve.
 */
const curve: UnitsCurve = (bsr, category) => {
  if (bsr < 1) return null;
  const base = Math.round(1_000_000 / bsr);
  return category === 'Pet Supplies' ? base * 2 : base;
};

describe('rankForUnits', () => {
  it('inverts the curve — more units means a better (lower) rank', () => {
    const forMany = rankForUnits(2500, CAT, curve)!;
    const forFew = rankForUnits(125, CAT, curve)!;
    expect(forMany).toBeLessThan(forFew);
  });

  it('returns null for nonsense unit counts rather than a bogus rank', () => {
    expect(rankForUnits(0, CAT, curve)).toBeNull();
    expect(rankForUnits(-5, CAT, curve)).toBeNull();
    expect(rankForUnits(NaN, CAT, curve)).toBeNull();
  });
});

describe('revenueToRankBounds', () => {
  it('derives nothing without a price window — revenue alone cannot imply units', () => {
    expect(revenueToRankBounds({ derived: { revenueMin: 5000 }, curve })).toEqual({});
  });

  it('derives nothing when no revenue filter is set', () => {
    expect(revenueToRankBounds({ derived: {}, priceMin: 20, priceMax: 40, curve })).toEqual({});
  });

  it('produces a rank window from a revenue window', () => {
    const b = revenueToRankBounds({
      derived: { revenueMin: 5000, revenueMax: 50000 },
      priceMin: 20,
      priceMax: 40,
      categories: [CAT], curve,
    });
    expect(b.min).toBeGreaterThan(0);
    expect(b.max).toBeGreaterThan(b.min!);
  });

  it('widens rather than narrows — the bound must never hide a qualifying row', () => {
    const opts = { derived: { revenueMin: 5000, revenueMax: 50000 }, priceMin: 20, priceMax: 40, categories: [CAT], curve };
    const b = revenueToRankBounds(opts);
    // The unwidened window sits strictly inside the one we actually send.
    const rawMin = rankForUnits(50000 / 20, CAT, curve)!;
    const rawMax = rankForUnits(5000 / 40, CAT, curve)!;
    expect(b.min!).toBeLessThanOrEqual(rawMin);
    expect(b.max!).toBeGreaterThanOrEqual(rawMax);
    expect(RANK_WIDENING).toBeGreaterThan(1);
  });

  it('takes the widest window across candidate categories', () => {
    const single = revenueToRankBounds({
      derived: { revenueMin: 5000, revenueMax: 50000 }, priceMin: 20, priceMax: 40, categories: [CAT], curve,
    });
    const multi = revenueToRankBounds({
      derived: { revenueMin: 5000, revenueMax: 50000 }, priceMin: 20, priceMax: 40,
      categories: [CAT, 'Pet Supplies'], curve,
    });
    expect(multi.min!).toBeLessThanOrEqual(single.min!);
    expect(multi.max!).toBeGreaterThanOrEqual(single.max!);
  });

  it('drops an inverted window instead of sending one that matches nothing', () => {
    // revenueMax below revenueMin cannot describe any product.
    const b = revenueToRankBounds({
      derived: { revenueMin: 500000, revenueMax: 1000 }, priceMin: 20, priceMax: 40, categories: [CAT], curve,
    });
    expect(b).toEqual({});
  });
});
