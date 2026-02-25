import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * GET /api/stripe/get-session?session_id=xxx
 * Retrieves a completed Stripe checkout session to extract the customer email
 * and subscription details. Used on the /register page after checkout.
 */
export async function GET(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const sessionId = request.nextUrl.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'session_id is required' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    const customer = session.customer as Stripe.Customer | null;
    const subscription = session.subscription as Stripe.Subscription | null;

    // Determine plan type from the subscription's price interval
    let planType: 'MONTHLY' | 'YEARLY' | null = null;
    if (subscription?.items?.data?.[0]?.price?.recurring?.interval) {
      planType =
        subscription.items.data[0].price.recurring.interval === 'year' ? 'YEARLY' : 'MONTHLY';
    }

    const email = customer?.email || session.customer_email || null;

    return NextResponse.json(
      {
        success: true,
        data: {
          email,
          customerId: customer?.id || null,
          subscriptionId: subscription?.id || null,
          subscriptionStatus: subscription?.status || null,
          planType,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET stripe/get-session: Unexpected error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${error.message}` },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve session',
      },
      { status: 500 }
    );
  }
}
