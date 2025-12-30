// Payment Error Email Template - Sent when there's a payment issue

export interface PaymentErrorEmailProps {
  userName: string;
  userEmail: string;
  errorType: 'declined' | 'expired' | 'insufficient_funds' | 'processing_error' | 'generic';
  lastFourDigits?: string;
  amount?: string;
  billingUrl?: string;
  supportEmail?: string;
}

const errorMessages: Record<string, { title: string; description: string }> = {
  declined: {
    title: 'Payment Declined',
    description: 'Your card was declined by your bank. This can happen for various security reasons.',
  },
  expired: {
    title: 'Card Expired',
    description: 'The payment card on file has expired.',
  },
  insufficient_funds: {
    title: 'Insufficient Funds',
    description: 'There were insufficient funds available on your card.',
  },
  processing_error: {
    title: 'Processing Error',
    description: 'We encountered an error while processing your payment.',
  },
  generic: {
    title: 'un',
    description: 'We were unable to process your payment.',
  },
};

export const getPaymentErrorEmailSubject = (errorType: string) => {
  const error = errorMessages[errorType] || errorMessages.generic;
  return `⚠️ Action Required: ${error.title}`;
};

export const getPaymentErrorEmailHtml = ({
  userName,
  userEmail,
  errorType,
  lastFourDigits,
  amount,
  billingUrl = 'https://app.saasog.com/subscription',
  supportEmail = 'support@saasog.com',
}: PaymentErrorEmailProps) => {
  const error = errorMessages[errorType] || errorMessages.generic;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${error.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0f172a;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
              <div style="width: 64px; height: 64px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">⚠️</span>
              </div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                ${error.title}
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #f1f5f9; line-height: 1.6;">
                Hi <strong style="color: #f87171;">${userName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #cbd5e1; line-height: 1.6;">
                ${error.description}
              </p>
              
              <!-- Error Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px; background-color: #1e293b; border-radius: 12px; border: 1px solid #475569;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 16px; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">
                      Payment Details
                    </h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155;">
                          <span style="color: #94a3b8; font-size: 14px;">Account</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155; text-align: right;">
                          <span style="color: #f1f5f9; font-size: 14px;">${userEmail}</span>
                        </td>
                      </tr>
                      ${lastFourDigits ? `
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155;">
                          <span style="color: #94a3b8; font-size: 14px;">Card</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155; text-align: right;">
                          <span style="color: #f1f5f9; font-size: 14px;">•••• •••• •••• ${lastFourDigits}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${amount ? `
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155;">
                          <span style="color: #94a3b8; font-size: 14px;">Amount</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #334155; text-align: right;">
                          <span style="color: #f1f5f9; font-size: 14px; font-weight: 600;">${amount}</span>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #94a3b8; font-size: 14px;">Status</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="display: inline-block; padding: 4px 12px; background-color: #7f1d1d; color: #fca5a5; font-size: 12px; font-weight: 600; border-radius: 9999px;">
                            Failed
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- What to do section -->
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #f1f5f9;">
                What you can do:
              </h3>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="30" style="vertical-align: top; color: #3b82f6; font-weight: bold;">1.</td>
                        <td style="color: #e2e8f0; font-size: 14px; line-height: 1.5;">
                          <strong>Update your payment method</strong> - Add a new card or update your existing payment information.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="30" style="vertical-align: top; color: #3b82f6; font-weight: bold;">2.</td>
                        <td style="color: #e2e8f0; font-size: 14px; line-height: 1.5;">
                          <strong>Contact your bank</strong> - If you believe this is an error, please contact your bank to authorize the transaction.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="30" style="vertical-align: top; color: #3b82f6; font-weight: bold;">3.</td>
                        <td style="color: #e2e8f0; font-size: 14px; line-height: 1.5;">
                          <strong>Try again</strong> - Once resolved, we'll automatically retry your payment.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${billingUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                      Update Payment Method →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Warning Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                <tr>
                  <td style="padding: 16px; background-color: #7f1d1d; border-radius: 8px; border: 1px solid #b91c1c;">
                    <p style="margin: 0; font-size: 14px; color: #fecaca; line-height: 1.5;">
                      <strong>⏰ Important:</strong> Please update your payment information within 7 days to avoid service interruption. Your access to premium features will be paused until the payment is resolved.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; color: #94a3b8; line-height: 1.6; text-align: center;">
                Need help? Contact our support team at <a href="mailto:${supportEmail}" style="color: #3b82f6; text-decoration: none;">${supportEmail}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #0f172a; border-top: 1px solid #334155;">
              <p style="margin: 0 0 10px; font-size: 12px; color: #64748b; text-align: center;">
                © ${new Date().getFullYear()} SaasOG. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">
                You received this email because there was an issue with your SaasOG subscription payment.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const getPaymentErrorEmailText = ({
  userName,
  userEmail,
  errorType,
  lastFourDigits,
  amount,
  billingUrl = 'https://app.saasog.com/subscription',
  supportEmail = 'support@saasog.com',
}: PaymentErrorEmailProps) => {
  const error = errorMessages[errorType] || errorMessages.generic;
  
  return `
⚠️ ${error.title}

Hi ${userName},

${error.description}

PAYMENT DETAILS
---------------
Account: ${userEmail}
${lastFourDigits ? `Card: •••• •••• •••• ${lastFourDigits}` : ''}
${amount ? `Amount: ${amount}` : ''}
Status: Failed

WHAT YOU CAN DO:
1. Update your payment method - Add a new card or update your existing payment information.
2. Contact your bank - If you believe this is an error, please contact your bank to authorize the transaction.
3. Try again - Once resolved, we'll automatically retry your payment.

Update your payment method: ${billingUrl}

⏰ IMPORTANT: Please update your payment information within 7 days to avoid service interruption. Your access to premium features will be paused until the payment is resolved.

Need help? Contact our support team at ${supportEmail}

---
© ${new Date().getFullYear()} SaasOG. All rights reserved.
You received this email because there was an issue with your SaasOG subscription payment.
`;
};

