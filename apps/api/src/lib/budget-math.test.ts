import { describe, expect, test } from "bun:test";
import { computeBudgetMonth, computeQuickBudget, computeCategoryGoal } from "./budget-math";

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

describe("computeCategoryGoal", () => {
  test("MF judges progress against this month's budgeted amount alone", () => {
    const goal = computeCategoryGoal({
      type: "MF",
      target: 200,
      targetMonth: null,
      budgeted: 50,
      available: 900, // leftover from prior months, irrelevant to MF
      currentMonth: "2026-01",
    });

    expect(goal.neededThisMonth).toBe(200);
    expect(goal.underFunded).toBe(150);
    expect(goal.percent).toBe(0.25);
  });

  test("TB judges progress against the month-end balance", () => {
    const goal = computeCategoryGoal({
      type: "TB",
      target: 500,
      targetMonth: null,
      budgeted: 100,
      available: 300,
      currentMonth: "2026-01",
    });

    // Balance before this month's budgeting was 200, so 300 more closes it.
    expect(goal.neededThisMonth).toBe(300);
    expect(goal.underFunded).toBe(200);
    expect(goal.percent).toBe(0.6);
  });

  test("TBD spreads the remaining need over the months left, target month included", () => {
    const goal = computeCategoryGoal({
      type: "TBD",
      target: 1200,
      targetMonth: "2026-04",
      budgeted: 50,
      available: 250,
      currentMonth: "2026-01",
    });

    // Four months (Jan-Apr) share a 1000 gap (1200 target - 200 balance before).
    expect(goal.neededThisMonth).toBe(250);
    expect(goal.underFunded).toBe(200);
    expect(goal.percent).toBeCloseTo(250 / 1200, 5);
  });

  test("TBD floors months left at one when the target month has already passed", () => {
    const goal = computeCategoryGoal({
      type: "TBD",
      target: 500,
      targetMonth: "2026-01",
      budgeted: 0,
      available: 100,
      currentMonth: "2026-06",
    });

    // The whole remaining gap lands on this month instead of dividing by a
    // negative or zero span.
    expect(goal.neededThisMonth).toBe(400);
    expect(goal.underFunded).toBe(400);
  });

  test("an over-funded goal caps percent at 1 and reports no shortfall", () => {
    const goal = computeCategoryGoal({
      type: "TB",
      target: 100,
      targetMonth: null,
      budgeted: 0,
      available: 150,
      currentMonth: "2026-01",
    });

    expect(goal.percent).toBe(1);
    expect(goal.underFunded).toBe(0);
    expect(goal.neededThisMonth).toBe(0);
  });

  test("a zero target reports no progress and no shortfall", () => {
    const goal = computeCategoryGoal({
      type: "MF",
      target: 0,
      targetMonth: null,
      budgeted: 50,
      available: 50,
      currentMonth: "2026-01",
    });

    expect(goal.percent).toBe(0);
    expect(goal.underFunded).toBe(0);
    expect(goal.neededThisMonth).toBe(0);
  });
});
