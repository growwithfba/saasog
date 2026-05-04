/**
 * Phase 5.4-H: per-category BSR-curve calibration harness.
 *
 * Pulls every (bsr, monthlySales, category) tuple from the H10 corpus
 * stored in `submissions.submission_data.productData.competitors`, runs
 * each through the v1.1.0 base curve, and computes a per-category
 * multiplier that lands the corpus at median ratio 1.0 against H10.
 *
 * Output: TypeScript file with the multipliers, ready to import into
 * the enrich route + bsrSalesCurve module.
 *
 * Run: `npx tsx scripts/probes/calibrate-category-multipliers.ts`
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { bsrToMonthlyUnits } from '../../src/lib/extension/bsrSalesCurve';

try {
  const t = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// True Amazon root categories. The H10 CSV export sometimes stores
// sub-category leaf names ("Projector Mounts", "Laptop Stands") whose
// BSR values are in the sub-category ranking, not the root. Those
// produce wildly miscalibrated multipliers because the BSR magnitude
// is incompatible with what Keepa returns at enrich-time (which uses
// the root-category BSR, the big number on the PDP). Whitelist =
// safe-to-calibrate categories only; everything else falls back to
// the universal v1.1.0 curve at lookup time.
const ROOT_CATEGORIES = new Set([
  'Arts, Crafts & Sewing',
  'Automotive',
  'Baby',
  'Beauty & Personal Care',
  'Books',
  'Clothing, Shoes & Jewelry',
  'Computers & Accessories',
  'Electronics',
  'Grocery & Gourmet Food',
  'Health & Household',
  'Home & Kitchen',
  'Industrial & Scientific',
  'Kitchen & Dining',
  'Musical Instruments',
  'Office Products',
  'Patio, Lawn & Garden',
  'Pet Supplies',
  'Sports & Outdoors',
  'Tools & Home Improvement',
  'Toys & Games',
  'Video Games',
]);

const MIN_SAMPLES_FOR_CATEGORY = 20;

type Sample = {
  bsr: number;
  monthlySales: number;
  category: string;
  asin: string;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Trimmed mean: drops top + bottom `pct` of values. More robust to
// outliers than plain mean, less rigid than median for sample sizes
// in the 20–100 range. Used as a sanity-check companion to median.
function trimmedMean(nums: number[], pct = 0.1): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const drop = Math.floor(s.length * pct);
  const kept = s.slice(drop, s.length - drop);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

async function main() {
  console.log('=== Phase 5.4-H per-category curve calibration ===');
  console.log('Pulling submissions in chunks of 10…');

  // Chunked pull to avoid the 60s timeout on the full submission_data
  // payload across 185 rows.
  const CHUNK = 10;
  let offset = 0;
  const samples: Sample[] = [];
  let totalSubs = 0;
  while (true) {
    const t0 = Date.now();
    const { data: rows, error } = await supabase
      .from('submissions')
      .select('id, submission_data')
      .range(offset, offset + CHUNK - 1)
      .order('id', { ascending: true });
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      totalSubs++;
      const competitors: any[] =
        (row as any).submission_data?.productData?.competitors ?? [];
      for (const c of competitors) {
        const bsr = Number(c?.bsr);
        const monthlySales = Number(c?.monthlySales);
        const category = String(c?.category ?? '').trim();
        const asin = String(c?.asin ?? '').trim();
        if (!bsr || !monthlySales || !category || !asin) continue;
        if (bsr <= 0 || monthlySales <= 0) continue;
        samples.push({ bsr, monthlySales, category, asin });
      }
    }
    process.stdout.write(
      `  offset=${offset.toString().padStart(4)} fetched=${rows.length} samples=${samples.length} elapsed=${Date.now() - t0}ms\n`
    );
    offset += CHUNK;
    if (rows.length < CHUNK) break;
  }
  console.log(`\nLoaded ${samples.length} usable samples from ${totalSubs} submissions.\n`);

  // Group by category, compute (observed / curve) ratio per sample.
  const byCategory = new Map<string, number[]>();
  for (const s of samples) {
    const curveUnits = bsrToMonthlyUnits(s.bsr);
    if (!curveUnits || curveUnits <= 0) continue;
    const ratio = s.monthlySales / curveUnits;
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(ratio);
  }

  // Per-category aggregates.
  type CatStat = {
    category: string;
    samples: number;
    medianRatio: number;
    trimmedMeanRatio: number;
    isRoot: boolean;
    qualifies: boolean;
  };
  const stats: CatStat[] = [];
  for (const [category, ratios] of byCategory) {
    const isRoot = ROOT_CATEGORIES.has(category);
    const qualifies = isRoot && ratios.length >= MIN_SAMPLES_FOR_CATEGORY;
    stats.push({
      category,
      samples: ratios.length,
      medianRatio: median(ratios),
      trimmedMeanRatio: trimmedMean(ratios, 0.1),
      isRoot,
      qualifies,
    });
  }
  stats.sort((a, b) => b.samples - a.samples);

  console.log(
    `${'Category'.padEnd(36)} | ${'n'.padEnd(5)} | ${'median'.padEnd(8)} | ${'trim10'.padEnd(8)} | root | qualifies`
  );
  console.log('-'.repeat(95));
  for (const s of stats) {
    console.log(
      `${s.category.padEnd(36)} | ${String(s.samples).padEnd(5)} | ${s.medianRatio.toFixed(3).padEnd(8)} | ${s.trimmedMeanRatio.toFixed(3).padEnd(8)} | ${(s.isRoot ? 'yes' : '   ').padEnd(4)} | ${s.qualifies ? '✓' : ''}`
    );
  }

  // Overall corpus median (sanity — confirms whether the v1.1.0 base
  // curve is centered correctly across the full corpus).
  const allRatios = samples
    .map((s) => {
      const c = bsrToMonthlyUnits(s.bsr);
      return c && c > 0 ? s.monthlySales / c : null;
    })
    .filter((r): r is number => r != null && Number.isFinite(r));
  console.log(`\nOverall corpus: n=${allRatios.length}, median ratio=${median(allRatios).toFixed(3)}, trimmed-mean=${trimmedMean(allRatios, 0.1).toFixed(3)}`);
  console.log('  (1.000 = v1.1.0 base curve perfectly calibrated across the whole corpus)');

  // Generate output file.
  const qualified = stats.filter((s) => s.qualifies);
  console.log(`\n=== ${qualified.length} qualifying categories (>=${MIN_SAMPLES_FOR_CATEGORY} samples in a known root) ===\n`);
  for (const s of qualified) {
    console.log(`  ${s.category.padEnd(36)} → ${s.medianRatio.toFixed(2)}x  (n=${s.samples})`);
  }

  const out = `// AUTO-GENERATED by scripts/probes/calibrate-category-multipliers.ts
// DO NOT EDIT MANUALLY. Re-run the harness against the H10 corpus to
// regenerate.
//
// Per-Amazon-root-category multipliers applied on top of the v1.1.0
// base BSR curve. Trained against ${samples.length} samples from the
// in-Supabase H10 corpus.
//
// Each multiplier represents median(observedH10Units / v11CurveUnits)
// for that category — a value < 1.0 means the universal curve
// overestimates units in this category; > 1.0 means it underestimates.
//
// Calibration date: ${new Date().toISOString().slice(0, 10)}

export const CATEGORY_CALIBRATION_VERSION = 'v2-${new Date().toISOString().slice(0, 10)}';

export const CATEGORY_MULTIPLIERS: Record<string, number> = {
${qualified
  .map((s) => `  ${JSON.stringify(s.category)}: ${s.medianRatio.toFixed(3)},  // n=${s.samples}, trim10=${s.trimmedMeanRatio.toFixed(3)}`)
  .join('\n')}
};

/**
 * Look up a category multiplier. Returns 1.0 (no-op) for categories
 * we haven't calibrated — keeps the legacy v1.1.0 curve as the safe
 * fallback rather than guessing.
 */
export function categoryMultiplier(category: string | null | undefined): number {
  if (!category) return 1;
  return CATEGORY_MULTIPLIERS[category] ?? 1;
}
`;
  const outPath = path.join(
    process.cwd(),
    'src/lib/extension/bsrCategoryMultipliers.ts'
  );
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`\n✓ Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
