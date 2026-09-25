/**
 * Cohort promo setup — one SINGLE-USE code per member.
 *
 * Replaces the previous design of a single shared COHORT6 code with
 * `max_redemptions: 3`. That cap limits TOTAL redemptions, not redemptions
 * per person: at the 2026-08 launch one member redeemed all three across
 * three accounts, so the other two hit an exhausted code and checked out
 * at full price with no discount at all.
 *
 * Now each member gets their own code (COHORT6-WILLIAM, COHORT6-RIZIA, …)
 * with `max_redemptions: 1`, bound to that member's Stripe customer where
 * one already exists so it can't be redeemed on a second account.
 *
 * ⚠️  Members must pick a MONTHLY plan. A 6-month coupon on a YEARLY price
 *     comps a whole free year, because a yearly plan bills once inside the
 *     6-month window — that's how one member got $984 free instead of
 *     ~$594. This is now enforced in code as well as by instruction:
 *     /api/stripe/checkout and /api/stripe/embedded-checkout both reject a
 *     cohort code on a yearly interval. See src/lib/subscription/cohortPromo.ts.
 *
 * Idempotent: existing codes are reported and skipped, never duplicated.
 *
 * Usage:
 *   npx tsx scripts/cohort-setup-coupon.ts            # DRY RUN — shows plan
 *   npx tsx scripts/cohort-setup-coupon.ts --apply    # creates codes
 *
 * Run against TEST first to validate, then LIVE to create the real codes.
 */

import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { COHORT_NEW_MEMBERS, cohortCodeFor, type CohortMember } from './cohortMembers';

try {
  const envPath = path.join(process.cwd(), '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // rely on already-set env
}

const DURATION_IN_MONTHS = 6;
const EXPIRES_IN_DAYS = 30; // enrollment window — bump if needed
const APPLY = process.argv.includes('--apply');

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error('❌ STRIPE_SECRET_KEY is not set. Add it to .env.local or pass it inline.');
  process.exit(1);
}
const mode = secret.startsWith('sk_test_') ? 'TEST' : secret.startsWith('sk_live_') ? 'LIVE' : 'UNKNOWN';
// This used to pin apiVersion 2024-06-20 so promotionCodes.create would
// accept a flat `coupon` param. The current API nests it as
// `promotion: { type: 'coupon', coupon }`, which the installed SDK types
// know about — so we can run on the account default and stay type-safe.
const stripe = new Stripe(secret);

/** Find the member's existing Stripe customer, if they have one. */
async function findCustomerId(email: string): Promise<string | null> {
  const found = await stripe.customers.list({ email, limit: 1 });
  return found.data[0]?.id ?? null;
}

/** Reuse the tagged cohort coupon if it exists, else create it. */
async function ensureCoupon(): Promise<Stripe.Coupon> {
  const coupons = await stripe.coupons.list({ limit: 100 });
  const existing = coupons.data.find((c) => c.metadata?.cohort6 === 'true' && c.valid);
  if (existing) {
    console.log(
      `↩️  Reusing coupon ${existing.id} (${existing.percent_off}% off, ${existing.duration_in_months}mo).`,
    );
    return existing;
  }
  if (!APPLY) {
    console.log(`🎟️  Would create coupon — 100% off for ${DURATION_IN_MONTHS} months.`);
    return { id: '(dry-run)' } as Stripe.Coupon;
  }
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'repeating',
    duration_in_months: DURATION_IN_MONTHS,
    name: `Cohort ${DURATION_IN_MONTHS} Months Free`,
    metadata: { cohort6: 'true' },
  });
  console.log(`🎟️  Created coupon ${coupon.id} — 100% off for ${DURATION_IN_MONTHS} months.`);
  return coupon;
}

async function setupMember(member: CohortMember, coupon: Stripe.Coupon): Promise<void> {
  const code = cohortCodeFor(member);

  const existing = await stripe.promotionCodes.list({ code, limit: 1 });
  if (existing.data.length > 0) {
    const pc = existing.data[0];
    console.log(
      `⏭️  ${member.name.padEnd(8)} ${code} already exists (${pc.id}) —` +
        ` active=${pc.active} redeemed=${pc.times_redeemed}/${pc.max_redemptions ?? '∞'}. Skipping.`,
    );
    return;
  }

  // Binding to a customer is what actually enforces one-code-per-person:
  // max_redemptions alone can't stop the same human redeeming on a second
  // account under a different email.
  const customerId = await findCustomerId(member.email);

  if (!APPLY) {
    console.log(
      `🔍 ${member.name.padEnd(8)} would create ${code}` +
        ` (single-use, ${customerId ? `bound to ${customerId}` : 'unbound — no Stripe customer yet'})`,
    );
    return;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN_DAYS * 24 * 60 * 60;
  const promo = await stripe.promotionCodes.create({
    promotion: { type: 'coupon', coupon: coupon.id },
    code,
    max_redemptions: 1,
    expires_at: expiresAt,
    ...(customerId ? { customer: customerId } : {}),
    metadata: { cohort6: 'true', cohort_member: member.name },
  });

  console.log(
    `✅ ${member.name.padEnd(8)} ${promo.code} (${promo.id})` +
      ` — single-use, ${customerId ? `bound to ${customerId}` : 'unbound'},` +
      ` expires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}`,
  );
}

async function main(): Promise<void> {
  console.log(
    `${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} — Stripe ${mode} mode,` +
      ` ${COHORT_NEW_MEMBERS.length} single-use cohort codes\n`,
  );

  const coupon = await ensureCoupon();
  console.log('');

  for (const member of COHORT_NEW_MEMBERS) {
    try {
      await setupMember(member, coupon);
    } catch (err) {
      console.log(`⚠️  ${member.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n' + '─'.repeat(64));
  console.log('📣 Each member gets THEIR OWN code. Tell them: sign up, choose the');
  console.log('   PRO MONTHLY plan, and enter their personal code at checkout.');
  console.log('   Yearly is rejected at checkout — a 6-month coupon on a yearly');
  console.log('   price comps a full year.');
  if (!APPLY) console.log('\nDry run only — no codes created. Re-run with --apply.');
}

main().catch((e) => {
  console.error(e instanceof Stripe.errors.StripeError ? `Stripe error: ${e.message}` : e);
  process.exit(1);
});
