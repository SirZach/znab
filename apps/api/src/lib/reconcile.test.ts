import { describe, expect, test } from "bun:test";
import { balanceAdjustment, reconcileDifference } from "./reconcile";
import { IMMEDIATE_INCOME } from "./budget-math";

describe("reconcileDifference: what the statement leaves outstanding", () => {
  test("a statement agreeing with the cleared balance leaves nothing", () => {
    expect(reconcileDifference(100.5, "100.50")).toBe(0);
  });

  test("a statement above the cleared balance leaves money to add", () => {
    expect(reconcileDifference(120, "100.50")).toBe(19.5);
  });

  test("and one below it leaves money to take away", () => {
    expect(reconcileDifference(80.25, "100.50")).toBe(-20.25);
  });

  test("a credit card statement is negative on both sides", () => {
    expect(reconcileDifference(-2199.45, "-2376.15")).toBe(176.7);
  });

  test("a statement balance of zero is a balance, not a missing one", () => {
    expect(reconcileDifference(0, "-42.17")).toBe(42.17);
    expect(reconcileDifference(0, "0.00")).toBe(0);
  });

  test("the arithmetic is exact where floating point is not", () => {
    // 0.1 + 0.2 is 0.30000000000000004, so subtracting in dollars would leave
    // a fraction of a cent outstanding and offer an adjustment for it.
    expect(reconcileDifference(0.1 + 0.2, "0.30")).toBe(0);
    expect(reconcileDifference(0.3, "0.1")).toBe(0.2);
    expect(reconcileDifference("1000000.03", "1000000.01")).toBe(0.02);
  });
});

describe("balanceAdjustment: only a budgeted account files the difference anywhere", () => {
  test("an on-budget account's adjustment is income to the budget", () => {
    expect(balanceAdjustment({ onBudget: true }, 19.5)).toEqual({
      amount: 19.5,
      categoryYnabId: IMMEDIATE_INCOME,
    });
  });

  test("a tracking account's adjustment carries no category at all", () => {
    expect(balanceAdjustment({ onBudget: false }, 19.5)).toEqual({
      amount: 19.5,
      categoryYnabId: null,
    });
  });

  test("the amount is the difference, whichever way it falls", () => {
    expect(balanceAdjustment({ onBudget: true }, -20.25).amount).toBe(-20.25);
    expect(balanceAdjustment({ onBudget: false }, 0).amount).toBe(0);
  });
});
