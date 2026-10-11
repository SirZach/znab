import { describe, expect, test } from "bun:test";
import {
  availableStatus,
  bulkRows,
  findCategory,
  formatDeduction,
  formatIncome,
  groupTotals,
  monthNav,
  monthsByYear,
  moveSources,
  parseIdSet,
  visibleCategoryIds,
} from "./budget-grid";
import { formatCurrency } from "./utils";

const cat = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `Cat ${id}`,
  budgeted: 10,
  activity: -4,
  available: 6,
  deletedAt: null as string | null,
  ...over,
});

const groups = [
  { id: 1, name: "Bills", categories: [cat(10), cat(11, { deletedAt: "2026-01-01" }), cat(12)] },
  { id: 2, name: "Fun", categories: [cat(20), cat(21)] },
];

describe("visibleCategoryIds", () => {
  test("lists live categories in grid order", () => {
    expect(visibleCategoryIds(groups, new Set())).toEqual([10, 12, 20, 21]);
  });

  test("skips collapsed groups", () => {
    expect(visibleCategoryIds(groups, new Set([1]))).toEqual([20, 21]);
  });
});

describe("groupTotals", () => {
  test("sums each column", () => {
    expect(groupTotals([cat(1), cat(2, { budgeted: 5, activity: -1, available: -2 })])).toEqual({
      budgeted: 15,
      activity: -5,
      available: 4,
    });
  });

  test("is zero for an empty group", () => {
    expect(groupTotals([])).toEqual({ budgeted: 0, activity: 0, available: 0 });
  });
});

describe("findCategory", () => {
  test("finds a category with its group name", () => {
    expect(findCategory(groups, 20)).toMatchObject({ id: 20, groupName: "Fun" });
  });

  test("finds nothing for no selection", () => {
    expect(findCategory(groups, null)).toBeUndefined();
  });
});

describe("moveSources", () => {
  test("leaves out the selected and deleted categories", () => {
    expect(moveSources(groups, 10).map((s) => s.id)).toEqual([12, 20, 21]);
    expect(moveSources(groups, 10)[0]).toEqual({ id: 12, name: "Cat 12", groupName: "Bills", available: 6 });
  });
});

describe("bulkRows", () => {
  test("lists the selected categories in grid order", () => {
    expect(bulkRows(groups, new Set([21, 10]))).toEqual([
      { id: 10, name: "Cat 10", groupName: "Bills", budgeted: 10 },
      { id: 21, name: "Cat 21", groupName: "Fun", budgeted: 10 },
    ]);
  });
});

describe("monthsByYear", () => {
  test("groups by year, newest year first, months kept in order", () => {
    expect(monthsByYear(["2025-11-01", "2025-12-01", "2026-01-01", "2024-03-01"])).toEqual([
      ["2026", ["2026-01-01"]],
      ["2025", ["2025-11-01", "2025-12-01"]],
      ["2024", ["2024-03-01"]],
    ]);
  });

  test("is empty with no months", () => {
    expect(monthsByYear([])).toEqual([]);
  });
});

describe("monthNav", () => {
  test("crosses a year boundary", () => {
    expect(monthNav("2026-01-01")).toEqual({
      prevMonth: "12/2025",
      nextMonth: "02/2026",
      displayMonth: "January 2026",
      monthShort: "Jan",
      prevShort: "Dec",
    });
  });
});

describe("summary formatting", () => {
  test("a deduction is shown negated, and zero unsigned", () => {
    expect(formatDeduction(25)).toBe(formatCurrency(-25));
    expect(formatDeduction(-25)).toBe(formatCurrency(25));
    expect(formatDeduction(0)).toBe(formatCurrency(0));
  });

  test("income carries a plus unless negative", () => {
    expect(formatIncome(10)).toBe(`+${formatCurrency(10)}`);
    expect(formatIncome(0)).toBe(`+${formatCurrency(0)}`);
    expect(formatIncome(-10)).toBe(formatCurrency(-10));
  });
});

describe("availableStatus", () => {
  test("negative is overspent unless confined", () => {
    expect(availableStatus(-1, null)).toBe("overspent");
    expect(availableStatus(-1, "confined")).toBe("confined");
  });

  test("positive is funded, zero is empty", () => {
    expect(availableStatus(1, "confined")).toBe("funded");
    expect(availableStatus(0, null)).toBe("empty");
  });
});

describe("parseIdSet", () => {
  test("reads a stored list", () => {
    expect([...parseIdSet("[1,2]")]).toEqual([1, 2]);
  });

  test("is empty when missing or unreadable", () => {
    expect(parseIdSet(null).size).toBe(0);
    expect(parseIdSet("{not json").size).toBe(0);
    expect(parseIdSet("5").size).toBe(0);
  });
});
