/**
 * Phase 5.4-F probe — does Keepa's csv[3] (sales-rank time series) carry
 * enough density across the trailing 30 days to support a rolling-average
 * BSR-derived sales estimate?
 *
 * Why this matters: a single current-BSR snapshot is misleading. PPC spikes,
 * deal events, or one-day virality can crater BSR for a day while the prior
 * 29 days were quiet — leading our units estimate to read 100x off. H10 / JS
 * smooth across many points; we need to too.
 *
 * Run with: `npx tsx scripts/probes/keepa-bsr-history.ts`
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

// Fresh probe set: ASINs from Dave's live drawer test on the matte-black
// bathroom accessories SERP (2026-05-04 screenshot). These are confirmed
// active listings on Amazon right now.
const ASINS = [
  'B0D2KZXT8R', // Matte Black Bathroom Accessories Set, KLJK...
  'B0G78XV5D1', // 10-Pieces Matte Black Bathroom Accessories
  'B08Q7MMJHH', // Cesun Small Bathroom Trash Can with Lid
  'B0DZCWPXM5', // IZORRO Bathroom Vanity Light Fixture (Sponsored)
  // Plus the 4 that returned data from the prior run, for comparison
  'B0009KF59M',
  'B0CHNL1JYB',
  'B0DDKSX2CW',
  'B0FZKCD3VF',
];

const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${((n / d) * 100).toFixed(0)}%`;
}

async function main() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing from .env.local');

  console.log('======================================================');
  console.log('Phase 5.4-F probe — Keepa csv[3] BSR history density');
  console.log('======================================================');
  console.log(`ASINs: ${ASINS.length}`);
  console.log(`Endpoint: ${KEEPA_BASE_URL}/product`);
  console.log(`Params: domain=1, stats=180, history=1`);
  console.log('');

  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${ASINS.join(',')}` +
    `&stats=180` +
    `&history=1`;

  const t0 = Date.now();
  const res = await fetch(url);
  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    console.error('Keepa request failed:', res.status, await res.text());
    process.exit(1);
  }
  const data: any = await res.json();

  console.log(`HTTP: ${res.status} · elapsed ${elapsedMs}ms · keepa proc ${data.processingTimeInMs}ms`);
  console.log(`Tokens: consumed=${data.tokensConsumed} left=${data.tokensLeft} refill=${data.refillRate}/min`);
  console.log('');

  const products: any[] = data.products || [];
  const now = Date.now();
  const cutoff30 = now - 30 * 86_400_000;

  console.log('--- Per-ASIN BSR history density ---');
  console.log(
    [
      'ASIN'.padEnd(12),
      'currBSR'.padEnd(9),
      '30dPts'.padEnd(7),
      '180dPts'.padEnd(8),
      '30d_min'.padEnd(9),
      '30d_med'.padEnd(9),
      '30d_max'.padEnd(9),
      '30d_mean'.padEnd(10),
      'snap÷med'.padEnd(9),
    ].join(' | ')
  );
  console.log('-'.repeat(110));

  type RowSummary = {
    asin: string;
    currentBsr: number | null;
    points30d: number;
    points180d: number;
    median30d: number | null;
    snapToMedianRatio: number | null;
  };
  const summaries: RowSummary[] = [];

  for (const asin of ASINS) {
    const p = products.find((x) => x?.asin === asin);
    if (!p) {
      console.log(`${asin.padEnd(12)} | <not returned>`);
      continue;
    }

    const cur = p.stats?.current || [];
    const currentBsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;

    // csv[3] format: alternating [keepaMinute, rank, keepaMinute, rank, ...]
    // -1 is "no data / out of stock" sentinel; skip.
    const csv3: number[] = Array.isArray(p.csv?.[3]) ? p.csv[3] : [];
    const points: Array<{ ts: number; rank: number }> = [];
    for (let i = 0; i + 1 < csv3.length; i += 2) {
      const km = csv3[i];
      const rank = csv3[i + 1];
      if (typeof km !== 'number' || typeof rank !== 'number' || rank <= 0) continue;
      points.push({ ts: km2ms(km), rank });
    }
    const points180 = points;
    const points30 = points.filter((x) => x.ts >= cutoff30);

    const ranks30 = points30.map((x) => x.rank);
    const min30 = ranks30.length ? Math.min(...ranks30) : null;
    const max30 = ranks30.length ? Math.max(...ranks30) : null;
    const med30 = median(ranks30);
    const mean30 = mean(ranks30);

    const snapToMedian =
      currentBsr != null && med30 != null && med30 > 0 ? currentBsr / med30 : null;

    summaries.push({
      asin,
      currentBsr,
      points30d: points30.length,
      points180d: points180.length,
      median30d: med30,
      snapToMedianRatio: snapToMedian,
    });

    console.log(
      [
        asin.padEnd(12),
        String(currentBsr ?? '-').padEnd(9),
        String(points30.length).padEnd(7),
        String(points180.length).padEnd(8),
        String(min30 ?? '-').padEnd(9),
        med30 != null ? med30.toFixed(0).padEnd(9) : '-'.padEnd(9),
        String(max30 ?? '-').padEnd(9),
        mean30 != null ? mean30.toFixed(0).padEnd(10) : '-'.padEnd(10),
        snapToMedian != null ? snapToMedian.toFixed(2).padEnd(9) : '-'.padEnd(9),
      ].join(' | ')
    );
  }

  console.log('');
  console.log('--- Aggregate density verdict ---');
  const totalPts30 = summaries.reduce((a, s) => a + s.points30d, 0);
  const totalPts180 = summaries.reduce((a, s) => a + s.points180d, 0);
  const avgPts30 = summaries.length ? totalPts30 / summaries.length : 0;
  const avgPts180 = summaries.length ? totalPts180 / summaries.length : 0;
  const sparseAsins = summaries.filter((s) => s.points30d < 10).length;
  const goodAsins = summaries.filter((s) => s.points30d >= 30).length;

  console.log(`  Avg points / ASIN, last 30d:   ${avgPts30.toFixed(1)}`);
  console.log(`  Avg points / ASIN, last 180d:  ${avgPts180.toFixed(1)}`);
  console.log(`  ASINs w/ <10 points in 30d:    ${sparseAsins}/${summaries.length} (${pct(sparseAsins, summaries.length)})`);
  console.log(`  ASINs w/ ≥30 points in 30d:    ${goodAsins}/${summaries.length} (${pct(goodAsins, summaries.length)})`);

  console.log('');
  console.log('--- Snapshot vs median spread (snap÷med) ---');
  const ratios = summaries
    .map((s) => s.snapToMedianRatio)
    .filter((r): r is number => r != null);
  if (ratios.length) {
    const minR = Math.min(...ratios);
    const maxR = Math.max(...ratios);
    const medR = median(ratios)!;
    const drift50 = ratios.filter((r) => r < 0.5 || r > 2).length;
    console.log(`  ratio range: ${minR.toFixed(2)} – ${maxR.toFixed(2)}, median ${medR.toFixed(2)}`);
    console.log(`  ASINs where snapshot drifts >2× from 30d median: ${drift50}/${ratios.length} (${pct(drift50, ratios.length)})`);
    console.log(`  → if this is high, single-snapshot units estimate is misleading and multi-point smoothing is REQUIRED.`);
  } else {
    console.log('  (no ratios computable — currentBsr or median30d missing on all rows)');
  }

  console.log('');
  console.log('--- Decision points ---');
  console.log('  1. Density: with ≥30 points / 30d on most ASINs, daily aggregation is feasible.');
  console.log('     With <10 / 30d on most, we should fall back to a coarser sample (e.g., one-per-week).');
  console.log('  2. Spread: high snap÷med drift means multi-point smoothing demonstrably matters.');
  console.log('     Low drift means snapshot is fine and Dave\'s concern, while valid in theory,');
  console.log('     wouldn\'t actually move the needle in practice.');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
