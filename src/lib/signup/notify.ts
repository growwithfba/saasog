import 'server-only';
import type Stripe from 'stripe';

/**
 * New-signup notification.
 *
 * After a checkout is linked to a new BloomEngine account, we POST one JSON
 * event to a Zapier catch hook (SIGNUP_WEBHOOK_URL). Zapier checks the Leads
 * sheet for Skool membership, logs the row in "BloomEngine Users" and posts
 * to #bloomengine-signups.
 *
 * Best-effort by design: a missing URL, a slow Zapier or a failed POST is
 * logged and swallowed. A notification can never break account creation.
 */

export interface SignupEvent {
  signed_up_at: string;
  full_name: string;
  email: string;
  phone: string;
  plan: string; // e.g. "Pro Monthly"
  tier: string; // core | pro
  billing_interval: string; // monthly | yearly
  price: string; // e.g. "$99.00/month"
  subscription_status: string;
  trial_ends_at: string | null;
  promotion_code: string | null;
  supabase_user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

const TIMEOUT_MS = 5000;

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function buildSignupEvent(args: {
  userId: string;
  fullName: string;
  phone: string;
  customer: Stripe.Customer;
  subscription: Stripe.Subscription;
  sessionEmail: string | null;
  promotionCode: string | null;
  now?: Date;
}): SignupEvent {
  const { subscription, customer } = args;
  const price = subscription.items.data[0]?.price;
  const interval = price?.recurring?.interval;
  const billingInterval = subscription.metadata?.billing_interval
    ?? (interval === 'year' ? 'yearly' : 'monthly');
  const tier = subscription.metadata?.tier ?? 'unknown';
  const amount = typeof price?.unit_amount === 'number'
    ? `$${(price.unit_amount / 100).toFixed(2)}/${interval ?? 'period'}`
    : '';

  return {
    signed_up_at: (args.now ?? new Date()).toISOString(),
    full_name: args.fullName,
    email: customer.email ?? args.sessionEmail ?? '',
    phone: args.phone,
    plan: `${titleCase(tier)} ${titleCase(billingInterval)}`,
    tier,
    billing_interval: billingInterval,
    price: amount,
    subscription_status: subscription.status,
    trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    promotion_code: args.promotionCode,
    supabase_user_id: args.userId,
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
  };
}

/** Reads the customer-facing code (e.g. "GAMENIGHTVIP") applied at checkout, if any. */
export async function resolvePromotionCode(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  try {
    const applied = session.discounts?.find((d) => d.promotion_code)?.promotion_code;
    if (!applied) return null;
    if (typeof applied !== 'string') return applied.code;
    return (await stripe.promotionCodes.retrieve(applied)).code;
  } catch (error) {
    console.warn('signup-notify: could not resolve promotion code', error);
    return null;
  }
}

export async function sendSignupEvent(event: SignupEvent): Promise<boolean> {
  const url = process.env.SIGNUP_WEBHOOK_URL;
  if (!url) {
    console.warn('signup-notify: SIGNUP_WEBHOOK_URL is not set; skipping');
    return false;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('signup-notify: webhook returned', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('signup-notify: webhook failed', error);
    return false;
  }
}
