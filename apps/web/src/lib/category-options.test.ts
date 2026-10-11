import { describe, expect, test } from "bun:test";
import { toCategoryOptions } from "./category-options";

describe("toCategoryOptions", () => {
  test("labels each category with its group and leaves system groups out", () => {
    const groups = [
      { name: "Bills", isSystem: false, categories: [{ id: 1, name: "Rent" }] },
      { name: "Hidden Categories", isSystem: true, categories: [{ id: 2, name: "Old" }] },
      { name: "Food", isSystem: false, categories: [{ id: 3, name: "Groceries" }] },
    ];

    expect(toCategoryOptions(groups)).toEqual([
      { id: 1, label: "Bills: Rent" },
      { id: 3, label: "Food: Groceries" },
    ]);
  });

  test("nothing loaded yet is an empty list", () => {
    expect(toCategoryOptions(undefined)).toEqual([]);
  });
});
