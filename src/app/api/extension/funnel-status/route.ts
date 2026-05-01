// =============================================================================
// POST /api/extension/funnel-status
// =============================================================================
// Returns which of the requested ASINs are already in the user's
// research funnel (the existing research_products table). The drawer
// uses this to flip the per-row and bulk "Save to Funnel" buttons to
// "Saved to Funnel" without the user having to remember.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: any (signed-in user; check is whether ASINs exist for THIS
// user, not a tier gate).
//
// Request:
//   POST /api/extension/funnel-status
//   { asins: string[] }       // 10-char alphanumeric, max 200 per call
//
// Response 200:
//   { ok: true, savedAsins: string[] }   // subset already in funnel

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const MAX_ASINS_PER_REQUEST = 200;

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
    if (!body || !Array.isArray(body.asins)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    const requested = (body.asins as unknown[])
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.toUpperCase())
      .filter((a) => ASIN_REGEX.test(a))
      .slice(0, MAX_ASINS_PER_REQUEST);

    if (requested.length === 0) {
      return extensionResponse(
        request,
        { ok: true, savedAsins: [] as string[] },
        resolved
      );
    }

    const { data, error } = await supabaseAdmin
      .from('research_products')
      .select('asin')
      .eq('user_id', resolved.userId)
      .in('asin', requested);

    if (error) {
      console.error('funnel-status query failed:', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    const savedAsins = (data ?? []).map((r) => r.asin);

    return extensionResponse(request, { ok: true, savedAsins }, resolved);
  } catch (err) {
    console.error('extension/funnel-status crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
