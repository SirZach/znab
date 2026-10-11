import { describe, expect, test } from "bun:test";
import { calendarDays, monthStarts, shadeFor } from "./spending-calendar";

describe("calendarDays", () => {
  test("lays every day of a past year out by week and weekday, with what was spent", () => {
    const days = calendarDays(2025, [{ date: "2025-01-02", spent: 40 }], "2026-10-11");
    expect(days).toHaveLength(365);
    // 1 Jan 2025 was a Wednesday, in the first week column.
    expect(days[0]).toEqual({ date: "2025-01-01", week: 0, weekday: 3, spent: 0 });
    expect(days[1]).toEqual({ date: "2025-01-02", week: 0, weekday: 4, spent: 40 });
    // The first Sunday starts the second column.
    expect(days[4]).toMatchObject({ date: "2025-01-05", week: 1, weekday: 0 });
    expect(days.at(-1)).toMatchObject({ date: "2025-12-31", week: 52, weekday: 3 });
  });

  test("a leap year starting on a Saturday reaches a 54th week column", () => {
    const days = calendarDays(2028, [], "2030-01-01");
    expect(days).toHaveLength(366);
    expect(days[0]).toMatchObject({ week: 0, weekday: 6 });
    expect(days.at(-1)).toMatchObject({ date: "2028-12-31", week: 53, weekday: 0 });
  });

  test("stops at today in the year still running", () => {
    const days = calendarDays(2026, [], "2026-01-10");
    expect(days.map((d) => d.date).at(-1)).toBe("2026-01-10");
    expect(days).toHaveLength(10);
  });

  test("is empty for a year that has not begun", () => {
    expect(calendarDays(2027, [], "2026-10-11")).toEqual([]);
  });
});

describe("monthStarts", () => {
  test("is the week column each month begins in", () => {
    const starts = monthStarts(calendarDays(2025, [], "2026-10-11"));
    expect(starts.slice(0, 3)).toEqual([
      { week: 0, month: "Jan" },
      { week: 4, month: "Feb" },
      { week: 8, month: "Mar" },
    ]);
    expect(starts).toHaveLength(12);
  });
});

describe("shadeFor", () => {
  // Lopsided like a real budget: mostly small days and a few big bills.
  const shade = shadeFor([20, 40, 60, 80, 100, 150, 200, 300, 2_500, 12_000]);

  test("leaves days with nothing spent, or only refunds, unshaded", () => {
    expect(shade(0)).toBeNull();
    expect(shade(-30)).toBeNull();
  });

  test("shades by rank, so everyday spending spreads across the gradient", () => {
    expect(shade(20)).toBe(15);
    expect(shade(100)).toBe(53);
    expect(shade(300)).toBe(81);
    expect(shade(12_000)).toBe(100);
    // Between two days it takes the rank of the one below.
    expect(shade(120)).toBe(53);
  });

  test("a single spending day is fully shaded", () => {
    expect(shadeFor([45])(45)).toBe(100);
  });
});
