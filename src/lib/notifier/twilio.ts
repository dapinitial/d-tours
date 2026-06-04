// Twilio adapter — DARK STUB for v1. We deliberately avoid Twilio (and its 10DLC
// registration) until we need reliable SMS to *third parties* or go commercial.
// Drop-in: set TWILIO_* env vars and implement the fetch below. See SPEC §18.
export async function sendTwilio(text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { ok: false, detail: 'twilio disabled (by design in v1)' };
  }
  // TODO: POST to https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
  console.log(`[notifier:twilio] would send → ${text}`);
  return { ok: false, detail: 'twilio not implemented (stub)' };
}
