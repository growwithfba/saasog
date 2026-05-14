/**
 * Quick overshoot/undershoot analysis: take H10's BSR + Category + Parent Level Sales,
 * run them through our current BSR-curve + category-multiplier math, and compute
 * the ratio per row. Aggregate by category to see where calibration is off.
 *
 * No Keepa fetch — uses H10's snapshot BSR directly. The "real" math uses a
 * 30-day BSR median which can differ, but for big-picture calibration this is
 * a fast first pass.
 *
 * Run: npx tsx scripts/probes/h10-csv-overshoot-by-category.ts <path-to-h10-csv>
 */
import * as fs from 'fs';
import * as path from 'path';

import { bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';
import { resolveCategoryMultiplier } from '../../src/lib/extension/bsrCategoryMultipliers';

type Row = {
  asin: string;
  category: string;
  bsr: number;
  parentSales: number;
  asinSales: number;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/[",]/g, '').trim();
  if (!cleaned || cleaned === 'N/A') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

function loadRows(csvPath: string): Row[] {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const iAsin = idx('ASIN');
  const iCategory = idx('Category');
  const iBsr = idx('BSR');
  const iParentSales = idx('Parent Level Sales');
  const iAsinSales = idx('ASIN Sales');

  if ([iAsin, iCategory, iBsr, iParentSales, iAsinSales].some((i) => i < 0)) {
    throw new Error('Missing expected columns; got: ' + header.join('|'));
  }

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const asin = cols[iAsin]?.trim();
    const category = cols[iCategory]?.trim();
    const bsr = num(cols[iBsr]);
    const parentSales = num(cols[iParentSales]);
    const asinSales = num(cols[iAsinSales]);
    if (!asin || !category || bsr == null || parentSales == null || asinSales == null) continue;
    if (parentSales <= 0) continue; // skip zero-sales rows (mostly stub listings)
    rows.push({ asin, category, bsr, parentSales, asinSales });
  }
  return rows;
}

function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function p(arr: number[], q: number): number {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/probes/h10-csv-overshoot-by-category.ts <h10.csv>');
    process.exit(1);
  }
  const csvPath = path.resolve(arg);
  const rows = loadRows(csvPath);
  console.log(`Loaded ${rows.length} non-zero-sales rows from ${csvPath}\n`);

  const byCat = new Map<string, Array<{ row: Row; ratio: number; band: string | null; predicted: number }>>();
  for (const r of rows) {
    const predicted = bsrToMonthlyUnitsByCategory(r.bsr, [r.category]);
    if (predicted == null || predicted <= 0) continue;
    const ratio = predicted / r.parentSales;
    const { band } = resolveCategoryMultiplier([r.category], r.bsr);
    const arr = byCat.get(r.category) ?? [];
    arr.push({ row: r, ratio, band, predicted });
    byCat.set(r.category, arr);
  }

  console.log('Per-category overshoot (predicted_parent_units / h10_parent_units)');
  console.log('Ratio > 1.0 = we OVER-estimate; ratio < 1.0 = we UNDER-estimate.\n');

  type Summary = { cat: string; n: number; median: number; p25: number; p75: number };
  const summaries: Summary[] = [];
  for (const [cat, arr] of byCat) {
    const ratios = arr.map((x) => x.ratio);
    summaries.push({
      cat,
      n: arr.length,
      median: median(ratios),
      p25: p(ratios, 0.25),
      p75: p(ratios, 0.75),
    });
  }
  summaries.sort((a, b) => b.median - a.median);
  console.log('CATEGORY                       | n  | p25    | MEDIAN  | p75    | suggested mult adjust');
  console.log('-'.repeat(95));
  for (const s of summaries) {
    const adjust = 1 / s.median;
    const adjustStr = adjust < 1 ? `÷ ${(1 / adjust).toFixed(2)}` : `× ${adjust.toFixed(2)}`;
    console.log(
      `${s.cat.padEnd(30)} | ${String(s.n).padStart(2)} | ${s.p25.toFixed(2).padStart(6)} | ${s.median.toFixed(2).padStart(7)} | ${s.p75.toFixed(2).padStart(6)} | ${adjustStr}`,
    );
  }

  console.log('\n--- Per-row detail (top 20 overshoots) ---');
  const all = Array.from(byCat.values()).flat();
  all.sort((a, b) => b.ratio - a.ratio);
  console.log('ASIN        | category               | BSR     | band       | h10_parent | predicted | ratio');
  console.log('-'.repeat(105));
  for (const x of all.slice(0, 20)) {
    console.log(
      `${x.row.asin} | ${x.row.category.padEnd(22)} | ${String(x.row.bsr).padStart(7)} | ${(x.band ?? '-').padEnd(10)} | ${String(x.row.parentSales).padStart(10)} | ${String(x.predicted).padStart(9)} | ${x.ratio.toFixed(2)}x`,
    );
  }

  console.log('\n--- Per-row detail (top 20 undershoots) ---');
  all.sort((a, b) => a.ratio - b.ratio);
  console.log('ASIN        | category               | BSR     | band       | h10_parent | predicted | ratio');
  console.log('-'.repeat(105));
  for (const x of all.slice(0, 20)) {
    console.log(
      `${x.row.asin} | ${x.row.category.padEnd(22)} | ${String(x.row.bsr).padStart(7)} | ${(x.band ?? '-').padEnd(10)} | ${String(x.row.parentSales).padStart(10)} | ${String(x.predicted).padStart(9)} | ${x.ratio.toFixed(2)}x`,
    );
  }
}

main();
