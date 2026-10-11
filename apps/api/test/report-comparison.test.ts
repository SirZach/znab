import { describe, expect, test } from "bun:test";
import { expectTrpcError, localDay, withCaller } from "./harness";

/**
 * Dec 2024: groceries -30.
 * Feb 2025: groceries -50, fun -25.
 * Mar 2025: groceries -80 then +10, rent -200 on the credit card.
 */
describe("spendingComparison", () => {
  test("a month against the one before, and a year against the one before", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun, rent } = seed.categories;
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;
      const enter = (accountId: number, categoryId: number, amount: number, date: string) =>
        caller.transaction.create({
          budgetId,
          accountId,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date,
        });

      await enter(checking, groceries.id, -30, "2024-12-15");
      await enter(checking, groceries.id, -50, "2025-02-10");
      await enter(checking, fun.id, -25, "2025-02-28");
      await enter(checking, groceries.id, -80, "2025-03-01");
      await enter(checking, groceries.id, 10, "2025-03-31");
      await enter(credit, rent.id, -200, "2025-03-15");

      const march = await caller.report.spendingComparison({ budgetId, period: "month", anchor: "2025-03" });
      expect(march.toDate).toBe(false);
      expect(march.current).toEqual({ start: "2025-03-01", end: "2025-04-01" });
      expect(march.rows.map((r) => [r.categoryId, r.current, r.previous, r.change])).toEqual([
        [rent.id, 200, 0, 200],
        [groceries.id, 70, 50, 20],
        [fun.id, 0, 25, -25],
      ]);
      expect(march.totals).toEqual({ current: 270, previous: 75, change: 195 });

      const onCard = await caller.report.spendingComparison({
        budgetId,
        period: "month",
        anchor: "2025-03",
        accountIds: [credit],
      });
      expect(onCard.rows.map((r) => r.categoryId)).toEqual([rent.id]);
      const groceriesOnly = await caller.report.spendingComparison({
        budgetId,
        period: "month",
        anchor: "2025-03",
        categoryIds: [groceries.id],
      });
      expect(groceriesOnly.totals).toEqual({ current: 70, previous: 50, change: 20 });

      const year = await caller.report.spendingComparison({ budgetId, period: "year", anchor: "2025" });
      expect(year.rows.map((r) => [r.categoryId, r.current, r.previous])).toEqual([
        [rent.id, 200, 0],
        [groceries.id, 120, 30],
        [fun.id, 25, 0],
      ]);
    });
  });

  test("this month is compared to date, leaving out the rest of last month", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const groceries = seed.categories.groceries.id;
      const today = localDay();
      const thisMonth = today.slice(0, 7);
      const lastMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1);
      const last = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      const enter = (amount: number, date: string) =>
        caller.transaction.create({
          budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: seed.payees.grocer.id,
          categoryId: groceries,
          amount,
          date,
        });

      await enter(-30, `${thisMonth}-01`);
      await enter(-20, `${last}-01`);
      // Past today's day of the month, so outside last month's to-date range,
      // unless today is late enough in the month that no such day remains.
      const lateDay = Number(today.slice(8, 10)) < 28;
      if (lateDay) await enter(-500, `${last}-28`);

      const report = await caller.report.spendingComparison({ budgetId, period: "month" });
      expect(report.anchor).toBe(thisMonth);
      expect(report.totals).toEqual({ current: 30, previous: 20, change: 10 });
      if (lateDay) expect(report.toDate).toBe(true);
    });
  });

  test("a period that has not begun is read as this one", async () => {
    await withCaller(async ({ seed, caller }) => {
      const report = await caller.report.spendingComparison({
        budgetId: seed.budgetId,
        period: "month",
        anchor: "2099-01",
      });
      expect(report.anchor).toBe(localDay().slice(0, 7));
    });
  });

  test("refuses an anchor of the wrong shape, another user's budget and ids from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const budgetId = seed.budgetId;
      await expectTrpcError(
        caller.report.spendingComparison({ budgetId, period: "year", anchor: "2025-03" }),
        "BAD_REQUEST"
      );
      await expectTrpcError(otherCaller.report.spendingComparison({ budgetId, period: "month" }), "NOT_FOUND");
      await expectTrpcError(
        caller.report.spendingComparison({ budgetId, period: "month", categoryIds: [other.categories.fun.id] }),
        "NOT_FOUND"
      );
    });
  });
});
