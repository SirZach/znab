import { describe, expect, test } from "bun:test";
import { normalizePayeeName, payeeNameKey } from "./payee-name";

describe("normalizePayeeName", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizePayeeName("  Hilton  ")).toBe("Hilton");
  });

  test("keeps the case as typed", () => {
    expect(normalizePayeeName("Trader Joe's")).toBe("Trader Joe's");
  });

  test("keeps inner spacing", () => {
    expect(normalizePayeeName(" Big  Box ")).toBe("Big  Box");
  });

  test("returns null for blank, empty or missing names", () => {
    expect(normalizePayeeName("   ")).toBeNull();
    expect(normalizePayeeName("")).toBeNull();
    expect(normalizePayeeName(undefined)).toBeNull();
    expect(normalizePayeeName(null)).toBeNull();
  });
});

describe("payeeNameKey", () => {
  test("matches names that differ only by case and outer spaces", () => {
    expect(payeeNameKey(" hilton ")).toBe(payeeNameKey("Hilton"));
  });

  test("keeps different names apart", () => {
    expect(payeeNameKey("Hilton")).not.toBe(payeeNameKey("Hilton Garden"));
  });
});
