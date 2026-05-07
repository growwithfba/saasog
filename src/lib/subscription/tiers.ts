/**
 * Phase 5.4-M tier model.
 *
 * Two tiers:
 *   - core (capped) — the bread-and-butter tier
 *   - pro  (unlimited) — for serious brand builders
 *
 * One billing toggle:
 *   - monthly | yearly  (yearly = ~20% off per the pricing-toggle memory)
 *
 * One trial mechanic:
 *   - 7-day trial gives full Pro-level access regardless of stored tier.
 *   - On trial expiry, the user converts to whatever tier they signed up
 *     for at checkout (Core or Pro — both cards on /plans offer a trial).
 *
 * Two gated actions:
 *   - vetting — full vetting analysis (CSV upload OR extension Analyze
 *     Market handoff). Counted as new rows in `submissions`.
 *   - ssp — Offer / Super-Selling-Points generation. Counted as
 *     `usage_events.operation LIKE 'ssp_generate%'` rows.
 *
 * Anything else (Chrome Extension lens scans, AI summary refreshes,
 * sourcing supplier quotes, market climate narration, etc.) is
 * unlimited on all tiers — the cost profile is too low to gate.
 */

export type Tier = 'core' | 'pro';
export type BillingInterval = 'monthly' | 'yearly';
export type GatedAction = 'vetting' | 'ssp';

/**
 * Per-tier monthly limits. `null` = unlimited.
 *
 * If you're tempted to add a new gated action, also wire it into
 * `countUsage` in cap.ts and the API middleware — both files are the
 * single source of truth for what's counted.
 */
export const TIER_LIMITS: Record<Tier, Record<GatedAction, number | null>> = {
  core: { vetting: 25, ssp: 15 },
  pro: { vetting: null, ssp: null },
};

export interface TierState {
  /** Stored tier on the row. Reflects what the user is paying for. */
  tier: Tier;
  /** monthly | yearly | null (null when no active subscription). */
  billingInterval: BillingInterval | null;
  /** Trial expiry (null when no trial active or trial is over). */
  trialEndsAt: Date | null;
  /** Period anchor for cap counting. Resets on each billing renewal. */
  currentPeriodStart: Date | null;
  /** True when trial_ends_at is in the future. */
  isInTrial: boolean;
  /**
   * The tier that ACTUALLY governs cap behavior right now.
   * Trial → 'pro' regardless of stored tier (gives users the unlimited
   * experience during evaluation). Otherwise = stored tier.
   */
  effectiveTier: Tier;
}

export interface CapCheck {
  allowed: boolean;
  /** Count consumed in the current period. */
  used: number;
  /** Cap (null = unlimited). */
  limit: number | null;
  /** Math.max(0, limit - used). null when unlimited. */
  remaining: number | null;
  /**
   * Pass-through tier state, useful for callers that want to render
   * upgrade nudges or show usage progress without a second round trip.
   */
  state: TierState;
}
