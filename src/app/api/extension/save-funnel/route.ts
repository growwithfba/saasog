// =============================================================================
// POST /api/extension/save-funnel
// =============================================================================
// Stub for Phase 5.4-A. Validates the bearer token and gates on the
// canSaveFunnel feature flag, but does not yet persist the funnel.
//
// Real implementation in a later phase will write to a `lens_funnels`
// table with the scraped rows + name + user_id.
//
// Request:
//   POST /api/extension/save-funnel
//   Authorization: Bearer <ext_token>
//   Body: { name: string, asins: string[], scrapedRows: object[] }
//
// Response 200: { funnelId: string }
// Response 401: token invalid
// Response 403: tier doesn't allow Save to Funnel
// Response 400: invalid body

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  deriveLensTier,
  extensionResponse,
  lensFeatures,
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, subscription_type')
      .eq('id', resolved.userId)
      .maybeSingle();

    const tier = deriveLensTier(
      profile?.subscription_status ?? null,
      profile?.subscription_type ?? null
    );
    if (!lensFeatures(tier).canSaveFunnel) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Save to Funnel requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body || typeof body.name !== 'string' || !Array.isArray(body.asins)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    // STUB: real persistence comes in a later phase.
    const funnelId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return extensionResponse(request, { ok: true, funnelId, stub: true }, resolved);
  } catch (err) {
    console.error('extension/save-funnel crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
