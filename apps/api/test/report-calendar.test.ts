import { describe, expect, test } from "bun:test";
import { expectTrpcError, withCaller } from "./harness";

/**
 * 2025: groceries -40 then +10 on Mar 10, fun -25 on the card on Mar 10,
 * groceries -60 on Jul 4, a +15 refund alone on Aug 1, and -90 on Dec 31.
 * 2024: groceries -99 on Dec 31, which belongs to the year before.
 */
describe("dailySpending", () => {
  test("nets each day of a year, with the year's totals", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;
      const enter = (accountId: number, categoryId: number, amount: number, date: string) =>
        caller.transaction.create({ budgetId, accountId, payeeId: seed.payees.grocer.id, categoryId, amount, date });

      await enter(checking, groceries.id, -99, "2024-12-31");
      await enter(checking, groceries.id, -40, "2025-03-10");
      await enter(checking, groceries.id, 10, "2025-03-10");
      await enter(credit, fun.id, -25, "2025-03-10");
      await enter(checking, groceries.id, -60, "2025-07-04");
      await enter(checking, groceries.id, 15, "2025-08-01");
      await enter(checking, groceries.id, -90, "2025-12-31");

      const report = await caller.report.dailySpending({ budgetId, year: 2025 });
      expect(report.days).toEqual([
        { date: "2025-03-10", spent: 55 },
        { date: "2025-07-04", spent: 60 },
        { date: "2025-08-01", spent: -15 },
        { date: "2025-12-31", spent: 90 },
      ]);
      expect(report.total).toBe(190);
      expect(report.daysInYear).toBe(365);
      expect(report.spendingDays).toBe(3);
      expect(report.biggest).toEqual({ date: "2025-12-31", spent: 90 });

      const onCard = await caller.report.dailySpending({ budgetId, year: 2025, accountIds: [credit] });
      expect(onCard.days).toEqual([{ date: "2025-03-10", spent: 25 }]);
      const funOnly = await caller.report.dailySpending({ budgetId, year: 2025, categoryIds: [fun.id] });
      expect(funOnly.total).toBe(25);
    });
  });

  test("an empty year has no biggest day", async () => {
    await withCaller(async ({ seed, caller }) => {
      const report = await caller.report.dailySpending({ budgetId: seed.budgetId, year: 2025 });
      expect(report).toMatchObject({ days: [], total: 0, spendingDays: 0, biggest: null });
    });
  });

  test("refuses another user's budget and ids from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const budgetId = seed.budgetId;
      await expectTrpcError(otherCaller.report.dailySpending({ budgetId, year: 2025 }), "NOT_FOUND");
      await expectTrpcError(
        caller.report.dailySpending({ budgetId, year: 2025, categoryIds: [other.categories.fun.id] }),
        "NOT_FOUND"
      );
    });
  });
});
