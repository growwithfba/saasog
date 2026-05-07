import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BillingInterval,
  Tier,
  TierState,
} from './tiers';

/**
 * Read the user's current tier state from `profiles`.
 *
 * Defaults to `tier='core'` if no row exists yet (defensive — should not
 * happen in practice because the `handle_new_user` trigger creates a
 * profile row on signup, and the Phase 5.4-M backfill set every existing
 * row to 'pro'). New rows created post-migration that haven't yet had a
 * Stripe webhook fire still need a sane default.
 *
 * The supplied SupabaseClient should be auth-scoped to the user being
 * queried — RLS handles the access check. Pass a service-role client
 * only when you genuinely need to read another user's tier (webhooks).
 */
export async function getTierState(
  supabase: SupabaseClient,
  userId: string,
): Promise<TierState> {
  const { data } = await supabase
    .from('profiles')
    .select('tier, billing_interval, trial_ends_at, current_period_start')
    .eq('id', userId)
    .maybeSingle();

  const tier = (data?.tier as Tier | null) ?? 'core';
  const billingInterval =
    (data?.billing_interval as BillingInterval | null) ?? null;
  const trialEndsAt = data?.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const currentPeriodStart = data?.current_period_start
    ? new Date(data.current_period_start)
    : null;

  const isInTrial = !!(trialEndsAt && trialEndsAt.getTime() > Date.now());

  return {
    tier,
    billingInterval,
    trialEndsAt,
    currentPeriodStart,
    isInTrial,
    effectiveTier: isInTrial ? 'pro' : tier,
  };
}
