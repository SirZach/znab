import { describe, expect, test } from "bun:test";
import { calendarDays, colorCeiling, monthStarts } from "./spending-calendar";

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

describe("colorCeiling", () => {
  test("is the 95th percentile of spending days, so one huge day does not wash out the rest", () => {
    const spent = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(colorCeiling([...spent, 10_000])).toBe(20);
  });

  test("ignores refund days and is at least one", () => {
    expect(colorCeiling([-50, 0])).toBe(1);
    expect(colorCeiling([0.4, 0.6])).toBe(1);
  });

  test("with few spending days it is the largest of them", () => {
    expect(colorCeiling([5, 30, 12])).toBe(30);
  });
});
