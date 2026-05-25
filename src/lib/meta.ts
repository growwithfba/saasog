// =============================================================================
// Meta Pixel + Conversions API — shared helpers
// =============================================================================
// Single source of truth for our 5 paid-ad conversion events. Used by both the
// browser Pixel (via `fireMetaEvent`) and the server CAPI route.
//
// Architecture:
//  - Each conversion fires TWICE — once browser-side (Pixel), once server-side
//    (CAPI). Both carry the same `event_id` so Meta dedupes them to one
//    counted conversion. This is the recommended pattern for surviving ad
//    blockers + iOS 14.5+ tracking restrictions.
//  - Pixel ID is public (NEXT_PUBLIC_) — embedded in browser code.
//  - CAPI access token is SECRET — server-only, never sent to browser.
//
// See: marketing/Master-Playbook-Week-by-Week.md §3 Friday-launch checklist.
// =============================================================================

/** Five Meta standard events we fire across the funnel. */
export type MetaEventName =
  | 'PageView'
  | 'Lead'
  | 'StartTrial'
  | 'Subscribe'
  | 'Purchase';

/** Custom data sent with the event (value/currency/category). */
export interface MetaCustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  subscription_id?: string;
}

/** Customer info used by Meta to match the event to a Facebook account. */
export interface MetaUserData {
  email?: string;          // hashed before sending
  first_name?: string;     // hashed before sending
  last_name?: string;      // hashed before sending
  external_id?: string;    // hashed before sending (we send Supabase user_id)
  fbc?: string;            // _fbc cookie value — DO NOT hash
  fbp?: string;            // _fbp cookie value — DO NOT hash
}

/** Payload our `/api/meta/capi` endpoint accepts from the browser. */
export interface CAPIRequestBody {
  event_name: MetaEventName;
  event_id: string;
  event_source_url: string;
  user_data?: MetaUserData;
  custom_data?: MetaCustomData;
}

// -----------------------------------------------------------------------------
// Browser-side helpers (safe to import from client components)
// -----------------------------------------------------------------------------

/** Generate a unique event_id for browser+server dedup. */
export function generateEventId(): string {
  // crypto.randomUUID is available in all modern browsers + Node 19+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments (shouldn't be needed in 2026)
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Read a cookie by name (browser only). Returns undefined server-side. */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp('(^| )' + name + '=([^;]+)')
  );
  return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * Fire a Meta event from the browser. Sends to both:
 *  1. Browser Pixel (via fbq) — visible in Test Events as "Browser"
 *  2. Server CAPI (via fetch to /api/meta/capi) — visible as "Server"
 * Both calls share the same event_id so Meta dedupes them.
 *
 * Best-effort: never throws, never blocks the UI. Pixel/CAPI failures are
 * silent — paid-ad attribution isn't worth crashing a user's checkout over.
 */
export function fireMetaEvent(
  eventName: MetaEventName,
  options: {
    customData?: MetaCustomData;
    userData?: Omit<MetaUserData, 'fbc' | 'fbp'>; // cookies read automatically
  } = {}
): void {
  if (typeof window === 'undefined') return;

  const eventId = generateEventId();
  const fbc = readCookie('_fbc');
  const fbp = readCookie('_fbp');

  // 1. Fire browser Pixel
  try {
    const fbq = (window as any).fbq;
    if (typeof fbq === 'function') {
      fbq('track', eventName, options.customData ?? {}, {
        eventID: eventId,
      });
    }
  } catch (err) {
    // Don't crash the UI if fbq is missing or throws.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[meta] browser fbq failed:', err);
    }
  }

  // 2. Fire server CAPI (fire-and-forget — don't await)
  try {
    const body: CAPIRequestBody = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      user_data: {
        ...options.userData,
        ...(fbc ? { fbc } : {}),
        ...(fbp ? { fbp } : {}),
      },
      custom_data: options.customData,
    };
    void fetch('/api/meta/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true, // survives page unload (e.g. user clicks CTA + navigates)
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[meta] CAPI fetch failed:', err);
    }
  }
}
