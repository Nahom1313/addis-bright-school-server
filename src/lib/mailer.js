import nodemailer from 'nodemailer';

const getTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // FIX: without these, a stuck/unresponsive connection to Gmail hangs
      // forever instead of erroring — the request never resolves and the
      // browser eventually cancels it (visible as HTTP 499 in Railway logs,
      // with the server never logging a response at all).
      connectionTimeout: 10000, // fail if we can't even open the TCP connection in 10s
      greetingTimeout:   10000, // fail if the SMTP server doesn't say hello in 10s
      socketTimeout:     15000, // fail if the socket goes idle mid-send for 15s
    });
  }
  return null;
};

const sendMail = async (to, subject, html) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`\n📧 [DEV] Email to: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log('🔗 (configure SMTP_HOST/USER/PASS to send real emails)\n');
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Addis Bright School" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    // FIX: surface the real SMTP error in logs instead of letting it
    // propagate as a generic failure with no diagnostic info
    console.error(`✉️  Failed to send email to ${to}: ${err.code || ''} ${err.message}`);
    throw err;
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
