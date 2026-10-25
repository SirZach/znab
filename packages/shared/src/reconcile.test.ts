import { describe, expect, test } from "bun:test";
import { reconcileDifference } from "./reconcile";

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
