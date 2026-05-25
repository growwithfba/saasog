// =============================================================================
// Meta Conversions API — server-side sender (SERVER USE ONLY)
// =============================================================================
// Sends events to Meta's Graph API server-to-server, bypassing browsers + ad
// blockers + iOS tracking restrictions. Pairs with the browser Pixel snippet
// for deduplicated double-firing.
//
// USAGE:
//  - From an API route (e.g. /api/meta/capi): forward browser-originated
//    events here.
//  - From a webhook handler (e.g. /api/stripe/webhook): call directly to
//    avoid an unnecessary HTTP round-trip back to ourselves.
//
// NEVER import this from a client component — it uses node:crypto + the
// secret META_CAPI_TOKEN env var.
// =============================================================================

import { createHash } from 'crypto';
import type { MetaEventName, MetaCustomData, MetaUserData } from './meta';

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Shape of a single event sent to Meta's Graph API. */
interface MetaCAPIEvent {
  event_name: MetaEventName;
  event_time: number; // unix seconds
  event_id: string;
  event_source_url?: string;
  action_source: 'website' | 'system_generated';
  user_data: {
    em?: string[];
    fn?: string[];
    ln?: string[];
    external_id?: string[];
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    subscription_id?: string;
  };
  custom_data?: MetaCustomData;
}

/** Input we accept from callers — un-hashed PII + raw request context. */
export interface SendMetaCAPIInput {
  event_name: MetaEventName;
  event_id: string;
  event_source_url?: string;
  action_source?: 'website' | 'system_generated';
  user_data?: MetaUserData & {
    subscription_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data?: MetaCustomData;
  event_time?: number; // override for backfilled events; defaults to now
}

/** Hash a string with SHA-256 (lowercase) as Meta requires. */
function hashPII(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

/**
 * Send a single event to Meta's Conversions API.
 *
 * Best-effort: never throws. Failures are logged + swallowed so a downed
 * Meta endpoint can't crash our Stripe webhook handler or break user
 * checkout. We treat ad attribution as eventually-consistent.
 */
export async function sendMetaCAPIEvent(
  input: SendMetaCAPIInput
): Promise<{ ok: boolean; error?: string; metaResponse?: unknown }> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    // Silent in production — env not configured yet. Loud locally.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[meta-capi] skipping event — META env vars missing',
        { hasPixelId: !!pixelId, hasToken: !!accessToken }
      );
    }
    return { ok: false, error: 'META env vars not configured' };
  }

  // Build the user_data block — hash PII fields, leave cookies + IP + UA raw.
  const u = input.user_data ?? {};
  const userData: MetaCAPIEvent['user_data'] = {};
  if (u.email) userData.em = [hashPII(u.email)];
  if (u.first_name) userData.fn = [hashPII(u.first_name)];
  if (u.last_name) userData.ln = [hashPII(u.last_name)];
  if (u.external_id) userData.external_id = [hashPII(u.external_id)];
  if (u.client_ip_address) userData.client_ip_address = u.client_ip_address;
  if (u.client_user_agent) userData.client_user_agent = u.client_user_agent;
  if (u.fbc) userData.fbc = u.fbc;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.subscription_id) userData.subscription_id = u.subscription_id;

  const event: MetaCAPIEvent = {
    event_name: input.event_name,
    event_time: input.event_time ?? Math.floor(Date.now() / 1000),
    event_id: input.event_id,
    event_source_url: input.event_source_url,
    action_source: input.action_source ?? 'website',
    user_data: userData,
    custom_data: input.custom_data,
  };

  const payload: {
    data: MetaCAPIEvent[];
    test_event_code?: string;
  } = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;

  const endpoint = `${META_GRAPH_URL}/${pixelId}/events?access_token=${accessToken}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '<unreadable>');
      console.error('[meta-capi] event rejected by Meta', {
        event_name: input.event_name,
        event_id: input.event_id,
        status: res.status,
        body: errorText,
      });
      return { ok: false, error: `Meta returned ${res.status}: ${errorText}` };
    }

    const json = await res.json().catch(() => ({}));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[meta-capi] event sent', {
        event_name: input.event_name,
        event_id: input.event_id,
        meta: json,
      });
    }
    return { ok: true, metaResponse: json };
  } catch (err: any) {
    console.error('[meta-capi] fetch failed', {
      event_name: input.event_name,
      event_id: input.event_id,
      error: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  }
}
