import { describe, expect, test } from "bun:test";
import { expectTrpcError, localDay, withCaller } from "./harness";

/** Months from `first` ("YYYY-MM") up to, not including, this one. */
function completeMonthsSince(first: string): number {
  const [year, month] = first.split("-").map(Number) as [number, number];
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
}

/** "YYYY-MM-15", `back` months before this one. */
function monthsAgo(back: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}

const cents = (n: number) => Math.round(n * 100) / 100;

describe("averageSpending", () => {
  test("averages each category's net spend over the complete months, leaving this month out", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;
      const enter = (accountId: number, categoryId: number, amount: number, date: string) =>
        caller.transaction.create({ budgetId, accountId, payeeId: seed.payees.grocer.id, categoryId, amount, date });

      await enter(checking, groceries.id, -400, "2025-03-10");
      await enter(checking, groceries.id, 100, "2025-03-12");
      await enter(credit, fun.id, -250, "2025-05-02");
      // This month is still running, so it is no part of a typical month.
      await enter(checking, groceries.id, -9999, localDay());

      const months = completeMonthsSince("2025-03");
      const report = await caller.report.averageSpending({ budgetId, timeframe: "all" });
      expect(report.months).toBe(months);
      expect(report.firstMonth).toBe("2025-03");
      expect(report.spending.map((s) => [s.categoryId, s.total])).toEqual([
        [groceries.id, 300],
        [fun.id, 250],
      ]);
      expect(report.spending[0]!.average).toBe(cents(300 / months));
      expect(report.total).toBe(550);
      expect(report.average).toBe(cents(550 / months));

      // A filter narrows what is counted, not how many months it is spread
      // over, so a category reads the same average however it is filtered.
      const funOnly = await caller.report.averageSpending({ budgetId, timeframe: "all", categoryIds: [fun.id] });
      expect(funOnly.months).toBe(months);
      expect(funOnly.spending.map((s) => [s.categoryId, s.average])).toEqual([[fun.id, cents(250 / months)]]);
      const onCard = await caller.report.averageSpending({ budgetId, timeframe: "all", accountIds: [credit] });
      expect(onCard.months).toBe(months);
      expect(onCard.spending.map((s) => s.categoryId)).toEqual([fun.id]);

      // Older than the timeframe, so Last 12 Months is the full twelve.
      const last12 = await caller.report.averageSpending({ budgetId, timeframe: "last12" });
      expect(last12.months).toBe(12);
      expect(last12.firstMonth).toBe(monthsAgo(12).slice(0, 7));
    });
  });

  test("a budget younger than the timeframe is averaged over the months it has", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      await caller.transaction.create({
        budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: -300,
        date: monthsAgo(3),
      });

      for (const timeframe of ["last12", "last4Years", "all"] as const) {
        const report = await caller.report.averageSpending({ budgetId, timeframe });
        expect(report.months).toBe(3);
        expect(report.average).toBe(100);
      }
    });
  });

  test("leaves out refunds that outweigh spending, and tracking accounts", async () => {
    await withCaller(async ({ seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const enter = (accountId: number, categoryId: number, amount: number) =>
        caller.transaction.create({
          budgetId,
          accountId,
          payeeId: seed.payees.grocer.id,
          categoryId,
          amount,
          date: monthsAgo(1),
        });

      await enter(seed.accounts.checking.id, groceries.id, -60);
      await enter(seed.accounts.checking.id, fun.id, 40);
      await enter(seed.accounts.tracking.id, groceries.id, -500);

      const report = await caller.report.averageSpending({ budgetId, timeframe: "all" });
      expect(report.spending.map((s) => [s.categoryId, s.total])).toEqual([[groceries.id, 60]]);
    });
  });

  test("an empty budget has no complete month to average", async () => {
    await withCaller(async ({ caller, seed }) => {
      const report = await caller.report.averageSpending({ budgetId: seed.budgetId, timeframe: "last12" });
      expect(report).toMatchObject({ months: 0, firstMonth: null, spending: [], average: 0 });
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
      await expectTrpcError(
        caller.report.averageSpending({ budgetId, timeframe: "all", categoryIds: [other.categories.fun.id] }),
        "NOT_FOUND"
      );
    });
  });
});
