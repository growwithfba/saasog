import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { fetchAsinSnapshot } from '@/lib/keepa/asinSnapshot';
import { mapSnapshotToResearch } from '@/lib/keepa/mapSnapshotToResearch';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const sanitizeAsin = (asin: string) => asin.replace(/[^A-Z0-9]/gi, '').toUpperCase();

/**
 * POST /api/research/add-asin
 * Body: { asin: string, preview?: boolean }
 *
 * - Validates the ASIN.
 * - Fetches a Keepa snapshot for that ASIN.
 * - If preview=true, returns the mapped research row WITHOUT inserting
 *   (so the UI can show what got pulled before the user confirms).
 * - Otherwise, dedupes against the user's existing research_products and
 *   inserts. Returns the new row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawAsin = typeof body?.asin === 'string' ? body.asin : '';
    const asin = sanitizeAsin(rawAsin);
    const preview = body?.preview === true;

    if (!ASIN_REGEX.test(asin)) {
      return NextResponse.json(
        { success: false, error: 'ASIN must be 10 alphanumeric characters.' },
        { status: 400 }
      );
    }

    // Authenticate — match the pattern used by /api/research.
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

    // Fetch snapshot from Keepa (server-side; key stays private).
    let snapshot;
    try {
      snapshot = await fetchAsinSnapshot(asin, { userId: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Keepa lookup failed.';
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const insert = mapSnapshotToResearch(snapshot, user.id);

    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        snapshot,
        insert,
      });
    }

    // Dedup against user's existing research_products by ASIN.
    const { data: existing } = await serverSupabase
      .from('research_products')
      .select('id, asin')
      .eq('user_id', user.id)
      .eq('asin', asin)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'You already have this ASIN in your research funnel.',
          existing_id: existing.id,
        },
        { status: 409 }
      );
    }

    const { data: created, error: insertError } = await serverSupabase
      .from('research_products')
      .insert(insert)
      .select()
      .single();

    if (insertError) {
      console.error('add-asin insert error:', insertError);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: created, snapshot }, { status: 201 });
  } catch (err) {
    console.error('add-asin route error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to add ASIN' },
      { status: 500 }
    );
  }
}
