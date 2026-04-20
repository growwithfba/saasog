import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { fetchAsinSnapshot } from '@/lib/keepa/asinSnapshot';
import { mapSnapshotToResearch } from '@/lib/keepa/mapSnapshotToResearch';

/**
 * POST /api/research/[id]/refresh
 *
 * Re-pulls a fresh Keepa snapshot for the product and merges it into
 * the existing row. Fields the snapshot sets to null (pending fields
 * Keepa cannot deliver) are NOT written, so any values a Helium 10
 * CSV previously filled in stay intact. This is the "come back in
 * three months for updated data" path.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Auth (mirrors the pattern used across the other /api/research routes).
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const serverSupabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Look up the row to get its ASIN and current state.
    const { data: existing, error: fetchErr } = await serverSupabase
      .from('research_products')
      .select('id, asin, extra_data, title, brand, category, price, monthly_revenue, monthly_units_sold')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: 'Database error: ' + fetchErr.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found.' }, { status: 404 });
    }
    if (!existing.asin) {
      return NextResponse.json({ success: false, error: 'Product has no ASIN to refresh.' }, { status: 400 });
    }

    // Fetch a fresh Keepa snapshot.
    let snapshot;
    try {
      snapshot = await fetchAsinSnapshot(existing.asin, { userId: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Keepa lookup failed.';
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const mapped = mapSnapshotToResearch(snapshot, user.id);

    // Merge rule for dedicated columns: use the new value when the
    // snapshot returned a non-null value; otherwise keep the existing.
    // Avoids wiping a H10-supplied price/title on a Keepa miss.
    const mergedTop: Record<string, any> = {
      title: mapped.title ?? existing.title,
      brand: mapped.brand ?? existing.brand,
      category: mapped.category ?? existing.category,
      price: mapped.price ?? existing.price,
      monthly_revenue: mapped.monthly_revenue ?? existing.monthly_revenue,
      monthly_units_sold: mapped.monthly_units_sold ?? existing.monthly_units_sold,
      updated_at: new Date().toISOString(),
    };

    // Merge rule for extra_data: start with whatever was there (H10,
    // prior snapshots, user edits). Overlay every new field that has
    // a non-null value. Preserve null values in the existing row.
    const oldExtra = (existing.extra_data as Record<string, unknown>) || {};
    const newExtra = mapped.extra_data;
    const mergedExtra: Record<string, unknown> = { ...oldExtra };
    for (const [key, value] of Object.entries(newExtra)) {
      if (value === null || value === undefined) continue;
      mergedExtra[key] = value;
    }
    // The snapshot's provenance fields should always refresh.
    mergedExtra.__source = newExtra.__source;
    mergedExtra.__fetched_at = newExtra.__fetched_at;
    mergedExtra.__pending_sources = newExtra.__pending_sources;

    const { data: updated, error: updateErr } = await serverSupabase
      .from('research_products')
      .update({ ...mergedTop, extra_data: mergedExtra })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (updateErr) {
      return NextResponse.json(
        { success: false, error: 'Database error: ' + updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updated, snapshot });
  } catch (err) {
    console.error('refresh route error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to refresh' },
      { status: 500 }
    );
  }
}
