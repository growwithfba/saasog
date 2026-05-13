/**
 * POST /api/submissions/[id]/refresh-market-data
 *
 * Re-hydrates every competitor in a vetting submission from Keepa via
 * the shared `hydrateCompetitorsFromKeepa` module. Replaces stored
 * SERP-DOM-sourced fields with Keepa values. Preserves the per-ASIN
 * `sponsored` boolean from the existing competitor records (Keepa
 * cannot detect sponsored placement).
 *
 * This is the user-facing fix for legacy submissions that hold bogus
 * SERP-scraped values (e.g. the 15,343-review B0GBX8QY64 case from
 * 2026-05-12). Users click "Refresh Market Data" on the vetting page,
 * the competitor list re-hydrates, bad numbers become N/A or accurate.
 *
 * Daily cap: 10 refreshes/day per user (Core + Pro alike). Token cost
 * scales with competitor count; cap prevents runaway burn.
 *
 * Calibration math (BSR curve, parent attribution, variation cap) is
 * unchanged — only the INPUT data source moves from SERP-DOM to Keepa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { hydrateCompetitorsFromKeepa } from '@/lib/keepa/hydrateCompetitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAILY_REFRESH_CAP = 10;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const submissionId = params.id;
    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'Submission ID is required' },
        { status: 400 }
      );
    }

    // --- Auth ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // --- Load submission ---
    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const submissionData = (submission.submission_data ?? {}) as any;
    const productData = (submissionData.productData ?? {}) as any;
    const existingCompetitors: any[] = Array.isArray(productData.competitors)
      ? productData.competitors
      : [];

    if (existingCompetitors.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No competitors in this market to refresh' },
        { status: 400 }
      );
    }

    // --- Daily cap check ---
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: refreshesToday } = await supabaseAdmin
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('operation', 'market_refresh')
      .gte('created_at', oneDayAgo);

    if ((refreshesToday ?? 0) >= DAILY_REFRESH_CAP) {
      return NextResponse.json(
        {
          success: false,
          error: `You've used all ${DAILY_REFRESH_CAP} market data refreshes for the day. Try again in 24 hours.`,
          cap: { used: refreshesToday, limit: DAILY_REFRESH_CAP },
        },
        { status: 429 }
      );
    }

    // --- Extract ASINs + preserve sponsored flags from existing data ---
    const asins: string[] = [];
    const sponsoredMap = new Map<string, boolean>();
    const existingByAsin = new Map<string, any>();
    const lensMetadataByAsin = new Map<string, { __lens_origin?: boolean; __lens_new?: boolean; __lens_added_at?: string }>();

    for (const c of existingCompetitors) {
      if (!c || typeof c.asin !== 'string') continue;
      const asin = c.asin.toUpperCase();
      if (!ASIN_REGEX.test(asin)) continue;
      asins.push(asin);
      existingByAsin.set(asin, c);
      // Preserve sponsored — Keepa cannot tell us this. If extension
      // didn't supply it originally, keep null (unknown).
      if (typeof c.sponsored === 'boolean') {
        sponsoredMap.set(asin, c.sponsored);
      } else if (typeof c.__lens_sponsored === 'boolean') {
        sponsoredMap.set(asin, c.__lens_sponsored);
      }
      // Preserve Lens-origin markers so the matrix still highlights
      // newly-expanded rows after the refresh.
      if (c.__lens_origin || c.__lens_new) {
        lensMetadataByAsin.set(asin, {
          __lens_origin: c.__lens_origin,
          __lens_new: c.__lens_new,
          __lens_added_at: c.__lens_added_at,
        });
      }
    }

    if (asins.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid ASINs found in competitor list' },
        { status: 400 }
      );
    }

    // --- Hydrate ---
    let hydrated;
    try {
      hydrated = await hydrateCompetitorsFromKeepa(asins, {
        sponsoredAsins: sponsoredMap,
        userId,
      });
    } catch (err) {
      console.error('refresh-market-data: Keepa hydration failed', err);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch fresh data from Keepa. Try again in a moment.' },
        { status: 502 }
      );
    }

    // --- Build refreshed competitor list ---
    const refreshedCompetitors = asins.map((asin) => {
      const fresh = hydrated.get(asin);
      const existing = existingByAsin.get(asin);
      const lensMeta = lensMetadataByAsin.get(asin) ?? {};

      // If Keepa returned no data for this ASIN, keep the existing
      // record (don't blank it out). The lens metadata + sponsored
      // flag survive on the existing record.
      if (!fresh) {
        return existing;
      }

      // Keep ASIN identity + Lens markers; everything else from Keepa.
      return {
        ...fresh,
        ...lensMeta,
      };
    });

    // --- Recompute metrics ---
    const totalRevenue = refreshedCompetitors.reduce(
      (sum: number, c: any) => sum + (typeof c?.monthlyRevenue === 'number' ? c.monthlyRevenue : 0),
      0,
    );
    const newMetrics = {
      totalCompetitors: refreshedCompetitors.length,
      totalMarketCap: totalRevenue,
      revenuePerCompetitor:
        refreshedCompetitors.length > 0 ? totalRevenue / refreshedCompetitors.length : 0,
    };

    const nowIso = new Date().toISOString();

    // --- Persist ---
    const updatedSubmissionData = {
      ...submissionData,
      productData: {
        ...productData,
        competitors: refreshedCompetitors,
      },
      __keepa_hydrated: true,
      __keepa_last_refreshed_at: nowIso,
    };

    const { error: updateError } = await supabaseAdmin
      .from('submissions')
      .update({
        submission_data: updatedSubmissionData,
        metrics: newMetrics,
        updated_at: nowIso,
      })
      .eq('id', submissionId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('refresh-market-data: submission update failed', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to save refreshed data' },
        { status: 500 }
      );
    }

    // --- Log usage event for daily cap counting ---
    await supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      operation: 'market_refresh',
      metadata: {
        submissionId,
        competitorsRefreshed: refreshedCompetitors.length,
        asinsHydrated: Array.from(hydrated.keys()),
      },
    });

    return NextResponse.json({
      success: true,
      refreshedCount: refreshedCompetitors.length,
      hydratedFromKeepa: hydrated.size,
      preservedAsIs: refreshedCompetitors.length - hydrated.size,
      metrics: newMetrics,
      remainingToday: DAILY_REFRESH_CAP - (refreshesToday ?? 0) - 1,
    });
  } catch (err) {
    console.error('refresh-market-data crashed:', err);
    return NextResponse.json(
      { success: false, error: 'Unexpected error' },
      { status: 500 }
    );
  }
}
