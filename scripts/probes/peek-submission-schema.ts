/**
 * Quick peek: dump the full competitors[0] of a recent submission so we
 * know exactly what fields the H10-CSV ingestion pipeline stores. This
 * tells us whether `monthlySales` is per-child (ASIN Sales) or
 * parent-level (Parent Level Sales) — critical for merging the
 * submissions corpus with the new CSV imports for base-curve recal.
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

async function main() {
  // Find a submission with a multi-variation product so we can see whether
  // monthlySales is parent-level (high number) or child-level (lower).
  const { data, error } = await supabase
    .from('submissions')
    .select('id, submission_data')
    .order('id', { ascending: false })
    .limit(50);
  if (error) throw error;
  let found = 0;
  for (const row of data ?? []) {
    const comps = (row as any).submission_data?.productData?.competitors;
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      const v = c?.variations;
      const isMulti = (typeof v === 'number' && v > 1) || (typeof v === 'string' && v !== 'No' && v !== '' && v !== 'N/A');
      if (isMulti) {
        console.log(`Multi-variation row found (id=${(row as any).id}):`);
        console.log(`  asin=${c.asin}, bsr=${c.bsr}, variations=${JSON.stringify(c.variations)}, monthlySales=${c.monthlySales}, monthlyRevenue=${c.monthlyRevenue}, category=${c.category}`);
        found++;
        if (found >= 8) return;
      }
    }
  }
  console.log(`(found ${found} multi-variation rows)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
