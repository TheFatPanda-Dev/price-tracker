import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Product } from "@/db/schema";
import { AddProduct } from "@/components/app/add-product";
import { BoardControls } from "@/components/app/board-controls";
import { MarkSeen } from "@/components/app/mark-seen";
import { RangeBar } from "@/components/app/range-bar";
import { Thumb } from "@/components/app/thumb";
import { Change } from "@/components/change";
import { FlapPrice } from "@/components/flap-price";
import { NetPrice } from "@/components/net-price";
import { requireUser } from "@/lib/auth/session";
import { boardTime, checkedLabel, groupOf, isToday, nextLabel, serverNow, type Group } from "@/lib/format";
import { getSettings } from "@/lib/notify";
import { formatMoney } from "@/lib/price";
import { markSeenAction } from "./actions";

export const metadata: Metadata = { title: "Watchlist" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "dropped", label: "Dropped" },
  { value: "rose", label: "Rose" },
  { value: "target", label: "Target hit" },
  { value: "failed", label: "Failed" },
] as const;

const GROUPS: Group[] = ["Today", "This week", "Earlier"];

type Row = Product & { flip: boolean; changedAt: Date; vat: number | null };

export default async function WatchlistPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "changed";

  const settings = getSettings(user.id);
  const seen = settings.lastSeenAt?.getTime() ?? 0;
  const all: Row[] = db
    .select()
    .from(schema.products)
    .where(eq(schema.products.userId, user.id))
    .all()
    .map((p) => ({
      ...p,
      changedAt: p.lastChangedAt ?? p.createdAt,
      flip: !!p.lastChangedAt && p.lastChangedAt.getTime() > seen,
      vat: settings.showNetPrices ? (p.vatPercent ?? settings.vatPercent) : null,
    }));

  const now = serverNow();
  const upcoming = all
    .map((p) => p.nextCheckAt?.getTime() ?? 0)
    .filter((t) => t > now)
    .sort((a, b) => a - b)[0];
  const stats = {
    total: all.length,
    today: all.filter((p) => p.lastChangedAt && isToday(p.lastChangedAt)).length,
    targets: all.filter((p) => p.targetHitAt).length,
    failed: all.filter((p) => p.status === "error").length,
  };

  let rows = all.filter((p) => {
    if (q && !`${p.title ?? ""} ${p.shop}`.toLowerCase().includes(q)) return false;
    if (filter === "dropped") return (p.lastChangePercent ?? 0) < 0;
    if (filter === "rose") return (p.lastChangePercent ?? 0) > 0;
    if (filter === "target") return !!p.targetHitAt;
    if (filter === "failed") return p.status === "error";
    return true;
  });
  const byName = (a: Row, b: Row) => (a.title ?? a.shop).localeCompare(b.title ?? b.shop);
  rows = rows.sort(
    sort === "drop"
      ? (a, b) => (a.lastChangePercent ?? 0) - (b.lastChangePercent ?? 0)
      : sort === "name"
        ? byName
        : sort === "price"
          ? (a, b) => (b.currentPriceCents ?? 0) - (a.currentPriceCents ?? 0)
          : (a, b) => b.changedAt.getTime() - a.changedAt.getTime(),
  );
  const grouped = sort === "changed";
  const sections = grouped
    ? GROUPS.map((g) => ({ label: g as string, rows: rows.filter((r) => groupOf(r.changedAt) === g) })).filter((s) => s.rows.length)
    : [{ label: "", rows }];

  const chipHref = (value: string) => {
    const p = new URLSearchParams();
    if (value) p.set("filter", value);
    if (typeof sp.q === "string" && sp.q) p.set("q", sp.q);
    if (sort !== "changed") p.set("sort", sort);
    return p.size ? `/?${p}` : "/";
  };

  return (
    <>
      <section className="-mt-px bg-board px-4 pb-6 text-flap sm:px-8 lg:px-12">
        <AddProduct />
        <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-1 text-[14px] text-board-muted">
          <Stat n={stats.total} label={stats.total === 1 ? "product" : "products"} />
          <Stat n={stats.today} label="changed today" />
          <Stat n={stats.targets} label={stats.targets === 1 ? "hit its target" : "hit their target"} />
          {stats.failed > 0 && <Stat n={stats.failed} label="failing" />}
          {upcoming && (
            <div className="font-semibold text-yellow">
              <dt className="inline">Next check departs </dt>
              <dd className="inline">{nextLabel(new Date(upcoming))}</dd>
            </div>
          )}
        </dl>
      </section>

      <main className="on-paper flex-1 px-4 py-5 sm:px-8 lg:px-12">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="mr-auto font-display text-[26px] font-bold">Watchlist</h1>
          <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={chipHref(f.value)}
                aria-current={filter === f.value ? "true" : undefined}
                className={`rounded-full border px-3 py-1.5 text-[14px] ${
                  filter === f.value ? "border-ink bg-ink text-flap" : "border-rule bg-card hover:border-ink"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <BoardControls />
        </div>

        {all.length === 0 ? (
          <EmptyBoard />
        ) : rows.length === 0 ? (
          <p className="border-t-2 border-ink py-10 text-center text-muted">Nothing on the board matches this filter.</p>
        ) : (
          <>
            <BoardTable sections={sections} />
            <BoardList sections={sections} />
          </>
        )}
      </main>
      <MarkSeen action={markSeenAction} />
    </>
  );
}

function displayUrl(u: string) {
  const url = new URL(u);
  return url.hostname.replace(/^www\./, "") + url.pathname;
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <strong className="font-semibold text-flap">{n}</strong> {label}
      </dd>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="border-t-2 border-ink py-14 text-center">
      <p className="font-display text-[24px] font-bold">No departures yet</p>
      <p className="mx-auto mt-2 max-w-md text-muted">
        Copy a product link from any shop tab and paste it into the field above. The tracker reads the price and checks it again on every
        timetable slot.
      </p>
    </div>
  );
}

type Section = { label: string; rows: Row[] };

function TargetBadge({ p }: { p: Row }) {
  if (!p.targetHitAt || p.targetPriceCents == null) return null;
  return (
    <span className="ml-2 inline-block rounded-[3px] bg-target px-1.5 py-0.5 align-middle text-[12px] font-semibold whitespace-nowrap text-white">
      Target {formatMoney(p.targetPriceCents, p.currency)} hit
    </span>
  );
}

function PriceCell({ p }: { p: Row }) {
  return (
    <>
      {p.currentPriceCents == null ? (
        <span className="text-muted">{p.status === "pending" ? "reading…" : "—"}</span>
      ) : (
        <FlapPrice cents={p.currentPriceCents} currency={p.currency} flip={p.flip} />
      )}
      {p.previousPriceCents != null && p.lastChangedAt && (
        <span className="block text-[13px] text-muted line-through">
          <span className="sr-only">was </span>
          {formatMoney(p.previousPriceCents, p.currency)}
        </span>
      )}
      {p.vat != null && <NetPrice cents={p.currentPriceCents} currency={p.currency} vat={p.vat} />}
    </>
  );
}

function ChangeCell({ p }: { p: Row }) {
  if (p.status === "error") return <span className="stamp text-rise">Check failed</span>;
  if (p.inStock === false) return <span className="stamp text-muted">Out of stock</span>;
  return <Change percent={p.lastChangedAt ? p.lastChangePercent : null} className="text-[16px]" />;
}

function BoardTable({ sections }: { sections: Section[] }) {
  const th = "px-2.5 py-2 text-left text-[12px] font-semibold tracking-[0.08em] text-muted uppercase";
  const td = "border-b border-rule px-2.5 py-2.5 align-middle text-[15px]";
  return (
    <table className="hidden w-full border-collapse md:table">
      <thead className="border-b-2 border-ink">
        <tr>
          <th className={th}>Changed</th>
          <th className={th}>Product</th>
          <th className={`${th} text-right`}>Price</th>
          <th className={`${th} text-right`}>Change</th>
          <th className={`${th} hidden lg:table-cell`}>Lowest – highest</th>
          <th className={`${th} text-right`}>Checked</th>
          <th className={`${th} text-right`}>Next</th>
        </tr>
      </thead>
      {sections.map((s) => (
        <tbody key={s.label || "all"}>
          {s.label && (
            <tr>
              <th colSpan={7} scope="rowgroup" className="bg-yellow px-2.5 py-1 text-left font-display text-[13px] font-bold tracking-[0.1em] uppercase">
                {s.label}
              </th>
            </tr>
          )}
          {s.rows.map((p) => (
            <tr key={p.id} className="group hover:bg-card">
              <td className={`${td} w-[70px] font-display font-semibold text-muted`}>
                {p.lastChangedAt ? boardTime(p.lastChangedAt) : <span className="text-[13px] font-medium">added</span>}
              </td>
              <td className={td}>
                <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                  <Thumb src={p.imageUrl} />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[16px] font-semibold [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-2">
                      {p.title ?? displayUrl(p.url)}
                      <TargetBadge p={p} />
                    </span>
                    <span className="block text-[13px] text-muted">{p.shop}</span>
                  </span>
                </Link>
              </td>
              <td className={`${td} text-right whitespace-nowrap`}>
                <PriceCell p={p} />
              </td>
              <td className={`${td} text-right`}>
                <ChangeCell p={p} />
              </td>
              <td className={`${td} hidden lg:table-cell`}>
                <RangeBar low={p.lowestCents} high={p.highestCents} current={p.currentPriceCents} target={p.targetPriceCents} currency={p.currency} />
              </td>
              <td className={`${td} text-right text-[13px] whitespace-nowrap text-muted`}>{checkedLabel(p.lastCheckedAt)}</td>
              <td className={`${td} text-right font-display font-semibold whitespace-nowrap`}>{nextLabel(p.nextCheckAt)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function BoardList({ sections }: { sections: Section[] }) {
  return (
    <div className="border-t-2 border-ink md:hidden">
      {sections.map((s) => (
        <section key={s.label || "all"} aria-label={s.label || "Products"}>
          {s.label && (
            <h2 className="bg-yellow px-3 py-1 font-display text-[13px] font-bold tracking-[0.1em] uppercase">{s.label}</h2>
          )}
          <ul>
            {s.rows.map((p) => (
              <li key={p.id} className="border-b border-rule">
                <Link href={`/products/${p.id}`} className="flex gap-3 px-1 py-3">
                  <Thumb src={p.imageUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 min-w-0 font-semibold [overflow-wrap:anywhere]">
                        {p.title ?? displayUrl(p.url)}
                        <TargetBadge p={p} />
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <PriceCell p={p} />
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-muted">
                      <span className="truncate">
                        {p.shop} · {p.lastChangedAt ? `changed ${boardTime(p.lastChangedAt)}` : `checked ${checkedLabel(p.lastCheckedAt)}`}
                      </span>
                      <ChangeCell p={p} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
