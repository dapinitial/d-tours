// Email adapter via nodemailer. Powers both real email and the email-to-SMS
// gateway trick. No SMTP configured → no-op (logs in dev) so the app still runs.
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.NOTIFY_FROM ?? 'Shotgun <shotgun@spacelabforever.com>';

let transporter: nodemailer.Transporter | null = null;
function getTransport() {
  if (!host || !user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendRaw(to: string, subject: string, text: string) {
  const t = getTransport();
  if (!t) {
    console.log(`[notifier:email] (no SMTP) → ${to}: ${subject}\n${text}`);
    return { ok: false, detail: 'SMTP not configured' };
  }
  await t.sendMail({ from, to, subject, text });
  return { ok: true, detail: `sent to ${to}` };
}

export async function sendEmail(subject: string, body: string) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) return { ok: false, detail: 'NOTIFY_EMAIL unset' };
  return sendRaw(to, subject, body);
}
