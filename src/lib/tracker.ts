import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Product } from "@/db/schema";
import { alert, getSettings } from "@/lib/notify";
import { percentChange } from "@/lib/price";
import { nextSlot } from "@/lib/schedule";
import { scrape } from "@/lib/scraper";

const HOUR = 60 * 60 * 1000;
const g = globalThis as unknown as { __ptInflight?: Map<number, Promise<CheckOutcome>> };
const inflight = (g.__ptInflight ??= new Map());

export type CheckOutcome =
  | { status: "unchanged" | "changed" | "first"; priceCents: number }
  | { status: "unavailable" }
  | { status: "error"; error: string };

/** Run one price check; concurrent calls for the same product share one run. */
export function checkProduct(productId: number): Promise<CheckOutcome> {
  const existing = inflight.get(productId);
  if (existing) return existing;
  const run = doCheck(productId).finally(() => inflight.delete(productId));
  inflight.set(productId, run);
  return run;
}

export const isChecking = (productId: number) => inflight.has(productId);

async function doCheck(productId: number): Promise<CheckOutcome> {
  const p = db.select().from(schema.products).where(eq(schema.products.id, productId)).get();
  if (!p) return { status: "error", error: "Product not found." };
  const settings = getSettings(p.userId);
  const now = new Date();
  const slot = nextSlot(settings.checkIntervalHours, now);

  const result = await scrape(p.url, { selector: p.selector, preferBrowser: p.method === "browser" });
  const update = (patch: Partial<Product>) =>
    db.update(schema.products).set(patch).where(eq(schema.products.id, p.id)).run();

  if (!result.ok && result.unavailable) {
    // Not a failure: the shop simply offers no price. Keep the last price.
    update({
      status: "ok",
      inStock: false,
      lastError: result.error,
      failCount: 0,
      lastCheckedAt: now,
      nextCheckAt: slot,
      candidatesJson: null,
      title: p.title ?? result.title,
      imageUrl: p.imageUrl ?? result.imageUrl,
    });
    return { status: "unavailable" };
  }

  if (!result.ok) {
    const failCount = p.failCount + 1;
    const retry = !result.fatal && failCount <= 2 ? new Date(now.getTime() + HOUR) : slot;
    update({
      status: "error",
      lastError: result.error,
      failCount,
      lastCheckedAt: now,
      nextCheckAt: retry < slot ? retry : slot,
      candidatesJson: result.candidates.length ? JSON.stringify(result.candidates) : p.candidatesJson,
      title: p.title ?? result.title,
      imageUrl: p.imageUrl ?? result.imageUrl,
    });
    if (failCount === 3) await alert({ kind: "error", product: p, error: result.error });
    return { status: "error", error: result.error };
  }

  const cents = result.priceCents;
  const base: Partial<Product> = {
    status: "ok",
    lastError: null,
    failCount: 0,
    lastCheckedAt: now,
    nextCheckAt: slot,
    method: result.method,
    inStock: result.inStock,
    candidatesJson: null,
    title: p.title ?? result.title,
    imageUrl: p.imageUrl ?? result.imageUrl,
    currency: p.currency ?? result.currency,
  };

  // Target crossing: alert on the way down, re-arm when it goes back above.
  let targetHit = false;
  if (p.targetPriceCents != null) {
    if (cents <= p.targetPriceCents && !p.targetHitAt) {
      base.targetHitAt = now;
      targetHit = true;
    } else if (cents > p.targetPriceCents && p.targetHitAt) {
      base.targetHitAt = null;
    }
  }

  if (p.currentPriceCents == null) {
    update({ ...base, currentPriceCents: cents, lowestCents: cents, highestCents: cents });
    db.insert(schema.priceHistory).values({ productId: p.id, priceCents: cents, recordedAt: now }).run();
    if (targetHit) await alert({ kind: "target", product: { ...p, ...base }, priceCents: cents });
    return { status: "first", priceCents: cents };
  }

  if (cents === p.currentPriceCents) {
    update(base);
    if (targetHit) await alert({ kind: "target", product: { ...p, ...base }, priceCents: cents });
    return { status: "unchanged", priceCents: cents };
  }

  const pct = percentChange(p.currentPriceCents, cents);
  update({
    ...base,
    currentPriceCents: cents,
    previousPriceCents: p.currentPriceCents,
    lastChangePercent: pct,
    lastChangedAt: now,
    lowestCents: Math.min(p.lowestCents ?? cents, cents),
    highestCents: Math.max(p.highestCents ?? cents, cents),
  });
  db.insert(schema.priceHistory)
    .values({ productId: p.id, priceCents: cents, previousPriceCents: p.currentPriceCents, changePercent: pct, recordedAt: now })
    .run();
  const product = { ...p, ...base };
  await alert({
    kind: cents < p.currentPriceCents ? "drop" : "rise",
    product,
    priceCents: cents,
    previousPriceCents: p.currentPriceCents,
    changePercent: pct,
  });
  if (targetHit) await alert({ kind: "target", product, priceCents: cents });
  return { status: "changed", priceCents: cents };
}
