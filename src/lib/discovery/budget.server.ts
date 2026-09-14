import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getTierState } from '@/lib/subscription/state';
import {
  BUDGET_EXHAUSTED_MESSAGE,
  BUDGET_WINDOW_MS,
  DISCOVERY_DAILY_BUDGET,
  DISCOVERY_OPERATIONS,
  budgetState,
  isBudgetExempt,
  type BudgetState,
  type DiscoveryOperation,
} from './budget';

/**
 * Read the caller's Discovery budget for the trailing 24 hours.
 *
 * Spend is the sum of `usage_events.tokens_in` over the Discovery operations
 * with status 'ok' — only successful provider calls count, so a transient
 * provider error never burns budget. `usage_events` has RLS with a
 * select-own policy and no insert policy, so reads could use either client;
 * writes need the service role. Both go through `admin` here so the number
 * the check sees is the number the log wrote.
 */
export async function loadDiscoveryBudget(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  user: User,
): Promise<BudgetState> {
  if (isBudgetExempt(user.email)) return budgetState(null, 0, true);

  const { effectiveTier } = await getTierState(userClient, user.id);
  const limit = DISCOVERY_DAILY_BUDGET[effectiveTier];
  if (limit === null) return budgetState(null, 0, false);

  const since = new Date(Date.now() - BUDGET_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('usage_events')
    .select('tokens_in')
    .eq('user_id', user.id)
    .eq('status', 'ok')
    .in('operation', [...DISCOVERY_OPERATIONS])
    .gte('created_at', since);

  if (error) {
    // Fail open on a read error: a logging-table hiccup must not take
    // Discovery down. It is logged so it does not stay silent.
    console.error('[discovery/budget] usage read failed', error);
    return budgetState(null, 0, false);
  }

  const used = (data ?? []).reduce((sum, row) => sum + (Number((row as any).tokens_in) || 0), 0);
  return budgetState(limit, used, false);
}

/**
 * Log tokens actually spent. Never throws — a failed log is reported, not
 * surfaced, because the user's request already succeeded.
 */
export async function recordDiscoverySpend(
  admin: SupabaseClient,
  userId: string,
  operation: DiscoveryOperation,
  tokens: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (tokens <= 0) return;
  const { error } = await admin.from('usage_events').insert({
    user_id: userId,
    provider: 'keepa',
    operation,
    status: 'ok',
    tokens_in: tokens,
    metadata: { ...metadata, ts: new Date().toISOString() },
  });
  if (error) console.error('[discovery/budget] usage insert failed', error);
}

/** The 429 every Discovery route returns when the budget cannot cover a run. */
export function budgetExhaustedResponse(budget: BudgetState) {
  return NextResponse.json(
    {
      success: false,
      error: BUDGET_EXHAUSTED_MESSAGE,
      code: 'DISCOVERY_BUDGET',
      budget: { used: budget.used, limit: budget.limit },
    },
    { status: 429, headers: { 'Cache-Control': 'no-store' } },
  );
}
