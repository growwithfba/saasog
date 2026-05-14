/**
 * Band-granularity research probe.
 *
 * Tests Dave's hypothesis: would more BSR bands per category improve
 * calibration accuracy?
 *
 * Outputs:
 *   1. Sample-size feasibility for 5/10/20-band designs per priority category
 *   2. Within-band variance (IQR of fitted multipliers within each current band)
 *   3. Refit comparison: 5-band vs 10-band log-spaced, residual reduction
 *   4. BSR distribution density per category
 */
import * as fs from 'fs';
import { bsrToMonthlyUnits } from '../../src/lib/extension/bsrSalesCurve';

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function num(s: any): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,"]/g, '').trim();
  if (!cleaned || cleaned === 'N/A') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = q * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const PRIORITY = [
  'Patio, Lawn & Garden',
  'Pet Supplies',
  'Industrial & Scientific',
  'Kitchen & Dining',
  'Arts, Crafts & Sewing',
  'Office Products',
  'Sports & Outdoors',
  'Tools & Home Improvement',
  'Toys & Games',
  'Automotive',
  'Baby',
  'Electronics',
  'Home & Kitchen',
  'Health & Household',
];

const CSV = process.argv[2] ?? '/tmp/combined-h10-full.csv';
const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
const lines = text.split('\n').filter(Boolean);
const hdr = parseCsvLine(lines[0]);
const idx = {
  asin: hdr.indexOf('ASIN'),
  parentSales: hdr.indexOf('Parent Level Sales'),
  bsr: hdr.indexOf('BSR'),
  category: hdr.indexOf('Category'),
};

type Sample = { asin: string; bsr: number; sales: number; ratio: number; category: string };
const byCategory = new Map<string, Sample[]>();
for (let i = 1; i < lines.length; i++) {
  const r = parseCsvLine(lines[i]);
  const asin = r[idx.asin]?.trim();
  const bsr = num(r[idx.bsr]);
  const sales = num(r[idx.parentSales]);
  const cat = (r[idx.category] ?? '').trim();
  if (!asin || !bsr || !sales || bsr <= 0 || sales <= 0 || !cat) continue;
  const monthly = sales;
  const predicted = bsrToMonthlyUnits(bsr);
  if (!predicted || predicted <= 0) continue;
  const ratio = monthly / predicted;
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat)!.push({ asin, bsr, sales: monthly, ratio, category: cat });
}

console.log('\n========================================');
console.log('1. SAMPLE-SIZE FEASIBILITY');
console.log('========================================');

function binBy(samples: Sample[], edges: number[]): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const n = samples.filter(s => s.bsr >= lo && s.bsr < hi).length;
    const label = `${lo}-${hi === Infinity ? '∞' : hi}`;
    out.push({ label, n });
  }
  return out;
}

const FIVE = [0, 4_000, 15_000, 60_000, 200_000, Infinity];
const TEN  = [0, 2_000, 4_000, 8_000, 15_000, 30_000, 60_000, 120_000, 200_000, 500_000, Infinity];
const TWENTY = [
  0, 1_000, 2_000, 3_000, 4_000, 6_000, 8_000, 12_000, 15_000, 22_000, 30_000,
  45_000, 60_000, 90_000, 120_000, 200_000, 350_000, 500_000, 750_000, 1_500_000, Infinity,
];

for (const cat of PRIORITY) {
  const samples = byCategory.get(cat) ?? [];
  if (samples.length === 0) continue;
  console.log(`\n${cat} (n=${samples.length})`);
  const five = binBy(samples, FIVE);
  const ten = binBy(samples, TEN);
  const twenty = binBy(samples, TWENTY);
  const f5fit = five.filter(b => b.n >= 30).length;
  const f10fit = ten.filter(b => b.n >= 30).length;
  const f20fit = twenty.filter(b => b.n >= 30).length;
  console.log(`   5-band fit coverage: ${f5fit}/${five.length}   |  10-band: ${f10fit}/${ten.length}   |  20-band: ${f20fit}/${twenty.length}`);
  console.log('  5-band per-band n: ' + five.map(b => `${b.label}=${b.n}${b.n < 30 ? '✗' : ''}`).join('  '));
  console.log(' 10-band per-band n: ' + ten.map(b => `${b.label}=${b.n}${b.n < 30 ? '✗' : ''}`).join('  '));
  console.log(' 20-band per-band n: ' + twenty.map(b => `${b.label}=${b.n}${b.n < 30 ? '✗' : ''}`).join('  '));
}

