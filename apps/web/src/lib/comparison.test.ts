import { describe, expect, test } from "bun:test";
import { currentAnchor, rangeLabel, stepAnchor } from "./comparison";

describe("currentAnchor", () => {
  test("is this month or this year", () => {
    const oct11 = new Date(2026, 9, 11);
    expect(currentAnchor("month", oct11)).toBe("2026-10");
    expect(currentAnchor("year", oct11)).toBe("2026");
  });
});

describe("stepAnchor", () => {
  test("moves a month across a year boundary", () => {
    expect(stepAnchor("month", "2026-01", -1)).toBe("2025-12");
    expect(stepAnchor("month", "2025-12", 1)).toBe("2026-01");
  });

  test("moves a year", () => {
    expect(stepAnchor("year", "2026", -1)).toBe("2025");
  });
});

describe("rangeLabel", () => {
  test("names a whole month or year plainly", () => {
    expect(rangeLabel({ start: "2026-03-01", end: "2026-04-01" }, "month", false)).toBe("March 2026");
    expect(rangeLabel({ start: "2025-01-01", end: "2026-01-01" }, "year", false)).toBe("2025");
  });

  test("names a period to date by its first and last days", () => {
    expect(rangeLabel({ start: "2026-10-01", end: "2026-10-12" }, "month", true)).toBe("Oct 1 to 11, 2026");
    expect(rangeLabel({ start: "2026-01-01", end: "2026-10-12" }, "year", true)).toBe("Jan 1 to Oct 11, 2026");
  });
});
