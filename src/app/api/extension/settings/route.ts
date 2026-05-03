// =============================================================================
// GET / PATCH /api/extension/settings
// =============================================================================
// Bearer-protected counterpart to /api/profiles/preferences. Reads and
// writes the `lens` sub-key of profiles.preferences (a JSONB blob;
// see migration 20260426170000_add_preferences_to_profiles.sql).
//
// Why a separate route instead of reusing /api/profiles/preferences?
// That route auths via Supabase cookies/JWT — fine for the dashboard,
// not for the extension (which carries the bearer ext_token). Keeping
// extension-only routes under /api/extension/* and dashboard-only
// routes elsewhere keeps each surface's auth model clean.
//
// Auth: Authorization: Bearer <ext_token>
// Tier: any (settings live regardless of plan).
//
// Schema for profiles.preferences.lens (Phase 5.4-E):
//   {
//     defaultUnit?: 'imperial' | 'metric'
//   }
// More keys land here as the popup gains items (column defaults, etc).
//
// GET response 200:
//   { ok: true, lens: { defaultUnit?: 'imperial' | 'metric' } }
//
// PATCH request body (partial — only fields the user changed):
//   { defaultUnit?: 'imperial' | 'metric' | null }   // null deletes
// PATCH response 200:
//   { ok: true, lens: <merged lens sub-object> }

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  corsPreflight,
  extensionResponse,
  resolveExtensionToken,
  withCors,
} from '@/lib/extensionAuth';
import { readLensPrefs } from '@/lib/extensionLensPrefs';

export const dynamic = 'force-dynamic';

const ALLOWED_UNITS = new Set(['imperial', 'metric']);

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 405 });
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveExtensionToken(request);
    if (!resolved) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      );
    }

    const lens = await readLensPrefs(resolved.userId);
    return extensionResponse(request, { ok: true, lens }, resolved);
  } catch (err) {
    console.error('extension/settings GET crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveExtensionToken(request);
    if (!resolved) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
      );
    }

    // Validate every incoming key against the small allowlist. Keeps
    // arbitrary client-supplied keys out of the lens sub-object —
    // future fields land here only after the schema above grows.
    const patch: Record<string, unknown> = {};
    if ('defaultUnit' in body) {
      const v = (body as any).defaultUnit;
      if (v === null) {
        patch.defaultUnit = null;
      } else if (typeof v === 'string' && ALLOWED_UNITS.has(v)) {
        patch.defaultUnit = v;
      } else {
        return withCors(
          request,
          NextResponse.json(
            { ok: false, error: 'defaultUnit must be "imperial", "metric", or null' },
            { status: 400 }
          )
        );
      }
    }

    if (Object.keys(patch).length === 0) {
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'No valid fields in patch' }, { status: 400 })
      );
    }

    // Read-modify-write the entire preferences blob, scoped to the
    // lens sub-key. Other top-level prefs (set by the dashboard's
    // /api/profiles/preferences route) are preserved untouched.
    const { data: current, error: readErr } = await supabaseAdmin
      .from('profiles')
      .select('preferences')
      .eq('id', resolved.userId)
      .maybeSingle();
    if (readErr) {
      console.error('extension/settings read failed:', readErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    const prefs = (current?.preferences as Record<string, unknown> | null) ?? {};
    const lens: Record<string, unknown> = {
      ...((prefs.lens as Record<string, unknown> | undefined) ?? {}),
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete lens[key];
      else lens[key] = value;
    }
    const nextPrefs = { ...prefs, lens };

    const { error: writeErr } = await supabaseAdmin
      .from('profiles')
      .update({ preferences: nextPrefs })
      .eq('id', resolved.userId);
    if (writeErr) {
      console.error('extension/settings write failed:', writeErr);
      return withCors(
        request,
        NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
      );
    }

    return extensionResponse(request, { ok: true, lens }, resolved);
  } catch (err) {
    console.error('extension/settings PATCH crashed:', err);
    return withCors(
      request,
      NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
    );
  }
}

