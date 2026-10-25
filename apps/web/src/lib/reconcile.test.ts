import { describe, expect, test } from "bun:test";
import { reconcileFigures } from "./reconcile";

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
