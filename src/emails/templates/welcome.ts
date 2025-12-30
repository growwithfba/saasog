// Welcome Email Template - Sent when a user creates an account

export interface WelcomeEmailProps {
  userName: string;
  userEmail: string;
  loginUrl?: string;
}

export const getWelcomeEmailSubject = (userName: string) => 
  `Welcome to SaasOG, ${userName}! 🚀`;

export const getWelcomeEmailHtml = ({ userName, userEmail, loginUrl = 'https://app.saasog.com/login' }: WelcomeEmailProps) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SaasOG</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0f172a;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);">
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                🎉 Welcome to SaasOG!
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #f1f5f9; line-height: 1.6;">
                Hi <strong style="color: #3b82f6;">${userName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #cbd5e1; line-height: 1.6;">
                We're thrilled to have you join the SaasOG family! Your account has been successfully created with the email <strong style="color: #f1f5f9;">${userEmail}</strong>.
              </p>
              
              <p style="margin: 0 0 30px; font-size: 16px; color: #cbd5e1; line-height: 1.6;">
                With SaasOG, you're now equipped with powerful tools to:
              </p>
              
              <!-- Features List -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px; margin-bottom: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" style="vertical-align: top;">
                          <span style="font-size: 20px;">🔍</span>
                        </td>
                        <td style="color: #e2e8f0; font-size: 14px;">
                          <strong>Research Products</strong> - Find winning products with AI-powered analysis
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" style="vertical-align: top;">
                          <span style="font-size: 20px;">✅</span>
                        </td>
                        <td style="color: #e2e8f0; font-size: 14px;">
                          <strong>Vet Products</strong> - Deep dive into market opportunities
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" style="vertical-align: top;">
                          <span style="font-size: 20px;">📦</span>
                        </td>
                        <td style="color: #e2e8f0; font-size: 14px;">
                          <strong>Build Offers</strong> - Create compelling product offers with SSP builder
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: #1e293b; border-radius: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" style="vertical-align: top;">
                          <span style="font-size: 20px;">🛒</span>
                        </td>
                        <td style="color: #e2e8f0; font-size: 14px;">
                          <strong>Source Products</strong> - Connect with verified suppliers
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
                    <a href="${loginUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                      Get Started Now →
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; color: #94a3b8; line-height: 1.6; text-align: center;">
                Need help getting started? Check out our <a href="#" style="color: #3b82f6; text-decoration: none;">quick start guide</a> or reach out to our support team.
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
                You received this email because you signed up for a SaasOG account.
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

export const getWelcomeEmailText = ({ userName, userEmail, loginUrl = 'https://app.saasog.com/login' }: WelcomeEmailProps) => `
Welcome to SaasOG, ${userName}! 🎉

We're thrilled to have you join the SaasOG family! Your account has been successfully created with the email ${userEmail}.

With SaasOG, you're now equipped with powerful tools to:

🔍 Research Products - Find winning products with AI-powered analysis
✅ Vet Products - Deep dive into market opportunities
📦 Build Offers - Create compelling product offers with SSP builder
🛒 Source Products - Connect with verified suppliers

Get started now: ${loginUrl}

Need help? Check out our quick start guide or reach out to our support team.

---
© ${new Date().getFullYear()} SaasOG. All rights reserved.
You received this email because you signed up for a SaasOG account.
`;

