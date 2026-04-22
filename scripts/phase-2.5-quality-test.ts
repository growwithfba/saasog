/**
 * Phase 2.5 — End-to-end quality test.
 *
 * Pulls SerpAPI `amazon_product` data for a hand-picked set of
 * competitor ASINs in one category, aggregates the reviews + Amazon
 * summaries + Amazon insights into analysis blocks, and runs the
 * existing Phase 2.2 Anthropic pipeline against them.
 *
 * Prints the SSP output so Dave can judge whether the quality matches
 * what an 80-review manual CSV upload produces today.
 *
 * Run with:
 *   npx tsx scripts/phase-2.5-quality-test.ts
 *
 * Costs: ~7-12 SerpAPI searches (~$0.18 max) + 2 Anthropic calls (~$0.05).
 */

// --- Env loader (no dotenv dep needed) ---
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

import { fetchProductDataMany, type ProductDataResult } from '../src/services/reviews/serpApiService';
import { generateReviewAnalysisFromBlocks } from '../src/services/analyzeAnthropic';

// Top 7 organic search results for "under sink organizer" on
// amazon.com, pulled via SerpAPI engine=amazon 2026-04-22. This is
// the competitive slate a BloomEngine user would be evaluating when
// they vet this market.
const TEST_ASINS = [
  'B0DNTQ2YNT', // Ukeetap Multi-Purpose Pull-Out
  'B0CHNL1JYB', // Kitstorack 2-Tier Slide Out
  'B0FZKCD3VF', // Under Sink Organizers 2 Pack
  'B0DDKSX2CW', // Sevenblue 2 Packs Height Adjustable
  'B0BNQ56MH5', // Delamu 2-Tier Bathroom
  'B0FP8VX1V7', // ADBIU Adjustable Height
  'B0D16YB4K6', // Kitstorack 2 Tier Slide Out
];

const CATEGORY_LABEL = 'under-sink organizers';

function formatBlocks(results: ProductDataResult[], failures: Array<{ asin: string; error: string }>): string[] {
  const blocks: string[] = [];

  // 1. Aggregate section: Amazon's AI summaries across the competitive set.
  const summaryLines: string[] = [];
  for (const r of results) {
    if (r.amazonSummary) {
      summaryLines.push(`- ${r.productTitle ? r.productTitle.slice(0, 80) : r.asin}: "${r.amazonSummary}"`);
    }
  }
  if (summaryLines.length > 0) {
    blocks.push(
      [
        `Amazon's "Customers say" summaries across ${summaryLines.length} competing ${CATEGORY_LABEL}:`,
        '',
        ...summaryLines,
      ].join('\n')
    );
  }

  // 2. Aggregate section: deduped insight tags Amazon has extracted.
  const insightSet = new Set<string>();
  for (const r of results) {
    if (r.amazonInsights) {
      for (const tag of r.amazonInsights) insightSet.add(tag);
    }
  }
  if (insightSet.size > 0) {
    blocks.push(
      [
        `Amazon-extracted topic tags across the competitive set:`,
        '',
        ...Array.from(insightSet).map((t) => `- ${t}`),
      ].join('\n')
    );
  }

  // 3. Individual review blocks — one review per block, rating-prefixed
  //    the way generateReviewAnalysisFromBlocks expects. No ASIN/product
  //    labels inside each block so the model doesn't reference them.
  for (const r of results) {
    for (const review of r.reviews) {
      const lines: string[] = [];
      if (review.rating) lines.push(`${review.rating} out of 5 stars`);
      if (review.title) lines.push(review.title);
      lines.push(review.body);
      blocks.push(lines.join('\n'));
    }
  }

  if (failures.length > 0) {
    console.log(`⚠️  ${failures.length} ASIN(s) failed to pull:`);
    for (const f of failures) console.log(`   ${f.asin}: ${f.error}`);
  }

  return blocks;
}

