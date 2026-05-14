/**
 * Validates Dave's hypothesis: H10's per-child ASIN Sales is driven by
 * the "Recent Purchases" column (Amazon's "X+ bought in past month"
 * bucket), which is also available via Keepa's monthlySold field.
 *
 * If true, we can stop estimating child-level sales from BSR curves and
 * just use the Amazon bucket directly.
 */
import * as fs from 'fs';
import * as path from 'path';

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

// Parse "Recent Purchases" — values like "200+", "100+", "50+", "1K+", "N/A"
function parseRecentPurchases(s: any): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[",]/g, '').trim();
  if (!cleaned || cleaned === 'N/A') return null;
  // Handle K suffix (e.g., "1K+", "2K+")
  const km = cleaned.match(/^(\d+(?:\.\d+)?)K\+?$/i);
  if (km) return Math.round(parseFloat(km[1]) * 1000);
  // Handle plain numbers (e.g., "200+", "100+")
  const m = cleaned.match(/^(\d+)\+?$/);
  if (m) return parseInt(m[1], 10);
  return null;
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

const inputDir = process.argv[2];
const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.csv'));

type Row = {
  source: string;
  displayOrder: string;
  isChild: boolean;
  parentDisplayPrefix: string;
  asin: string;
  recentPurchases: number | null;  // bucket value (e.g. 200, 100, 50)
  asinSales: number | null;        // H10's per-child estimate
  parentSales: number | null;
  bsr: number | null;
};

const allRows: Row[] = [];
const seenParents = new Set<string>();

for (const file of files) {
  const text = fs.readFileSync(path.join(inputDir, file), 'utf8').replace(/^﻿/, '');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) continue;
  const hdr = parseCsvLine(lines[0]);
  const idx = {
    displayOrder: hdr.indexOf('Display Order'),
    asin: hdr.indexOf('ASIN'),
    recentPurchases: hdr.indexOf('Recent Purchases'),
    asinSales: hdr.indexOf('ASIN Sales'),
    parentSales: hdr.indexOf('Parent Level Sales'),
    bsr: hdr.indexOf('BSR'),
  };
  if (idx.recentPurchases < 0) {
    console.log(`WARN: ${file} has no Recent Purchases column`);
    continue;
  }
  // Group rows in this file
  const fileRows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    const displayOrder = (r[idx.displayOrder] ?? '').trim().replace(/\.$/, '');
    if (!displayOrder) continue;
    const isChild = displayOrder.includes('.');
    const parentDisplayPrefix = isChild ? displayOrder.split('.')[0] : displayOrder;
    fileRows.push({
      source: file,
      displayOrder,
      isChild,
      parentDisplayPrefix,
      asin: (r[idx.asin] ?? '').trim(),
      recentPurchases: parseRecentPurchases(r[idx.recentPurchases]),
      asinSales: num(r[idx.asinSales]),
      parentSales: num(r[idx.parentSales]),
      bsr: num(r[idx.bsr]),
    });
  }
  // For broken-out parents in this file, dedupe across files
  const byPrefix = new Map<string, Row[]>();
  for (const r of fileRows) {
    if (!byPrefix.has(r.parentDisplayPrefix)) byPrefix.set(r.parentDisplayPrefix, []);
    byPrefix.get(r.parentDisplayPrefix)!.push(r);
  }
  for (const [, members] of byPrefix.entries()) {
    const parentRow = members.find(m => !m.isChild);
    const childRows = members.filter(m => m.isChild);
    if (childRows.length === 0) continue;
    const parentAsin = parentRow?.asin ?? `unknown_${members[0].source}`;
    if (seenParents.has(parentAsin)) continue;
    seenParents.add(parentAsin);
    // Add ALL members (parent + children)
    for (const m of members) allRows.push(m);
  }
}

console.log(`\nUnique parent groups: ${seenParents.size}`);
console.log(`Total rows (parents + children): ${allRows.length}`);

// =====================================================================
// 1. CORRELATION: Recent Purchases vs ASIN Sales
// =====================================================================
console.log(`\n=== HYPOTHESIS: H10 ASIN Sales correlates with Recent Purchases (Amazon bucket) ===`);
const childWithBoth = allRows.filter(r => r.isChild && r.recentPurchases != null && r.asinSales != null && r.asinSales > 0);
console.log(`Children with both fields: ${childWithBoth.length} of ${allRows.filter(r => r.isChild).length} child rows`);

// Group by recent purchases bucket
const byBucket = new Map<number, number[]>();
for (const r of childWithBoth) {
  if (!byBucket.has(r.recentPurchases!)) byBucket.set(r.recentPurchases!, []);
  byBucket.get(r.recentPurchases!)!.push(r.asinSales!);
}

console.log(`\nbucket  n_children  median_h10_sales  p25-p75              ratio (H10/bucket)`);
for (const [b, sales] of [...byBucket.entries()].sort((a, b) => a[0] - b[0])) {
  const m = median(sales);
  const p25 = quantile(sales, 0.25);
  const p75 = quantile(sales, 0.75);
  console.log(`${String(b).padStart(5)}+   ${String(sales.length).padStart(4)}      ${m.toFixed(0).padStart(6)}            ${p25.toFixed(0)}-${p75.toFixed(0).padEnd(8)}        ${(m / b).toFixed(2)}×`);
}

