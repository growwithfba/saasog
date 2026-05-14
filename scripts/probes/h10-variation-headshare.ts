/**
 * Variation head-share probe (v2 — properly deduped).
 *
 * Each H10 CSV in the input directory has ONE parent ASIN broken out
 * (its variations listed inline with display orders like "8.1", "8.2", ...).
 * Other parent products on the search page appear as single rows.
 *
 * For each unique broken-out parent, this probe:
 *   - Identifies the parent row (display order without sub-decimal)
 *   - Identifies its child rows (display order WITH sub-decimal sharing prefix)
 *   - Computes head-share: top child's ASIN Sales ÷ sum of all children's ASIN Sales
 *   - Compares against H10's reported Parent Level Sales
 *
 * Aggregates head-share by variation count → empirical table for fixing
 * the equal-split attribution in src/lib/keepa/enrichedRow.ts.
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

type Row = {
  source: string;
  displayOrder: string;
  isChild: boolean;
  parentDisplayPrefix: string;
  asin: string;
  brand: string;
  price: number | null;
  parentSales: number | null;
  asinSales: number | null;
  bsr: number | null;
  category: string;
  reviews: number | null;
};

const inputs: string[] = [];
const args = process.argv.slice(2);
for (const a of args) {
  const stat = fs.statSync(a);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(a)) {
      if (f.endsWith('.csv')) inputs.push(path.join(a, f));
    }
  } else {
    inputs.push(a);
  }
}

// Group: { parentAsin: { source, parentRow, childRows[] } }
type ParentGroup = {
  source: string;
  parentAsin: string;
  parentRow: Row | null;
  childRows: Row[];
};
const parentGroupsBySource = new Map<string, Map<string, ParentGroup>>();

for (const file of inputs) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) continue;
  const hdr = parseCsvLine(lines[0]);
  const idx = {
    displayOrder: hdr.indexOf('Display Order'),
    asin: hdr.indexOf('ASIN'),
    brand: hdr.indexOf('Brand'),
    price: hdr.indexOf('Price  $'),
    parentSales: hdr.indexOf('Parent Level Sales'),
    asinSales: hdr.indexOf('ASIN Sales'),
    bsr: hdr.indexOf('BSR'),
    category: hdr.indexOf('Category'),
    reviews: hdr.indexOf('Review Count'),
  };
  const fileTag = path.basename(file);
  const fileGroups = new Map<string, ParentGroup>();
  parentGroupsBySource.set(fileTag, fileGroups);

  // First pass: collect all rows
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    const displayOrder = (r[idx.displayOrder] ?? '').trim().replace(/\.$/, '');
    if (!displayOrder) continue;
    const isChild = displayOrder.includes('.');
    const parentDisplayPrefix = isChild ? displayOrder.split('.')[0] : displayOrder;
    rows.push({
      source: fileTag,
      displayOrder,
      isChild,
      parentDisplayPrefix,
      asin: (r[idx.asin] ?? '').trim(),
      brand: (r[idx.brand] ?? '').trim(),
      price: num(r[idx.price]),
      parentSales: num(r[idx.parentSales]),
      asinSales: num(r[idx.asinSales]),
      bsr: num(r[idx.bsr]),
      category: (r[idx.category] ?? '').trim(),
      reviews: num(r[idx.reviews]),
    });
  }

  // Second pass: group by parentDisplayPrefix
  const byPrefix = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byPrefix.has(r.parentDisplayPrefix)) byPrefix.set(r.parentDisplayPrefix, []);
    byPrefix.get(r.parentDisplayPrefix)!.push(r);
  }

  // For groups with children, identify parent row + children
  for (const [prefix, members] of byPrefix.entries()) {
    const parentRow = members.find(m => !m.isChild) ?? null;
    const childRows = members.filter(m => m.isChild);
    if (childRows.length === 0) continue;
    const parentAsin = parentRow?.asin ?? `unknown_${prefix}`;
    fileGroups.set(parentAsin, {
      source: fileTag,
      parentAsin,
      parentRow,
      childRows,
    });
  }
}

// Dedupe across files: if two files break out the same parent ASIN,
// keep just one (any will do since they should be identical).
const uniqueParents = new Map<string, ParentGroup>();
for (const fileGroups of parentGroupsBySource.values()) {
  for (const [parentAsin, group] of fileGroups.entries()) {
    if (!uniqueParents.has(parentAsin)) {
      uniqueParents.set(parentAsin, group);
    }
  }
}

console.log(`\nFiles processed: ${inputs.length}`);
console.log(`Unique broken-out parents: ${uniqueParents.size}`);

// =====================================================================
// Per-parent detail
// =====================================================================
console.log(`\n========================================`);
console.log(`PER-PARENT DETAIL`);
console.log(`========================================`);
console.log(`parent_ASIN  brand                      varN  topShare%  parent_level_sales  sum(children)  ratio`);

type Stat = {
  parentAsin: string;
  brand: string;
  category: string;
  varCount: number;  // = childRows.length (NOT including parent row, since H10 lists the parent's own variations as children)
  topShareOfChildren: number;  // = max(child) / sum(children)
  topShareOfParentField: number | null;  // = max(child) / parent_level_sales (alternative view)
  parentSalesField: number | null;
  sumChildSales: number;
  topChildBsr: number | null;
};

const stats: Stat[] = [];
for (const g of uniqueParents.values()) {
  const childSales = g.childRows.map(c => c.asinSales ?? 0);
  const sumChildSales = childSales.reduce((a, b) => a + b, 0);
  if (sumChildSales <= 0) continue;
  const maxChild = Math.max(...childSales);
  const top = g.childRows.find(c => (c.asinSales ?? 0) === maxChild)!;
  const parentSales = g.parentRow?.parentSales ?? g.childRows.find(c => c.parentSales != null)?.parentSales ?? null;
  stats.push({
    parentAsin: g.parentAsin,
    brand: g.parentRow?.brand ?? top.brand,
    category: g.parentRow?.category ?? top.category,
    varCount: g.childRows.length,
    topShareOfChildren: maxChild / sumChildSales,
    topShareOfParentField: parentSales ? maxChild / parentSales : null,
    parentSalesField: parentSales,
    sumChildSales,
    topChildBsr: top.bsr,
  });
}

for (const s of stats.sort((a, b) => b.varCount - a.varCount)) {
  const ratio = s.parentSalesField ? (s.parentSalesField / s.sumChildSales).toFixed(2) : 'n/a';
  const tspf = s.topShareOfParentField != null ? (s.topShareOfParentField * 100).toFixed(1) + '%' : 'n/a';
  console.log(
    `${s.parentAsin.padEnd(12)} ${s.brand.slice(0, 22).padEnd(24)} ${String(s.varCount).padStart(4)}    ${(s.topShareOfChildren * 100).toFixed(1).padStart(5)}%    ${String(s.parentSalesField ?? '?').padStart(12)}      ${String(s.sumChildSales).padStart(8)}    ${ratio}   topvsParent: ${tspf}`
  );
}

// =====================================================================
// Aggregate: head-share by variation count (binned)
// =====================================================================
console.log(`\n========================================`);
console.log(`HEAD-SHARE AGGREGATE (top child sales ÷ sum of all children's sales)`);
console.log(`========================================`);
console.log(`Use this table to replace equal-split in enrichedRow.ts.\n`);
console.log(`varCount  n_groups  median_topShare%  p25-p75      current_eqsplit%  gap`);
const bins: Record<string, Stat[]> = { '2': [], '3': [], '4-5': [], '6-10': [], '11+': [] };
for (const s of stats) {
  const v = s.varCount;
  if (v === 2) bins['2'].push(s);
  else if (v === 3) bins['3'].push(s);
  else if (v <= 5) bins['4-5'].push(s);
  else if (v <= 10) bins['6-10'].push(s);
  else bins['11+'].push(s);
}
for (const [label, gs] of Object.entries(bins)) {
  if (gs.length === 0) continue;
  const shares = gs.map(g => g.topShareOfChildren);
  const m = median(shares);
  const p25 = quantile(shares, 0.25);
  const p75 = quantile(shares, 0.75);
  // representative variation count for equal-split comparison
  const eqRep = label === '2' ? 2 : label === '3' ? 3 : label === '4-5' ? 4 : label === '6-10' ? 7 : 11;
  const eq = 1 / Math.min(eqRep, 5); // current code caps at 5
  console.log(
    `   ${label.padEnd(8)} ${String(gs.length).padStart(5)}     ${(m * 100).toFixed(1).padStart(5)}%       ${(p25 * 100).toFixed(0)}-${(p75 * 100).toFixed(0)}%        ${(eq * 100).toFixed(0)}%             ${((m - eq) * 100).toFixed(0)}pp`
  );
}

// =====================================================================
// Top child vs parent_level_sales ratio (alternative view)
// =====================================================================
console.log(`\n========================================`);
console.log(`TOP CHILD ÷ H10 PARENT_LEVEL_SALES`);
console.log(`========================================`);
console.log(`This is what we'd use if we treat parent_level_sales as ground truth.\n`);
console.log(`varCount  n_groups  median_topShare%  p25-p75`);
const bins2: Record<string, Stat[]> = { '2': [], '3': [], '4-5': [], '6-10': [], '11+': [] };
for (const s of stats) {
  if (s.topShareOfParentField == null) continue;
  const v = s.varCount;
  if (v === 2) bins2['2'].push(s);
  else if (v === 3) bins2['3'].push(s);
  else if (v <= 5) bins2['4-5'].push(s);
  else if (v <= 10) bins2['6-10'].push(s);
  else bins2['11+'].push(s);
}
for (const [label, gs] of Object.entries(bins2)) {
  if (gs.length === 0) continue;
  const shares = gs.map(g => g.topShareOfParentField!);
  const m = median(shares);
  const p25 = quantile(shares, 0.25);
  const p75 = quantile(shares, 0.75);
  console.log(
    `   ${label.padEnd(8)} ${String(gs.length).padStart(5)}     ${(m * 100).toFixed(1).padStart(5)}%       ${(p25 * 100).toFixed(0)}-${(p75 * 100).toFixed(0)}%`
  );
}

// =====================================================================
// H10 parent_level_sales vs sum of children — sanity
// =====================================================================
console.log(`\n========================================`);
console.log(`SANITY: H10 parent_level_sales / sum(children's ASIN Sales)`);
console.log(`========================================`);
const ratios = stats.filter(s => s.parentSalesField).map(s => s.parentSalesField! / s.sumChildSales);
console.log(`n = ${ratios.length}`);
console.log(`median = ${median(ratios).toFixed(2)}  (1.0 would mean H10 parent = sum of children)`);
console.log(`p25-p75 = ${quantile(ratios, 0.25).toFixed(2)} - ${quantile(ratios, 0.75).toFixed(2)}`);
console.log(`Interpretation: > 1 means H10's parent_level_sales aggregates MORE than sum of broken-out children`);
console.log(`(likely because broken-out list misses some variations OR parent uses a different methodology).`);
