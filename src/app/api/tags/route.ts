import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Authenticate the request and return a Supabase client scoped to the user.
 * Mirrors the pattern used by other /api routes in this repo.
 */
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
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user, error };
}

/**
 * GET /api/tags
 * List the authenticated user's tags, each with a usage count.
 */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data: tags, error } = await supabase
    .from('tags')
    .select('id, name, color, created_at')
    .eq('user_id', user.id)
    .order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const { data: links } = await supabase
    .from('product_tags')
    .select('tag_id')
    .eq('user_id', user.id);
  const counts = new Map<string, number>();
  (links || []).forEach((l: any) => counts.set(l.tag_id, (counts.get(l.tag_id) || 0) + 1));

  return NextResponse.json({
    success: true,
    tags: (tags || []).map((t: any) => ({ ...t, usage_count: counts.get(t.id) || 0 })),
  });
}

/**
 * POST /api/tags
 * Body: { name: string, color?: string }
 * Creates a new tag, or returns the existing one if the user already has
 * a tag with that name (case-insensitive).
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  const color = typeof body?.color === 'string' ? body.color : null;
  if (!rawName) {
    return NextResponse.json({ success: false, error: 'Tag name is required.' }, { status: 400 });
  }
  if (rawName.length > 40) {
    return NextResponse.json({ success: false, error: 'Tag name must be 40 characters or fewer.' }, { status: 400 });
  }

  // Idempotent: return existing tag if user already has one with this name.
  const { data: existing } = await supabase
    .from('tags')
    .select('id, name, color, created_at')
    .eq('user_id', user.id)
    .ilike('name', rawName)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, tag: existing, created: false });
  }

  const { data: inserted, error } = await supabase
    .from('tags')
    .insert({ user_id: user.id, name: rawName, color })
    .select('id, name, color, created_at')
    .single();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tag: inserted, created: true }, { status: 201 });
}
