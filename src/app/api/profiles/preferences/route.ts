import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Per-user UI preferences shim. profiles.preferences is a JSONB blob
// (see migration 20260426170000_add_preferences_to_profiles.sql).
//
//   GET   → { success: true, preferences: object }
//   PATCH → body: { preferences: Record<string, unknown> }
//             Shallow-merges the keys provided into the stored object;
//             null values delete the key.
//
// Both read and write are gated on the authenticated user matching
// the profiles row id (RLS already enforces that — this is a
// belt-and-suspenders check).

async function getSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  const supabase = token
    ? createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
    : createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    preferences: (data?.preferences as Record<string, unknown> | null) ?? {},
  });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const incoming = body?.preferences;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return NextResponse.json(
      { success: false, error: 'preferences must be an object.' },
      { status: 400 }
    );
  }

  // Read-modify-write — RLS prevents touching anyone else's row.
  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
  }

  const next: Record<string, unknown> = { ...((current?.preferences as Record<string, unknown> | null) ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ preferences: next })
    .eq('id', user.id);
  if (writeError) {
    return NextResponse.json({ success: false, error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, preferences: next });
}
