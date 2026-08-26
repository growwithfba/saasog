/**
 * Cohort onboarding — READ-ONLY audit.
 *
 * For each cohort email, reports:
 *   - Supabase profile: exists? subscription_status, tier, current_period_end,
 *     has_used_trial, stripe_customer_id, stripe_subscription_id
 *   - Stripe: customer(s) by email, and each subscription's status / price /
 *     current_period_end / trial_end / cohort6 metadata stamp
 *
 * This makes NO changes. Run it first to decide, per member, whether they are:
 *   NEW            → hand them the COHORT6 promo code (self-serve checkout)
 *   ACTIVE-STRIPE  → extend their live subscription by 6 months (cohort-extend)
 *   GROUPON/COMPED → no Stripe sub; extend access in Supabase directly
 *   CANCELED/OTHER → handle by hand
 *
 * Usage:
 *   npx tsx scripts/cohort-audit.ts
 *
 * Reads STRIPE_SECRET_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { COHORT_EMAILS } from './cohortMembers';

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

// Roster lives in one place now — see scripts/cohortMembers.ts for why.

const secret = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!secret) {
  console.error('❌ STRIPE_SECRET_KEY is not set in .env.local.');
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local.');
  process.exit(1);
}

const mode = secret.startsWith('sk_test_') ? 'TEST' : secret.startsWith('sk_live_') ? 'LIVE' : 'UNKNOWN';
console.log(`🔑 Stripe ${mode} mode.  🗄️  Supabase ${new URL(supabaseUrl).host}\n`);

const stripe = new Stripe(secret);
const supabase = createClient(supabaseUrl, supabaseKey);

/** Build an email→auth.users.id map by paging through the admin user list. */
async function buildEmailToIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  // perPage max is 1000; loop until a short page signals the end.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.log(`   ⚠️  auth.admin.listUsers error: ${error.message}`);
      break;
    }
    for (const u of data.users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return map;
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

async function auditEmail(email: string, emailToId: Map<string, string>): Promise<void> {
  console.log('─'.repeat(72));
  console.log(`📧 ${email}`);

  // --- Supabase account (auth.users) + profile (by id) ---
  const userId = emailToId.get(email.toLowerCase());
  if (!userId) {
    console.log('   Supabase: ❌ no auth account (NEW user — no BloomEngine account)');
  } else {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId);

    if (pErr) {
      console.log(`   Supabase: ✅ auth account ${userId} — ⚠️ profile query error: ${pErr.message}`);
    } else if (!profiles || profiles.length === 0) {
      console.log(`   Supabase: ✅ auth account ${userId} — ❌ no profiles row`);
    } else {
      for (const p of profiles) {
        console.log(
          `   Supabase: ✅ account ${userId}` +
            `\n              status=${p.subscription_status ?? '—'} tier=${p.tier ?? '—'}` +
            ` period_end=${fmtIso(p.current_period_end)} has_used_trial=${p.has_used_trial ?? '—'}` +
            `\n              stripe_customer=${p.stripe_customer_id ?? '—'} stripe_sub=${p.stripe_subscription_id ?? '—'}`,
        );
      }
    }
  }

  // --- Stripe customers + subscriptions by email ---
  const customers = await stripe.customers.list({ email, limit: 10 });
  if (customers.data.length === 0) {
    console.log('   Stripe:   ❌ no customer for this email');
  } else {
    for (const c of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: c.id,
        status: 'all',
        limit: 10,
      });
      const subSummary =
        subs.data.length === 0
          ? 'no subscriptions'
          : subs.data
              .map((s) => {
                const item = s.items.data[0];
                const price = item?.price;
                const amount = price?.unit_amount != null ? `$${(price.unit_amount / 100).toFixed(0)}` : '—';
                const interval = price?.recurring?.interval ?? '—';
                const anyS = s as unknown as { current_period_end?: number };
                const periodEnd = item?.current_period_end ?? anyS.current_period_end;
                const stamp = s.metadata?.cohort6_extended_at ? ` cohort6✔(${s.metadata.cohort6_extended_at})` : '';
                return (
                  `\n              • sub ${s.id} [${s.status}] ${amount}/${interval}` +
                  ` period_end=${fmtTs(periodEnd)} trial_end=${fmtTs(s.trial_end)}` +
                  ` cancel_at_period_end=${s.cancel_at_period_end}${stamp}`
                );
              })
              .join('');
      console.log(`   Stripe:   ✅ customer ${c.id} (${subs.data.length} sub) ${subSummary}`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Auditing ${COHORT_EMAILS.length} cohort members (READ-ONLY):\n`);
  const emailToId = await buildEmailToIdMap();
  console.log(`Resolved ${emailToId.size} total auth accounts in this Supabase project.\n`);
  for (const email of COHORT_EMAILS) {
    try {
      await auditEmail(email, emailToId);
    } catch (err) {
      console.log(`   ⚠️  error auditing ${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('─'.repeat(72));
  console.log('\n✅ Audit complete. No changes were made.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
