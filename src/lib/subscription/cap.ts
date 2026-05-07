import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TIER_LIMITS,
  type CapCheck,
  type GatedAction,
} from './tiers';
import { getTierState } from './state';

/**
 * Check whether `userId` can perform `action` right now.
 *
 * Pro / active trial → unlimited; returns { allowed: true, limit: null }.
 *
 * Core → counts usage since `current_period_start`:
 *   - 'vetting' counts rows in `public.submissions` (one row per vetting,
 *     refreshes don't create new rows so they don't count).
 *   - 'ssp' counts rows in `public.usage_events` where operation matches
 *     'ssp_generate%' (covers the main SSP gen + mechanical/deep variants).
 *
 * Caller is responsible for the actual gating — this function is a pure
 * read. Pattern in API routes:
 *
 *     const cap = await checkCap(supabase, userId, 'vetting');
 *     if (!cap.allowed) {
 *       return NextResponse.json(
 *         { error: 'Vetting limit reached', cap },
 *         { status: 402 },
 *       );
 *     }
 *     // proceed with the gated action; the new submission/usage_event
 *     // will be picked up by the next checkCap call automatically.
 */
export async function checkCap(
  supabase: SupabaseClient,
  userId: string,
  action: GatedAction,
): Promise<CapCheck> {
  const state = await getTierState(supabase, userId);
  const limit = TIER_LIMITS[state.effectiveTier][action];

  if (limit === null) {
    return {
      allowed: true,
      used: 0,
      limit: null,
      remaining: null,
      state,
    };
  }

  // Period anchor — fall back to a rolling 30-day window when the
  // profile row does not yet have current_period_start populated
  // (e.g., a new signup before the Stripe webhook has fired).
  const periodStart =
    state.currentPeriodStart ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const used = await countUsage(supabase, userId, action, periodStart);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    state,
  };
}

async function countUsage(
  supabase: SupabaseClient,
  userId: string,
  action: GatedAction,
  since: Date,
): Promise<number> {
  const sinceIso = since.toISOString();

  if (action === 'vetting') {
    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso);
    return count ?? 0;
  }

  if (action === 'ssp') {
    const { count } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .like('operation', 'ssp_generate%')
      .gte('created_at', sinceIso);
    return count ?? 0;
  }

  // Exhaustive switch — TypeScript will complain if a new GatedAction
  // is added without a corresponding count branch above.
  const _exhaustive: never = action;
  void _exhaustive;
  return 0;
}
