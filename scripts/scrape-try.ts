import { scrape } from "../src/lib/scraper";
const urls = process.argv.slice(2);
(async () => {
  for (const u of urls) {
    const t = Date.now();
    const r = await scrape(u);
    console.log(JSON.stringify({ u, ms: Date.now() - t, ...r, candidates: r.candidates.slice(0, 3) }).slice(0, 500));
  }
  process.exit(0);
})();
