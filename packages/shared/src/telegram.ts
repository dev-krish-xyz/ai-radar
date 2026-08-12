import { env } from "./env";

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = env.telegramBotToken;
  const chatId = env.telegramChatId;
  if (!token || !chatId) {
    console.warn("[telegram] not configured, skipping alert. Message:\n" + text);
    return false;
  }

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
    console.error(`[telegram] send failed: ${res.status} ${body}`);
    return false;
  }
  return true;
}
