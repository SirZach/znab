import { describe, expect, test } from "bun:test";
import {
  accountClass,
  PRE_YNAB_DEBT_GROUP_NAME,
  PRE_YNAB_DEBT_GROUP_YNAB_ID,
  preYnabDebtCategoryYnabId,
  startingBalanceCategory,
  STARTING_BALANCE_PAYEE_NAME,
} from "./account";
import { IMMEDIATE_INCOME } from "./budget-math";

/** The kinds of account the rules distinguish, named the way they read. */
const onCash = { onBudget: true, accountType: "Checking" };
const onCredit = { onBudget: true, accountType: "CreditCard" };
const onLiability = { onBudget: true, accountType: "OtherLiability" };
const offCash = { onBudget: false, accountType: "Savings" };
const offCredit = { onBudget: false, accountType: "CreditCard" };

describe("startingBalanceCategory: the kind of account decides, not the amount", () => {
  test("money already in a budgeted account is income the budget never saw", () => {
    expect(startingBalanceCategory(onCash, "Account/abc")).toEqual({
      categoryYnabId: IMMEDIATE_INCOME,
      preYnabDebt: false,
    });
  });

  test("what is owed on a budgeted credit account is pre-YNAB debt", () => {
    expect(startingBalanceCategory(onCredit, "Account/abc")).toEqual({
      categoryYnabId: "Category/PreYNABDebt/Account/abc",
      preYnabDebt: true,
    });
    expect(startingBalanceCategory(onLiability, "Account/abc")).toEqual({
      categoryYnabId: "Category/PreYNABDebt/Account/abc",
      preYnabDebt: true,
    });
  });

  // Four imported credit cards open at exactly zero and YNAB 4 still files
  // them under pre-YNAB debt, which is what rules out reading the sign.
  test("a credit account opening at zero is still filed as debt", () => {
    expect(startingBalanceCategory(onCredit, "Account/abc").preYnabDebt).toBe(true);
  });

  test("a tracking account carries no category, whatever kind it is", () => {
    expect(startingBalanceCategory(offCash, "Account/abc")).toEqual({
      categoryYnabId: null,
      preYnabDebt: false,
    });
    expect(startingBalanceCategory(offCredit, "Account/abc")).toEqual({
      categoryYnabId: null,
      preYnabDebt: false,
    });
  });
});

describe("the pre-YNAB debt category is named as YNAB 4 names it", () => {
  test("the id hangs the account's own id off the debt prefix", () => {
    expect(preYnabDebtCategoryYnabId("A1B2C3")).toBe("Category/PreYNABDebt/A1B2C3");
  });

  test("the group it lives in is the one the imported budgets already carry", () => {
    expect(PRE_YNAB_DEBT_GROUP_YNAB_ID).toBe("MasterCategory/__PreYNABDebtMaster__");
    expect(PRE_YNAB_DEBT_GROUP_NAME).toBe("Pre-YNAB Debt");
  });

  test("and the opening balance is filed under the payee the import uses", () => {
    expect(STARTING_BALANCE_PAYEE_NAME).toBe("Starting Balance");
  });
});

describe("accountClass: which accounts the budget treats as debt", () => {
  test("a card and a loan are credit", () => {
    expect(accountClass("CreditCard")).toBe("credit");
    expect(accountClass("OtherLiability")).toBe("credit");
  });

  test("everything else is cash", () => {
    expect(accountClass("Checking")).toBe("cash");
    expect(accountClass("Savings")).toBe("cash");
    expect(accountClass("Cash")).toBe("cash");
    expect(accountClass("InvestmentAccount")).toBe("cash");
  });
});
