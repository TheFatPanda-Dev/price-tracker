import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowDown, ArrowUp, Crosshair, TriangleAlert } from "lucide-react";
import { db, schema } from "@/db";
import { MarkSeen } from "@/components/app/mark-seen";
import { requireUser } from "@/lib/auth/session";
import { boardTime, groupOf, hhmm, type Group } from "@/lib/format";
import { markActivityReadAction } from "../actions";

export const metadata: Metadata = { title: "Activity" };

const ICON = {
  drop: { Icon: ArrowDown, cls: "text-drop", label: "Price dropped" },
  rise: { Icon: ArrowUp, cls: "text-rise", label: "Price rose" },
  target: { Icon: Crosshair, cls: "text-target", label: "Target hit" },
  error: { Icon: TriangleAlert, cls: "text-rise", label: "Check failing" },
} as const;

export default async function ActivityPage() {
  const user = await requireUser();
  const items = db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(200)
    .all();
  const unread = items.filter((n) => !n.readAt).length;
  const groups: Group[] = ["Today", "This week", "Earlier"];

  return (
    <main className="on-paper flex-1 px-4 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-[26px] font-bold">Activity</h1>
        <p className="mb-4 text-[14px] text-muted">
          {unread ? `${unread} new since you last looked.` : "Every price move, target hit and failing check, newest first."}
        </p>
        {items.length === 0 ? (
          <p className="border-t-2 border-ink py-10 text-center text-muted">Quiet so far. Announcements appear here when a price moves.</p>
        ) : (
          <div className="border-t-2 border-ink">
            {groups.map((g) => {
              const list = items.filter((n) => groupOf(n.createdAt) === g);
              if (!list.length) return null;
              return (
                <section key={g} aria-label={g}>
                  <h2 className="bg-yellow px-3 py-1 font-display text-[13px] font-bold tracking-[0.1em] uppercase">{g}</h2>
                  <ul>
                    {list.map((n) => {
                      const { Icon, cls, label } = ICON[n.type];
                      return (
                        <li key={n.id} className={`flex gap-3 border-b border-rule px-2 py-3 ${n.type === "target" ? "bg-target/10" : ""}`}>
                          <span className="w-14 flex-none pt-0.5 font-display font-semibold text-muted">
                            {g === "Today" ? hhmm(n.createdAt) : boardTime(n.createdAt)}
                          </span>
                          <Icon aria-label={label} className={`mt-0.5 size-5 flex-none ${cls}`} strokeWidth={2.5} />
                          <div className="min-w-0 flex-1">
                            {n.productId ? (
                              <Link href={`/products/${n.productId}`} className={`font-semibold hover:underline ${n.type === "target" ? "text-target" : ""}`}>
                                {n.title.replace(/^[▼▲◆]\s*/, "")}
                              </Link>
                            ) : (
                              <span className="font-semibold">{n.title}</span>
                            )}
                            {n.body && <p className="text-[14px] text-muted">{n.body}</p>}
                          </div>
                          {!n.readAt && (
                            <span className="mt-1.5 size-2 flex-none rounded-full bg-yellow ring-1 ring-ink" aria-label="new" />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {unread > 0 && <MarkSeen action={markActivityReadAction} delay={3000} />}
    </main>
  );
}
