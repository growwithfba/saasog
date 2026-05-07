import 'server-only';
import Stripe from 'stripe';
import type { BillingInterval, Tier } from './tiers';

/**
 * Phase 5.4-M Stripe ↔ tier mapping.
 *
 * Strategy: derive tier + billing interval from the Stripe product/price
 * structure rather than env vars. Two products in Stripe:
 *   - "BloomEngine Core"  → tier='core'
 *   - "BloomEngine Pro"   → tier='pro'
 * Each product has 2 prices keyed by `recurring.interval`:
 *   - month → billingInterval='monthly'
 *   - year  → billingInterval='yearly'
 *
 * This avoids the operational burden of keeping 4 STRIPE_PRICE_* env vars
 * in sync across local/preview/prod, and means adding a new tier in the
 * future is a Stripe-dashboard change + a TIER_PRODUCT_NAMES entry — no
 * code-side env wiring.
 *
 * The product list is cached at module scope. Cold-start cost: one
 * `products.list({ active: true })` call per Lambda warm-up. Refresh by
 * redeploying or by calling refreshTierMappingCache() if you change
 * Stripe products mid-flight.
 */

const TIER_PRODUCT_NAMES: Record<string, Tier> = {
  'BloomEngine Core': 'core',
  'BloomEngine Pro': 'pro',
};

interface PriceMapping {
  tier: Tier;
  billingInterval: BillingInterval;
  productId: string;
  productName: string;
}

let cachedPriceMap: Map<string, PriceMapping> | null = null;

async function loadPriceMap(stripe: Stripe): Promise<Map<string, PriceMapping>> {
  if (cachedPriceMap) return cachedPriceMap;

  const products = await stripe.products.list({ active: true, limit: 100 });
  const mapped = new Map<string, PriceMapping>();

  for (const product of products.data) {
    const tier = TIER_PRODUCT_NAMES[product.name];
    if (!tier) continue;

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 10,
    });

    for (const price of prices.data) {
      const interval = price.recurring?.interval;
      const billingInterval: BillingInterval | null =
        interval === 'month' ? 'monthly'
        : interval === 'year' ? 'yearly'
        : null;
      if (!billingInterval) continue;

      mapped.set(price.id, {
        tier,
        billingInterval,
        productId: product.id,
        productName: product.name,
      });
    }
  }

  cachedPriceMap = mapped;
  return mapped;
}

/**
 * Resolve a Stripe price ID to its tier + billing interval. Returns null
 * if the price doesn't belong to one of the BloomEngine tier products
 * (e.g., it's a legacy "BloomEngine Monthly/Annual" price for grandfathered
 * mentorship clients — those don't map to a new tier).
 */
export async function priceIdToTier(
  stripe: Stripe,
  priceId: string,
): Promise<PriceMapping | null> {
  const map = await loadPriceMap(stripe);
  return map.get(priceId) ?? null;
}

/**
 * Resolve a (tier, billingInterval) pair back to its Stripe price ID.
 * Used by the checkout-session creator when the client picks a tier card
 * + billing toggle on /plans.
 */
export async function tierToPriceId(
  stripe: Stripe,
  tier: Tier,
  billingInterval: BillingInterval,
): Promise<string | null> {
  const map = await loadPriceMap(stripe);
  for (const [priceId, mapping] of map.entries()) {
    if (mapping.tier === tier && mapping.billingInterval === billingInterval) {
      return priceId;
    }
  }
  return null;
}

/**
 * Force the next call to re-fetch from Stripe. Useful when products or
 * prices have been changed in the Stripe dashboard mid-flight.
 */
export function refreshTierMappingCache(): void {
  cachedPriceMap = null;
}
