import { describe, expect, test } from "bun:test";
import { addIncome, expectTrpcError, withCaller } from "./harness";

/**
 * March 2025, all on budget unless noted:
 *   income      +500
 *   groceries   -40 cash, then a +10 refund
 *   fun         -25 on the credit card
 *   rent        -200 as a transfer checking -> tracking account (categorized,
 *               so it is spending, as on the budget page)
 *   a -75 transfer checking -> savings, which is no category's spending
 * Spending: groceries 30, fun 25, rent 200 = 255.
 */
describe("reports agree with the budget page", () => {
  test("spendingByCategory and incomeVsExpense match monthBudget activity", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun, rent } = seed.categories;
      const enter = (account: "checking" | "credit", payeeId: number, categoryId: number | null, amount: number) =>
        caller.transaction.create({
          budgetId,
          accountId: seed.accounts[account].id,
          payeeId,
          categoryId,
          amount,
          date: "2025-03-10",
        });

      await addIncome(tx, seed, 500, "2025-03-01");
      await enter("checking", seed.payees.grocer.id, groceries.id, -40);
      await enter("checking", seed.payees.grocer.id, groceries.id, 10);
      await enter("credit", seed.payees.grocer.id, fun.id, -25);
      await enter("checking", seed.transferPayee.tracking, rent.id, -200);
      await enter("checking", seed.transferPayee.savings, null, -75);

      const month = await caller.budget.monthBudget({ budgetId, month: "2025-03-01" });
      const activity = month.groups.flatMap((g) => g.categories).reduce((sum, c) => sum + c.activity, 0);
      expect(activity).toBe(-255);

      const byCategory = await caller.report.spendingByCategory({ budgetId, timeframe: "all" });
      expect(byCategory.total).toBe(255);
      expect(byCategory.total).toBe(-activity);
      const spent = Object.fromEntries(byCategory.spending.map((s) => [s.categoryId, s.spent]));
      expect(spent).toEqual({ [groceries.id]: 30, [fun.id]: 25, [rent.id]: 200 });

      const ive = await caller.report.incomeVsExpense({ budgetId, timeframe: "all" });
      expect(ive.series).toEqual([{ month: "2025-03", income: 500, expense: 255, net: 245 }]);
      expect(ive.summary.income).toBe(month.summary.income);
      expect(ive.summary.expense).toBe(-activity);
    });
  });
});

describe("categorySpending", () => {
  test("one category's net spend by month, empty months included, agreeing with spendingByCategory", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const enter = (categoryId: number, amount: number, date: string) =>
        caller.transaction.create({
          budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date,
        });

      await enter(groceries.id, -40, "2025-03-10");
      await enter(groceries.id, 10, "2025-03-12");
      await enter(groceries.id, -15, "2025-05-02");
      await enter(fun.id, -25, "2025-04-01");

      const report = await caller.report.categorySpending({ budgetId, categoryId: groceries.id, timeframe: "all" });
      expect(report.category).toBe(groceries.name);
      expect(report.series.slice(0, 3)).toEqual([
        { month: "2025-03", spent: 30 },
        { month: "2025-04", spent: 0 },
        { month: "2025-05", spent: 15 },
      ]);
      expect(report.total).toBe(45);

      const byCategory = await caller.report.spendingByCategory({ budgetId, timeframe: "all" });
      expect(byCategory.spending.find((s) => s.categoryId === groceries.id)?.spent).toBe(report.total);
    });
  });

  test("refuses another user's budget and a category from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const categoryId = seed.categories.groceries.id;
      await expectTrpcError(
        otherCaller.report.categorySpending({ budgetId: seed.budgetId, categoryId, timeframe: "all" }),
        "NOT_FOUND"
      );
      await expectTrpcError(
        caller.report.categorySpending({
          budgetId: seed.budgetId,
          categoryId: other.categories.groceries.id,
          timeframe: "all",
        }),
        "NOT_FOUND"
      );
    });
  });
});

