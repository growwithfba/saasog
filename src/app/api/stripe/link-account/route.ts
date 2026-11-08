import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { normalizePhone } from '@/lib/signup/phone';
import { buildSignupEvent, resolvePromotionCode, sendSignupEvent } from '@/lib/signup/notify';

/**
 * POST /api/stripe/link-account
 * Links an anonymous Stripe checkout session to a newly created Supabase user.
 *
 * Steps:
 * 1. Retrieves the Stripe session (customer + subscription)
 * 2. Updates the Stripe customer metadata with supabase_user_id
 * 3. Updates the Stripe subscription metadata with supabase_user_id
 * 4. Upserts the Supabase profile with subscription status, type, trial info,
 *    name and phone (server-side, so it works before email confirmation)
 * 5. Sends the new-signup event to Zapier (best-effort, see lib/signup/notify)
 *
 * Body: { sessionId: string, userId: string, fullName?: string, phone?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.json();
    const { sessionId, userId } = body;
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 200) : '';
    const phone = normalizePhone(body.phone);

    if (!sessionId || !userId) {
      return NextResponse.json(
        { success: false, error: 'sessionId and userId are required' },
        { status: 400 }
      );
    }

    // Retrieve the session with full expansion
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    const customer = session.customer as Stripe.Customer | null;
    const subscription = session.subscription as Stripe.Subscription | null;

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'No customer found in this session' },
        { status: 400 }
      );
    }

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'No subscription found in this session' },
        { status: 400 }
      );
    }

    // Tag the Stripe customer with the Supabase user ID for future webhook lookups
    await stripe.customers.update(customer.id, {
      metadata: { supabase_user_id: userId },
    });

    // Also tag the subscription so the webhook can find it immediately
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        supabase_user_id: userId,
      },
    });

    // Determine subscription type
    const interval = subscription.items.data[0]?.price?.recurring?.interval;
    const subscriptionType: 'MONTHLY' | 'YEARLY' = interval === 'year' ? 'YEARLY' : 'MONTHLY';

    // Determine subscription status
    let subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'CANCELED';
    if (subscription.status === 'trialing') {
      subscriptionStatus = 'TRIALING';
    } else if (subscription.status === 'active') {
      subscriptionStatus = 'ACTIVE';
    } else {
      subscriptionStatus = 'CANCELED';
    }

    // Upsert the profile with subscription details
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          subscription_status: subscriptionStatus,
          subscription_type: subscriptionType,
          has_used_trial: true,
          ...(fullName ? { full_name: fullName } : {}),
          ...(phone ? { phone } : {}),
          first_subscription_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('POST stripe/link-account: Error updating profile:', profileError);
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    console.log('POST stripe/link-account: Successfully linked account', {
      userId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      subscriptionStatus,
      subscriptionType,
    });

    const promotionCode = await resolvePromotionCode(stripe, session);
    await sendSignupEvent(
      buildSignupEvent({
        userId,
        fullName,
        phone: phone ?? '',
        customer,
        subscription,
        sessionEmail: session.customer_details?.email ?? null,
        promotionCode,
      }),
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('POST stripe/link-account: Unexpected error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${error.message}` },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to link account',
      },
      { status: 500 }
    );
  }
}
