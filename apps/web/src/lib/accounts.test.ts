import { describe, expect, test } from "bun:test";
import { ACCOUNT_TYPES, isCreditAccountType } from "@znab/shared";
import { accountPatch, accountSections, accountTypeLabel, accountTypeOptions } from "./accounts";

describe("accountTypeLabel", () => {
  test("spaces out the run-together types and leaves the rest", () => {
    expect(accountTypeLabel("CreditCard")).toBe("Credit Card");
    expect(accountTypeLabel("InvestmentAccount")).toBe("Investment");
    expect(accountTypeLabel("Checking")).toBe("Checking");
  });
});

describe("accountSections", () => {
  const account = (id: number, onBudget: boolean, hidden: boolean) => ({ id, onBudget, hidden });

  test("splits budget, tracking and closed, closed whatever their kind", () => {
    const sections = accountSections([
      account(1, true, false),
      account(2, false, false),
      account(3, true, true),
      account(4, false, true),
    ]);
    expect(sections.map((s) => [s.label, s.accounts.map((a) => a.id)])).toEqual([
      ["Budget Accounts", [1]],
      ["Tracking Accounts", [2]],
      ["Closed Accounts", [3, 4]],
    ]);
  });

  test("leaves out empty sections", () => {
    expect(accountSections([account(1, true, false)]).map((s) => s.label)).toEqual([
      "Budget Accounts",
    ]);
    expect(accountSections([])).toEqual([]);
  });
});

describe("accountTypeOptions", () => {
  test("offers every type to an account with no transactions", () => {
    expect(accountTypeOptions("Checking", 0)).toEqual(ACCOUNT_TYPES);
  });

  test("keeps a used account on its own side of credit", () => {
    expect(accountTypeOptions("Checking", 5).every((t) => !isCreditAccountType(t))).toBe(true);
    expect(accountTypeOptions("CreditCard", 5).every((t) => isCreditAccountType(t))).toBe(true);
  });

  test("offers only the safe side while the count is unknown", () => {
    expect(accountTypeOptions("Checking", null)).toEqual(accountTypeOptions("Checking", 5));
  });
});

describe("accountPatch", () => {
  const account = { accountType: "Checking", onBudget: true, note: null };

  test("is clean when nothing changed, reading a missing note as empty", () => {
    expect(accountPatch(account, { accountType: "Checking", onBudget: true, note: "" })).toEqual({
      patch: { accountType: undefined, onBudget: undefined, note: undefined },
      dirty: false,
    });
  });

  test("carries only the changed fields", () => {
    const { patch, dirty } = accountPatch(account, {
      accountType: "Savings",
      onBudget: true,
      note: "joint",
    });
    expect(dirty).toBe(true);
    expect(patch).toEqual({ accountType: "Savings", onBudget: undefined, note: "joint" });
  });
});
