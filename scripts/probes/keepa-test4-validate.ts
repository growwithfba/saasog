/**
 * Test 4 - Updated re-validation. Same 48 ASINs Dave compared against
 * H10 in his "Test 4 - Updated" tab. Verifies the bucket-midpoint fix
 * lifts niche calibration (BSR > 50K).
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

// (asin, h10ChildUnits, h10ParentUnits) from "Test 4 - Updated".
const PAIRS: Array<[string, number, number | null]> = [
  ['1496447271', 287, 287],
  ['B005Z2X8KC', 50, 50],
  ['B00864B7WM', 315, 598],
  ['B01KAI2PL8', 60, 60],
  ['B078Z9W7MN', 31, 550],
  ['B07BV6BSV8', 273, 511],
  ['B087N9D6WD', 42, 249],
  ['B08S1QK8YX', 1171, 1171],
  ['B08SWM7GWM', 343, 343],
  ['B09J1LP2D4', 180, 180],
  ['B09J4PTFSG', 28, 120],
  ['B09M9GGG4J', 10, 10],
  ['B09NSKJY65', 42, 42],
  ['B09STB9P2W', 75, 75],
  ['B0B2WQBT1Z', 13, 13],
  ['B0B46YQ13F', 292, 292],
  ['B0B4PPC7YL', 672, 934],
  ['B0BCG9FF7J', 33, 33],
  ['B0BTBRRCSM', 19, 41],
  ['B0C1GWSC6N', 4, 8],
  ['B0C5X9KNP4', 79, 1324],
  ['B0CB9YPMPT', 82, 877],
  ['B0CD1795XS', 18, 30],
  ['B0CTKZ9J7N', 1218, 21618],
  ['B0CWZVYLDW', 76, 421],
  ['B0CXWPQSJQ', 17, 23],
  ['B0CY4QMYGR', 97, 97],
  ['B0DBJFJ1KQ', 417, 1808],
  ['B0DFMXVBN7', 177, 5026],
  ['B0DH1NWKKF', 7, 7],
  ['B0DQ1G5QGY', 118, 134],
  ['B0DSG3FX4B', 19, 129],
  ['B0DSWCVS85', 253, 304],
  ['B0DTJVCMBQ', 8, 8],
  ['B0F2B4JRK2', 20, 255],
  ['B0F49DKVCG', 72, 327],
  ['B0F6CP3WP8', 14, 97],
  ['B0F74LKDVQ', 48, 147],
  ['B0FCD7HW51', 69, 69],
  ['B0FF91LCGK', 26, 61],
  ['B0FGHDFX5N', 181, 181],
  ['B0FHW7MLXM', 8, 76],
  ['B0FHW8H3L6', 14, 429],
  ['B0FKGLJGYT', 125, 1782],
  ['B0FSRZD18G', 23, 10106],
  ['B0GFCRJ6T9', 68, 2321],
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
  const asins = PAIRS.map((p) => p[0]);
  const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1&asin=${asins.join(',')}&stats=180&history=1`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Keepa fail', res.status, await res.text());
    process.exit(1);
  }
  const data: any = await res.json();
  const products: any[] = data.products || [];
  const byAsin = new Map<string, any>();
  for (const p of products) if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);

  console.log(`\n=== Test 4 - Updated re-validation (${asins.length} ASINs) ===`);
  console.log(`Tokens consumed=${data.tokensConsumed}, left=${data.tokensLeft}\n`);

  const ratiosFloor: number[] = [];
  const ratiosMidpoint: number[] = [];
  const popularRatiosMid: number[] = [];
  const nicheRatiosMid: number[] = [];

  for (const [asin, h10Child, h10Parent] of PAIRS) {
    const p = byAsin.get(asin.toUpperCase());
    if (!p) continue;
    const cur: number[] = p.stats?.current ?? [];
    const currentBsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;
    const csv3: number[] = Array.isArray(p.csv?.[3]) ? p.csv[3] : [];
    const cutoff30 = Date.now() - 30 * 86400000;
    const points: number[] = [];
    for (let i = 0; i + 1 < csv3.length; i += 2) {
      if (typeof csv3[i] === 'number' && typeof csv3[i + 1] === 'number' && csv3[i + 1] > 0 && km2ms(csv3[i]) >= cutoff30) {
        points.push(csv3[i + 1]);
      }
    }
    const bsrMed = points.length >= 5 ? median(points) : null;
    const bsrForCurve = bsrMed ?? currentBsr;
    const parentUnits = bsrForCurve != null ? bsrToMonthlyUnits(bsrForCurve) : null;

    const variationCount = Array.isArray(p.variations) ? p.variations.length || 1 : 1;
    const monthlySold =
      typeof p.monthlySold === 'number' && p.monthlySold > 0
        ? p.monthlySold
        : typeof cur[30] === 'number' && cur[30] > 0
          ? cur[30]
          : null;

    let unitsFloor: number | null = null;
    let unitsMid: number | null = null;
    if (monthlySold != null) {
      unitsFloor = monthlySold;
      unitsMid = Math.round(monthlySold * 1.5);
    } else if (parentUnits != null) {
      const cap = variationCount <= 1 ? 1 : Math.min(variationCount, 5);
      unitsFloor = Math.max(0, Math.round(parentUnits / cap));
      unitsMid = unitsFloor;
    }

    const rFloor = unitsFloor && h10Child > 0 ? unitsFloor / h10Child : null;
    const rMid = unitsMid && h10Child > 0 ? unitsMid / h10Child : null;
    if (rFloor != null) ratiosFloor.push(rFloor);
    if (rMid != null) {
      ratiosMidpoint.push(rMid);
      const bsr = currentBsr ?? 0;
      if (bsr < 50000) popularRatiosMid.push(rMid);
      else nicheRatiosMid.push(rMid);
    }
  }

  function rep(label: string, vals: number[]) {
    if (!vals.length) return;
    const within = vals.filter((r) => r >= 0.5 && r <= 2.0).length;
    console.log(`  ${label}: n=${vals.length}, median=${median(vals).toFixed(2)}x, within 0.5x-2x: ${within}/${vals.length} (${((within / vals.length) * 100).toFixed(0)}%)`);
  }

  console.log('FLOOR (current pre-fix behavior):');
  rep('all', ratiosFloor);
  console.log('\nMIDPOINT (with monthlySold * 1.5 multiplier):');
  rep('all', ratiosMidpoint);
  rep('popular (BSR <50K)', popularRatiosMid);
  rep('niche (BSR >=50K)', nicheRatiosMid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
