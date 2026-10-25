import { describe, expect, test } from "bun:test";
import { allAccountsSearchSchema, createTransactionSchema, isoDateSchema } from "./schemas";

describe("isoDateSchema", () => {
  test("accepts real days, leap days included", () => {
    for (const day of ["2026-02-28", "2024-02-29", "2026-12-31", "2026-01-01"]) {
      expect(isoDateSchema.safeParse(day).success).toBe(true);
    }
  });

  test("refuses days that do not exist and malformed strings", () => {
    for (const day of ["2026-02-30", "2025-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-1-5"]) {
      expect(isoDateSchema.safeParse(day).success).toBe(false);
    }
  });

  test("guards the schemas that carry a date", () => {
    const base = { accountId: 1, payeeId: null, categoryId: null, amount: -5 };
    expect(createTransactionSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, date: "2026-02-28" }).success).toBe(true);
  });
});

describe("allAccountsSearchSchema", () => {
  test("defaults to every row, newest first, from the start", () => {
    expect(allAccountsSearchSchema.parse({})).toEqual({
      cleared: "all",
      sort: "date",
      dir: "desc",
      offset: 0,
    });
  });

  test("keeps what the URL asks for", () => {
    expect(
      allAccountsSearchSchema.parse({ q: "rent", cleared: "Unreconciled", sort: "payee", dir: "asc", offset: 200 })
    ).toEqual({ q: "rent", cleared: "Unreconciled", sort: "payee", dir: "asc", offset: 200 });
  });

  test("falls back to every row for a cleared filter it no longer offers", () => {
    expect(allAccountsSearchSchema.parse({ cleared: "Cleared" }).cleared).toBe("all");
  });

  test("refuses a negative offset", () => {
    expect(allAccountsSearchSchema.safeParse({ offset: -200 }).success).toBe(false);
  });
});
