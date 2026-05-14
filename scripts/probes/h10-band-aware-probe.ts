/**
 * Band-aware calibration probe.
 * For each priority category, computes the observed median ratio (predicted/actual)
 * per BSR band, and prints the suggested band multiplier adjustment.
 *
 * Run: npx tsx scripts/probes/h10-band-aware-probe.ts <h10.csv>
 */
import * as fs from 'fs';
import * as path from 'path';
import { bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';
import { CATEGORY_MULTIPLIERS } from '../../src/lib/extension/bsrCategoryMultipliers';

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
  'Musical Instruments',
  'Automotive',
  'Baby',
  'Electronics',
  'Home & Kitchen',
  'Health & Household',
];

function main() {
  const csvPath = path.resolve(process.argv[2] ?? '/tmp/combined-h10-full.csv');
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0].replace(/^﻿/, ''));
  const iAsin = header.indexOf('ASIN');
  const iCat = header.indexOf('Category');
  const iBsr = header.indexOf('BSR');
  const iSales = header.indexOf('Parent Level Sales');

  // (category, band) -> ratios[]
  const byCatBand = new Map<string, Map<string, number[]>>();
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const cat = cols[iCat]?.trim();
    const bsr = num(cols[iBsr]);
    const sales = num(cols[iSales]);
    if (!cat || bsr == null || sales == null || sales <= 0 || !PRIORITY_CATS.includes(cat)) continue;
    const pred = bsrToMonthlyUnitsByCategory(bsr, [cat]);
    if (pred == null || pred <= 0) continue;
    const band = bandLabelFor(bsr);
    if (!byCatBand.has(cat)) byCatBand.set(cat, new Map());
    const bandMap = byCatBand.get(cat)!;
    if (!bandMap.has(band)) bandMap.set(band, []);
    bandMap.get(band)!.push(pred / sales);
    total++;
  }
  console.log(`Loaded ${total} priority-category rows from ${csvPath}\n`);

  // Print per-category band table
  for (const cat of PRIORITY_CATS) {
    const bandMap = byCatBand.get(cat);
    if (!bandMap) continue;
    const cal = (CATEGORY_MULTIPLIERS as any)[cat];
    const currentBands: any[] = cal?.bands ?? [];
    const currentDefault = cal?.default;
    console.log(`\n=== ${cat} (current default mult: ${currentDefault?.toFixed(3) ?? '—'}, total fit n: ${cal?.n ?? '—'}) ===`);
    console.log('BAND       | corpus n | obs median | current mult | suggested new mult | change');
    console.log('-'.repeat(95));
    for (const b of BANDS) {
      const ratios = bandMap.get(b.label) ?? [];
      if (ratios.length === 0) continue;
      const med = median(ratios);
      const currentBand = currentBands.find((cb) => cb.bsrMin === b.min && cb.bsrMax === b.max);
      const currentMult = currentBand?.mult ?? currentDefault;
      const suggested = currentMult / med;
      const change = suggested / currentMult;
      const changeStr = change >= 1 ? `× ${change.toFixed(2)}` : `÷ ${(1 / change).toFixed(2)}`;
      const nStr = currentBand ? `${ratios.length} (fit n=${currentBand.n})` : `${ratios.length} (fit n=default)`;
      console.log(
        `${b.label.padEnd(10)} | ${nStr.padEnd(15)} | ${med.toFixed(2).padStart(10)} | ${currentMult?.toFixed(3).padStart(12) ?? '—'.padStart(12)} | ${suggested.toFixed(3).padStart(18)} | ${changeStr.padStart(6)}`,
      );
    }
  }
}

main();
