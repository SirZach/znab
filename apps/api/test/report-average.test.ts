import { describe, expect, test } from "bun:test";
import { expectTrpcError, localDay, withCaller } from "./harness";

/** Months from `first` ("YYYY-MM") up to, not including, this one. */
function completeMonthsSince(first: string): number {
  const [year, month] = first.split("-").map(Number) as [number, number];
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
}

describe("averageSpending", () => {
  test("averages each category's net spend over the complete months, leaving this month out", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const enter = (accountId: number, categoryId: number, amount: number, date: string) =>
        caller.transaction.create({
          budgetId,
          accountId,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date,
        });
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;

      await enter(checking, groceries.id, -400, "2025-03-10");
      await enter(checking, groceries.id, 100, "2025-03-12");
      await enter(credit, fun.id, -250, "2025-05-02");
      // This month is still running, so it is no part of a typical month.
      await enter(checking, groceries.id, -9999, localDay());

      const months = completeMonthsSince("2025-03");
      const report = await caller.report.averageSpending({ budgetId, timeframe: "all" });
      expect(report.months).toBe(months);
      expect(report.spending.map((s) => [s.categoryId, s.total])).toEqual([
        [groceries.id, 300],
        [fun.id, 250],
      ]);
      expect(report.spending[0]!.average).toBe(Math.round((300 / months) * 100) / 100);
      expect(report.total).toBe(550);
      expect(report.average).toBe(Math.round((550 / months) * 100) / 100);

      const onCard = await caller.report.averageSpending({ budgetId, timeframe: "all", accountIds: [credit] });
      expect(onCard.spending.map((s) => s.categoryId)).toEqual([fun.id]);
      const groceriesOnly = await caller.report.averageSpending({
        budgetId,
        timeframe: "all",
        categoryIds: [groceries.id],
      });
      expect(groceriesOnly.total).toBe(300);
    });
  });

  test("Last 12 Months is the twelve complete months before this one", async () => {
    await withCaller(async ({ caller, seed }) => {
      const report = await caller.report.averageSpending({ budgetId: seed.budgetId, timeframe: "last12" });
      expect(report.months).toBe(12);
      expect(report.spending).toEqual([]);
    });
  });

  test("refuses another user's budget and ids from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const budgetId = seed.budgetId;
      await expectTrpcError(otherCaller.report.averageSpending({ budgetId, timeframe: "all" }), "NOT_FOUND");
      await expectTrpcError(
        caller.report.averageSpending({ budgetId, timeframe: "all", accountIds: [other.accounts.checking.id] }),
        "NOT_FOUND"
      );
    });
  });
});
