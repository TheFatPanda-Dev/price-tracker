import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Product } from "@/db/schema";
import { env } from "@/lib/env";
import { formatMoney, formatPercent } from "@/lib/price";
import { emailConfigured, sendEmail } from "./email";
import { sendTelegram, telegramConfigured } from "./telegram";

export type AlertKind = "drop" | "rise" | "target" | "error";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function getSettings(userId: number) {
  let s = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).get();
  if (!s) {
    db.insert(schema.userSettings).values({ userId }).onConflictDoNothing().run();
    s = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).get()!;
  }
  return s;
}

type AlertInput = {
  kind: AlertKind;
  product: Pick<Product, "id" | "userId" | "title" | "url" | "shop" | "currency" | "targetPriceCents">;
  priceCents?: number | null;
  previousPriceCents?: number | null;
  changePercent?: number | null;
  error?: string;
};

function compose(a: AlertInput) {
  const name = a.product.title || a.product.shop;
  const cur = a.product.currency;
  const now = formatMoney(a.priceCents, cur);
  const was = formatMoney(a.previousPriceCents, cur);
  const pct = a.changePercent != null ? ` (${formatPercent(a.changePercent)})` : "";
  switch (a.kind) {
    case "drop":
      return { title: `▼ ${name}`, line: `${was} → ${now}${pct}` };
    case "rise":
      return { title: `▲ ${name}`, line: `${was} → ${now}${pct}` };
    case "target":
      return { title: `◆ Target hit: ${name}`, line: `${now} (target ${formatMoney(a.product.targetPriceCents, cur)})` };
    case "error":
      return { title: `Check failing: ${name}`, line: a.error || "The price could not be read 3 times in a row." };
  }
}

/** In-app feed always; email/Telegram according to the user's settings. */
export async function alert(a: AlertInput) {
  const { title, line } = compose(a);
  db.insert(schema.notifications)
    .values({
      userId: a.product.userId,
      productId: a.product.id,
      type: a.kind,
      title,
      body: line,
      priceCents: a.priceCents ?? null,
      previousPriceCents: a.previousPriceCents ?? null,
      changePercent: a.changePercent ?? null,
    })
    .run();

  const s = getSettings(a.product.userId);
  if (a.kind === "rise" && s.notifyOn === "drops") return;
  if ((a.kind === "drop" || a.kind === "rise") && Math.abs(a.changePercent ?? 0) < s.minChangePercent) return;

  const link = `${env.appUrl}/products/${a.product.id}`;
  const jobs: Promise<unknown>[] = [];
  if (s.notifyTelegram && s.telegramChatId && telegramConfigured()) {
    jobs.push(
      sendTelegram(
        s.telegramChatId,
        `<b>${esc(title)}</b>\n${esc(line)}\n${esc(a.product.shop)} · <a href="${esc(a.product.url)}">shop</a> · <a href="${esc(link)}">tracker</a>`,
      ),
    );
  }
  if (s.notifyEmail && emailConfigured()) {
    const to = s.emailAddress || db.select({ e: schema.users.email }).from(schema.users).where(eq(schema.users.id, a.product.userId)).get()?.e;
    if (to) {
      jobs.push(sendEmail(to, title, `${title}\n${line}\n\nShop: ${a.product.url}\nTracker: ${link}\n`));
    }
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("[notify]", r.reason);
}
