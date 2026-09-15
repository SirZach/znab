import { describe, expect, test } from "bun:test";
import { clearedBalanceAsOf, coversStatement, reconcileDifference } from "./reconcile";
import type { ReconcilableRow } from "./reconcile";

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
    // 100.3 - 0.1 - 0.2 is 99.99999999999999 in floating point, which would
    // leave a reconciliation a hundredth of a cent away from balancing.
    const rows = [row("2025-09-11", "0.10"), row("2025-09-12", "0.20")];
    expect(clearedBalanceAsOf(100.3, rows, STATEMENT)).toBe(100);
    expect(reconcileDifference(clearedBalanceAsOf(100.3, rows, STATEMENT), 100)).toBe(0);
  });

  test("a NUMERIC straight from the database reads as the amount it is", () => {
    expect(clearedBalanceAsOf(0, [row("2025-09-11", "-105.4400")], STATEMENT)).toBe(105.44);
  });

  test("an unreadable amount counts as nothing rather than as no balance at all", () => {
    const rows = [row("2025-09-11", ""), row("2025-09-11", "-40.00")];
    expect(clearedBalanceAsOf(1200.5, rows, STATEMENT)).toBe(1240.5);
  });
});

describe("reconcileDifference: what an adjustment would have to add", () => {
  test("a statement holding more than the account is a positive difference", () => {
    expect(reconcileDifference(1200.5, 1204.7)).toBe(4.2);
  });

  test("a statement holding less than the account is a negative one", () => {
    expect(reconcileDifference(1204.7, 1200.5)).toBe(-4.2);
  });

  test("a statement that agrees is exactly zero, which is what Finish reads", () => {
    expect(reconcileDifference(1200.5, 1200.5)).toBe(0);
  });

  test("a credit card's debt reconciles against a negative statement balance", () => {
    expect(reconcileDifference(-540.15, -540.15)).toBe(0);
    expect(reconcileDifference(-540.15, -600)).toBe(-59.85);
  });
});

describe("coversStatement: whether that figure is exact or merely close", () => {
  const loaded = {
    statementDate: "2026-01-31",
    oldestLoadedDate: "2025-11-01",
    hasMore: true,
    clearedFilter: "all",
  };

  test("a window reaching back past the statement covers it", () => {
    expect(coversStatement(loaded)).toBe(true);
  });

  test("a statement older than the window does not, since rows after it are missing", () => {
    expect(coversStatement({ ...loaded, statementDate: "2025-06-01" })).toBe(false);
  });

  test("the oldest loaded row's own date still counts as covered", () => {
    expect(coversStatement({ ...loaded, statementDate: "2025-11-01" })).toBe(true);
  });

  test("nothing older left to load covers any date at all", () => {
    expect(
      coversStatement({ ...loaded, statementDate: "2013-09-11", hasMore: false })
    ).toBe(true);
  });

  test("an empty register covers nothing while more remains", () => {
    expect(coversStatement({ ...loaded, oldestLoadedDate: undefined })).toBe(false);
    expect(
      coversStatement({ ...loaded, oldestLoadedDate: undefined, hasMore: false })
    ).toBe(true);
  });

  // The rows left out by a status filter are the cleared ones this sum is made
  // of, so a filtered register cannot answer the question however much it holds.
  test("a cleared filter breaks coverage even with everything loaded", () => {
    expect(coversStatement({ ...loaded, clearedFilter: "Uncleared" })).toBe(false);
    expect(
      coversStatement({ ...loaded, clearedFilter: "Cleared", hasMore: false })
    ).toBe(false);
  });
});
