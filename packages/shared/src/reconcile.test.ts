import { describe, expect, test } from "bun:test";
import { clearedBalanceAsOf, type ReconcilableRow, reconcileDifference } from "./reconcile";

const diff = (statementBalance: string | number, clearedBalance: string | number) =>
  reconcileDifference({ statementBalance, clearedBalance });

describe("reconcileDifference: statement less cleared balance", () => {
  test("a statement agreeing with the cleared balance leaves exactly zero", () => {
    expect(diff(100.5, "100.50")).toBe(0);
    expect(diff(1200.5, 1200.5)).toBe(0);
  });

  test("a statement holding more than the account is a positive difference", () => {
    expect(diff(120, "100.50")).toBe(19.5);
    expect(diff(1204.7, 1200.5)).toBe(4.2);
  });

  test("a statement holding less is a negative one", () => {
    expect(diff(80.25, "100.50")).toBe(-20.25);
    expect(diff(1200.5, 1204.7)).toBe(-4.2);
  });

  test("a credit card statement is negative on both sides", () => {
    expect(diff(-2199.45, "-2376.15")).toBe(176.7);
    expect(diff(-540.15, -540.15)).toBe(0);
    expect(diff(-600, -540.15)).toBe(-59.85);
  });

  test("a statement balance of zero is a balance, not a missing one", () => {
    expect(diff(0, "-42.17")).toBe(42.17);
    expect(diff(0, "0.00")).toBe(0);
  });

  test("the arithmetic is exact where floating point is not", () => {
    expect(diff(0.1 + 0.2, "0.30")).toBe(0);
    expect(diff(0.3, "0.1")).toBe(0.2);
    expect(diff("1000000.03", "1000000.01")).toBe(0.02);
  });
});

/** A register row written the way the database hands one over. */
const row = (
  date: string,
  amount: string,
  cleared: ReconcilableRow["cleared"] = "Cleared"
): ReconcilableRow => ({ date, amount, cleared });

const STATEMENT = "2025-09-10";

describe("clearedBalanceAsOf: only what cleared after the statement comes back off", () => {
  test("an account with nothing cleared since is already at its statement figure", () => {
    expect(clearedBalanceAsOf(1200.5, [row("2025-09-01", "-40.00")], STATEMENT)).toBe(1200.5);
  });

  test("a transaction cleared after the statement closed is taken back off", () => {
    expect(clearedBalanceAsOf(1200.5, [row("2025-09-11", "-40.00")], STATEMENT)).toBe(1240.5);
  });

  test("an inflow cleared after the statement closed comes off the same way", () => {
    expect(clearedBalanceAsOf(1200.5, [row("2025-09-11", "40.00")], STATEMENT)).toBe(1160.5);
  });

  test("a transaction dated the statement date itself is on the statement", () => {
    expect(clearedBalanceAsOf(1200.5, [row(STATEMENT, "-40.00")], STATEMENT)).toBe(1200.5);
  });

  test("a reconciled row is in the cleared balance, so it is undone too", () => {
    const rows = [row("2025-09-11", "-40.00", "Reconciled")];
    expect(clearedBalanceAsOf(1200.5, rows, STATEMENT)).toBe(1240.5);
  });

  test("an uncleared row was never in the cleared balance and is left alone", () => {
    const rows = [row("2025-09-11", "-40.00", "Uncleared")];
    expect(clearedBalanceAsOf(1200.5, rows, STATEMENT)).toBe(1200.5);
  });

  test("an empty register leaves the balance as the account reported it", () => {
    expect(clearedBalanceAsOf(1200.5, [], STATEMENT)).toBe(1200.5);
  });
});

describe("clearedBalanceAsOf: money does not drift", () => {
  test("cents that float arithmetic would lose still land on a round figure", () => {
    // 100.3 - 0.1 - 0.2 is 99.99999999999999 in floating point.
    const rows = [row("2025-09-11", "0.10"), row("2025-09-12", "0.20")];
    const asOf = clearedBalanceAsOf(100.3, rows, STATEMENT);
    expect(asOf).toBe(100);
    expect(reconcileDifference({ statementBalance: 100, clearedBalance: asOf })).toBe(0);
  });

  test("a NUMERIC straight from the database reads as the amount it is", () => {
    expect(clearedBalanceAsOf(0, [row("2025-09-11", "-105.4400")], STATEMENT)).toBe(105.44);
  });

  test("an unreadable amount counts as nothing rather than as no balance at all", () => {
    const rows = [row("2025-09-11", ""), row("2025-09-11", "-40.00")];
    expect(clearedBalanceAsOf(1200.5, rows, STATEMENT)).toBe(1240.5);
  });
});
