/**
 * Test: does sum-of-daily-sales-rates predict H10's reading better than median-BSR?
 *
 * For each ASIN that has BOTH a Keepa BSR history in Supabase AND an H10 reading
 * in the CSV corpus:
 *   - Method A (current): median of 30-day BSR -> curve -> predicted monthly units
 *   - Method B (proposed): for each BSR(t) point, daily_rate = curve / 30; sum
 *                          daily_rate × (hours_in_span / 24) over the 30 days
 *   - Compare both to H10's Parent Level Sales
 *
 * Reports per-category which method is closer.
 */
import * as fs from 'fs';
import { bsrToMonthlyUnitsByCategory } from '../../src/lib/extension/bsrSalesCurve';

type BsrPoint = { value: number; timestamp: number };
type History = { created_at: string; bsr: BsrPoint[] };

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

// Load H10 readings keyed by asin (keep most recent reading per ASIN by file mtime is hard;
// just keep the LAST one we see — usually fine for relative comparison).
function loadH10(): Map<string, { cat: string; sales: number; bsr: number }> {
  const files = fs.readFileSync('/tmp/h10-csv-list.txt', 'utf8').split('\n').filter(Boolean);
  const map = new Map<string, { cat: string; sales: number; bsr: number }>();
  for (const f of files) {
    let text: string;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = text.split('\n').filter(Boolean);
    const header = parseCsvLine(lines[0].replace(/^﻿/, ''));
    const iAsin = header.indexOf('ASIN');
    const iCat = header.indexOf('Category');
    const iBsr = header.indexOf('BSR');
    const iSales = header.indexOf('Parent Level Sales');
    if (iAsin < 0 || iCat < 0 || iSales < 0) continue;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const asin = cols[iAsin]?.trim();
      const cat = cols[iCat]?.trim();
      const bsr = num(cols[iBsr]);
      const sales = num(cols[iSales]);
      if (!asin || !cat || sales == null || sales <= 0 || bsr == null) continue;
      map.set(asin, { cat, sales, bsr });
    }
  }
  return map;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function predictMedian(bsr30d: BsrPoint[], cat: string): number | null {
  if (!bsr30d.length) return null;
  const med = median(bsr30d.map((p) => p.value));
  return bsrToMonthlyUnitsByCategory(med, [cat]);
}

function predictDailyRateSum(bsr30d: BsrPoint[], cat: string): number | null {
  if (bsr30d.length < 2) return null;
  // Sort by timestamp ascending
  const pts = [...bsr30d].sort((a, b) => a.timestamp - b.timestamp);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dtMs = pts[i + 1].timestamp - pts[i].timestamp;
    if (dtMs <= 0) continue;
    const monthlyAtBsr = bsrToMonthlyUnitsByCategory(pts[i].value, [cat]);
    if (monthlyAtBsr == null) continue;
    const dailyRate = monthlyAtBsr / 30; // units/day at this BSR
    const days = dtMs / 86400000;
    total += dailyRate * days;
  }
  return total;
}

function main() {
  const h10 = loadH10();
  console.log(`H10 readings loaded: ${h10.size} unique ASINs\n`);

  // Glob the bsr-histories-*.json files
  const fs_ = require('fs') as typeof fs;
  const histFiles = fs_.readdirSync('/tmp').filter((f: string) => f.startsWith('bsr-histories-') && f.endsWith('.json'));
  const histories: Record<string, History> = {};
  for (const f of histFiles) {
    const data = JSON.parse(fs_.readFileSync('/tmp/' + f, 'utf8'));
    Object.assign(histories, data);
  }
  console.log(`Keepa histories loaded: ${Object.keys(histories).length} ASINs from ${histFiles.length} batch files\n`);

  type Result = {
    asin: string;
    cat: string;
    h10Sales: number;
    h10Bsr: number;
    nPoints30d: number;
    medianBsr: number;
    medianPred: number;
    sumPred: number;
    medianRatio: number;
    sumRatio: number;
  };
  const results: Result[] = [];

  for (const [asin, hist] of Object.entries(histories)) {
    const h = h10.get(asin);
    if (!h) continue;
    const cutoff = new Date(hist.created_at).getTime() - 30 * 86400000;
    const bsr30d = hist.bsr.filter((p) => p.timestamp >= cutoff && p.value > 0);
    if (bsr30d.length < 10) continue;
    const medPred = predictMedian(bsr30d, h.cat);
    const sumPred = predictDailyRateSum(bsr30d, h.cat);
    if (medPred == null || sumPred == null || medPred <= 0 || sumPred <= 0) continue;
    const medBsr = median(bsr30d.map((p) => p.value));
    results.push({
      asin, cat: h.cat, h10Sales: h.sales, h10Bsr: h.bsr,
      nPoints30d: bsr30d.length, medianBsr: medBsr,
      medianPred: medPred, sumPred, medianRatio: medPred / h.sales, sumRatio: sumPred / h.sales,
    });
  }

  console.log(`Paired ASINs evaluated: ${results.length}\n`);

  // Per-category summary
  const byCat = new Map<string, Result[]>();
  for (const r of results) {
    const arr = byCat.get(r.cat) ?? [];
    arr.push(r); byCat.set(r.cat, arr);
  }
  console.log('Per-category: Method A (median-BSR) vs Method B (daily-rate-sum) — closer to 1.0 = better\n');
  console.log('CATEGORY                       | n  | A med ratio | B med ratio | A better? | B better?');
  console.log('-'.repeat(100));
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [cat, arr] of cats) {
    if (arr.length < 2) continue;
    const aMed = median(arr.map((r) => r.medianRatio));
    const bMed = median(arr.map((r) => r.sumRatio));
    const aBetter = arr.filter((r) => Math.abs(Math.log(r.medianRatio)) < Math.abs(Math.log(r.sumRatio))).length;
    const bBetter = arr.length - aBetter;
    console.log(
      `${cat.padEnd(30)} | ${String(arr.length).padStart(2)} | ${aMed.toFixed(2).padStart(11)} | ${bMed.toFixed(2).padStart(11)} | ${String(aBetter).padStart(9)} | ${String(bBetter).padStart(9)}`,
    );
  }

  // Overall
  const allA = median(results.map((r) => r.medianRatio));
  const allB = median(results.map((r) => r.sumRatio));
  console.log('-'.repeat(100));
  console.log(`OVERALL (n=${results.length})${' '.repeat(30 - String(results.length).length - 14)} | ${allA.toFixed(2).padStart(11)} | ${allB.toFixed(2).padStart(11)}`);

  // Top examples where B differs most from A
  console.log('\nTop 10 ASINs where Method B (sum) differs MOST from Method A (median):');
  console.log('ASIN        | cat              | H10 sales | A pred  | B pred  | A ratio | B ratio');
  const byDiff = [...results].sort((a, b) => Math.abs(b.sumPred - b.medianPred) - Math.abs(a.sumPred - a.medianPred));
  for (const r of byDiff.slice(0, 10)) {
    console.log(
      `${r.asin} | ${r.cat.padEnd(16)} | ${String(r.h10Sales).padStart(9)} | ${String(Math.round(r.medianPred)).padStart(7)} | ${String(Math.round(r.sumPred)).padStart(7)} | ${r.medianRatio.toFixed(2).padStart(7)} | ${r.sumRatio.toFixed(2).padStart(7)}`,
    );
  }
}

main();
