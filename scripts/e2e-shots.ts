// Drives the running app in Chromium: setup, add products, screenshots.
// Usage: tsx scripts/e2e-shots.ts <baseUrl> <outDir> [phase]
import { chromium, type Page } from "playwright-core";

const [base, out, phase = "all"] = process.argv.slice(2);

async function shot(page: Page, name: string, width: number, full = false) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

  if (phase === "all" || phase === "setup") {
    await page.goto(base);
    console.log("landed", page.url());
    await shot(page, "setup", 1440);
    await page.fill('input[name="name"]', "Sample Admin");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "sample-password-123");
    await page.click('button[type="submit"]');
    await page.waitForURL(base + "/");
    console.log("after setup", page.url());
    await shot(page, "empty", 1440);
    for (const u of process.env.URLS!.split(" ")) {
      await page.fill("#product-url", u);
      await page.click('form:has(#product-url) button[type="submit"]');
      await page.waitForSelector('p[role="status"]', { timeout: 90000 });
      await page.waitForFunction(() => !document.querySelector('form:has(#product-url) button[disabled]'), null, { timeout: 90000 });
      console.log("add:", u, "→", (await page.textContent('p[role="status"]'))?.trim());
    }
  } else {
    await page.goto(base + "/login");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "sample-password-123");
    await page.click('button[type="submit"]');
    await page.waitForURL(base + "/");
  }

  if (phase === "all" || phase === "shots") {
    await page.goto(base + "/");
    await page.waitForTimeout(1200);
    await shot(page, "desktop", 1440);
    await shot(page, "mobile", 390);
    const first = await page.getAttribute('table a[href^="/products/"]', "href");
    await page.setViewportSize({ width: 1440, height: 900 });
    if (first) {
      await page.goto(base + first);
      await shot(page, "product-desktop", 1440, true);
      await shot(page, "product-mobile", 390, true);
    }
    await page.goto(base + "/activity");
    await shot(page, "activity", 1440);
    await page.goto(base + "/settings");
    await shot(page, "settings", 1440, true);
    await shot(page, "settings-mobile", 390, true);
  }
  await browser.close();
})();
