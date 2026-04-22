/**
 * Phase 2.5 — SerpAPI validation pilot.
 *
 * Goal: before wiring any user-facing UI, confirm SerpAPI's Amazon
 * Reviews engine actually returns usable data on a generic spread of
 * ASINs. We're testing for:
 *
 *   - Volume: ≥60 reviews returned out of 100 requested per ASIN
 *   - Freshness: at least one review from the last 12 months
 *   - Latency: under 60s for a 100-review pull (10 pages, sequential)
 *   - Field coverage: body, rating, date, verified-purchase populated
 *
 * The pilot is a Node script — no Next.js, no Supabase, no React. It
 * imports the SerpApi service directly, hits 5 hand-picked ASINs across
 * different category profiles, and prints a verdict to stdout.
 *
 * Run with:
 *   npx tsx scripts/phase-2.5-pilot-serpapi.ts
 *
 * Reads SERPAPI_API_KEY from .env.local (loaded via dotenv if present).
 *
 * If a category fails the bar, the script exits non-zero and we
 * escalate to Dave before continuing the build.
 */

// Load .env.local so SERPAPI_API_KEY is in process.env before the
// service imports it. Manual loader — no dep on dotenv.
import * as fs from 'fs';
import * as path from 'path';
(() => {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

import { serpApiService } from '../src/services/reviews/serpApiService';

interface PilotAsin {
  asin: string;
  category: string;
  expectedProfile: string;
}

// Generic spread covering the kinds of markets BloomEngine users vet.
// We're not validating that we LIKE these products — we're confirming
// the SerpAPI engine returns clean data across review-volume profiles.
const PILOT_ASINS: PilotAsin[] = [
  { asin: 'B07ZPKBL9V', category: 'consumer electronics', expectedProfile: 'high review volume' },
  { asin: 'B08L5TNJHG', category: 'kitchen / home', expectedProfile: 'mid review volume' },
  { asin: 'B0BW1K3F3R', category: 'fitness / sports', expectedProfile: 'mid review volume' },
  { asin: 'B0DH5SVL5T', category: 'pet supplies', expectedProfile: 'recently launched' },
  { asin: 'B07VGRJDFY', category: 'office supplies', expectedProfile: 'mature listing' },
];

const TARGET_LIMIT = 100;
const ACCEPTANCE_MIN_REVIEWS = 60;
const ACCEPTANCE_MIN_RECENT_REVIEWS = 1;
const ACCEPTANCE_MAX_LATENCY_MS = 60_000;

interface PerAsinResult {
  asin: string;
  category: string;
  ok: boolean;
  reasons: string[];
  count: number;
  recentCount: number;
  latencyMs: number;
  newestDate?: string;
  oldestDate?: string;
  verifiedPct: number;
  withRating: number;
  sampleBody?: string;
  error?: string;
}

function monthsAgo(iso: string | undefined): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

async function pilotOne(target: PilotAsin): Promise<PerAsinResult> {
  process.stdout.write(`\n[${target.asin}] ${target.category}: pulling ${TARGET_LIMIT} reviews… `);
  try {
    const result = await serpApiService.fetchReviews(target.asin, { limit: TARGET_LIMIT });
    const reasons: string[] = [];

    const recentCount = result.reviews.filter((r) => monthsAgo(r.date) <= 12).length;
    const verifiedCount = result.reviews.filter((r) => r.verifiedPurchase).length;
    const withRating = result.reviews.filter((r) => typeof r.rating === 'number' && r.rating > 0).length;

    const dates = result.reviews.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
    const newestDate = dates.length ? dates[dates.length - 1] : undefined;
    const oldestDate = dates.length ? dates[0] : undefined;

    if (result.reviews.length < ACCEPTANCE_MIN_REVIEWS) {
      reasons.push(`only ${result.reviews.length} reviews (min ${ACCEPTANCE_MIN_REVIEWS})`);
    }
    if (recentCount < ACCEPTANCE_MIN_RECENT_REVIEWS) {
      reasons.push(`only ${recentCount} recent (≤12mo) reviews`);
    }
    if (result.latencyMs > ACCEPTANCE_MAX_LATENCY_MS) {
      reasons.push(`latency ${result.latencyMs}ms exceeds ${ACCEPTANCE_MAX_LATENCY_MS}ms cap`);
    }

    process.stdout.write(`got ${result.reviews.length} in ${result.latencyMs}ms\n`);

    return {
      asin: target.asin,
      category: target.category,
      ok: reasons.length === 0,
      reasons,
      count: result.reviews.length,
      recentCount,
      latencyMs: result.latencyMs,
      newestDate,
      oldestDate,
      verifiedPct: result.reviews.length
        ? Math.round((verifiedCount / result.reviews.length) * 100)
        : 0,
      withRating,
      sampleBody: result.reviews[0]?.body?.slice(0, 200),
    };
  } catch (e) {
    process.stdout.write(`FAIL: ${e instanceof Error ? e.message : String(e)}\n`);
    return {
      asin: target.asin,
      category: target.category,
      ok: false,
      reasons: ['provider threw'],
      count: 0,
      recentCount: 0,
      latencyMs: 0,
      verifiedPct: 0,
      withRating: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Phase 2.5 — SerpAPI Validation Pilot');
  console.log(`Pulling ${TARGET_LIMIT} reviews per ASIN across ${PILOT_ASINS.length} ASINs`);
  console.log('═══════════════════════════════════════════════════════════');

  const results: PerAsinResult[] = [];
  for (const target of PILOT_ASINS) {
    results.push(await pilotOne(target));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const passing = results.filter((r) => r.ok).length;
  console.log(`\n${passing}/${results.length} ASINs passed the acceptance bar.\n`);

  console.log('| ASIN       | Category            | Count | Recent | Latency | Verified | Newest     | Status |');
  console.log('|------------|---------------------|-------|--------|---------|----------|------------|--------|');
  for (const r of results) {
    const status = r.ok ? '✅ OK' : '❌ FAIL';
    console.log(
      `| ${r.asin} | ${r.category.padEnd(19)} | ${String(r.count).padStart(5)} | ` +
      `${String(r.recentCount).padStart(6)} | ${String(r.latencyMs + 'ms').padStart(7)} | ` +
      `${String(r.verifiedPct + '%').padStart(8)} | ${(r.newestDate || 'n/a').padEnd(10)} | ${status} |`
    );
  }

  for (const r of results) {
    if (!r.ok) {
      console.log(`\n[${r.asin}] failure reasons: ${r.reasons.join('; ')}`);
      if (r.error) console.log(`  error: ${r.error}`);
    }
  }

  if (results.some((r) => r.sampleBody)) {
    const sample = results.find((r) => r.sampleBody);
    console.log('\nSample review body (first 200 chars):');
    console.log(`  "${sample!.sampleBody}"`);
  }

  if (passing === results.length) {
    console.log('\n✅ ALL ASINs passed. Safe to proceed with Rainforest fallback + UI wiring.');
    process.exit(0);
  } else {
    console.log('\n❌ Some ASINs failed the bar. Escalate to Dave before proceeding.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[pilot] unexpected error:', e);
  process.exit(2);
});
