import { describe, expect, test } from "bun:test";
import { comparisonPeriods } from "./comparison-periods";

describe("comparisonPeriods", () => {
  test("a past month against the whole month before it", () => {
    expect(comparisonPeriods("month", "2026-03", "2026-10-11")).toEqual({
      toDate: false,
      current: { start: "2026-03-01", end: "2026-04-01" },
      previous: { start: "2026-02-01", end: "2026-03-01" },
    });
  });

  test("this month to date against the same days of last month", () => {
    expect(comparisonPeriods("month", "2026-10", "2026-10-11")).toEqual({
      toDate: true,
      current: { start: "2026-10-01", end: "2026-10-12" },
      previous: { start: "2026-09-01", end: "2026-09-12" },
    });
  });

  test("a to-date day past the end of the shorter month takes the whole of it", () => {
    expect(comparisonPeriods("month", "2026-03", "2026-03-30").previous).toEqual({
      start: "2026-02-01",
      end: "2026-03-01",
    });
  });

  test("January against the December before it", () => {
    expect(comparisonPeriods("month", "2026-01", "2026-10-11").previous).toEqual({
      start: "2025-12-01",
      end: "2026-01-01",
    });
  });

  test("a past year against the year before it", () => {
    expect(comparisonPeriods("year", "2025", "2026-10-11")).toEqual({
      toDate: false,
      current: { start: "2025-01-01", end: "2026-01-01" },
      previous: { start: "2024-01-01", end: "2025-01-01" },
    });
  });

  test("this year to date against the same stretch of last year", () => {
    expect(comparisonPeriods("year", "2026", "2026-10-11")).toEqual({
      toDate: true,
      current: { start: "2026-01-01", end: "2026-10-12" },
      previous: { start: "2025-01-01", end: "2025-10-12" },
    });
  });

  test("the last day of a period to date ends at the next period", () => {
    expect(comparisonPeriods("year", "2026", "2026-12-31").current.end).toBe("2027-01-01");
  });
});
