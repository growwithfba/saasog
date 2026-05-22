// =============================================================================
// POST /api/extension/install-link
// =============================================================================
// Mobile visitors on /extension can't install a Chrome extension on their
// phone. Instead of losing the lead, we email them the install link so they
// can open it on desktop. Doubles as a CRM capture for Meta-ad audiences.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'BloomEngine <noreply@bloomengine.ai>';
const LEAD_INBOX = 'support@bloomengine.ai';
const INSTALL_URL =
  'https://chromewebstore.google.com/detail/bloomengine/cighgincghljicihnhbhiehpngfpgbkg?utm_source=email&utm_medium=mobile-handoff';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Email service unavailable. Try again later.' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const utm = body?.utm && typeof body.utm === 'object' ? body.utm : {};

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid email address.' },
        { status: 400 }
      );
    }

    const resend = new Resend(apiKey);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Your BloomLens install link</h2>
        <p style="color: #475569; line-height: 1.6;">
          Open this email on your desktop computer and click the button below to install BloomLens from the Chrome Web Store.
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${INSTALL_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(90deg, #3b82f6, #10b981); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600;">
            Install BloomLens for Chrome
          </a>
        </p>
        <p style="color: #475569; line-height: 1.6; font-size: 14px;">
          BloomLens runs on Amazon search and product pages — instant scoring, BSR-validated sales estimates, save-to-funnel, and AI market analysis. Built by an active 7-figure Amazon seller.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
          You're getting this because you requested the install link at bloomengine.ai/extension. If this wasn't you, ignore this email — no account has been created.
        </p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      bcc: LEAD_INBOX,
      subject: 'Your BloomLens install link',
      html,
    });

    if (error) {
      console.error('[install-link] resend error', error);
      return NextResponse.json(
        { success: false, error: 'Could not send email. Try again.' },
        { status: 500 }
      );
    }

    // Light-touch lead notification (so Dave knows the form is converting).
    await resend.emails
      .send({
        from: FROM_EMAIL,
        to: LEAD_INBOX,
        subject: `[Extension LP] Mobile install-link requested: ${email}`,
        html: `<p>Email: <strong>${email}</strong></p><pre style="font-size:12px;background:#f8fafc;padding:8px;border-radius:6px;">${JSON.stringify(utm, null, 2)}</pre>`,
      })
      .catch((err) => console.error('[install-link] lead notify failed', err));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[install-link] error', err);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Try again.' },
      { status: 500 }
    );
  }
}
