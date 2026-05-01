// =============================================================================
// POST /api/extension/pair
// =============================================================================
// Called from Login.tsx immediately after a successful Supabase login when
// the URL contains ?ext_pair=<code>. Links the just-authenticated user
// to the pair_code so the extension can poll /pair-status and retrieve
// its long-lived bearer token.
//
// Request:
//   POST /api/extension/pair
//   Authorization: Bearer <supabase-access-token>
//   Content-Type: application/json
//   Body: { "pairCode": "<32-char base64url>" }
//
// Response:
//   200 { ok: true }       — pair_code is staged, extension will pick up
//                            the raw token on its next /pair-status poll.
//   400                    — missing or malformed pairCode.
//   401                    — Supabase token invalid.
//   500                    — server error.
//
// Note: this route does NOT return the raw token to the browser. The
// extension picks it up via /pair-status, scoped to chrome-extension://
// origin only. Keeps the raw token off the BloomEngine login page.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  generateRawToken,
  hashToken,
  pairCodeExpiry,
  tokenExpiry,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the calling user via their Supabase access token.
    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Missing Authorization header' },
        { status: 401 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, error: 'Invalid Supabase session' },
        { status: 401 }
      );
    }

    // 2. Validate the pair code.
    const body = await request.json().catch(() => ({}));
    const pairCode = typeof body.pairCode === 'string' ? body.pairCode.trim() : '';
    if (!pairCode || pairCode.length < 16 || pairCode.length > 64) {
      return NextResponse.json(
        { ok: false, error: 'Missing or malformed pairCode' },
        { status: 400 }
      );
    }

    // 3. Mint the extension token. Hash before storing.
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    // 4. Insert into extension_tokens with the pair_code mapping.
    //    Service role bypasses RLS.
    const { error: insertErr } = await supabaseAdmin
      .from('extension_tokens')
      .insert({
        user_id: userData.user.id,
        token_hash: tokenHash,
        pair_code: pairCode,
        pair_code_expires_at: pairCodeExpiry().toISOString(),
        expires_at: tokenExpiry().toISOString(),
        user_agent: request.headers.get('user-agent') ?? null,
      });

    if (insertErr) {
      // Most likely cause: pair_code collision (same code reused). Treat
      // as 409 so the extension can regenerate and retry.
      if (insertErr.code === '23505') {
        return NextResponse.json(
          { ok: false, error: 'Pair code already in use' },
          { status: 409 }
        );
      }
      console.error('extension/pair insert failed:', insertErr);
      return NextResponse.json(
        { ok: false, error: 'Could not stage pair code' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('extension/pair crashed:', err);
    return NextResponse.json(
      { ok: false, error: 'Unexpected error' },
      { status: 500 }
    );
  }
}
