import { describe, expect, test } from "bun:test";
import { describeTbbChanges, formatMonthYear } from "./tbb-impact";

describe("describeTbbChanges", () => {
  test("is empty when nothing changes", () => {
    expect(describeTbbChanges([], "2026-10")).toEqual([]);
  });

  test("folds a run that lasts to the end into one line", () => {
    const changes = ["2026-02", "2026-03", "2026-04"].map((month) => ({ month, delta: 50 }));
    expect(describeTbbChanges(changes, "2026-04")).toEqual(["+$50.00 from Feb 2026"]);
  });

  test("splits on a new amount or a gap, and names bounded runs", () => {
    const changes = [
      { month: "2025-12", delta: -20 },
      { month: "2026-01", delta: -20 },
      { month: "2026-03", delta: 5 },
      { month: "2026-04", delta: 7.5 },
    ];
    expect(describeTbbChanges(changes, "2026-04")).toEqual([
      "-$20.00 from Dec 2025 to Jan 2026",
      "+$5.00 in Mar 2026",
      "+$7.50 from Apr 2026",
    ]);
  });

  test("formats months the way the dialog reads them", () => {
    expect(formatMonthYear("2026-02")).toBe("Feb 2026");
  });
});
