/**
 * One-off: compare BloomLens CSV vs H10 X-Ray CSV by ASIN.
 * Reports per-ASIN ratio + per-category median + flags outliers.
 */
import * as fs from 'fs';

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

const blPath = process.argv[2];
const h10Path = process.argv[3];

const blText = fs.readFileSync(blPath, 'utf8').replace(/^﻿/, '');
const h10Text = fs.readFileSync(h10Path, 'utf8').replace(/^﻿/, '');

const blLines = blText.split('\n').filter(Boolean);
const blHdr = parseCsvLine(blLines[0]);
const blIdx = {
  asin: blHdr.indexOf('ASIN'), // first ASIN col
  monthlyRev: blHdr.indexOf('Monthly Revenue'),
  monthlySales: blHdr.indexOf('Monthly Sales'),
  parentRev: blHdr.indexOf('Parent Revenue'),
  parentSales: blHdr.indexOf('Parent Sales'),
  category: blHdr.indexOf('Category'),
  bsr: blHdr.indexOf('BSR'),
  price: blHdr.indexOf('Price'),
  title: blHdr.indexOf('Product Title'),
};

const h10Lines = h10Text.split('\n').filter(Boolean);
const h10Hdr = parseCsvLine(h10Lines[0]);
const h10Idx = {
  asin: h10Hdr.indexOf('ASIN'),
  parentSales: h10Hdr.indexOf('Parent Level Sales'),
  asinSales: h10Hdr.indexOf('ASIN Sales'),
  parentRev: h10Hdr.indexOf('Parent Level Revenue'),
  asinRev: h10Hdr.indexOf('ASIN Revenue'),
  category: h10Hdr.indexOf('Category'),
  bsr: h10Hdr.indexOf('BSR'),
  price: h10Hdr.indexOf('Price  $'),
};

type Row = {
  asin: string;
  blSales: number | null;
  blRev: number | null;
  blParentSales: number | null;
  blParentRev: number | null;
  h10Sales: number | null;
  h10Rev: number | null;
  h10ParentSales: number | null;
  h10ParentRev: number | null;
  h10Category: string;
  blCategory: string;
  bsr: number | null;
  title: string;
};

const blByAsin = new Map<string, any>();
for (let i = 1; i < blLines.length; i++) {
  const r = parseCsvLine(blLines[i]);
  const a = r[blIdx.asin]?.trim().toUpperCase();
  if (!a) continue;
  blByAsin.set(a, r);
}

const rows: Row[] = [];
for (let i = 1; i < h10Lines.length; i++) {
  const h = parseCsvLine(h10Lines[i]);
  const a = h[h10Idx.asin]?.trim().toUpperCase();
  if (!a) continue;
  const b = blByAsin.get(a);
  if (!b) continue;
  rows.push({
    asin: a,
    blSales: num(b[blIdx.monthlySales]),
    blRev: num(b[blIdx.monthlyRev]),
    blParentSales: num(b[blIdx.parentSales]),
    blParentRev: num(b[blIdx.parentRev]),
    h10Sales: num(h[h10Idx.asinSales]),
    h10Rev: num(h[h10Idx.asinRev]),
    h10ParentSales: num(h[h10Idx.parentSales]),
    h10ParentRev: num(h[h10Idx.parentRev]),
    h10Category: h[h10Idx.category]?.trim() || '?',
    blCategory: b[blIdx.category]?.trim() || '?',
    bsr: num(h[h10Idx.bsr]) ?? num(b[blIdx.bsr]),
    title: (b[blIdx.title] ?? '').slice(0, 50),
  });
}

console.log(`\n=== Overlap ===`);
console.log(`BloomLens rows: ${blByAsin.size}`);
console.log(`H10 rows: ${h10Lines.length - 1}`);
console.log(`Joined ASINs: ${rows.length}\n`);

const h10CatCounts = new Map<string, number>();
const blCatCounts = new Map<string, number>();
for (const r of rows) {
  h10CatCounts.set(r.h10Category, (h10CatCounts.get(r.h10Category) ?? 0) + 1);
  blCatCounts.set(r.blCategory, (blCatCounts.get(r.blCategory) ?? 0) + 1);
}
console.log(`=== H10 categories in joined set ===`);
for (const [c, n] of [...h10CatCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(35)} ${n}`);
}
console.log(`\n=== BloomLens categories in joined set ===`);
for (const [c, n] of [...blCatCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(35)} ${n}`);
}

