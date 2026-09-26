import { describe, expect, test } from "bun:test";
import { computeHouseholdSplit } from "./household-split";

describe("computeHouseholdSplit", () => {
  test("reproduces the household spreadsheet", () => {
    const split = computeHouseholdSplit({
      primary: { income: 13049.06, master: 6399.68 },
      partner: { income: 5956.54, master: 3722.56 },
      savingsPercent: 40,
    });
    expect(split.incomeTotal).toBeCloseTo(19005.6, 6);
    expect(split.masterTotal).toBeCloseTo(10122.24, 6);
    expect(split.leftOver).toBeCloseTo(8883.36, 6);
    expect(split.saving).toBeCloseTo(3553.344, 6);
    expect(split.partnerLeftOver).toBeCloseTo(2233.98, 6);
    expect(split.primaryLeftOver).toBeCloseTo(3096.036, 6);
  });

  test("saving nothing leaves the primary everything the partner does not keep", () => {
    const split = computeHouseholdSplit({
      primary: { income: 5000, master: 2000 },
      partner: { income: 3000, master: 1000 },
      savingsPercent: 0,
    });
    expect(split.saving).toBe(0);
    expect(split.partnerLeftOver).toBe(2000);
    expect(split.primaryLeftOver).toBe(3000);
  });

  test("saving everything comes entirely out of the primary's share", () => {
    const split = computeHouseholdSplit({
      primary: { income: 5000, master: 2000 },
      partner: { income: 3000, master: 1000 },
      savingsPercent: 100,
    });
    expect(split.leftOver).toBe(5000);
    expect(split.saving).toBe(5000);
    expect(split.partnerLeftOver).toBe(2000);
    expect(split.primaryLeftOver).toBe(-2000);
  });

  test("a month that spends more than it earns saves a negative amount", () => {
    const split = computeHouseholdSplit({
      primary: { income: 1000, master: 2500 },
      partner: { income: 500, master: 200 },
      savingsPercent: 40,
    });
    expect(split.leftOver).toBe(-1200);
    expect(split.saving).toBe(-480);
    expect(split.partnerLeftOver).toBe(300);
    expect(split.primaryLeftOver).toBe(-1020);
  });
});
