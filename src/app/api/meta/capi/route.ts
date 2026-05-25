// =============================================================================
// POST /api/meta/capi — browser-callable Conversions API endpoint
// =============================================================================
// Thin wrapper around sendMetaCAPIEvent. Browser code (via fireMetaEvent in
// src/lib/meta.ts) POSTs here, we capture the request IP + User-Agent, then
// forward to Meta's Graph API server-side.
//
// Server code (e.g. /api/stripe/webhook) should call sendMetaCAPIEvent
// directly instead of HTTP-round-tripping through this route.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { sendMetaCAPIEvent } from '@/lib/meta-capi.server';
import type { CAPIRequestBody } from '@/lib/meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: CAPIRequestBody;
  try {
    body = (await request.json()) as CAPIRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  if (!body?.event_name || !body?.event_id) {
    return NextResponse.json(
      { ok: false, error: 'Missing event_name or event_id' },
      { status: 400 }
    );
  }

  // Capture request-scoped context the browser can't reliably send itself.
  // Vercel forwards the real client IP in x-forwarded-for; fall back to the
  // direct connection IP for local dev.
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const clientIp =
    forwardedFor.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  // Browser-side _fbc/_fbp may be missing from body if cookies are blocked;
  // try reading them from request cookies as a fallback.
  const fbcCookie = request.cookies.get('_fbc')?.value;
  const fbpCookie = request.cookies.get('_fbp')?.value;

  const result = await sendMetaCAPIEvent({
    event_name: body.event_name,
    event_id: body.event_id,
    event_source_url: body.event_source_url,
    action_source: 'website',
    user_data: {
      ...body.user_data,
      client_ip_address: clientIp,
      client_user_agent: userAgent,
      fbc: body.user_data?.fbc ?? fbcCookie,
      fbp: body.user_data?.fbp ?? fbpCookie,
    },
    custom_data: body.custom_data,
  });

  // Always return 200 to the browser — we don't want fetch retries or
  // surfaced errors disrupting the user. Status is in the body.
  return NextResponse.json(result);
}
