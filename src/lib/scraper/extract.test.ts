import { describe, expect, it } from "vitest";
import { extract, looksBlocked } from "./extract";
import { isPrivateIp } from "./url-guard";

const url = "https://shop.example.si/p/1";

describe("extract", () => {
  it("reads JSON-LD Product offers", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Sony WH-1000XM6","image":["/img/a.jpg"],
       "offers":{"@type":"Offer","price":"349.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}]}
    </script></head><body></body></html>`;
    const ex = extract(html, url);
    expect(ex).toMatchObject({
      priceCents: 34900, currency: "EUR", title: "Sony WH-1000XM6",
      imageUrl: "https://shop.example.si/img/a.jpg", inStock: true, source: "jsonld",
    });
  });

  it("reads AggregateOffer lowPrice", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"AggregateOffer","lowPrice":19.99,"priceCurrency":"GBP"}}</script>`;
    expect(extract(html, url)).toMatchObject({ priceCents: 1999, currency: "GBP" });
  });

  it("reads meta tags", () => {
    const html = `<meta property="og:title" content="Drill"><meta property="product:price:amount" content="129.90"><meta property="product:price:currency" content="EUR">`;
    expect(extract(html, url)).toMatchObject({ priceCents: 12990, currency: "EUR", title: "Drill", source: "meta" });
  });

  it("reads Amazon selectors", () => {
    const html = `<span id="productTitle"> Kindle </span><div id="corePrice_feature_div"><span class="a-offscreen">€119,99</span></div>`;
    expect(extract(html, "https://www.amazon.de/dp/X")).toMatchObject({ priceCents: 11999, currency: "EUR", title: "Kindle", source: "site" });
  });

  it("uses heuristics and skips old prices", () => {
    const html = `<h1>Vacuum</h1><div class="product"><span class="price-old">599,00 €</span><span class="price-current">549,99 €</span></div>`;
    const ex = extract(html, url);
    expect(ex).toMatchObject({ priceCents: 54999, currency: "EUR", source: "heuristic" });
    expect(ex.candidates.map((c) => c.cents)).not.toContain(59900);
  });

  it("honours a user selector", () => {
    const html = `<div class="price-current">10,00 €</div><b class="mine">7,50 €</b>`;
    expect(extract(html, url, "b.mine")).toMatchObject({ priceCents: 750, source: "selector" });
  });

  it("returns candidates when unsure", () => {
    const html = `<div class="box-price">49</div><div class="box-price">59</div>`;
    const ex = extract(html, url);
    expect(ex.priceCents).toBeNull();
    expect(ex.candidates.length).toBe(2);
    expect(ex.currency).toBe("EUR"); // from .si TLD
  });
});

describe("guards", () => {
  it("detects blocks", () => {
    expect(looksBlocked(503, "")).toBe(true);
    expect(looksBlocked(200, "<title>Robot Check</title>")).toBe(true);
    expect(looksBlocked(200, "<h1>Shoes</h1>")).toBe(false);
  });
  it("flags private IPs", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.10", "172.20.0.1", "169.254.1.1", "::1", "fd00::1", "::ffff:192.168.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2a00:1450::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe("unavailable", () => {
  it("flags Amazon 'Currently unavailable' pages without a price", () => {
    const html = `<span id="productTitle">Echo Dot</span><div id="availability"><span>Currently unavailable.</span></div>`;
    expect(extract(html, "https://www.amazon.de/dp/X")).toMatchObject({ priceCents: null, unavailable: true, inStock: false });
  });
  it("flags JSON-LD OutOfStock without a price", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"Offer","availability":"https://schema.org/OutOfStock"}}</script>`;
    expect(extract(html, url).unavailable).toBe(true);
  });
});
