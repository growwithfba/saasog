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
 * POST /api/research/[id]/tags
 * Body: { tagId?: string, tagName?: string }
 *
 * Attach a tag to a research product. If tagName is provided and the
 * user doesn't already own a tag with that name, it's created first
 * (atomic convenience — no need for two calls from the UI).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the product belongs to the user before attaching.
  const { data: product } = await supabase
    .from('research_products')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!product) {
    return NextResponse.json({ success: false, error: 'Product not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  let tagId: string | null = typeof body?.tagId === 'string' ? body.tagId : null;
  const rawName = typeof body?.tagName === 'string' ? body.tagName.trim() : '';

  if (!tagId && rawName) {
    if (rawName.length > 40) {
      return NextResponse.json({ success: false, error: 'Tag name must be 40 characters or fewer.' }, { status: 400 });
    }
    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', rawName)
      .maybeSingle();
    if (existing) {
      tagId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('tags')
        .insert({ user_id: user.id, name: rawName })
        .select('id')
        .single();
      if (createErr) {
        return NextResponse.json({ success: false, error: createErr.message }, { status: 500 });
      }
      tagId = created!.id;
    }
  }

  if (!tagId) {
    return NextResponse.json({ success: false, error: 'Provide tagId or tagName.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('product_tags')
    .upsert(
      { research_product_id: params.id, tag_id: tagId, user_id: user.id },
      { onConflict: 'research_product_id,tag_id' }
    );
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tagId });
}

/**
 * DELETE /api/research/[id]/tags?tagId=<uuid>
 * Detach a tag from a research product.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tagId = url.searchParams.get('tagId');
  if (!tagId) {
    return NextResponse.json({ success: false, error: 'tagId required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('product_tags')
    .delete()
    .eq('research_product_id', params.id)
    .eq('tag_id', tagId)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
