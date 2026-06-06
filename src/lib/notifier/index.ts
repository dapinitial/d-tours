// Shotgun's outbound comms. One message, routed to whatever can reach David
// right now. Channel priority is tier-aware:
//   at the rig (Starlink)  → email (rich)
//   cell, no dish          → iMessage / email-to-SMS (short)
//   truly off-grid         → inReach (one-line)
//
// Each adapter is best-effort and returns whether it (probably) delivered.
// Twilio is intentionally a dark stub for v1 — NO Twilio until we need reliable
// SMS to third parties. See SPEC §18.
import { sendEmail } from './email';
import { sendEmailToSms } from './emailToSms';
import { sendIMessage } from './imessage';
import { sendTwilio } from './twilio';
import { sendTelegram } from './telegram';

export type Channel = 'telegram' | 'imessage' | 'email' | 'sms' | 'inreach' | 'twilio';

export interface Message {
  /** Rich body for email; adapters compress for SMS/inReach. */
  subject: string;
  body: string;
  /** One-liner for bandwidth-starved channels (sat text). Falls back to subject. */
  short?: string;
}

export interface DeliverResult { channel: Channel; ok: boolean; detail?: string }

const DEFAULT_PRIORITY: Channel[] = ['telegram', 'imessage', 'email', 'sms', 'inreach'];

/** Try channels in priority order until one reports success. */
export async function notify(
  msg: Message,
  priority: Channel[] = DEFAULT_PRIORITY,
): Promise<DeliverResult[]> {
  const results: DeliverResult[] = [];
  for (const channel of priority) {
    const res = await deliver(channel, msg);
    results.push(res);
    if (res.ok) break; // stop at first success
  }
  return results;
}

/** Broadcast to ALL configured channels (use for SOS / critical hazards). */
export async function notifyAll(msg: Message, priority: Channel[] = DEFAULT_PRIORITY) {
  return Promise.all(priority.map((c) => deliver(c, msg)));
}

async function deliver(channel: Channel, msg: Message): Promise<DeliverResult> {
  const short = msg.short ?? msg.subject;
  try {
    switch (channel) {
      case 'telegram': return { channel, ...(await sendTelegram(short)) };
      case 'imessage': return { channel, ...(await sendIMessage(short)) };
      case 'email':    return { channel, ...(await sendEmail(msg.subject, msg.body)) };
      case 'sms':      return { channel, ...(await sendEmailToSms(short)) };
      case 'inreach':  return { channel, ...(await sendEmailToSms(short, true)) };
      case 'twilio':   return { channel, ...(await sendTwilio(short)) };
      default:         return { channel, ok: false, detail: 'unknown channel' };
    }
  } catch (err: any) {
    return { channel, ok: false, detail: err?.message ?? String(err) };
  }
}
