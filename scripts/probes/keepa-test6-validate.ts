/**
 * Test 6 calibration validation. Runs the new v1.1.0 curve against the
 * 48 paired ASINs from Dave's Test 6 spreadsheet to verify parent
 * estimates land within 0.5x-2x of H10's reported parent values.
 */
import * as fs from 'fs';
import * as path from 'path';
try {
  const t = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
import { bsrToMonthlyUnits, bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';

function pickRootCategoryName(product: any): string | null {
  const tree = product?.categoryTree;
  if (Array.isArray(tree) && tree.length > 0) {
    const root = tree[0];
    if (root && typeof root.name === 'string' && root.name.trim()) return root.name.trim();
  }
  return null;
}

const KEEPA = 'https://api.keepa.com';
const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

// (asin, h10_child, h10_parent) from "Test 6"
const PAIRS: [string, number, number][] = [
  ['B07CN9T8RC', 3093, 4214],
  ['B0CWLTLC2F', 1684, 10085],
  ['B0BTBV51KY', 14901, 14901],
  ['B0CSFBGQJP', 8086, 8086],
  ['B071Y71Y3J', 4257, 6134],
  ['B01FVS6TGO', 1566, 2273],
  ['B01COSEDKS', 7287, 8420],
  ['B0FF9X3J72', 1447, 1447],
  ['B0CDB7F7W3', 1921, 1921],
  ['B07MNMT3M7', 10119, 16287],
  ['B0B9LCT9B7', 1316, 10085],
  ['B0FLDB14N8', 2716, 3671],
  ['B0CCCZSR4W', 9193, 9193],
  ['B007GE75HY', 13792, 22648],
  ['B06XKMSMBF', 1704, 3600],
  ['B0DGWPJ5MW', 26430, 27607],
  ['B00Y53V80E', 3734, 3734],
  ['B0CRYJB6GK', 15323, 28764],
  ['B01EYUMENC', 5899, 5899],
  ['B003ICWTME', 5118, 7727],
  ['B07N4N6LDV', 6826, 6826],
  ['B0BKXSHHNP', 4703, 13482],
  ['B08GDZ8H5Q', 3889, 5304],
  ['B0CR6VKXJ7', 4138, 6292],
  ['B08345YDXJ', 1335, 1335],
  ['B00K89KFX0', 7951, 7951],
  ['B0DGXJP7X9', 1398, 2340],
  ['B01C5A2WJO', 9433, 9433],
  ['B06WV7VBY5', 8264, 9457],
  ['B07H331J4R', 11892, 11892],
  ['B0BZXNZZ67', 10470, 16720],
  ['B07WZQGB76', 1582, 1582],
  ['B0BGN1YDJH', 9664, 23019],
  ['B0D2ZD6J2W', 9167, 10681],
  ['B07YR9T251', 5498, 5498],
  ['B0C8NLNBW9', 1592, 1592],
  ['B01K1K0K6M', 24395, 24395],
  ['B0CFZTK174', 9272, 15528],
  ['B0CYT85XT6', 7579, 9063],
  ['B07CRSXMW8', 5049, 13878],
  ['B093PX3CTV', 2869, 3430],
  ['B01NCUSC7V', 9925, 11921],
  ['B0CTMJZZYH', 3138, 4153],
  ['B01GFZT4AK', 1964, 1964],
  ['B0843HW6C9', 8633, 8633],
  ['B00Y53V7XM', 2089, 2846],
  ['B0CWNGN5V2', 1518, 1518],
  ['B07B6ZN7P8', 14632, 32143],
];

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('no key');
  const asins = PAIRS.map((p) => p[0]);
  const url = `${KEEPA}/product?key=${apiKey}&domain=1&asin=${asins.join(',')}&stats=180&history=1`;
  const res = await fetch(url);
  if (!res.ok) { console.error(res.status); process.exit(1); }
  const data: any = await res.json();
  const byAsin = new Map<string, any>();
  for (const p of data.products || []) if (p?.asin) byAsin.set(p.asin.toUpperCase(), p);

  console.log(`\nTest 6 validation against v1.1.0 curve + V2 category multipliers (${asins.length} ASINs)\n`);
  console.log('Tokens consumed:', data.tokensConsumed, ', left:', data.tokensLeft, '\n');
  console.log(`${'ASIN'.padEnd(13)} | ${'Category'.padEnd(28)} | ${'BSR'.padEnd(7)} | ${'mSold'.padEnd(6)} | ${'BL_C'.padEnd(7)} | ${'H10_C'.padEnd(7)} | ${'BL_P'.padEnd(7)} | ${'H10_P'.padEnd(7)} | ${'C_ratio'.padEnd(8)} | ${'P_ratio'.padEnd(8)}`);
  console.log('-'.repeat(95));

  const cRatios: number[] = [];
  const pRatios: number[] = [];

  for (const [asin, h10c, h10p] of PAIRS) {
    const p = byAsin.get(asin);
    if (!p) continue;
    const cur: number[] = p.stats?.current ?? [];
    const curBsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;
    // Smoothed BSR
    const csv3: number[] = Array.isArray(p.csv?.[3]) ? p.csv[3] : [];
    const cutoff = Date.now() - 30 * 86400000;
    const pts: number[] = [];
    for (let i = 0; i + 1 < csv3.length; i += 2) {
      if (typeof csv3[i] === 'number' && typeof csv3[i+1] === 'number' && csv3[i+1] > 0 && km2ms(csv3[i]) >= cutoff) {
        pts.push(csv3[i+1]);
      }
    }
    const med30 = pts.length >= 5 ? median(pts) : null;
    const bsrUse = med30 ?? curBsr;
    const rootCat = pickRootCategoryName(p);
    const parentBsrDerived = bsrUse != null ? bsrToMonthlyUnitsByCategory(bsrUse, rootCat) : null;

    const variations = Array.isArray(p.variations) ? p.variations.length || 1 : 1;
    const monthlySold =
      typeof p.monthlySold === 'number' && p.monthlySold > 0
        ? p.monthlySold
        : typeof cur[30] === 'number' && cur[30] > 0
          ? cur[30]
          : null;

    let blChild: number | null = null;
    if (monthlySold != null) blChild = Math.round(monthlySold * 1.5);
    else if (parentBsrDerived != null) {
      blChild = variations <= 1 ? parentBsrDerived : Math.max(0, Math.round(parentBsrDerived / Math.min(variations, 5)));
    }

    // Apply parent>=child invariant
    let blParent = parentBsrDerived;
    if (blParent != null && blChild != null && blParent < blChild) blParent = blChild;
    if (blParent == null && blChild != null) blParent = blChild;

    const cr = blChild && h10c > 0 ? blChild / h10c : null;
    const pr = blParent && h10p > 0 ? blParent / h10p : null;
    if (cr != null) cRatios.push(cr);
    if (pr != null) pRatios.push(pr);

    console.log(`${asin.padEnd(13)} | ${String(rootCat ?? '-').slice(0, 28).padEnd(28)} | ${String(curBsr ?? '-').padEnd(7)} | ${String(monthlySold ?? '-').padEnd(6)} | ${String(blChild ?? '-').padEnd(7)} | ${String(h10c).padEnd(7)} | ${String(blParent ?? '-').padEnd(7)} | ${String(h10p).padEnd(7)} | ${(cr != null ? `${cr.toFixed(2)}x` : '-').padEnd(8)} | ${(pr != null ? `${pr.toFixed(2)}x` : '-').padEnd(8)}`);
  }

  const stats = (label: string, vals: number[]) => {
    if (!vals.length) return;
    const within = vals.filter(v => v >= 0.5 && v <= 2.0).length;
    console.log(`  ${label}: n=${vals.length}, median=${median(vals).toFixed(2)}x, within 0.5x-2x: ${within}/${vals.length} (${(within/vals.length*100).toFixed(0)}%)`);
  };
  console.log('\n=== Aggregate ===');
  stats('child  (BL/H10)', cRatios);
  stats('parent (BL/H10)', pRatios);
}
main().catch(e => { console.error(e); process.exit(1); });
