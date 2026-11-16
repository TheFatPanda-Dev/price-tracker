import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";

export const telegramConfigured = () => !!env.telegramToken;

async function api<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram: ${json.description ?? res.status}`);
  return json.result;
}

const g = globalThis as unknown as { __ptBotName?: string; __ptTgOffset?: number };

export async function botUsername(): Promise<string | null> {
  if (!telegramConfigured()) return null;
  if (!g.__ptBotName) {
    try {
      g.__ptBotName = (await api<{ username: string }>("getMe")).username;
    } catch {
      return null;
    }
  }
  return g.__ptBotName;
}

export async function sendTelegram(chatId: string, text: string) {
  if (!telegramConfigured()) throw new Error("Telegram bot is not configured.");
  await api("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

type Update = { update_id: number; message?: { chat: { id: number }; text?: string } };

/** Poll for "/start <token>" messages and link chats to users. */
export async function pollTelegramLinks(): Promise<number> {
  if (!telegramConfigured()) return 0;
  const pending = db
    .select({ userId: schema.userSettings.userId, token: schema.userSettings.telegramLinkToken })
    .from(schema.userSettings)
    .where(isNotNull(schema.userSettings.telegramLinkToken))
    .all();
  if (!pending.length) return 0;
  const updates = await api<Update[]>("getUpdates", { offset: g.__ptTgOffset ?? 0, timeout: 0, allowed_updates: ["message"] });
  let linked = 0;
  for (const u of updates) {
    g.__ptTgOffset = u.update_id + 1;
    const m = u.message?.text?.match(/^\/start\s+(\S+)/);
    if (!m || !u.message) continue;
    const match = pending.find((p) => p.token === m[1]);
    if (!match) continue;
    const chatId = String(u.message.chat.id);
    db.update(schema.userSettings)
      .set({ telegramChatId: chatId, telegramLinkToken: null, notifyTelegram: true })
      .where(eq(schema.userSettings.userId, match.userId))
      .run();
    linked++;
    await sendTelegram(chatId, "Connected. Price changes for your watchlist will arrive here.").catch(() => {});
  }
  return linked;
}
