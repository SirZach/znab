import { describe, expect, test } from "bun:test";
import { allAccountsSearchSchema } from "./schemas";

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
      allAccountsSearchSchema.parse({ q: "rent", cleared: "Cleared", sort: "payee", dir: "asc", offset: 200 })
    ).toEqual({ q: "rent", cleared: "Cleared", sort: "payee", dir: "asc", offset: 200 });
  });

  test("refuses a negative offset", () => {
    expect(allAccountsSearchSchema.safeParse({ offset: -200 }).success).toBe(false);
  });
});
