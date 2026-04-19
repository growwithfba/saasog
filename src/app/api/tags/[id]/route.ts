import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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

/**
 * DELETE /api/tags/[id]
 * Removes the tag and (via ON DELETE CASCADE) all product_tags links.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/tags/[id]
 * Body: { name?: string, color?: string }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ success: false, error: 'Tag name cannot be empty.' }, { status: 400 });
    }
    if (trimmed.length > 40) {
      return NextResponse.json({ success: false, error: 'Tag name must be 40 characters or fewer.' }, { status: 400 });
    }
    update.name = trimmed;
  }
  if (typeof body?.color === 'string' || body?.color === null) {
    update.color = body.color;
  }

  const { data, error } = await supabase
    .from('tags')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id, name, color, created_at')
    .single();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tag: data });
}
