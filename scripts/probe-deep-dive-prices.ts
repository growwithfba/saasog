/**
 * Probe: dump per-competitor price-series stats from the most-recent
 * normalized snapshot so we can see if the 80K outliers are bad Keepa data
 * (rebound listing, junk values) or a code-side issue in normalize.ts.
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

import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await supabase
    .from('keepa_analysis')
    .select('product_id, updated_at, normalized_series_json, window_months')
    .order('updated_at', { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return;
  console.log('product:', row.product_id, 'updated:', row.updated_at, 'windowMonths:', (row as any).window_months);

  const competitors = (row as any).normalized_series_json?.competitors || [];
  for (const c of competitors) {
    console.log(`\n=== ${c.asin} ${c.brand || c.title}`);
    const series = c.series || {};
    for (const [name, points] of Object.entries(series) as Array<[string, any]>) {
      if (!Array.isArray(points)) {
        console.log(`  ${name}: ${points}`);
        continue;
      }
      if (!points.length) {
        console.log(`  ${name}: 0 points`);
        continue;
      }
      const finite = points.filter((p: any) => typeof p.value === 'number' && Number.isFinite(p.value) && p.value !== -1);
      const minusOne = points.filter((p: any) => p.value === -1).length;
      const nullCount = points.filter((p: any) => p.value === null).length;
      const values = finite.map((p: any) => p.value);
      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      const first = points[0];
      const last = points[points.length - 1];
      const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 10);
      console.log(`  ${name}: ${points.length} pts (${finite.length} finite, ${minusOne} stockouts, ${nullCount} null) | range ${min}–${max} | ${fmt(first.timestamp)} → ${fmt(last.timestamp)}`);
      // Show top 3 outlier values.
      if (values.length) {
        const sorted = [...values].sort((a, b) => b - a);
        console.log(`    top values: ${sorted.slice(0, 5).join(', ')}`);
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
