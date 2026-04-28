/**
 * Phase 5.1 probe — Keepa /product batched call for the Chrome extension Xray.
 *
 * What this verifies before we touch any extension code:
 *   1. The ACTUAL rate-limit / token-bucket signal returned on Dave's €58/mo
 *      plan (response headers AND response-body fields). The spec assumed
 *      `X-RateLimit-*` headers; in practice Keepa returns this in the JSON
 *      body (`tokensLeft`, `tokensConsumed`, `refillRate`, `refillIn`).
 *   2. Coverage of `monthlySold` across a real batch (we expect <30%).
 *   3. Per-ASIN field shape against the 22-column Xray schema.
 *   4. Total response time on a single batched call (informs whether the
 *      side panel can block on enrichment or needs streaming/polling).
 *
 * Run with: `npx tsx scripts/probes/keepa-xray.ts`
 */
import * as fs from 'fs';
import * as path from 'path';

// Minimal .env.local loader so we don't pull in dotenv.
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const KEEPA_BASE_URL = 'https://api.keepa.com';

// 25 real ASINs harvested from existing repo fixtures (samples/test_competitors.csv,
// keepa-images probe, recent-asins probe, etc.) plus a few additional verified
// ASINs from prior research. Niche doesn't matter — Keepa response shape is
// uniform across categories.
const ASINS = [
  'B0009KF59M',
  'B01KZ5X6Z0',
  'B01N1ZOZ8I',
  'B0756MFCKJ', // GADFISH basketball return
  'B078H3X479', // STELTUX basketball return
  'B07DNVYB92',
  'B07GQ9GT6N',
  'B07K87KV95',
  'B07Q6VCZNH', // Wilson hopper (used by keepa-images probe)
  'B07S8TQRN3',
  'B07TXLC84Y', // Lifetime basketball return
  'B083J8DMHB',
  'B085TBQ6H5', // OWNTHEGAME basketball
  'B08TM8QTHQ',
  'B08X12JT3Q', // Spalding Back Atcha
  'B0967NXGK3', // GADFISH economy
  'B09B89DSB2',
  'B09CP873LY', // GADFISH 180
  'B0BNQ56MH5',
  'B0CHNL1JYB',
  'B0D16YB4K6',
  'B0DDKSX2CW',
  'B0DNTQ2YNT',
  'B0FP8VX1V7',
  'B0FZKCD3VF',
];

// 22-column Xray schema → expected source field on the Keepa /product response.
// Used to print the mapping summary at the end of the probe.
const XRAY_SCHEMA: Array<{ col: string; keepaPath: string; notes?: string }> = [
  { col: '01. Image',                keepaPath: 'imagesCSV (CSV of base names)', notes: 'CDN: https://m.media-amazon.com/images/I/<base>' },
  { col: '02. Title',                keepaPath: 'title' },
  { col: '03. ASIN',                 keepaPath: 'asin' },
  { col: '04. Brand',                keepaPath: 'brand' },
  { col: '05. Price',                keepaPath: 'stats.current[0|1] (Amazon|New, cents)' },
  { col: '06. BSR (current)',        keepaPath: 'stats.current[3]' },
  { col: '07. Monthly Sales (units)', keepaPath: 'monthlySold OR stats.current[30]', notes: 'Sparse — coarse buckets ("100+", "1K+"). Falls back to BSR-derived sales for missing.' },
  { col: '08. Monthly Revenue',      keepaPath: 'derived: monthlySold × price' },
  { col: '09. Reviews (count)',      keepaPath: 'stats.current[17]' },
  { col: '10. Review Rating',        keepaPath: 'stats.current[16] / 10' },
  { col: '11. FBA Fees',             keepaPath: 'fbaFees.pickAndPackFee (cents)', notes: 'fbaFees object: pickAndPackFee, storageFee, etc.' },
  { col: '12. Net Price',            keepaPath: 'derived: price - fbaFees - referralFee', notes: 'Referral fee is category %; not on /product directly.' },
  { col: '13. Date First Available', keepaPath: 'listedSince (Keepa minutes)' },
  { col: '14. Listing Date',         keepaPath: 'listedSince (Keepa minutes)' },
  { col: '15. Weight',               keepaPath: 'packageWeight (grams) / itemWeight' },
  { col: '16. Dimensions (L×W×H)',   keepaPath: 'packageLength/Width/Height (mm)' },
  { col: '17. Size Tier',            keepaPath: 'derived from weight + dims' },
  { col: '18. Variations',           keepaPath: 'variations[] / variationCSV' },
  { col: '19. Active Sellers',       keepaPath: 'offerCount OR stats.current[11]' },
  { col: '20. Fulfillment',          keepaPath: 'buyBoxSellerIdHistory + offers (need offers param)' },
  { col: '21. Sales Trend',          keepaPath: 'derived from csv[3] BSR history (inverse)' },
  { col: '22. Category',             keepaPath: 'rootCategory + categoryTree[]' },
];

