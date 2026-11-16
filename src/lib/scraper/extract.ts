import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { currencyFromHost, normalizeCurrency, parsePrice, parseStructuredPrice } from "@/lib/price";

export type Candidate = { selector: string; text: string; cents: number };

export type Extraction = {
  priceCents: number | null;
  currency: string | null;
  title: string | null;
  imageUrl: string | null;
  inStock: boolean | null;
  source: "selector" | "jsonld" | "meta" | "site" | "heuristic" | null;
  candidates: Candidate[];
  /** The shop says the product can't be bought right now (only set when no price). */
  unavailable?: boolean;
};

type Offer = { cents: number | null; currency: string | null; inStock: boolean | null };

const SITE_SELECTORS = [
  "#corePrice_feature_div .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-offscreen",
  "#apex_desktop .a-price .a-offscreen",
  "#priceblock_dealprice",
  "#priceblock_ourprice",
  ".x-price-primary",
  ".product-price-value",
  "[data-testid='price'] .notranslate",
];

const OLD_RE = /old|was|strike|list|regular|before|crossed|rrp|uvp|compare|original|previous|retail|msrp|saving|discount-amount|per-unit|unit-price/i;
const GOOD_RE = /current|sale|final|now|special|actual|offer|our|main|primary|selling/i;

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || null;

function absolutize(src: string | null, base: string) {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function availability(v: unknown): boolean | null {
  if (typeof v !== "string") return null;
  if (/InStock|LimitedAvailability|OnlineOnly|PreOrder|InStoreOnly/i.test(v)) return true;
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return false;
  return null;
}

function readOffer(o: Record<string, unknown>, inheritedCurrency: string | null): Offer {
  const spec = (Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification) as
    | Record<string, unknown>
    | undefined;
  const cents =
    parseStructuredPrice(o.price) ??
    parseStructuredPrice(o.lowPrice) ??
    parseStructuredPrice(spec?.price) ??
    null;
  const currency =
    normalizeCurrency(o.priceCurrency as string) ??
    normalizeCurrency(spec?.priceCurrency as string) ??
    inheritedCurrency;
  return { cents, currency, inStock: availability(o.availability) };
}

type LdProduct = { name: string | null; image: string | null; offer: Offer | null; soldOut: boolean };

function walkJsonLd(node: unknown, out: LdProduct[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out));
    return;
  }
  const o = node as Record<string, unknown>;
  const type = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (type.some((t) => /Product|ProductGroup|IndividualProduct|ProductModel/i.test(t)) || o.offers) {
    const offersRaw = o.offers;
    const list = ([] as unknown[]).concat(offersRaw ?? []) as Record<string, unknown>[];
    let offer: Offer | null = null;
    let soldOut = list.length > 0;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      let candidate = readOffer(item, null);
      if (candidate.cents == null && item.offers) {
        const nested = ([] as unknown[]).concat(item.offers)[0] as Record<string, unknown> | undefined;
        if (nested) candidate = readOffer(nested, candidate.currency);
      }
      if (candidate.inStock !== false) soldOut = false;
      if (candidate.cents != null && (offer == null || candidate.cents < (offer.cents ?? Infinity))) {
        offer = candidate;
      }
    }
    const img = o.image;
    const image =
      typeof img === "string"
        ? img
        : Array.isArray(img)
          ? (typeof img[0] === "string" ? img[0] : (img[0] as { url?: string })?.url) ?? null
          : (img as { url?: string } | undefined)?.url ?? null;
    out.push({ name: clean(o.name as string), image, offer, soldOut });
  }
  for (const key of ["@graph", "mainEntity", "itemListElement", "hasVariant", "itemOffered"]) {
    if (o[key]) walkJsonLd(o[key], out);
  }
}

function cssPath($: cheerio.CheerioAPI, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; cur && cur.type === "tag" && depth < 4; depth++) {
    const id = cur.attribs?.id;
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      parts.unshift(`#${id}`);
      break;
    }
    const classes = (cur.attribs?.class || "")
      .split(/\s+/)
      .filter((c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 40)
      .slice(0, 2);
    parts.unshift(cur.tagName + classes.map((c) => `.${c}`).join(""));
    cur = cur.parent as Element | null;
  }
  return parts.join(" > ");
}

function textOf($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>) {
  return clean(el.attr("content") || el.attr("data-price") || el.first().text());
}

