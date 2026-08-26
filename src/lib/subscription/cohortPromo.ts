import 'server-only';
import Stripe from 'stripe';
import type { BillingInterval } from './tiers';

/**
 * Server-side promotion-code validation.
 *
 * Why this exists: `allow_promotion_codes: true` hands code entry to
 * Stripe's own checkout UI, which means the server never sees the code
 * before the session is created and cannot enforce anything about it.
 * That let the 2026-08 cohort launch go wrong in two ways at once:
 *
 *   1. COHORT6 (100% off, repeating, 6 months) was applied to a YEARLY
 *      price. A yearly plan bills once inside the 6-month window, so the
 *      coupon comped a full $984 year instead of six months.
 *   2. One shared code with `max_redemptions: 3` was fully consumed by a
 *      single member across three accounts, so the other two cohort
 *      members hit an exhausted code and checked out at full price with
 *      no discount at all.
 *
 * The fix is to take code entry back: the user types the code on our
 * page, we validate it here, and we pass it to Stripe as an explicit
 * `discounts: [{ promotion_code }]`. Stripe rejects `discounts` and
 * `allow_promotion_codes` together, so callers must set one or the other.
 *
 * A cohort coupon is identified by `metadata.cohort6 === 'true'` on the
 * coupon (set by scripts/cohort-setup-coupon.ts).
 *
 * NOTE: this file avoids a discriminated-union result on purpose. The
 * project builds with `strict: false`, so `ok: true | false` does not
 * narrow — `result.error` after `if (!result.ok)` would be a type error.
 * A single flat shape with optional fields is what actually compiles here.
 */

export interface PromoValidation {
  /** True when the code is usable for this tier + interval. */
  ok: boolean;
  /** User-facing rejection copy. Present only when `ok` is false. */
  error?: string;
  /** Stripe promotion_code id — pass to `discounts: [{ promotion_code }]`. */
  promotionCodeId?: string;
  /** True when this is a cohort comp code. */
  isCohort?: boolean;
  /**
   * True when the coupon itself provides the free period, so checkout
   * must NOT also attach a trial. Stacking a 7-day trial on top of a
   * 100%-off coupon is what produced the misleading "7-day free trial"
   * copy at checkout.
   */
  suppressTrial?: boolean;
  /** Human-readable summary for checkout copy. */
  summary?: string;
}

/** True when the coupon comps 100% of the invoice. */
function isFullComp(coupon: Stripe.Coupon): boolean {
  return coupon.percent_off === 100;
}

function pluralMonths(n: number): string {
  return n === 1 ? '1 month' : `${n} months`;
}

/**
 * Build the checkout summary line, e.g.
 *   "6 months free, then $39/month".
 * `unitAmount` is the plan price in cents.
 */
function buildSummary(
  coupon: Stripe.Coupon,
  billingInterval: BillingInterval,
  unitAmount: number | null,
): string {
  const per = billingInterval === 'yearly' ? 'year' : 'month';
  const price = unitAmount != null ? `$${(unitAmount / 100).toFixed(0)}/${per}` : `the ${per}ly rate`;

  if (isFullComp(coupon) && coupon.duration === 'repeating' && coupon.duration_in_months) {
    return `${pluralMonths(coupon.duration_in_months)} free, then ${price}`;
  }
  if (isFullComp(coupon) && coupon.duration === 'once') {
    return `First ${per} free, then ${price}`;
  }
  if (coupon.percent_off) {
    return `${coupon.percent_off}% off, then ${price}`;
  }
  if (coupon.amount_off) {
    return `$${(coupon.amount_off / 100).toFixed(2)} off, then ${price}`;
  }
  return `Discount applied — then ${price}`;
}

/**
 * Resolve the coupon behind a promotion code.
 *
 * The current API nests it as `promotion.coupon` and returns it as a bare
 * id string unless expanded — there is no top-level `coupon` field, which
 * is easy to get wrong when reading older Stripe examples.
 */
async function resolveCoupon(
  stripe: Stripe,
  promo: Stripe.PromotionCode,
): Promise<Stripe.Coupon | null> {
  const ref = promo.promotion?.coupon;
  if (!ref) return null;
  if (typeof ref === 'string') {
    return await stripe.coupons.retrieve(ref);
  }
  return ref;
}

/**
 * Look up and validate a promotion code for a given billing interval.
 *
 * Rejects, with user-facing copy:
 *   - unknown / inactive / expired / fully-redeemed codes
 *   - a cohort code applied to a YEARLY plan (see file header)
 */
export async function validatePromotionCode(
  stripe: Stripe,
  rawCode: string,
  billingInterval: BillingInterval,
  unitAmount: number | null,
): Promise<PromoValidation> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a promo code.' };

  // `code` on promotionCodes.list is an exact match, and Stripe stores
  // codes uppercase by convention.
  const found = await stripe.promotionCodes.list({
    code,
    limit: 1,
    expand: ['data.promotion.coupon'],
  });
  const promo = found.data[0];

  if (!promo) {
    return { ok: false, error: `"${code}" isn't a valid promo code.` };
  }
  if (!promo.active) {
    return { ok: false, error: `"${code}" is no longer active.` };
  }
  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
    return { ok: false, error: `"${code}" has expired.` };
  }
  if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions) {
    return {
      ok: false,
      error: `"${code}" has already been fully redeemed. Contact support@bloomengine.ai and we'll sort it out.`,
    };
  }

  const coupon = await resolveCoupon(stripe, promo);
  if (!coupon || !coupon.valid) {
    return { ok: false, error: `"${code}" is no longer valid.` };
  }

  const isCohort = coupon.metadata?.cohort6 === 'true';

  // The core guardrail. A "N months free" coupon on a yearly price comps
  // an entire year, because yearly bills once inside the free window.
  if (isCohort && billingInterval === 'yearly') {
    return {
      ok: false,
      error:
        'Cohort codes apply to monthly plans only. Switch the billing toggle to Monthly to use this code.',
    };
  }

  return {
    ok: true,
    promotionCodeId: promo.id,
    isCohort,
    // A full comp already covers the opening period — never stack a trial
    // on top of it, or checkout advertises a 7-day trial that is not what
    // the customer is actually getting.
    suppressTrial: isFullComp(coupon),
    summary: buildSummary(coupon, billingInterval, unitAmount),
  };
}
