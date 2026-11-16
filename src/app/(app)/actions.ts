"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { env } from "@/lib/env";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { getSettings } from "@/lib/notify";
import { botUsername, pollTelegramLinks, sendTelegram } from "@/lib/notify/telegram";
import { parsePrice } from "@/lib/price";
import { nextSlot } from "@/lib/schedule";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/scraper/url-guard";
import { checkProduct } from "@/lib/tracker";
import { normalizeUrl } from "@/lib/url";

export type ActionState = { error?: string; ok?: string; link?: string } | null;

async function ownProduct(id: number) {
  const user = await requireUser();
  const p = db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.id, id), eq(schema.products.userId, user.id)))
    .get();
  if (!p) throw new Error("Product not found.");
  return { user, p };
}

/* ---------------- products ---------------- */

export async function addProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const raw = String(form.get("url") ?? "").trim();
  if (!raw) return { error: "Paste a product link first." };
  let url: string;
  try {
    url = normalizeUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    await assertPublicUrl(url);
  } catch (e) {
    return { error: e instanceof UnsafeUrlError ? e.message : "That doesn't look like a product link." };
  }
  const existing = db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.userId, user.id), eq(schema.products.url, url)))
    .get();
  if (existing) return { error: "That product is already on your board.", link: `/products/${existing.id}` };

  const count = await db.$count(schema.products, eq(schema.products.userId, user.id));
  if (count >= 300) return { error: "Your board is full (300 products). Remove some first." };

  const product = db
    .insert(schema.products)
    .values({ userId: user.id, url, shop: new URL(url).hostname.replace(/^www\./, ""), nextCheckAt: new Date() })
    .returning()
    .get();
  const outcome = await checkProduct(product.id);
  refresh();
  if (outcome.status === "error") {
    return { error: `Added, but the price couldn't be read yet: ${outcome.error}`, link: `/products/${product.id}` };
  }
  if (outcome.status === "unavailable") {
    return { error: "Added. The shop lists it as unavailable right now; you'll see the price once it's back.", link: `/products/${product.id}` };
  }
  const fresh = db.select().from(schema.products).where(eq(schema.products.id, product.id)).get()!;
  return { ok: `Now tracking ${fresh.title ?? fresh.shop}.`, link: `/products/${product.id}` };
}

export async function checkNowAction(id: number): Promise<ActionState> {
  await ownProduct(id);
  const outcome = await checkProduct(id);
  refresh();
  if (outcome.status === "error") return { error: outcome.error };
  if (outcome.status === "unavailable") return { ok: "Checked. The shop still lists it as unavailable." };
  return { ok: outcome.status === "changed" ? "Price changed." : "Checked. Same price." };
}

const editSchema = z.object({
  title: z.string().trim().max(200),
  target: z.string().trim().max(40),
  selector: z.string().trim().max(300),
});

export async function updateProductAction(id: number, _: ActionState, form: FormData): Promise<ActionState> {
  const { p } = await ownProduct(id);
  const parsed = editSchema.safeParse({
    title: form.get("title") ?? p.title ?? "",
    target: form.get("target") ?? "",
    selector: form.get("selector") ?? p.selector ?? "",
  });
  if (!parsed.success) return { error: "Check the fields." };
  const { title, target, selector } = parsed.data;
  let targetPriceCents: number | null = null;
  if (target) {
    const tp = parsePrice(target);
    if (!tp) return { error: "Enter the target as a number, e.g. 89,95." };
    targetPriceCents = tp.cents;
  }
  const selectorChanged = (selector || null) !== p.selector;
  const targetHitAt =
    targetPriceCents != null && p.currentPriceCents != null && p.currentPriceCents <= targetPriceCents
      ? (p.targetHitAt ?? new Date())
      : null;
  db.update(schema.products)
    .set({
      title: title || p.title,
      targetPriceCents,
      targetHitAt,
      selector: selector || null,
      ...(selectorChanged ? { method: selector ? "selector" : null } : {}),
    })
    .where(eq(schema.products.id, id))
    .run();
  if (selectorChanged) {
    const outcome = await checkProduct(id);
    refresh();
    if (outcome.status === "error") return { error: `Saved, but the selector didn't give a price: ${outcome.error}` };
    return { ok: "Saved and re-checked with the new selector." };
  }
  refresh();
  return { ok: "Saved." };
}

export async function pickCandidateAction(id: number, selector: string) {
  await ownProduct(id);
  db.update(schema.products).set({ selector, method: "selector" }).where(eq(schema.products.id, id)).run();
  await checkProduct(id);
  refresh();
}

export async function deleteProductAction(id: number) {
  await ownProduct(id);
  db.delete(schema.products).where(eq(schema.products.id, id)).run();
  redirect("/");
}

export async function markSeenAction() {
  const user = await requireUser();
  getSettings(user.id);
  db.update(schema.userSettings).set({ lastSeenAt: new Date() }).where(eq(schema.userSettings.userId, user.id)).run();
}

export async function markActivityReadAction() {
  const user = await requireUser();
  db.update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)))
    .run();
  refresh();
}

