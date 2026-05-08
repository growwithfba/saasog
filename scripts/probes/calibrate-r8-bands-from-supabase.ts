/**
 * Phase 5.4-N r8: band-fit the 12 categories that were single-multiplier
 * in v6, using the Supabase H10 corpus.
 *
 * Mirrors `calibrate-from-csv-folder.ts` band-fitting math but pulls
 * samples from `submissions.submission_data.productData.competitors`
 * (the v3 H10 corpus, ~3000 ASINs across 185 submissions). No new CSVs
 * needed — the same data the v3 single-mult fit ran on.
 *
 * The 6 categories already band-fit in v6 (Beauty, H&H, Cell Phones,
 * Automotive, Home & Kitchen, Musical Instruments) are SKIPPED — those
 * fits used per-category H10 batches, not the in-Supabase corpus, and
 * shouldn't be regressed.
 *
 * Output: prints a paste-ready snippet per category for hand-editing
 * into bsrCategoryMultipliers.ts. Does NOT auto-overwrite the file.
 *
 * Run: `npx tsx scripts/probes/calibrate-r8-bands-from-supabase.ts`
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 12 v6 single-multiplier categories that need band fits.
// Baby + Baby Products are aliases — fit Baby, copy to Baby Products.
const TARGET_CATEGORIES = new Set([
  'Kitchen & Dining',
  'Sports & Outdoors',
  'Pet Supplies',
  'Toys & Games',
  'Office Products',
  'Patio, Lawn & Garden',
  'Tools & Home Improvement',
  'Baby',
  'Arts, Crafts & Sewing',
  'Electronics',
  'Industrial & Scientific',
]);

// Locked 2026-05-06, see project_calibration_vision.md.
const BANDS: Array<[number, number, string]> = [
  [0,         4_000,    '0-4k'],
  [4_000,    15_000,    '4k-15k'],
  [15_000,   60_000,    '15k-60k'],
  [60_000,  200_000,    '60k-200k'],
  [200_000, Infinity,   '200k+'],
];

const MIN_SAMPLES_PER_BAND = 30;
const MIN_SAMPLES_FOR_CATEGORY = 50;

type Sample = { asin: string; bsr: number; monthlySales: number; ratio: number; source: 'csv' | 'submission' };

// JSONL corpus from scripts/probes/data/h10-extra-corpus.jsonl — same
// dataset v6 (recalibrate-base-curve.ts) trained on. Mostly popular-BSR
// cleanly-parent-child products. Without this the Supabase-only fit
// loses ~50% of training samples for several categories.
function loadCsvCorpus(): Map<string, Sample[]> {
  const byCat = new Map<string, Sample[]>();
  const p = path.join(process.cwd(), 'scripts/probes/data/h10-extra-corpus.jsonl');
  if (!fs.existsSync(p)) return byCat;
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  let count = 0;
  for (const l of lines) {
    const r = JSON.parse(l);
    if (!r.asin || !r.bsr || !r.category || !r.parentSales) continue;
    if (!TARGET_CATEGORIES.has(r.category)) continue;
    const expected = bsrToMonthlyUnits(r.bsr);
    if (expected == null || expected <= 0) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push({
      asin: r.asin,
      bsr: r.bsr,
      monthlySales: r.parentSales,
      ratio: r.parentSales / expected,
      source: 'csv',
    });
    count++;
  }
  console.log(`CSV corpus: ${count} samples in target categories.`);
  return byCat;
}

const median = (n: number[]): number => {
  if (!n.length) return 0;
  const s = [...n].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number[], p: number): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};

async function loadCorpus(): Promise<Map<string, Sample[]>> {
  const byCat = new Map<string, Sample[]>();
  const CHUNK = 10;
  let offset = 0;
  let totalSubs = 0;
  let totalSamples = 0;

  while (true) {
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
        // Mirror recalibrate-base-curve.ts: only single-variation rows.
        // For multi-variation products monthlySales is ambiguous (parent
        // vs child) and would bias the ratio. Single-variation = parent
        // = child, no ambiguity.
        const v = c?.variations;
        const isSingle = v === 'No' || v === 'no' || v === 1 || v === '1' || v === 'N/A';
        if (!isSingle) continue;
        const bsr = Number(c?.bsr);
        const monthlySales = Number(c?.monthlySales);
        const category = String(c?.category ?? '').trim();
        const asin = String(c?.asin ?? '').trim();
        if (!bsr || !monthlySales || !category || !asin) continue;
        if (bsr <= 0 || monthlySales <= 0) continue;
        if (!TARGET_CATEGORIES.has(category)) continue;
        const expected = bsrToMonthlyUnits(bsr);
        if (expected == null || expected <= 0) continue;
        const ratio = monthlySales / expected;
        if (!byCat.has(category)) byCat.set(category, []);
        byCat.get(category)!.push({ asin, bsr, monthlySales, ratio, source: 'submission' });
        totalSamples++;
      }
    }
    process.stdout.write(
      `  offset=${String(offset).padStart(4)} subs=${rows.length} cumulative_target_samples=${totalSamples}\n`
    );
    offset += CHUNK;
    if (rows.length < CHUNK) break;
  }

  console.log(`\nSupabase: ${totalSamples} raw samples (${totalSubs} submissions scanned).`);
  return byCat;
}

function mergeCorpora(
  supabase: Map<string, Sample[]>,
  csv: Map<string, Sample[]>,
): Map<string, Sample[]> {
  const cats = new Set<string>([...supabase.keys(), ...csv.keys()]);
  const merged = new Map<string, Sample[]>();
  for (const cat of cats) {
    const subs = supabase.get(cat) ?? [];
    const csvs = csv.get(cat) ?? [];
    // Dedupe by ASIN. CSV wins per recalibrate-base-curve.ts (newer +
    // cleaner schema). Insert submissions first, then CSV overwrites.
    const byAsin = new Map<string, Sample>();
    for (const s of subs) byAsin.set(s.asin, s);
    for (const s of csvs) byAsin.set(s.asin, s);
    merged.set(cat, [...byAsin.values()]);
  }
  return merged;
}

function fitCategory(cat: string, samples: Sample[]): string {
  const ratios = samples.map(s => s.ratio);
  const def = median(ratios);
  const lines: string[] = [];

  lines.push(`  // ${cat}`);
  lines.push(
    `  //   n=${samples.length}  default(median)=${def.toFixed(3)}x  ` +
    `IQR=[${pct(ratios, 0.25).toFixed(2)}, ${pct(ratios, 0.75).toFixed(2)}]  ` +
    `P10-P90=[${pct(ratios, 0.10).toFixed(2)}, ${pct(ratios, 0.90).toFixed(2)}]`
  );

  const bandLines: string[] = [];
  for (const [lo, hi, label] of BANDS) {
    const inBand = samples.filter(s => s.bsr >= lo && s.bsr < hi);
    if (inBand.length < MIN_SAMPLES_PER_BAND) {
      lines.push(
        `  //   band ${label.padEnd(9)} n=${String(inBand.length).padStart(3)}  ` +
        `-> dropped (n<${MIN_SAMPLES_PER_BAND}, falls back to default)`
      );
      continue;
    }
    const r = inBand.map(s => s.ratio);
    const m = median(r);
    lines.push(
      `  //   band ${label.padEnd(9)} n=${String(inBand.length).padStart(3)}  ` +
      `median=${m.toFixed(3)}x  IQR=[${pct(r, 0.25).toFixed(2)}, ${pct(r, 0.75).toFixed(2)}]`
    );
    const hiStr = hi === Infinity ? 'Infinity' : String(hi);
    bandLines.push(`      { bsrMin: ${lo}, bsrMax: ${hiStr}, mult: ${m.toFixed(3)}, n: ${inBand.length} },`);
  }

  lines.push(`  "${cat}": {`);
  lines.push(`    default: ${def.toFixed(3)},`);
  lines.push(`    n: ${samples.length},`);
  lines.push(`    fitDate: "${new Date().toISOString().slice(0, 10)}",`);
  if (bandLines.length) {
    lines.push(`    bands: [`);
    for (const b of bandLines) lines.push(b);
    lines.push(`    ],`);
  }
  lines.push(`  },`);
  return lines.join('\n');
}

async function main() {
  console.log('=== Phase 5.4-N r8: band-fit 12 v6 single-mult categories ===');
  console.log(`Targets: ${[...TARGET_CATEGORIES].join(', ')}\n`);
  console.log(`Bands: ${BANDS.map(b => b[2]).join('  /  ')}`);
  console.log(`Min samples per band: ${MIN_SAMPLES_PER_BAND}    Min samples per category: ${MIN_SAMPLES_FOR_CATEGORY}\n`);

  const supabaseCorpus = await loadCorpus();
  const csvCorpus = loadCsvCorpus();
  const byCat = mergeCorpora(supabaseCorpus, csvCorpus);
  if (!byCat.size) {
    console.error('no usable rows found in target categories');
    process.exit(1);
  }

  const totalAfterMerge = [...byCat.values()].reduce((a, b) => a + b.length, 0);
  console.log(`Merged corpus (CSV-wins dedup by ASIN): ${totalAfterMerge} samples across ${byCat.size} categories.\n`);

  const cats = Array.from(byCat.entries()).sort((a, b) => b[1].length - a[1].length);

  // Print a summary table first so Dave can eyeball n-distributions
  // before scanning the per-category fits.
  console.log('Pre-fit summary:');
  console.log(`${'Category'.padEnd(28)} | ${'n'.padEnd(5)} | ${'0-4k'.padEnd(6)} | ${'4k-15k'.padEnd(6)} | ${'15k-60k'.padEnd(7)} | ${'60k-200k'.padEnd(8)} | ${'200k+'.padEnd(6)}`);
  console.log('-'.repeat(84));
  for (const [cat, list] of cats) {
    const counts = BANDS.map(([lo, hi]) =>
      list.filter(s => s.bsr >= lo && s.bsr < hi).length
    );
    console.log(
      `${cat.padEnd(28)} | ${String(list.length).padEnd(5)} | ` +
      counts.map((c, i) => String(c).padEnd([6, 6, 7, 8, 6][i])).join(' | ')
    );
  }
  console.log();

  console.log('=== Per-category fits (paste-ready) ===\n');
  for (const [cat, list] of cats) {
    if (list.length < MIN_SAMPLES_FOR_CATEGORY) {
      console.log(`SKIP "${cat}" — n=${list.length} below threshold ${MIN_SAMPLES_FOR_CATEGORY}\n`);
      continue;
    }
    console.log(fitCategory(cat, list));
    console.log();
  }

  // Note about Baby Products alias
  if (byCat.has('Baby')) {
    console.log('// NOTE: Baby Products is an alias of Baby — copy the same fit to both.\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
