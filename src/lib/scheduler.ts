import "server-only";
import { asc, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { pollTelegramLinks } from "@/lib/notify/telegram";
import { checkProduct, isChecking } from "@/lib/tracker";

const TICK_MS = 60 * 1000;
const CONCURRENCY = 2;

const g = globalThis as unknown as { __ptScheduler?: NodeJS.Timeout; __ptTicking?: boolean };

export function startScheduler() {
  if (g.__ptScheduler) return;
  console.log("[scheduler] started");
  g.__ptScheduler = setInterval(tick, TICK_MS);
  setTimeout(tick, 5000);
}

async function tick() {
  if (g.__ptTicking) return;
  g.__ptTicking = true;
  try {
    await pollTelegramLinks().catch((e) => console.error("[telegram]", (e as Error).message));
    const due = db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(or(isNull(schema.products.nextCheckAt), lte(schema.products.nextCheckAt, new Date())))
      .orderBy(asc(schema.products.nextCheckAt))
      .limit(50)
      .all()
      .filter((p) => !isChecking(p.id));
    if (!due.length) return;
    const queue = [...due];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          try {
            await checkProduct(next.id);
          } catch (e) {
            console.error(`[scheduler] product ${next.id}:`, e);
          }
        }
      }),
    );
  } finally {
    g.__ptTicking = false;
  }
}

