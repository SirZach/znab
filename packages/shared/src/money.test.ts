import { describe, expect, test } from "bun:test";
import { fromCents, MAX_MONEY, moneySchema, roundMoney, toCents } from "./money";
import {
  createTransactionSchema,
  reconcileAccountSchema,
  setBudgetedSchema,
} from "./schemas";

describe("toCents: dollars in any form to integer cents", () => {
  test("numbers and NUMERIC strings read the same", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("-105.4400")).toBe(-10544);
    expect(toCents("0.00")).toBe(0);
  });

  test("float drift lands on the nearest cent", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    // 1.15 * 100 is 114.99999999999999 in floating point.
    expect(toCents(1.15)).toBe(115);
    expect(toCents(-1.15)).toBe(-115);
  });

  test("null and undefined are nothing, as a SQL SUM over no rows is", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
  });

  test("anything unreadable is nothing rather than NaN", () => {
    expect(toCents("")).toBe(0);
    expect(toCents("abc")).toBe(0);
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  test("a half cent rounds away from zero, the same both ways", () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(-0.005)).toBe(-1);
    expect(toCents(0.125)).toBe(13);
    expect(toCents(-0.125)).toBe(-13);
    expect(toCents(0.004)).toBe(0);
  });

  test("never returns negative zero", () => {
    expect(Object.is(toCents(-0.004), 0)).toBe(true);
    expect(Object.is(toCents(-0), 0)).toBe(true);
  });
});

describe("fromCents and roundMoney", () => {
  test("cents back to dollars", () => {
    expect(fromCents(1234)).toBe(12.34);
    expect(fromCents(-10544)).toBe(-105.44);
    expect(Object.is(fromCents(-0), 0)).toBe(true);
  });

  test("roundMoney is a value in whole cents", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney("19.999")).toBe(20);
    expect(roundMoney(null)).toBe(0);
  });
});

describe("moneySchema: what a client may send as an amount", () => {
  const ok = (n: number) => moneySchema.safeParse(n).success;

  test("accepts whole cents, either sign, up to NUMERIC(12,2)", () => {
    expect(ok(0)).toBe(true);
    expect(ok(12.34)).toBe(true);
    expect(ok(-12.34)).toBe(true);
    expect(ok(1.15)).toBe(true);
    expect(ok(MAX_MONEY)).toBe(true);
    expect(ok(-MAX_MONEY)).toBe(true);
    // What the web's amount parser sends for "0.1+0.2".
    expect(ok(roundMoney(0.1 + 0.2))).toBe(true);
  });

  test("refuses sub-cent amounts rather than rounding them", () => {
    expect(ok(0.001)).toBe(false);
    expect(ok(12.345)).toBe(false);
    expect(ok(0.1 + 0.2)).toBe(false);
  });

  test("refuses what the column cannot hold, and what is not a number", () => {
    expect(ok(10_000_000_000)).toBe(false);
    expect(ok(-10_000_000_000)).toBe(false);
    expect(ok(Number.NaN)).toBe(false);
    expect(ok(Number.POSITIVE_INFINITY)).toBe(false);
    expect(moneySchema.safeParse("12.34").success).toBe(false);
  });

  test("the shared input schemas use it", () => {
    const txn = { accountId: 1, payeeId: null, categoryId: null, date: "2026-01-01" };
    expect(createTransactionSchema.safeParse({ ...txn, amount: -38 }).success).toBe(true);
    expect(createTransactionSchema.safeParse({ ...txn, amount: 1.005 }).success).toBe(false);
    expect(
      setBudgetedSchema.safeParse({ categoryId: 1, month: "2026-01-01", budgeted: 1e10 }).success
    ).toBe(false);
    expect(
      reconcileAccountSchema.safeParse({
        accountId: 1,
        statementBalance: 0.001,
        statementDate: "2026-01-01",
      }).success
    ).toBe(false);
  });
});