// Per-ASIN comparison: BloomLens / H10 ratio for ASIN-level monthly sales
console.log(`\n=== Per-ASIN: ASIN-level Monthly Sales (BL / H10 ratio) ===`);
console.log(`ASIN        BL_sales  H10_sales  ratio    BSR      H10_cat                Title`);
const sorted = [...rows].sort((a, b) => (b.h10Sales ?? 0) - (a.h10Sales ?? 0));
const asinRatios: number[] = [];
for (const r of sorted) {
  if (r.h10Sales == null || r.blSales == null || r.h10Sales === 0) continue;
  const ratio = r.blSales / r.h10Sales;
  asinRatios.push(ratio);
  console.log(
    `${r.asin.padEnd(11)} ${String(r.blSales).padStart(8)} ${String(r.h10Sales).padStart(10)} ${ratio.toFixed(2).padStart(7)}× ${String(r.bsr ?? '?').padStart(8)} ${r.h10Category.padEnd(22)} ${r.title}`
  );
}

// Per-ASIN parent-level
console.log(`\n=== Per-ASIN: PARENT Monthly Sales (BL / H10 ratio) ===`);
console.log(`ASIN        BL_par   H10_par    ratio    BSR      H10_cat                Title`);
const parentRatios: number[] = [];
for (const r of sorted) {
  if (r.h10ParentSales == null || r.blParentSales == null || r.h10ParentSales === 0) continue;
  const ratio = r.blParentSales / r.h10ParentSales;
  parentRatios.push(ratio);
  console.log(
    `${r.asin.padEnd(11)} ${String(r.blParentSales).padStart(8)} ${String(r.h10ParentSales).padStart(10)} ${ratio.toFixed(2).padStart(7)}× ${String(r.bsr ?? '?').padStart(8)} ${r.h10Category.padEnd(22)} ${r.title}`
  );
}

console.log(`\n=== Summary ===`);
console.log(`ASIN-level monthly sales:`);
console.log(`  n = ${asinRatios.length}`);
console.log(`  median ratio = ${median(asinRatios).toFixed(3)}× (1.00 = perfect, >1 = BloomLens over-predicts)`);
console.log(`  within ±20%: ${asinRatios.filter(r => r >= 0.8 && r <= 1.2).length} / ${asinRatios.length}`);
console.log(`  within ±50%: ${asinRatios.filter(r => r >= 0.5 && r <= 1.5).length} / ${asinRatios.length}`);
console.log(`  >2x off:     ${asinRatios.filter(r => r > 2 || r < 0.5).length} / ${asinRatios.length}`);

console.log(`\nPARENT monthly sales:`);
console.log(`  n = ${parentRatios.length}`);
console.log(`  median ratio = ${median(parentRatios).toFixed(3)}×`);
console.log(`  within ±20%: ${parentRatios.filter(r => r >= 0.8 && r <= 1.2).length} / ${parentRatios.length}`);
console.log(`  within ±50%: ${parentRatios.filter(r => r >= 0.5 && r <= 1.5).length} / ${parentRatios.length}`);
console.log(`  >2x off:     ${parentRatios.filter(r => r > 2 || r < 0.5).length} / ${parentRatios.length}`);

// Per-category median (using H10 category — per memory rule)
console.log(`\n=== Per H10-category median ratio (ASIN-level monthly sales) ===`);
const byCat = new Map<string, number[]>();
for (const r of rows) {
  if (r.h10Sales == null || r.blSales == null || r.h10Sales === 0) continue;
  const cat = r.h10Category;
  if (!byCat.has(cat)) byCat.set(cat, []);
  byCat.get(cat)!.push(r.blSales / r.h10Sales);
}
for (const [c, ratios] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${c.padEnd(30)} n=${String(ratios.length).padStart(3)}  median=${median(ratios).toFixed(3)}×`);
}
