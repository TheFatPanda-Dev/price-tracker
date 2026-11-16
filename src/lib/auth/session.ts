import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "pt_session";
const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;

export async function createSession(userId: number) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token))).run();
  jar.delete(SESSION_COOKIE);
}

/** Current user or null. Extends the DB expiry (sliding) when half used. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const row = db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, id))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() < now) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
    return null;
  }
  if (row.session.expiresAt.getTime() - now < (SESSION_DAYS / 2) * DAY) {
    db.update(schema.sessions)
      .set({ expiresAt: new Date(now + SESSION_DAYS * DAY) })
      .where(eq(schema.sessions.id, id))
      .run();
  }
  const { passwordHash: _omit, ...user } = row.user;
  void _omit;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export function hasAnyUser() {
  return !!db.select({ id: schema.users.id }).from(schema.users).limit(1).get();
}
