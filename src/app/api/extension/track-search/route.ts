// =============================================================================
// POST /api/extension/track-search
// =============================================================================
// Records one Bloom Lens search event in the existing usage_events
// table. The extension fires this when the drawer opens on a fresh
// Amazon search-results URL — per-URL dedup is done client-side, so
// this route just persists what it's told.
//
// Counts produced here are read back by /api/extension/me to drive the
// 5/month Free-tier cap.
//
// Auth: Authorization: Bearer <ext_token>
//
// Request body:
//   { asinCount: number, query: string | null }
//
// Response 200: { ok: true }
// Response 401: token invalid
// Response 400: invalid body

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 405 });
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveExtensionToken(request);
    if (!resolved) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      );
    }

    const body = await request.json().catch(() => ({}));
    const asinCount =
      typeof body?.asinCount === 'number' && Number.isFinite(body.asinCount)
        ? Math.max(0, Math.floor(body.asinCount))
        : null;
    const query = typeof body?.query === 'string' ? body.query.slice(0, 500) : null;

    if (asinCount === null) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    const { error } = await supabaseAdmin.from('usage_events').insert({
      user_id: resolved.userId,
      provider: 'extension',
      operation: 'lens_search',
      status: 'ok',
      metadata: { asinCount, query, ts: new Date().toISOString() },
    });

    if (error) {
      console.error('extension/track-search insert failed:', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Insert failed' }, { status: 500 })
      );
    }

    return extensionResponse(request, { ok: true }, resolved);
  } catch (err) {
    console.error('extension/track-search crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
