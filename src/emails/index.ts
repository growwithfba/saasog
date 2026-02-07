// Email Templates - Export all templates from here

export * from './templates/welcome';
export * from './templates/paymentError';

// Example usage with different email services:

/*
// Using Resend
import { Resend } from 'resend';
import { getWelcomeEmailHtml, getWelcomeEmailSubject, getWelcomeEmailText } from '@/emails';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'BloomEngine <noreply@bloomengine.ai>',
  to: userEmail,
  subject: getWelcomeEmailSubject(userName),
  html: getWelcomeEmailHtml({ userName, userEmail }),
  text: getWelcomeEmailText({ userName, userEmail }),
});

// Using SendGrid
import sgMail from '@sendgrid/mail';
import { getPaymentErrorEmailHtml, getPaymentErrorEmailSubject } from '@/emails';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: userEmail,
  from: 'billing@bloomengine.ai',
  subject: getPaymentErrorEmailSubject('declined'),
  html: getPaymentErrorEmailHtml({ 
    userName, 
    userEmail, 
    errorType: 'declined',
    lastFourDigits: '4242',
    amount: '$29.99'
  }),
});

// Using Nodemailer
import nodemailer from 'nodemailer';
import { getWelcomeEmailHtml, getWelcomeEmailSubject } from '@/emails';

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

await transporter.sendMail({
  from: '"BloomEngine" <noreply@bloomengine.ai>',
  to: userEmail,
  subject: getWelcomeEmailSubject(userName),
  html: getWelcomeEmailHtml({ userName, userEmail }),
  text: getWelcomeEmailText({ userName, userEmail }),
});
*/

