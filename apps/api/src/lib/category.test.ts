import { describe, expect, test } from "bun:test";
import { isSpecialCategoryId } from "@znab/shared";
import {
  isSystemGroupYnabId,
  mintCategoryGroupYnabId,
  mintCategoryYnabId,
} from "./category";

describe("isSystemGroupYnabId: which groups YNAB 4 keeps for itself", () => {
  test("the four the imported budgets carry are its own", () => {
    expect(isSystemGroupYnabId("MasterCategory/__Hidden__")).toBe(true);
    expect(isSystemGroupYnabId("MasterCategory/__Income__")).toBe(true);
    expect(isSystemGroupYnabId("MasterCategory/__Internal__")).toBe(true);
    expect(isSystemGroupYnabId("MasterCategory/__PreYNABDebtMaster__")).toBe(true);
  });

  // The two shapes a user's own group arrives under: the short ids the older
  // budgets use, and the bare uuids the newer ones do.
  test("a group the user made is not", () => {
    expect(isSystemGroupYnabId("A7")).toBe(false);
    expect(isSystemGroupYnabId("MC1")).toBe(false);
    expect(isSystemGroupYnabId("617E78AC-D95E-4ECF-14CF-10A8F7488C30")).toBe(false);
  });

  // The prefix is the whole rule, so a name that merely mentions it is not one.
  test("nor is one that only reads like one", () => {
    expect(isSystemGroupYnabId("MasterCategory/Hidden__")).toBe(false);
    expect(isSystemGroupYnabId("Category/__Split__")).toBe(false);
  });
});

describe("the ids an authored category and group are minted with", () => {
  test("each carries its own prefix and a uuid", () => {
    expect(mintCategoryYnabId()).toMatch(
      /^Category\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(mintCategoryGroupYnabId()).toMatch(
      /^MasterCategory\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test("and no two are alike, which is what the unique constraint rests on", () => {
    expect(mintCategoryYnabId()).not.toBe(mintCategoryYnabId());
    expect(mintCategoryGroupYnabId()).not.toBe(mintCategoryGroupYnabId());
  });

  // The two ids an authored one must never collide with: the special category
  // ids the register and the budget engine read as meaning rather than as rows,
  // and the prefix that would hand a user's group to the budget's bookkeeping.
  test("a minted category is never one of the special ids", () => {
    expect(isSpecialCategoryId(mintCategoryYnabId())).toBe(false);
  });

  test("a minted group is never one of YNAB 4's own", () => {
    expect(isSystemGroupYnabId(mintCategoryGroupYnabId())).toBe(false);
  });
});
