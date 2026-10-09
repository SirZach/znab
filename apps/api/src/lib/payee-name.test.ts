import { describe, expect, test } from "bun:test";
import { normalizePayeeName, payeeNameKey } from "./payee-name";

describe("normalizePayeeName", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizePayeeName("  Lakeside Inn  ")).toBe("Lakeside Inn");
  });

  test("keeps the case as typed", () => {
    expect(normalizePayeeName("Rosie's Diner")).toBe("Rosie's Diner");
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
    expect(payeeNameKey(" lakeside inn ")).toBe(payeeNameKey("Lakeside Inn"));
  });

  test("keeps different names apart", () => {
    expect(payeeNameKey("Lakeside Inn")).not.toBe(payeeNameKey("Lakeside Inn Garden"));
  });
});
