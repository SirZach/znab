import { describe, expect, test } from "bun:test";
import { coversStatement } from "./reconcile";

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