function summarizeAnalysis(analysis: any) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ANTHROPIC ANALYSIS OUTPUT');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (analysis.summary_stats) {
    const s = analysis.summary_stats;
    console.log('SUMMARY STATS:');
    console.log(`  Total: ${s.total_reviews ?? 'n/a'}`);
    console.log(`  Positive: ${s.positive_review_count ?? 'n/a'} (${s.positive_percentage ?? 'n/a'}%)`);
    console.log(`  Neutral:  ${s.neutral_review_count ?? 'n/a'} (${s.neutral_percentage ?? 'n/a'}%)`);
    console.log(`  Negative: ${s.negative_review_count ?? 'n/a'} (${s.negative_percentage ?? 'n/a'}%)\n`);
  }

  if (analysis.market_verdict) {
    console.log('MARKET VERDICT:');
    console.log(`  ${analysis.market_verdict}\n`);
  }

  if (Array.isArray(analysis.pain_clusters) && analysis.pain_clusters.length) {
    console.log(`PAIN CLUSTERS (${analysis.pain_clusters.length}):`);
    for (const c of analysis.pain_clusters) {
      console.log(`\n  [${c.ssp_category}] ${c.theme} — severity ${c.severity}/5, ${c.mention_percentage}%`);
      if (c.insight) console.log(`    insight: ${c.insight}`);
      if (c.opportunity) console.log(`    opportunity: ${c.opportunity}`);
      if (c.fixability?.note) console.log(`    fix path (${c.fixability.type}): ${c.fixability.note}`);
    }
    console.log('');
  }

  if (Array.isArray(analysis.praise_clusters) && analysis.praise_clusters.length) {
    console.log(`PRAISE CLUSTERS (${analysis.praise_clusters.length}):`);
    for (const c of analysis.praise_clusters) {
      console.log(`  - ${c.theme} (${c.mention_percentage}%) — ${c.insight || ''}`);
    }
    console.log('');
  }

  if (Array.isArray(analysis.seller_questions) && analysis.seller_questions.length) {
    console.log(`SELLER QUESTIONS (${analysis.seller_questions.length}):`);
    for (const q of analysis.seller_questions) {
      console.log(`  Q: ${q.question}`);
      if (q.why_it_matters) console.log(`     why: ${q.why_it_matters}`);
    }
    console.log('');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Phase 2.5 — SerpAPI Quality Test');
  console.log(`Category: ${CATEGORY_LABEL}`);
  console.log(`ASINs: ${TEST_ASINS.length}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[1/3] Pulling SerpAPI amazon_product data in parallel…');
  const t0 = Date.now();
  const { results, failures } = await fetchProductDataMany(TEST_ASINS);
  const pullMs = Date.now() - t0;

  const totalReviews = results.reduce((s, r) => s + r.reviews.length, 0);
  const withSummary = results.filter((r) => !!r.amazonSummary).length;
  const withInsights = results.filter((r) => !!r.amazonInsights?.length).length;
  console.log(`      Got ${results.length}/${TEST_ASINS.length} ASINs in ${pullMs}ms`);
  console.log(`      ${totalReviews} review bodies · ${withSummary} Amazon summaries · ${withInsights} insight sets\n`);

  if (results.length === 0) {
    console.error('❌ No ASINs returned data. Aborting.');
    process.exit(1);
  }

  console.log('[2/3] Building analysis blocks…');
  const blocks = formatBlocks(results, failures);
  console.log(`      ${blocks.length} blocks (including 1 aggregated-summary + 1 aggregated-insights meta-block)\n`);

  // Show Dave a sample of what we're feeding the model so he can audit.
  console.log('SAMPLE OF ANALYSIS INPUT (first 2 blocks):');
  console.log('───────────────────────────────────────────');
  console.log(blocks[0]?.slice(0, 500));
  console.log('───────────────────────────────────────────');
  console.log(blocks[1]?.slice(0, 500));
  console.log('───────────────────────────────────────────\n');

  console.log('[3/3] Running generateReviewAnalysisFromBlocks (Sonnet deep + Haiku mechanical)…');
  const t1 = Date.now();
  const analysis = await generateReviewAnalysisFromBlocks(blocks, { userId: null });
  const analyzeMs = Date.now() - t1;
  console.log(`      Anthropic pipeline returned in ${analyzeMs}ms`);

  summarizeAnalysis(analysis);

  console.log(`\n✅ Test complete. Pull time ${pullMs}ms · Analysis time ${analyzeMs}ms.`);
}

main().catch((e) => {
  console.error('[quality-test] failed:', e);
  process.exit(1);
});
