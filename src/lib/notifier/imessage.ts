// iMessage adapter — the HERO channel for self-texting. In production this runs
// on the home iMac (Claude Max) via the official Anthropic iMessage plugin, which
// reads chat.db + sends through AppleScript. On macOS we can send directly with
// `osascript`. Off the Mac (e.g. DO server) it no-ops so notify() falls through
// to email/SMS.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(exec);
const target = process.env.NOTIFY_IMESSAGE; // your Apple ID / phone for the control thread

export async function sendIMessage(text: string) {
  if (process.platform !== 'darwin' || !target) {
    console.log(`[notifier:imessage] (not on mac / no target) → ${text}`);
    return { ok: false, detail: 'imessage unavailable here' };
  }
  // Escape double-quotes for AppleScript.
  const safe = text.replace(/"/g, '\\"');
  const script = `tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy "${target}" of targetService
    send "${safe}" to targetBuddy
  end tell`;
  await run(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  return { ok: true, detail: `iMessage → ${target}` };
}
