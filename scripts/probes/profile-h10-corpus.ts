/**
 * One-off profiler: shows BSR-range distribution and per-category
 * BSR-range coverage for the H10 corpus in submissions. Used to
 * decide whether the corpus has enough popular-range (BSR<5k)
 * samples to recalibrate the base curve, or whether we need more
 * targeted data.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

try {
  const t = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ROOT_CATEGORIES = new Set([
  'Arts, Crafts & Sewing','Automotive','Baby','Beauty & Personal Care','Books',
  'Clothing, Shoes & Jewelry','Computers & Accessories','Electronics',
  'Grocery & Gourmet Food','Health & Household','Home & Kitchen',
  'Industrial & Scientific','Kitchen & Dining','Musical Instruments',
  'Office Products','Patio, Lawn & Garden','Pet Supplies','Sports & Outdoors',
  'Tools & Home Improvement','Toys & Games','Video Games',
]);

const BUCKETS: [string, number, number][] = [
  ['1-500',          1,      500],
  ['500-1k',         500,    1000],
  ['1k-5k',          1000,   5000],
  ['5k-25k',         5000,   25000],
  ['25k-100k',       25000,  100000],
  ['100k-500k',      100000, 500000],
  ['500k+',          500000, Infinity],
];

const bucketOf = (bsr: number) =>
  BUCKETS.find(([, lo, hi]) => bsr >= lo && bsr < hi)?.[0] ?? '?';

async function main() {
  const samples: { bsr: number; cat: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('submissions').select('submission_data')
      .range(offset, offset + 9).order('id', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const comps: any[] = (row as any).submission_data?.productData?.competitors ?? [];
      for (const c of comps) {
        const bsr = Number(c?.bsr);
        const ms = Number(c?.monthlySales);
        const cat = String(c?.category ?? '').trim();
        if (bsr > 0 && ms > 0 && cat) samples.push({ bsr, cat });
      }
    }
    offset += 10;
    if (data.length < 10) break;
  }

  console.log(`\nLoaded ${samples.length} usable samples.\n`);

  // Overall BSR distribution
  console.log('=== Overall BSR distribution ===');
  for (const [name] of BUCKETS) {
    const n = samples.filter((s) => bucketOf(s.bsr) === name).length;
    const pct = ((n / samples.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(n / samples.length * 50));
    console.log(`  ${name.padEnd(10)} ${String(n).padStart(5)}  (${pct.padStart(5)}%) ${bar}`);
  }

  // Per-category × BSR-bucket matrix (root cats only)
  const cats = Array.from(new Set(samples.filter((s) => ROOT_CATEGORIES.has(s.cat)).map((s) => s.cat))).sort();
  console.log('\n=== Per-category BSR distribution (root cats only) ===');
  console.log(`${'Category'.padEnd(28)} | ${BUCKETS.map(([n]) => n.padStart(7)).join(' | ')} | total`);
  console.log('-'.repeat(120));
  for (const cat of cats) {
    const catSamples = samples.filter((s) => s.cat === cat);
    const counts = BUCKETS.map(([n]) =>
      String(catSamples.filter((s) => bucketOf(s.bsr) === n).length).padStart(7)
    );
    console.log(`${cat.padEnd(28)} | ${counts.join(' | ')} | ${catSamples.length}`);
  }

  // Popular range gap check
  const popular = samples.filter((s) => s.bsr <= 5000);
  console.log(`\n=== Popular range (BSR ≤ 5000) ===`);
  console.log(`  Total: ${popular.length} (${((popular.length / samples.length) * 100).toFixed(1)}% of corpus)`);
  const popByCat = new Map<string, number>();
  for (const s of popular) {
    if (ROOT_CATEGORIES.has(s.cat)) popByCat.set(s.cat, (popByCat.get(s.cat) ?? 0) + 1);
  }
  console.log(`  Per-category breakdown (root cats only):`);
  for (const [cat, n] of [...popByCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(28)} ${String(n).padStart(4)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
