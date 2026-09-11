import { describe, expect, test } from "bun:test";
import { computeBudgetMonth, computeQuickBudget } from "./budget-math";

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

describe("computeQuickBudget", () => {
  const history = {
    income: [income("2025-10", 5000), income("2025-11", 5000), income("2025-12", 5000)],
    budgeted: [
      budgeted("2025-10", 1, 100),
      budgeted("2025-11", 1, 200),
      budgeted("2025-12", 1, 300),
    ],
    activity: [
      activity("2025-10", 1, { cash: -80 }),
      activity("2025-11", 1, { cash: -220 }),
      activity("2025-12", 1, { cash: -120 }),
    ],
  };

  test("reports last month's budget and spending", () => {
    const q = computeQuickBudget({ ...history, targetMonth: "2026-01", categoryId: 1 });

    expect(q.budgetedLastMonth).toBe(300);
    expect(q.spentLastMonth).toBe(120);
  });

  test("averages only the months the category was in use", () => {
    const q = computeQuickBudget({ ...history, targetMonth: "2026-01", categoryId: 1 });

    // Three months of history, not twelve. A young category should not be
    // averaged down by months it did not exist for.
    expect(q.averageBudgeted).toBe(200); // (100 + 200 + 300) / 3
    expect(q.averageSpent).toBe(140); // (80 + 220 + 120) / 3
  });

  test("balance to zero covers an overspent category", () => {
    const q = computeQuickBudget({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [activity("2026-01", 1, { cash: -150 })],
      targetMonth: "2026-01",
      categoryId: 1,
    });

    // Budgeted 100, spent 150, so it sits at -50. Budgeting 150 zeroes it.
    expect(q.balanceToZero).toBe(150);
  });

  test("balance to zero claws back a surplus", () => {
    const q = computeQuickBudget({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [activity("2026-01", 1, { cash: -30 })],
      targetMonth: "2026-01",
      categoryId: 1,
    });

    expect(q.balanceToZero).toBe(30);
  });

  test("a refund does not produce a negative budget suggestion", () => {
    const q = computeQuickBudget({
      income: [income("2025-12", 1000)],
      budgeted: [budgeted("2025-12", 1, 50)],
      activity: [activity("2025-12", 1, { cash: 75 })],
      targetMonth: "2026-01",
      categoryId: 1,
    });

    expect(q.spentLastMonth).toBe(0);
    expect(q.averageSpent).toBe(0);
  });

  test("a category with no history suggests nothing", () => {
    const q = computeQuickBudget({
      income: [income("2026-01", 1000)],
      budgeted: [budgeted("2026-01", 1, 100)],
      activity: [],
      targetMonth: "2026-01",
      categoryId: 99,
    });

    expect(q).toMatchObject({
      budgetedLastMonth: 0,
      spentLastMonth: 0,
      averageBudgeted: 0,
      averageSpent: 0,
      balanceToZero: 0,
    });
  });
});
