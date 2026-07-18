// Railway (like most cloud hosts) blocks outbound traffic on raw SMTP ports
// (587/465) by default to prevent the platform being abused for spam — this
// is why nodemailer connections to Gmail/Resend's SMTP servers were timing
// out (ETIMEDOUT) regardless of which provider or credentials were used.
// Resend's HTTP API sidesteps this entirely since it's a normal HTTPS
// request on port 443, which is never blocked.
const RESEND_API_URL = 'https://api.resend.com/emails';

const sendMail = async (to, subject, html) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n📧 [DEV] Email to: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log('🔗 (configure RESEND_API_KEY to send real emails)\n');
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // "onboarding@resend.dev" works immediately with no setup, but only
      // delivers to the email address you signed up to Resend with, until
      // you verify a real domain in the Resend dashboard.
      from: process.env.RESEND_FROM || 'Addis Bright School <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`✉️  Failed to send email to ${to}: HTTP ${res.status} ${body}`);
    throw new Error(`Resend API error: ${res.status}`);
  }
};

export const sendResetEmail = async (toEmail, firstName, resetUrl) => {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#92400e;">Addis Bright School</h2>
      <p>Hi ${firstName},</p>
      <p>You requested a password reset. Click the button below — this link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        Reset Password
      </a>
      <p style="color:#6b7280;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:11px;">Addis Bright School Management Platform</p>
    </div>
  `;
  await sendMail(toEmail, 'Password Reset Request', html);
};

// FIX: Email verification mailer
export const sendVerificationEmail = async (toEmail, firstName, verifyUrl) => {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#92400e;">Addis Bright School</h2>
      <p>Hi ${firstName},</p>
      <p>Welcome! Please verify your email address to activate your account. This link expires in <strong>24 hours</strong>.</p>
      <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        Verify Email
      </a>
      <p style="color:#6b7280;font-size:12px;">If you didn't create an account, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:11px;">Addis Bright School Management Platform</p>
    </div>
  `;
  await sendMail(toEmail, 'Verify Your Email Address', html);
};
