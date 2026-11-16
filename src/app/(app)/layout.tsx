import { and, eq, isNull } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { db, schema } from "@/db";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/app/nav-links";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await db.$count(
    schema.notifications,
    and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
  );
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-board px-4 py-5 text-flap sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Brand />
          <NavLinks unread={unread} />
          <div className="ml-auto flex items-center gap-3 text-[14px] text-board-muted">
            <span className="hidden sm:inline">
              {user.name}
              {user.role === "admin" && <span className="text-board-muted/80"> · Admin</span>}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 hover:bg-board-2 hover:text-flap"
                aria-label="Sign out"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
