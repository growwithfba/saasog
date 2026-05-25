/**
 * probe-meta-test-events.ts
 * ----------------------------------------------------------------------------
 * Verification probe for the remaining 4 Meta CAPI events that can't be
 * easily integration-tested on the Vercel preview:
 *   - Lead (from /register success branch)
 *   - StartTrial (from /register success branch)
 *   - Subscribe (from Stripe customer.subscription.created webhook)
 *   - Purchase (from Stripe invoice.paid webhook)
 *
 * Why this exists instead of E2E:
 *   - Stripe is in LIVE mode + the webhook endpoint in Stripe Dashboard
 *     points at prod (bloomengine.ai), not preview. So a real signup on
 *     preview wouldn't fire Subscribe/Purchase events to our preview's
 *     CAPI route.
 *   - The wiring (page → fireMetaEvent or webhook → sendMetaCAPIEvent) is
 *     trivial; if the CAPI lib works for all 4 event shapes, we trust the
 *     callers via code review.
 *
 * Usage:
 *   npx tsx scripts/probes/probe-meta-test-events.ts
 *
 * Expected outcome:
 *   - Script prints { ok: true, ... } for each of the 4 events.
 *   - Meta Events Manager → Test Events tab shows 4 new "Server" rows with
 *     the test_event_code from .env.local (TEST82601 at time of writing).
 *
 * Master-Playbook §3 Friday-launch gate: all 5 events must fire before we
 * point paid Meta ads at the funnel. Combined with the 3 events already
 * verified on the live preview (PageView, Lead-install_intent,
 * Lead-email_capture), this probe closes out the remaining 2 + reconfirms
 * Lead/StartTrial firing patterns from the signup branch.
 * ----------------------------------------------------------------------------
 */

import * as fs from 'fs';
import * as path from 'path';

// Minimal .env.local loader (same pattern as other probes in this repo).
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.error('[probe] could not read .env.local — META env vars must be set in shell');
}

import { sendMetaCAPIEvent } from '../../src/lib/meta-capi.server';
import { randomUUID } from 'crypto';

// Mock customer — represents a realistic BloomEngine Pro signup. Email is
// a +meta-test alias so the events are visually separable from real signups
// in Events Manager if someone goes looking.
const MOCK = {
  email: 'dave+meta-probe@growwithfba.com',
  first_name: 'Dave',
  last_name: 'Keefe',
  external_id: 'mock-supabase-user-id-c4f7e9a1', // would be a real Supabase user_id in prod
  subscription_id: 'sub_mock_1Mz9xX2eZvKYlo2C', // Stripe subscription ID format
};

const PROBE_URL = 'https://bloomengine.ai/probe-test'; // event_source_url; not a real visit

