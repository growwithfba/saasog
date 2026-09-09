import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { buildSelection } from './buildSelection';
import { getFilterDef } from './filterSchema';

describe('PRESETS', () => {
  it('has unique ids', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references filter ids that exist in the schema', () => {
    for (const preset of PRESETS) {
      for (const id of Object.keys(preset.filters)) {
        expect(getFilterDef(id), `preset "${preset.id}" uses unknown filter "${id}"`).toBeDefined();
      }
    }
  });

  it('every preset builds a valid Keepa selection', () => {
    for (const preset of PRESETS) {
      expect(() => buildSelection(preset.filters)).not.toThrow();
    }
  });

  it('encodes the course Winning Product Criteria exactly', () => {
    const winning = PRESETS.find((p) => p.id === 'winning-product-criteria')!;
    expect(winning.filters.price).toEqual({ min: 20, max: 70 });
    expect(winning.filters.bsr).toEqual({ min: 1, max: 50000 });
    expect(winning.filters.reviewCount).toEqual({ max: 1000 });
    expect(winning.filters.monthlyUnits).toEqual({ min: 100 });
    expect(winning.derived).toMatchObject({ revenueMin: 5000, revenueMax: 15000 });
  });

  it('every preset that filters on revenue also sets a price range', () => {
    // The implied-bounds trick needs a price ceiling to derive a unit floor.
    for (const preset of PRESETS) {
      if (preset.derived?.revenueMin !== undefined) {
        expect(preset.filters.price, `preset "${preset.id}"`).toBeDefined();
      }
    }
  });
});
