import { extract, looksBlocked, type Candidate } from "./extract";
import { fetchStatic } from "./fetch-static";
import { fetchWithBrowser } from "./browser";
import { UnsafeUrlError } from "./url-guard";

export type Method = "static" | "browser" | "selector";

export type ScrapeResult =
  | {
      ok: true;
      priceCents: number;
      currency: string | null;
      title: string | null;
      imageUrl: string | null;
      inStock: boolean | null;
      method: Method;
      candidates: Candidate[];
    }
  | {
      ok: false;
      error: string;
      title: string | null;
      imageUrl: string | null;
      candidates: Candidate[];
      fatal?: boolean;
      /** Page loaded fine but the shop offers no price right now. */
      unavailable?: boolean;
    };

const UNAVAILABLE = "The shop lists this product as unavailable right now, so there is no price to read.";

type Opts = { selector?: string | null; preferBrowser?: boolean };

export async function scrape(url: string, opts: Opts = {}): Promise<ScrapeResult> {
  let staticError: string | null = null;
  let partial: { title: string | null; imageUrl: string | null; candidates: Candidate[] } = {
    title: null,
    imageUrl: null,
    candidates: [],
  };

  if (!opts.preferBrowser) {
    try {
      const res = await fetchStatic(url);
      const blocked = looksBlocked(res.status, res.html);
      if (!blocked && res.status < 400) {
        const ex = extract(res.html, res.finalUrl, opts.selector);
        if (ex.priceCents != null) {
          return {
            ok: true,
            priceCents: ex.priceCents,
            currency: ex.currency,
            title: ex.title,
            imageUrl: ex.imageUrl,
            inStock: ex.inStock,
            method: ex.source === "selector" ? "selector" : "static",
            candidates: ex.candidates,
          };
        }
        if (ex.unavailable) {
          return { ok: false, unavailable: true, error: UNAVAILABLE, title: ex.title, imageUrl: ex.imageUrl, candidates: [] };
        }
        partial = ex;
        staticError = "No price found on the page.";
      } else {
        staticError = blocked ? `The shop blocked the request (HTTP ${res.status}).` : `The shop answered HTTP ${res.status}.`;
      }
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return { ok: false, fatal: true, error: err.message, ...partial };
      }
      staticError = describe(err);
    }
  }

  try {
    const res = await fetchWithBrowser(url);
    if (looksBlocked(res.status, res.html) && res.status >= 400) {
      return { ok: false, error: `The shop blocked the headless browser too (HTTP ${res.status}).`, ...partial };
    }
    const ex = extract(res.html, res.finalUrl, opts.selector);
    if (ex.priceCents != null) {
      return {
        ok: true,
        priceCents: ex.priceCents,
        currency: ex.currency,
        title: ex.title,
        imageUrl: ex.imageUrl,
        inStock: ex.inStock,
        method: ex.source === "selector" ? "selector" : "browser",
        candidates: ex.candidates,
      };
    }
    if (ex.unavailable) {
      return { ok: false, unavailable: true, error: UNAVAILABLE, title: ex.title ?? partial.title, imageUrl: ex.imageUrl ?? partial.imageUrl, candidates: [] };
    }
    return {
      ok: false,
      error: "No price found, even in a real browser. Pick the price from the suggestions or enter a CSS selector.",
      title: ex.title ?? partial.title,
      imageUrl: ex.imageUrl ?? partial.imageUrl,
      candidates: ex.candidates.length ? ex.candidates : partial.candidates,
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ok: false, fatal: true, error: err.message, ...partial };
    const browserError = describe(err);
    return { ok: false, error: staticError ? `${staticError} ${browserError}` : browserError, ...partial };
  }
}

function describe(err: unknown): string {
  const e = err as Error & { cause?: { code?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "The shop took too long to answer.";
  if (e?.cause?.code === "ENOTFOUND") return "The shop's address could not be found.";
  return (e?.message || String(err)).split("\n")[0].slice(0, 300);
}

export type { Candidate };
