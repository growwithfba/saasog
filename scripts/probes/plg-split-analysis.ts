import * as fs from 'fs';
import { execSync } from 'child_process';
import { bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';

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

type Row = { asin: string; cat: string; bsr: number; sales: number; src: string };

function loadRows(file: string): Row[] {
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0].replace(/^﻿/, ''));
  const iAsin = header.indexOf('ASIN');
  const iCat = header.indexOf('Category');
  const iBsr = header.indexOf('BSR');
  const iSales = header.indexOf('Parent Level Sales');
  if (iAsin < 0 || iCat < 0 || iBsr < 0 || iSales < 0) return [];
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const asin = cols[iAsin]?.trim();
    const cat = cols[iCat]?.trim();
    const bsr = num(cols[iBsr]);
    const sales = num(cols[iSales]);
    if (!asin || !cat || bsr == null || sales == null || sales <= 0) continue;
    if (cat !== 'Patio, Lawn & Garden') continue;
    rows.push({ asin, cat, bsr, sales, src: file });
  }
  return rows;
}

const oldFiles = fs.readFileSync('/tmp/old-plg.txt', 'utf8').split('\n').filter(Boolean);
const newFiles = fs.readFileSync('/tmp/new-plg.txt', 'utf8').split('\n').filter(Boolean);

const oldRows = oldFiles.flatMap(loadRows);
const newRows = newFiles.flatMap(loadRows);

console.log(`OLD P/L/G rows: ${oldRows.length}`);
console.log(`NEW P/L/G rows: ${newRows.length}\n`);

function bandOf(bsr: number): string {
  if (bsr < 1000) return '0-1k';
  if (bsr < 4000) return '1k-4k';
  if (bsr < 15000) return '4k-15k';
  if (bsr < 60000) return '15k-60k';
  if (bsr < 200000) return '60k-200k';
  return '200k+';
}

const bands = ['0-1k', '1k-4k', '4k-15k', '15k-60k', '60k-200k', '200k+'];

function tally(rows: Row[]) {
  const c: Record<string, number> = {}; for (const b of bands) c[b] = 0;
  for (const r of rows) c[bandOf(r.bsr)]++;
  return c;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ratiosByBand(rows: Row[]) {
  const r: Record<string, number[]> = {}; for (const b of bands) r[b] = [];
  for (const x of rows) {
    const pred = bsrToMonthlyUnitsByCategory(x.bsr, [x.cat]);
    if (pred == null || pred <= 0) continue;
    r[bandOf(x.bsr)].push(pred / x.sales);
  }
  return r;
}

console.log('BSR-band distribution');
console.log('BAND       | OLD | NEW');
const oldCounts = tally(oldRows);
const newCounts = tally(newRows);
for (const b of bands) console.log(`${b.padEnd(10)} | ${String(oldCounts[b]).padStart(3)} | ${String(newCounts[b]).padStart(3)}`);

console.log('\nMedian ratio per band (predicted ÷ H10 actual)');
console.log('BAND       | OLD med (n)       | NEW med (n)');
const oldR = ratiosByBand(oldRows);
const newR = ratiosByBand(newRows);
for (const b of bands) {
  const om = median(oldR[b]); const nm = median(newR[b]);
  console.log(`${b.padEnd(10)} | ${(isNaN(om) ? '-' : om.toFixed(2)).padStart(7)} (${String(oldR[b].length).padStart(3)})  |  ${(isNaN(nm) ? '-' : nm.toFixed(2)).padStart(7)} (${String(newR[b].length).padStart(3)})`);
}

// Sample examples
function sample(rows: Row[]) {
  const s = [...rows].sort((a, b) => a.bsr - b.bsr);
  return [
    s[Math.floor(s.length * 0.1)],
    s[Math.floor(s.length * 0.5)],
    s[Math.floor(s.length * 0.9)],
  ];
}
console.log('\n--- 3 OLD P/L/G ASINs (low / mid / high BSR) ---');
for (const r of sample(oldRows)) {
  if (!r) continue;
  const p = bsrToMonthlyUnitsByCategory(r.bsr, [r.cat]);
  console.log(`  ${r.asin}  BSR ${String(r.bsr).padStart(7)}  band ${bandOf(r.bsr).padEnd(8)}  H10 sales ${String(r.sales).padStart(6)}  predicted ${String(p).padStart(6)}  ratio ${p != null ? (p / r.sales).toFixed(2) + 'x' : '-'}`);
}
console.log('\n--- 3 NEW P/L/G ASINs (low / mid / high BSR) ---');
for (const r of sample(newRows)) {
  if (!r) continue;
  const p = bsrToMonthlyUnitsByCategory(r.bsr, [r.cat]);
  console.log(`  ${r.asin}  BSR ${String(r.bsr).padStart(7)}  band ${bandOf(r.bsr).padEnd(8)}  H10 sales ${String(r.sales).padStart(6)}  predicted ${String(p).padStart(6)}  ratio ${p != null ? (p / r.sales).toFixed(2) + 'x' : '-'}`);
}
