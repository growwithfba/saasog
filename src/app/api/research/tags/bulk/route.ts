import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// POST /api/research/tags/bulk
//
// Body:
//   {
//     researchProductIds: string[],
//     action: 'add' | 'remove',
//     tagId?: string,
//     tagName?: string  // ignored when action='remove'; used for action='add' if tagId absent
//   }
//
// Add: ensures the tag exists (creating it from tagName if needed) and
// upserts product_tags rows for every research_product_id. Idempotent
// per row via the (research_product_id, tag_id) unique key.
//
// Remove: deletes any product_tags rows matching the given tagId across
// the supplied research_product_ids.
//
// All operations are user-scoped through RLS plus an explicit
// user_id eq filter (belt-and-suspenders, mirroring the per-product
// route).

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

export async function POST(request: NextRequest) {
  const { supabase, user } = await getSupabaseForRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const ids: string[] = Array.isArray(body?.researchProductIds)
    ? body.researchProductIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
    : [];

  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json(
      { success: false, error: "action must be 'add' or 'remove'." },
      { status: 400 }
    );
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: 'researchProductIds must be a non-empty array.' },
      { status: 400 }
    );
  }

  let tagId: string | null = typeof body?.tagId === 'string' ? body.tagId : null;
  const rawName: string =
    typeof body?.tagName === 'string' ? body.tagName.trim() : '';

  // Resolve tagId for action='add' when only a name was supplied.
  if (action === 'add' && !tagId) {
    if (!rawName) {
      return NextResponse.json(
        { success: false, error: 'Provide tagId or tagName.' },
        { status: 400 }
      );
    }
    if (rawName.length > 40) {
      return NextResponse.json(
        { success: false, error: 'Tag name must be 40 characters or fewer.' },
        { status: 400 }
      );
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
    return NextResponse.json({ success: false, error: 'tagId required.' }, { status: 400 });
  }

  // Verify ownership of the supplied product ids — RLS already blocks
  // foreign rows, but we want a clean 404 message vs a silent 0-row
  // result.
  const { data: ownedRows } = await supabase
    .from('research_products')
    .select('id')
    .eq('user_id', user.id)
    .in('id', ids);
  const ownedIds = (ownedRows || []).map((r: any) => r.id as string);
  if (ownedIds.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No matching products found for this user.' },
      { status: 404 }
    );
  }

  if (action === 'add') {
    const rows = ownedIds.map((rpid) => ({
      research_product_id: rpid,
      tag_id: tagId!,
      user_id: user.id,
    }));
    const { error } = await supabase
      .from('product_tags')
      .upsert(rows, { onConflict: 'research_product_id,tag_id' });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, tagId, affected: ownedIds.length });
  }

  // action === 'remove'
  const { error: delErr } = await supabase
    .from('product_tags')
    .delete()
    .eq('user_id', user.id)
    .eq('tag_id', tagId)
    .in('research_product_id', ownedIds);
  if (delErr) {
    return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tagId, affected: ownedIds.length });
}
