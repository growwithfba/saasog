/**
 * Audit probe — pull a single known product from Keepa with the full set
 * of flags we'd need for the vetting matrix, then enumerate exactly what
 * each top-level field + csv slot contains. Lets us confirm "is this
 * really the buy-box-with-shipping value" against a real ASIN before
 * touching production code.
 *
 * Run: `npx tsx scripts/probes/keepa-field-audit.ts`
 */
import * as fs from 'fs';
import * as path from 'path';

try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const KEY = process.env.KEEPA_API_KEY;
if (!KEY) {
  console.error('KEEPA_API_KEY missing'); process.exit(1);
}

// Loocio — known top-seller (BSR 22, real reviews, real sales).
const ASIN = 'B09DF9NWC7';

// Comprehensive flag set: stats + history + rating + offers + buybox.
// offers=20 enables Buy Box seller history; buybox=1 enables buy box stats.
const url =
  `https://api.keepa.com/product` +
  `?key=${KEY}` +
  `&domain=1` +
  `&asin=${ASIN}` +
  `&stats=180` +
  `&history=1` +
  `&rating=1` +
  `&offers=20` +
  `&buybox=1`;

const CSV_INDEX_LABELS: Record<number, string> = {
  0: 'AMAZON (price)',
  1: 'NEW (lowest new, item only)',
  2: 'USED (lowest used)',
  3: 'SALES_RANK (BSR)',
  4: 'LIST_PRICE (MSRP)',
  5: 'COLLECTIBLE',
  6: 'REFURBISHED',
  7: 'NEW_FBM_SHIPPING (lowest new FBM + shipping)',
  8: 'LIGHTNING_DEAL',
  9: 'WAREHOUSE_DEAL',
  10: 'NEW_FBA (lowest 3P-FBA)',
  11: 'COUNT_NEW (offer count)',
  12: 'COUNT_USED',
  13: 'COUNT_REFURBISHED',
  14: 'COUNT_COLLECTIBLE',
  16: 'RATING (×10, e.g. 45 = 4.5 stars)',
  17: 'COUNT_REVIEWS',
  18: 'BUY_BOX_SHIPPING (what customer pays at checkout)',
};

(async () => {
  const res = await fetch(url);
  const body = await res.json() as any;
  const product = body?.products?.[0];
  if (!product) {
    console.log('No product returned. Body:', JSON.stringify(body).slice(0, 500));
    return;
  }

  console.log(`=== ${ASIN}: ${(product.title || '').slice(0, 70)} ===\n`);

  console.log('--- Top-level current fields ---');
  console.log({
    asin: product.asin,
    title: (product.title || '').slice(0, 60),
    brand: product.brand,
    manufacturer: product.manufacturer,
    listedSince_keepaMin: product.listedSince,
    listedSince_date: product.listedSince
      ? new Date(new Date('2011-01-01T00:00:00Z').getTime() + product.listedSince * 60_000).toISOString().slice(0, 10)
      : null,
    monthlySold: product.monthlySold,
    returnRate: product.returnRate,
    packageWeight_g: product.packageWeight,
    itemWeight_g: product.itemWeight,
    packageDimensions_mm: `${product.packageLength} × ${product.packageWidth} × ${product.packageHeight}`,
    variationCSV_length: Array.isArray(product.variationCSV) ? product.variationCSV.length : null,
    variations_length: Array.isArray(product.variations) ? product.variations.length : null,
    images_count: Array.isArray(product.images) ? product.images.length : 0,
    firstImageFilename: Array.isArray(product.images) && product.images[0]
      ? (product.images[0].m || product.images[0].l)
      : null,
    fbaFees_pickAndPack_cents: product.fbaFees?.pickAndPackFee,
    fbaFees_storage_cents: product.fbaFees?.storageFee,
    buyBoxPrice_cents: product.buyBoxPrice,
    buyBoxSellerId: product.buyBoxSellerId,
    buyBoxIsAmazon: product.buyBoxIsAmazon,
    salesRanks_keys: product.salesRanks ? Object.keys(product.salesRanks) : null,
  });

  console.log('\n--- stats.current (current snapshot at each csv index) ---');
  const cur: number[] = Array.isArray(product.stats?.current) ? product.stats.current : [];
  for (let i = 0; i < cur.length; i++) {
    const label = CSV_INDEX_LABELS[i];
    const v = cur[i];
    if (label) {
      const display =
        v === -1 ? '−1 (no data)' :
        i === 16 && typeof v === 'number' && v > 0 ? `${v} (= ${(v/10).toFixed(1)} stars)` :
        [0,1,2,4,5,6,7,8,9,10,18].includes(i) && typeof v === 'number' && v > 0 ? `${v} cents (= $${(v/100).toFixed(2)})` :
        v;
      console.log(`  csv[${i}] ${label}: ${display}`);
    }
  }

  console.log('\n--- csv array slot lengths (history points / 2) ---');
  const csv: any[] = product.csv || [];
  for (let i = 0; i < csv.length; i++) {
    const label = CSV_INDEX_LABELS[i];
    const slot = csv[i];
    const len = Array.isArray(slot) ? slot.length / 2 : 'empty';
    if (label) console.log(`  csv[${i}] ${label}: ${len} history points`);
  }

  console.log('\n--- Tokens ---');
  console.log({ consumed: body.tokensConsumed, left: body.tokensLeft, refillRate: body.refillRate });
})();
