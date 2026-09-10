import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildSelection, UnknownFilterError } from '@/lib/discovery/buildSelection';
import { revenueToRankBounds } from '@/lib/discovery/revenueBounds';
import { ROOT_CATEGORY_NAMES } from '@/lib/discovery/rootCategories';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/**
 * Cap on how many ASINs we hand back to the browser. Keepa itself refuses
 * page x perPage >= 10000, and 1000 ASINs is ~10KB — 20 pages of 50, which
 * is far more than anyone pages through. `totalResults` is always returned
 * so the UI can tell the user how much lies beyond the cap.
 */
const MAX_ASINS = 1000;

/**
 * How many products a search will actually return.
 *
 * A wider match set is not blocked — results always load — but only the best
 * REVIEWABLE_LIMIT of them come back, and the UI says so plainly and offers
 * ways to narrow. Beyond a couple of hundred, a result set stops being
 * something a person reviews and starts being something they skim.
 *
 * `totalResults` is reported regardless, at the ~11-token base price whatever
 * the set size, so the true count is always honest even when the list is cut.
 */
const REVIEWABLE_LIMIT = 250;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Search is unavailable.' }, { status: 500 });
    }

    // Revenue is not a provider field. Rather than fetch rows that cannot
    // qualify and drop them after paying for them, translate the revenue window
    // into the sales-rank window our own curve implies. See revenueBounds.ts —
    // this is a pre-filter; the exact test still runs client-side.
    const filtersIn = (body?.filters ?? {}) as Record<string, any>;
    const derivedIn = (body?.derived ?? {}) as Record<string, any>;
    const avgRank = revenueToRankBounds({
      derived: derivedIn,
      priceMin: filtersIn.price?.min,
      priceMax: filtersIn.price?.max,
      categories: Array.isArray(filtersIn.category)
        ? filtersIn.category.map((id: string) => ROOT_CATEGORY_NAMES[String(id)] ?? null)
        : [],
    });

    let selection: Record<string, unknown>;
    try {
      selection = buildSelection(body?.filters ?? {}, {
        avgRank,
        perPage: MAX_ASINS,
        page: 0,
        sort: body?.sort,
      });
    } catch (err) {
      if (err instanceof UnknownFilterError) {
        // Detailed message names internal source files — log it, don't ship it.
        console.error('[discovery/search] rejected unknown filter', err.message);
        return NextResponse.json(
          { success: false, error: 'One or more search filters were not recognised.' },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : 'Invalid filters.';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const url =
      `${KEEPA_BASE_URL}/query?key=${apiKey}&domain=1` +
      `&selection=${encodeURIComponent(JSON.stringify(selection))}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.error) {
      // Never surface the upstream provider's name to the user.
      console.error('[discovery/search] provider error', data.error);
      return NextResponse.json(
        { success: false, error: 'Search failed. Please adjust your filters and try again.' },
        { status: 502 },
      );
    }

    const asins: string[] = Array.isArray(data?.asinList) ? data.asinList : [];
    const totalResults: number = typeof data?.totalResults === 'number' ? data.totalResults : asins.length;

    // Keep the BEST REVIEWABLE_LIMIT rather than an arbitrary slice — the
    // client sorts by rank, so a cut list is still the strongest performers in
    // the filter set.
    const limited = asins.slice(0, REVIEWABLE_LIMIT);

    return NextResponse.json({
      success: true,
      asins: limited,
      totalResults,
      reviewableLimit: REVIEWABLE_LIMIT,
      capped: totalResults > limited.length,
    });
  } catch (err) {
    console.error('[discovery/search] unexpected', err);
    return NextResponse.json({ success: false, error: 'Search failed.' }, { status: 500 });
  }
}