describe("payeeSpending", () => {
  test("one payee's net spend by month across categories, agreeing with spendingByPayee", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const enter = (categoryId: number, amount: number, date: string) =>
        caller.transaction.create({
          budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date,
        });

      await enter(groceries.id, -40, "2025-03-10");
      await enter(groceries.id, 10, "2025-03-12");
      await enter(fun.id, -25, "2025-05-02");

      const payeeId = seed.payees.grocer.id;
      const report = await caller.report.payeeSpending({ budgetId, payeeId, timeframe: "all" });
      expect(report.payee).toBe("Corner Grocer");
      expect(report.series.slice(0, 3)).toEqual([
        { month: "2025-03", spent: 30 },
        { month: "2025-04", spent: 0 },
        { month: "2025-05", spent: 25 },
      ]);
      expect(report.total).toBe(55);

      const byPayee = await caller.report.spendingByPayee({ budgetId, timeframe: "all" });
      expect(byPayee.spending.find((s) => s.payeeId === payeeId)?.spent).toBe(report.total);
    });
  });

  test("refuses another user's budget and a payee from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const budgetId = seed.budgetId;
      await expectTrpcError(
        otherCaller.report.payeeSpending({ budgetId, payeeId: seed.payees.grocer.id, timeframe: "all" }),
        "NOT_FOUND"
      );
      await expectTrpcError(
        caller.report.payeeSpending({ budgetId, payeeId: other.payees.grocer.id, timeframe: "all" }),
        "NOT_FOUND"
      );
    });
  });
});

/**
 * March 2025: income +500 to checking, groceries -40 then +10 on checking,
 * fun -25 on the credit card, all paid to the grocer.
 */
describe("report filters", () => {
  test("narrow every report to the accounts and categories chosen", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;
      const enter = (accountId: number, categoryId: number, amount: number) =>
        caller.transaction.create({
          budgetId,
          accountId,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date: "2025-03-10",
        });

      await addIncome(tx, seed, 500, "2025-03-01");
      await enter(checking, groceries.id, -40);
      await enter(checking, groceries.id, 10);
      await enter(credit, fun.id, -25);
      const all = { budgetId, timeframe: "all" } as const;

      const onCard = await caller.report.spendingByCategory({ ...all, accountIds: [credit] });
      expect(onCard.spending.map((s) => [s.categoryId, s.spent])).toEqual([[fun.id, 25]]);

      const groceriesOnly = await caller.report.spendingByCategory({ ...all, categoryIds: [groceries.id] });
      expect(groceriesOnly.spending.map((s) => [s.categoryId, s.spent])).toEqual([[groceries.id, 30]]);

      const byPayee = await caller.report.spendingByPayee({ ...all, categoryIds: [fun.id] });
      expect(byPayee.total).toBe(25);

      const ive = await caller.report.incomeVsExpense({ ...all, accountIds: [credit] });
      expect(ive.summary).toEqual({ income: 0, expense: 25, net: -25 });
      const iveGroceries = await caller.report.incomeVsExpense({ ...all, categoryIds: [groceries.id] });
      expect(iveGroceries.summary).toEqual({ income: 500, expense: 30, net: 470 });

      const drilled = await caller.report.categorySpending({ ...all, categoryId: groceries.id, accountIds: [credit] });
      expect(drilled.total).toBe(0);
      const payee = await caller.report.payeeSpending({ ...all, payeeId: seed.payees.grocer.id, accountIds: [credit] });
      expect(payee.total).toBe(25);

      const netWorth = await caller.report.netWorth({ ...all, accountIds: [credit] });
      expect(netWorth.summary?.netWorth).toBe(-25);
    });
  });

  test("refuse an account or category from another budget", async () => {
    await withCaller(async ({ seed, caller, other }) => {
      const all = { budgetId: seed.budgetId, timeframe: "all" } as const;
      const foreignAccount = { ...all, accountIds: [seed.accounts.checking.id, other.accounts.checking.id] };
      const foreignCategory = { ...all, categoryIds: [other.categories.groceries.id] };

      await expectTrpcError(caller.report.spendingByCategory(foreignAccount), "NOT_FOUND");
      await expectTrpcError(caller.report.spendingByCategory(foreignCategory), "NOT_FOUND");
      await expectTrpcError(caller.report.spendingByPayee(foreignAccount), "NOT_FOUND");
      await expectTrpcError(caller.report.incomeVsExpense(foreignCategory), "NOT_FOUND");
      await expectTrpcError(caller.report.netWorth(foreignAccount), "NOT_FOUND");
      await expectTrpcError(
        caller.report.categorySpending({ ...foreignAccount, categoryId: seed.categories.groceries.id }),
        "NOT_FOUND"
      );
      await expectTrpcError(
        caller.report.payeeSpending({ ...foreignCategory, payeeId: seed.payees.grocer.id }),
        "NOT_FOUND"
      );
    });
  });
});
