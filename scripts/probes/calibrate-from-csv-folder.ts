/**
 * Phase 5.4-I band-aware calibration harness.
 *
 * Reads every Helium 10 Xray CSV in a folder, fits per-category
 * band-aware multipliers against the v1.2.0 base BSR curve, and prints a
 * TypeScript snippet ready to paste into bsrCategoryMultipliers.ts.
 *
 * Usage:
 *   npx tsx scripts/probes/calibrate-from-csv-folder.ts <folder>
 *
 * Example:
 *   npx tsx scripts/probes/calibrate-from-csv-folder.ts \
 *     "/Users/davekeefe/Downloads/electronics 2"
 *
 * Bands (locked 2026-05-06, see project_calibration_vision.md):
 *   - 0-4k          (top movers + still high)
 *   - 4k-15k        (HUNT-low — primary student focus zone)
 *   - 15k-60k       (HUNT-mid — primary student focus zone)
 *   - 60k-200k      (long tail — Dave: "100k BSR is not insanely high")
 *   - 200k+         (deep tail — usually sparse)
 *
 * Bands with n < MIN_SAMPLES_PER_BAND are dropped (the lookup falls back
 * to the category default rather than fitting noise).
 */
import * as fs from 'fs';
import * as path from 'path';
import { bsrToMonthlyUnits } from '../../src/lib/extension/bsrSalesCurve';

const MIN_SAMPLES_PER_BAND = 30;
const MIN_SAMPLES_FOR_CATEGORY = 50;

const BANDS: Array<[number, number, string]> = [
  [0,         4_000,    '0-4k'],
  [4_000,    15_000,    '4k-15k'],
  [15_000,   60_000,    '15k-60k'],
  [60_000,  200_000,    '60k-200k'],
  [200_000, Infinity,   '200k+'],
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, field = '', row: string[] = [], inQuotes = false;
  text = text.replace(/^﻿/, '');
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (field || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const cleaned = s.replace(/[$,]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

type Sample = { asin: string; bsr: number; parentSales: number; ratio: number };

function loadFolder(dir: string): Map<string, Sample[]> {
  const byCat = new Map<string, Sample[]>();
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const rows = parseCSV(text);
    if (rows.length < 2) continue;
    const header = rows[0];
    const idx = (n: string) => header.findIndex(h => h.trim() === n);
    const iAsin = idx('ASIN');
    const iBsr = idx('BSR');
    const iParent = idx('Parent Level Sales');
    const iCat = idx('Category');
    if (iAsin < 0 || iBsr < 0 || iParent < 0 || iCat < 0) {
      console.warn(`SKIP ${f}: missing required columns (got ${header.length})`);
      continue;
    }
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[iAsin]) continue;
      const bsr = num(row[iBsr]);
      const parentSales = num(row[iParent]);
      const cat = row[iCat]?.trim() || '';
      if (!bsr || !parentSales || !cat || cat === 'Our Brands') continue;
      const expected = bsrToMonthlyUnits(bsr);
      if (expected == null || expected <= 0) continue;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push({ asin: row[iAsin], bsr, parentSales, ratio: parentSales / expected });
    }
  }
  // Dedupe by ASIN within each category, keep first
  for (const [cat, list] of byCat) {
    const seen = new Set<string>();
    byCat.set(cat, list.filter(s => seen.has(s.asin) ? false : (seen.add(s.asin), true)));
  }
  return byCat;
}

function fitCategory(cat: string, samples: Sample[]): string {
  const ratios = samples.map(s => s.ratio);
  const def = median(ratios);
  const lines: string[] = [];
  lines.push(`  // ${cat}`);
  lines.push(`  //   n=${samples.length}  default(median)=${def.toFixed(3)}x  IQR=[${pct(ratios, 0.25).toFixed(2)}, ${pct(ratios, 0.75).toFixed(2)}]  P10-P90=[${pct(ratios, 0.10).toFixed(2)}, ${pct(ratios, 0.90).toFixed(2)}]`);

  const bandLines: string[] = [];
  for (const [lo, hi, label] of BANDS) {
    const inBand = samples.filter(s => s.bsr >= lo && s.bsr < hi);
    if (inBand.length < MIN_SAMPLES_PER_BAND) {
      lines.push(`  //   band ${label.padEnd(9)} n=${String(inBand.length).padStart(3)}  -> dropped (n<${MIN_SAMPLES_PER_BAND}, falls back to default)`);
      continue;
    }
    const r = inBand.map(s => s.ratio);
    const m = median(r);
    lines.push(`  //   band ${label.padEnd(9)} n=${String(inBand.length).padStart(3)}  median=${m.toFixed(3)}x  IQR=[${pct(r, 0.25).toFixed(2)}, ${pct(r, 0.75).toFixed(2)}]`);
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

function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('usage: npx tsx scripts/probes/calibrate-from-csv-folder.ts <folder>');
    process.exit(1);
  }
  const byCat = loadFolder(folder);
  if (!byCat.size) {
    console.error('no usable rows found');
    process.exit(1);
  }

  console.log(`\n=== Calibration from ${folder} ===\n`);
  console.log(`Bands: ${BANDS.map(b => b[2]).join('  /  ')}`);
  console.log(`Min samples per band: ${MIN_SAMPLES_PER_BAND}    Min samples per category: ${MIN_SAMPLES_FOR_CATEGORY}\n`);

  // Stats summary
  const cats = Array.from(byCat.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [cat, list] of cats) {
    if (list.length < MIN_SAMPLES_FOR_CATEGORY) {
      console.log(`SKIP "${cat}" — n=${list.length} below threshold ${MIN_SAMPLES_FOR_CATEGORY}\n`);
      continue;
    }
    console.log(fitCategory(cat, list));
    console.log();
  }
}

main();
