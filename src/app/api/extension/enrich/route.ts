// =============================================================================
// POST /api/extension/enrich
// =============================================================================
// Per-ASIN enrichment for the Bloom Lens drawer's "heavy" columns. Replaces
// the synth-derived BSR/units/revenue/etc. with real, multi-point-smoothed
// values from Keepa's csv[3] (sales-rank time series).
//
// Phase 5.4-F. See bloom-lens-extension/research/phase-5.4-F-keepa-probe.md
// for the data-quality findings that drove the multi-point smoothing.
//
// Auth: Authorization: Bearer <ext_token> (mirror save-funnel pattern)
//
// Request:
//   POST /api/extension/enrich
//   { "asins": ["B0D2KZXT8R", ...] }   // max 100, deduped, uppercased
//
// Response 200:
//   {
//     "ok": true,
//     "enriched": {
//       "<ASIN>": {
//         "bsr": number | null,                // current snapshot
//         "bsr30dMedian": number | null,       // smoothed headline
//         "bsrVolatility": number | null,      // coefficient of variation
//         "bsrTrendPct": number | null,        // 30d → today % change
//         "monthlyUnits": number | null,       // derived via BSR curve
//         "monthlyRevenue": number | null,     // units × 30d-avg price (cents)
//         "price": number | null,              // current price, cents
//         "weightLb": number | null,
//         "dimensions": { l: number, w: number, h: number } | null,
//         "listingCreatedAt": string | null,   // ISO yyyy-mm-dd
//         "variationCount": number | null,
//         "rating": number | null,             // 0–5
//         "reviews": number | null,
//         "imageUrl": string | null,
//         "brand": string | null,
//         "dataQuality": "full" | "limited",
//         "curveVersion": string
//       }
//     }
//   }

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';
import {
  bsrToMonthlyUnits,
  bsrToMonthlyUnitsByCategory,
  CURVE_VERSION,
} from '@/lib/extension/bsrSalesCurve';

export const dynamic = 'force-dynamic';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_DOMAIN_US = 1;
const MAX_ASINS_PER_REQUEST = 100;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Keepa "minutes" since 2011-01-01.
const KEEPA_EPOCH_MS = new Date('2011-01-01T00:00:00Z').getTime();
const km2ms = (km: number) => KEEPA_EPOCH_MS + km * 60_000;

