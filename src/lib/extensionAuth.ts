// =============================================================================
// BloomEngine Extension Auth — shared helpers
// =============================================================================
// Backs the /api/extension/* routes. Centralises:
//   - CORS allowlist + preflight handling
//   - Bearer token hashing + lookup
//   - Silent token refresh when <30 days remain
//
// All routes under /api/extension/* should call:
//   const corsCheck = corsPreflight(request);
//   if (corsCheck) return corsCheck;
//   ...handler...
//   return withCors(request, NextResponse.json(...));

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import type { Tier } from './subscription/tiers';

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------

// Static allowlist of extension origins. The published Chrome Web Store
// extension ID is stable for the life of the listing. Local dev still
// needs EXTENSION_DEV_ALLOW_ANY=1 in .env.local because the dev-build
// extension ID differs from the published one.
const ALLOWED_EXTENSION_ORIGINS = new Set<string>([
  // BloomLens — Chrome Web Store published extension ID
  'chrome-extension://cighgincghljicihnhbhiehpngfpgbkg',
]);

// Amazon origins that Bloom Lens content-scripts run in. Manifest V3
// content scripts inherit the host page's origin on fetch(), so the
// drawer's calls to /api/extension/* arrive with Origin:
// https://www.amazon.com (not the chrome-extension:// origin).
// CORS allow-listing here is not a security relaxation — the bearer
// token in the Authorization header is the real auth gate, and tokens
// live in chrome.storage which third-party scripts on Amazon can't
// reach. Phase 5.4-D scope is US Amazon only; add international TLDs
// here when Bloom Lens extends beyond .com.
const ALLOWED_AMAZON_ORIGINS = new Set<string>([
  'https://www.amazon.com',
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_EXTENSION_ORIGINS.has(origin)) return true;
  if (ALLOWED_AMAZON_ORIGINS.has(origin)) return true;
  if (
    process.env.EXTENSION_DEV_ALLOW_ANY === '1' &&
    origin.startsWith('chrome-extension://')
  ) {
    return true;
  }
  return false;
}

/**
 * If the request is an OPTIONS preflight from an allowed extension
 * origin, returns a 204 with the right CORS headers. Otherwise returns
 * null and the caller should proceed with normal handling.
 */
export function corsPreflight(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin!);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
  headers.set('Access-Control-Max-Age', '86400');
  return new NextResponse(null, { status: 204, headers });
}

/**
 * Wraps a NextResponse with the right CORS headers for an extension
 * caller. No-op if the origin isn't an allowed extension.
 */
export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin!);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

// -----------------------------------------------------------------------------
// Token generation + hashing
// -----------------------------------------------------------------------------

const TOKEN_LIFETIME_DAYS = 90;
const TOKEN_REFRESH_THRESHOLD_DAYS = 30;
const PAIR_CODE_LIFETIME_MINUTES = 5;

export const TOKEN_REFRESH_HEADER = 'x-bloomengine-ext-token-refresh';

export function generateRawToken(): string {
  // 48 bytes = 64 base64url chars. Plenty of entropy.
  return randomBytes(48).toString('base64url');
}

export function generatePairCode(): string {
  // Shorter, URL-friendly. 24 bytes = 32 base64url chars.
  return randomBytes(24).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function tokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_LIFETIME_DAYS);
  return d;
}

export function pairCodeExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + PAIR_CODE_LIFETIME_MINUTES);
  return d;
}

function shouldRefresh(expiresAt: string | Date): boolean {
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + TOKEN_REFRESH_THRESHOLD_DAYS);
  return exp < threshold;
}

// -----------------------------------------------------------------------------
// Bearer token validation
// -----------------------------------------------------------------------------

export type ResolvedExtensionToken = {
  userId: string;
  tokenRowId: string;
  expiresAt: string;
  refreshedToken?: string; // set when we silently rotated
};

/**
 * Looks up the bearer token in extension_tokens, validates it's not
 * expired or revoked, updates last_used_at, and silently rotates it
 * if expiry is less than TOKEN_REFRESH_THRESHOLD_DAYS away.
 *
 * Returns null if the token is missing, malformed, expired, or revoked.
 * Callers should treat null as 401.
 */