function fmt(v: any): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '...' : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function keepaMinutesToIso(km: any): string | null {
  if (typeof km !== 'number' || km <= 0) return null;
  const epoch = new Date('2011-01-01').getTime();
  return new Date(epoch + km * 60 * 1000).toISOString().split('T')[0];
}

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing from .env.local');

  console.log('===========================================================');
  console.log('Phase 5.1 — Keepa /product Xray batch probe');
  console.log('===========================================================');
  console.log(`ASINs in batch: ${ASINS.length}`);
  console.log(`Endpoint: ${KEEPA_BASE_URL}/product (single batched call)`);
  console.log(`Params: domain=1, stats=180, history=1, offers=20`);
  console.log('');

  // Single batched call. Keepa accepts comma-joined ASINs up to 100 per call.
  // We add `offers=20` so we can see if Active Sellers / Fulfillment data
  // surfaces here or whether it requires a second call.
  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${ASINS.join(',')}` +
    `&stats=180` +
    `&history=1` +
    `&offers=20`;

  const t0 = Date.now();
  const res = await fetch(url);
  const elapsedMs = Date.now() - t0;

  console.log('--- HTTP response ---');
  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log(`Elapsed: ${elapsedMs} ms`);
  console.log('');
  console.log('--- Response headers (rate-limit candidates) ---');
  const interesting = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'content-type', 'content-length', 'date'];
  res.headers.forEach((value, key) => {
    if (interesting.includes(key.toLowerCase())) console.log(`  ${key}: ${value}`);
  });
  console.log('');

  if (!res.ok) {
    const text = await res.text();
    console.error('Keepa request failed:', text.slice(0, 500));
    process.exit(1);
  }

  const data: any = await res.json();

  console.log('--- Response body — rate limit / token bucket ---');
  console.log(`  tokensLeft:        ${data.tokensLeft}`);
  console.log(`  tokensConsumed:    ${data.tokensConsumed}`);
  console.log(`  refillIn (ms):     ${data.refillIn}`);
  console.log(`  refillRate (/min): ${data.refillRate}`);
  console.log(`  timestamp:         ${data.timestamp}`);
  console.log(`  processingTimeInMs:${data.processingTimeInMs}`);
  console.log('');

  const products: any[] = data.products || [];
  console.log(`--- Products returned: ${products.length} / ${ASINS.length} ---`);
  console.log('');

  // Per-ASIN flat summary.
  console.log('--- Per-ASIN flat summary ---');
  console.log(
    [
      'ASIN'.padEnd(12),
      'brand'.padEnd(20),
      'monthlySold'.padEnd(13),
      'currentBSR'.padEnd(11),
      'price¢'.padEnd(8),
      'fbaFees'.padEnd(20),
      'listedSince'.padEnd(12),
      'wt(g)'.padEnd(7),
      'dims(mm)'.padEnd(18),
      'reviews'.padEnd(8),
      'rating'.padEnd(6),
      'imageBase'.padEnd(20),
    ].join(' | ')
  );
  console.log('-'.repeat(180));

  let monthlySoldHits = 0;
  let bsrHits = 0;
  let priceHits = 0;
  let brandHits = 0;
  let fbaFeesHits = 0;
  let listedSinceHits = 0;
  let weightHits = 0;
  let imageHits = 0;

  for (const asin of ASINS) {
    const p = products.find((x) => x?.asin === asin);
    if (!p) {
      console.log(`${asin.padEnd(12)} | <not returned>`);
      continue;
    }
    const cur = p.stats?.current || [];
    const monthlySold =
      typeof p.monthlySold === 'number' && p.monthlySold > 0 ? p.monthlySold :
      typeof cur[30] === 'number' && cur[30] > 0 ? cur[30] : null;
    const bsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;
    const priceCents =
      typeof cur[0] === 'number' && cur[0] > 0 ? cur[0] :
      typeof cur[1] === 'number' && cur[1] > 0 ? cur[1] : null;
    const reviews = typeof cur[17] === 'number' && cur[17] >= 0 ? cur[17] : null;
    const ratingTenths = typeof cur[16] === 'number' && cur[16] > 0 ? cur[16] : null;
    const rating = ratingTenths != null ? (ratingTenths / 10).toFixed(1) : null;
    const fbaFee = p.fbaFees?.pickAndPackFee ?? null;
    const fbaSummary = p.fbaFees ? `pp=${fbaFee}` : null;
    const dims = `${p.packageLength ?? '-'}x${p.packageWidth ?? '-'}x${p.packageHeight ?? '-'}`;
    const imageBase = typeof p.imagesCSV === 'string' ? p.imagesCSV.split(',')[0]?.trim() : null;

    if (monthlySold != null) monthlySoldHits++;
    if (bsr != null) bsrHits++;
    if (priceCents != null) priceHits++;
    if (p.brand) brandHits++;
    if (p.fbaFees) fbaFeesHits++;
    if (typeof p.listedSince === 'number' && p.listedSince > 0) listedSinceHits++;
    if (typeof p.packageWeight === 'number' && p.packageWeight > 0) weightHits++;
    if (imageBase) imageHits++;

    console.log(
      [
        asin.padEnd(12),
        fmt(p.brand).padEnd(20),
        fmt(monthlySold).padEnd(13),
        fmt(bsr).padEnd(11),
        fmt(priceCents).padEnd(8),
        fmt(fbaSummary).padEnd(20),
        fmt(keepaMinutesToIso(p.listedSince)).padEnd(12),
        fmt(p.packageWeight).padEnd(7),
        dims.padEnd(18),
        fmt(reviews).padEnd(8),
        fmt(rating).padEnd(6),
        fmt(imageBase).padEnd(20),
      ].join(' | ')
    );
  }

  const total = ASINS.length;
  const pct = (n: number) => `${n}/${total} (${((n / total) * 100).toFixed(0)}%)`;

  console.log('');
  console.log('--- Field coverage (across full batch) ---');
  console.log(`  monthlySold (Xray "Recent Purchases"): ${pct(monthlySoldHits)}`);
  console.log(`  current BSR:                            ${pct(bsrHits)}`);
  console.log(`  price (Amazon or New):                  ${pct(priceHits)}`);
  console.log(`  brand:                                  ${pct(brandHits)}`);
  console.log(`  fbaFees object:                         ${pct(fbaFeesHits)}`);
  console.log(`  listedSince (Date First Available):     ${pct(listedSinceHits)}`);
  console.log(`  packageWeight:                          ${pct(weightHits)}`);
  console.log(`  imagesCSV (≥1 entry):                   ${pct(imageHits)}`);
  console.log('');

  console.log('--- Top-level keys observed on first product (for reference) ---');
  if (products[0]) {
    console.log('  ' + Object.keys(products[0]).sort().join(', '));
  }
  console.log('');

  console.log('--- 22-column Xray schema → Keepa-field mapping ---');
  for (const row of XRAY_SCHEMA) {
    const note = row.notes ? `   // ${row.notes}` : '';
    console.log(`  ${row.col.padEnd(28)} ← ${row.keepaPath}${note}`);
  }
  console.log('');

  // Verdict block — same data as the doc summary.
  console.log('===========================================================');
  console.log('Verdict');
  console.log('===========================================================');
  console.log(`  Batch size:                ${ASINS.length} ASINs`);
  console.log(`  Tokens consumed by batch:  ${data.tokensConsumed}`);
  console.log(`  Tokens left after call:    ${data.tokensLeft}`);
  console.log(`  Refill rate (tokens/min):  ${data.refillRate}`);
  console.log(`  HTTP elapsed:              ${elapsedMs} ms`);
  console.log(`  Keepa processing:          ${data.processingTimeInMs} ms`);
  console.log(`  monthlySold coverage:      ${pct(monthlySoldHits)}`);
  console.log('');
  console.log('Rate-limit signal location: response BODY (tokensLeft / refillRate),');
  console.log('NOT response headers. Spec referenced X-RateLimit-* — update the spec.');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
