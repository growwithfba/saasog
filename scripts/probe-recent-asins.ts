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
  const { data, error } = await supabase
    .from('keepa_analysis')
    .select('product_id, updated_at, competitors_asins, normalized_series_json')
    .order('updated_at', { ascending: false })
    .limit(2);
  if (error) throw error;
  for (const row of data || []) {
    console.log('--- product', row.product_id, '@', row.updated_at);
    console.log('asins:', row.competitors_asins);
    const competitors = (row as any).normalized_series_json?.competitors || [];
    for (const c of competitors) {
      console.log('  competitor', c.asin, 'imageUrl:', c.imageUrl, 'title:', String(c.title).slice(0, 60));
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