console.log('\n\n========================================');
console.log('2. WITHIN-BAND VARIANCE (current 5-band)');
console.log('========================================');
console.log('Wide IQR/median = scatter inside the band = more bands MIGHT help.');
console.log('Narrow IQR/median = uniform within band = more bands won\'t help much.\n');
console.log('cat                          band         n    median  p25-p75       IQR/med');
for (const cat of PRIORITY) {
  const samples = byCategory.get(cat) ?? [];
  if (samples.length === 0) continue;
  for (let i = 0; i < FIVE.length - 1; i++) {
    const lo = FIVE[i], hi = FIVE[i + 1];
    const inBand = samples.filter(s => s.bsr >= lo && s.bsr < hi);
    if (inBand.length < 30) continue;
    const ratios = inBand.map(s => s.ratio);
    const m = median(ratios);
    const p25 = quantile(ratios, 0.25);
    const p75 = quantile(ratios, 0.75);
    const iqr = p75 - p25;
    const cv = iqr / m;
    const lbl = `${lo}-${hi === Infinity ? '∞' : hi}`;
    console.log(
      `${cat.padEnd(28)} ${lbl.padEnd(12)} ${String(inBand.length).padStart(4)} ${m.toFixed(2).padStart(7)}× ${p25.toFixed(2)}-${p75.toFixed(2).padEnd(8)}  ${cv.toFixed(2)}`
    );
  }
}

console.log('\n\n========================================');
console.log('3. REFIT COMPARISON: 5-BAND vs 10-BAND');
console.log('========================================');
console.log('Train on first half of corpus, test on second half.');
console.log('Residual = median(|log(predicted_ratio / actual_ratio)|). Lower = better.\n');

function fitBands(samples: Sample[], edges: number[]): { lo: number; hi: number; mult: number; n: number }[] {
  const fits: { lo: number; hi: number; mult: number; n: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const inBand = samples.filter(s => s.bsr >= lo && s.bsr < hi);
    if (inBand.length < 30) {
      fits.push({ lo, hi, mult: NaN, n: inBand.length });
    } else {
      const m = median(inBand.map(s => s.ratio));
      fits.push({ lo, hi, mult: m, n: inBand.length });
    }
  }
  return fits;
}
function applyBands(bsr: number, fits: ReturnType<typeof fitBands>, fallback: number): number {
  for (const f of fits) {
    if (bsr >= f.lo && bsr < f.hi) return Number.isFinite(f.mult) ? f.mult : fallback;
  }
  return fallback;
}

console.log('cat                          n_train  n_test  res_5   res_10   res_20   improve_5→10  5→20');
for (const cat of PRIORITY) {
  const all = byCategory.get(cat) ?? [];
  if (all.length < 100) continue;
  // Deterministic split: every other row to train/test
  const train = all.filter((_, i) => i % 2 === 0);
  const test = all.filter((_, i) => i % 2 === 1);
  const trainDefault = median(train.map(s => s.ratio));
  const fits5 = fitBands(train, FIVE);
  const fits10 = fitBands(train, TEN);
  const fits20 = fitBands(train, TWENTY);
  const res5: number[] = [];
  const res10: number[] = [];
  const res20: number[] = [];
  for (const t of test) {
    const m5 = applyBands(t.bsr, fits5, trainDefault);
    const m10 = applyBands(t.bsr, fits10, trainDefault);
    const m20 = applyBands(t.bsr, fits20, trainDefault);
    res5.push(Math.abs(Math.log(m5 / t.ratio)));
    res10.push(Math.abs(Math.log(m10 / t.ratio)));
    res20.push(Math.abs(Math.log(m20 / t.ratio)));
  }
  const med5 = median(res5);
  const med10 = median(res10);
  const med20 = median(res20);
  const i510 = ((med5 - med10) / med5) * 100;
  const i520 = ((med5 - med20) / med5) * 100;
  console.log(
    `${cat.padEnd(28)} ${String(train.length).padStart(7)} ${String(test.length).padStart(6)}  ${med5.toFixed(3)}   ${med10.toFixed(3)}    ${med20.toFixed(3)}    ${i510.toFixed(1).padStart(5)}%        ${i520.toFixed(1).padStart(5)}%`
  );
}

console.log('\n\n========================================');
console.log('4. BSR DENSITY DISTRIBUTION');
console.log('========================================');
const DENSITY_BANDS = [0, 1_000, 4_000, 15_000, 60_000, 200_000, 1_000_000, Infinity];
console.log('cat                          0-1k   1-4k  4-15k 15-60k 60-200k 200k-1M 1M+   total');
for (const cat of PRIORITY) {
  const samples = byCategory.get(cat) ?? [];
  if (samples.length === 0) continue;
  const counts = DENSITY_BANDS.slice(0, -1).map((lo, i) =>
    samples.filter(s => s.bsr >= lo && s.bsr < DENSITY_BANDS[i + 1]).length
  );
  console.log(
    `${cat.padEnd(28)} ${counts.map(c => String(c).padStart(5)).join(' ')}    ${samples.length}`
  );
}
