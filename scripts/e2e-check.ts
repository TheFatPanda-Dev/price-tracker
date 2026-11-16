import { chromium } from "playwright-core";
const [base, ...ids] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.goto(base + "/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "sample-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(base + "/");
  for (const id of ids) {
    await page.goto(`${base}/products/${id}`);
    await page.click('button:has-text("Check now")');
    await page.waitForSelector('form:has(button:has-text("Check now")) p[role="status"]', { timeout: 90000 });
    console.log(id, await page.textContent('form:has(button:has-text("Check now")) p[role="status"]'));
  }
  await b.close();
})();