// =====================================================================
// 2. CORRELATION CHECK: Does H10 sales fall in the "bucket range"?
// Bucket "100+" means Amazon's data is 100-199. H10 estimate should be in that range.
// =====================================================================
console.log(`\n=== Does H10 ASIN Sales fall WITHIN the bucket range it implies? ===`);
console.log(`Bucket "100+" → expected range 100-199. If H10 lands in range, it's using the bucket.\n`);
const bucketEdges = [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000];
let inBucket = 0;
let aboveBucket = 0;
let belowBucket = 0;
for (const r of childWithBoth) {
  const b = r.recentPurchases!;
  // Find next bucket edge
  const nextEdgeIdx = bucketEdges.findIndex(e => e > b);
  const nextEdge = nextEdgeIdx >= 0 ? bucketEdges[nextEdgeIdx] : b * 2;
  if (r.asinSales! >= b && r.asinSales! < nextEdge) inBucket++;
  else if (r.asinSales! >= nextEdge) aboveBucket++;
  else belowBucket++;
}
console.log(`In bucket range:    ${inBucket} / ${childWithBoth.length}  (${(inBucket / childWithBoth.length * 100).toFixed(1)}%)`);
console.log(`Above bucket range: ${aboveBucket} / ${childWithBoth.length}  (${(aboveBucket / childWithBoth.length * 100).toFixed(1)}%)`);
console.log(`Below bucket range: ${belowBucket} / ${childWithBoth.length}  (${(belowBucket / childWithBoth.length * 100).toFixed(1)}%)`);

// =====================================================================
// 3. SAMPLE: Show 30 random rows so we can eyeball the relationship
// =====================================================================
console.log(`\n=== SAMPLE: child ASIN | recent_purchases | h10_sales | ratio ===`);
const sample = [...childWithBoth].sort(() => Math.random() - 0.5).slice(0, 30);
for (const r of sample) {
  const ratio = (r.asinSales! / r.recentPurchases!).toFixed(2);
  console.log(`  ${r.asin.padEnd(12)}  ${String(r.recentPurchases).padStart(5)}+   ${String(r.asinSales).padStart(6)}      ${ratio}×`);
}

// =====================================================================
// 4. AGGREGATE: If we use bucket directly as Monthly Sales, how close to H10?
// =====================================================================
console.log(`\n=== MODEL: Use Recent Purchases (bucket) directly as monthly sales ===`);
console.log(`Compare residuals: (predicted = bucket value) vs H10's ASIN Sales\n`);
const residuals = childWithBoth.map(r => Math.abs(Math.log(r.recentPurchases! / r.asinSales!)));
console.log(`n = ${residuals.length}`);
console.log(`median residual = ${median(residuals).toFixed(3)}`);
console.log(`IQR = ${quantile(residuals, 0.25).toFixed(2)} - ${quantile(residuals, 0.75).toFixed(2)}`);

// Compare to using midpoint of bucket
console.log(`\n=== MODEL: Use bucket MIDPOINT (e.g. 100+ → 150) ===`);
const residualsMid = childWithBoth.map(r => {
  const b = r.recentPurchases!;
  const nextEdgeIdx = bucketEdges.findIndex(e => e > b);
  const nextEdge = nextEdgeIdx >= 0 ? bucketEdges[nextEdgeIdx] : b * 1.5;
  const mid = (b + nextEdge) / 2;
  return Math.abs(Math.log(mid / r.asinSales!));
});
console.log(`median residual = ${median(residualsMid).toFixed(3)}  IQR = ${quantile(residualsMid, 0.25).toFixed(2)} - ${quantile(residualsMid, 0.75).toFixed(2)}`);

// =====================================================================
// 5. Sum of Recent Purchases across siblings vs parent_level_sales
// =====================================================================
console.log(`\n=== SUM(children's Recent Purchases) / parent_level_sales ===`);
const parentTotals: { sum: number; parent: number }[] = [];
const parentGroups = new Map<string, Row[]>();
for (const r of allRows) {
  if (!r.isChild) continue;
  const key = `${r.source}::${r.parentDisplayPrefix}`;
  if (!parentGroups.has(key)) parentGroups.set(key, []);
  parentGroups.get(key)!.push(r);
}
for (const [key, children] of parentGroups.entries()) {
  const parent = allRows.find(r => !r.isChild && r.source === key.split('::')[0] && r.parentDisplayPrefix === key.split('::')[1]);
  if (!parent || !parent.parentSales) continue;
  const sumBuckets = children.reduce((a, c) => a + (c.recentPurchases ?? 0), 0);
  if (sumBuckets === 0) continue;
  parentTotals.push({ sum: sumBuckets, parent: parent.parentSales });
}
const ratiosSP = parentTotals.map(p => p.sum / p.parent);
console.log(`n parents = ${ratiosSP.length}`);
console.log(`median sum_buckets / parent_level_sales = ${median(ratiosSP).toFixed(3)}`);
console.log(`IQR = ${quantile(ratiosSP, 0.25).toFixed(2)} - ${quantile(ratiosSP, 0.75).toFixed(2)}`);
