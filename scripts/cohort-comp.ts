/**
 * Cohort comp — grant 6 months of full (Pro) BloomEngine + BloomLens access.
 *
 * These cohort members are NOT on Stripe (Groupon-style, Supabase-comped).
 * Access is granted purely by profile columns, verified against both gates:
 *   - Web app  (SubscriptionCheck): tier='pro' grants access.
 *   - Extension (deriveLensTier):   subscription_status='ACTIVE' + tier='pro'
 *                                   → Pro features.
 *
 * Per member WITH an account we set:
 *   subscription_status = 'ACTIVE'
 *   tier                = 'pro'
 *   current_period_end  = max(existing end, today) + 6 months   ← dated marker
 *
 * Members WITHOUT an account are skipped (they must self-register first;
 * re-run this script once they have).
 *
 * Members already covered ≥6 months out are skipped unless --force
 * (guards against accidental double-extension on re-run).
 *
 * Usage:
 *   npx tsx scripts/cohort-comp.ts            # DRY RUN (default) — shows plan
 *   npx tsx scripts/cohort-comp.ts --apply    # writes changes
 *   npx tsx scripts/cohort-comp.ts --apply --force   # also re-extends already-covered members
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';
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

const COMP_MONTHS = 6;
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** Add N calendar months to a Date (clamps day for short months). */
function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + months);
  if (r.getUTCDate() < day) r.setUTCDate(0); // rolled over → last day of intended month
  return r;
}

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

async function buildEmailToIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(`⚠️  auth.admin.listUsers error: ${error.message}`);
      break;
    }
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return map;
}

async function main(): Promise<void> {
  console.log(
    `${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} — comp ${COMP_MONTHS} months` +
      `${FORCE ? ' (force)' : ''}   🗄️  ${new URL(supabaseUrl!).host}\n`,
  );

  const now = new Date();
  const emailToId = await buildEmailToIdMap();

  let willChange = 0;
  const skippedNoAccount: string[] = [];
  const skippedCovered: string[] = [];

  for (const email of COHORT_EMAILS) {
    const userId = emailToId.get(email.toLowerCase());
    if (!userId) {
      console.log(`⏭️  ${email}\n     no account — must self-register first, then re-run.\n`);
      skippedNoAccount.push(email);
      continue;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_status, tier, current_period_end')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.log(`⚠️  ${email}\n     profile query error: ${error.message}\n`);
      continue;
    }

    const existingEnd =
      profile?.current_period_end != null ? new Date(profile.current_period_end) : null;
    const validExistingEnd =
      existingEnd && !Number.isNaN(existingEnd.getTime()) && existingEnd.getTime() > now.getTime()
        ? existingEnd
        : null;

    const sixOut = addMonths(now, COMP_MONTHS);

    // Guard: already covered ≥ COMP_MONTHS out → skip unless --force.
    if (validExistingEnd && validExistingEnd.getTime() >= sixOut.getTime() && !FORCE) {
      console.log(
        `⏭️  ${email}\n     already covered to ${fmt(validExistingEnd)} (≥${COMP_MONTHS}mo out) — skipping. Use --force to add ${COMP_MONTHS}mo on top.\n`,
      );
      skippedCovered.push(email);
      continue;
    }

    // Target = max(existing future end, today) + 6 months ("tack on").
    const base = validExistingEnd ?? now;
    const target = addMonths(base, COMP_MONTHS);

    console.log(
      `✅ ${email}\n     status ${profile?.subscription_status ?? '—'} → ACTIVE` +
        ` | tier ${profile?.tier ?? '—'} → pro` +
        ` | end ${fmt(validExistingEnd)} → ${fmt(target)}`,
    );

    if (APPLY) {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          subscription_status: 'ACTIVE',
          tier: 'pro',
          current_period_end: target.toISOString(),
        })
        .eq('id', userId);
      if (upErr) console.log(`     ⚠️ update failed: ${upErr.message}`);
      else console.log(`     💾 written.`);
    }
    console.log('');
    willChange += 1;
  }

  console.log('─'.repeat(60));
  console.log(
    `${APPLY ? 'Applied' : 'Would change'}: ${willChange}` +
      ` | no-account (skipped): ${skippedNoAccount.length}` +
      ` | already-covered (skipped): ${skippedCovered.length}`,
  );
  if (skippedNoAccount.length)
    console.log(`  ↳ need to self-register: ${skippedNoAccount.join(', ')}`);
  if (skippedCovered.length)
    console.log(`  ↳ already covered (use --force to extend): ${skippedCovered.join(', ')}`);
  if (!APPLY) console.log('\nDry run only — no changes written. Re-run with --apply to execute.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
