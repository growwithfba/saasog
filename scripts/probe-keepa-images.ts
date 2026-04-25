/**
 * Probe: confirm what Keepa returns in `imagesCSV` for a real product so
 * we can build the correct CDN URL. Run with `npx tsx scripts/probe-keepa-images.ts <asin>`.
 */
import * as fs from 'fs';
import * as path from 'path';

// Minimal .env.local loader — avoids the dotenv dep.
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const KEEPA_BASE_URL = 'https://api.keepa.com';

async function main() {
  const asin = process.argv[2] || 'B07Q6VCZNH'; // a known Wilson hopper ASIN
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) throw new Error('KEEPA_API_KEY missing');

  const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1&asin=${asin}&stats=365&history=1`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Keepa fetch failed', res.status, await res.text());
    process.exit(1);
  }
  const json: any = await res.json();
  const product = json.products?.[0];
  if (!product) {
    console.error('No product returned');
    process.exit(1);
  }

  console.log('asin:', product.asin);
  console.log('title raw:', JSON.stringify(product.title));
  console.log('brand:', product.brand);
  console.log('hasReviews:', product.hasReviews);
  console.log('domainId:', product.domainId);
  console.log('lastUpdate:', product.lastUpdate);
  console.log('csv types with data:', (product.csv || []).map((s: any, i: number) => Array.isArray(s) && s.length ? i : null).filter((x: any) => x !== null));
  console.log('top-level keys:', Object.keys(product).sort().join(', '));
  console.log('imagesCSV (raw):', product.imagesCSV);
  console.log('imageUrl-related fields:', {
    imagesCSV: product.imagesCSV,
    images: product.images,
    image: product.image,
    imageCount: product.imageCount,
    g: product.g
  });
  if (typeof product.imagesCSV === 'string') {
    const entries = product.imagesCSV.split(',').map((s: string) => s.trim()).filter(Boolean);
    console.log('imagesCSV entries:', entries);
    if (entries[0]) {
      const f = entries[0];
      const candidates = [
        `https://m.media-amazon.com/images/I/${f}`,
        `https://m.media-amazon.com/images/I/${f}.jpg`,
        `https://images-na.ssl-images-amazon.com/images/I/${f}`,
        `https://images-na.ssl-images-amazon.com/images/I/${f}.jpg`
      ];
      for (const cand of candidates) {
        try {
          const probe = await fetch(cand, { method: 'HEAD' });
          console.log(probe.status, cand);
        } catch (err) {
          console.log('ERR', cand, (err as Error).message);
        }
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
