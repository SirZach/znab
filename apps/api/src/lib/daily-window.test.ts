import { describe, expect, test } from "bun:test";
import { dailyWindow } from "./daily-window";

describe("dailyWindow", () => {
  test("a past year is every day of it", () => {
    expect(dailyWindow(2025, "2026-10-11")).toEqual({
      year: 2025,
      start: "2025-01-01",
      until: "2026-01-01",
      through: "2025-12-31",
      days: 365,
    });
    expect(dailyWindow(2024, "2026-10-11").days).toBe(366);
  });

  test("the year still running stops at today, leaving future-dated days out", () => {
    expect(dailyWindow(2026, "2026-10-11")).toEqual({
      year: 2026,
      start: "2026-01-01",
      until: "2026-10-12",
      through: "2026-10-11",
      days: 284,
    });
  });

  test("a year that has not begun on the server is read as this one", () => {
    expect(dailyWindow(2027, "2026-12-31")).toMatchObject({ year: 2026, through: "2026-12-31", days: 365 });
  });

  test("New Year's Day is one day", () => {
    expect(dailyWindow(2026, "2026-01-01")).toMatchObject({ until: "2026-01-02", days: 1 });
  });
});
