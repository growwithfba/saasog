import type { Tier } from '@/lib/subscription/tiers';

/**
 * Discovery's daily spend budget, in provider tokens, per effective tier.
 *
 * Why tokens and not searches: the search itself is the cheap part (~11
 * tokens, any match size). The cost is in the rows — the client hydrates
 * every ASIN a search returns, up to REVIEWABLE_LIMIT (250), at 2 tokens per
 * uncached row, so one wide search can be ~510 tokens while a narrow one is
 * ~30. Counting searches would let a user burn 50× more than another on the
 * same count. Counting tokens charges for what was actually spent, and the
 * shared 24-hour row cache makes the same budget stretch further for
 * everyone.
 *
 * The user never sees the word "token": the message says "today's Discovery
 * budget". `null` = unlimited. Trial users resolve to 'pro' via
 * getTierState().effectiveTier, same as every other cap.
 *
 * Rough feel at the defaults, uncached: core ≈ 5 wide searches or ~80
 * narrow ones; pro ≈ 4× that. The account refills at 62 tokens/min (~89k a
 * day) shared with BloomLens and Vetting.
 */
export const DISCOVERY_DAILY_BUDGET: Record<Tier, number | null> = {
  core: 2_500,
  pro: 10_000,
};

/** Rolling window the budget is counted over. */
export const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Accounts exempt from the budget — admin/dev work on production data
 * without getting locked out mid-test. Mirrors the Market Climate refresh
 * bypass. Compared lowercased and trimmed.
 */
export const BUDGET_BYPASS_EMAILS = new Set<string>([
  'support@bloomengine.ai',
  'dave@growwithfba.com',
]);

/** usage_events.operation values that count against the budget. */
export const DISCOVERY_OPERATIONS = [
  'discovery_search',
  'discovery_hydrate',
  'discovery_variations',
] as const;
export type DiscoveryOperation = (typeof DISCOVERY_OPERATIONS)[number];

/** Measured (probe 2026-09-09): 11 base, +1 per 100 ASINs in the list. */
export const SEARCH_BASE_COST = 11;
/** /product with stats+history+aplus+rating — see hydrateAsins. */
export const ROW_COST = 2;
/** The parent lookup a variations expand makes before hydrating siblings. */
export const VARIATION_PARENT_COST = 1;

export const BUDGET_EXHAUSTED_MESSAGE =
  "You've used today's Discovery budget. It resets over the next 24 hours.";

export interface BudgetState {
  /** Daily limit for the tier; null = unlimited or exempt. */
  limit: number | null;
  /** Tokens spent in the trailing window. */
  used: number;
  /** max(0, limit - used); null when unlimited or exempt. */
  remaining: number | null;
  exempt: boolean;
}

export function searchCost(asinCount: number): number {
  if (asinCount <= 0) return SEARCH_BASE_COST;
  return SEARCH_BASE_COST + Math.floor((asinCount - 1) / 100);
}

export function hydrateCost(missCount: number): number {
  return Math.max(0, missCount) * ROW_COST;
}

/** How many uncached rows a remaining budget pays for. Infinity when unlimited. */
export function rowsAffordable(remaining: number | null): number {
  if (remaining === null) return Infinity;
  return Math.max(0, Math.floor(remaining / ROW_COST));
}

export function budgetState(limit: number | null, used: number, exempt: boolean): BudgetState {
  if (exempt || limit === null) return { limit: exempt ? null : limit, used, remaining: null, exempt };
  return { limit, used, remaining: Math.max(0, limit - used), exempt };
}

export function canAfford(state: BudgetState, cost: number): boolean {
  if (state.remaining === null) return true;
  return state.remaining >= cost;
}

export function isBudgetExempt(email: string | null | undefined): boolean {
  if (!email) return false;
  return BUDGET_BYPASS_EMAILS.has(email.trim().toLowerCase());
}
