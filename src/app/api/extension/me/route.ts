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
//     searchesUsedThisMonth: <int>,
//     searchLimitReached: boolean   // only true on Free tier when count >= cap
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
import { readLensPrefs } from '@/lib/extensionLensPrefs';

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

    // Month-to-date boundary in UTC. Resets the counter at the start
    // of every calendar month (server time). Free users see the new
    // 5-search budget the moment the month rolls over.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    // Fetch the user, their profile, the month-to-date Lens search
    // count, and lens prefs in parallel.
    const [{ data: userResp }, { data: profile }, searchCountResp, lens] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(resolved.userId),
      supabaseAdmin
        .from('profiles')
        .select('subscription_status, subscription_type, full_name')
        .eq('id', resolved.userId)
        .maybeSingle(),
      supabaseAdmin
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', resolved.userId)
        .eq('provider', 'extension')
        .eq('operation', 'lens_search')
        .gte('created_at', monthStart.toISOString()),
      readLensPrefs(resolved.userId),
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

    const searchesUsedThisMonth = searchCountResp.count ?? 0;
    const searchLimitReached =
      features.searchesPerMonth !== null &&
      searchesUsedThisMonth >= features.searchesPerMonth;

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
      searchLimitReached,
      tokenExpiresAt: resolved.expiresAt,
      lens,
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
