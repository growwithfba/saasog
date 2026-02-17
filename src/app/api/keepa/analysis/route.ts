import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';

export const dynamic = 'force-dynamic';

const getSupabaseClient = (token?: string | null) => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are missing.');
  }
  if (token) {
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }
  return createClient();
};

const resolveComputed = (
  analysisJson: Record<string, any> | null,
  fallbackWindowMonths: number | null,
  legacyComputed: Record<string, any> | null
) => {
  if (analysisJson && typeof analysisJson === 'object') {
    const meta = analysisJson.meta && typeof analysisJson.meta === 'object' ? analysisJson.meta : null;
    const { meta: _meta, ...rest } = analysisJson;
    const windowMonths = Number(meta?.windowMonths ?? fallbackWindowMonths ?? rest.windowMonths ?? 24);
    return { windowMonths, ...rest };
  }
  if (legacyComputed && typeof legacyComputed === 'object') {
    const windowMonths = Number(legacyComputed.windowMonths ?? fallbackWindowMonths ?? 24);
    return { windowMonths, ...legacyComputed };
  }
  return null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');
    if (!productId) {
      return NextResponse.json(
        { error: { code: 'KEEPA_ANALYSIS_BAD_REQUEST', message: 'Missing productId.' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
    const supabase = getSupabaseClient(token);
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return NextResponse.json(
        { error: { code: 'KEEPA_ANALYSIS_UNAUTHORIZED', message: 'Unauthorized. Please log in.' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data, error } = await supabase
      .from('keepa_analysis')
      .select(
        'updated_at, stale_after, window_months, competitors_asins, analysis_json, normalized_series_json, computed_metrics_json'
      )
      .eq('user_id', userData.user.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (error) {
      console.error('Keepa analysis query error:', error);
      return NextResponse.json(
        { error: { code: 'KEEPA_ANALYSIS_LOAD_FAILED', message: 'Failed to load Keepa Signals.' } },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!data) {
      return NextResponse.json(
        { analysis: null, stale: true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const computed = resolveComputed(
      (data as any).analysis_json ?? null,
      data.window_months ?? null,
      (data as any).computed_metrics_json ?? null
    );
    if (!computed) {
      return NextResponse.json(
        { analysis: null, stale: true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const staleAfter = data.stale_after ? new Date(data.stale_after).getTime() : 0;
    const isStale = staleAfter > 0 ? staleAfter < Date.now() : true;
    const windowMonths = Number(computed.windowMonths ?? data.window_months ?? 24);

    return NextResponse.json(
      {
        analysis: {
          productId,
          updatedAt: data.updated_at,
          staleAfter: data.stale_after,
          windowMonths,
          competitorsAsins: data.competitors_asins ?? [],
          normalized: data.normalized_series_json ?? null,
          computed
        },
        stale: isStale
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Keepa analysis GET error:', error);
    return NextResponse.json(
      { error: { code: 'KEEPA_ANALYSIS_LOAD_FAILED', message: 'Failed to load Keepa Signals.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
