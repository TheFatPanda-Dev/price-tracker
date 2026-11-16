import { describe, expect, it } from "vitest";
import {
  currencyFromHost,
  formatMoney,
  formatPercent,
  parsePrice,
  parseStructuredPrice,
  percentChange,
} from "./price";

describe("parsePrice", () => {
  const cases: [string, number, string | null][] = [
    ["1.299,99 €", 129999, "EUR"],
    ["€1,299.99", 129999, "EUR"],
    ["1 299,99 €", 129999, "EUR"],
    ["1 299,99 €", 129999, "EUR"],
    ["1 299,99 €", 129999, "EUR"],
    ["CHF 1'299.00", 129900, "CHF"],
    ["12,-", 1200, null],
    ["199.-", 19900, null],
    ["1.299.-", 129900, null],
    ["EUR 49.90", 4990, "EUR"],
    ["€10 – €20", 1000, "EUR"],
    ["$49.9", 4990, "USD"],
    ["£1,299", 129900, "GBP"],
    ["349,00 zł", 34900, "PLN"],
    ["2 499 Kč", 249900, "CZK"],
    ["12 990 Ft", 1299000, "HUF"],
    ["99,95", 9995, null],
    ["Now only 1299.99", 129999, null],
    ["1.234.567,89 €", 123456789, "EUR"],
  ];
  it.each(cases)("%s", (input, cents, currency) => {
    expect(parsePrice(input)).toEqual({ cents, currency });
  });

  it("rejects non-prices", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("Out of stock")).toBeNull();
    expect(parsePrice("0,00 €")).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe("parseStructuredPrice", () => {
  it("treats dot as decimal", () => {
    expect(parseStructuredPrice("1299.00")).toBe(129900);
    expect(parseStructuredPrice("1.5")).toBe(150);
    expect(parseStructuredPrice(49.9)).toBe(4990);
    expect(parseStructuredPrice("1.299,00")).toBe(129900);
    expect(parseStructuredPrice("")).toBeNull();
    expect(parseStructuredPrice(0)).toBeNull();
  });
});

describe("helpers", () => {
  it("percentChange", () => {
    expect(percentChange(39900, 34900)).toBe(-12.5);
    expect(percentChange(15990, 16990)).toBe(6.3);
  });
  it("currencyFromHost", () => {
    expect(currencyFromHost("www.bigbang.si")).toBe("EUR");
    expect(currencyFromHost("amazon.co.uk")).toBe("GBP");
    expect(currencyFromHost("example.com")).toBeNull();
  });
  it("formats", () => {
    expect(formatMoney(129999, "EUR")).toBe("€1.299,99");
    expect(formatPercent(-12.5)).toBe("−12,5 %");
    expect(formatPercent(6.3)).toBe("+6,3 %");
  });
});
