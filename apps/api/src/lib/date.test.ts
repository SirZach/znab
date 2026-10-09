import { describe, expect, test } from "bun:test";
import { localToday } from "./date";

describe("localToday", () => {
  test("formats the local calendar date with zero padding", () => {
    expect(localToday(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  test("uses the local day, not the UTC day, late in the evening", () => {
    expect(localToday(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
  });

  test("uses the local day just after local midnight", () => {
    expect(localToday(new Date(2026, 11, 31, 0, 5))).toBe("2026-12-31");
  });

  test("defaults to now", () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
