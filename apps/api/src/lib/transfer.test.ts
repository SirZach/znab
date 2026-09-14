import { describe, expect, test } from "bun:test";
import { transferCategoryId, transferPayeeName, transferPayeeYnabId } from "./transfer";

/** Either end of a transfer, named the way the rules read. */
const on = { onBudget: true };
const off = { onBudget: false };

describe("transferCategoryId: only money leaving the budget is categorised", () => {
  test("between two on-budget accounts neither side carries a category", () => {
    expect(transferCategoryId(on, on, 7)).toBeNull();
  });

  test("the on-budget side of a transfer to an off-budget account keeps it", () => {
    expect(transferCategoryId(on, off, 7)).toBe(7);
  });

  test("and the off-budget side of that same pair does not", () => {
    expect(transferCategoryId(off, on, 7)).toBeNull();
  });

  test("between two off-budget accounts neither side carries a category", () => {
    expect(transferCategoryId(off, off, 7)).toBeNull();
  });

  test("no category stays no category, whichever way the money moves", () => {
    expect(transferCategoryId(on, off, null)).toBeNull();
    expect(transferCategoryId(on, on, null)).toBeNull();
    expect(transferCategoryId(off, on, null)).toBeNull();
    expect(transferCategoryId(off, off, null)).toBeNull();
  });
});

describe("the payee standing in for an account is named as YNAB 4 names it", () => {
  test("the name spaces the colon on both sides", () => {
    expect(transferPayeeName("Checking Account")).toBe("Transfer : Checking Account");
  });

  test("the id hangs the account's own id off the transfer prefix", () => {
    expect(transferPayeeYnabId("A1B2C3")).toBe("Payee/Transfer:A1B2C3");
  });
});
