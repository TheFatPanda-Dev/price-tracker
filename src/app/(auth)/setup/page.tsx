import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth-form";
import { hasAnyUser } from "@/lib/auth/session";
import { setupAction } from "../actions";

export const metadata: Metadata = { title: "First-time setup" };

export default async function SetupPage() {
  await connection();
  if (hasAnyUser()) redirect("/login");
  return (
    <>
      <h1 className="font-display text-[34px] leading-tight font-bold">Set up the tracker</h1>
      <p className="mt-1 mb-7 text-board-muted">
        This first account becomes the admin. You can invite family and friends from Settings afterwards.
      </p>
      <AuthForm
        action={setupAction}
        submit="Create admin account"
        pendingText="Creating account…"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        ]}
      />
    </>
  );
}
