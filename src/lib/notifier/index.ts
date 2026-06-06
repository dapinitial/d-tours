// Shotgun's outbound comms — iMessage or email, nothing else.
// iMessage fires only when a Mac/Shotgun host is actually running it; otherwise
// it falls through to email (which pushes to David's phone). Carrier SMS, inReach
// messaging, and Twilio were removed: AT&T killed free email-to-SMS, and iMessage
// can't be sent from the cloud server anyway. Each adapter is best-effort.
import { sendEmail } from './email';
import { sendIMessage } from './imessage';

export type Channel = 'imessage' | 'email';

export interface Message {
  /** Rich body for email; `short` is used for iMessage. */
  subject: string;
  body: string;
  /** One-liner for iMessage. Falls back to subject. */
  short?: string;
}

export interface DeliverResult { channel: Channel; ok: boolean; detail?: string }

const DEFAULT_PRIORITY: Channel[] = ['imessage', 'email'];

/** Try channels in priority order until one reports success (iMessage → email). */
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

/** Broadcast to BOTH channels (use when you want iMessage AND an email record). */
export async function notifyAll(msg: Message, priority: Channel[] = DEFAULT_PRIORITY) {
  return Promise.all(priority.map((c) => deliver(c, msg)));
}

async function deliver(channel: Channel, msg: Message): Promise<DeliverResult> {
  const short = msg.short ?? msg.subject;
  try {
    switch (channel) {
      case 'imessage': return { channel, ...(await sendIMessage(short)) };
      case 'email':    return { channel, ...(await sendEmail(msg.subject, msg.body)) };
      default:         return { channel, ok: false, detail: 'unknown channel' };
    }
  } catch (err: any) {
    return { channel, ok: false, detail: err?.message ?? String(err) };
  }
}
