import { describe, expect, test } from "bun:test";
import { computeBudgetMonth } from "./budget-math";

/** Small builders so each case reads as the scenario it describes. */
const budgeted = (month: string, categoryId: number, amount: number, confined = false) => ({
  month,
  categoryId,
  budgeted: String(amount),
  overspendingHandling: confined ? "Confined" : null,
});

const activity = (month: string, categoryId: number, { cash = 0, credit = 0 }) => ({
  month,
  categoryId,
  cash: String(cash),
  credit: String(credit),
});

const income = (month: string, amount: number, kind = "Category/__ImmediateIncome__") => ({
  month,
  kind,
  amount: String(amount),
});

describe("computeBudgetMonth: overspending is classified by how it was funded", () => {
  test("spending past the envelope with cash is cash overspending", () => {
    const { categories } = computeBudgetMonth({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [activity("2026-01", 1, { cash: -150 })],
      targetMonth: "2026-01",
    });

    expect(categories.get(1)).toMatchObject({ available: -50, overspendKind: "cash" });
  });

  test("the same overspend on a credit card is debt, not cash", () => {
    const { categories } = computeBudgetMonth({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [activity("2026-01", 1, { credit: -150 })],
      targetMonth: "2026-01",
    });

    expect(categories.get(1)).toMatchObject({ available: -50, overspendKind: "credit" });
  });

  test("a category in the black is not overspent", () => {
    const { categories } = computeBudgetMonth({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [activity("2026-01", 1, { cash: -40 })],
      targetMonth: "2026-01",
    });

    expect(categories.get(1)).toMatchObject({ available: 60, overspendKind: null });
  });

  test("cash overspending reduces the next month's To-be-Budgeted; credit does not", () => {
    const base = {
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      targetMonth: "2026-02",
    };

    const cash = computeBudgetMonth({
      ...base,
      activity: [activity("2026-01", 1, { cash: -150 })],
    });
    const credit = computeBudgetMonth({
      ...base,
      activity: [activity("2026-01", 1, { credit: -150 })],
    });

    expect(cash.summary.overspentPrev).toBe(50);
    expect(credit.summary.overspentPrev).toBe(0);

    // The cash shortfall is settled against To-be-Budgeted and the category
    // starts clean; the credit shortfall carries as debt.
    expect(cash.categories.get(1)).toMatchObject({ available: 0, overspendKind: null });
    expect(credit.categories.get(1)).toMatchObject({ available: -50, overspendKind: "credit" });
  });

  test("confining overspending keeps it out of To-be-Budgeted but not off the books", () => {
    const confined = computeBudgetMonth({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100, true)],
      activity: [activity("2026-01", 1, { cash: -150 })],
      targetMonth: "2026-02",
    });

    expect(confined.summary.overspentPrev).toBe(0);
    expect(confined.categories.get(1)?.available).toBe(-50);
  });
});

describe("computeBudgetMonth: money committed to later months", () => {
  const scenario = (targetMonth: string) =>
    computeBudgetMonth({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100), budgeted("2026-03", 1, 250)],
      activity: [],
      targetMonth,
    });

  test("future budgeting is subtracted from what is available now", () => {
    const { summary } = scenario("2026-01");

    expect(summary.budgeted).toBe(100);
    expect(summary.budgetedFuture).toBe(250);
    expect(summary.availableToBudget).toBe(650); // 1000 - 100 - 250
  });

  test("the header still sums to Available to Budget", () => {
    const s = scenario("2026-01");
    const sum =
      s.summary.notBudgeted -
      s.summary.overspentPrev +
      s.summary.income -
      s.summary.budgeted -
      s.summary.budgetedFuture;

    expect(sum).toBe(s.summary.availableToBudget);
  });

  test("those dollars are not subtracted twice when the later month arrives", () => {
    // February carries January's full leftover. The March commitment is
    // March's own business, and is counted there as Budgeted, not here.
    const feb = scenario("2026-02");
    expect(feb.summary.notBudgeted).toBe(900);
    expect(feb.summary.budgetedFuture).toBe(250);
    expect(feb.summary.availableToBudget).toBe(650);

    const mar = scenario("2026-03");
    expect(mar.summary.notBudgeted).toBe(900);
    expect(mar.summary.budgeted).toBe(250);
    expect(mar.summary.budgetedFuture).toBe(0);
    expect(mar.summary.availableToBudget).toBe(650);
  });
});
