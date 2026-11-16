import { describe, expect, it } from "vitest";
import { nextSlot } from "./schedule";

describe("nextSlot", () => {
  it("snaps to the next multiple of the interval from midnight", () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m);
    expect(nextSlot(6, at(13, 5)).getHours()).toBe(18);
    expect(nextSlot(6, at(18, 0)).getHours()).toBe(0);
    expect(nextSlot(6, at(23, 59)).getDate()).toBe(17);
    expect(nextSlot(12, at(1)).getHours()).toBe(12);
    expect(nextSlot(1, at(9, 30)).getHours()).toBe(10);
  });
});
