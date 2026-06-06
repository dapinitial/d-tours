// Telegram bot push — free, instant, reliable, works regardless of carrier or
// whether any of David's machines are on (the request goes from the server →
// Telegram → his phone). The modern replacement for dead carrier email-to-SMS.
// Configure with TELEGRAM_BOT_TOKEN (from @BotFather) + TELEGRAM_CHAT_ID.
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(`[notifier:telegram] (not configured) → ${text}`);
    return { ok: false, detail: 'telegram not configured' };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j: any = await r.json().catch(() => ({}));
    return j?.ok ? { ok: true } : { ok: false, detail: j?.description ?? `http ${r.status}` };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) };
  }
}
