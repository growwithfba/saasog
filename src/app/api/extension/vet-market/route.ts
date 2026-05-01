// =============================================================================
// POST /api/extension/vet-market
// =============================================================================
// Stub for Phase 5.4-A. Validates the bearer token and gates on the
// canVetMarket feature flag, but does not yet kick off a real vetting
// run. A later phase will queue this against the existing vetting
// pipeline (src/lib/vetting/).
//
// Request:
//   POST /api/extension/vet-market
//   Authorization: Bearer <ext_token>
//   Body: { name: string, asins: string[], scrapedRows: object[] }
//
// Response 202: { marketId: string, status: 'queued' }
// Response 401 / 403 / 400 / 500 same as save-funnel.

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
    if (!lensFeatures(tier).canVetMarket) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Vet This Market requires a Core or Pro plan', upgradeUrl: '/upgrade' },
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

    // STUB: real queueing comes in a later phase.
    const marketId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return extensionResponse(
      request,
      { ok: true, marketId, status: 'queued', stub: true },
      resolved,
      { status: 202 }
    );
  } catch (err) {
    console.error('extension/vet-market crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
