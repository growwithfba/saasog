/**
 * Probe: scan the most-recent normalized snapshot for `-1` runs in
 * buyBoxShipping and confirm the new detector logic finds them. We replicate
 * the detector inline so we can compare against what's stored.
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

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from('keepa_analysis')
    .select('product_id, updated_at, normalized_series_json')
    .order('updated_at', { ascending: false })
    .limit(3);
  if (error) throw error;
  const nowMs = Date.now();
  for (const row of data || []) {
    console.log('--- product', row.product_id);
    const competitors = (row as any).normalized_series_json?.competitors || [];
    for (const c of competitors) {
      console.log('  series keys:', Object.keys(c.series || {}).map(k => `${k}:${(c.series[k]||[]).length || ''}`).join(' '));
      const series = c.series?.buyBoxShipping || [];
      const minusOnePoints = series.filter((p: any) => p.value === -1);
      // Replicate the new detector
      let runStart: number | null = null;
      const runs: Array<{ start: number; end: number; days: number }> = [];
      for (const p of series) {
        if (p.value === -1) {
          if (runStart === null) runStart = p.timestamp;
        } else if (p.value !== null && runStart !== null) {
          const days = Math.max(1, Math.round((p.timestamp - runStart) / DAY_MS));
          if (days >= 2) runs.push({ start: runStart, end: p.timestamp, days });
          runStart = null;
        }
      }
      if (runStart !== null) {
        const days = Math.max(1, Math.round((nowMs - runStart) / DAY_MS));
        if (days >= 2) runs.push({ start: runStart, end: nowMs, days });
      }
      console.log(
        `  ${c.asin} (${(c.title || '').slice(0, 40)}): ${series.length} pts, ${minusOnePoints.length} -1 events, ${runs.length} stockout runs:`,
        runs.map(r => `${r.days}d`).join(', ')
      );
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
