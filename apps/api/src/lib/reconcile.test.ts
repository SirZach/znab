import { describe, expect, test } from "bun:test";
import { balanceAdjustment } from "./reconcile";
import { IMMEDIATE_INCOME } from "@znab/shared";

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
