import { describe, expect, test } from "bun:test";
import { finishBlocker, reconcileFigures } from "./reconcile";

describe("reconcileFigures", () => {
  test("nothing readable typed leaves both figures unknown", () => {
    expect(reconcileFigures("", 70)).toEqual({ statementBalance: null, difference: null });
    expect(reconcileFigures("abc", 70)).toEqual({ statementBalance: null, difference: null });
    expect(reconcileFigures("1/0", 70)).toEqual({ statementBalance: null, difference: null });
  });

  test("a readable statement gives the difference, statement less cleared", () => {
    expect(reconcileFigures("100", 70)).toEqual({ statementBalance: 100, difference: 30 });
    expect(reconcileFigures("50", 70)).toEqual({ statementBalance: 50, difference: -20 });
  });

  test("zero is a statement balance, not a missing one", () => {
    expect(reconcileFigures("0", 70)).toEqual({ statementBalance: 0, difference: -70 });
    expect(reconcileFigures("0.00", 0)).toEqual({ statementBalance: 0, difference: 0 });
  });

  test("currency symbols, thousands separators and arithmetic are read", () => {
    expect(reconcileFigures("$1,234.56", 1234.56).difference).toBe(0);
    expect(reconcileFigures("200+50", 250).difference).toBe(0);
  });

  test("a credit card statement is negative on both sides", () => {
    expect(reconcileFigures("-2,199.45", -2376.15)).toEqual({
      statementBalance: -2199.45,
      difference: 176.7,
    });
  });

  test("the difference waits for the cleared balance to load", () => {
    expect(reconcileFigures("100", undefined)).toEqual({ statementBalance: 100, difference: null });
  });
});

describe("finishBlocker", () => {
  const blocker = (statementBalance: number | null, difference: number | null) =>
    finishBlocker({ statementBalance, difference });

  test("asks for a statement balance until one is typed", () => {
    expect(blocker(null, null)).toBe("Enter a statement balance");
  });

  test("says nothing once the statement agrees, or while the cleared balance loads", () => {
    expect(blocker(250, 0)).toBeNull();
    expect(blocker(250, null)).toBeNull();
  });

  test("an asset account short of its statement has the gap left to clear", () => {
    expect(blocker(1000, 123.45)).toBe("$123.45 left to clear");
    expect(blocker(0, 42.17)).toBe("$42.17 left to clear");
  });

  test("an asset account past its statement has cleared too much", () => {
    expect(blocker(500, -250)).toBe("Cleared is $250.00 over the statement");
  });

  test("a credit card reads the other way round, since it owes", () => {
    // Owes 2,000 per the statement, 1,800 cleared: 200 of charges still to tick.
    expect(blocker(-2000, -200)).toBe("$200.00 left to clear");
    // Owes 2,000 per the statement, 2,200 cleared: 200 ticked that should not be.
    expect(blocker(-2000, 200)).toBe("Cleared is $200.00 over the statement");
  });
});
