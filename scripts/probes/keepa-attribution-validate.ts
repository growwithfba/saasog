/**
 * Phase 5.4-G validation probe — does the new three-tier attribution
 * (monthlySold preferred, parent/min(N,5) fallback) bring per-child
 * units within 0.5x-2x of H10's reported child units?
 *
 * Reads ASINs + H10 child units from the in-memory baseline, hits Keepa
 * directly with the same logic as the route, and reports the ratios.
 *
 * Run: `npx tsx scripts/probes/keepa-attribution-validate.ts`
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

import { bsrToMonthlyUnits } from '../../src/lib/extension/bsrSalesCurve';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

// Subset of Dave's Test 2 / Test 3 pairs where we have H10 child units.
// Source: spreadsheet `BloomLens - Data Comparison - Xray vs BloomLens.xlsx`.
const PAIRS: Array<{ asin: string; h10ChildUnits: number; h10ParentUnits: number | null }> = [
  // Test 2
  { asin: 'B06XQ492N8', h10ChildUnits: 246,  h10ParentUnits: 941 },
  { asin: 'B07F1BK675', h10ChildUnits: 348,  h10ParentUnits: 1185 },
  { asin: 'B07J334WTW', h10ChildUnits: 1510, h10ParentUnits: 3820 },
  { asin: 'B089RGDQBB', h10ChildUnits: 5383, h10ParentUnits: 23099 },
  { asin: 'B08CXGYW1Q', h10ChildUnits: 2925, h10ParentUnits: 17036 },
  { asin: 'B08M5J8JMN', h10ChildUnits: 2961, h10ParentUnits: 8816 },
  { asin: 'B094HXYVC2', h10ChildUnits: 1371, h10ParentUnits: 3817 },
  { asin: 'B0967W65J3', h10ChildUnits: 1360, h10ParentUnits: 5598 },
  { asin: 'B09D2XLCNK', h10ChildUnits: 3903, h10ParentUnits: 12605 },
  { asin: 'B09D7DWTVB', h10ChildUnits: 12746, h10ParentUnits: 36310 },
  { asin: 'B09N8W2SC4', h10ChildUnits: 3940, h10ParentUnits: 11674 },
  { asin: 'B0B1ZYGR52', h10ChildUnits: 1943, h10ParentUnits: 5262 },
  { asin: 'B0B3HXHHN3', h10ChildUnits: 1007, h10ParentUnits: 3186 },
  { asin: 'B0B4J7NJK5', h10ChildUnits: 363,  h10ParentUnits: 1180 },
  { asin: 'B0BDLGZCTY', h10ChildUnits: 10885, h10ParentUnits: 52727 },
  { asin: 'B0BZNNN7H8', h10ChildUnits: 1658, h10ParentUnits: 4779 },
  { asin: 'B0CBKH5RM2', h10ChildUnits: 2049, h10ParentUnits: 6204 },
  { asin: 'B0CG9LCN8B', h10ChildUnits: 2793, h10ParentUnits: 10788 },
  { asin: 'B0D2W6JK91', h10ChildUnits: 1056, h10ParentUnits: 3800 },
  { asin: 'B0DBYVR7LH', h10ChildUnits: 7365, h10ParentUnits: 14179 },
  { asin: 'B0DDK8JX3Y', h10ChildUnits: 372,  h10ParentUnits: 1187 },
  { asin: 'B0DHVJPH6T', h10ChildUnits: 3075, h10ParentUnits: 10115 },
  { asin: 'B0DK11CFG7', h10ChildUnits: 40,   h10ParentUnits: 1087 },
  { asin: 'B0DTH4195V', h10ChildUnits: 848,  h10ParentUnits: 3467 },
  { asin: 'B0DVH7XXXN', h10ChildUnits: 466,  h10ParentUnits: 3117 },
  { asin: 'B0DXVPJ3XM', h10ChildUnits: 1035, h10ParentUnits: 2987 },
  { asin: 'B0F1V96VJ8', h10ChildUnits: 370,  h10ParentUnits: 1017 },
  { asin: 'B0F29YHHLS', h10ChildUnits: 1168, h10ParentUnits: 7123 },
  { asin: 'B0FPFM31ZS', h10ChildUnits: 468,  h10ParentUnits: 1306 },
  { asin: 'B0FR4KJMNY', h10ChildUnits: 928,  h10ParentUnits: 3875 },
  // Test 3
  { asin: 'B074BT57HG', h10ChildUnits: 3846, h10ParentUnits: 5957 },
  { asin: 'B07R75KYF6', h10ChildUnits: 52,   h10ParentUnits: 69 },
  { asin: 'B09SR2SW5W', h10ChildUnits: 482,  h10ParentUnits: 482 },
  { asin: 'B0BJF3TMTY', h10ChildUnits: 236,  h10ParentUnits: 1684 },
  { asin: 'B0BQM4ZJL7', h10ChildUnits: 155,  h10ParentUnits: 1684 },
  { asin: 'B0CGZLHPK6', h10ChildUnits: 694,  h10ParentUnits: 892 },
  { asin: 'B0CZDFCZ7Q', h10ChildUnits: 67,   h10ParentUnits: 741 },
  { asin: 'B0DDTL3S2R', h10ChildUnits: 149,  h10ParentUnits: 1403 },
  { asin: 'B0DM5CKZBP', h10ChildUnits: 282,  h10ParentUnits: 372 },
  { asin: 'B0DNCBVZ8C', h10ChildUnits: 8,    h10ParentUnits: 8 },
  { asin: 'B0DRCPF229', h10ChildUnits: 74,   h10ParentUnits: 150 },
  { asin: 'B0FQV3PWF3', h10ChildUnits: 62,   h10ParentUnits: 180 },
  { asin: 'B0G2RNZM7K', h10ChildUnits: 143,  h10ParentUnits: 215 },
  { asin: 'B0G3NDDNF2', h10ChildUnits: 110,  h10ParentUnits: 131 },
];

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing');

  const asins = PAIRS.map((p) => p.asin);
  // Single batched call (mirrors the route).
  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${asins.join(',')}` +
    `&stats=180` +
    `&history=1`;

  const t0 = Date.now();
  const res = await fetch(url);
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    console.error('Keepa fail:', res.status);
    process.exit(1);
  }
  const data: any = await res.json();
  const products: any[] = data.products || [];
  const byAsin = new Map<string, any>();
  for (const p of products) {
    if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);
  }

  console.log(`\n=== Phase 5.4-G attribution validation (${asins.length} ASINs) ===`);
  console.log(`Keepa fetch: ${elapsed}ms · tokens consumed: ${data.tokensConsumed} · left: ${data.tokensLeft}`);
  console.log('');

  console.log(
    [
      'ASIN'.padEnd(12),
      'currBSR'.padEnd(8),
      'medBSR'.padEnd(7),
      'parent'.padEnd(7),
      'vCount'.padEnd(7),
      'mSold'.padEnd(7),
      'BL_units'.padEnd(9),
      'src'.padEnd(11),
      'H10_child'.padEnd(10),
      'BL/Child'.padEnd(9),
    ].join(' | ')
  );
  console.log('-'.repeat(110));

  const ratios: number[] = [];
  let oldRatios: number[] = []; // What the old (parent-only) method would have produced

  for (const pair of PAIRS) {
    const p = byAsin.get(pair.asin);
    if (!p) {
      console.log(`${pair.asin.padEnd(12)} | <not in response>`);
      continue;
    }
    const cur: number[] = p.stats?.current ?? [];
    const currentBsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;

    // Smoothed BSR (median of daily medians, last 30d).
    const csv3: number[] = Array.isArray(p.csv?.[3]) ? p.csv[3] : [];
    const cutoff30 = Date.now() - 30 * 86400000;
    const points: Array<{ ts: number; rank: number }> = [];
    for (let i = 0; i + 1 < csv3.length; i += 2) {
      const km = csv3[i];
      const rank = csv3[i + 1];
      if (typeof km !== 'number' || typeof rank !== 'number' || rank <= 0) continue;
      if (km2ms(km) >= cutoff30) points.push({ ts: km2ms(km), rank });
    }
    let bsr30dMedian: number | null = null;
    if (points.length >= 5) {
      const byDay = new Map<string, number[]>();
      for (const pt of points) {
        const day = new Date(pt.ts).toISOString().slice(0, 10);
        byDay.set(day, [...(byDay.get(day) ?? []), pt.rank]);
      }
      bsr30dMedian = median(Array.from(byDay.values()).map(median));
    }
    const bsrForUnits = bsr30dMedian ?? currentBsr;
    const parentUnits = bsrForUnits != null ? bsrToMonthlyUnits(bsrForUnits) : null;

    const variationCount = Array.isArray(p.variations) ? p.variations.length || 1 : 1;
    const monthlySold =
      typeof p.monthlySold === 'number' && p.monthlySold > 0
        ? p.monthlySold
        : typeof cur[30] === 'number' && cur[30] > 0
          ? cur[30]
          : null;

    let blUnits: number | null = null;
    let src = 'none';
    if (monthlySold != null) {
      blUnits = monthlySold;
      src = 'amazon';
    } else if (parentUnits != null) {
      if (variationCount <= 1) {
        blUnits = parentUnits;
        src = 'single';
      } else {
        const cap = Math.min(variationCount, 5);
        blUnits = Math.max(0, Math.round(parentUnits / cap));
        src = `attr/${cap}`;
      }
    }

    const ratio = blUnits != null && pair.h10ChildUnits > 0 ? blUnits / pair.h10ChildUnits : null;
    if (ratio != null) ratios.push(ratio);

    // Compare to OLD method = always parent units (Phase 5.4-F)
    const oldUnits = parentUnits;
    if (oldUnits != null && pair.h10ChildUnits > 0) {
      oldRatios.push(oldUnits / pair.h10ChildUnits);
    }

    console.log(
      [
        pair.asin.padEnd(12),
        String(currentBsr ?? '-').padEnd(8),
        String(bsr30dMedian != null ? Math.round(bsr30dMedian) : '-').padEnd(7),
        String(parentUnits ?? '-').padEnd(7),
        String(variationCount).padEnd(7),
        String(monthlySold ?? '-').padEnd(7),
        String(blUnits ?? '-').padEnd(9),
        src.padEnd(11),
        String(pair.h10ChildUnits).padEnd(10),
        ratio != null ? `${ratio.toFixed(2)}x`.padEnd(9) : '-'.padEnd(9),
      ].join(' | ')
    );
  }

  console.log('\n=== Aggregate ===');
  if (ratios.length) {
    const within = ratios.filter((r) => r >= 0.5 && r <= 2.0).length;
    console.log('NEW (Phase 5.4-G three-tier attribution):');
    console.log(`  Median ratio: ${median(ratios).toFixed(2)}x  (1.0 = perfect)`);
    console.log(`  Mean:         ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)}x`);
    console.log(`  Within 0.5x-2x: ${within}/${ratios.length} (${((within / ratios.length) * 100).toFixed(0)}%)`);
  }
  if (oldRatios.length) {
    const within = oldRatios.filter((r) => r >= 0.5 && r <= 2.0).length;
    console.log('OLD (Phase 5.4-F parent-only):');
    console.log(`  Median ratio: ${median(oldRatios).toFixed(2)}x`);
    console.log(`  Mean:         ${(oldRatios.reduce((a, b) => a + b, 0) / oldRatios.length).toFixed(2)}x`);
    console.log(`  Within 0.5x-2x: ${within}/${oldRatios.length} (${((within / oldRatios.length) * 100).toFixed(0)}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