async function main() {
  console.log('━'.repeat(72));
  console.log('Meta CAPI Test-Event Probe');
  console.log('━'.repeat(72));
  console.log(`Pixel ID         : ${process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '(missing)'}`);
  console.log(`CAPI token       : ${process.env.META_CAPI_TOKEN ? '✓ set (hidden)' : '✗ MISSING'}`);
  console.log(`Test event code  : ${process.env.META_TEST_EVENT_CODE ?? '(missing — events will fire LIVE)'}`);
  console.log('━'.repeat(72));

  if (!process.env.NEXT_PUBLIC_META_PIXEL_ID || !process.env.META_CAPI_TOKEN) {
    console.error('Aborting: required env vars not loaded.');
    process.exit(1);
  }
  if (!process.env.META_TEST_EVENT_CODE) {
    console.error('Aborting: META_TEST_EVENT_CODE not set — refusing to fire LIVE events from a probe.');
    process.exit(1);
  }

  // ── Event 1: Lead (from /register success branch) ────────────────────────
  console.log('\n[1/4] Firing Lead (register_success)...');
  const lead = await sendMetaCAPIEvent({
    event_name: 'Lead',
    event_id: `probe_lead_${randomUUID()}`,
    event_source_url: PROBE_URL,
    action_source: 'website',
    user_data: {
      email: MOCK.email,
      first_name: MOCK.first_name,
      last_name: MOCK.last_name,
      external_id: MOCK.external_id,
    },
    custom_data: {
      content_name: 'register_success',
      content_category: 'saas_signup',
    },
  });
  console.log('     →', lead.ok ? '✓ ok' : `✗ FAILED: ${lead.error}`);

  // ── Event 2: StartTrial (from /register success branch) ──────────────────
  console.log('\n[2/4] Firing StartTrial (bloomengine_pro_trial)...');
  const startTrial = await sendMetaCAPIEvent({
    event_name: 'StartTrial',
    event_id: `probe_trial_${randomUUID()}`,
    event_source_url: PROBE_URL,
    action_source: 'website',
    user_data: {
      email: MOCK.email,
      first_name: MOCK.first_name,
      last_name: MOCK.last_name,
      external_id: MOCK.external_id,
    },
    custom_data: {
      content_name: 'bloomengine_pro_trial',
      content_category: 'saas',
      currency: 'USD',
      value: 0,
    },
  });
  console.log('     →', startTrial.ok ? '✓ ok' : `✗ FAILED: ${startTrial.error}`);

  // ── Event 3: Subscribe (from Stripe customer.subscription.created) ──────
  console.log('\n[3/4] Firing Subscribe (subscription_month)...');
  const subscribe = await sendMetaCAPIEvent({
    event_name: 'Subscribe',
    event_id: `probe_sub_${MOCK.subscription_id}_${randomUUID()}`,
    action_source: 'website',
    user_data: {
      email: MOCK.email,
      first_name: MOCK.first_name,
      last_name: MOCK.last_name,
      external_id: MOCK.external_id,
      subscription_id: MOCK.subscription_id,
    },
    custom_data: {
      value: 99.0, // Pro monthly
      currency: 'USD',
      content_name: 'subscription_month',
      content_category: 'saas',
      subscription_id: MOCK.subscription_id,
    },
  });
  console.log('     →', subscribe.ok ? '✓ ok' : `✗ FAILED: ${subscribe.error}`);

  // ── Event 4: Purchase (from Stripe invoice.paid) ─────────────────────────
  console.log('\n[4/4] Firing Purchase (subscription_invoice_paid)...');
  const purchase = await sendMetaCAPIEvent({
    event_name: 'Purchase',
    event_id: `probe_inv_in_mock_${randomUUID()}`,
    action_source: 'website',
    user_data: {
      email: MOCK.email,
      first_name: MOCK.first_name,
      last_name: MOCK.last_name,
      external_id: MOCK.external_id,
      subscription_id: MOCK.subscription_id,
    },
    custom_data: {
      value: 99.0, // first paid invoice after trial
      currency: 'USD',
      content_name: 'subscription_invoice_paid',
      content_category: 'saas',
      subscription_id: MOCK.subscription_id,
    },
  });
  console.log('     →', purchase.ok ? '✓ ok' : `✗ FAILED: ${purchase.error}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(72));
  const allOk = [lead, startTrial, subscribe, purchase].every((r) => r.ok);
  if (allOk) {
    console.log('✓ All 4 events accepted by Meta Graph API.');
    console.log(`\nNext: open Meta Events Manager → Test Events tab and confirm`);
    console.log(`4 new Server-side rows appear:`);
    console.log(`   • Lead              (content_name: register_success)`);
    console.log(`   • StartTrial        (content_name: bloomengine_pro_trial)`);
    console.log(`   • Subscribe         (content_name: subscription_month, value: $99)`);
    console.log(`   • Purchase          (content_name: subscription_invoice_paid, value: $99)`);
    console.log(`\nIf all 4 appear → Master-Playbook §3 Friday-launch gate is PASSED.`);
  } else {
    console.error('✗ One or more events failed — see logs above.');
    process.exit(1);
  }
  console.log('━'.repeat(72));
}

main().catch((err) => {
  console.error('Probe crashed:', err);
  process.exit(1);
});
