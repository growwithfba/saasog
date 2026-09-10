import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { HydratedRow } from '@/lib/discovery/types';
import { hydrateAsins, sanitizeAsins } from '@/lib/discovery/hydrateAsins.server';

/**
 * Largest page the UI offers. Each row costs 2 provider tokens to hydrate, so
 * a full 300-row page is ~600 tokens — the client warns before spending that.
 * hydrateAsins chunks these into the provider's 100-per-call limit.
 */
const MAX_ASINS_PER_REQUEST = 300;

/**
 * Stage B of Discovery's search.
 *
 * Stage A (/api/discovery/search) returns a large ASIN list for one flat-rate
 * call. This route resolves display data for only the rows actually on screen,
 * because that is the part that costs per row. See hydrateAsins for the cache
 * and cost rules — they are shared with /api/discovery/variations.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requested = sanitizeAsins(body?.asins, MAX_ASINS_PER_REQUEST);
    if (requested.length === 0) {
      return NextResponse.json({ success: true, rows: [] });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // The cache is a system table with RLS and no policies — service role only.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { rows: byAsin, failed } = await hydrateAsins(admin, requested);
    if (failed) {
      return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 502 });
    }

    // Preserve the caller's ordering — it is the sorted search order.
    const rows = requested.map((a) => byAsin.get(a)).filter(Boolean) as HydratedRow[];
    return NextResponse.json({ success: true, rows });
  } catch (err) {
    console.error('[discovery/hydrate] unexpected', err);
    return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 500 });
  }
}
