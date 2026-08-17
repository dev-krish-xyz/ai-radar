import { env } from "./env";

export interface TelegramSendResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

export function isTelegramConfigured(): boolean {
  return Boolean(env.telegramBotToken && env.telegramChatId);
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = env.telegramBotToken;
  const chatId = env.telegramChatId;
  if (!token || !chatId) {
    console.warn("[telegram] not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), skipping alert. Message:\n" + text);
    return { ok: false, skipped: true, error: "not configured" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] send failed: HTTP ${res.status} ${body.slice(0, 500)}`);
      return { ok: false, status: res.status, error: body.slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] send threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Lightweight connectivity check used at worker startup. */
export async function pingTelegram(): Promise<TelegramSendResult> {
  const token = env.telegramBotToken;
  if (!token) return { ok: false, skipped: true, error: "not configured" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
