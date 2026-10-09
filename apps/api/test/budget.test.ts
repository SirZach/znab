import { describe, expect, test } from "bun:test";
import { addIncome, withCaller, type Caller, type Seed, type Tx } from "./harness";

const JAN = "2025-01-01";
const FEB = "2025-02-01";

function spend(caller: Caller, seed: Seed, account: "checking" | "credit", categoryId: number, amount: number, date: string) {
  return caller.transaction.create({
    budgetId: seed.budgetId,
    accountId: seed.accounts[account].id,
    payeeId: seed.payees.grocer.id,
    categoryId,
    amount,
    date,
  });
}

function categoryOf(month: Awaited<ReturnType<Caller["budget"]["monthBudget"]>>, id: number) {
  return month.groups.flatMap((g) => g.categories).find((c) => c.id === id)!;
}

/**
 * January 2025:
 *   income  +1000 into checking
 *   budget  rent 600, groceries 100, fun 50                       (750)
 *   spend   rent -600 cash, groceries -150 cash, fun -80 on the credit card
 *   a 100 transfer checking -> credit card, which is no category's activity
 * February 2025:
 *   budget  groceries 100
 *
 * Jan: To be Budgeted carried = 1000 - 750 = 250; Feb's 100 is already
 *      committed, so Available to Budget shows 150. Groceries is 50 overspent
 *      in cash, fun 30 overspent on credit.
 * Feb: both overspends come out of To be Budgeted (YNAB 4 treats credit card
 *      overspending like cash unless the category is confined):
 *      250 + 0 - 100 - (50 + 30) = 70, and both categories start from zero.
 */
async function seedScenario(tx: Tx, caller: Caller, seed: Seed) {
  const { rent, groceries, fun } = seed.categories;
  await addIncome(tx, seed, 1000, "2025-01-02");
  for (const [categoryId, budgeted] of [
    [rent.id, 600],
    [groceries.id, 100],
    [fun.id, 50],
  ] as const) {
    await caller.budget.setBudgeted({ budgetId: seed.budgetId, categoryId, month: JAN, budgeted });
  }
  await caller.budget.setBudgeted({ budgetId: seed.budgetId, categoryId: groceries.id, month: FEB, budgeted: 100 });
  await spend(caller, seed, "checking", rent.id, -600, "2025-01-03");
  await spend(caller, seed, "checking", groceries.id, -150, "2025-01-10");
  await spend(caller, seed, "credit", fun.id, -80, "2025-01-12");
  await caller.transaction.create({
    budgetId: seed.budgetId,
    accountId: seed.accounts.checking.id,
    payeeId: seed.transferPayee.credit,
    categoryId: null,
    amount: -100,
    date: "2025-01-20",
  });
}

describe("budget.monthBudget", () => {
  test("To be Budgeted, Available and cash vs credit overspending carry over", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await seedScenario(tx, caller, seed);
      const { rent, groceries, fun, electric } = seed.categories;

      const jan = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: JAN });
      expect(jan.summary).toEqual({
        month: "2025-01",
        notBudgeted: 0,
        overspentPrev: 0,
        income: 1000,
        budgeted: 750,
        budgetedFuture: 100,
        availableToBudget: 150,
      });
      expect(categoryOf(jan, rent.id)).toMatchObject({ budgeted: 600, activity: -600, available: 0, overspendKind: null });
      expect(categoryOf(jan, groceries.id)).toMatchObject({ budgeted: 100, activity: -150, available: -50, overspendKind: "cash" });
      expect(categoryOf(jan, fun.id)).toMatchObject({ budgeted: 50, activity: -80, available: -30, overspendKind: "cash" });
      expect(categoryOf(jan, electric.id)).toMatchObject({ budgeted: 0, activity: 0, available: 0 });

      const feb = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: FEB });
      expect(feb.summary).toEqual({
        month: "2025-02",
        notBudgeted: 250,
        overspentPrev: 80,
        income: 0,
        budgeted: 100,
        budgetedFuture: 0,
        availableToBudget: 70,
      });
      expect(categoryOf(feb, groceries.id)).toMatchObject({ budgeted: 100, activity: 0, available: 100 });
      expect(categoryOf(feb, fun.id)).toMatchObject({ budgeted: 0, activity: 0, available: 0 });
    });
  });

  test("confined overspending stays in the category instead of leaving To be Budgeted", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await seedScenario(tx, caller, seed);
      await caller.budget.setOverspendingHandling({
        budgetId: seed.budgetId,
        categoryId: seed.categories.fun.id,
        month: JAN,
        confined: true,
      });

      const feb = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: FEB });
      // Only groceries' 50 leaves To be Budgeted now: 250 - 100 - 50 = 100, against 70.
      expect(feb.summary.overspentPrev).toBe(50);
      expect(feb.summary.availableToBudget).toBe(100);
      expect(categoryOf(feb, seed.categories.fun.id)).toMatchObject({ available: -30, confined: true });
    });
  });
});

describe("budget.moveMoney", () => {
  test("moves the amount between two categories and leaves the month total unchanged", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await seedScenario(tx, caller, seed);
      const { groceries, fun, electric } = seed.categories;
      const before = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: JAN });

      await caller.budget.moveMoney({
        budgetId: seed.budgetId,
        month: JAN,
        fromCategoryId: groceries.id,
        toCategoryId: fun.id,
        amount: 30.1,
      });
      // Into a category with no allocation row yet.
      await caller.budget.moveMoney({
        budgetId: seed.budgetId,
        month: JAN,
        fromCategoryId: groceries.id,
        toCategoryId: electric.id,
        amount: 0.2,
      });

      const after = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: JAN });
      expect(after.summary).toEqual(before.summary);
      expect(categoryOf(after, groceries.id).budgeted).toBe(69.7);
      expect(categoryOf(after, fun.id).budgeted).toBe(80.1);
      expect(categoryOf(after, electric.id).budgeted).toBe(0.2);
    });
  });
});
