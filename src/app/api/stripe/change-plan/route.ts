import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { tierToPriceId } from '@/lib/subscription/stripeMapping';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

/**
 * Sprint E change-plan endpoint.
 *
 * POST /api/stripe/change-plan
 *   Auth: bearer token (or cookie session).
 *   Body: { tier: 'core'|'pro', billingInterval?: 'monthly'|'yearly' }
 *   Returns: { success: true, tier, billingInterval, prorated: boolean }
 *
 * Updates the caller's active Stripe subscription to a new tier
 * (and optionally a new billing interval), with Stripe-default
 * proration so they're credited / charged for the difference for
 * the remainder of the current billing cycle.
 *
 * Used by the Manage Subscription modal's downgrade path
 * (Pro → Core) and any future upgrade-from-within-app flows.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChangePlanBody {
  tier?: Tier;
  billingInterval?: BillingInterval;
}

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('change-plan: STRIPE_SECRET_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured.' },
        { status: 500 },
      );
    }

    let body: ChangePlanBody = {};
    try {
      body = (await request.json()) as ChangePlanBody;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    const targetTier = body.tier;
    if (targetTier !== 'core' && targetTier !== 'pro') {
      return NextResponse.json(
        { success: false, error: 'tier must be "core" or "pro".' },
        { status: 400 },
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

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('change-plan: profile lookup failed', profileErr);
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

    // Pull the live subscription so we know its current items + the
    // current billing interval (which we preserve unless caller
    // explicitly asks to switch).
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const currentItem = subscription.items.data[0];
    if (!currentItem) {
      return NextResponse.json(
        { success: false, error: 'Subscription has no billable items — contact support.' },
        { status: 500 },
      );
    }

    const currentInterval: BillingInterval =
      currentItem.price.recurring?.interval === 'year' ? 'yearly' : 'monthly';
    const targetInterval: BillingInterval = body.billingInterval ?? currentInterval;

    const newPriceId = await tierToPriceId(stripe, targetTier, targetInterval);
    if (!newPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: `Pricing not configured for ${targetTier} (${targetInterval}). Contact support.`,
        },
        { status: 500 },
      );
    }

    if (newPriceId === currentItem.price.id) {
      return NextResponse.json(
        { success: false, error: "You're already on this plan." },
        { status: 400 },
      );
    }

    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    return NextResponse.json({
      success: true,
      tier: targetTier,
      billingInterval: targetInterval,
      prorated: true,
      subscriptionStatus: updated.status,
    });
  } catch (err) {
    console.error('change-plan: unexpected error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${err.message}` },
        { status: err.statusCode || 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to change plan' },
      { status: 500 },
    );
  }
}
