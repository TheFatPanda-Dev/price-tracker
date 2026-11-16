"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Watchlist" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="order-last flex w-full gap-6 text-[15px] sm:order-none sm:w-auto">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/products") : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 py-1 ${active ? "font-semibold text-flap" : "text-board-muted hover:text-flap"}`}
          >
            {l.label}
            {l.href === "/activity" && unread > 0 && (
              <span className="min-w-5 rounded-full bg-yellow px-1.5 text-center font-display text-[12px] leading-5 font-bold text-board">
                {unread > 99 ? "99+" : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
