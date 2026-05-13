/**
 * Probe B0095UVKRI (Bacon Air Freshener) to understand:
 *  - Why we display "Health & Household" when Amazon BSR is Automotive
 *  - Why ACTIVE SELLERS = 112 when Amazon shows "16 New" sellers
 *
 * Looking at: categoryTree, salesRankReference, salesRanks, offers,
 * liveOffersOrder, buyBoxEligibleOfferCounts.
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

async function probe() {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing');

  const url =
    `${KEEPA_BASE_URL}/product` +
    `?key=${apiKey}` +
    `&domain=1` +
    `&asin=B0095UVKRI` +
    `&stats=180` +
    `&history=1` +
    `&rating=1` +
    `&buybox=1` +
    `&offers=20` +
    `&aplus=1`;

  const res = await fetch(url);
  const data = await res.json();
  const p = data.products?.[0];
  if (!p) throw new Error('No product returned');

  console.log('=== B0095UVKRI ===');
  console.log('title:', p.title);

  console.log('\n[Category fields]');
  console.log('categoryTree:', JSON.stringify(p.categoryTree, null, 2));
  console.log('rootCategory:', p.rootCategory);
  console.log('salesRankReference:', p.salesRankReference);
  console.log('salesRanks (keys + values):');
  if (p.salesRanks) {
    for (const [catId, history] of Object.entries(p.salesRanks)) {
      const arr = history as number[];
      const lastRank = arr && arr.length >= 2 ? arr[arr.length - 1] : null;
      console.log(`  catId ${catId}: rank=${lastRank} (history len ${arr?.length})`);
    }
  }
  console.log('categories (raw catIds):', p.categories);

  console.log('\n[Stats.current[3] BSR]:', p?.stats?.current?.[3]);

  console.log('\n[Offers]');
  console.log('product.offers count:', Array.isArray(p.offers) ? p.offers.length : 'null');
  console.log('product.liveOffersOrder:', p.liveOffersOrder);
  console.log('product.liveOffersOrder length:', Array.isArray(p.liveOffersOrder) ? p.liveOffersOrder.length : 'null');
  console.log('product.buyBoxEligibleOfferCounts:', p.buyBoxEligibleOfferCounts);
  console.log('product.offersSuccessful:', p.offersSuccessful);

  if (Array.isArray(p.offers) && p.offers.length > 0) {
    const sample = p.offers[0];
    console.log('\nofers[0] sample keys:', Object.keys(sample));
    console.log('offers[0] condition:', sample.condition, '(1=new, 2=usedlikenew, 3=used, 4=usedaccept, 5=usedpoor, 6=collectible, 11=refurbished)');
    console.log('offers[0] isFBA:', sample.isFBA, 'isAmazon:', sample.isAmazon, 'isPrime:', sample.isPrime);
    console.log('offers[0] lastSeen:', sample.lastSeen);
    console.log('offers[0] lastStockUpdate:', sample.lastStockUpdate);

    // Count by condition
    const byCondition: Record<number, number> = {};
    for (const o of p.offers) {
      const c = o.condition ?? 0;
      byCondition[c] = (byCondition[c] || 0) + 1;
    }
    console.log('\nofers by condition (all offers, live + historical):', byCondition);

    // Live offers only
    if (Array.isArray(p.liveOffersOrder)) {
      const liveByCondition: Record<number, number> = {};
      for (const idx of p.liveOffersOrder) {
        const o = p.offers[idx];
        if (!o) continue;
        const c = o.condition ?? 0;
        liveByCondition[c] = (liveByCondition[c] || 0) + 1;
      }
      console.log('LIVE offers by condition:', liveByCondition);
    }
  }
}

probe().catch((err) => {
  console.error(err);
  process.exit(1);
});
