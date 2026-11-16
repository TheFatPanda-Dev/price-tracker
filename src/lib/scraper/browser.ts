import type { Browser } from "playwright-core";
import { BROWSER_UA } from "./fetch-static";
import { assertPublicUrl, isPrivateIp } from "./url-guard";

const IDLE_MS = 2 * 60 * 1000;
const g = globalThis as unknown as {
  __ptBrowser?: Promise<Browser> | null;
  __ptBrowserIdle?: NodeJS.Timeout;
  __ptBrowserUsers?: number;
};

async function getBrowser(): Promise<Browser> {
  if (!g.__ptBrowser) {
    g.__ptBrowser = (async () => {
      const { chromium } = await import("playwright-core");
      const b = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox"],
      });
      b.on("disconnected", () => (g.__ptBrowser = null));
      return b;
    })().catch((err) => {
      g.__ptBrowser = null;
      throw new Error(`Headless browser unavailable (${(err as Error).message.split("\n")[0]})`);
    });
  }
  return g.__ptBrowser;
}

function scheduleIdleClose() {
  clearTimeout(g.__ptBrowserIdle);
  g.__ptBrowserIdle = setTimeout(async () => {
    if ((g.__ptBrowserUsers ?? 0) > 0 || !g.__ptBrowser) return;
    const b = await g.__ptBrowser.catch(() => null);
    g.__ptBrowser = null;
    await b?.close().catch(() => {});
  }, IDLE_MS);
}

export async function fetchWithBrowser(rawUrl: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const url = await assertPublicUrl(rawUrl);
  g.__ptBrowserUsers = (g.__ptBrowserUsers ?? 0) + 1;
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: BROWSER_UA,
    locale: "en-US",
    timezoneId: process.env.TZ || "Europe/Ljubljana",
    viewport: { width: 1366, height: 900 },
  });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await context.route("**/*", (route) => {
      const req = route.request();
      if (["image", "font", "media"].includes(req.resourceType())) return route.abort();
      try {
        const h = new URL(req.url()).hostname.replace(/^\[|\]$/g, "");
        if (h === "localhost" || isPrivateIp(h)) return route.abort();
      } catch {
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const res = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await assertPublicUrl(page.url());
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    return { status: res?.status() ?? 0, html: await page.content(), finalUrl: page.url() };
  } finally {
    await context.close().catch(() => {});
    g.__ptBrowserUsers = Math.max(0, (g.__ptBrowserUsers ?? 1) - 1);
    scheduleIdleClose();
  }
}
