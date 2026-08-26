import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { tierToPriceId } from '@/lib/subscription/stripeMapping';
import { validatePromotionCode } from '@/lib/subscription/cohortPromo';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

/**
 * Promo-code validation for the checkout modal.
 *
 * POST /api/stripe/validate-promo
 *   Body:    { code: string, tier: 'core'|'pro', billingInterval: 'monthly'|'yearly' }
 *   Returns: { success: true, summary: string, suppressTrial: boolean }
 *            { success: false, error: string }   (400 — user-facing copy)
 *
 * Lets the user see "6 months free, then $39/month" (or a clear rejection)
 * BEFORE the Stripe iframe opens, instead of discovering inside Stripe's UI
 * that their code was refused. See src/lib/subscription/cohortPromo.ts for
 * why code entry lives on our side now.
 *
 * Deliberately does NOT return the promotion_code id — the checkout
 * endpoint re-validates server-side from the raw code, so a client can't
 * smuggle in an id this endpoint never approved.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TIERS: readonly Tier[] = ['core', 'pro'];
const VALID_INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly'];

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('validate-promo: STRIPE_SECRET_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Stripe is not configured. Please contact support.' },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : '';
    const tier = body?.tier as Tier | undefined;
    const billingInterval = body?.billingInterval as BillingInterval | undefined;

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

    // Resolve the plan price so the summary can quote the real post-discount
    // amount rather than a hardcoded number.
    let unitAmount: number | null = null;
    const priceId = await tierToPriceId(stripe, tier, billingInterval);
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      unitAmount = price.unit_amount ?? null;
    }

    const result = await validatePromotionCode(stripe, code, billingInterval, unitAmount);

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, summary: result.summary, suppressTrial: result.suppressTrial },
      { status: 200 },
    );
  } catch (error) {
    console.error('validate-promo: unexpected error:', error);
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: `Stripe error: ${error.message}` },
        { status: error.statusCode || 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Could not check that code. Please try again.' },
      { status: 500 },
    );
  }
}
