/**
 * Bands ON vs Bands OFF — head-to-head accuracy comparison.
 *
 * For each priority category in the H10 corpus, computes:
 *   - Bands ON: current production behaviour. Uses bsrToMonthlyUnitsByCategory
 *     which applies per-band multipliers within the category.
 *   - Bands OFF: hypothetical. Uses base curve × ONE optimal multiplier per
 *     category, where "optimal" = the multiplier that makes the median
 *     ratio = 1.00 across all rows in the category (best-case single-mult fit).
 *
 * Reports per category:
 *   - Median ratio (on vs off)
 *   - % of rows within +-20% of H10 ground truth (on vs off)
 *   - % within +-50% (a more lenient practical accuracy band)
 *   - Per-band breakdown showing where bands ON wins or loses
 *
 * Run: npx tsx scripts/probes/bands-on-vs-off-comparison.ts <h10.csv>
 *
 * Pure analysis — does not change any production code or multipliers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bsrToMonthlyUnits, bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';

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
  const cleaned = String(s).replace(/[",]/g, '').trim();
  if (!cleaned || cleaned === 'N/A') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

const BANDS = [
  { label: '0-4k', min: 0, max: 4_000 },
  { label: '4k-15k', min: 4_000, max: 15_000 },
  { label: '15k-60k', min: 15_000, max: 60_000 },
  { label: '60k-200k', min: 60_000, max: 200_000 },
  { label: '200k+', min: 200_000, max: Infinity },
];

function bandLabelFor(bsr: number): string {
  for (const b of BANDS) if (bsr >= b.min && bsr < b.max) return b.label;
  return '?';
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pctWithin(xs: number[], lo: number, hi: number): number {
  if (!xs.length) return NaN;
  const n = xs.filter((x) => x >= lo && x <= hi).length;
  return (n / xs.length) * 100;
}

const PRIORITY_CATS = [
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

interface Row {
  asin: string;
  cat: string;
  bsr: number;
  actual: number;
  base: number;          // base curve prediction (no multiplier)
  predOn: number;        // bands ON prediction (current)
  band: string;
}

function main() {
  const csvPath = path.resolve(process.argv[2] ?? '/tmp/combined-h10-full.csv');
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0].replace(/^﻿/, ''));
  const iAsin = header.indexOf('ASIN');
  const iCat = header.indexOf('Category');
  const iBsr = header.indexOf('BSR');
  const iSales = header.indexOf('Parent Level Sales');

  const byCat = new Map<string, Row[]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const cat = cols[iCat]?.trim();
    const bsr = num(cols[iBsr]);
    const actual = num(cols[iSales]);
    const asin = cols[iAsin]?.trim();
    if (!cat || bsr == null || actual == null || actual <= 0 || !PRIORITY_CATS.includes(cat)) continue;
    const base = bsrToMonthlyUnits(bsr);
    const predOn = bsrToMonthlyUnitsByCategory(bsr, [cat]);
    if (base == null || base <= 0 || predOn == null || predOn <= 0) continue;
    const row: Row = { asin, cat, bsr, actual, base, predOn, band: bandLabelFor(bsr) };
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(row);
  }

  // Compute the optimal single multiplier per category.
  // The single mult M that makes median(M * base / actual) = 1.00 is
  // M = median(actual / base) across all rows in the category.
  const optimalMult = new Map<string, number>();
  for (const [cat, rows] of byCat) {
    const ratios = rows.map((r) => r.actual / r.base);
    optimalMult.set(cat, median(ratios));
  }

  // Headline table
  console.log(`\nHEAD-TO-HEAD: bands ON (current) vs bands OFF (one optimal mult per category)`);
  console.log(`Tolerance bands: +-20% means ratio in [0.80, 1.20]; +-50% means ratio in [0.50, 1.50]`);
  console.log(`Lower median deviation from 1.00 + higher % within band = better.\n`);
  console.log('Category                    |    n  | optMult | medON | medOFF | onPm20 | offPm20 | onPm50 | offPm50');
  console.log('-'.repeat(110));

  let grandTotal = 0;
  let grandOn20 = 0, grandOff20 = 0, grandOn50 = 0, grandOff50 = 0;

  for (const cat of PRIORITY_CATS) {
    const rows = byCat.get(cat);
    if (!rows || rows.length === 0) continue;
    const M = optimalMult.get(cat)!;
    const ratiosOn = rows.map((r) => r.predOn / r.actual);
    const ratiosOff = rows.map((r) => (r.base * M) / r.actual);
    const medOn = median(ratiosOn);
    const medOff = median(ratiosOff);
    const on20 = pctWithin(ratiosOn, 0.8, 1.2);
    const off20 = pctWithin(ratiosOff, 0.8, 1.2);
    const on50 = pctWithin(ratiosOn, 0.5, 1.5);
    const off50 = pctWithin(ratiosOff, 0.5, 1.5);

    grandTotal += rows.length;
    grandOn20 += rows.filter((_r, i) => ratiosOn[i] >= 0.8 && ratiosOn[i] <= 1.2).length;
    grandOff20 += rows.filter((_r, i) => ratiosOff[i] >= 0.8 && ratiosOff[i] <= 1.2).length;
    grandOn50 += rows.filter((_r, i) => ratiosOn[i] >= 0.5 && ratiosOn[i] <= 1.5).length;
    grandOff50 += rows.filter((_r, i) => ratiosOff[i] >= 0.5 && ratiosOff[i] <= 1.5).length;

    console.log(
      `${cat.padEnd(28)}| ${String(rows.length).padStart(4)} | ${M.toFixed(3).padStart(7)} | ${medOn.toFixed(2).padStart(5)} | ${medOff.toFixed(2).padStart(6)} | ${on20.toFixed(1).padStart(5)}% | ${off20.toFixed(1).padStart(6)}% | ${on50.toFixed(1).padStart(5)}% | ${off50.toFixed(1).padStart(6)}%`,
    );
  }

  console.log('-'.repeat(110));
  console.log(
    `${'WEIGHTED OVERALL'.padEnd(28)}| ${String(grandTotal).padStart(4)} | ${'-'.padStart(7)} | ${'-'.padStart(5)} | ${'-'.padStart(6)} | ${(100 * grandOn20 / grandTotal).toFixed(1).padStart(5)}% | ${(100 * grandOff20 / grandTotal).toFixed(1).padStart(6)}% | ${(100 * grandOn50 / grandTotal).toFixed(1).padStart(5)}% | ${(100 * grandOff50 / grandTotal).toFixed(1).padStart(6)}%`,
  );

  // Per-band breakdown for the Big Five only — that's where bands ON earns or
  // loses its keep visibly.
  const BIG_FIVE = [
    'Pet Supplies',
    'Patio, Lawn & Garden',
    'Kitchen & Dining',
    'Industrial & Scientific',
    'Arts, Crafts & Sewing',
  ];
  console.log(`\n\nPER-BAND DETAIL (Big Five r9 categories) — where do bands earn their keep?`);
  for (const cat of BIG_FIVE) {
    const rows = byCat.get(cat);
    if (!rows) continue;
    const M = optimalMult.get(cat)!;
    console.log(`\n=== ${cat} (optimal single mult = ${M.toFixed(3)}) ===`);
    console.log('Band       |   n  | medON | medOFF | onPm20 | offPm20 | onPm50 | offPm50 | winner');
    console.log('-'.repeat(98));
    for (const b of BANDS) {
      const bandRows = rows.filter((r) => r.band === b.label);
      if (bandRows.length === 0) continue;
      const ratiosOn = bandRows.map((r) => r.predOn / r.actual);
      const ratiosOff = bandRows.map((r) => (r.base * M) / r.actual);
      const medOn = median(ratiosOn);
      const medOff = median(ratiosOff);
      const on20 = pctWithin(ratiosOn, 0.8, 1.2);
      const off20 = pctWithin(ratiosOff, 0.8, 1.2);
      const on50 = pctWithin(ratiosOn, 0.5, 1.5);
      const off50 = pctWithin(ratiosOff, 0.5, 1.5);
      const winner = on50 - off50 > 5 ? 'BANDS ON' : off50 - on50 > 5 ? 'BANDS OFF' : 'tie';
      console.log(
        `${b.label.padEnd(10)} | ${String(bandRows.length).padStart(4)} | ${medOn.toFixed(2).padStart(5)} | ${medOff.toFixed(2).padStart(6)} | ${on20.toFixed(1).padStart(5)}% | ${off20.toFixed(1).padStart(6)}% | ${on50.toFixed(1).padStart(5)}% | ${off50.toFixed(1).padStart(6)}% | ${winner}`,
      );
    }
  }
}

main();
