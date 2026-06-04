// Free SMS via the carrier email-to-SMS gateway (no Twilio). Works because the
// recipient is David's own phone on a known carrier. Best-effort: gateways are
// spam-filtered and some carriers are deprecating them — fine for self-pings.
import { sendRaw } from './email';

export async function sendEmailToSms(text: string, inreach = false) {
  const gateway = inreach ? process.env.NOTIFY_INREACH : process.env.NOTIFY_SMS_GATEWAY;
  const label = inreach ? 'inreach' : 'sms-gateway';
  if (!gateway) {
    console.log(`[notifier:${label}] (no gateway) → ${text}`);
    return { ok: false, detail: `${label} not configured` };
  }
  // SMS has no subject; keep it short. inReach messages are even tighter.
  const trimmed = inreach ? text.slice(0, 140) : text.slice(0, 300);
  return sendRaw(gateway, '', trimmed);
}
