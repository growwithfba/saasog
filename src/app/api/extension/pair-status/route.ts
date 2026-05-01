// =============================================================================
// GET /api/extension/pair-status?code=<pair_code>
// OPTIONS /api/extension/pair-status   (CORS preflight)
// =============================================================================
// Polled by the extension's background worker after it opens the
// BloomEngine login tab. The first call after the user successfully
// pairs returns the raw bearer token AND clears pair_code on the row,
// making the lookup single-use.
//
// No bearer auth required — the pair_code itself is the credential.
// Codes are 24-byte random base64url and expire after 5 minutes.
//
// Response:
//   200 { token: "<raw>", expiresAt: "<iso>" }   — paired, single-use.
//   204                                          — not yet paired (extension keeps polling).
//   410                                          — pair code expired or already redeemed.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  generateRawToken,
  hashToken,
  tokenExpiry,
  withCors,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 405 });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();

    if (!code || code.length < 16 || code.length > 64) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Missing or malformed code' }, { status: 400 })
      );
    }

    // Look up by pair_code. The partial index keeps this fast.
    const { data: row, error } = await supabaseAdmin
      .from('extension_tokens')
      .select('id, user_id, expires_at, pair_code_expires_at, revoked_at')
      .eq('pair_code', code)
      .maybeSingle();

    if (error) {
      console.error('extension/pair-status lookup failed:', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Lookup failed' }, { status: 500 })
      );
    }

    // Not paired yet — keep polling.
    if (!row) {
      return withCors(request, new NextResponse(null, { status: 204 }));
    }

    // Code expired or token was revoked between insert and poll.
    if (
      row.revoked_at ||
      (row.pair_code_expires_at && new Date(row.pair_code_expires_at) < new Date())
    ) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Pair code expired' }, { status: 410 })
      );
    }

    // Issue a fresh raw token, hash it, swap into the row, and clear
    // pair_code so this call is single-use. The original token_hash
    // staged at /pair was a placeholder — we overwrite it here so the
    // raw token never has to be cached anywhere on the server.
    const rawToken = generateRawToken();
    const newHash = hashToken(rawToken);
    const newExpiry = tokenExpiry();

    const { error: updateErr } = await supabaseAdmin
      .from('extension_tokens')
      .update({
        token_hash: newHash,
        expires_at: newExpiry.toISOString(),
        pair_code: null,
        pair_code_expires_at: null,
      })
      .eq('id', row.id)
      // Defensive: only update if pair_code is still set (single-use guard).
      .not('pair_code', 'is', null);

    if (updateErr) {
      console.error('extension/pair-status update failed:', updateErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Could not finalize pair' }, { status: 500 })
      );
    }

    return withCors(
      request,
      NextResponse.json({
        token: rawToken,
        expiresAt: newExpiry.toISOString(),
      })
    );
  } catch (err) {
    console.error('extension/pair-status crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
