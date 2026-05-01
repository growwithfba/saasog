// =============================================================================
// GET /api/extension/me
// OPTIONS /api/extension/me
// =============================================================================
// Single source of truth for "who am I and what can I do" inside the
// extension. Called on popup open, on tab focus, and after a sign-in.
//
// Auth: Authorization: Bearer <ext_token>
//
// Response 200:
//   {
//     user: { id, email, name },
//     plan: { tier: 'free'|'core'|'pro', status, type, trialEndsAt? },
//     features: { canExportCsv, canSaveFunnel, canVetMarket, searchesPerMonth },
//     searchesUsedThisMonth: <int>
//   }
//
// Response 401: token missing / expired / revoked.
// Response headers: x-bloomengine-ext-token-refresh: <new raw token>
//   when the server silently rotates the bearer (see extensionAuth.ts).

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

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveExtensionToken(request);
    if (!resolved) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      );
    }

    // Fetch the user (auth.users) + their profile row in parallel.
    const [{ data: userResp }, { data: profile }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(resolved.userId),
      supabaseAdmin
        .from('profiles')
        .select('subscription_status, subscription_type, full_name')
        .eq('id', resolved.userId)
        .maybeSingle(),
    ]);

    if (!userResp?.user) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'User not found' }, { status: 401 })
      );
    }

    const tier = deriveLensTier(
      profile?.subscription_status ?? null,
      profile?.subscription_type ?? null
    );
    const features = lensFeatures(tier);

    // Searches-this-month counter is stubbed at 0 for now. Phase 5.4-B
    // will track this in a usage_events row written each time the
    // extension scrapes a fresh Amazon SERP for a free-tier user.
    const searchesUsedThisMonth = 0;

    const body = {
      user: {
        id: userResp.user.id,
        email: userResp.user.email,
        name:
          profile?.full_name ??
          userResp.user.user_metadata?.full_name ??
          userResp.user.user_metadata?.name ??
          userResp.user.email?.split('@')[0] ??
          'User',
      },
      plan: {
        tier,
        status: profile?.subscription_status ?? null,
        type: profile?.subscription_type ?? null,
      },
      features,
      searchesUsedThisMonth,
      tokenExpiresAt: resolved.expiresAt,
    };

    return extensionResponse(request, body, resolved);
  } catch (err) {
    console.error('extension/me crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
