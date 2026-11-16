// Price parsing and formatting. Pure functions (no server-only imports) so the
// UI and the scraper share them and vitest can cover them.

export type ParsedPrice = { cents: number; currency: string | null };

const SYMBOLS: [RegExp, string][] = [
  [/R\$/, "BRL"],
  [/zł/i, "PLN"],
  [/Kč/i, "CZK"],
  [/\bFt\b/, "HUF"],
  [/\blei\b/i, "RON"],
  [/\bkn\b/, "HRK"],
  [/\bden\b|ден/i, "MKD"],
  [/\bKM\b/, "BAM"],
  [/\bdin\b|дин/i, "RSD"],
  [/\bCHF\b|\bFr\.\s?/, "CHF"],
  [/€/, "EUR"],
  [/£/, "GBP"],
  [/¥|￥/, "JPY"],
  [/₹/, "INR"],
  [/₽/, "RUB"],
  [/₺/, "TRY"],
  [/₴/, "UAH"],
  [/₩/, "KRW"],
  [/₪/, "ILS"],
  [/\$/, "USD"],
];

const CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "SEK", "NOK",
  "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY", "BRL", "MXN", "ZAR", "AED",
  "SAR", "ILS", "KRW", "RUB", "UAH", "RSD", "BAM", "MKD", "HRK", "NZD", "SGD",
]);

const TLD_CURRENCY: Record<string, string> = {
  si: "EUR", de: "EUR", at: "EUR", fr: "EUR", it: "EUR", es: "EUR", nl: "EUR",
  be: "EUR", ie: "EUR", pt: "EUR", fi: "EUR", gr: "EUR", sk: "EUR", hr: "EUR",
  ee: "EUR", lv: "EUR", lt: "EUR", lu: "EUR", eu: "EUR",
  uk: "GBP", pl: "PLN", cz: "CZK", hu: "HUF", ro: "RON", bg: "BGN", ch: "CHF",
  se: "SEK", dk: "DKK", no: "NOK", rs: "RSD", ba: "BAM", mk: "MKD", us: "USD",
  ca: "CAD", au: "AUD", jp: "JPY", in: "INR", tr: "TRY", br: "BRL",
};

export function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (CODES.has(v.toUpperCase())) return v.toUpperCase();
  return currencyFromText(v);
}

export function currencyFromText(text: string): string | null {
  const code = text.toUpperCase().match(/\b([A-Z]{3})\b/g);
  if (code) for (const c of code) if (CODES.has(c)) return c;
  for (const [re, iso] of SYMBOLS) if (re.test(text)) return iso;
  return null;
}

export function currencyFromHost(host: string): string | null {
  const parts = host.toLowerCase().split(".");
  return TLD_CURRENCY[parts[parts.length - 1]] ?? null;
}

// Grouped integer part (1.299 / 1,299 / 1 299 / 1'299) + optional decimals.
const NUMBER_RE = /\d+(?:(?:[.,'’]| )\d{3})*(?:[.,]\d+)?/;

/** Parse a human-written price like "1.299,99 €" or "€1,299.99". */
export function parsePrice(raw: string | null | undefined): ParsedPrice | null {
  if (raw == null) return null;
  const text = String(raw)
    .replace(/[    ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const m = text.match(NUMBER_RE);
  if (!m) return null;
  let token = m[0];
  let intPart = token;
  let decPart = "";

  const dec = token.match(/[.,](\d+)$/);
  // A trailing separator group of exactly 3 digits was consumed as grouping by
  // the regex, so anything left here with 1–2 (or 4+) digits is a decimal part.
  if (dec && dec[1].length !== 3) {
    intPart = token.slice(0, dec.index);
    decPart = dec[1];
  } else if (dec && dec[1].length === 3) {
    // "1.299" / "1,299" -> thousands. But "0.125" style -> decimal.
    const lead = token.slice(0, dec.index);
    if (/^0+$/.test(lead)) {
      intPart = lead;
      decPart = dec[1];
    }
  }
  token = intPart.replace(/[.,'’ ]/g, "");
  if (!/^\d+$/.test(token)) return null;

  const whole = parseInt(token, 10);
  const frac = decPart ? Math.round(parseFloat(`0.${decPart}`) * 100) : 0;
  const cents = whole * 100 + frac;
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000_00) return null;

  return { cents, currency: currencyFromText(text) };
}

/** Parse a machine value (JSON-LD / meta content) where "." is the decimal point. */
export function parseStructuredPrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  }
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) {
    const cents = Math.round(parseFloat(v) * 100);
    return cents > 0 ? cents : null;
  }
  return parsePrice(v)?.cents ?? null;
}

export function percentChange(from: number, to: number): number {
  if (!from) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}

const SYMBOL_OF: Record<string, string> = {
  EUR: "€", GBP: "£", USD: "$", JPY: "¥", INR: "₹", PLN: "zł ", CZK: "Kč ",
  HUF: "Ft ", CHF: "CHF ", RON: "lei ", TRY: "₺", BRL: "R$",
};

/** "€1.299,99" — station-board style: symbol first, comma decimals. */
export function formatMoney(cents: number | null | undefined, currency?: string | null): string {
  if (cents == null) return "—";
  const sym = currency ? (SYMBOL_OF[currency] ?? `${currency} `) : "";
  return sym + formatAmount(cents);
}

export function formatAmount(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "▼ 12,5 %" is rendered by the UI; this gives the signed number text. */
export function formatPercent(p: number): string {
  const s = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(p));
  return `${p < 0 ? "−" : p > 0 ? "+" : ""}${s} %`;
}
