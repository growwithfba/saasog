import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';

/**
 * Phase 5.4-M cancel endpoint.
 *
 * POST /api/stripe/cancel
 *   Auth: bearer token (or cookie session).
 *   Body: none.
 *   Returns: { success: true, cancelAt: ISO timestamp }
 *
 * Cancels the caller's active Stripe subscription at the current
 * period end (not immediately). The user keeps access through the
 * period they've already paid for; Stripe fires customer.subscription
 * .deleted when the period closes, and the existing webhook handler
 * marks subscription_status=CANCELED.
 *
 * Resuming a cancellation is a separate concern — Stripe lets you
 * `cancel_at_period_end: false` to undo. Could add a "Reactivate"
 * button alongside this in a follow-up; not in V9 scope.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('cancel: STRIPE_SECRET_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured.' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('cancel: profile lookup failed', profileErr);
      return NextResponse.json(
        { success: false, error: 'Could not load your subscription.' },
        { status: 500 },
      );
    }

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json(
        { success: false, error: 'No active subscription found on your account.' },
        { status: 404 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Stripe v20: period bounds live on subscription items.
    const firstItem = updated.items.data[0] as
      | (Stripe.SubscriptionItem & { current_period_end?: number })
      | undefined;
    const subAny = updated as Stripe.Subscription & { current_period_end?: number };
    const cancelAtTs = updated.cancel_at ?? firstItem?.current_period_end ?? subAny.current_period_end ?? null;

    return NextResponse.json({
      success: true,
      cancelAt: cancelAtTs ? new Date(cancelAtTs * 1000).toISOString() : null,
      message: cancelAtTs
        ? `Your subscription will cancel on ${new Date(cancelAtTs * 1000).toLocaleDateString()}. You'll keep access until then.`
        : 'Your subscription is set to cancel at the end of the current period.',
    });
  } catch (err) {
    console.error('cancel: unexpected error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${err.message}` },
        { status: err.statusCode || 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to cancel subscription' },
      { status: 500 },
    );
  }
}
