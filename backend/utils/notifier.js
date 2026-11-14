import { Resend } from 'resend';

let resendClient;
const testOutbox = [];
const useTestOutbox = () => process.env.NODE_ENV === 'test' && process.env.EMAIL_TRANSPORT === 'memory';

export function assertEmailConfigured() {
  if (useTestOutbox() || process.env.NODE_ENV !== 'production') return;
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_your_') || !process.env.EMAIL_FROM) {
    const error = new Error('Account email delivery is not configured. Please contact the administrator.');
    error.statusCode = 503;
    throw error;
  }
}

/** Test-only transport. There is deliberately no HTTP endpoint exposing this outbox. */
export function getTestEmails(email) {
  if (!useTestOutbox()) throw new Error('The test outbox is unavailable outside test mode.');
  return testOutbox.filter((message) => !email || message.email === email).map((message) => ({ ...message }));
}

async function send(email, subject, html, secrets) {
  assertEmailConfigured();
  if (useTestOutbox()) {
    testOutbox.push({ email, subject, ...secrets, createdAt: new Date() });
    return true;
  }
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_your_')) {
    // Explicit development transport; never log credentials or verification secrets in production.
    if (process.env.NODE_ENV === 'production') assertEmailConfigured();
    console.info(`[Email development transport] ${subject} for ${email}; code: ${secrets.code}`);
    return true;
  }
  resendClient ||= new Resend(process.env.RESEND_API_KEY);
  const result = await resendClient.emails.send({
    from: process.env.EMAIL_FROM || 'Mtaa Fix <noreply@communityreporting.org>',
    to: email, subject, html,
  });
  if (result.error) throw new Error(`Email delivery failed: ${result.error.message}`);
  return true;
}

export async function sendVerificationEmail({ email, code, token }) {
  const base = process.env.CITIZEN_APP_URL || 'http://localhost:3000';
  const link = `${base.replace(/\/$/, '')}/create-account?token=${encodeURIComponent(token)}`;
  return send(email, 'Verify your Mtaa Fix account', `
    <h2>Welcome to Mtaa Fix</h2>
    <p>Verify your email to submit and track community reports.</p>
    <p>Your verification code: <strong>${code}</strong></p>
    <p><a href="${link}">Verify my email</a></p>
    <p>This code expires in 30 minutes. If you did not register, ignore this email.</p>
  `, { code, token });
}

export async function sendPasswordResetEmail({ email, token, code }) {
  const base = process.env.CITIZEN_APP_URL || 'http://localhost:3000';
  const link = `${base.replace(/\/$/, '')}/forgot-password?token=${encodeURIComponent(token)}`;
  return send(email, 'Reset your Mtaa Fix password', `
    <h2>Password reset request</h2>
    <p>Use this code to reset your password: <strong>${code}</strong></p>
    <p><a href="${link}">Choose a new password</a></p>
    <p>This code expires in one hour. If you did not request a reset, ignore this email.</p>
  `, { code, token });
}

export default { sendVerificationEmail, sendPasswordResetEmail, assertEmailConfigured, getTestEmails };
