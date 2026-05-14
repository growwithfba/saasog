/**
 * H10 attribution reverse-engineer probe.
 *
 * Input: directory of H10 X-Ray CSVs, each with one parent broken out.
 *
 * Goal: figure out HOW H10 derives the per-child ASIN Sales number, so we
 * can match it ourselves instead of using the broken equal-split.
 *
 * Computes per child:
 *   - H10's reported ASIN Sales (ground truth)
 *   - Our universal-curve estimate at the child's individual BSR
 *   - Our universal × PLG-multiplier estimate
 *   - Equal-split: parent_field / variation_count (current code)
 *   - Head-share top-only: top child gets X% of parent_field
 *
 * Then computes residuals (median |log(predicted/h10)|) for each model.
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

const inputDir = process.argv[2];
const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.csv'));

type ParentGroup = {
  source: string;
  parentAsin: string;
  parentRow: Row | null;
  childRows: Row[];
};

const parentsBySource = new Map<string, Map<string, ParentGroup>>();

for (const file of files) {
  const text = fs.readFileSync(path.join(inputDir, file), 'utf8').replace(/^﻿/, '');
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
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    const displayOrder = (r[idx.displayOrder] ?? '').trim().replace(/\.$/, '');
    if (!displayOrder) continue;
    const isChild = displayOrder.includes('.');
    const parentDisplayPrefix = isChild ? displayOrder.split('.')[0] : displayOrder;
    rows.push({
      source: file,
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
  const byPrefix = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byPrefix.has(r.parentDisplayPrefix)) byPrefix.set(r.parentDisplayPrefix, []);
    byPrefix.get(r.parentDisplayPrefix)!.push(r);
  }
  const fileGroups = new Map<string, ParentGroup>();
  for (const [prefix, members] of byPrefix.entries()) {
    const parentRow = members.find(m => !m.isChild) ?? null;
    const childRows = members.filter(m => m.isChild);
    if (childRows.length === 0) continue;
    const parentAsin = parentRow?.asin ?? `unknown_${prefix}_${file}`;
    fileGroups.set(parentAsin, { source: file, parentAsin, parentRow, childRows });
  }
  parentsBySource.set(file, fileGroups);
}

// Dedupe across files: keep one ParentGroup per parent ASIN
const uniqueParents = new Map<string, ParentGroup>();
for (const fileGroups of parentsBySource.values()) {
  for (const [parentAsin, group] of fileGroups.entries()) {
    if (!uniqueParents.has(parentAsin)) {
      uniqueParents.set(parentAsin, group);
    }
  }
}

console.log(`\n=== INTAKE ===`);
console.log(`Files: ${files.length}`);
console.log(`Unique parent ASINs (with broken-out children): ${uniqueParents.size}`);

// =====================================================================
// SECTION 1 — Per-parent summary
// =====================================================================
type ChildAnalysis = {
  parentAsin: string;
  parentBrand: string;
  parentBsr: number | null;
  parentLevelSales: number | null;
  varCount: number;
  childAsin: string;
  childBsr: number | null;
  childPosition: number; // 1 = highest sales, 2 = 2nd, ...
  h10AsinSales: number;
  curveOnly: number | null;          // bsrToMonthlyUnits(child_bsr)
  curveWithCat: number | null;       // bsrToMonthlyUnitsByCategory(child_bsr, "Patio, Lawn & Garden")
  equalSplit: number | null;          // parent_level_sales / min(varCount, 5)
};

const childAnalyses: ChildAnalysis[] = [];
for (const g of uniqueParents.values()) {
  if (!g.parentRow) continue;
  const parentLevelSales = g.parentRow.parentSales;
  const varCount = g.childRows.length;
  // Sort children by ASIN Sales descending to assign position
  const sortedChildren = [...g.childRows].sort((a, b) => (b.asinSales ?? 0) - (a.asinSales ?? 0));
  for (let pos = 0; pos < sortedChildren.length; pos++) {
    const child = sortedChildren[pos];
    if (child.asinSales == null || child.asinSales === 0) continue;
    childAnalyses.push({
      parentAsin: g.parentAsin,
      parentBrand: g.parentRow.brand,
      parentBsr: g.parentRow.bsr,
      parentLevelSales,
      varCount,
      childAsin: child.asin,
      childBsr: child.bsr,
      childPosition: pos + 1,
      h10AsinSales: child.asinSales,
      curveOnly: child.bsr ? bsrToMonthlyUnits(child.bsr) : null,
      curveWithCat: child.bsr ? bsrToMonthlyUnitsByCategory(child.bsr, 'Patio, Lawn & Garden') : null,
      equalSplit: parentLevelSales != null ? parentLevelSales / Math.min(varCount, 5) : null,
    });
  }
}

console.log(`Total child variations with non-zero H10 ASIN Sales: ${childAnalyses.length}`);

// =====================================================================
// SECTION 2 — Test: does H10 ASIN Sales correlate with each child's BSR?
// =====================================================================
console.log(`\n=== HYPOTHESIS A: H10 uses per-child BSR + universal curve ===`);
const ratios_curveOnly: number[] = [];
const ratios_curveCat: number[] = [];
for (const c of childAnalyses) {
  if (c.curveOnly && c.curveOnly > 0) ratios_curveOnly.push(c.h10AsinSales / c.curveOnly);
  if (c.curveWithCat && c.curveWithCat > 0) ratios_curveCat.push(c.h10AsinSales / c.curveWithCat);
}
console.log(`H10 / universal_curve(child_bsr):       median=${median(ratios_curveOnly).toFixed(2)}× p25-p75=${quantile(ratios_curveOnly, 0.25).toFixed(2)}-${quantile(ratios_curveOnly, 0.75).toFixed(2)}`);
console.log(`H10 / (curve × PLG_band_multiplier):    median=${median(ratios_curveCat).toFixed(2)}× p25-p75=${quantile(ratios_curveCat, 0.25).toFixed(2)}-${quantile(ratios_curveCat, 0.75).toFixed(2)}`);
console.log(`If median ≈ 1.0 and IQR is tight, H10 uses this method.`);

// =====================================================================
// SECTION 3 — Per-position analysis
// =====================================================================
console.log(`\n=== H10 ASIN Sales by position within parent (H10 / parent_level_sales) ===`);
console.log(`If position 1 always ≈ X% of parent, that's the head-share rule.\n`);
console.log(`varCount  pos1%   pos2%   pos3%   pos4%   pos5%   pos6%   pos7%   pos8%   pos9%   pos10%   n`);
const byVarCount = new Map<number, ChildAnalysis[]>();
for (const c of childAnalyses) {
  if (!byVarCount.has(c.varCount)) byVarCount.set(c.varCount, []);
  byVarCount.get(c.varCount)!.push(c);
}
for (const [vc, children] of [...byVarCount.entries()].sort((a, b) => a[0] - b[0])) {
  const parentsCount = new Set(children.map(c => c.parentAsin)).size;
  const positionShares: number[][] = Array.from({ length: 10 }, () => []);
  for (const c of children) {
    if (c.parentLevelSales != null && c.parentLevelSales > 0 && c.childPosition <= 10) {
      positionShares[c.childPosition - 1].push(c.h10AsinSales / c.parentLevelSales);
    }
  }
  const cells = positionShares.map(arr => arr.length > 0 ? `${(median(arr) * 100).toFixed(1)}%`.padStart(6) : '   -  ');
  console.log(`   ${String(vc).padStart(2)}    ${cells.join('  ')}     n=${parentsCount} parents`);
}

// =====================================================================
// SECTION 4 — Sum of broken-out children vs parent_level_sales
// =====================================================================
console.log(`\n=== SUM(children_h10_sales) / parent_level_sales — does broken-out cover the full parent? ===`);
const sumRatios: number[] = [];
const completeness: { varCount: number; ratio: number }[] = [];
for (const g of uniqueParents.values()) {
  const sum = g.childRows.reduce((a, b) => a + (b.asinSales ?? 0), 0);
  const parent = g.parentRow?.parentSales;
  if (parent && parent > 0 && sum > 0) {
    sumRatios.push(sum / parent);
    completeness.push({ varCount: g.childRows.length, ratio: sum / parent });
  }
}
console.log(`median sum/parent = ${median(sumRatios).toFixed(2)} (1.0 = broken-out is complete)`);
console.log(`IQR: ${quantile(sumRatios, 0.25).toFixed(2)} - ${quantile(sumRatios, 0.75).toFixed(2)}`);

console.log(`\n=== Completeness by varCount ===`);
console.log(`varCount  n_parents  median_completeness`);
const byVcCompl = new Map<number, number[]>();
for (const c of completeness) {
  if (!byVcCompl.has(c.varCount)) byVcCompl.set(c.varCount, []);
  byVcCompl.get(c.varCount)!.push(c.ratio);
}
for (const [vc, rs] of [...byVcCompl.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`   ${String(vc).padStart(2)}        ${String(rs.length).padStart(3)}        ${(median(rs) * 100).toFixed(1)}%`);
}

// =====================================================================
// SECTION 5 — Model comparison: residuals on each child
// =====================================================================
console.log(`\n=== MODEL RESIDUALS (median |log(predicted/h10_actual)|, lower = better) ===`);
const residuals = {
  curveOnly: [] as number[],
  curveCat: [] as number[],
  equalSplit: [] as number[],
  topGetsParent: [] as number[],   // assume top child = full parent_level_sales (extreme upper bound)
};
for (const c of childAnalyses) {
  if (c.curveOnly && c.curveOnly > 0) {
    residuals.curveOnly.push(Math.abs(Math.log(c.curveOnly / c.h10AsinSales)));
  }
  if (c.curveWithCat && c.curveWithCat > 0) {
    residuals.curveCat.push(Math.abs(Math.log(c.curveWithCat / c.h10AsinSales)));
  }
  if (c.equalSplit && c.equalSplit > 0) {
    residuals.equalSplit.push(Math.abs(Math.log(c.equalSplit / c.h10AsinSales)));
  }
  if (c.parentLevelSales && c.parentLevelSales > 0 && c.childPosition === 1) {
    residuals.topGetsParent.push(Math.abs(Math.log(c.parentLevelSales / c.h10AsinSales)));
  }
}
const fmt = (xs: number[]) => `med=${median(xs).toFixed(3)}  IQR=${quantile(xs, 0.25).toFixed(2)}-${quantile(xs, 0.75).toFixed(2)}`;
console.log(`  Model A (universal curve only — per child BSR):       ${fmt(residuals.curveOnly)}   n=${residuals.curveOnly.length}`);
console.log(`  Model B (universal curve × PLG band multiplier):       ${fmt(residuals.curveCat)}   n=${residuals.curveCat.length}`);
console.log(`  Model C (equal split parent / min(N, 5)):              ${fmt(residuals.equalSplit)}   n=${residuals.equalSplit.length}`);
console.log(`  Model D (top child = full parent_level_sales):          ${fmt(residuals.topGetsParent)}   n=${residuals.topGetsParent.length} (top-1 only)`);

// =====================================================================
// SECTION 6 — Per-parent walkthrough (top 5 by varCount)
// =====================================================================
console.log(`\n=== PER-PARENT WALKTHROUGH (top 12 by total parent sales) ===`);
const parentList = [...uniqueParents.values()]
  .filter(g => g.parentRow?.parentSales)
  .sort((a, b) => (b.parentRow!.parentSales ?? 0) - (a.parentRow!.parentSales ?? 0))
  .slice(0, 12);
for (const g of parentList) {
  const sortedChildren = [...g.childRows].sort((a, b) => (b.asinSales ?? 0) - (a.asinSales ?? 0));
  const sumChildren = sortedChildren.reduce((a, c) => a + (c.asinSales ?? 0), 0);
  console.log(`\n${g.parentAsin}  ${g.parentRow?.brand}  varN=${g.childRows.length}  parent_level_sales=${g.parentRow?.parentSales}  sum_children=${sumChildren}  parent_BSR=${g.parentRow?.bsr}`);
  console.log(`  pos  child_ASIN     child_BSR  H10_sales  curve_only  curve×plg  ratio_h10/curve`);
  for (let i = 0; i < Math.min(sortedChildren.length, 8); i++) {
    const c = sortedChildren[i];
    const curveOnly = c.bsr ? bsrToMonthlyUnits(c.bsr) : null;
    const curveCat = c.bsr ? bsrToMonthlyUnitsByCategory(c.bsr, 'Patio, Lawn & Garden') : null;
    const ratio = curveOnly && c.asinSales ? (c.asinSales / curveOnly).toFixed(2) : '?';
    console.log(`  ${String(i + 1).padStart(2)}   ${c.asin.padEnd(12)}  ${String(c.bsr ?? '?').padStart(8)}  ${String(c.asinSales ?? '?').padStart(8)}  ${String(curveOnly ?? '?').padStart(8)}  ${String(curveCat ?? '?').padStart(8)}    ${ratio}×`);
  }
}
