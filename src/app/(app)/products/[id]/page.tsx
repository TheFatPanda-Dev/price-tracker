import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db, schema } from "@/db";
import type { Candidate } from "@/lib/scraper/extract";
import { CheckNow, DeleteProduct, EditForm } from "@/components/app/product-actions";
import { StepChart } from "@/components/app/step-chart";
import { Thumb } from "@/components/app/thumb";
import { Change } from "@/components/change";
import { FlapPrice } from "@/components/flap-price";
import { NetPrice } from "@/components/net-price";
import { Submit } from "@/components/form-bits";
import { requireUser } from "@/lib/auth/session";
import { checkedLabel, fullDate, nextLabel, serverNow } from "@/lib/format";
import { getSettings } from "@/lib/notify";
import { formatAmount, formatMoney } from "@/lib/price";
import { checkNowAction, deleteProductAction, pickCandidateAction, updateProductAction } from "../../actions";

async function load(idParam: string) {
  const user = await requireUser();
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const p = db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.id, id), eq(schema.products.userId, user.id)))
    .get();
  if (!p) notFound();
  return { user, p };
}

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const { p } = await load((await params).id);
  return { title: p.title ?? p.shop };
}

const METHOD: Record<string, string> = {
  static: "page data",
  browser: "headless browser",
  selector: "your selector",
};

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { user, p } = await load((await params).id);
  const history = db
    .select()
    .from(schema.priceHistory)
    .where(eq(schema.priceHistory.productId, p.id))
    .orderBy(asc(schema.priceHistory.recordedAt))
    .all();
  const settings = getSettings(user.id);
  const seen = settings.lastSeenAt?.getTime() ?? 0;
  const vat = p.vatPercent ?? settings.vatPercent;
  const flip = !!p.lastChangedAt && p.lastChangedAt.getTime() > seen;
  const candidates: Candidate[] = p.candidatesJson ? JSON.parse(p.candidatesJson) : [];

  return (
    <>
      <section className="-mt-px bg-board px-4 pb-7 text-flap sm:px-8 lg:px-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] text-board-muted hover:text-flap">
          <ArrowLeft aria-hidden className="size-4" /> Watchlist
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <Thumb src={p.imageUrl} size={72} />
          <div className="min-w-0">
            <h1 className="line-clamp-3 font-display text-[26px] leading-tight font-bold [overflow-wrap:anywhere] sm:text-[32px]">{p.title ?? p.url}</h1>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-board-muted hover:text-flap">
              {p.shop} <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(opens the shop)</span>
            </a>
          </div>
        </div>
      </section>

      <main className="on-paper flex-1 px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                {p.currentPriceCents != null ? (
                  <FlapPrice cents={p.currentPriceCents} currency={p.currency} flip={flip} size="lg" />
                ) : (
                  <span className="font-display text-[44px] font-semibold text-muted">—</span>
                )}
                {p.previousPriceCents != null && (
                  <span className="block text-[15px] text-muted line-through">
                    <span className="sr-only">was </span>
                    {formatMoney(p.previousPriceCents, p.currency)}
                  </span>
                )}
                {settings.showNetPrices && <NetPrice cents={p.currentPriceCents} currency={p.currency} vat={vat} showRate className="text-[15px]" />}
              </div>
              <div className="pb-2 text-[22px]">
                {p.lastChangedAt && <Change percent={p.lastChangePercent} />}
              </div>
              {p.targetHitAt && p.targetPriceCents != null && (
                <span className="mb-3 rounded-[3px] bg-target px-2 py-1 text-[13px] font-semibold text-white">
                  Target {formatMoney(p.targetPriceCents, p.currency)} hit
                </span>
              )}
            </div>

            <p className="mt-3 text-[14px] text-muted">
              Checked {checkedLabel(p.lastCheckedAt)}
              {p.method && <> via {METHOD[p.method]}</>} · next check departs{" "}
              <strong className="font-display font-semibold text-ink">{nextLabel(p.nextCheckAt)}</strong>
              {p.inStock === false && <> · <span className="font-semibold text-ink">out of stock</span></>}
            </p>

            {p.status === "error" && (
              <div className="mt-5 border-l-0 border-y-2 border-rise py-3">
                <span className="stamp text-rise">Check failed</span>
                <p className="mt-2 text-[15px]">{p.lastError}</p>
                {p.failCount > 0 && <p className="mt-1 text-[13px] text-muted">{p.failCount} failed {p.failCount === 1 ? "attempt" : "attempts"} in a row.</p>}
              </div>
            )}

            {candidates.length > 0 && (p.status === "error" || p.currentPriceCents == null) && (
              <section className="mt-6">
                <h2 className="font-display text-[20px] font-bold">Which one is the price?</h2>
                <p className="text-[14px] text-muted">These numbers looked like prices on the page. Pick the right one and the tracker will read it from there.</p>
                <ul className="mt-3 divide-y divide-rule border-y border-rule">
                  {candidates.map((c) => (
                    <li key={c.selector + c.cents} className="flex items-center gap-4 py-2">
                      <span className="w-28 font-display text-[18px] font-semibold">{formatAmount(c.cents)}</span>
                      <code className="min-w-0 flex-1 truncate text-[12px] text-muted">{c.text}</code>
                      <form action={pickCandidateAction.bind(null, p.id, c.selector)}>
                        <Submit variant="ghost" pendingText="Reading…" className="h-9 px-3 text-[14px]">
                          Use this
                        </Submit>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-6">
              <CheckNow action={checkNowAction.bind(null, p.id)} />
            </div>

            {history.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 border-b-2 border-ink pb-1 font-display text-[20px] font-bold">Price history</h2>
                <StepChart
                  points={history.map((h) => ({ t: h.recordedAt.getTime(), cents: h.priceCents }))}
                  target={p.targetPriceCents}
                  currency={p.currency}
                  now={serverNow()}
                  low={p.lowestCents}
                  high={p.highestCents}
                />
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full border-collapse text-[15px]">
                    <thead className="border-b-2 border-ink">
                      <tr className="text-left text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                        <th className="px-2 py-2">When</th>
                        <th className="px-2 py-2 text-right">Price</th>
                        <th className="hidden px-2 py-2 text-right sm:table-cell">Was</th>
                        <th className="px-2 py-2 text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().map((h) => (
                        <tr key={h.id} className="border-b border-rule">
                          <td className="px-2 py-2 text-[14px] text-muted">{fullDate(h.recordedAt)}</td>
                          <td className="px-2 py-2 text-right font-display text-[17px] font-semibold">{formatMoney(h.priceCents, p.currency)}</td>
                          <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">
                            {h.previousPriceCents != null ? <s>{formatMoney(h.previousPriceCents, p.currency)}</s> : "first reading"}
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {h.changePercent != null ? <Change percent={h.changePercent} /> : <span className="text-[13px] text-muted">first</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {p.lowestCents != null && (
                  <p className="mt-3 text-[14px] text-muted">
                    Lowest seen {formatMoney(p.lowestCents, p.currency)} · highest {formatMoney(p.highestCents, p.currency)} · tracked since{" "}
                    {fullDate(p.createdAt)}
                  </p>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-8">
            <section>
              <h2 className="mb-3 border-b-2 border-ink pb-1 font-display text-[20px] font-bold">Target and details</h2>
              <EditForm
                action={updateProductAction.bind(null, p.id)}
                title={p.title ?? ""}
                target={p.targetPriceCents != null ? formatAmount(p.targetPriceCents) : ""}
                selector={p.selector ?? ""}
                vat={p.vatPercent != null ? String(p.vatPercent).replace(".", ",") : ""}
                defaultVat={settings.vatPercent}
                showVat={settings.showNetPrices}
              />
            </section>
            <section className="border-t border-rule pt-5">
              <DeleteProduct action={deleteProductAction.bind(null, p.id)} />
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

