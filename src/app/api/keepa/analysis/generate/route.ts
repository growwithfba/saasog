import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { normalizeKeepaProducts } from '@/lib/keepa/normalize';
import { computeKeepaAnalysis } from '@/lib/keepa/compute';
import { detectMarketEvents } from '@/lib/marketClimate/events';
import { buildCompetitorProfiles } from '@/lib/marketClimate/competitorProfile';
import { generateMarketClimateNarration } from '@/services/marketClimateNarration';

export const dynamic = 'force-dynamic';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_REGEN_LIMIT = 5;

// Accounts exempt from the daily refresh cap — used for admin/dev work
// on production data without getting locked out mid-test. Emails are
// lowercased before comparison.
const REFRESH_LIMIT_BYPASS_EMAILS = new Set<string>([
  'support@bloomengine.ai',
  'dave@growwithfba.com'
]);

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

const sanitizeAsin = (asin: string) => asin.replace(/[^A-Z0-9]/gi, '').toUpperCase();

const fetchKeepaProducts = async (apiKey: string, domain: number, asins: string[]) => {
  // stats=365 gives us 12-month min/avg/max stats for every CSV series so we can
  // compute volatility and stockout baselines without walking the full history.
  // history=1 returns all CSV arrays (including the extra types 2.8b parses).
  // buybox=1 is required for CSV 18 (BUY_BOX_SHIPPING) — without it Keepa
  // omits the buy-box price/availability series entirely, which makes
  // stockout detection structurally impossible.
  const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=${domain}&asin=${asins.join(',')}&stats=365&history=1&buybox=1`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false as const, status: response.status, errorText };
  }
  const data = await response.json();
  return { ok: true as const, status: response.status, data };
};

const formatKeepaStatusMessage = (status: number) => {
  if (status === 402) return 'Keepa API quota exceeded (402).';
  if (status === 429) return 'Keepa API rate limited (429).';
  if (status === 403) return 'Keepa API forbidden (403).';
  if (status === 401) return 'Keepa API unauthorized (401).';
  return `Keepa API error (${status}).`;
};

const hasHistoryArrays = (product: any) => {
  if (!product?.csv || !Array.isArray(product.csv)) return false;
  return product.csv.some((entry: any) => Array.isArray(entry) && entry.length > 0);
};

export async function POST(request: Request) {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: 'KEEPA_API_KEY_MISSING', message: 'Keepa API key missing.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = await request.json();
    const productId = body?.productId as string | undefined;
    const requestedMonths = Number(body?.windowMonths ?? 240);
    // Capped at 240 (~20 years) so the deep-dive chart can render the full
    // tracked history for established listings. Pre-Vetting Reports filters
    // its own metrics down to 12 months internally — this only affects how
    // much raw history we persist on `keepa_analysis.normalized_series_json`.
    const windowMonths = Number.isFinite(requestedMonths) && requestedMonths > 0
      ? Math.min(Math.max(Math.round(requestedMonths), 12), 240)
      : 240;
    const domain = Number(body?.domain ?? 1);
    const rawAsins = Array.isArray(body?.competitorAsins) ? body.competitorAsins : [];
    const forceRefresh = Boolean(body?.forceRefresh);

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

    const normalizedAsins = rawAsins.map(sanitizeAsin).filter(asin => asin.length === 10);
    if (!normalizedAsins.length) {
      return NextResponse.json(
        { error: { code: 'KEEPA_ANALYSIS_NO_COMPETITORS', message: 'No valid competitor ASINs provided.' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data: existing } = await supabase
      .from('keepa_analysis')
      .select('updated_at, stale_after, window_months, analysis_json, normalized_series_json, computed_metrics_json')
      .eq('user_id', userData.user.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing && !forceRefresh) {
      const staleAfter = existing.stale_after ? new Date(existing.stale_after).getTime() : 0;
      if (staleAfter > Date.now()) {
        const computed = resolveComputed(
          (existing as any).analysis_json ?? null,
          existing.window_months ?? null,
          (existing as any).computed_metrics_json ?? null
        );
        if (computed) {
          return NextResponse.json(
            {
              analysis: {
                productId,
                updatedAt: existing.updated_at,
                staleAfter: existing.stale_after,
                windowMonths: Number(computed.windowMonths ?? existing.window_months ?? 24),
                competitorsAsins: normalizedAsins,
                normalized: existing.normalized_series_json ?? null,
                computed
              },
              cached: true
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
          );
        }
      }
    }

    const userEmail = (userData.user.email ?? '').trim().toLowerCase();
    const bypassRefreshLimit = REFRESH_LIMIT_BYPASS_EMAILS.has(userEmail);

    if (!bypassRefreshLimit) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('keepa_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userData.user.id)
        .gte('created_at', since);

      if (typeof count === 'number' && count >= DAILY_REGEN_LIMIT) {
        return NextResponse.json(
          {
            error: {
              code: 'KEEPA_REFRESH_LIMIT',
              message: "You've reached today's market refresh limit. Try again tomorrow."
            }
          },
          { status: 429, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const fetchedProducts: any[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < normalizedAsins.length; i += 10) {
      chunks.push(normalizedAsins.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const response = await fetchKeepaProducts(apiKey, domain, chunk);
      if (!response.ok) {
        const friendlyMessage = formatKeepaStatusMessage(response.status);
        await supabase.from('keepa_runs').insert({
          user_id: userData.user.id,
          product_id: productId,
          window_months: windowMonths,
          competitors_asins: normalizedAsins,
          status: 'fail',
          error_message: response.errorText || friendlyMessage
        });
        return NextResponse.json(
          {
            error: {
              code: 'KEEPA_API_ERROR',
              message: friendlyMessage
            },
            keepaError: response.errorText
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const data = response.data;
      if (data?.error) {
        await supabase.from('keepa_runs').insert({
          user_id: userData.user.id,
          product_id: productId,
          window_months: windowMonths,
          competitors_asins: normalizedAsins,
          status: 'fail',
          error_message: data.error
        });
        return NextResponse.json(
          {
            error: {
              code: 'KEEPA_API_ERROR',
              message: 'Keepa API error.'
            },
            keepaError: data.error
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      fetchedProducts.push(...(data?.products || []));
    }

    if (!fetchedProducts.length) {
      await supabase.from('keepa_runs').insert({
        user_id: userData.user.id,
        product_id: productId,
        window_months: windowMonths,
        competitors_asins: normalizedAsins,
        status: 'fail',
        error_message: 'Keepa returned no products.'
      });
      return NextResponse.json(
        { error: { code: 'KEEPA_EMPTY_RESPONSE', message: 'Keepa returned no products.' } },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const hasAnyHistory = fetchedProducts.some(hasHistoryArrays);
    if (!hasAnyHistory) {
      await supabase.from('keepa_runs').insert({
        user_id: userData.user.id,
        product_id: productId,
        window_months: windowMonths,
        competitors_asins: normalizedAsins,
        status: 'fail',
        error_message: 'Keepa returned products without history.'
      });
      return NextResponse.json(
        { error: { code: 'KEEPA_NO_HISTORY', message: 'Keepa returned products without history.' } },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const normalized = normalizeKeepaProducts(fetchedProducts, windowMonths);
    const computed = computeKeepaAnalysis(normalized);
    // Event detection reads daily data from the normalized snapshot and produces
    // a flat list of LAUNCH / STOCKOUT / MAJOR_PROMO / PROMO_CASCADE /
    // RANK_COLLAPSE / RANK_BREAKOUT / REVIEW_ACCELERATION / COMPETITOR_ENTRY
    // events with impact scores. Used as evidence for the AI narration.
    const events = detectMarketEvents(normalized);

    // Per-competitor pre-vetting profiles — primary input for the
    // PreVettingTabs UI and the AI narration. Three lenses per competitor:
    // launch / price-supply / rank.
    const competitorProfiles = buildCompetitorProfiles(normalized);

    // AI narration: batched Sonnet call that writes the market story,
    // at-a-glance card explainers, and per-competitor pre-vetting
    // narratives + big-picture summaries. Failure is non-fatal — the UI
    // falls back to facts-only display when narration is missing.
    let narration: Awaited<ReturnType<typeof generateMarketClimateNarration>> | null = null;
    try {
      narration = await generateMarketClimateNarration({
        snapshot: normalized,
        computed,
        profileSet: competitorProfiles,
        events,
        userId: userData.user.id,
        submissionId: productId
      });
    } catch (err) {
      console.error('Market Climate narration failed (non-fatal):', err);
    }

    const computedWithExtras = {
      ...computed,
      events,
      competitorProfiles,
      narration: narration
        ? {
            marketStory: narration.marketStory,
            preVetting: narration.preVetting,
            generatedAt: narration.generatedAt,
            model: narration.model
          }
        : null
    };
    const updatedAt = new Date().toISOString();
    const staleAfter = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    const analysisJson = {
      meta: {
        productId,
        generatedAt: updatedAt,
        windowMonths,
        competitorAsins: normalizedAsins
      },
      insights: computed.insights,
      trends: computed.trends,
      seasonality: computed.seasonality,
      promos: computed.promos,
      stockouts: computed.stockouts,
      competitors: computed.competitors,
      events,
      competitorProfiles,
      narration: computedWithExtras.narration
    };

    // Persist the full daily-granularity snapshot alongside the monthly
    // analysis. Downstream phases (event detection, archaeology charts)
    // read daily data directly from here without re-calling Keepa.
    await supabase.from('keepa_analysis').upsert({
      user_id: userData.user.id,
      product_id: productId,
      updated_at: updatedAt,
      stale_after: staleAfter,
      window_months: windowMonths,
      competitors_asins: normalizedAsins,
      analysis_json: analysisJson,
      normalized_series_json: normalized,
      computed_metrics_json: null
    });

    await supabase.from('keepa_runs').insert({
      user_id: userData.user.id,
      product_id: productId,
      window_months: windowMonths,
      competitors_asins: normalizedAsins,
      status: 'success'
    });

    return NextResponse.json(
      {
        analysis: {
          productId,
          updatedAt,
          staleAfter,
          windowMonths,
          competitorsAsins: normalizedAsins,
          normalized,
          computed: computedWithExtras
        }
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Keepa analysis generate error:', error);
    return NextResponse.json(
      { error: { code: 'KEEPA_ANALYSIS_GENERATE_FAILED', message: 'Failed to generate Keepa Signals.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
