import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_DAILY_BUDGET,
  ROW_COST,
  SEARCH_BASE_COST,
  budgetState,
  canAfford,
  hydrateCost,
  isBudgetExempt,
  rowsAffordable,
  searchCost,
} from './budget';

describe('searchCost', () => {
  it('matches the probe: 11 base, one more per hundred ASINs listed', () => {
    expect(searchCost(0)).toBe(11);
    expect(searchCost(50)).toBe(11);
    expect(searchCost(250)).toBe(13);
    expect(searchCost(1000)).toBe(20);
    expect(searchCost(10000)).toBe(110);
  });
});

describe('hydrateCost / rowsAffordable', () => {
  it('charges two tokens per uncached row and nothing for none', () => {
    expect(hydrateCost(0)).toBe(0);
    expect(hydrateCost(50)).toBe(100);
    expect(ROW_COST).toBe(2);
  });

  it('turns a remaining budget into a whole number of rows, never negative', () => {
    expect(rowsAffordable(100)).toBe(50);
    expect(rowsAffordable(101)).toBe(50);
    expect(rowsAffordable(1)).toBe(0);
    expect(rowsAffordable(-40)).toBe(0);
    expect(rowsAffordable(null)).toBe(Infinity);
  });
});

describe('budgetState + canAfford', () => {
  it('both tiers are capped, pro well above core', () => {
    expect(DISCOVERY_DAILY_BUDGET.core).toBeGreaterThan(0);
    expect(DISCOVERY_DAILY_BUDGET.pro).toBeGreaterThan(DISCOVERY_DAILY_BUDGET.core!);
  });

  it('reports remaining against the limit and clamps at zero', () => {
    const s = budgetState(1000, 940, false);
    expect(s.remaining).toBe(60);
    expect(canAfford(s, SEARCH_BASE_COST)).toBe(true);
    expect(canAfford(s, 61)).toBe(false);
    expect(budgetState(1000, 1200, false).remaining).toBe(0);
  });

  it('unlimited and exempt users can always afford a run', () => {
    const unlimited = budgetState(null, 999_999, false);
    expect(unlimited.remaining).toBeNull();
    expect(canAfford(unlimited, 10_000)).toBe(true);

    const exempt = budgetState(100, 100, true);
    expect(exempt.remaining).toBeNull();
    expect(canAfford(exempt, 10_000)).toBe(true);
  });
});

describe('isBudgetExempt', () => {
  it('ignores case and whitespace, and rejects everyone else', () => {
    expect(isBudgetExempt('  Support@BloomEngine.ai ')).toBe(true);
    expect(isBudgetExempt('someone@example.com')).toBe(false);
    expect(isBudgetExempt(undefined)).toBe(false);
  });
});
