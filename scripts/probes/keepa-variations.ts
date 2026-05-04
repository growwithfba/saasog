/**
 * Phase 5.4-G probe — what does Keepa return in product.variations[]?
 *
 * Specifically: do variation entries carry per-variation review counts
 * or do we need a second batched call to fetch sibling reviews?
 *
 * Run: `npx tsx scripts/probes/keepa-variations.ts`
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

// First batch — three products from Dave's spreadsheet that are
// confirmed multi-variation. Then a second batch fetches siblings of
// B07F1BK675 (12-variation Barkbox bed) so we can see whether siblings
// have different BSRs (proving / disproving Dave's "BSR is shared
// across children" hypothesis) AND whether review counts are populated
// on each sibling (so we know if attribution-by-reviews is feasible
// without needing extra API surface).
const ASINS = ['B07F1BK675', 'B089RGDQBB', 'B08CXGYW1Q'];
const SIBLINGS_OF_B07F1BK675 = [
  'B07F1BK675', // anchor (1st row)
  'B07F1G7F1N', // 1st sibling
  'B07F1D2PRV', // 2nd sibling
  'B07F19HBX6', // 3rd sibling
];

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing');

  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${ASINS.join(',')}` +
    `&stats=180` +
    `&history=1`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error('Keepa fail:', res.status, await res.text());
    process.exit(1);
  }
  const data: any = await res.json();
  const products: any[] = data.products || [];

  for (const p of products) {
    console.log('\n========================================');
    console.log(`ASIN: ${p.asin}`);
    console.log(`Title: ${(p.title || '').slice(0, 70)}`);
    console.log(`Current BSR: ${p.stats?.current?.[3]}`);
    console.log(`Reviews (current[17]): ${p.stats?.current?.[17]}`);
    console.log(`parentAsin: ${p.parentAsin ?? '(none)'}`);
    console.log(`variationCSV (truncated): ${(p.variationCSV ?? '').slice(0, 80)}`);

    if (Array.isArray(p.variations)) {
      console.log(`variations[] count: ${p.variations.length}`);
      console.log('First 3 variation entries:');
      for (const v of p.variations.slice(0, 3)) {
        console.log('  ', JSON.stringify(v).slice(0, 200));
      }
      console.log('Keys present on first variation entry:');
      if (p.variations[0]) {
        console.log('  ', Object.keys(p.variations[0]));
      }
    } else {
      console.log('No variations array on this product.');
    }
  }

  // Second probe — same family, siblings, do they have different BSRs?
  console.log('\n\n========================================');
  console.log('SIBLING TEST — do siblings of B07F1BK675 have different BSRs and review counts?');
  console.log('========================================');
  const url2 =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${SIBLINGS_OF_B07F1BK675.join(',')}` +
    `&stats=180` +
    `&history=1`;
  const res2 = await fetch(url2);
  if (!res2.ok) {
    console.error('Sibling probe failed:', res2.status);
    process.exit(1);
  }
  const data2: any = await res2.json();
  const sibs: any[] = data2.products || [];
  console.log(
    [
      'ASIN'.padEnd(12),
      'currentBSR'.padEnd(11),
      'reviews(c17)'.padEnd(13),
      'csv16-current'.padEnd(15),
      'csv17-current'.padEnd(15),
      'monthlySold'.padEnd(13),
      'parentAsin'.padEnd(12),
    ].join(' | ')
  );
  console.log('-'.repeat(110));
  for (const s of sibs) {
    const cur = s.stats?.current ?? [];
    const csv16 = Array.isArray(s.csv?.[16]) ? s.csv[16] : null;
    const csv17 = Array.isArray(s.csv?.[17]) ? s.csv[17] : null;
    // csv format is alternating [ts, value] pairs; "current" is the last value.
    const csv16Last = csv16 && csv16.length >= 2 ? csv16[csv16.length - 1] : null;
    const csv17Last = csv17 && csv17.length >= 2 ? csv17[csv17.length - 1] : null;
    console.log(
      [
        String(s.asin).padEnd(12),
        String(cur[3] ?? '-').padEnd(11),
        String(cur[17] ?? '-').padEnd(13),
        String(csv16Last ?? '-').padEnd(15),
        String(csv17Last ?? '-').padEnd(15),
        String(s.monthlySold ?? '-').padEnd(13),
        String(s.parentAsin ?? '-').padEnd(12),
      ].join(' | ')
    );
  }

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Tokens consumed (call 1 + 2): ${data.tokensConsumed} + ${data2.tokensConsumed}, left: ${data2.tokensLeft}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
