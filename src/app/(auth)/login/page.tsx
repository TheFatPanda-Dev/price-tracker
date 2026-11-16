import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser, hasAnyUser } from "@/lib/auth/session";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  if (!hasAnyUser()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="font-display text-[34px] leading-tight font-bold">Sign in</h1>
      <p className="mt-1 mb-7 text-board-muted">Your watchlist is waiting on the board.</p>
      <AuthForm
        action={loginAction}
        submit="Sign in"
        pendingText="Signing in…"
        hidden={{ next: typeof next === "string" ? next : "/" }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-6 text-[14px] text-board-muted">Accounts are invite-only. Ask the person who runs this tracker for a link.</p>
    </>
  );
}
