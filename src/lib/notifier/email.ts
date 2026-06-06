// Email adapter. Prefers Resend (HTTP API — no SMTP needed) when RESEND_API_KEY
// is set, falls back to nodemailer/SMTP, else no-ops (logs in dev) so the app
// still runs. Powers welcome emails, the digest, and the email→SMS gateway.
import nodemailer from 'nodemailer';

const RESEND_KEY = process.env.RESEND_API_KEY;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
// From: NOTIFY_FROM if set, else the Gmail/SMTP user (Gmail rewrites From to the
// authenticated account anyway), else Resend's test sender. So with Gmail SMTP
// configured, From is your own address automatically — no extra config needed.
const from = process.env.NOTIFY_FROM ?? user ?? 'D-Tours <onboarding@resend.dev>';

let transporter: nodemailer.Transporter | null = null;
function getTransport() {
  if (!host || !user || !pass) return null;
  if (!transporter) transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

export async function sendRaw(to: string, subject: string, text: string) {
  // Resend (HTTP) — preferred.
  if (RESEND_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (r.ok) return { ok: true, detail: `resend → ${to}` };
      console.error('[email:resend]', r.status, await r.text());
      return { ok: false, detail: `resend ${r.status}` };
    } catch (e: any) {
      console.error('[email:resend]', e?.message ?? e);
      return { ok: false, detail: 'resend error' };
    }
  }
  // SMTP fallback.
  const t = getTransport();
  if (!t) {
    console.log(`[notifier:email] (no provider) → ${to}: ${subject}\n${text}`);
    return { ok: false, detail: 'no email provider configured' };
  }
  await t.sendMail({ from, to, subject, text });
  return { ok: true, detail: `smtp → ${to}` };
}

export async function sendEmail(subject: string, body: string) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) return { ok: false, detail: 'NOTIFY_EMAIL unset' };
  return sendRaw(to, subject, body);
}
