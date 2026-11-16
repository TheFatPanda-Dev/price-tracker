import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthForm } from "@/components/auth-form";
import { hashToken } from "@/lib/auth/tokens";
import { acceptInviteAction } from "../../actions";

export const metadata: Metadata = { title: "Accept invite" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = db
    .select({ email: schema.invites.email, by: schema.users.name })
    .from(schema.invites)
    .innerJoin(schema.users, eq(schema.users.id, schema.invites.createdBy))
    .where(
      and(
        eq(schema.invites.tokenHash, hashToken(token)),
        isNull(schema.invites.usedAt),
        gt(schema.invites.expiresAt, new Date()),
      ),
    )
    .get();

  if (!invite) {
    return (
      <>
        <h1 className="font-display text-[34px] leading-tight font-bold">This invite has expired</h1>
        <p className="mt-2 text-board-muted">Invite links work once and for 7 days. Ask for a new one.</p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-yellow underline underline-offset-4">
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-[34px] leading-tight font-bold">Join the tracker</h1>
      <p className="mt-1 mb-7 text-board-muted">{invite.by} invited you. Create your account to start a watchlist.</p>
      <AuthForm
        action={acceptInviteAction.bind(null, token)}
        submit="Create account"
        pendingText="Creating account…"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email", defaultValue: invite.email ?? undefined, readOnly: !!invite.email },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        ]}
      />
    </>
  );
}
