import { describe, expect, test } from "bun:test";
import { isCreditAccountType, isOneOff, transferCarriesCategory } from "./rules";
import { ACCOUNT_TYPES, DEFERRED_INCOME, IMMEDIATE_INCOME, isSpecialCategoryId, SPLIT_CATEGORY_ID } from "./types";

describe("transferCarriesCategory: only spending out of the budget is categorised", () => {
  const onBudget = { onBudget: true };
  const offBudget = { onBudget: false };

  test("paying a tracking account from a budgeted one is spending", () => {
    expect(transferCarriesCategory(onBudget, offBudget)).toBe(true);
  });

  test("moving money between two budgeted accounts spends nothing", () => {
    expect(transferCarriesCategory(onBudget, onBudget)).toBe(false);
  });

  test("the off-budget side of that same pair carries no category either", () => {
    expect(transferCarriesCategory(offBudget, onBudget)).toBe(false);
  });

  test("two tracking accounts are outside the budget entirely", () => {
    expect(transferCarriesCategory(offBudget, offBudget)).toBe(false);
  });

  test("an account that has not loaded yet carries no category", () => {
    expect(transferCarriesCategory(undefined, offBudget)).toBe(false);
    expect(transferCarriesCategory(onBudget, undefined)).toBe(false);
    expect(transferCarriesCategory(undefined, undefined)).toBe(false);
  });
});

describe("isOneOff: only Once never comes round again", () => {
  test("Once is the one", () => {
    expect(isOneOff("Once")).toBe(true);
    expect(isOneOff("Monthly")).toBe(false);
    expect(isOneOff("TwiceAMonth")).toBe(false);
  });

  test("an unknown frequency from a later YNAB still recurs", () => {
    expect(isOneOff("Fortnightly")).toBe(false);
  });
});

describe("isCreditAccountType: debt accounts", () => {
  test("credit cards and other liabilities hold debt; nothing else does", () => {
    const credit = ACCOUNT_TYPES.filter(isCreditAccountType);
    expect(credit).toEqual(["CreditCard", "OtherLiability"]);
    expect(isCreditAccountType("Mortgage")).toBe(false);
  });
});

describe("special category ids", () => {
  test("the two income ids and the split id are not real categories", () => {
    expect(IMMEDIATE_INCOME).toBe("Category/__ImmediateIncome__");
    expect(DEFERRED_INCOME).toBe("Category/__DeferredIncome__");
    for (const id of [IMMEDIATE_INCOME, DEFERRED_INCOME, SPLIT_CATEGORY_ID]) {
      expect(isSpecialCategoryId(id)).toBe(true);
    }
    expect(isSpecialCategoryId("Category/PreYNABDebt/A1")).toBe(false);
  });
});
