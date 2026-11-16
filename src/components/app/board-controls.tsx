"use client";

import { ChevronDown, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export const SORTS = [
  { value: "changed", label: "Last change" },
  { value: "drop", label: "Biggest drop" },
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
] as const;

export function BoardControls() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Search products</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Search"
          className="h-9 w-44 rounded-full border border-rule bg-card pr-3 pl-9 text-[14px] focus:border-ink focus:outline-none"
        />
      </label>
      <label className="relative flex h-9 items-center gap-1 rounded-full border border-rule bg-card pr-8 pl-3 text-[14px] focus-within:border-ink">
        <span className="text-muted">Sort:</span>
        <select
          value={params.get("sort") ?? "changed"}
          onChange={(e) => set("sort", e.target.value === "changed" ? "" : e.target.value)}
          className="h-full cursor-pointer appearance-none bg-transparent font-medium focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4" />
      </label>
    </div>
  );
}
