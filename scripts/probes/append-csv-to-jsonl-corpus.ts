/**
 * Append H10 X-ray CSV(s) to the JSONL extra-corpus that
 * `calibrate-r8-bands-from-supabase.ts` reads. Used to roll fresh
 * H10 batches into the merged calibration corpus without duplicating
 * the parsing logic.
 *
 * Usage:
 *   npx tsx scripts/probes/append-csv-to-jsonl-corpus.ts <csv-folder> [--dry-run]
 *
 * - Reads every *.csv in the folder
 * - Extracts asin/bsr/parentSales/asinSales/category per row
 * - Dedupes against the existing JSONL by ASIN (skips already-present rows)
 * - Appends new rows to scripts/probes/data/h10-extra-corpus.jsonl
 *
 * --dry-run prints the counts without writing.
 */
import * as fs from 'fs';
import * as path from 'path';

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0,
    field = '',
    row: string[] = [],
    inQuotes = false;
  text = text.replace(/^﻿/, '');
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (field || row.length) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const cleaned = s.replace(/[$,]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

type JsonlRow = {
  asin: string;
  bsr: number;
  parentSales: number;
  asinSales?: number;
  category: string;
  source: string;
};

function main() {
  const folder = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!folder) {
    console.error('usage: npx tsx scripts/probes/append-csv-to-jsonl-corpus.ts <csv-folder> [--dry-run]');
    process.exit(1);
  }

  const jsonlPath = path.join(process.cwd(), 'scripts/probes/data/h10-extra-corpus.jsonl');
  const existingAsins = new Set<string>();
  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try {
        const r = JSON.parse(l);
        if (r?.asin) existingAsins.add(r.asin);
      } catch {}
    }
    console.log(`Existing JSONL: ${existingAsins.size} unique ASINs across ${lines.length} rows`);
  } else {
    console.log('Existing JSONL: not found — will create');
  }

  const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.csv'));
  console.log(`CSV files in folder: ${files.length}`);

  const newRows: JsonlRow[] = [];
  const seenInBatch = new Set<string>();
  const perCategory: Record<string, number> = {};

  for (const f of files) {
    const text = fs.readFileSync(path.join(folder, f), 'utf8');
    const rows = parseCSV(text);
    if (rows.length < 2) continue;
    const header = rows[0];
    const idx = (n: string) => header.findIndex((h) => h.trim() === n);
    const iAsin = idx('ASIN');
    const iBsr = idx('BSR');
    const iParent = idx('Parent Level Sales');
    const iAsinSales = idx('ASIN Sales');
    const iCat = idx('Category');
    if (iAsin < 0 || iBsr < 0 || iParent < 0 || iCat < 0) {
      console.warn(`  SKIP ${f}: missing required columns`);
      continue;
    }

    let fileNew = 0;
    let fileDupe = 0;
    let fileBad = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const asin = row[iAsin]?.trim();
      const bsr = num(row[iBsr]);
      const parentSales = num(row[iParent]);
      const asinSales = iAsinSales >= 0 ? num(row[iAsinSales]) : null;
      const cat = row[iCat]?.trim() || '';
      if (!asin || !bsr || !parentSales || !cat || cat === 'Our Brands') {
        fileBad++;
        continue;
      }
      if (existingAsins.has(asin) || seenInBatch.has(asin)) {
        fileDupe++;
        continue;
      }
      seenInBatch.add(asin);
      const out: JsonlRow = {
        asin,
        bsr,
        parentSales,
        category: cat,
        source: f,
      };
      if (asinSales != null) out.asinSales = asinSales;
      newRows.push(out);
      perCategory[cat] = (perCategory[cat] ?? 0) + 1;
      fileNew++;
    }
    console.log(`  ${f}: new=${fileNew}  dupe=${fileDupe}  bad=${fileBad}`);
  }

  console.log(`\nNew rows to append: ${newRows.length}`);
  console.log('By category:');
  for (const [cat, n] of Object.entries(perCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(35)} ${n}`);
  }

  if (dryRun) {
    console.log('\n(dry-run — no file written)');
    return;
  }

  if (newRows.length === 0) {
    console.log('Nothing to append.');
    return;
  }

  const out = newRows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(jsonlPath, out);
  console.log(`\nAppended ${newRows.length} rows to ${jsonlPath}`);
}

main();
