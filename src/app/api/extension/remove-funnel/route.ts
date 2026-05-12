// =============================================================================
// POST /api/extension/remove-funnel
// =============================================================================
// Bulk-removes ASINs from the user's research funnel (research_products
// table). Mirrors /api/extension/save-funnel for the reverse direction —
// powers the "click Saved to Funnel again to remove" toggle in the
// BloomLens drawer.
//
// CRITICAL: research_products has ON DELETE CASCADE on submissions,
// offer_products, and sourcing_products. A naive DELETE would silently
// nuke a user's vetted market + supplier offers + sourcing data with
// no warning. We REFUSE to delete any research_product that has
// downstream rows in those three tables; the user must remove the
// downstream artifact first (from /vetting, etc.).
//
// product_tags also cascades but tags are just labels and the user
// expects them to disappear with the product — that cascade is fine.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: Core or Pro (same gate as save-funnel).
//
// Request:
//   POST /api/extension/remove-funnel
//   { asins: string[] }
//
// Response 200:
//   {
//     ok: true,
//     removedCount: number,
//     skippedCount: number,
//     skipped: Array<{ asin: string, reason: 'in_market' | 'has_offers' | 'has_sourcing' | 'not_in_funnel' }>
//   }
//
// Response 401 / 403 / 400 / 500: standard.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  deriveEffectiveLensTier,
  extensionResponse,
  lensFeatures,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const MAX_ASINS_PER_REQUEST = 100;

type SkipReason = 'in_market' | 'has_offers' | 'has_sourcing' | 'not_in_funnel';

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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tier, subscription_status, trial_ends_at')
      .eq('id', resolved.userId)
      .maybeSingle();

    const tier = deriveEffectiveLensTier(profile ?? null);
    if (!lensFeatures(tier).canSaveFunnel) {
      return withCors(
        request,
        NextResponse.json(
          { ok: false, error: 'Remove from Funnel requires a Core or Pro plan', upgradeUrl: '/upgrade' },
          { status: 403 }
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

    const requestedAsins = Array.from(
      new Set(
        (body.asins as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.toUpperCase())
          .filter((a) => ASIN_REGEX.test(a))
      )
    ).slice(0, MAX_ASINS_PER_REQUEST);

    if (requestedAsins.length === 0) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'No valid ASINs in request' }, { status: 400 })
      );
    }

    // Resolve ASINs → research_product ids for THIS user only. RLS would
    // catch a cross-user attempt anyway, but the explicit user_id filter
    // makes the intent obvious in the audit trail.
    const { data: ownedRows, error: lookupErr } = await supabaseAdmin
      .from('research_products')
      .select('id, asin')
      .eq('user_id', resolved.userId)
      .in('asin', requestedAsins);

    if (lookupErr) {
      console.error('remove-funnel lookup failed:', lookupErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    const owned = ownedRows ?? [];
    const ownedAsins = new Set(owned.map((r) => r.asin));
    const idToAsin = new Map(owned.map((r) => [r.id, r.asin]));
    const ownedIds = owned.map((r) => r.id);

    const skipped: Array<{ asin: string; reason: SkipReason }> = [];

    // ASINs the user requested but doesn't actually own — surface as
    // skipped so the client can update its local "saved" set without
    // a confusing silent dropout.
    for (const asin of requestedAsins) {
      if (!ownedAsins.has(asin)) {
        skipped.push({ asin, reason: 'not_in_funnel' });
      }
    }

    // Dependency check across the three CASCADE'ing FKs. We run all
    // three queries in parallel; each returns the research_products_id
    // values that have at least one row in that downstream table.
    let blockedByMarket = new Set<string>();
    let blockedByOffers = new Set<string>();
    let blockedBySourcing = new Set<string>();

    if (ownedIds.length > 0) {
      const [subs, offers, sourcing] = await Promise.all([
        supabaseAdmin
          .from('submissions')
          .select('research_products_id')
          .eq('user_id', resolved.userId)
          .in('research_products_id', ownedIds),
        supabaseAdmin
          .from('offer_products')
          .select('product_id')
          .in('product_id', ownedIds),
        supabaseAdmin
          .from('sourcing_products')
          .select('product_id')
          .in('product_id', ownedIds),
      ]);

      if (subs.error || offers.error || sourcing.error) {
        console.error('remove-funnel dependency check failed:', {
          subs: subs.error,
          offers: offers.error,
          sourcing: sourcing.error,
        });
        return withCors(
          request,
          NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
        );
      }

      blockedByMarket = new Set(
        (subs.data ?? [])
          .map((r) => r.research_products_id as string | null)
          .filter((id): id is string => typeof id === 'string')
      );
      blockedByOffers = new Set(
        (offers.data ?? [])
          .map((r) => r.product_id as string | null)
          .filter((id): id is string => typeof id === 'string')
      );
      blockedBySourcing = new Set(
        (sourcing.data ?? [])
          .map((r) => r.product_id as string | null)
          .filter((id): id is string => typeof id === 'string')
      );
    }

    // Partition the owned ids: safe to delete vs. blocked by dependency.
    // First-match wins on the skip reason so the toast can say "this is
    // in a vetted market" before mentioning offers/sourcing.
    const safeIds: string[] = [];
    for (const id of ownedIds) {
      const asin = idToAsin.get(id)!;
      if (blockedByMarket.has(id)) {
        skipped.push({ asin, reason: 'in_market' });
      } else if (blockedByOffers.has(id)) {
        skipped.push({ asin, reason: 'has_offers' });
      } else if (blockedBySourcing.has(id)) {
        skipped.push({ asin, reason: 'has_sourcing' });
      } else {
        safeIds.push(id);
      }
    }

    let removedCount = 0;
    if (safeIds.length > 0) {
      const { error: deleteErr, count } = await supabaseAdmin
        .from('research_products')
        .delete({ count: 'exact' })
        .in('id', safeIds)
        .eq('user_id', resolved.userId);

      if (deleteErr) {
        console.error('remove-funnel delete failed:', deleteErr);
        return withCors(
          request,
          NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
        );
      }
      removedCount = count ?? safeIds.length;
    }

    return extensionResponse(
      request,
      {
        ok: true,
        removedCount,
        skippedCount: skipped.length,
        skipped,
      },
      resolved
    );
  } catch (err) {
    console.error('extension/remove-funnel crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
