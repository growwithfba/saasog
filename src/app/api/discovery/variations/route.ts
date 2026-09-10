import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { HydratedRow } from '@/lib/discovery/types';
import { hydrateAsins, ASIN_REGEX } from '@/lib/discovery/hydrateAsins.server';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/**
 * How many sibling ASINs one expand will resolve.
 *
 * Each miss costs 2 provider tokens, and real families get large — Liquitex
 * BASICS has 168 variations, which would be 336 tokens for a single click.
 * The response reports the true total so the UI can say what it is not
 * showing rather than implying the list is complete.
 */
const MAX_VARIATIONS = 20;

export interface VariationRow extends HydratedRow {
  /** e.g. "Cadmium Red Light Hue · 4 Fl Oz" — the axis values Amazon varies on. */
  variantLabel: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = typeof body?.asin === 'string' ? body.asin : '';
    const asin = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!ASIN_REGEX.test(asin)) {
      return NextResponse.json({ success: false, error: 'Invalid product reference.' }, { status: 400 });
    }

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
      return NextResponse.json({ success: false, error: 'Lookup is unavailable.' }, { status: 500 });
    }

    // The row's own product carries the family's sibling list, so this costs
    // one token rather than a separate lookup of the parent — and the parent
    // listing itself (productType 5) carries no usable variationCSV anyway.
    const res = await fetch(
      `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1&asin=${asin}&stats=180`,
    );
    const data = await res.json();
    if (data?.error) {
      console.error('[discovery/variations] provider error', data.error);
      return NextResponse.json({ success: false, error: 'Could not load variations.' }, { status: 502 });
    }

    const product = data?.products?.[0];
    const variations: any[] = Array.isArray(product?.variations) ? product.variations : [];

    if (variations.length === 0) {
      return NextResponse.json({ success: true, rows: [], total: 0, truncated: false });
    }

    const labelByAsin = new Map<string, string>();
    for (const v of variations) {
      const a = String(v?.asin ?? '').toUpperCase();
      if (!ASIN_REGEX.test(a)) continue;
      const label = Array.isArray(v?.attributes)
        ? v.attributes
            .map((attr: any) => attr?.value)
            .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
            .join(' · ')
        : '';
      labelByAsin.set(a, label || '');
    }

    const allAsins = Array.from(labelByAsin.keys());
    const slice = allAsins.slice(0, MAX_VARIATIONS);

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { rows: byAsin, failed } = await hydrateAsins(admin, slice);
    if (failed) {
      return NextResponse.json({ success: false, error: 'Could not load variations.' }, { status: 502 });
    }

    const rows: VariationRow[] = slice
      .map((a) => {
        const row = byAsin.get(a);
        if (!row) return null;
        return { ...row, variantLabel: labelByAsin.get(a) || null };
      })
      .filter(Boolean) as VariationRow[];

    return NextResponse.json({
      success: true,
      rows,
      total: allAsins.length,
      truncated: allAsins.length > slice.length,
    });
  } catch (err) {
    console.error('[discovery/variations] unexpected', err);
    return NextResponse.json({ success: false, error: 'Could not load variations.' }, { status: 500 });
  }
}
