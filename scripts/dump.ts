import fs from "node:fs";
import { fetchStatic } from "../src/lib/scraper/fetch-static";
import { fetchWithBrowser } from "../src/lib/scraper/browser";
(async () => {
  const [mode, url, out] = process.argv.slice(2);
  const r = mode === "browser" ? await fetchWithBrowser(url) : await fetchStatic(url);
  fs.writeFileSync(out, r.html);
  console.log(r.status, r.finalUrl, r.html.length);
  process.exit(0);
})();
