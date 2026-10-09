import { describe, expect, test } from "bun:test";
import { categoryCount, groupPlacement, movableGroups } from "./category-groups";

const group = (id: number, isSystem = false, categories: unknown[] = []) => ({
  id,
  isSystem,
  categories,
});

const bills = group(1, false, ["Rent", "Power"]);
const income = group(2, true, ["Salary"]);
const food = group(3, false, ["Groceries"]);
const fun = group(4);
const groups = [bills, income, food, fun];

describe("movableGroups", () => {
  test("drops the system groups", () => {
    expect(movableGroups(groups)).toEqual([bills, food, fun]);
  });
});

describe("categoryCount", () => {
  test("counts every category, system ones included", () => {
    expect(categoryCount(groups)).toBe(4);
  });
});

describe("groupPlacement", () => {
  const movable = movableGroups(groups);

  test("steps over a system group between two kept ones", () => {
    const { up, down } = groupPlacement(movable, food);
    expect(up).toBe(bills);
    expect(down).toBe(fun);
  });

  test("has no neighbour past either end", () => {
    expect(groupPlacement(movable, bills).up).toBeUndefined();
    expect(groupPlacement(movable, fun).down).toBeUndefined();
  });

  test("offers every other kept group as a move target", () => {
    expect(groupPlacement(movable, food).targets).toEqual([bills, fun]);
  });

  test("gives a system group no neighbours", () => {
    const { up, down } = groupPlacement(movable, income);
    expect(up).toBeUndefined();
    expect(down).toBeUndefined();
  });
});
