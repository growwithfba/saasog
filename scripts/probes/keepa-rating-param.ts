/**
 * Probe — does Keepa need `&rating=1` to return csv[16]/csv[17] (rating +
 * rating count)?
 *
 * Our /api/extension/enrich currently sends `&stats=180&history=1` and
 * reads `stats.current[17]` for the per-ASIN review count. The cached
 * keepa_lens_metrics for two known products (one valid top-seller, one
 * suspect outlier) both stored reviews: null, so something's off in the
 * request shape.
 *
 * Goal: determine the minimum URL parameters needed to get a populated
 * csv[16] (rating × 10) and csv[17] (rating/review count) for a known
 * top product. Then update enrich/route.ts.
 *
 * Run with: `npx tsx scripts/probes/keepa-rating-param.ts`
 */
import * as fs from 'fs';
import * as path from 'path';

try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEY = process.env.KEEPA_API_KEY;
if (!KEY) {
  console.error('KEEPA_API_KEY missing from env. Exit.');
  process.exit(1);
}

// TheraICE variation family. SERP DOM shows IDENTICAL 43,519 reviews on
// each of the 4 children's cards (verified via production data corpus
// query). If Keepa returns identical csv[17] for each, the per-child
// reviews are aggregated upstream (variation-tree share-reviews) — and
// "divert to Keepa per child" doesn't fully solve the variation case. If
// Keepa returns DIFFERENT per-child counts, then SERP is aggregating
// and Keepa is the per-child truth we want.
const ASINS = ['B0CBSQVMHM', 'B0D9BWY9MP', 'B0CNKPLFK5', 'B0CBCVS3XX'];

type Variant = {
  label: string;
  params: string;
};

const VARIANTS: Variant[] = [
  // Confirmed working variant from prior run.
  { label: 'stats=180&history=1&rating=1', params: '&stats=180&history=1&rating=1' },
];

function summarize(product: any) {
  const stats = product?.stats ?? {};
  const cur: number[] = Array.isArray(stats.current) ? stats.current : [];
  const csv: any[] = Array.isArray(product?.csv) ? product.csv : [];
  const csv16: number[] = Array.isArray(csv[16]) ? csv[16] : [];
  const csv17: number[] = Array.isArray(csv[17]) ? csv[17] : [];

  return {
    asin: product?.asin,
    title: (product?.title || '').slice(0, 60),
    'stats.current[16] (rating ×10)': cur[16] ?? '∅',
    'stats.current[17] (review count)': cur[17] ?? '∅',
    'csv[16].length (rating history pts)': csv16.length,
    'csv[17].length (review count history pts)': csv17.length,
    'csv[16] last value (rating ×10)':
      csv16.length >= 2 ? csv16[csv16.length - 1] : '∅',
    'csv[17] last value (review count)':
      csv17.length >= 2 ? csv17[csv17.length - 1] : '∅',
  };
}

async function fetchVariant(asin: string, variant: Variant) {
  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${KEY}` +
    `&domain=1` + // US
    `&asin=${asin}` +
    variant.params;
  const t0 = Date.now();
  const res = await fetch(url);
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    return { error: `HTTP ${res.status} (${elapsed}ms)`, elapsed };
  }
  const body = (await res.json()) as any;
  const product = Array.isArray(body?.products) ? body.products[0] : null;
  return {
    elapsed,
    tokensConsumed: body?.tokensConsumed ?? null,
    tokensLeft: body?.tokensLeft ?? null,
    refillRate: body?.refillRate ?? null,
    summary: product ? summarize(product) : { error: 'No product in response' },
  };
}

(async () => {
  for (const asin of ASINS) {
    console.log(`\n=== ${asin} ===`);
    for (const variant of VARIANTS) {
      console.log(`\n--- variant: ${variant.label} ---`);
      const result = await fetchVariant(asin, variant);
      console.log(JSON.stringify(result, null, 2));
      // Be polite to Keepa.
      await new Promise((r) => setTimeout(r, 400));
    }
  }
})();
