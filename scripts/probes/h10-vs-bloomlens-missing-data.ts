/**
 * For every BloomLens row with missing history-derived fields (BSR / Monthly
 * Sales / Monthly Revenue / Reviews), look up the same ASIN in H10's CSV and
 * print what H10 was able to surface for that ASIN.
 *
 * Goal: pinpoint why our Keepa-driven path drops these rows to 'limited' when
 * H10 has values. Output gives the inputs needed to test each ASIN's Keepa
 * /product blob (next probe = direct Keepa fetch for a sample).
 *
 * Run: npx tsx scripts/probes/h10-vs-bloomlens-missing-data.ts <bloomlens.csv> <h10.csv>
 */
import * as fs from 'fs';
import * as path from 'path';

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

function loadCsv(p: string): { header: string[]; rows: string[][] } {
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function col(header: string[], row: string[], name: string): string {
  const i = header.indexOf(name);
  if (i < 0) return '';
  return (row[i] ?? '').trim();
}

function isEmpty(v: string): boolean {
  return !v || v === 'N/A' || v === '"N/A"';
}

function main() {
  const bloomPath = path.resolve(process.argv[2] ?? '');
  const h10Path = path.resolve(process.argv[3] ?? '');
  if (!bloomPath || !h10Path) {
    console.error('Usage: tsx ... <bloomlens.csv> <h10.csv>');
    process.exit(1);
  }
  const bloom = loadCsv(bloomPath);
  const h10 = loadCsv(h10Path);

  console.log(`BloomLens rows: ${bloom.rows.length}, H10 rows: ${h10.rows.length}\n`);

  // Index H10 by ASIN — H10 has same-ASIN duplicates for sponsored placements,
  // keep the first.
  const h10ByAsin = new Map<string, string[]>();
  for (const r of h10.rows) {
    const asin = col(h10.header, r, 'ASIN');
    if (asin && !h10ByAsin.has(asin)) h10ByAsin.set(asin, r);
  }

  const FIELDS_TO_CHECK = ['BSR', 'Monthly Sales', 'Monthly Revenue', 'Reviews', 'Rating', 'Strength', 'Competitor Score'];

  // Find BloomLens rows with multiple missing fields.
  // We use the SECOND occurrence of the column name "ASIN" because the BloomLens
  // CSV header has it twice (legacy quirk). The duplicate doesn't matter for
  // ASIN extraction; we just take the first occurrence.

  // De-dupe BloomLens rows by ASIN so we don't double-count sponsored rows.
  const bloomByAsin = new Map<string, string[]>();
  for (const r of bloom.rows) {
    const asin = col(bloom.header, r, 'ASIN');
    if (asin && !bloomByAsin.has(asin)) bloomByAsin.set(asin, r);
  }

  type MissingRow = {
    asin: string;
    bloomReviews: string;
    bloomRating: string;
    bloomBsr: string;
    bloomMonthlySales: string;
    bloomListingAge: string;
    bloomListingCreated: string;
    bloomCategory: string;
    h10Bsr: string;
    h10AsinSales: string;
    h10ParentSales: string;
    h10Reviews: string;
    h10Rating: string;
    h10Category: string;
    h10Age: string;
  };

  const missing: MissingRow[] = [];
  let totalBloomDeduped = 0;
  let totalMissing = 0;

  for (const [asin, br] of bloomByAsin) {
    totalBloomDeduped++;
    const missingFields = FIELDS_TO_CHECK.filter((f) => isEmpty(col(bloom.header, br, f)));
    if (missingFields.length < 3) continue; // Only care about rows missing many fields
    totalMissing++;
    const h10r = h10ByAsin.get(asin);
    missing.push({
      asin,
      bloomReviews: col(bloom.header, br, 'Reviews'),
      bloomRating: col(bloom.header, br, 'Rating'),
      bloomBsr: col(bloom.header, br, 'BSR'),
      bloomMonthlySales: col(bloom.header, br, 'Monthly Sales'),
      bloomListingAge: col(bloom.header, br, 'Listing Age'),
      bloomListingCreated: col(bloom.header, br, 'Listing Created'),
      bloomCategory: col(bloom.header, br, 'Category'),
      h10Bsr: h10r ? col(h10.header, h10r, 'BSR') : '<not in H10>',
      h10AsinSales: h10r ? col(h10.header, h10r, 'ASIN Sales') : '<not in H10>',
      h10ParentSales: h10r ? col(h10.header, h10r, 'Parent Level Sales') : '<not in H10>',
      h10Reviews: h10r ? col(h10.header, h10r, 'Review Count') : '<not in H10>',
      h10Rating: h10r ? col(h10.header, h10r, 'Ratings') : '<not in H10>',
      h10Category: h10r ? col(h10.header, h10r, 'Category') : '<not in H10>',
      h10Age: h10r ? col(h10.header, h10r, 'Seller Age (mo)') : '<not in H10>',
    });
  }

  console.log(`BloomLens unique ASINs: ${totalBloomDeduped}`);
  console.log(`BloomLens rows missing 3+ history fields: ${totalMissing}`);
  console.log(`Of those, how many ALSO appear in the H10 CSV: ${missing.filter((m) => m.h10Bsr !== '<not in H10>').length}\n`);

  console.log('=== BloomLens missing rows + H10 cross-reference ===\n');
  for (const m of missing) {
    console.log(`ASIN: ${m.asin}   Category(BL): ${m.bloomCategory || '<empty>'}`);
    console.log(`  BloomLens — Reviews: ${m.bloomReviews || '<empty>'}, Rating: ${m.bloomRating || '<empty>'}, BSR: ${m.bloomBsr || '<empty>'}, Sales: ${m.bloomMonthlySales || '<empty>'}, ListingAge: ${m.bloomListingAge || '<empty>'} days, Created: ${m.bloomListingCreated || '<empty>'}`);
    if (m.h10Bsr === '<not in H10>') {
      console.log(`  H10:      (ASIN not in this H10 export)`);
    } else {
      console.log(`  H10       — BSR: ${m.h10Bsr || '<empty>'}, ASIN sales: ${m.h10AsinSales || '<empty>'}, Parent sales: ${m.h10ParentSales || '<empty>'}, Reviews: ${m.h10Reviews || '<empty>'}, Rating: ${m.h10Rating || '<empty>'}, Category: ${m.h10Category || '<empty>'}, SellerAge: ${m.h10Age || '<empty>'} mo`);
    }
    console.log('');
  }
}

main();