type EnrichedRow = {
  // Amazon root category name (e.g. "Toys & Games", "Pet Supplies"). Pulled
  // from Keepa's categoryTree[0].name. Drawer overwrites its placeholder
  // category with this so the user sees the real category the calibration
  // multiplier was keyed on.
  rootCategory: string | null;
  // Snapshot BSR — what Amazon shows on the PDP right now. Matches H10's
  // BSR column. Used for display only.
  bsr: number | null;
  // 30-day smoothed BSR — used internally to derive parent units. Surfaced
  // on payload so the drawer can show it in the BSR cell tooltip.
  bsr30dMedian: number | null;
  bsrVolatility: number | null;
  bsrTrendPct: number | null;
  // Per-CHILD monthly units (Phase 5.4-G):
  //   - When Keepa exposes monthlySold for this child → use directly
  //   - When monthlySold is null + family is multi-variation → parent / min(N, 5)
  //   - When single-variation → BSR-derived parent units (= child units)
  monthlyUnits: number | null;
  /** monthlyUnits × 30d-avg child price. Cents. */
  monthlyRevenue: number | null;
  // Family totals — same value across every child in the family.
  parentMonthlyUnits: number | null;
  /** parentMonthlyUnits × 30d-avg price. Cents. */
  parentMonthlyRevenue: number | null;
  /** 'amazon' = monthlySold bucket; 'attributed' = derived via BSR + cap; null = no data. */
  unitsSource: 'amazon' | 'attributed' | null;
  /** price is in cents. */
  price: number | null;
  weightLb: number | null;
  dimensions: { l: number; w: number; h: number } | null;
  listingCreatedAt: string | null;
  variationCount: number | null;
  rating: number | null;
  reviews: number | null;
  imageUrl: string | null;
  brand: string | null;
  dataQuality: 'full' | 'limited';
  curveVersion: string;
};

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

    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
      console.error('POST extension/enrich: KEEPA_API_KEY is not configured');
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Enrichment is not configured' },
          { status: 500 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body || !Array.isArray(body.asins)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    // Sanitize, dedupe, cap.
    const asins = Array.from(
      new Set(
        (body.asins as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.toUpperCase())
          .filter((a) => ASIN_REGEX.test(a))
      )
    ).slice(0, MAX_ASINS_PER_REQUEST);

    if (asins.length === 0) {
      return extensionResponse(request, { ok: true, enriched: {} }, resolved);
    }

    // Cache lookup. We pull every requested ASIN in one query; the route
    // decides per-row whether to use cache or fetch fresh.
    const { data: cached } = await supabaseAdmin
      .from('keepa_lens_metrics')
      .select('asin, payload, data_quality, cache_until')
      .in('asin', asins);

    const now = Date.now();
    const enriched: Record<string, EnrichedRow> = {};
    const cacheHits: string[] = [];
    const toFetch: string[] = [];

    for (const asin of asins) {
      const row = cached?.find((c) => c.asin === asin);
      if (row && row.cache_until && new Date(row.cache_until).getTime() > now) {
        // Fresh — use cached payload as-is.
        enriched[asin] = row.payload as EnrichedRow;
        cacheHits.push(asin);
      } else {
        toFetch.push(asin);
      }
    }

    // Single batched call to Keepa for all misses. Empty toFetch → skip.
    if (toFetch.length > 0) {
      const url =
        `${KEEPA_BASE_URL}/product` +
        `?key=${apiKey}` +
        `&domain=${KEEPA_DOMAIN_US}` +
        `&asin=${toFetch.join(',')}` +
        `&stats=180` +
        `&history=1`;

      const t0 = Date.now();
      const res = await fetch(url);
      const elapsedMs = Date.now() - t0;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Keepa enrich fetch failed', res.status, errText.slice(0, 300));
        // Don't fail the whole request — return what we have from cache,
        // and mark unfetched ASINs as missing so the client can retry.
        return extensionResponse(request, { ok: true, enriched }, resolved);
      }

      const data: any = await res.json();
      const products: any[] = Array.isArray(data?.products) ? data.products : [];
      const byAsin = new Map<string, any>();
      for (const p of products) {
        if (p?.asin) byAsin.set(String(p.asin).toUpperCase(), p);
      }

      console.log(
        `POST extension/enrich: keepa fetch ${toFetch.length} ASINs in ${elapsedMs}ms ` +
          `(processing=${data.processingTimeInMs}ms, tokensConsumed=${data.tokensConsumed}, tokensLeft=${data.tokensLeft})`
      );

      // Build payloads + upsert into cache.
      const upsertRows: Array<{
        asin: string;
        payload: EnrichedRow;
        data_quality: 'full' | 'limited';
        computed_at: string;
        cache_until: string;
      }> = [];
      const nowIso = new Date().toISOString();
      const cacheUntilIso = new Date(now + CACHE_TTL_MS).toISOString();

      for (const asin of toFetch) {
        const product = byAsin.get(asin);
        const row = product ? buildEnrichedRow(product) : buildEmptyRow();
        enriched[asin] = row;
        upsertRows.push({
          asin,
          payload: row,
          data_quality: row.dataQuality,
          computed_at: nowIso,
          cache_until: cacheUntilIso,
        });
      }

      if (upsertRows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('keepa_lens_metrics')
          .upsert(upsertRows, { onConflict: 'asin' });
        if (upsertError) {
          console.error('Failed to upsert keepa_lens_metrics', upsertError);
          // Don't fail the response — the data is good, just not cached.
        }
      }
    }

    return extensionResponse(
      request,
      { ok: true, enriched, cacheHits: cacheHits.length, fetched: toFetch.length },
      resolved
    );
  } catch (err) {
    console.error('POST extension/enrich: unexpected error', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function buildEmptyRow(): EnrichedRow {
  return {
    rootCategory: null,
    bsr: null,
    bsr30dMedian: null,
    bsrVolatility: null,
    bsrTrendPct: null,
    monthlyUnits: null,
    monthlyRevenue: null,
    parentMonthlyUnits: null,
    parentMonthlyRevenue: null,
    unitsSource: null,
    price: null,
    weightLb: null,
    dimensions: null,
    listingCreatedAt: null,
    variationCount: null,
    rating: null,
    reviews: null,
    imageUrl: null,
    brand: null,
    dataQuality: 'limited',
    curveVersion: CURVE_VERSION,
  };
}

/**
 * Build the enriched row for one Keepa product. Handles both the full-history
 * happy path AND the empty-csv fallback (deactivated listings).
 */
function buildEnrichedRow(product: any): EnrichedRow {
  const cur: number[] = product.stats?.current ?? [];
  const currentBsr = posOrNull(cur[3]);
  const currentPriceCents = posOrNull(cur[0]) ?? posOrNull(cur[1]);
  const reviews = nonNegOrNull(cur[17]);
  const ratingTenths = posOrNull(cur[16]);

  // BSR history (csv[3]) — alternating [keepaMinute, rank, ...]. -1 sentinel
  // means out-of-stock or no rank; skip those points.
  const csv3: number[] = Array.isArray(product.csv?.[3]) ? product.csv[3] : [];
  const points: Array<{ ts: number; rank: number }> = [];
  for (let i = 0; i + 1 < csv3.length; i += 2) {
    const km = csv3[i];
    const rank = csv3[i + 1];
    if (typeof km !== 'number' || typeof rank !== 'number' || rank <= 0) continue;
    points.push({ ts: km2ms(km), rank });
  }

  const cutoff30 = Date.now() - 30 * 86_400_000;
  const points30 = points.filter((p) => p.ts >= cutoff30);

  // Median-of-daily-medians smoothing. Group rank samples by day, take
  // each day's median, then take the median across the 30 days.
  let bsr30dMedian: number | null = null;
  let bsrVolatility: number | null = null;
  let bsrTrendPct: number | null = null;

  if (points30.length >= 5) {
    const byDay = new Map<string, number[]>();
    for (const pt of points30) {
      const day = new Date(pt.ts).toISOString().slice(0, 10);
      const arr = byDay.get(day) ?? [];
      arr.push(pt.rank);
      byDay.set(day, arr);
    }
    const dailyMedians = Array.from(byDay.values()).map(median);
    bsr30dMedian = median(dailyMedians);
    // Volatility = coefficient of variation (stddev / mean) of daily
    // medians. Surfaces "is this product spiky?" — high CV means the
    // smoothed value matters more than the snapshot.
    if (dailyMedians.length >= 2) {
      const m = dailyMedians.reduce((a, b) => a + b, 0) / dailyMedians.length;
      const variance =
        dailyMedians.reduce((a, b) => a + (b - m) ** 2, 0) / dailyMedians.length;
      bsrVolatility = m > 0 ? Math.sqrt(variance) / m : null;
    }
    // Trend = (current snapshot − 30d-ago median) / 30d-ago median.
    // Find the day closest to 30 days ago in our sample.
    if (currentBsr != null && bsr30dMedian != null) {
      bsrTrendPct = ((currentBsr - bsr30dMedian) / bsr30dMedian) * 100;
    }
  }

  // Family / parent units (Phase 5.4-G): the BSR-curve gives us
  // PARENT-level units because Keepa returns parent BSR for every
  // child of a variation family (verified by sibling probe — all 4
  // siblings of B07F1BK675 returned BSR within 0.1% of each other).
  // We always compute this; the per-child monthlyUnits below uses it
  // as the basis for attribution.
  //
  // Phase 5.4-H: pass the Amazon root category through so the curve
  // applies a per-category multiplier (trained against the H10 corpus).
  // Falls back to the universal curve when category is unknown or
  // uncalibrated.
  const rootCategoryName = pickRootCategoryName(product);
  const bsrForUnits = bsr30dMedian ?? currentBsr;
  const parentMonthlyUnits =
    bsrForUnits != null
      ? bsrToMonthlyUnitsByCategory(bsrForUnits, rootCategoryName)
      : null;

  // Variation count drives the per-child attribution math below. Some
  // products carry a single-variation listing (variations array empty
  // or absent) — those default to 1 so the family/child math degenerates
  // cleanly.
  const variationCount = Array.isArray(product.variations)
    ? product.variations.length || 1
    : 1;

  // Per-child monthly units (Phase 5.4-G three-tier strategy):
  //   Tier 1: monthlySold from Keepa (Amazon's "bought past month"
  //           bucket) — when present, it's per-child and authoritative.
  //   Tier 2: parent_units / min(variationCount, 5) — caps the divisor
  //           because 99-variation families have a few dominant SKUs,
  //           not 99 evenly-selling ones. Cap of 5 matches the typical
  //           20–30% share observed for a family's bestseller.
  //   Tier 3: single-variation listings → child_units == parent_units.
  //
  // monthlySold is on the top-level product object as a number, OR on
  // stats.current[30] in some response shapes. The Phase 5.1 probe found
  // ~32% coverage across a typical batch.
  const monthlySoldRaw =
    typeof product.monthlySold === 'number' && product.monthlySold > 0
      ? product.monthlySold
      : typeof cur[30] === 'number' && cur[30] > 0
        ? cur[30]
        : null;

  let monthlyUnits: number | null = null;
  let unitsSource: EnrichedRow['unitsSource'] = null;
  if (monthlySoldRaw != null) {
    // Amazon's "X+ bought past month" bucket reports the LOWER BOUND.
    // Actual sales fall somewhere between this bucket's floor and the
    // next bucket (50→100, 100→200, 200→300, 300→400 ... 1000→2000).
    // Using the floor systematically understates by ~30–50% (verified
    // against H10 corpus 2026-05-04 — see calibration baseline memory).
    // Multiplying by 1.5 estimates the bucket midpoint — H10 appears to
    // do something similar, and applying this lifts our niche-product
    // in-band rate significantly while leaving popular-product
    // attribution roughly unchanged.
    monthlyUnits = Math.round(monthlySoldRaw * 1.5);
    unitsSource = 'amazon';
  } else if (parentMonthlyUnits != null) {
    if (variationCount <= 1) {
      monthlyUnits = parentMonthlyUnits;
    } else {
      const cap = Math.min(variationCount, 5);
      monthlyUnits = Math.max(0, Math.round(parentMonthlyUnits / cap));
    }
    unitsSource = 'attributed';
  }

  // Average price across the trailing 30 days. Falls back to current
  // price if no history. Used for revenue so a deal-day current price
  // doesn't distort the revenue column.
  const csv0: number[] = Array.isArray(product.csv?.[0]) ? product.csv[0] : [];
  const csv1: number[] = Array.isArray(product.csv?.[1]) ? product.csv[1] : [];
  const priceHistory = csv0.length >= csv1.length ? csv0 : csv1;
  const pricePoints30: number[] = [];
  for (let i = 0; i + 1 < priceHistory.length; i += 2) {
    const km = priceHistory[i];
    const cents = priceHistory[i + 1];
    if (typeof km !== 'number' || typeof cents !== 'number' || cents <= 0) continue;
    if (km2ms(km) >= cutoff30) pricePoints30.push(cents);
  }
  const avgPriceCents =
    pricePoints30.length > 0
      ? pricePoints30.reduce((a, b) => a + b, 0) / pricePoints30.length
      : currentPriceCents;

  const monthlyRevenue =
    monthlyUnits != null && avgPriceCents != null
      ? Math.round(monthlyUnits * avgPriceCents)
      : null;

  // Parent (family-total) units invariant: parent >= child. Always.
  //
  // The bug we're fixing: child uses Amazon's monthlySold × 1.5 (Tier 1),
  // parent uses the BSR-curve estimate. They're computed from different
  // signals and aren't reconciled. When the V1 curve undershoots at high
  // BSRs, BSR-derived parent < monthlySold-derived child — which is
  // logically impossible (the family total can't be smaller than one
  // child's sales).
  //
  // Fix: floor parent at the child level. Conservative — H10's actual
  // parent estimate is often higher (typically 1.2–3× the dominant
  // child), but flooring at child guarantees no nonsensical displays.
  // Tightening past child requires either summing sibling monthlySold
  // (extra Keepa calls) or per-category curves (V2 calibration).
  let parentUnitsResolved = parentMonthlyUnits;
  if (parentUnitsResolved != null && monthlyUnits != null && parentUnitsResolved < monthlyUnits) {
    parentUnitsResolved = monthlyUnits;
  } else if (parentUnitsResolved == null && monthlyUnits != null) {
    parentUnitsResolved = monthlyUnits;
  }

  // Parent revenue = parent_units × this child's avg price (rough
  // approximation; siblings have similar prices for most variation
  // families). When we floor parent_units at child_units, parent_revenue
  // should track — recompute rather than fall back to the BSR-derived
  // value (which would still be too low).
  const parentMonthlyRevenue =
    parentUnitsResolved != null && avgPriceCents != null
      ? Math.round(parentUnitsResolved * avgPriceCents)
      : null;

  // Static fields. listedSince is in Keepa minutes.
  const listingCreatedAt = keepaMinutesToIso(product.listedSince);
  const weightLb =
    typeof product.packageWeight === 'number' && product.packageWeight > 0
      ? round2(product.packageWeight / 453.592) // grams → pounds
      : null;
  const dimensions =
    typeof product.packageLength === 'number' &&
    typeof product.packageWidth === 'number' &&
    typeof product.packageHeight === 'number' &&
    product.packageLength > 0 &&
    product.packageWidth > 0 &&
    product.packageHeight > 0
      ? {
          l: product.packageLength,
          w: product.packageWidth,
          h: product.packageHeight,
        }
      : null;
  const imageUrl = pickImageUrl(product);
  const brand = pickBrand(product);

  return {
    rootCategory: rootCategoryName,
    bsr: currentBsr,
    bsr30dMedian: bsr30dMedian != null ? Math.round(bsr30dMedian) : null,
    bsrVolatility: bsrVolatility != null ? round2(bsrVolatility) : null,
    bsrTrendPct: bsrTrendPct != null ? round2(bsrTrendPct) : null,
    monthlyUnits,
    monthlyRevenue,
    parentMonthlyUnits: parentUnitsResolved,
    parentMonthlyRevenue,
    unitsSource,
    price: currentPriceCents,
    weightLb,
    dimensions,
    listingCreatedAt,
    variationCount: variationCount > 0 ? variationCount : null,
    rating: ratingTenths != null ? ratingTenths / 10 : null,
    reviews,
    imageUrl,
    brand,
    // 'limited' when we couldn't even build a smoothed BSR — the row is
    // running on snapshot fields only.
    dataQuality: bsr30dMedian != null ? 'full' : 'limited',
    curveVersion: CURVE_VERSION,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function posOrNull(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

function nonNegOrNull(v: unknown): number | null {
  return typeof v === 'number' && v >= 0 ? v : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function keepaMinutesToIso(km: any): string | null {
  if (typeof km !== 'number' || km <= 0) return null;
  return new Date(km2ms(km)).toISOString().slice(0, 10);
}

function pickImageUrl(product: any): string | null {
  if (Array.isArray(product?.images) && product.images.length > 0) {
    const first = product.images[0];
    const filename =
      typeof first?.m === 'string' && first.m
        ? first.m
        : typeof first?.l === 'string' && first.l
          ? first.l
          : null;
    if (filename) return `https://m.media-amazon.com/images/I/${filename}`;
  }
  if (typeof product?.imagesCSV === 'string' && product.imagesCSV.length > 0) {
    const filename = product.imagesCSV.split(',')[0]?.trim();
    if (filename) return `https://m.media-amazon.com/images/I/${filename}`;
  }
  return null;
}

/**
 * Pull the Amazon root category NAME from a Keepa product response.
 * Keepa returns a few different shapes depending on the product; we
 * try the cheapest path first and fall back gracefully.
 *
 * Most Keepa /product responses include `categoryTree` (array of
 * `{catId, name}` entries from root → leaf) and `rootCategory` (the
 * numeric ID of the top-level). We want the NAME, since that's what
 * the calibration multipliers map keys on. Keepa's categoryTree[0]
 * is the root.
 *
 * Returns null when no usable category is present — the curve falls
 * back to the universal v1.1.0 multiplier (1.0).
 */
function pickRootCategoryName(product: any): string | null {
  const tree = product?.categoryTree;
  if (Array.isArray(tree) && tree.length > 0) {
    const root = tree[0];
    if (root && typeof root.name === 'string' && root.name.trim()) {
      return root.name.trim();
    }
  }
  return null;
}

function pickBrand(product: any): string | null {
  const brand =
    typeof product?.brand === 'string' && product.brand.trim()
      ? product.brand.trim()
      : null;
  if (brand) return brand;
  const manufacturer =
    typeof product?.manufacturer === 'string' && product.manufacturer.trim()
      ? product.manufacturer.trim()
      : null;
  return manufacturer;
}
