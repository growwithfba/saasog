/**
 * Cohort revoke — flip comped cohort members back to FREE.
 *
 * Companion to cohort-comp.ts. Run this at the 6-month mark (or whenever
 * you want to end the comp). Reverses the comp by setting:
 *   subscription_status = 'FREE'
 *   tier                = null
 * and clearing current_period_end.
 *
 * By default only revokes members whose current_period_end is already in
 * the PAST (i.e., their comp window has elapsed) — so it's safe to run
 * early without cutting anyone off prematurely. Use --all to revoke every
 * cohort member regardless of end date.
 *
 * Usage:
 *   npx tsx scripts/cohort-revoke.ts            # DRY RUN — expired-only
 *   npx tsx scripts/cohort-revoke.ts --apply    # revoke expired members
 *   npx tsx scripts/cohort-revoke.ts --apply --all   # revoke ALL cohort members now
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { COHORT_EMAILS } from './cohortMembers';

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

// Roster lives in one place now — see scripts/cohortMembers.ts for why.

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

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
    `${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'} — revoke ${ALL ? 'ALL cohort members' : 'expired-only'}` +
      `   🗄️  ${new URL(supabaseUrl!).host}\n`,
  );
  const now = new Date();
  const emailToId = await buildEmailToIdMap();
  let count = 0;

  for (const email of COHORT_EMAILS) {
    const userId = emailToId.get(email.toLowerCase());
    if (!userId) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, tier, current_period_end')
      .eq('id', userId)
      .maybeSingle();

    const end = profile?.current_period_end ? new Date(profile.current_period_end) : null;
    const expired = end ? end.getTime() <= now.getTime() : true;

    if (!ALL && !expired) {
      console.log(
        `⏭️  ${email} — still within comp window (ends ${end?.toISOString().slice(0, 10)}), skipping.`,
      );
      continue;
    }

    console.log(`↩️  ${email} — ${profile?.subscription_status ?? '—'}/${profile?.tier ?? '—'} → FREE/null`);
    if (APPLY) {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_status: 'FREE', tier: null, current_period_end: null })
        .eq('id', userId);
      if (error) console.log(`     ⚠️ update failed: ${error.message}`);
      else console.log('     💾 revoked.');
    }
    count += 1;
  }

  console.log('─'.repeat(60));
  console.log(`${APPLY ? 'Revoked' : 'Would revoke'}: ${count}`);
  if (!APPLY) console.log('Dry run only. Re-run with --apply to execute.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
