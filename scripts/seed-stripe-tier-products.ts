/**
 * Phase 5.4-M one-shot Stripe product/price seeder.
 *
 * Idempotent: safely re-runnable. Skips creating products if a product
 * with the exact name already exists, and skips creating prices if a
 * price with the same (product, amount, interval) already exists.
 *
 * Usage:
 *   npx tsx scripts/seed-stripe-tier-products.ts
 *
 * Reads STRIPE_SECRET_KEY from .env.local. Use a TEST-mode key (sk_test_...)
 * for local seeding. Use a LIVE-mode key (sk_live_...) only when you
 * specifically want to seed production — typically you'd create live-mode
 * products via the Stripe dashboard instead.
 *
 * Locked pricing (Sprint D Layer 1):
 *   Core: $39 / mo  or  $384 / yr   ($32 yearly equivalent monthly)
 *   Pro:  $99 / mo  or  $948 / yr   ($79 yearly equivalent monthly)
 */

import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';

// Load .env.local manually — keep this script dependency-free.
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // No .env.local — rely on already-set env.
}

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error('❌ STRIPE_SECRET_KEY is not set. Add it to .env.local and re-run.');
  process.exit(1);
}

const mode = secret.startsWith('sk_test_') ? 'TEST' : secret.startsWith('sk_live_') ? 'LIVE' : 'UNKNOWN';
console.log(`🔑 Using Stripe ${mode} mode key.\n`);

const stripe = new Stripe(secret);

interface PlanSpec {
  name: string;
  description: string;
  prices: Array<{ amountCents: number; interval: 'month' | 'year' }>;
}

const PLANS: PlanSpec[] = [
  {
    name: 'BloomEngine Core',
    description: 'Advanced research & product development. 25 vettings + 15 SSPs per month.',
    prices: [
      { amountCents: 39_00, interval: 'month' },
      { amountCents: 384_00, interval: 'year' },
    ],
  },
  {
    name: 'BloomEngine Pro',
    description: 'For serious brand builders. Unlimited vettings, SSPs, and supplier quotes.',
    prices: [
      { amountCents: 99_00, interval: 'month' },
      { amountCents: 948_00, interval: 'year' },
    ],
  },
];

async function findProductByName(name: string): Promise<Stripe.Product | null> {
  const list = await stripe.products.list({ active: true, limit: 100 });
  return list.data.find((p) => p.name === name) ?? null;
}

async function ensureProduct(spec: PlanSpec): Promise<Stripe.Product> {
  const existing = await findProductByName(spec.name);
  if (existing) {
    console.log(`  ↻ Product exists: ${spec.name} (${existing.id})`);
    return existing;
  }
  const created = await stripe.products.create({
    name: spec.name,
    description: spec.description,
  });
  console.log(`  + Created product: ${spec.name} (${created.id})`);
  return created;
}

async function ensurePrice(
  product: Stripe.Product,
  amountCents: number,
  interval: 'month' | 'year',
): Promise<Stripe.Price> {
  const list = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const existing = list.data.find(
    (p) =>
      p.unit_amount === amountCents &&
      p.currency === 'usd' &&
      p.recurring?.interval === interval,
  );
  if (existing) {
    console.log(`    ↻ Price exists: ${formatAmount(amountCents)}/${interval} (${existing.id})`);
    return existing;
  }
  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency: 'usd',
    recurring: { interval },
  });
  console.log(`    + Created price: ${formatAmount(amountCents)}/${interval} (${created.id})`);
  return created;
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

async function main() {
  console.log(`📦 Seeding ${PLANS.length} products + ${PLANS.flatMap((p) => p.prices).length} prices...\n`);
  for (const spec of PLANS) {
    console.log(`▶ ${spec.name}`);
    const product = await ensureProduct(spec);
    for (const priceSpec of spec.prices) {
      await ensurePrice(product, priceSpec.amountCents, priceSpec.interval);
    }
  }
  console.log(`\n✅ Done. Restart your dev server so the tier-mapping cache picks up the new prices.`);
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
