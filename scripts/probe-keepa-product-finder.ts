/**
 * Probe: does Keepa's Product Finder (`/query`) cover Helium 10 Black Box's
 * filter grid? Run with `npx tsx scripts/probe-keepa-product-finder.ts`.
 *
 * Keepa SILENTLY IGNORES unknown selection fields — an unrecognised filter
 * returns the unfiltered result set rather than an error. So "accepted" proves
 * nothing. Each candidate is therefore verified by asserting that adding it
 * MOVES totalResults away from an unfiltered baseline in the same category.
 *
 * Cost: 11 tokens per call. ~40 calls ≈ 440 tokens.
 */
import * as fs from 'fs';
import * as path from 'path';

try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const KEEPA_BASE_URL = 'https://api.keepa.com';
const APIKEY = process.env.KEEPA_API_KEY;
if (!APIKEY) throw new Error('KEEPA_API_KEY missing');

// Arts, Crafts & Sewing (US) — the category in Dave's Black Box screenshot.
const CATEGORY = 2617941011;
/** totalResults drifts by ~100 between identical calls; treat <0.1% as no-op. */
const NOISE = 0.001;

const BASE: Record<string, unknown> = {
  categories_include: [CATEGORY],
  productType: [0, 1],
  perPage: 50,
  page: 0,
};

interface QueryResult {
  totalResults?: number;
  asinList?: string[];
  tokensLeft?: number;
  tokensConsumed?: number;
  error?: { message: string; type: string };
}

async function query(extra: Record<string, unknown>): Promise<QueryResult> {
  const selection = JSON.stringify({ ...BASE, ...extra });
  const url =
    `${KEEPA_BASE_URL}/query?key=${APIKEY}&domain=1` +
    `&selection=${encodeURIComponent(selection)}`;
  const res = await fetch(url);
  return (await res.json()) as QueryResult;
}

/** H10 Black Box field -> candidate Keepa selection field(s). */
const CANDIDATES: { h10: string; keepa: string; kind?: 'sort'; probe: Record<string, unknown> }[] = [
  // ---- Product column -------------------------------------------------
  { h10: 'Category & Subcategory', keepa: 'categories_include', probe: { categories_include: [3251951011] } },
  { h10: 'Category (exclude)',     keepa: 'categories_exclude', probe: { categories_exclude: [3251951011] } },
  { h10: 'Review Count',           keepa: 'current_COUNT_REVIEWS', probe: { current_COUNT_REVIEWS_gte: 100, current_COUNT_REVIEWS_lte: 500 } },
  { h10: 'Review Rating',          keepa: 'current_RATING', probe: { current_RATING_gte: 40, current_RATING_lte: 48 } },
  { h10: 'Best Seller Rank (BSR)', keepa: 'current_SALES', probe: { current_SALES_gte: 1, current_SALES_lte: 50000 } },
  { h10: 'Listing Age (Months)',   keepa: 'listedSince', probe: { listedSince_gte: 6000000 } },
  { h10: 'Listing Age alt',        keepa: 'trackingSince', probe: { trackingSince_gte: 6000000 } },
  { h10: 'Weight (lb)',            keepa: 'itemWeight', probe: { itemWeight_gte: 100, itemWeight_lte: 5000 } },
  { h10: 'Weight (package)',       keepa: 'packageWeight', probe: { packageWeight_gte: 100, packageWeight_lte: 5000 } },
  { h10: 'Shipping Size',          keepa: 'packageLength', probe: { packageLength_gte: 50, packageLength_lte: 400 } },
  { h10: 'Fulfillment (FBA)',      keepa: 'buyBoxIsFBA', probe: { buyBoxIsFBA: true } },
  { h10: 'Fulfillment (AMZ)',      keepa: 'current_AMAZON', probe: { current_AMAZON_gte: 1 } },
  { h10: 'Freq. Returned Badge',   keepa: 'returnRate', probe: { returnRate_gte: 1 } },
  { h10: 'Number of Images',       keepa: 'imageCount', probe: { imageCount_gte: 5, imageCount_lte: 9 } },
  { h10: 'Variation Count',        keepa: 'variationCount', probe: { variationCount_gte: 2, variationCount_lte: 10 } },
  { h10: 'Title Keywords',         keepa: 'title', probe: { title: 'bead' } },

  // ---- Competitors column ---------------------------------------------
  { h10: 'Number of Sellers',      keepa: 'current_COUNT_NEW', probe: { current_COUNT_NEW_gte: 1, current_COUNT_NEW_lte: 3 } },
  { h10: 'Exact Brand Search',     keepa: 'brand', probe: { brand: ['darice'] } },
  { h10: 'Exclude Brands',         keepa: 'brand (negate?)', probe: { brand: ['!darice'] } },
  { h10: 'Exact Seller Search',    keepa: 'sellerIds', probe: { sellerIds: ['ATVPDKIKX0DER'] } },
  { h10: 'Buy Box seller',         keepa: 'buyBoxSellerId', probe: { buyBoxSellerId: ['ATVPDKIKX0DER'] } },

  // ---- Sales column ----------------------------------------------------
  { h10: 'Price',                  keepa: 'current_NEW', probe: { current_NEW_gte: 2000, current_NEW_lte: 7000 } },
  { h10: 'Price (Buy Box)',        keepa: 'current_BUY_BOX_SHIPPING', probe: { current_BUY_BOX_SHIPPING_gte: 2000, current_BUY_BOX_SHIPPING_lte: 7000 } },
  { h10: 'Price Change (%)',       keepa: 'deltaPercent90_NEW', probe: { deltaPercent90_NEW_gte: 5 } },
  { h10: 'Price Change 30d',       keepa: 'deltaPercent30_NEW', probe: { deltaPercent30_NEW_gte: 5 } },
  { h10: 'ASIN Sales (units)',     keepa: 'monthlySold', probe: { monthlySold_gte: 100, monthlySold_lte: 5000 } },
  { h10: 'Sales Change (%)',       keepa: 'deltaPercent90_SALES', probe: { deltaPercent90_SALES_gte: 5 } },
  { h10: 'Sales rank drops 30d',   keepa: 'salesRankDrops30', probe: { salesRankDrops30_gte: 10 } },
  { h10: 'Sales rank drops 90d',   keepa: 'salesRankDrops90', probe: { salesRankDrops90_gte: 10 } },
  { h10: 'Avg BSR 90d',            keepa: 'avg90_SALES', probe: { avg90_SALES_gte: 1, avg90_SALES_lte: 50000 } },
  { h10: 'Revenue (no direct)',    keepa: 'revenue', probe: { revenue_gte: 1000 } },
  { h10: 'Out of stock %',         keepa: 'outOfStockPercentage90', probe: { outOfStockPercentage90_gte: 5 } },

  // ---- Sort / paging ----------------------------------------------------
  { h10: 'Sort by BSR desc',       keepa: 'sort', kind: 'sort', probe: { sort: [['current_SALES', 'desc']] } },
  { h10: 'Sort by monthlySold',    keepa: 'sort', kind: 'sort', probe: { sort: [['monthlySold', 'desc']] } },
];

