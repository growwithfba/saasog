import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';

/**
 * Phase 5.4-M reactivate endpoint — mirror of /api/stripe/cancel.
 *
 * POST /api/stripe/reactivate
 *   Auth: bearer token (or cookie session).
 *   Body: none.
 *   Returns: { success: true, message: string }
 *
 * Flips cancel_at_period_end back to false, undoing a pending
 * cancellation. Only meaningful while the subscription is still active
 * (Stripe rejects the call once the period has actually ended and the
 * subscription is fully canceled).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('reactivate: STRIPE_SECRET_KEY not configured');
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
      console.error('reactivate: profile lookup failed', profileErr);
      return NextResponse.json(
        { success: false, error: 'Could not load your subscription.' },
        { status: 500 },
      );
    }

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json(
        { success: false, error: 'No subscription found on your account.' },
        { status: 404 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({
      success: true,
      message: 'Welcome back! Your subscription is active again.',
    });
  } catch (err) {
    console.error('reactivate: unexpected error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${err.message}` },
        { status: err.statusCode || 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to resume subscription' },
      { status: 500 },
    );
  }
}
