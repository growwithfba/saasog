// =============================================================================
// GET /api/extension/markets
// =============================================================================
// Powers the "Add to existing market" picker in the Lens drawer's
// Analyze Market modal. Returns every submissions row for the signed-in
// user — both pre-vet (score IS NULL, draft state) and vetted markets —
// sorted by recent activity. Drafts and vetted markets coexist in one
// list; the drawer shows a numeric score badge or a "Pre-vet" badge per
// row based on whether `score` is null.
//
// Per Dave's call (2026-05-02): no cap, no filter — users should be
// able to add competitors to anything they've previously created.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (Free has canVetMarket=false and never sees this).
//
// Response 200:
//   {
//     ok: true,
//     markets: [
//       {
//         id: string,
//         title: string,
//         score: number | null,
//         status: 'PASS' | 'RISKY' | 'FAIL' | null,
//         competitorCount: number,
//         updatedAt: string  // ISO
//       }, ...
//     ]
//   }

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
          { ok: false, error: 'Analyze Market requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
        )
      );
    }

    // Pull just the columns the picker needs. submission_data can be
    // large (full competitor lists, original CSVs), so we count
    // competitors via the metrics column when present and fall back to
    // a length read from submission_data only if metrics is empty.
    const { data: rows, error } = await supabaseAdmin
      .from('submissions')
      .select('id, title, product_name, score, status, metrics, submission_data, updated_at, created_at')
      .eq('user_id', resolved.userId)
      .order('updated_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('extension/markets query failed:', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    const markets = (rows ?? []).map((r) => {
      const metricsCount =
        typeof r.metrics?.totalCompetitors === 'number' ? r.metrics.totalCompetitors : null;
      const fallbackCount = Array.isArray(r.submission_data?.productData?.competitors)
        ? r.submission_data.productData.competitors.length
        : 0;
      return {
        id: r.id,
        title: r.product_name || r.title || 'Untitled market',
        score: typeof r.score === 'number' ? r.score : null,
        status: r.status ?? null,
        competitorCount: metricsCount ?? fallbackCount,
        updatedAt: r.updated_at ?? r.created_at,
      };
    });

    return extensionResponse(request, { ok: true, markets }, resolved);
  } catch (err) {
    console.error('extension/markets crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
