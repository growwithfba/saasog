/**
 * Phase 5.4-H2: base BSR curve recalibration + multiplier re-derivation.
 *
 * Reads two corpora:
 *   1. CSV corpus (scripts/probes/data/h10-extra-corpus.jsonl) — clean
 *      parent/child split, mostly popular BSR (<5k).
 *   2. Submissions corpus (Supabase) — restricted to single-variation
 *      rows where `variations === 'No'`, so monthlySales is unambiguously
 *      parent-level (parent = child for single-variation products).
 *
 * Merges them, dedupes by ASIN (CSV wins — newer + clearer schema),
 * fits a new base curve against the merged training set, and re-derives
 * per-category multipliers as deviations from the new base.
 *
 * Outputs (in dry-run mode by default):
 *   - prints proposed v1.2.0 anchor table
 *   - prints proposed V3 category multipliers
 *   - prints validation: Test 6 (popular-skew) + held-out CSV subset
 *
 * Run: `npx tsx scripts/probes/recalibrate-base-curve.ts`
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

try {
  const t = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ROOT_CATEGORIES = new Set([
  'Arts, Crafts & Sewing','Automotive','Baby','Beauty & Personal Care','Books',
  'Clothing, Shoes & Jewelry','Computers & Accessories','Electronics',
  'Grocery & Gourmet Food','Health & Household','Home & Kitchen',
  'Industrial & Scientific','Kitchen & Dining','Musical Instruments',
  'Office Products','Patio, Lawn & Garden','Pet Supplies','Sports & Outdoors',
  'Tools & Home Improvement','Toys & Games','Video Games',
]);

// "Baby Products" is what Keepa returns; "Baby" is what H10 stores.
// Track aliases so multipliers map both names to the same value.
const CATEGORY_ALIASES: Record<string, string> = {
  'Baby Products': 'Baby',
};

type Sample = {
  asin: string;
  bsr: number;
  parentMonthly: number;  // parent-level monthly units
  category: string;
  source: 'csv' | 'submission';
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function trimmedMean(nums: number[], pct = 0.1): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const drop = Math.floor(s.length * pct);
  const kept = s.slice(drop, s.length - drop);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

// ---------- Corpus loading ----------

function loadCsvCorpus(): Sample[] {
  const p = path.join(process.cwd(), 'scripts/probes/data/h10-extra-corpus.jsonl');
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const out: Sample[] = [];
  for (const l of lines) {
    const r = JSON.parse(l);
    if (!r.asin || !r.bsr || !r.category || !r.parentSales) continue;
    if (!ROOT_CATEGORIES.has(r.category)) continue;
    out.push({
      asin: r.asin,
      bsr: r.bsr,
      parentMonthly: r.parentSales,
      category: r.category,
      source: 'csv',
    });
  }
  return out;
}

async function loadSubmissionsCorpus(): Promise<Sample[]> {
  const out: Sample[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('submissions').select('submission_data')
      .range(offset, offset + 9).order('id', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const comps: any[] = (row as any).submission_data?.productData?.competitors ?? [];
      for (const c of comps) {
        // Only single-variation rows (parent = child, no ambiguity).
        const v = c?.variations;
        const isSingle = v === 'No' || v === 'no' || v === 1 || v === '1' || v === 'N/A';
        if (!isSingle) continue;
        const bsr = Number(c?.bsr);
        const ms = Number(c?.monthlySales);
        const cat = String(c?.category ?? '').trim();
        const asin = String(c?.asin ?? '').trim();
        if (!asin || !bsr || !ms || !cat) continue;
        if (!ROOT_CATEGORIES.has(cat)) continue;
        out.push({ asin, bsr, parentMonthly: ms, category: cat, source: 'submission' });
      }
    }
    offset += 10;
    if (data.length < 10) break;
  }
  return out;
}

function mergeAndDedupe(csv: Sample[], subs: Sample[]): Sample[] {
  const byAsin = new Map<string, Sample>();
  for (const s of subs) byAsin.set(s.asin, s);   // submissions first
  for (const s of csv) byAsin.set(s.asin, s);    // CSV wins on collision
  return [...byAsin.values()];
}

// ---------- Curve fitting ----------

const ANCHOR_BUCKETS: [number, number][] = [
  [1,        50],
  [50,       200],
  [200,      500],
  [500,      1_500],
  [1_500,    5_000],
  [5_000,    15_000],
  [15_000,   50_000],
  [50_000,   150_000],
  [150_000,  500_000],
  [500_000,  Infinity],
];

type AnchorFit = {
  loBsr: number;
  hiBsr: number;
  midBsr: number;       // geometric midpoint
  n: number;
  medianMonthly: number;
  trim10Monthly: number;
};

function fitAnchors(samples: Sample[]): AnchorFit[] {
  const out: AnchorFit[] = [];
  for (const [lo, hi] of ANCHOR_BUCKETS) {
    const inBucket = samples.filter((s) => s.bsr >= lo && s.bsr < hi);
    const monthlies = inBucket.map((s) => s.parentMonthly);
    const midBsr = Number.isFinite(hi)
      ? Math.round(Math.sqrt(lo * hi))
      : Math.round(lo * 2);  // open-ended bucket: pick representative
    out.push({
      loBsr: lo,
      hiBsr: hi,
      midBsr,
      n: inBucket.length,
      medianMonthly: median(monthlies),
      trim10Monthly: trimmedMean(monthlies, 0.1),
    });
  }
  return out;
}

// Build daily-units anchor table from monthly medians for a curve module.
function anchorTable(fits: AnchorFit[]): [number, number][] {
  return fits
    .filter((f) => f.n >= 10)
    .map((f) => [f.midBsr, +(f.medianMonthly / 30).toFixed(2)] as [number, number]);
}

function logInterp(anchors: [number, number][], bsr: number): number | null {
  if (!Number.isFinite(bsr) || bsr <= 0 || anchors.length === 0) return null;
  if (bsr <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (bsr >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [r1, u1] = anchors[i];
    const [r2, u2] = anchors[i + 1];
    if (bsr >= r1 && bsr <= r2) {
      const t = (Math.log(bsr) - Math.log(r1)) / (Math.log(r2) - Math.log(r1));
      return Math.exp(Math.log(u1) + t * (Math.log(u2) - Math.log(u1)));
    }
  }
  return null;
}

// ---------- Validation ----------

const TEST6_PAIRS: [string, number, number][] = [
  // [asin, h10_child, h10_parent]
  ['B07CN9T8RC',3093,4214],['B0CWLTLC2F',1684,10085],['B0BTBV51KY',14901,14901],
  ['B0CSFBGQJP',8086,8086],['B071Y71Y3J',4257,6134],['B01FVS6TGO',1566,2273],
  ['B01COSEDKS',7287,8420],['B0FF9X3J72',1447,1447],['B0CDB7F7W3',1921,1921],
  ['B07MNMT3M7',10119,16287],['B0B9LCT9B7',1316,10085],['B0FLDB14N8',2716,3671],
  ['B0CCCZSR4W',9193,9193],['B007GE75HY',13792,22648],['B06XKMSMBF',1704,3600],
  ['B0DGWPJ5MW',26430,27607],['B00Y53V80E',3734,3734],['B0CRYJB6GK',15323,28764],
  ['B01EYUMENC',5899,5899],['B003ICWTME',5118,7727],['B07N4N6LDV',6826,6826],
  ['B0BKXSHHNP',4703,13482],['B08GDZ8H5Q',3889,5304],['B0CR6VKXJ7',4138,6292],
  ['B08345YDXJ',1335,1335],['B00K89KFX0',7951,7951],['B0DGXJP7X9',1398,2340],
  ['B01C5A2WJO',9433,9433],['B06WV7VBY5',8264,9457],['B07H331J4R',11892,11892],
  ['B0BZXNZZ67',10470,16720],['B07WZQGB76',1582,1582],['B0BGN1YDJH',9664,23019],
  ['B0D2ZD6J2W',9167,10681],['B07YR9T251',5498,5498],['B0C8NLNBW9',1592,1592],
  ['B01K1K0K6M',24395,24395],['B0CFZTK174',9272,15528],['B0CYT85XT6',7579,9063],
  ['B07CRSXMW8',5049,13878],['B093PX3CTV',2869,3430],['B01NCUSC7V',9925,11921],
  ['B0CTMJZZYH',3138,4153],['B01GFZT4AK',1964,1964],['B0843HW6C9',8633,8633],
  ['B00Y53V7XM',2089,2846],['B0CWNGN5V2',1518,1518],['B07B6ZN7P8',14632,32143],
];

const KEEPA = 'https://api.keepa.com';
const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

function pickRootCategoryName(p: any): string | null {
  const tree = p?.categoryTree;
  if (Array.isArray(tree) && tree.length > 0) {
    const root = tree[0];
    if (root && typeof root.name === 'string' && root.name.trim()) return root.name.trim();
  }
  return null;
}

async function validateTest6(
  anchors: [number, number][],
  multipliers: Record<string, number>,
): Promise<{ pMedian: number; pBand: number; cMedian: number; cBand: number }> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing');
  const asins = TEST6_PAIRS.map((p) => p[0]);
  const url = `${KEEPA}/product?key=${apiKey}&domain=1&asin=${asins.join(',')}&stats=180&history=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Keepa ${res.status}`);
  const data: any = await res.json();
  const byAsin = new Map<string, any>();
  for (const p of data.products || []) if (p?.asin) byAsin.set(p.asin.toUpperCase(), p);

  const cRatios: number[] = [];
  const pRatios: number[] = [];
  for (const [asin, h10c, h10p] of TEST6_PAIRS) {
    const p = byAsin.get(asin);
    if (!p) continue;
    const cur: number[] = p.stats?.current ?? [];
    const curBsr = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null;
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
    let rootCat = pickRootCategoryName(p);
    if (rootCat && CATEGORY_ALIASES[rootCat]) rootCat = CATEGORY_ALIASES[rootCat];
    const dailyBase = bsrUse != null ? logInterp(anchors, bsrUse) : null;
    const monthlyBase = dailyBase != null ? Math.round(dailyBase * 30) : null;
    const m = rootCat ? (multipliers[rootCat] ?? 1) : 1;
    const parentBsrDerived = monthlyBase != null ? Math.max(0, Math.round(monthlyBase * m)) : null;

    const variations = Array.isArray(p.variations) ? p.variations.length || 1 : 1;
    const monthlySold = typeof p.monthlySold === 'number' && p.monthlySold > 0
      ? p.monthlySold
      : (typeof cur[30] === 'number' && cur[30] > 0 ? cur[30] : null);

    let blChild: number | null = null;
    if (monthlySold != null) blChild = Math.round(monthlySold * 1.5);
    else if (parentBsrDerived != null) {
      blChild = variations <= 1 ? parentBsrDerived : Math.max(0, Math.round(parentBsrDerived / Math.min(variations, 5)));
    }
    let blParent = parentBsrDerived;
    if (blParent != null && blChild != null && blParent < blChild) blParent = blChild;
    if (blParent == null && blChild != null) blParent = blChild;

    if (blChild != null && h10c > 0) cRatios.push(blChild / h10c);
    if (blParent != null && h10p > 0) pRatios.push(blParent / h10p);
  }
  const inBand = (xs: number[]) => xs.filter((v) => v >= 0.5 && v <= 2.0).length / xs.length;
  return {
    pMedian: median(pRatios),
    pBand: inBand(pRatios),
    cMedian: median(cRatios),
    cBand: inBand(cRatios),
  };
}

function validateHeldOut(
  heldOut: Sample[],
  anchors: [number, number][],
  multipliers: Record<string, number>,
): { n: number; median: number; trim10: number; band: number } {
  const ratios: number[] = [];
  for (const s of heldOut) {
    const dailyBase = logInterp(anchors, s.bsr);
    if (dailyBase == null) continue;
    const monthlyBase = dailyBase * 30;
    const m = multipliers[s.category] ?? 1;
    const predicted = monthlyBase * m;
    if (predicted <= 0) continue;
    ratios.push(predicted / s.parentMonthly);
  }
  return {
    n: ratios.length,
    median: median(ratios),
    trim10: trimmedMean(ratios, 0.1),
    band: ratios.filter((v) => v >= 0.5 && v <= 2.0).length / ratios.length,
  };
}

// ---------- Main ----------

async function main() {
  console.log('=== Phase 5.4-H2 base-curve recalibration ===\n');

  console.log('Loading CSV corpus…');
  const csv = loadCsvCorpus();
  console.log(`  ${csv.length} CSV rows`);

  console.log('Loading single-variation submissions…');
  const subs = await loadSubmissionsCorpus();
  console.log(`  ${subs.length} single-variation submission rows`);

  const merged = mergeAndDedupe(csv, subs);
  console.log(`\nMerged: ${merged.length} unique ASINs (CSV wins on collision)\n`);

  // Reproducible held-out split: 15% by hash of ASIN
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  };
  const train = merged.filter((s) => (hash(s.asin) % 100) >= 15);
  const heldOut = merged.filter((s) => (hash(s.asin) % 100) < 15);
  console.log(`Train: ${train.length}  Held-out: ${heldOut.length}\n`);

  // Fit base curve against training data
  const fits = fitAnchors(train);
  console.log('=== Per-bucket fit (training set only) ===');
  console.log(`${'BSR range'.padEnd(20)} | ${'mid'.padStart(8)} | ${'n'.padStart(5)} | ${'median'.padStart(10)} | ${'trim10'.padStart(10)} | daily(median)`);
  console.log('-'.repeat(90));
  for (const f of fits) {
    const range = `${f.loBsr}–${Number.isFinite(f.hiBsr) ? f.hiBsr : '∞'}`;
    console.log(`${range.padEnd(20)} | ${String(f.midBsr).padStart(8)} | ${String(f.n).padStart(5)} | ${f.medianMonthly.toFixed(0).padStart(10)} | ${f.trim10Monthly.toFixed(0).padStart(10)} | ${(f.medianMonthly / 30).toFixed(2)}`);
  }

  const newAnchors = anchorTable(fits);
  console.log('\n=== Proposed v1.2.0 anchors (BSR → daily units) ===');
  for (const [bsr, daily] of newAnchors) console.log(`  [${bsr.toString().padStart(8)}, ${daily.toString().padStart(8)}],`);

  // Re-derive per-category multipliers using new base
  console.log('\n=== Re-deriving per-category multipliers against new base ===');
  const byCat = new Map<string, number[]>();
  for (const s of train) {
    const dailyBase = logInterp(newAnchors, s.bsr);
    if (dailyBase == null) continue;
    const monthlyBase = dailyBase * 30;
    if (monthlyBase <= 0) continue;
    const ratio = s.parentMonthly / monthlyBase;
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category)!.push(ratio);
  }
  type CatStat = { category: string; n: number; medianRatio: number; trim10: number; qualifies: boolean; multInBand: boolean };
  const stats: CatStat[] = [];
  for (const [cat, ratios] of byCat) {
    const med = median(ratios);
    stats.push({
      category: cat,
      n: ratios.length,
      medianRatio: med,
      trim10: trimmedMean(ratios, 0.1),
      qualifies: ratios.length >= 20,
      multInBand: med >= 0.5 && med <= 2.0,
    });
  }
  stats.sort((a, b) => b.n - a.n);
  console.log(`${'Category'.padEnd(28)} | ${'n'.padStart(5)} | ${'median'.padStart(8)} | ${'trim10'.padStart(8)} | qualifies | inBand`);
  console.log('-'.repeat(85));
  for (const s of stats) {
    console.log(`${s.category.padEnd(28)} | ${String(s.n).padStart(5)} | ${s.medianRatio.toFixed(3).padStart(8)} | ${s.trim10.toFixed(3).padStart(8)} | ${(s.qualifies ? '✓' : '').padStart(9)} | ${s.multInBand ? '✓' : ''}`);
  }
  const multipliers: Record<string, number> = {};
  for (const s of stats) {
    if (s.qualifies && s.multInBand) {
      multipliers[s.category] = +s.medianRatio.toFixed(3);
      // Mirror Keepa-name aliases so they look up the same value
      for (const [keepaName, h10Name] of Object.entries(CATEGORY_ALIASES)) {
        if (h10Name === s.category) multipliers[keepaName] = +s.medianRatio.toFixed(3);
      }
    }
  }
  console.log(`\n${Object.keys(multipliers).length} qualifying multipliers shipped (≥20 samples AND median within 0.5–2.0)`);

  // Validation
  console.log('\n=== Held-out validation (15% of merged corpus) ===');
  const ho = validateHeldOut(heldOut, newAnchors, multipliers);
  console.log(`  ALL          n=${ho.n}, median=${ho.median.toFixed(2)}x, trim10=${ho.trim10.toFixed(2)}x, in 0.5x-2x band: ${(ho.band * 100).toFixed(0)}%`);
  const hoCsv = validateHeldOut(heldOut.filter((s) => s.source === 'csv'), newAnchors, multipliers);
  console.log(`  CSV only     n=${hoCsv.n}, median=${hoCsv.median.toFixed(2)}x, trim10=${hoCsv.trim10.toFixed(2)}x, in 0.5x-2x band: ${(hoCsv.band * 100).toFixed(0)}%`);
  const hoSub = validateHeldOut(heldOut.filter((s) => s.source === 'submission'), newAnchors, multipliers);
  console.log(`  Submissions  n=${hoSub.n}, median=${hoSub.median.toFixed(2)}x, trim10=${hoSub.trim10.toFixed(2)}x, in 0.5x-2x band: ${(hoSub.band * 100).toFixed(0)}%`);

  // Per-category held-out band rate (qualifying categories only) — shows
  // which calibrated categories are actually predicting accurately.
  console.log(`\n  Per-category held-out (qualifying multiplier categories):`);
  const hoByCat = new Map<string, Sample[]>();
  for (const s of heldOut) {
    if (multipliers[s.category] != null) {
      if (!hoByCat.has(s.category)) hoByCat.set(s.category, []);
      hoByCat.get(s.category)!.push(s);
    }
  }
  for (const [cat, ss] of [...hoByCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const r = validateHeldOut(ss, newAnchors, multipliers);
    console.log(`    ${cat.padEnd(28)} n=${String(r.n).padStart(3)} median=${r.median.toFixed(2)}x band=${(r.band * 100).toFixed(0)}%`);
  }

  console.log('\n=== Test 6 validation (47 Toys & Games + 1 Baby Products) ===');
  try {
    const t6 = await validateTest6(newAnchors, multipliers);
    console.log(`  per-child  median=${t6.cMedian.toFixed(2)}x, in band: ${(t6.cBand * 100).toFixed(0)}%`);
    console.log(`  per-parent median=${t6.pMedian.toFixed(2)}x, in band: ${(t6.pBand * 100).toFixed(0)}%`);
  } catch (e) {
    console.log(`  Skipped (${(e as Error).message})`);
  }

  console.log('\n(Dry-run only — not writing curve/multiplier files.)');
}

main().catch((e) => { console.error(e); process.exit(1); });
