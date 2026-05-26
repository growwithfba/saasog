// =============================================================================
// Skool auto-invite — server-side sender (SERVER USE ONLY)
// =============================================================================
// Sends a member invite to the Grow With FBA Skool community via Skool's
// Webhook plugin. The plugin works by appending the member's email to a
// secret webhook URL; Skool then emails that address a one-click invite link
// that bypasses the manual approval queue.
//
// USAGE:
//  - From the Stripe webhook handler (/api/stripe/webhook): call when a
//    BloomEngine Pro subscription is created so the "BE Pro includes Skool"
//    promise is fulfilled with instant access.
//
// The webhook URL is a SECRET — anyone holding it can invite people to the
// group. It lives in SKOOL_INVITE_WEBHOOK_URL, never in source.
//
// NEVER import this from a client component — it reads a secret env var.
// =============================================================================

import 'server-only';

/** Mask an email for logs: dave@growwithfba.com → d***@growwithfba.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Invite a member to the Skool community by email.
 *
 * Best-effort: never throws. The webhook URL not being configured, or Skool
 * being down, must never crash the Stripe webhook or block a subscription
 * state update. We treat community access as eventually-consistent (Dave can
 * approve a stragglers manually, and the Zapier paid-member sync backs it up).
 */
export async function inviteMemberToSkool(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.SKOOL_INVITE_WEBHOOK_URL;

  if (!webhookUrl) {
    // Silent in production — env not configured yet. Loud locally.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[skool] skipping invite — SKOOL_INVITE_WEBHOOK_URL missing');
    }
    return { ok: false, error: 'SKOOL_INVITE_WEBHOOK_URL not configured' };
  }

  if (!email) {
    console.warn('[skool] skipping invite — no email provided');
    return { ok: false, error: 'no email provided' };
  }

  // The Skool Webhook plugin reads the invitee email from the `email` query
  // param. Using URL/searchParams handles any existing query string on the
  // base webhook URL and URL-encodes the address correctly.
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    console.error('[skool] SKOOL_INVITE_WEBHOOK_URL is not a valid URL');
    return { ok: false, error: 'invalid SKOOL_INVITE_WEBHOOK_URL' };
  }
  url.searchParams.set('email', email);

  try {
    const res = await fetch(url.toString(), { method: 'POST' });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      console.error('[skool] invite rejected', {
        email: maskEmail(email),
        status: res.status,
        body,
      });
      return { ok: false, error: `Skool returned ${res.status}: ${body}` };
    }

    console.log('[skool] invite sent', { email: maskEmail(email) });
    return { ok: true };
  } catch (err: any) {
    console.error('[skool] invite fetch failed', {
      email: maskEmail(email),
      error: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  }
}
