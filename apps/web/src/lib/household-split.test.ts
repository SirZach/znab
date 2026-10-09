import { describe, expect, test } from "bun:test";
import { validSplitSettings } from "./household-split";

const valid = { primaryId: 1, partnerId: 2, percent: "20" };

describe("validSplitSettings", () => {
  test("accepts two budgets and a percent in range", () => {
    expect(validSplitSettings(valid)).toBe(true);
    expect(validSplitSettings({ ...valid, percent: "0" })).toBe(true);
    expect(validSplitSettings({ ...valid, percent: "100" })).toBe(true);
  });

  test("needs both budgets, and different ones", () => {
    expect(validSplitSettings({ ...valid, primaryId: null })).toBe(false);
    expect(validSplitSettings({ ...valid, partnerId: null })).toBe(false);
    expect(validSplitSettings({ ...valid, partnerId: 1 })).toBe(false);
  });

  test("needs a percent from 0 to 100", () => {
    expect(validSplitSettings({ ...valid, percent: " " })).toBe(false);
    expect(validSplitSettings({ ...valid, percent: "-1" })).toBe(false);
    expect(validSplitSettings({ ...valid, percent: "101" })).toBe(false);
    expect(validSplitSettings({ ...valid, percent: "abc" })).toBe(false);
  });
});