export function extract(html: string, pageUrl: string, userSelector?: string | null): Extraction {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).hostname;
  const metaCurrency =
    normalizeCurrency($('meta[property="product:price:currency"]').attr("content")) ??
    normalizeCurrency($('meta[property="og:price:currency"]').attr("content")) ??
    normalizeCurrency($('[itemprop="priceCurrency"]').first().attr("content"));

  const ld: LdProduct[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    const raw = $(s).contents().text();
    try {
      walkJsonLd(JSON.parse(raw), ld);
    } catch {
      /* invalid JSON-LD is common; ignore */
    }
  });
  const ldWithPrice = ld.find((p) => p.offer?.cents != null);

  const title =
    ldWithPrice?.name ?? ld.find((p) => p.name)?.name ??
    clean($('meta[property="og:title"]').attr("content")) ??
    clean($("#productTitle").text()) ??
    clean($("h1").first().text()) ??
    clean($("title").text());
  const imageUrl = absolutize(
    ldWithPrice?.image ?? ld.find((p) => p.image)?.image ??
      $('meta[property="og:image"]').attr("content") ??
      $("#landingImage").attr("src") ??
      $('[itemprop="image"]').first().attr("src") ??
      $('[itemprop="image"]').first().attr("content") ??
      $('[id*="product" i] img, [class*="product" i] img, [class*="gallery" i] img').first().attr("src") ??
      null,
    pageUrl,
  );
  const base = { title, imageUrl, candidates: [] as Candidate[] };
  const fallbackCurrency = (txt?: string | null) =>
    (txt ? parsePrice(txt)?.currency : null) ?? metaCurrency ?? currencyFromHost(host);

  // 1. User-chosen selector wins.
  if (userSelector) {
    try {
      const t = textOf($, $(userSelector).first());
      const p = parsePrice(t);
      if (p) {
        return { ...base, priceCents: p.cents, currency: p.currency ?? fallbackCurrency(), inStock: null, source: "selector" };
      }
    } catch {
      /* invalid selector -> fall through */
    }
  }

  // 2. JSON-LD
  if (ldWithPrice?.offer?.cents != null) {
    const o = ldWithPrice.offer;
    return { ...base, priceCents: o.cents, currency: o.currency ?? fallbackCurrency(), inStock: o.inStock, source: "jsonld" };
  }

  // 3. Meta / microdata
  for (const sel of [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[itemprop="price"]',
  ]) {
    const el = $(sel).first();
    if (!el.length) continue;
    const content = el.attr("content");
    const cents = content != null ? parseStructuredPrice(content) : parsePrice(el.text())?.cents ?? null;
    if (cents) {
      const avail = availability($('[itemprop="availability"]').attr("href") ?? $('[itemprop="availability"]').attr("content"));
      return { ...base, priceCents: cents, currency: fallbackCurrency(el.text()), inStock: avail, source: "meta" };
    }
  }

  // 4. Known shop selectors
  for (const sel of SITE_SELECTORS) {
    const t = textOf($, $(sel).first());
    const p = parsePrice(t);
    if (p) {
      const oos = /currently unavailable|out of stock|nicht verfügbar/i.test($("#availability").text());
      return { ...base, priceCents: p.cents, currency: p.currency ?? fallbackCurrency(), inStock: oos ? false : null, source: "site" };
    }
  }

  // 5. Heuristics over anything that looks like a price.
  const scored: (Candidate & { score: number })[] = [];
  const seen = new Set<number>();
  $('[class*="price" i], [id*="price" i], [data-price], [class*="cena" i], [class*="preis" i], [class*="prix" i]').each((i, node) => {
    const el = node as Element;
    const $el = $(el);
    if ($el.closest("del, s, strike, script, style, noscript").length) return;
    const ident = `${el.attribs?.class || ""} ${el.attribs?.id || ""}`;
    if (OLD_RE.test(ident)) return;
    if ($el.children().filter((_, c) => /price/i.test((c as Element).attribs?.class || "")).length) return;
    const text = clean($el.attr("data-price") || $el.text());
    if (!text || text.length > 40 || !/\d/.test(text)) return;
    const p = parsePrice(text);
    if (!p) return;
    let score = 0;
    if (GOOD_RE.test(ident)) score += 3;
    if (p.currency) score += 2;
    if ($el.closest('[class*="related" i], [class*="recommend" i], [class*="carousel" i], footer, nav').length) score -= 4;
    score -= i * 0.01; // earlier on the page is usually the main product
    scored.push({ selector: cssPath($, el), text, cents: p.cents, score });
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates: Candidate[] = [];
  for (const c of scored) {
    if (seen.has(c.cents)) continue;
    seen.add(c.cents);
    candidates.push({ selector: c.selector, text: c.text, cents: c.cents });
    if (candidates.length >= 8) break;
  }
  const best = scored[0];
  if (best && best.score >= 2) {
    return { ...base, candidates, priceCents: best.cents, currency: fallbackCurrency(best.text), inStock: null, source: "heuristic" };
  }
  const unavailable =
    ld.some((p) => p.soldOut) ||
    availability($('[itemprop="availability"]').attr("href") ?? $('[itemprop="availability"]').attr("content")) === false ||
    $("#outOfStock").length > 0 ||
    /currently unavailable|nicht verfügbar|out of stock|sold out|ausverkauft|ni na zalogi|razprodano/i.test(
      $("#availability, [class*=availability i], [class*=stock i]").first().text(),
    );
  return {
    ...base,
    candidates: unavailable ? [] : candidates,
    priceCents: null,
    currency: fallbackCurrency(),
    inStock: unavailable ? false : null,
    source: null,
    unavailable,
  };
}

export function looksBlocked(status: number, html: string): boolean {
  if ([401, 403, 429, 503].includes(status)) return true;
  return /captcha|robot check|are you a robot|access denied|cf-chl-|challenge-platform|px-captcha|enable javascript and cookies/i.test(
    html.slice(0, 20000),
  );
}
