import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { checkCap } from '@/lib/subscription';
import type { GatedAction } from '@/lib/subscription';

/**
 * Phase 5.4-M usage snapshot.
 *
 * GET /api/subscription/usage
 *   Returns the caller's tier state + per-action cap status for the
 *   current billing period. Used by:
 *     - 80% warning toast (page-load probe)
 *     - 100% cap modal (decoded from 402 responses elsewhere)
 *     - /subscription + /profile usage progress bars (Phase 5)
 *
 *   Auth: bearer token in Authorization header. Falls back to
 *   cookie-scoped server client.
 *
 *   Response:
 *     { success: true, tier, billingInterval, isInTrial, trialEndsAt,
 *       caps: { vetting: CapCheck, ssp: CapCheck } }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS: readonly GatedAction[] = ['vetting', 'ssp'];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // Run all cap checks in parallel — they're independent reads.
    const checks = await Promise.all(
      ACTIONS.map(async (action) => [action, await checkCap(supabase, user.id, action)] as const),
    );
    const caps = Object.fromEntries(checks) as Record<GatedAction, (typeof checks)[number][1]>;

    // Pull the shared tier state from the first check (they're identical).
    const state = caps.vetting.state;

    return NextResponse.json({
      success: true,
      tier: state.tier,
      effectiveTier: state.effectiveTier,
      billingInterval: state.billingInterval,
      isInTrial: state.isInTrial,
      trialEndsAt: state.trialEndsAt,
      currentPeriodStart: state.currentPeriodStart,
      caps: {
        vetting: {
          allowed: caps.vetting.allowed,
          used: caps.vetting.used,
          limit: caps.vetting.limit,
          remaining: caps.vetting.remaining,
        },
        ssp: {
          allowed: caps.ssp.allowed,
          used: caps.ssp.used,
          limit: caps.ssp.limit,
          remaining: caps.ssp.remaining,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/subscription/usage failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load usage',
      },
      { status: 500 },
    );
  }
}