async function main() {
  console.log('=== Keepa Product Finder (/query) coverage probe ===\n');

  const baseline = await query({});
  if (baseline.error) throw new Error(`baseline failed: ${JSON.stringify(baseline.error)}`);
  const baseTotal = baseline.totalResults ?? -1;
  console.log(`Baseline (category ${CATEGORY}, productType [0,1]): totalResults=${baseTotal}`);
  console.log(`Baseline first 3 ASINs: ${(baseline.asinList ?? []).slice(0, 3).join(', ')}\n`);

  const rows: string[] = [];
  for (const c of CANDIDATES) {
    const r = await query(c.probe);
    let verdict: string;
    if (r.error) {
      verdict = `REJECTED (${r.error.type}: ${r.error.message})`;
    } else if (c.kind === 'sort') {
      // Sort does not change totalResults — it reorders. Compare the ASINs.
      const same = JSON.stringify(r.asinList) === JSON.stringify(baseline.asinList);
      verdict = same ? 'IGNORED (order identical to baseline)' : `WORKS (order changed: ${(r.asinList ?? [])[0]})`;
    } else if (Math.abs(((r.totalResults ?? 0) - baseTotal) / baseTotal) < NOISE) {
      // Keepa's totalResults drifts ~+/-100 between calls and unknown fields
      // are silently ignored, so anything inside the noise band is a no-op.
      verdict = `IGNORED (within noise of baseline ${baseTotal})`;
    } else {
      verdict = `WORKS (totalResults=${r.totalResults})`;
    }
    const line = `${c.h10.padEnd(26)} | ${c.keepa.padEnd(26)} | ${verdict}`;
    console.log(line);
    rows.push(line);
  }

  console.log('\n--- Pagination limits ---');
  for (const [pp, pg] of [[50, 0], [50, 199], [50, 200], [10000, 0]] as [number, number][]) {
    const r = await query({ perPage: pp, page: pg });
    console.log(
      `perPage=${pp} page=${pg} -> ` +
        (r.error ? `ERR ${r.error.message}` : `${(r.asinList ?? []).length} asins`),
    );
  }

  const tail = await query({});
  console.log(`\nTokens left after probe: ${tail.tokensLeft}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
