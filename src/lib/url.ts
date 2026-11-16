const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_$|_encoding$|psc$|spm$|scm$|pd_rd_|pf_rd_|content-id$|smid$|th$)/i;

export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  if (/(^|\.)amazon\./.test(url.hostname)) {
    const asin = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return `${url.origin}/dp/${asin.toUpperCase()}`;
  }
  return url.toString();
}
