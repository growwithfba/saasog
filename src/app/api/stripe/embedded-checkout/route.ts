import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { tierToPriceId } from '@/lib/subscription/stripeMapping';
import { validatePromotionCode } from '@/lib/subscription/cohortPromo';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

/**
 * Phase 5.4-M Stripe Embedded Checkout endpoint.
 *
 * POST /api/stripe/embedded-checkout
 *   Body:    { tier: 'core' | 'pro', billingInterval: 'monthly' | 'yearly',
 *              promotionCode?: string }
 *   Returns: { success: true, clientSecret: string }
 *
 * Replaces the redirect-based /api/stripe/anonymous-checkout flow per the
 * "no Stripe-hosted pages" standing rule. The client renders the Stripe
 * Embedded Checkout iframe inside /plans using the returned clientSecret.
 *
 * The 7-day trial is configured at the subscription level — every signup
 * gets it whether they pick Core or Pro. On day 8 Stripe charges the
 * picked tier's price; the webhook handler then bumps the user's profile
 * to ACTIVE.
 *
 * EXCEPT when a full-comp promo code is applied: the coupon already
 * provides the free period, so stacking a trial on top of it made Stripe
 * advertise "7-day free trial" to cohort members who were actually
 * getting six months. When `promotionCode` validates as a full comp we
 * drop `trial_period_days` entirely and let the coupon speak for itself.
 *
 * Promo codes are validated server-side and passed as an explicit
 * `discounts` array rather than via `allow_promotion_codes` — Stripe
 * rejects both together, and letting Stripe collect the code means we
 * can't enforce the monthly-only cohort rule. See cohortPromo.ts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TIERS: readonly Tier[] = ['core', 'pro'];
const VALID_INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly'];

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('embedded-checkout: STRIPE_SECRET_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured. Please contact support.' },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const tier = body?.tier as Tier | undefined;
    const billingInterval = body?.billingInterval as BillingInterval | undefined;
    const promotionCode = typeof body?.promotionCode === 'string' ? body.promotionCode.trim() : '';

    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { success: false, error: `tier must be one of: ${VALID_TIERS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!billingInterval || !VALID_INTERVALS.includes(billingInterval)) {
      return NextResponse.json(
        { success: false, error: `billingInterval must be one of: ${VALID_INTERVALS.join(', ')}` },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const priceId = await tierToPriceId(stripe, tier, billingInterval);

    if (!priceId) {
      console.error('embedded-checkout: no Stripe price found', { tier, billingInterval });
      return NextResponse.json(
        {
          success: false,
          error: `No Stripe price found for ${tier}/${billingInterval}. Confirm the BloomEngine ${tier === 'core' ? 'Core' : 'Pro'} product has a ${billingInterval} price in Stripe.`,
        },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Re-validate the code here rather than trusting anything the client
    // sends: /api/stripe/validate-promo is only a preview for the UI.
    let discountPromoId: string | null = null;
    let suppressTrial = false;
    if (promotionCode) {
      const price = await stripe.prices.retrieve(priceId);
      const validation = await validatePromotionCode(
        stripe,
        promotionCode,
        billingInterval,
        price.unit_amount ?? null,
      );
      if (!validation.ok) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }
      discountPromoId = validation.promotionCodeId;
      suppressTrial = validation.suppressTrial;
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { tier, billing_interval: billingInterval },
    };
    if (!suppressTrial) {
      subscriptionData.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      // Embedded Checkout uses return_url after the user completes payment.
      // Routing through /register lets us collect Supabase signup details
      // and link the new auth.users.id to the Stripe customer via metadata.
      return_url: `${appUrl}/register?session_id={CHECKOUT_SESSION_ID}`,
      // Stripe rejects `discounts` and `allow_promotion_codes` together.
      ...(discountPromoId
        ? { discounts: [{ promotion_code: discountPromoId }] }
        : { allow_promotion_codes: true }),
    });

    if (!session.client_secret) {
      console.error('embedded-checkout: Stripe returned no client_secret', { sessionId: session.id });
      return NextResponse.json(
        { success: false, error: 'Stripe did not return a client_secret. Please try again.' },
        { status: 500 },
      );
    }

    console.log('embedded-checkout: created embedded session', {
      sessionId: session.id,
      tier,
      billingInterval,
    });

    return NextResponse.json({ success: true, clientSecret: session.client_secret }, { status: 200 });
  } catch (error) {
    console.error('embedded-checkout: unexpected error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${error.message}`, type: error.type },
        { status: error.statusCode || 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create checkout session',
      },
      { status: 500 },
    );
  }
}