/* ---------------- settings ---------------- */

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80), email: z.email().trim().toLowerCase() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a name and a valid email." };
  const clash = db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).get();
  if (clash && clash.id !== user.id) return { error: "Another account uses that email." };
  db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id)).run();
  refresh();
  return { ok: "Profile saved." };
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 10) return { error: "Use at least 10 characters." };
  const row = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!;
  if (!(await verifyPassword(row.passwordHash, current))) return { error: "Current password is not right." };
  db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, user.id)).run();
  return { ok: "Password changed." };
}

export async function updateScheduleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const hours = Number(form.get("interval"));
  if (![1, 2, 3, 4, 6, 8, 12, 24].includes(hours)) return { error: "Pick one of the intervals." };
  getSettings(user.id);
  db.update(schema.userSettings).set({ checkIntervalHours: hours }).where(eq(schema.userSettings.userId, user.id)).run();
  db.update(schema.products)
    .set({ nextCheckAt: nextSlot(hours) })
    .where(and(eq(schema.products.userId, user.id), eq(schema.products.status, "ok")))
    .run();
  refresh();
  return { ok: `Checks now run every ${hours} h.` };
}

export async function updateNotificationsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      emailAddress: z.union([z.literal(""), z.email()]),
      notifyOn: z.enum(["any", "drops"]),
      minChangePercent: z.coerce.number().min(0).max(100),
    })
    .safeParse({
      emailAddress: String(form.get("emailAddress") ?? "").trim(),
      notifyOn: form.get("notifyOn"),
      minChangePercent: String(form.get("minChangePercent") || "0").replace(",", "."),
    });
  if (!parsed.success) return { error: "Check the email address and minimum change." };
  getSettings(user.id);
  db.update(schema.userSettings)
    .set({
      notifyEmail: form.get("notifyEmail") === "on",
      notifyTelegram: form.get("notifyTelegram") === "on",
      emailAddress: parsed.data.emailAddress || null,
      notifyOn: parsed.data.notifyOn,
      minChangePercent: parsed.data.minChangePercent,
    })
    .where(eq(schema.userSettings.userId, user.id))
    .run();
  refresh();
  return { ok: "Alert settings saved." };
}

export async function testEmailAction(): Promise<ActionState> {
  const user = await requireUser();
  if (!emailConfigured()) return { error: "SMTP is not configured on the server." };
  const s = getSettings(user.id);
  try {
    await sendEmail(s.emailAddress || user.email, "Price Tracker test", "Email alerts work. You'll hear from us when a price moves.");
    return { ok: `Test email sent to ${s.emailAddress || user.email}.` };
  } catch (e) {
    return { error: `Sending failed: ${(e as Error).message}` };
  }
}

export async function connectTelegramAction(): Promise<ActionState> {
  const user = await requireUser();
  const bot = await botUsername();
  if (!bot) return { error: "The Telegram bot is not configured on the server (or the token is wrong)." };
  getSettings(user.id);
  const token = newToken().slice(0, 24);
  db.update(schema.userSettings).set({ telegramLinkToken: token }).where(eq(schema.userSettings.userId, user.id)).run();
  refresh();
  return { ok: "Open the link, press Start in Telegram, then come back and press “I pressed Start”.", link: `https://t.me/${bot}?start=${token}` };
}

export async function confirmTelegramAction(): Promise<ActionState> {
  const user = await requireUser();
  await pollTelegramLinks().catch(() => 0);
  const s = getSettings(user.id);
  refresh();
  return s.telegramChatId && !s.telegramLinkToken
    ? { ok: "Telegram connected." }
    : { error: "No /start message from you yet. Press Start in the bot chat and try again." };
}

export async function disconnectTelegramAction() {
  const user = await requireUser();
  db.update(schema.userSettings)
    .set({ telegramChatId: null, telegramLinkToken: null, notifyTelegram: false })
    .where(eq(schema.userSettings.userId, user.id))
    .run();
  refresh();
}

export async function testTelegramAction(): Promise<ActionState> {
  const user = await requireUser();
  const s = getSettings(user.id);
  if (!s.telegramChatId) return { error: "Connect Telegram first." };
  try {
    await sendTelegram(s.telegramChatId, "Test from Price Tracker. Alerts will arrive here.");
    return { ok: "Test message sent." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ---------------- admin ---------------- */

export async function createInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email && !z.email().safeParse(email).success) return { error: "That email doesn't look right." };
  const token = newToken();
  db.insert(schema.invites)
    .values({
      tokenHash: hashToken(token),
      email: email || null,
      createdBy: admin.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .run();
  refresh();
  const link = `${env.appUrl}/invite/${token}`;
  if (email && emailConfigured()) {
    await sendEmail(email, `${admin.name} invited you to Price Tracker`, `Create your account here (valid for 7 days):\n${link}\n`).catch(() => {});
  }
  return { ok: "Invite link created. It works once, for 7 days. Copy it now; it won't be shown again.", link };
}

export async function revokeInviteAction(id: number) {
  await requireAdmin();
  db.delete(schema.invites).where(and(eq(schema.invites.id, id), isNull(schema.invites.usedAt))).run();
  refresh();
}

export async function removeMemberAction(id: number) {
  const admin = await requireAdmin();
  if (id === admin.id) return;
  db.delete(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.role, "member"))).run();
  refresh();
}
