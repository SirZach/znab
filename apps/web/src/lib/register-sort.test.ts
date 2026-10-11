import { describe, expect, test } from "bun:test";
import { nextSortDirection } from "./register-sort";

describe("nextSortDirection", () => {
  test("turns the active column round", () => {
    expect(nextSortDirection("date", "date", "desc")).toBe("asc");
    expect(nextSortDirection("date", "date", "asc")).toBe("desc");
    expect(nextSortDirection("payee", "payee", "asc")).toBe("desc");
  });

  test("starts the date newest first", () => {
    expect(nextSortDirection("date", "payee", "asc")).toBe("desc");
  });

  test("starts any other column ascending", () => {
    expect(nextSortDirection("payee", "date", "desc")).toBe("asc");
    expect(nextSortDirection("amount", "date", "asc")).toBe("asc");
  });
});
