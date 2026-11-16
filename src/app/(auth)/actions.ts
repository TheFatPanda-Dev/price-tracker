"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, hasAnyUser } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";

export type FormState = { error?: string; ok?: string } | null;

const account = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(10, "Use at least 10 characters for the password.").max(200),
});

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Check the form.";
}

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

async function createUser(data: z.infer<typeof account>, role: "admin" | "member") {
  const passwordHash = await hashPassword(data.password);
  const user = db
    .insert(schema.users)
    .values({ name: data.name, email: data.email, passwordHash, role })
    .returning()
    .get();
  db.insert(schema.userSettings).values({ userId: user.id, emailAddress: data.email }).run();
  return user;
}

export async function setupAction(_: FormState, form: FormData): Promise<FormState> {
  if (hasAnyUser()) return { error: "Setup is already done. Sign in instead." };
  const parsed = account.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await createUser(parsed.data, "admin");
  await createSession(user.id);
  redirect("/");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) {
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Email or password is not right." };
  }
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function acceptInviteAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const invite = db
    .select()
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.tokenHash, hashToken(token)),
        isNull(schema.invites.usedAt),
        gt(schema.invites.expiresAt, new Date()),
      ),
    )
    .get();
  if (!invite) return { error: "This invite link has expired or was already used." };
  const raw = Object.fromEntries(form);
  if (invite.email) raw.email = invite.email;
  const parsed = account.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).get()) {
    return { error: "An account with this email already exists. Sign in instead." };
  }
  const user = await createUser(parsed.data, "member");
  db.update(schema.invites).set({ usedAt: new Date(), usedBy: user.id }).where(eq(schema.invites.id, invite.id)).run();
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
