import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * POST /api/stripe/anonymous-checkout
 * Creates a Stripe checkout session WITHOUT a Supabase userId.
 * Used in the "pay first, register later" onboarding flow.
 *
 * Body: { productId: string }
 * Returns: { success: true, url: string }
 *
 * After payment Stripe redirects to:
 *   /register?session_id={CHECKOUT_SESSION_ID}
 */
export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      console.error('POST stripe/anonymous-checkout: STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }

    // Retrieve product and resolve its default price
    const product = await stripe.products.retrieve(productId);
    if (!product || !product.active) {
      return NextResponse.json(
        { success: false, error: 'Product not found or inactive' },
        { status: 404 }
      );
    }

    let priceId: string | null = null;

    if (product.default_price) {
      priceId =
        typeof product.default_price === 'string'
          ? product.default_price
          : product.default_price.id;
    }

    if (!priceId) {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
      if (prices.data.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No active price found for this product' },
          { status: 404 }
        );
      }
      priceId = prices.data[0].id;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create the checkout session — no customer yet, Stripe collects the email
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7,
        metadata: { product_id: productId },
      },
      // Stripe success redirects here; the register page reads session_id
      success_url: `${appUrl}/register?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans?canceled=true`,
      allow_promotion_codes: true,
    });

    console.log('POST stripe/anonymous-checkout: Created anonymous session', {
      sessionId: session.id,
      productId,
    });

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('POST stripe/anonymous-checkout: Unexpected error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${error.message}`, type: error.type },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create checkout session',
      },
      { status: 500 }
    );
  }
}
