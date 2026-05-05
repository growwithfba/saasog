/**
 * Phase 5.4-H2: Helium 10 Xray CSV importer.
 *
 * Parses raw H10 Xray CSV exports into a normalized JSONL corpus we
 * can merge with the in-Supabase submissions corpus for base-curve
 * recalibration. The H10 export distinguishes per-child sales
 * ("ASIN Sales") from parent-level totals ("Parent Level Sales") —
 * we keep both because they calibrate different things:
 *   - Parent Level Sales feeds the BSR → parent-units curve
 *     (BSR is parent-level on Amazon)
 *   - ASIN Sales feeds the per-child Tier-1 / Tier-2 attribution
 *
 * Run:
 *   npx tsx scripts/probes/import-h10-csv.ts \
 *     "/path/to/file1.csv" "/path/to/file2.csv" ...
 *
 * Output: scripts/probes/data/h10-extra-corpus.jsonl  (appends)
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT_CATEGORIES = new Set([
  'Arts, Crafts & Sewing','Automotive','Baby','Beauty & Personal Care','Books',
  'Clothing, Shoes & Jewelry','Computers & Accessories','Electronics',
  'Grocery & Gourmet Food','Health & Household','Home & Kitchen',
  'Industrial & Scientific','Kitchen & Dining','Musical Instruments',
  'Office Products','Patio, Lawn & Garden','Pet Supplies','Sports & Outdoors',
  'Tools & Home Improvement','Toys & Games','Video Games',
]);

type Row = {
  asin: string;
  bsr: number;
  parentSales: number | null;  // "Parent Level Sales"
  asinSales: number | null;    // "ASIN Sales"
  category: string;
  source: string;              // CSV filename
};

// Minimal CSV parser that handles quoted fields with commas inside.
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQ = false; }
      } else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (cell.length > 0 || row.length > 0) {
          row.push(cell); out.push(row); row = []; cell = '';
        }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); out.push(row); }
  return out;
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[",$]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'n/a') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ingestFile(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iAsin = idx('ASIN');
  const iBsr = idx('BSR');
  const iParent = idx('Parent Level Sales');
  const iChild = idx('ASIN Sales');
  const iCat = idx('Category');
  const out: Row[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length < 5) continue;
    const asin = (cols[iAsin] ?? '').trim();
    const bsr = parseNum(cols[iBsr]);
    const parentSales = parseNum(cols[iParent]);
    const asinSales = parseNum(cols[iChild]);
    const category = (cols[iCat] ?? '').trim();
    if (!asin || !bsr || !category) continue;
    if (!parentSales && !asinSales) continue;  // need at least one signal
    out.push({
      asin, bsr, parentSales, asinSales, category,
      source: path.basename(filePath),
    });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/probes/import-h10-csv.ts <file.csv> [<file.csv>...]');
    process.exit(1);
  }

  const allRows: Row[] = [];
  for (const f of args) {
    const rows = ingestFile(f);
    console.log(`  ${path.basename(f).padEnd(50)}  ${rows.length} rows`);
    allRows.push(...rows);
  }

  console.log(`\n=== Ingested ${allRows.length} rows from ${args.length} files ===\n`);

  // Filter to known root categories
  const rooted = allRows.filter((r) => ROOT_CATEGORIES.has(r.category));
  const dropped = allRows.length - rooted.length;
  console.log(`Root-category filter: kept ${rooted.length}, dropped ${dropped} (sub-cat / noise like "Our Brands", "Gift Cards")`);

  // Category breakdown
  const byCat = new Map<string, number>();
  for (const r of rooted) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  console.log(`\nCategory breakdown (root cats only):`);
  for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(28)} ${String(n).padStart(4)}`);
  }

  // BSR distribution (popular vs rest)
  const popular = rooted.filter((r) => r.bsr <= 5000);
  console.log(`\nBSR distribution:`);
  console.log(`  Popular (≤5k):  ${popular.length} (${((popular.length / rooted.length) * 100).toFixed(0)}%)`);
  console.log(`  Mid (5k-100k):  ${rooted.filter((r) => r.bsr > 5000 && r.bsr <= 100000).length}`);
  console.log(`  Tail (>100k):   ${rooted.filter((r) => r.bsr > 100000).length}`);

  // Parent vs child coverage
  const withParent = rooted.filter((r) => r.parentSales != null).length;
  const withChild = rooted.filter((r) => r.asinSales != null).length;
  console.log(`\nSignal coverage:`);
  console.log(`  With Parent Level Sales: ${withParent}`);
  console.log(`  With ASIN Sales:         ${withChild}`);

  // Append to JSONL corpus
  const outDir = path.join(process.cwd(), 'scripts/probes/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'h10-extra-corpus.jsonl');
  const lines = rooted.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(outPath, lines, 'utf8');
  console.log(`\n✓ Appended ${rooted.length} rows to ${outPath}`);

  // Dedup count (so we know if we double-imported)
  const totalText = fs.readFileSync(outPath, 'utf8');
  const totalLines = totalText.split('\n').filter(Boolean);
  const uniqAsins = new Set(totalLines.map((l) => JSON.parse(l).asin));
  console.log(`  Total file: ${totalLines.length} rows, ${uniqAsins.size} unique ASINs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
