import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("strips tracking params and hash", () => {
    expect(normalizeUrl("https://shop.si/p/1?utm_source=x&color=red#reviews")).toBe("https://shop.si/p/1?color=red");
  });
  it("shortens Amazon links to /dp/ASIN", () => {
    expect(normalizeUrl("https://www.amazon.de/Sony-WH-1000XM6/dp/b0cx23v2zk/ref=sr_1_1?keywords=sony")).toBe(
      "https://www.amazon.de/dp/B0CX23V2ZK",
    );
  });
});
