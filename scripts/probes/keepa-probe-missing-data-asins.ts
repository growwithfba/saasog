/**
 * Probe Keepa directly for the ASINs that showed up missing in BloomLens but
 * populated in H10. Goal: find out what Keepa actually returns for these
 * products and why our pipeline drops them to 'limited'.
 *
 * Run: npx tsx scripts/probes/keepa-probe-missing-data-asins.ts
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
const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();

const ASINS = [
  'B0GX2PRW13', // H10: BSR 50,333, 133 sales, 1,580 reviews, 4.1 rating — BloomLens empty
  'B0C1HCCK2T', // BloomLens shows empty, not in H10
  'B0G38S5XZY', // BloomLens empty, H10 BSR N/A
  'B0BYFD1BVX', // BloomLens empty, H10 BSR 5,181,555 (deep tail)
  'B081BBKCT6', // BloomLens empty, H10 BSR 4,806,467
  'B0DLSBJJPY', // BloomLens empty, H10 BSR 705,730, 5 reviews
  'B01M175H1N', // 3517 days old, H10 BSR N/A but 3 reviews
];

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY not configured');

  const url =
    `${KEEPA_BASE_URL}/product?key=${apiKey}` +
    `&domain=1` +
    `&asin=${ASINS.join(',')}` +
    `&stats=180&history=1&rating=1&buybox=1&offers=20`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Keepa ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data: any = await res.json();
  const products: any[] = data.products ?? [];
  console.log(`Tokens consumed: ${data.tokensConsumed}, left: ${data.tokensLeft}`);
  console.log(`Products returned: ${products.length} / requested ${ASINS.length}\n`);

  for (const asin of ASINS) {
    const p = products.find((x) => String(x?.asin).toUpperCase() === asin);
    if (!p) {
      console.log(`${asin}: NOT RETURNED BY KEEPA`);
      console.log('');
      continue;
    }
    const cur: number[] = p.stats?.current ?? [];
    const bsrSnap = cur[3];
    const reviews = cur[17];
    const ratingTenths = cur[16];
    const buyBox = cur[18];
    const amazonPrice = cur[0];
    const newPrice = cur[1];
    const monthlySold = p.monthlySold;
    const listedSince = p.listedSince;
    const listingAgeDays =
      typeof listedSince === 'number' && listedSince > 0
        ? Math.floor((Date.now() - (KEEPA_EPOCH_MS + listedSince * 60_000)) / 86_400_000)
        : null;

    // BSR history points
    const csv3: number[] = Array.isArray(p.csv?.[3]) ? p.csv[3] : [];
    const cutoff30 = Date.now() - 30 * 86_400_000;
    let bsrPointsInLast30Days = 0;
    let totalBsrPoints = 0;
    for (let i = 0; i + 1 < csv3.length; i += 2) {
      const km = csv3[i];
      const rank = csv3[i + 1];
      const ts = KEEPA_EPOCH_MS + km * 60_000;
      if (typeof rank === 'number' && rank > 0) {
        totalBsrPoints++;
        if (ts >= cutoff30) bsrPointsInLast30Days++;
      }
    }

    // Variations
    const variationCount = Array.isArray(p.variations) ? p.variations.length || 1 : 1;
    const category = Array.isArray(p.categoryTree) && p.categoryTree.length > 0 ? p.categoryTree.map((c: any) => c.name).join(' > ') : '<none>';

    // Compute reviews/day for the implausible-velocity check
    const reviewsPerDay =
      typeof reviews === 'number' && reviews > 0 && listingAgeDays != null && listingAgeDays > 0
        ? reviews / listingAgeDays
        : null;

    console.log(`${asin}  title: ${(p.title || '').slice(0, 60)}`);
    console.log(`  Listing age: ${listingAgeDays} days  Variations: ${variationCount}`);
    console.log(`  Category tree: ${category}`);
    console.log(`  cur[3]  BSR snapshot: ${bsrSnap}`);
    console.log(`  cur[16] rating×10:   ${ratingTenths} (${ratingTenths > 0 ? (ratingTenths / 10).toFixed(1) + ' stars' : 'no data'})`);
    console.log(`  cur[17] reviews:     ${reviews}`);
    console.log(`  cur[18] buybox cents: ${buyBox}`);
    console.log(`  cur[0]  amazon cents: ${amazonPrice}`);
    console.log(`  cur[1]  new cents:    ${newPrice}`);
    console.log(`  monthlySold:         ${monthlySold ?? '<none>'}`);
    console.log(`  csv[3] BSR points total: ${totalBsrPoints}, in last 30d: ${bsrPointsInLast30Days}  (need >=5 for smoothing)`);
    if (reviewsPerDay != null) {
      const trip = reviewsPerDay > 50;
      console.log(`  reviews/day:         ${reviewsPerDay.toFixed(1)}  ${trip ? '⚠️ TRIPS implausible-velocity guardrail (>50/day)' : 'OK'}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
