// Renders src/app/apple-icon.png (180×180, no transparency) from src/app/icon.svg.
// Run: npx tsx scripts/render-icons.ts
import fs from "node:fs";
import { chromium } from "playwright-core";

(async () => {
  const svg = fs.readFileSync("src/app/icon.svg", "utf8").replace('rx="7" fill="#ffd23f"', 'fill="#ffd23f"');
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 180, height: 180 } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:180px;height:180px}</style>${svg}`);
  await page.screenshot({ path: "src/app/apple-icon.png", omitBackground: false });
  await b.close();
})();
