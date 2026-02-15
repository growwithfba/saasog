import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const SUPPORT_EMAIL = 'support@bloomengine.ai';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BloomEngine <noreply@bloomengine.ai>';

/**
 * POST /api/support
 * Sends a support request email to support@bloomengine.ai using Resend
 *
 * Body:
 * - name: string
 * - email: string
 * - subject: string
 * - message: string
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured');
      return NextResponse.json(
        { success: false, error: 'Email service is not configured. Please try again later.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and message are required' },
        { status: 400 }
      );
    }

    const resend = new Resend(apiKey);
    const emailSubject = subject ? `[Support] ${subject}` : '[Support] Support Request';

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b;">New Support Request</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        ${subject ? `<p><strong>Subject:</strong> ${subject}</p>` : ''}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <div style="white-space: pre-wrap; color: #334155; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #64748b; font-size: 12px;">Reply directly to this email to respond to the user.</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      replyTo: email,
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error('Support API error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