export async function resolveExtensionToken(
  request: NextRequest
): Promise<ResolvedExtensionToken | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const raw = authHeader.slice(7).trim();
  if (!raw) return null;

  const tokenHash = hashToken(raw);

  const { data: row, error } = await supabaseAdmin
    .from('extension_tokens')
    .select('id, user_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  // Update last_used_at (fire and forget — don't block the response).
  supabaseAdmin
    .from('extension_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => {});

  let refreshedToken: string | undefined;
  let expiresAt = row.expires_at;

  // Silent refresh: if <30 days remain, mint a new token and revoke
  // this one. The new token rides back on a response header; the
  // extension swaps it in and uses it next call.
  if (shouldRefresh(row.expires_at)) {
    const newRaw = generateRawToken();
    const newHash = hashToken(newRaw);
    const newExpiry = tokenExpiry();

    const { error: insertErr } = await supabaseAdmin
      .from('extension_tokens')
      .insert({
        user_id: row.user_id,
        token_hash: newHash,
        expires_at: newExpiry.toISOString(),
        user_agent: request.headers.get('user-agent') ?? null,
      });

    if (!insertErr) {
      await supabaseAdmin
        .from('extension_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', row.id);
      refreshedToken = newRaw;
      expiresAt = newExpiry.toISOString();
    }
  }

  return {
    userId: row.user_id,
    tokenRowId: row.id,
    expiresAt,
    refreshedToken,
  };
}

/**
 * Wraps a NextResponse with both the CORS headers and (if present) the
 * refreshed-token header. Use this for every authenticated extension
 * route response so the silent refresh is delivered.
 */
export function extensionResponse(
  request: NextRequest,
  body: unknown,
  resolved: ResolvedExtensionToken,
  init?: ResponseInit
): NextResponse {
  const res = NextResponse.json(body, init);
  if (resolved.refreshedToken) {
    res.headers.set(TOKEN_REFRESH_HEADER, resolved.refreshedToken);
    // Expose the custom header to the extension (CORS).
    res.headers.set('Access-Control-Expose-Headers', TOKEN_REFRESH_HEADER);
  }
  return withCors(request, res);
}

// -----------------------------------------------------------------------------
// Plan / feature derivation
// -----------------------------------------------------------------------------

export type LensTier = 'free' | 'core' | 'pro';

export type LensFeatures = {
  canExportCsv: boolean;
  canSaveFunnel: boolean;
  canVetMarket: boolean;
  searchesPerMonth: number | null; // null = unlimited
};

// Minimum profile shape needed to derive a Lens tier. All five
// /api/extension/* routes that gate behavior must select these columns.
export type LensProfileFields = {
  tier: Tier | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

/**
 * Display tier — what the popup badge shows ("Free" / "Core" / "Pro").
 *
 * Rule #14: this is the user's stored tier, NOT effectiveTier. A user
 * mid-trial on the Core plan sees "Core" here, not "Pro" — the trial
 * grants Pro *features* but the customer purchased Core. Only callers
 * that need to gate features should use `deriveEffectiveLensTier`.
 *
 * Returns 'free' when the user has no active subscription regardless
 * of stored tier — a canceled-but-was-Pro user should see the upsell.
 */
export function deriveLensTier(profile: LensProfileFields | null): LensTier {
  if (!profile) return 'free';
  const isPaying =
    profile.subscription_status === 'ACTIVE' ||
    profile.subscription_status === 'TRIALING';
  if (!isPaying) return 'free';
  return profile.tier ?? 'core';
}

/**
 * Effective tier — what governs feature gating. Mirrors
 * `getTierState().effectiveTier` from src/lib/subscription/state.ts:
 * users in an active trial get Pro features regardless of stored tier.
 * Used by all server-side gates (Save to Funnel, Analyze Market, CSV
 * export). Never use this for display copy.
 */
export function deriveEffectiveLensTier(profile: LensProfileFields | null): LensTier {
  if (!profile) return 'free';
  const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const isInTrial = !!(trialEndsAt && trialEndsAt.getTime() > Date.now());
  if (isInTrial) return 'pro';
  return deriveLensTier(profile);
}

export function lensFeatures(tier: LensTier): LensFeatures {
  switch (tier) {
    case 'pro':
    case 'core':
      return {
        canExportCsv: true,
        canSaveFunnel: true,
        canVetMarket: true,
        searchesPerMonth: null,
      };
    case 'free':
    default:
      return {
        canExportCsv: false,
        canSaveFunnel: false,
        canVetMarket: false,
        searchesPerMonth: 5,
      };
  }
}
