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

  test("in a leap year, the 29th of March is set against all of February", () => {
    expect(comparisonPeriods("month", "2028-03", "2028-03-29").previous).toEqual({
      start: "2028-02-01",
      end: "2028-03-01",
    });
    expect(comparisonPeriods("month", "2028-03", "2028-03-28").previous).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
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

  test("this year to date against the same stretch of last year, across a leap day", () => {
    expect(comparisonPeriods("year", "2026", "2026-10-11")).toEqual({
      toDate: true,
      current: { start: "2026-01-01", end: "2026-10-12" },
      previous: { start: "2025-01-01", end: "2025-10-12" },
    });
    expect(comparisonPeriods("year", "2029", "2029-02-28").previous).toEqual({
      start: "2028-01-01",
      end: "2028-03-01",
    });
  });

  test("the last day of a period is the whole of it, against the whole of the one before", () => {
    expect(comparisonPeriods("year", "2026", "2026-12-31")).toEqual({
      toDate: false,
      current: { start: "2026-01-01", end: "2027-01-01" },
      previous: { start: "2025-01-01", end: "2026-01-01" },
    });
    expect(comparisonPeriods("month", "2026-04", "2026-04-30")).toEqual({
      toDate: false,
      current: { start: "2026-04-01", end: "2026-05-01" },
      previous: { start: "2026-03-01", end: "2026-04-01" },
    });
  });
});
