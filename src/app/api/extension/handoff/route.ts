// =============================================================================
// POST /api/extension/handoff
// OPTIONS /api/extension/handoff
// =============================================================================
// Mints a one-time Supabase magic-link so the extension can open an
// authenticated tab into the BloomEngine app without prompting the user
// to sign in again.
//
// The extension stores its own bearer ext_token but the browser at
// bloomengine.ai uses a separate Supabase session cookie. Without this
// bridge, the extension's "My Funnel" link drops users on /login even
// though they're signed in via the extension.
//
// Auth: Authorization: Bearer <ext_token>
//
// Request body: { to?: '/research' | '/dashboard' | '/vetting/<asin>' | ... }
//   Whitelisted to in-app paths. Anything off-list falls back to /research.
//
// Response 200: { ok: true, url: <one-time signed magic-link URL> }
// Response 401: token missing / expired / revoked.
// Response 500: generateLink failed.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

// Path whitelist — only allow handoff to known in-app surfaces. Stops
// the endpoint from being abused as an open redirect.
const SAFE_PATHS =
  /^\/(?:research|dashboard|vetting(?:\/[A-Z0-9]+)?|sourcing|offer|submission(?:\/[A-Z0-9-]+)?|profile|subscription|preferences|plans)\/?(?:\?[^#]*)?$/i;

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

    const body = await request.json().catch(() => ({}));
    const rawTo = typeof body?.to === 'string' ? body.to : '/research';
    const to = SAFE_PATHS.test(rawTo) ? rawTo : '/research';

    const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(resolved.userId);
    const email = userResp?.user?.email;
    if (!email) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'User has no email on file' }, { status: 400 })
      );
    }

    // Derive public base from the request — works in local dev (localhost:3000),
    // dev preview, and production without an extra env var.
    const publicBase = request.nextUrl.origin;
    const redirectTo = `${publicBase}${to}`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    const actionLink = data?.properties?.action_link;
    if (error || !actionLink) {
      console.error('extension/handoff: generateLink failed', error);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Failed to mint handoff link' }, { status: 500 })
      );
    }

    return extensionResponse(request, { ok: true, url: actionLink }, resolved);
  } catch (err) {
    console.error('extension/handoff crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}
