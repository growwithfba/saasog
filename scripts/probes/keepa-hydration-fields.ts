/**
 * Keepa-everywhere sweep probe — verify every field we plan to map
 * for the shared hydrateCompetitor module before writing it.
 *
 * Hits /product with: stats=180&history=1&rating=1&buybox=1&offers=20&aplus=1
 *
 * Confirms each field exists and has a reasonable value on representative
 * ASINs covering: an inflated-review case, a legit viral product, a
 * top-seller, an ancient listing, a brand-new listing.
 *
 * Run: npx tsx scripts/probes/keepa-hydration-fields.ts
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

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_EPOCH_MS = new Date('2011-01-01').getTime();
const MINUTE_MS = 60 * 1000;

const CSV = {
  AMAZON_PRICE: 0,
  NEW_PRICE: 1,
  BSR: 3,
  COUNT_NEW_OFFERS: 11,
  RATING: 16,
  REVIEW_COUNT: 17,
  BUY_BOX_SHIPPING: 18,
} as const;

const ASINS = [
  // Dave's screenshot — known inflated reviews case
  'B0GBX8QY64',
  // Loocio — legit viral product (BSR 22, ~3,634 monthly sales, ~24k reviews)
  'B09DF9NWC7',
  // TheraICE — top-seller (BSR 645, ~22,458 monthly sales, ~43k reviews)
  'B0CBSQVMHM',
  // Very old listing (2012)
  'B004GIDW9S',
  // Recent listing (2026)
  'B0FW4VBKFP',
];

function fmt(v: unknown, max = 60): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.length > max ? `"${v.slice(0, max)}…" (${v.length} chars)` : `"${v}"`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `Array(len=${v.length})`;
  if (typeof v === 'object') return `Object(keys=${Object.keys(v as object).slice(0, 6).join(',')})`;
  return String(v);
}

function keepaMinutesToIso(min: number | null | undefined): string | null {
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return null;
  return new Date(KEEPA_EPOCH_MS + min * MINUTE_MS).toISOString();
}

async function probe() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing from .env.local');

  // Batched call — one request, all ASINs. This is also how the new
  // hydration module will call Keepa.
  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=${ASINS.join(',')}` +
    `&stats=180` +
    `&history=1` +
    `&rating=1` +
    `&buybox=1` +
    `&offers=20` +
    `&aplus=1`;

  console.log('\nKeepa /product probe — batched call');
  console.log(`URL params: stats=180&history=1&rating=1&buybox=1&offers=20&aplus=1`);
  console.log(`ASINs: ${ASINS.length} (${ASINS.join(', ')})\n`);

  const t0 = Date.now();
  const res = await fetch(url);
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keepa ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const products: any[] = data.products || [];

  console.log(`Response: ${res.status}, ${elapsed}ms, ${products.length} products`);
  console.log(`Tokens: left=${data.tokensLeft}, consumed=${data.tokensConsumed}, refillRate=${data.refillRate}, refillIn=${data.refillIn}ms\n`);

  for (const product of products) {
    const asin = product.asin;
    const current = product?.stats?.current ?? [];
    console.log('='.repeat(80));
    console.log(`ASIN: ${asin}`);
    console.log('='.repeat(80));

    // -- Identity --
    console.log('\n[Identity]');
    console.log(`  title:                ${fmt(product.title, 80)}`);
    console.log(`  brand:                ${fmt(product.brand)}`);
    console.log(`  manufacturer:         ${fmt(product.manufacturer)}`);

    // -- Images --
    console.log('\n[Images]');
    console.log(`  imagesCSV:            ${fmt(product.imagesCSV, 100)}`);
    console.log(`  imageCount:           ${fmt(product.imageCount)}`);
    if (typeof product.imagesCSV === 'string') {
      const arr = product.imagesCSV.split(',').filter(Boolean);
      console.log(`  imagesCSV parsed:     ${arr.length} entries; first="${arr[0]?.slice(0, 40)}"`);
    }
    console.log(`  images (full obj):    ${fmt(product.images)}`);
    if (Array.isArray(product.images) && product.images[0]) {
      const img0 = product.images[0];
      console.log(`  images[0] keys:       ${Object.keys(img0).join(', ')}`);
      console.log(`  images[0].l/lH/lW:    ${fmt(img0.l)} / ${fmt(img0.lH)} / ${fmt(img0.lW)}`);
    }

    // -- Reviews/Rating (rating=1) --
    console.log('\n[Reviews/Rating — requires rating=1]');
    console.log(`  stats.current[16] rating raw:    ${fmt(current[CSV.RATING])}  → ${current[CSV.RATING] >= 0 ? current[CSV.RATING] / 10 : 'N/A'} stars`);
    console.log(`  stats.current[17] reviews:       ${fmt(current[CSV.REVIEW_COUNT])}`);

    // -- Price --
    console.log('\n[Price]');
    console.log(`  stats.current[0] Amazon:         ${fmt(current[CSV.AMAZON_PRICE])}`);
    console.log(`  stats.current[1] New:            ${fmt(current[CSV.NEW_PRICE])}`);
    console.log(`  stats.current[18] BuyBox shipping: ${fmt(current[CSV.BUY_BOX_SHIPPING])}`);
    console.log(`  buyBoxPrice:          ${fmt(product.buyBoxPrice)}`);

    // -- BSR --
    console.log('\n[BSR]');
    console.log(`  stats.current[3] BSR:            ${fmt(current[CSV.BSR])}`);
    console.log(`  salesRanks (keys):    ${product.salesRanks ? Object.keys(product.salesRanks).slice(0, 5).join(', ') : 'null'}`);
    console.log(`  salesRankReference:   ${fmt(product.salesRankReference)}`);

    // -- FBA fee --
    console.log('\n[FBA Fee]');
    console.log(`  fbaFees:              ${fmt(product.fbaFees)}`);
    if (product.fbaFees) {
      console.log(`  fbaFees keys:         ${Object.keys(product.fbaFees).join(', ')}`);
      console.log(`  fbaFees.pickAndPackFee: ${fmt(product.fbaFees.pickAndPackFee)} (cents)`);
      console.log(`  fbaFees.storageFee:   ${fmt(product.fbaFees.storageFee)}`);
    }
    console.log(`  referralFeePercent:   ${fmt(product.referralFeePercent)}`);

    // -- Weight / Dimensions --
    console.log('\n[Weight / Dimensions]');
    console.log(`  packageWeight:        ${fmt(product.packageWeight)} (grams × 10)`);
    console.log(`  itemWeight:           ${fmt(product.itemWeight)}`);
    console.log(`  packageLength:        ${fmt(product.packageLength)} (mm)`);
    console.log(`  packageWidth:         ${fmt(product.packageWidth)}`);
    console.log(`  packageHeight:        ${fmt(product.packageHeight)}`);

    // -- Listing age --
    console.log('\n[Listing Age]');
    console.log(`  listedSince:          ${fmt(product.listedSince)} → ${keepaMinutesToIso(product.listedSince)}`);
    console.log(`  trackingSince:        ${fmt(product.trackingSince)} → ${keepaMinutesToIso(product.trackingSince)}`);

    // -- Variations --
    console.log('\n[Variations]');
    console.log(`  variations:           ${fmt(product.variations)}`);
    if (Array.isArray(product.variations)) {
      console.log(`  variations[].length:  ${product.variations.length}`);
    }
    console.log(`  variationCSV:         ${fmt(product.variationCSV, 80)}`);

    // -- Fulfillment / Offers --
    console.log('\n[Fulfillment / Offers — requires offers=20 + buybox=1]');
    console.log(`  buyBoxIsAmazon:       ${fmt(product.buyBoxIsAmazon)}`);
    console.log(`  buyBoxSellerIdHistory: ${fmt(product.buyBoxSellerIdHistory)}`);
    console.log(`  offers:               ${fmt(product.offers)}`);
    if (Array.isArray(product.offers) && product.offers.length > 0) {
      console.log(`  offers[0] keys:       ${Object.keys(product.offers[0]).slice(0, 12).join(', ')}`);
      console.log(`  offers[0].sellerId:   ${fmt(product.offers[0].sellerId)}`);
      console.log(`  offers[0].isFBA:      ${fmt(product.offers[0].isFBA)}`);
      console.log(`  offers[0].isAmazon:   ${fmt(product.offers[0].isAmazon)}`);
    }

    // -- A+ content (aplus=1) --
    console.log('\n[A+ Content — requires aplus=1]');
    // Try multiple field names since exact name was the open question.
    console.log(`  aPlus:                ${fmt(product.aPlus, 200)}`);
    console.log(`  aPlusContent:         ${fmt(product.aPlusContent, 200)}`);
    console.log(`  hasAPlus:             ${fmt(product.hasAPlus)}`);
    // Walk all top-level keys looking for "plus" or "aplus"
    const aplusKeys = Object.keys(product).filter((k) => /a.?plus/i.test(k));
    console.log(`  product keys matching /a.?plus/i: ${aplusKeys.length > 0 ? aplusKeys.join(', ') : 'NONE'}`);

    // -- Features (bullets for LQS) --
    console.log('\n[Features / Bullets — for LQS]');
    console.log(`  features:             ${fmt(product.features)}`);
    if (Array.isArray(product.features)) {
      console.log(`  features.length:      ${product.features.length}`);
      console.log(`  features[0]:          ${fmt(product.features[0], 80)}`);
    }
    console.log(`  description:          ${fmt(product.description, 80)}`);

    // -- Title for LQS --
    console.log('\n[Title for LQS]');
    console.log(`  title.length:         ${typeof product.title === 'string' ? product.title.length : 'N/A'}`);

    // -- Category --
    console.log('\n[Category]');
    if (Array.isArray(product.categoryTree)) {
      console.log(`  categoryTree:         ${product.categoryTree.map((c: any) => c?.name).filter(Boolean).join(' > ')}`);
    } else {
      console.log(`  categoryTree:         ${fmt(product.categoryTree)}`);
    }
    console.log(`  rootCategory:         ${fmt(product.rootCategory)}`);

    // -- Other potentially useful --
    console.log('\n[Other]');
    console.log(`  monthlySold:          ${fmt(product.monthlySold)} (Amazon "X+ bought" display)`);
    console.log(`  isAdultProduct:       ${fmt(product.isAdultProduct)}`);
    console.log(`  isHazMat:             ${fmt(product.isHazMat)}`);
    console.log(`  parentAsin:           ${fmt(product.parentAsin)}`);

    console.log();
  }

  // Print top-level keys for one product so we can spot anything we missed.
  if (products[0]) {
    console.log('\n='.repeat(80));
    console.log('All top-level product keys (first ASIN, for reference):');
    console.log('='.repeat(80));
    console.log(Object.keys(products[0]).sort().join(', '));
  }
}

probe().catch((err) => {
  console.error('\nProbe failed:', err);
  process.exit(1);
});
