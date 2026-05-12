import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const getServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role env vars missing.');
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
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

const emptyOk = () =>
  NextResponse.json(
    { analysis: null, stale: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const submissionId = url.searchParams.get('submissionId');
    if (!submissionId) {
      return NextResponse.json(
        { error: { code: 'KEEPA_PUBLIC_BAD_REQUEST', message: 'Missing submissionId.' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabase = getServiceClient();

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select('id, user_id, research_products_id, is_public')
      .eq('id', submissionId)
      .maybeSingle();

    if (submissionError) {
      console.error('Public Keepa analysis: submission lookup error', submissionError);
      return NextResponse.json(
        { error: { code: 'KEEPA_PUBLIC_LOOKUP_FAILED', message: 'Failed to load submission.' } },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (!submission || !submission.is_public) {
      // Don't leak whether the submission exists — treat private/missing
      // identically. KeepaSignalsHub will render the "not yet generated"
      // empty state for either case.
      return emptyOk();
    }

    // product_id in keepa_analysis is text. It was written as either the
    // research_products_id (preferred — VettingDetailContent path) or the
    // submission_id (legacy fallback). Try both, ordered most-recent first.
    const candidateIds = Array.from(
      new Set(
        [submission.research_products_id, submission.id]
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      )
    );
    if (candidateIds.length === 0) return emptyOk();

    const { data, error } = await supabase
      .from('keepa_analysis')
      .select(
        'product_id, updated_at, stale_after, window_months, competitors_asins, analysis_json, normalized_series_json, computed_metrics_json'
      )
      .eq('user_id', submission.user_id)
      .in('product_id', candidateIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Public Keepa analysis: query error', error);
      return NextResponse.json(
        { error: { code: 'KEEPA_PUBLIC_LOAD_FAILED', message: 'Failed to load Market Climate.' } },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (!data) return emptyOk();

    const computed = resolveComputed(
      (data as any).analysis_json ?? null,
      data.window_months ?? null,
      (data as any).computed_metrics_json ?? null
    );
    if (!computed) return emptyOk();

    const staleAfter = data.stale_after ? new Date(data.stale_after).getTime() : 0;
    const isStale = staleAfter > 0 ? staleAfter < Date.now() : true;
    const windowMonths = Number(computed.windowMonths ?? data.window_months ?? 24);

    return NextResponse.json(
      {
        analysis: {
          productId: data.product_id,
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
    console.error('Public Keepa analysis GET error:', error);
    return NextResponse.json(
      { error: { code: 'KEEPA_PUBLIC_LOAD_FAILED', message: 'Failed to load Market Climate.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
