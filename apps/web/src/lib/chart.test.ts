import { describe, expect, test } from "bun:test";
import { formatCompactCurrency, formatMonthTick } from "./chart";

describe("formatMonthTick", () => {
  test("reads a YYYY-MM month as a short month and two digit year", () => {
    expect(formatMonthTick("2024-01")).toBe("Jan '24");
    expect(formatMonthTick("1999-12")).toBe("Dec '99");
  });
});

describe("formatCompactCurrency", () => {
  test("shortens large amounts and keeps small ones whole", () => {
    expect(formatCompactCurrency(1234)).toBe("$1.2K");
    expect(formatCompactCurrency(2_500_000)).toBe("$2.5M");
    expect(formatCompactCurrency(0)).toBe("$0");
    expect(formatCompactCurrency(-800)).toBe("-$800");
  });
});
